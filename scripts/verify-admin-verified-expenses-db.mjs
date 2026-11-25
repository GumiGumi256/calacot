// Administrator-verified expenses, agreed team pay and project figures (migration 0027) against a
// disposable, fully migrated PGlite schema. No environment variables, no network, no real database.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const pg = new PGlite();
const P = "00000000-0000-4000-8000-000000000002";
const ADMIN = "00000000-0000-4000-8000-000000000003", OTHER = "00000000-0000-4000-8000-000000000004";
const JOHN = "00000000-0000-4000-8000-0000000000a1", PETER = "00000000-0000-4000-8000-0000000000a2";
let n = 0;
const key = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const fails = async (q, params, code) => {
  await assert.rejects(pg.query(q, params), (e) => { assert.match(String(e.message), new RegExp(code)); return true; });
};
const record = (actor, p) => pg.query("SELECT expense_record_verified('a',$1,$2::jsonb,'corr') AS r", [actor, JSON.stringify(p)]).then((r) => r.rows[0].r);
const row = (id) => pg.query("SELECT status,entry_mode,version,requested_by_id::text req,approved_by_id::text appr FROM expenses WHERE id=$1", [id]).then((r) => r.rows[0]);
const base = { division: "painting", projectId: P, category: "Labour", description: "Painters week 1", purpose: "Wages for painting crew", currency: "UGX", taxAmount: "", incurredOn: "2026-01-05", supplierInvoiceReference: "", payees: [] };
const cash = { method: "cash", reference: "", sourceAccountId: "", paidOn: "2026-01-06", responsibleStaffId: ADMIN, evidenceDocumentId: "", notes: "" };
try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) for (const s of (await readFile(`drizzle-current/${entry.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A');
    INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES('00000000-0000-4000-8000-000000000001','a','individual','Client','painting');
    INSERT INTO projects(id,organization_id,client_id,code,name,division,currency,budget) VALUES('${P}','a','00000000-0000-4000-8000-000000000001','P1','Repaint','painting','UGX',5000000);
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,status) VALUES('${ADMIN}','a','admin','active'),('${OTHER}','a','other','active');
    INSERT INTO project_members(id,organization_id,project_id,external_name,responsibility,agreed_amount) VALUES('${JOHN}','a','${P}','John','Painter',1500000),('${PETER}','a','${P}','Peter','Painter',NULL);`);

  // One tap, not yet paid: approved immediately by the administrator who recorded it.
  const a = await record("admin", { ...base, key: key(), netAmount: "300000" });
  assert.equal(a.status, "approved");
  assert.deepEqual(await row(a.id), { status: "approved", entry_mode: "admin_verified", version: 3, req: ADMIN, appr: ADMIN });
  assert.deepEqual((await pg.query("SELECT action FROM expense_events WHERE expense_id=$1 ORDER BY created_at,action", [a.id])).rows.map((r) => r.action).sort(), ["admin_verified", "created"]);
  assert.equal((await pg.query("SELECT count(*)::int n FROM audit_logs WHERE entity_id=$1 AND action='expense.admin_verified' AND actor_clerk_user_id='admin'", [a.id])).rows[0].n, 1, "audit log names the administrator");
  // The administrator may then record the payment of their own verified expense.
  const paidLater = await pg.query("SELECT expense_disburse('a','admin',$1::jsonb,'c') AS r", [JSON.stringify({ ...cash, expenseId: a.id, version: 3, key: key(), amount: "300000", currency: "UGX" })]);
  assert.equal(paidLater.rows[0].r.status, "paid");

  // One tap with payment and a per-person breakdown: approved and paid in one transaction.
  const k = key();
  const b = await record("admin", { ...base, key: k, description: "Painters week 2", netAmount: "900000", payees: [{ memberId: JOHN, amount: "600000" }, { memberId: PETER, amount: "300000" }], payment: cash });
  assert.equal(b.status, "paid");
  assert.equal((await pg.query("SELECT recorded_by_id::text r, amount::text a FROM expense_disbursements WHERE expense_id=$1", [b.id])).rows[0].a, "900000.00");
  // Replaying the same key creates nothing new.
  const replay = await record("admin", { ...base, key: k, description: "Painters week 2", netAmount: "900000", payees: [{ memberId: JOHN, amount: "600000" }, { memberId: PETER, amount: "300000" }], payment: cash });
  assert.equal(replay.already, true);
  assert.equal((await pg.query("SELECT count(*)::int n FROM expense_disbursements WHERE expense_id=$1", [b.id])).rows[0].n, 1);

  // Failures roll back everything: a breakdown that does not add up, or a payment that needs an account.
  const before = (await pg.query("SELECT count(*)::int n FROM expenses")).rows[0].n;
  await fails("SELECT expense_record_verified('a','admin',$1::jsonb,'c')", [JSON.stringify({ ...base, key: key(), netAmount: "900000", payees: [{ memberId: JOHN, amount: "1" }] })], "payees_total_mismatch");
  await fails("SELECT expense_record_verified('a','admin',$1::jsonb,'c')", [JSON.stringify({ ...base, key: key(), netAmount: "100", payment: { ...cash, method: "bank_transfer", reference: "TX1" } })], "source_account_required");
  assert.equal((await pg.query("SELECT count(*)::int n FROM expenses")).rows[0].n, before, "failed one-tap entries leave nothing behind");

  // The ordinary request workflow keeps its segregation of duties.
  const req = await pg.query("SELECT expense_save_with_payees('a','other',$1::jsonb,'c') AS r", [JSON.stringify({ ...base, key: key(), netAmount: "50000" })]).then((r) => r.rows[0].r);
  await pg.query("SELECT expense_command('a','other',$1::uuid,'submit',1,'',$2,'c')", [req.id, key()]);
  await fails("SELECT expense_command('a','other',$1::uuid,'approve',2,'',$2,'c')", [req.id, key()], "self_review_denied");
  await fails("SELECT expense_admin_verify('a','admin',$1::uuid,2,'',$2,'c')", [req.id, key()], "not_requester");
  await pg.query("SELECT expense_command('a','admin',$1::uuid,'approve',2,'',$2,'c')", [req.id, key()]);
  await fails("SELECT expense_disburse('a','other',$1::jsonb,'c')", [JSON.stringify({ ...cash, responsibleStaffId: OTHER, expenseId: req.id, version: 3, key: key(), amount: "50000", currency: "UGX" })], "self_disbursement_denied");
  assert.equal((await row(req.id)).entry_mode, "request");

  // An administrator's own draft can be verified directly.
  const draft = await pg.query("SELECT expense_save_with_payees('a','admin',$1::jsonb,'c') AS r", [JSON.stringify({ ...base, key: key(), netAmount: "70000" })]).then((r) => r.rows[0].r);
  await fails("SELECT expense_admin_verify('a','admin',$1::uuid,9,'',$2,'c')", [draft.id, key()], "stale_expense");
  const verified = await pg.query("SELECT expense_admin_verify('a','admin',$1::uuid,1,'',$2,'c') AS r", [draft.id, key()]).then((r) => r.rows[0].r);
  assert.equal(verified.status, "approved");
  assert.equal((await row(draft.id)).entry_mode, "admin_verified");

  // entry_mode cannot be forged or changed outside expense_admin_verify.
  await fails("UPDATE expenses SET entry_mode='request' WHERE id=$1", [draft.id], "expense_locked");
  await fails("UPDATE expenses SET entry_mode='admin_verified' WHERE id=$1", [req.id], "expense_locked");
  await fails(`INSERT INTO expenses(organization_id,division,category,description,net_amount,total,currency,incurred_at,entry_mode) VALUES('a','painting','x','x',1,1,'UGX',now(),'admin_verified')`, [], "expense_locked");
  await fails("UPDATE project_members SET agreed_amount=-1 WHERE id=$1", [JOHN], "project_members_agreed_amount_check");

  // Project figures and team pay.
  globalThis.__adminVerifiedDb = drizzle(pg);
  const bundle = await build({ entryPoints: ["lib/projects/workspace.ts"], bundle: true, platform: "node", format: "cjs", write: false, packages: "external", plugins: [{ name: "fixture", setup(b) { b.onResolve({ filter: /^(server-only|next\/cache|@\/database\/db)$/ }, ({ path }) => ({ path, namespace: "fixture" })); b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ loader: "js", contents: path === "server-only" ? "" : path === "next/cache" ? "export function cacheLife(){} export function cacheTag(){} export function revalidateTag(){} export function updateTag(){} export function revalidatePath(){}" : "export const db={execute(q){return globalThis.__adminVerifiedDb.execute(q)}}" })); } }] });
  await mkdir("tmp", { recursive: true });
  const file = resolve("tmp/admin-verified-workspace.cjs"); await writeFile(file, bundle.outputFiles[0].contents);
  const { readProjectWorkspace } = createRequire(import.meta.url)(file);
  const w = await readProjectWorkspace("a", P, ["projects_read", "expenses_read", "invoices_read"]);
  // Spent: 300000 + 900000 + 50000 + 70000 approved/paid. John agreed 1.5M, paid 600k => owed 900k.
  assert.equal(w.finance.contract_set, "5000000.00");
  assert.equal(w.finance.spent, "1320000.00");
  assert.equal(w.finance.paid_out, "1200000.00");
  assert.equal(w.finance.team_agreed, "1500000.00");
  assert.equal(w.finance.team_owed, "900000.00");
  assert.equal(w.finance.invoiced, "0.00");
  assert.deepEqual(w.teamPayments.map((r) => [r.name, r.agreed, r.paid, r.lines.length]), [["John", "1500000.00", "600000.00", 1], ["Peter", null, "300000.00", 1]]);
  // A member with agreed pay but no payments yet still appears.
  await pg.exec(`INSERT INTO project_members(id,organization_id,project_id,external_name,agreed_amount) VALUES('00000000-0000-4000-8000-0000000000a3','a','${P}','Sam',200000)`);
  const w2 = await readProjectWorkspace("a", P, ["projects_read", "expenses_read"]);
  assert.deepEqual(w2.teamPayments.find((r) => r.name === "Sam"), { member_id: "00000000-0000-4000-8000-0000000000a3", name: "Sam", detail: null, currency: "UGX", agreed: "200000.00", paid: "0.00", approved: "0.00", pending: "0.00", lines: [] });
  assert.equal(w2.finance.team_owed, "1100000.00");
  assert.equal(w2.finance.invoiced, null, "invoice figures need invoices_read");
  assert.equal((await readProjectWorkspace("a", P, ["projects_read"])).finance, undefined, "project figures need expenses_read");

  console.log("PASS: administrators record verified (and optionally paid) expenses in one step with full history; the request workflow keeps its controls; projects report contract value, spending, team pay owed and per-person agreed pay.");
} finally { await pg.close(); delete globalThis.__adminVerifiedDb; }
