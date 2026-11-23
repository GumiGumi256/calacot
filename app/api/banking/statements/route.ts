import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { financeMutation } from "@/lib/finance/context";
import { storePrivateObject } from "@/lib/sales/storage";
import { expiringAdminData } from "@/lib/cache-tags";
import { fromMinor, duplicateCandidates, toMinor } from "@/lib/accounting/bank-reconciliation";
import { guessMapping, mapStatementRows, STATEMENT_MAX_BYTES, statementFormats, type StatementMapping } from "@/lib/accounting/statement-csv";

/*
 * Phase 2C statement import. POST multipart/form-data:
 *   file, bankingAccountId, mode = "preview" | "import", key (uuid), mapping (JSON column indexes, optional for preview)
 * Preview parses and validates the untrusted file and reports possible duplicates; it writes nothing.
 * Import stores the original file in private storage, then records every row in ONE database
 * transaction (bank_statement_import). Importing never creates a journal. Same file or same key is
 * idempotent. Authorization: banking_import, re-verified live with Clerk; same-origin only.
 */

const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const columns = ["date", "description", "debit", "credit", "amount", "reference", "currency", "balance"] as const;
const mappingSchema = z.object(Object.fromEntries(columns.map((c) => [c, z.number().int().min(0).max(99).optional()]))).strict();

