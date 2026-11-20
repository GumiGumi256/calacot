"use server";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { clientSchema, quoteSchema } from "./contracts";
import { staffContext } from "./permissions";
import { salesConfig } from "./config";
import { totals } from "./money";
import { AGREED_ON_APPROVAL } from "./stages";
import { parseQuotationImport, type ImportQuote } from "./quote-import";

/*
 * Quotation import (server). Every quotation is imported in its own database transaction:
 * client (matched or created), contact, planned project and quotation draft all commit together
 * or not at all. Uses the same SQL functions as the builder, so audit, numbering and validation
 * rules are identical. The neon-http driver has no interactive transactions, hence the Pool.
 */

export type ImportClientMatch = { ref: string; status: "existing" | "new" | "ambiguous"; clientName?: string };
export type ImportResult = { ref: string; ok: true; quotationId: string; clientCreated: boolean } | { ref: string; ok: false; error: string };

const friendly: Record<string, string> = {
  client_review_required: "An existing client looks similar (same name, email or phone). Add this quotation by hand to pick the right client.",
  client_matches_changed: "Client records changed during the import. Run the import again.",
  client_department_required: "The division is not valid.",
  eligible_project_required: "The planned project could not be prepared.",
  delivery_contact_required: "The client needs a contact with an email address.",
  quotation_expired: "The valid-until date has passed.",
  schedule_total_mismatch: "Payment stages don't match the total.",
};

async function context() {
  const ctx = await staffContext("quotations_create");
  for (const p of ["clients_write", "projects_write"] as const)
    if (!ctx.permissions.includes(p)) throw new Error("Importing needs permission to create clients and projects.");
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") || h.get("host");
  if (origin && new URL(origin).host !== host) throw new Error("Request origin is not permitted.");
  return ctx;
}

function clientPayload(q: ImportQuote) {
  // clientSchema normalises the phone (or rejects it) exactly as the client form does.
  const parsed = clientSchema.safeParse({
    kind: q.client.kind,
    displayName: q.client.name,
    legalName: q.client.kind === "company" ? q.client.name : "",
    tradingName: "",
    department: q.division,
    taxIdentifier: "",
    billingAddress: { line1: "", city: "", country: "Uganda" },
    contacts: [{ name: q.client.name, email: q.client.email, phone: q.client.phone, isPrimary: true }],
  });
  if (!parsed.success) throw new Error(`Client details: ${parsed.error.issues[0]?.message ?? "invalid"}.`);
  return parsed.data;
}

async function matchClient(db: Pool | PoolClient, org: string, q: ImportQuote) {
  const p = clientPayload(q);
  const r = await db.query<{ id: string; name: string }>(
    "SELECT id, display_name AS name FROM clients WHERE organization_id=$1 AND archived_at IS NULL AND id = ANY(client_possible_matches($1, $2::jsonb)) ORDER BY id LIMIT 3",
    [org, JSON.stringify(p)],
  );
  return { payload: p, matches: r.rows };
}

/** Which clients each quotation would use. Read-only. */
export async function previewQuotationImport(text: string): Promise<{ ok: true; matches: ImportClientMatch[] } | { ok: false; error: string }> {
  try {
    const ctx = await context();
    const { quotes } = parseQuotationImport(String(text), salesConfig().taxRate);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const matches: ImportClientMatch[] = [];
      for (const q of quotes) {
        if (q.problems.length) continue;
        try {
          const { matches: found } = await matchClient(pool, ctx.organizationId, q);
          matches.push(found.length === 0 ? { ref: q.ref, status: "new" } : found.length === 1 ? { ref: q.ref, status: "existing", clientName: found[0].name } : { ref: q.ref, status: "ambiguous" });
        } catch (e) {
          matches.push({ ref: q.ref, status: "ambiguous", clientName: e instanceof Error ? e.message : undefined });
        }
      }
      return { ok: true, matches };
    } finally {
      await pool.end();
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The preview could not be prepared." };
  }
}

