"use server";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { paymentInstructions } from "@/lib/company";
import {
  clientSchema,
  projectSchema,
  quoteSchema,
  commandSchema,
} from "./contracts";
import { staffContext, type Permission } from "./permissions";
import { salesConfig } from "./config";
import { totals, scaled } from "./money";
import { pickers } from "./reads";
import { headers } from "next/headers";
const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
const messages: Record<string, string> = {
  organization_setup_required: "Your Clerk organization has no company record in the database. Restore the organization setup before creating clients.",
  staging_recipient_not_allowed:"This recipient is outside the staging send allowlist.",
  deposit_tax_policy_required:"Deposit billing for taxable quotations needs an approved allocation policy. Use full billing or obtain finance configuration approval.",
  draft_conflict: "This draft changed or was finalized. Refresh before saving.",
  eligible_project_required:
    "Select a planned, unarchived project belonging to this client with the same division and currency.",
  quotation_expired: "This quotation has expired. Create a revision.",
  quotation_not_confirmable:
    "This exact quotation version cannot be confirmed.",
  acceptance_evidence_required:
    "Record verified acceptance with source, identity, time and evidence.",
  schedule_total_mismatch: "Payment schedule must equal the quotation total.",
  allocated_invoice_requires_credit_process:
    "This invoice has financial allocations. Use a reviewed credit/refund process.",
  staff_mirror_required_for_ledger:
    "Sync your staff membership before verifying ledger payments.",
  allocation_exceeds_balance: "Allocation exceeds the invoice balance.",
  allocation_exceeds_funds: "Allocation exceeds available payment funds.",
  credit_requires_unallocated_balance:
    "Credit amount exceeds the unallocated balance, or this invoice requires a refund process.",
};
async function mutation<T>(
  permission: Permission,
  fn: (
    ctx: Awaited<ReturnType<typeof staffContext>>,
    correlation: string,
  ) => Promise<T>,
) {
  const ctx = await staffContext(permission);
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") || h.get("host");
  if (origin && new URL(origin).host !== host)
    return { ok: false as const, error: "Request origin is not permitted." };
  const correlation = randomUUID();
  try {
    const key = `${ctx.organizationId}/${ctx.actor}/${permission}`;
    const rate = await db.execute<{ count: number }>(
      sql`INSERT INTO sales_rate_limits(key,count,expires_at) VALUES(${key},1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN sales_rate_limits.expires_at<now() THEN 1 ELSE sales_rate_limits.count+1 END,expires_at=CASE WHEN sales_rate_limits.expires_at<now() THEN now()+interval '1 minute' ELSE sales_rate_limits.expires_at END RETURNING count`,
    );
    if (rate.rows[0].count > 30)
      return {
        ok: false as const,
        error: "Too many changes. Wait a minute and try again.",
      };
    const value = await fn(ctx, correlation);
    for (const route of [
      "clients",
      "projects",
      "quotations",
      "invoices",
      "deliveries",
    ])
      revalidatePath(`/admin/${route}`, "layout");
    return { ok: true as const, value };
  } catch (e) {
    if (e instanceof z.ZodError)
      return {
        ok: false as const,
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .slice(0, 4)
          .join("; "),
      };
    const code =
      e instanceof Error
        ? Object.keys(messages).find((k) => e.message.includes(k))
        : undefined;
    console.error("sales_mutation_failed", {
      correlation,
      permission,
      code: code || "validation_or_database",
    });
    return {
      ok: false as const,
      error: code
        ? messages[code]
        : "Change could not be completed. Check the fields and organization setup, then refresh.",
    };
  }
}
export async function saveClient(input: unknown) {
  return mutation("clients_write", async (ctx, c) => {
    const p = clientSchema.parse(input);
    const organization = await db.execute(sql`SELECT id FROM organizations WHERE id=${ctx.organizationId}`);
    if (!organization.rows.length) throw new Error("organization_setup_required");
    const r = await db.execute<{ id: string }>(
      sql`SELECT sales_client(${ctx.organizationId},${ctx.actor},${json(p)},${c}) AS id`,
    );
    return r.rows[0].id;
  });
}
export async function saveProject(input: unknown) {
  return mutation("projects_write", async (ctx, c) => {
    const p = projectSchema.parse(input);
    const r = await db.execute<{ id: string }>(
      sql`SELECT sales_project(${ctx.organizationId},${ctx.actor},${json(p)},${c}) AS id`,
    );
    return r.rows[0].id;
  });
}
export async function saveQuote(input: unknown) {
  const p = quoteSchema.safeParse(input);
  if (!p.success)
    return {
      ok: false as const,
      error: p.error.issues
        .map((i) => i.message)
        .slice(0, 3)
        .join("; "),
    };
  return mutation(
    p.data.id ? "quotations_edit" : "quotations_create",
    async (ctx, c) => {
      const config = salesConfig();
      const value = p.data;
      if (new Date(value.validUntil) <= new Date())
        throw new Error("quotation_expired");
      const calculated = totals(value.items, config.taxRate);
      if (
        value.schedules.reduce((s, v) => s + scaled(v.amount), BigInt(0)) !==
        scaled(calculated.total)
      )
        throw new Error("schedule_total_mismatch");
      const r = await db.execute<{ id: string }>(
        sql`SELECT sales_quote_save(${ctx.organizationId},${ctx.actor},${json({ ...value, ...calculated })},${c}) AS id`,
      );
      return r.rows[0].id;
    },
  );
}
export async function quotationCommand(input: unknown) {
  const p = commandSchema.parse(input);
  const permission =
    p.command === "confirm"
      ? "quotations_confirm"
      : p.command === "send"
        ? "quotations_send"
        : "quotations_edit";
  return mutation(permission, async (ctx, c) => {
    if (
      !["send", "confirm", "decline", "revise"].includes(p.command) ||
      !p.versionId
    )
      throw new Error("Invalid command");
    const cfg = salesConfig();
    if (
      ["send", "confirm"].includes(p.command) &&
      cfg.mode !== "capture" &&
      (!process.env.RESEND_API_KEY || !z.email().safeParse(cfg.from).success)
    )
      throw new Error("Sender configuration missing");
    if (p.command === "send") {
      const selected=await db.execute<{email:string}>(sql`SELECT cc.email FROM quotation_versions v JOIN quotations q ON q.id=v.quotation_id AND q.organization_id=v.organization_id JOIN client_contacts cc ON cc.id=v.delivery_contact_id AND cc.organization_id=q.organization_id AND cc.client_id=q.client_id WHERE q.organization_id=${ctx.organizationId} AND q.id=${p.id}::uuid AND v.id=${p.versionId}::uuid`);
      z.email().parse(selected.rows[0]?.email);
      if(cfg.mode==="staging"&&!cfg.allowlist.includes(selected.rows[0].email.toLowerCase()))throw new Error("staging_recipient_not_allowed");
    }
    if (
      p.command === "confirm" &&
      (!p.acceptedAt ||
        !p.evidence?.trim() ||
        !p.source ||
        !p.acceptedBy?.trim())
    )
      throw new Error("acceptance_evidence_required");
    const logo = await readFile(`${process.cwd()}/public/calacot-logo.png`);
    const approved = paymentInstructions();
    const instructions = [
      approved.bank
        ? `Bank: ${approved.bank.name}; account ${approved.bank.number}; ${approved.bank.account}; ${approved.bank.currency}${approved.bank.swift ? `; SWIFT ${approved.bank.swift}` : ""}`
        : "",
      approved.mobile
        ? `Mobile money: ${approved.mobile.network}; ${approved.mobile.number}; ${approved.mobile.account}; ${approved.mobile.currency}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    const config = {
      ...cfg,
      instructions,
      brand: {
        template: "calacot-commercial-v1",
        logo: "calacot-logo.png",
        logoSha256: createHash("sha256").update(logo).digest("hex"),
        logoBase64: logo.toString("base64"),
      },
    };
    const r = await db.execute<{ result: { id: string; invoiceId?: string } }>(
      sql`SELECT sales_quote_command(${ctx.organizationId},${ctx.actor},${p.id}::uuid,${p.versionId}::uuid,${p.revision ?? null},${p.command},${json(p)},${json(config)},${c}) AS result`,
    );
    return r.rows[0].result;
  });
}
export async function invoiceCommand(input: unknown) {
  return mutation("invoices_void", async (ctx, c) => {
    const p = commandSchema.parse(input);
    if (!["void", "credit"].includes(p.command))
      throw new Error("Invalid command");
    if (p.amount) scaled(p.amount);
    const r = await db.execute(
      sql`SELECT sales_invoice_command(${ctx.organizationId},${ctx.actor},${p.id}::uuid,${p.command},${json(p)},${c}) AS result`,
    );
    return r.rows[0];
  });
}
export async function archiveClient(id: string) {
  return mutation("clients_write", async (ctx, c) => {
    z.uuid().parse(id);
    const r = await db.execute(
      sql`WITH changed AS (UPDATE clients SET archived_at=now(),updated_at=now() WHERE id=${id}::uuid AND organization_id=${ctx.organizationId} AND archived_at IS NULL RETURNING id), audit AS (INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) SELECT ${ctx.organizationId},${ctx.actor},'staff','client.archive','client',id::text,'{"archived":true}'::jsonb,${c} FROM changed) SELECT id FROM changed`,
    );
    return r.rows;
  });
}
export async function deliveryCommand(input: unknown) {
  return mutation("notifications_manage", async (ctx, c) => {
    const p = commandSchema.parse(input);
    if (!["retry", "resend"].includes(p.command))
      throw new Error("Invalid command");
    const r = await db.execute<{ result: string }>(
      sql`SELECT sales_delivery_command(${ctx.organizationId},${ctx.actor},${p.id}::uuid,${p.command},${json(p)},${c}) AS result`,
    );
    return r.rows[0].result;
  });
}
export async function paymentCommand(input: unknown) {
  return mutation("payments_verify", async (ctx, c) => {
    const p = z
      .object({
        command: z.enum(["submit", "verify"]),
        invoiceId: z.uuid(),
        paymentId: z.uuid().optional(),
        amount: z.string().regex(/^\d{1,15}(\.\d{1,2})?$/),
        method: z.enum(["mobile_money", "bank_transfer", "cash", "other"]),
        reference: z.string().trim().min(1).max(200),
        receivedAt: z.iso.datetime(),
        key: z.uuid(),
        evidence: z.string().trim().max(2000),
      })
      .parse(input);
    scaled(p.amount);
    if (p.command === "verify" && !p.paymentId)
      throw new Error("Select a payment");
    const r = await db.execute<{ id: string }>(
      sql`SELECT sales_payment(${ctx.organizationId},${ctx.actor},${json(p)},${c}) AS id`,
    );
    return r.rows[0].id;
  });
}
export async function getPickers(clientId?: string, search = "") {
  return pickers(clientId, search.slice(0, 200));
}
export async function startProject(id: string, evidence: string) {
  return mutation("projects_write", async (ctx, c) => {
    z.uuid().parse(id);
    z.string().trim().min(10).max(2000).parse(evidence);
    const r = await db.execute(
      sql`WITH changed AS(UPDATE projects SET status='active',updated_at=now() WHERE id=${id}::uuid AND organization_id=${ctx.organizationId} AND status='planned' AND quotation_version_id IS NOT NULL AND archived_at IS NULL RETURNING id),audit AS(INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) SELECT ${ctx.organizationId},${ctx.actor},'staff','project.start','project',id::text,${JSON.stringify({ before: "planned", after: "active", evidence })}::jsonb,${c} FROM changed) SELECT id FROM changed`,
    );
    if (!r.rows.length) throw new Error("Project unavailable");
    return id;
  });
}
export async function duplicateClients(
  name: string,
  email: string,
  phone: string,
) {
  const ctx = await staffContext("clients_read");
  return (
    await db.execute<{ id: string; name: string }>(
      sql`SELECT c.id,c.display_name AS name FROM clients c WHERE c.organization_id=${ctx.organizationId} AND (lower(c.display_name)=lower(${name.slice(0, 200)}) OR EXISTS(SELECT 1 FROM client_contacts cc WHERE cc.client_id=c.id AND cc.organization_id=c.organization_id AND ((nullif(${email.slice(0, 254)},'') IS NOT NULL AND cc.email=lower(${email.slice(0, 254)})) OR (nullif(${phone.slice(0, 30)},'') IS NOT NULL AND cc.phone=${phone.slice(0, 30)})))) LIMIT 5`,
    )
  ).rows;
}