async function handlePOST(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > STATEMENT_MAX_BYTES + 64 * 1024) return reply(413, { ok: false, message: "Statements must be 2 MB or smaller." });
  let form: FormData;
  try { form = await request.formData(); } catch { return reply(400, { ok: false, message: "The upload could not be read." }); }
  const file = form.get("file");
  const mode = form.get("mode");
  const accountId = String(form.get("bankingAccountId") || "");
  const key = String(form.get("key") || "");
  if (!(file instanceof File) || (mode !== "preview" && mode !== "import") || !z.uuid().safeParse(accountId).success || !z.uuid().safeParse(key).success)
    return reply(400, { ok: false, message: "Choose the account and a statement file." });
  if (file.size <= 0 || file.size > STATEMENT_MAX_BYTES) return reply(413, { ok: false, message: "Statements must be between 1 byte and 2 MB." });
  const format = statementFormats.csv;
  if (!format.extensions.some((ext) => file.name.toLowerCase().endsWith(ext))) return reply(400, { ok: false, message: "Upload a CSV statement (.csv). Convert other formats to CSV first." });
  let mapping: StatementMapping | null = null;
  const rawMapping = form.get("mapping");
  if (typeof rawMapping === "string" && rawMapping) {
    try { mapping = mappingSchema.parse(JSON.parse(rawMapping)) as StatementMapping; } catch { return reply(400, { ok: false, message: "Check the column mapping." }); }
  }
  if (mode === "import" && !mapping) return reply(400, { ok: false, message: "Confirm the column mapping before importing." });

  let extra: Record<string, unknown> = {};
  let result: Awaited<ReturnType<typeof financeMutation>>;
  // Signed-out, revoked or unauthorized callers get a plain 404, like the other finance upload routes.
  try { result = await financeMutation("banking_import", async (ctx, correlation) => {
    const org = ctx.organizationId;
    const account = (await db.execute<{ id: string; currency: string; kind: string; label: string; mapped: boolean }>(sql`SELECT id,currency,kind,label,banking_ledger(organization_id,id) IS NOT NULL AS mapped FROM banking_accounts WHERE organization_id=${org} AND id=${accountId}::uuid AND status='active'`)).rows[0];
    if (!account) return { ok: false, message: "This account is unavailable or inactive." };
    if (account.kind !== "bank" && account.kind !== "mobile_money") return { ok: false, message: "Statements can only be imported for bank and mobile-money accounts." };
    if (!account.mapped) return { ok: false, message: "This account has no approved ledger account yet. Have its mapping approved before importing." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    let rows: string[][];
    try { rows = format.parse(bytes); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "The statement could not be read." }; }
    const header = rows[0];
    const already = (await db.execute<{ id: string; created_at: string }>(sql`SELECT id,created_at::text FROM bank_statement_imports WHERE organization_id=${org} AND banking_account_id=${account.id}::uuid AND file_sha256=${sha256}`)).rows[0];
    const useMapping = mapping ?? guessMapping(header);
    let mapped: ReturnType<typeof mapStatementRows>;
    try { mapped = mapStatementRows(rows, useMapping, account.currency); } catch (e) {
      extra = { header, mapping: useMapping, sample: rows.slice(1, 6), rowCount: rows.length - 1 };
      return { ok: false, message: e instanceof Error ? e.message : "Some rows are invalid." };
    }
    if (mode === "preview") {
      const first = mapped.reduce((m, r) => (r.date < m ? r.date : m), mapped[0].date), last = mapped.reduce((m, r) => (r.date > m ? r.date : m), mapped[0].date);
      const existing = (await db.execute<{ id: string; txn_date: string; amount: string; description: string; reference: string | null }>(sql`SELECT id,txn_date::text,amount::text,description,reference FROM bank_statement_lines
        WHERE organization_id=${org} AND banking_account_id=${account.id}::uuid AND review_status IN ('active','needs_review') AND txn_date BETWEEN ${first}::date AND ${last}::date LIMIT 20000`)).rows;
      const candidates = duplicateCandidates(
        mapped.map((r) => ({ id: String(r.sourceRow), accountId: account.id, currency: account.currency, date: r.date, amount: r.amountMinor, reference: r.reference, description: r.description })),
        existing.map((x) => ({ id: x.id, accountId: account.id, currency: account.currency, date: x.txn_date, amount: toMinor(x.amount), reference: x.reference, description: x.description })));
      const locked = (await db.execute<{ d: string | null }>(sql`SELECT banking_locked_until(${org},${account.id}::uuid)::text AS d`)).rows[0]?.d ?? null;
      const inflow = mapped.filter((r) => r.amountMinor > BigInt(0)).reduce((s, r) => s + r.amountMinor, BigInt(0));
      const outflow = mapped.filter((r) => r.amountMinor < BigInt(0)).reduce((s, r) => s - r.amountMinor, BigInt(0));
      extra = {
        header, mapping: useMapping, rowCount: mapped.length, firstDate: first, lastDate: last, currency: account.currency, account: account.label,
        inflow: fromMinor(inflow), outflow: fromMinor(outflow), alreadyImported: already ? already.created_at : null, lockedUntil: locked,
        inFinalizedPeriod: locked ? mapped.filter((r) => r.date <= locked).length : 0,
        possibleDuplicates: new Set(candidates.map((c) => c.incomingId)).size,
        rows: mapped.slice(0, 50).map((r) => ({ row: r.sourceRow, date: r.date, description: r.description, reference: r.reference, amount: fromMinor(r.amountMinor), balance: r.balanceMinor === null ? null : fromMinor(r.balanceMinor), duplicate: candidates.some((c) => c.incomingId === String(r.sourceRow)) })),
      };
      return { ok: true, message: "Preview ready. Nothing has been imported yet." };
    }
    // Keep the original file (private, content-addressed) before recording its rows.
    const prefix = createHash("sha256").update(org).digest("hex").slice(0, 24);
    const storageKey = `banking/statements/${prefix}/${account.id}/${sha256}.csv`;
    await storePrivateObject(storageKey, Buffer.from(bytes), "text/csv", STATEMENT_MAX_BYTES);
    const payload = {
      key, bankingAccountId: account.id, currency: account.currency, fileName: file.name.replace(/[^\w .()-]/g, "_").slice(0, 200) || "statement.csv", fileSha256: sha256, fileSize: bytes.length,
      storageKey, sourceFormat: "csv", columnMapping: useMapping,
      rows: mapped.map((r) => ({ row: r.sourceRow, date: r.date, description: r.description, reference: r.reference, amount: fromMinor(r.amountMinor), balance: r.balanceMinor === null ? "" : fromMinor(r.balanceMinor) })),
    };
    const r = (await db.execute<{ result: Record<string, unknown> }>(sql`SELECT bank_statement_import(${org},${ctx.actor},${JSON.stringify(payload)}::jsonb,${correlation}) AS result`)).rows[0].result;
    extra = { importId: r.id, imported: r.imported, duplicates: r.duplicates, review: r.review, accountId: account.id };
    if (r.sameFile) return { ok: true, id: String(r.id), message: "This exact file was already imported for this account. Nothing new was added." };
    return { ok: true, id: String(r.id), message: `Imported ${r.imported} new transaction${r.imported === 1 ? "" : "s"}${Number(r.duplicates) ? `, skipped ${r.duplicates} already imported` : ""}${Number(r.review) ? `, ${r.review} need review as possible duplicates` : ""}. No journals were created.` };
  }); } catch { return reply(404, { ok: false, message: "Not found" }); }
  return reply(result.ok ? 200 : 422, { ...result, ...extra });
}

export const POST = expiringAdminData(handlePOST);