/** Imports every valid quotation in the file as a draft. Returns one result per quotation. */
export async function runQuotationImport(text: string): Promise<{ ok: true; results: ImportResult[] } | { ok: false; error: string }> {
  let ctx: Awaited<ReturnType<typeof context>>;
  try {
    ctx = await context();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not permitted." };
  }
  const config = salesConfig();
  const { quotes, fileErrors } = parseQuotationImport(String(text), config.taxRate);
  if (fileErrors.length && !quotes.length) return { ok: false, error: fileErrors[0] };
  const org = ctx.organizationId;
  const actor = ctx.actor;
  const batch = randomUUID();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const results: ImportResult[] = [];
  try {
    for (const q of quotes) {
      if (q.problems.length) { results.push({ ref: q.ref, ok: false, error: q.problems[0] }); continue; }
      const correlation = `${batch}:${q.ref}`.slice(0, 200);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Same per-organization lock sales_client takes, so matching and creating can't race.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('calacot-client-create:' || $1, 0))", [org]);
        const { payload, matches } = await matchClient(client, org, q);
        if (matches.length > 1) throw new Error("client_review_required");
        let clientId = matches[0]?.id;
        const clientCreated = !clientId;
        if (!clientId) {
          const r = await client.query<{ id: string }>("SELECT sales_client($1,$2,$3::jsonb,$4) AS id", [org, actor, JSON.stringify({ ...payload, reviewedClientIds: [], confirmDistinct: false }), correlation]);
          clientId = r.rows[0].id;
        }
        // The quotation is emailed to the row's address: reuse that contact or add it to the client.
        let contact = await client.query<{ id: string }>(
          "SELECT id FROM client_contacts WHERE organization_id=$1 AND client_id=$2 AND lower(email)=lower($3) ORDER BY is_primary DESC LIMIT 1",
          [org, clientId, q.client.email],
        );
        if (!contact.rows[0]) {
          contact = await client.query<{ id: string }>(
            "INSERT INTO client_contacts(organization_id,client_id,name,email,is_primary) VALUES($1,$2,$3,$4,false) RETURNING id",
            [org, clientId, q.client.name, q.client.email],
          );
        }
        const project = await client.query<{ id: string }>("SELECT sales_project($1,$2,$3::jsonb,$4) AS id", [
          org, actor,
          JSON.stringify({ clientId, name: q.title, division: q.division, currency: q.currency, scope: q.scope, managerId: "", startsOn: "", dueOn: "" }),
          correlation,
        ]);
        const value = quoteSchema.parse({
          revision: 0,
          clientId,
          projectId: project.rows[0].id,
          contactId: contact.rows[0].id,
          title: q.title,
          division: q.division,
          currency: q.currency,
          scope: q.scope,
          deliverables: [],
          exclusions: [],
          terms: q.terms,
          validUntil: q.validUntil,
          items: q.items.map((i) => ({ ...i, catalogueItemId: "", name: "", itemType: "" })),
          // Imported quotations carry no payment schedule: terms are agreed on approval.
          schedules: [{ label: AGREED_ON_APPROVAL, amount: q.total, dueAt: "" }],
        });
        const calculated = totals(value.items, config.taxRate);
        const saved = await client.query<{ id: string }>("SELECT sales_quote_save($1,$2,$3::jsonb,$4) AS id", [
          org, actor, JSON.stringify({ ...value, ...calculated, allowPriceOverride: false }), correlation,
        ]);
        await client.query("COMMIT");
        results.push({ ref: q.ref, ok: true, quotationId: saved.rows[0].id, clientCreated });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        const text = e instanceof Error ? e.message : String(e);
        const code = Object.keys(friendly).find((k) => text.includes(k));
        console.error("quotation_import_failed", { batch, ref: q.ref, code: code || "other", detail: text.split("\n")[0] });
        results.push({ ref: q.ref, ok: false, error: code ? friendly[code] : text.startsWith("Client details") ? text : "This quotation could not be imported. Nothing was saved for it." });
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
  for (const route of ["clients", "projects", "quotations"]) revalidatePath(`/admin/${route}`, "layout");
  return { ok: true, results };
}
