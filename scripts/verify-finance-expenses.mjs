// Phase 1D: expense workflow, controls, reports and ledger regression on a disposable
// PGlite database migrated with the real drizzle-current chain (0000-0009).
// Clerk/Next boundaries are mocked; application actions, reads and SQL are the real code.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const pg = new PGlite();
const ids = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`u${i}`, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`]));
const key = () => crypto.randomUUID();
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) if (v !== undefined) f.set(k, String(v)); return f; };
const passed = [];
const check = async (name, fn) => { await fn(); passed.push(name); };

try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) for (const s of (await readFile(`drizzle-current/${entry.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec(`
    INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A'),('b','B','B');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,display_name,status) VALUES
      ('${ids.u1}','a','req','Requester','active'),('${ids.u2}','a','rev','Reviewer','active'),('${ids.u3}','a','fin','Finance','active'),
      ('${ids.u4}','a','rec','Reconciler','active'),('${ids.u5}','a','gone','Suspended','suspended'),('${ids.u6}','b','other','Other org','active'),
      ('${ids.u7}','a','adm','Administrator','active');
    INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES('${ids.u10}','a','company','Client A','architecture'),('${ids.u11}','b','company','Client B','architecture');
    INSERT INTO projects(id,organization_id,client_id,code,name,division,currency) VALUES
      ('${ids.u12}','a','${ids.u10}','P-1','Villa','architecture','UGX'),('${ids.u13}','a','${ids.u10}','P-2','Fitout','interiors','USD'),('${ids.u14}','b','${ids.u11}','P-B','Other','architecture','UGX');`);

  const c = (globalThis.__financeTest = { db: drizzle(pg), org: "a", actor: "req", role: "org:sales", permissions: [], origin: "http://app.test" });
  const roles = {
    req: ["expenses_create", "expenses_submit"],
    rev: ["expenses_read", "expenses_review", "expenses_approve", "expenses_create", "expenses_submit"],
    fin: ["expenses_read", "expenses_disburse", "expenses_reconcile", "finance_reports", "payments_read", "invoices_read", "expenses_create", "expenses_submit"],
    rec: ["expenses_read", "expenses_reconcile", "expenses_disburse", "finance_reports"],
    viewer: ["expenses_read", "payments_read", "invoices_read"],
    adm: ["finance_accounts_manage", "expenses_read"],
  };
  const as = (actor, perms = roles[actor], org = "a") => { c.actor = actor; c.permissions = perms; c.org = org; };

  await mkdir("tmp", { recursive: true });
  const entry = `export * from "./lib/finance/actions"; export { readExpenseList, readExpenseDetail } from "./lib/finance/expenses"; export { readFinancialReports } from "./lib/finance/reports"; export { readReceivables } from "./lib/finance/receivables";`;
  const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{ name: "isolated", setup(b) {
      b.onResolve({ filter: /^(server-only|next\/cache|next\/headers|next\/navigation|@\/database\/db|@\/lib\/sales\/permissions|@clerk\/nextjs\/server)$/ }, ({ path }) => ({ path, namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => {
        const g = "const c=globalThis.__financeTest;";
        if (path === "server-only") return { loader: "js", contents: "" };
        if (path === "next/cache") return { loader: "js", contents: "export function revalidatePath(){} export function revalidateTag(){} export function updateTag(){} export function cacheTag(){} export function cacheLife(){}" };
        if (path === "next/headers") return { loader: "js", contents: g + "export async function headers(){return new Headers({host:'app.test',...(c.origin?{origin:c.origin}:{})})}" };
        if (path === "next/navigation") return { loader: "js", contents: "export function notFound(){throw new Error('NEXT_NOT_FOUND')}" };
        // Phase 1E: mutations re-verify membership live with Clerk; the fake mirrors the session unless c.revoked.
        if (path === "@clerk/nextjs/server") return { loader: "js", contents: g + "export async function currentUser(){return {fullName:c.actor,primaryEmailAddress:null}} export async function clerkClient(){return {organizations:{async getOrganizationMembershipList(){return {data:c.revoked?[]:[{organization:{id:c.org},role:'org:test',permissions:c.permissions.map(p=>'org:calacot:'+p),publicUserData:{userId:c.actor}}]}}}}}" };
        if (path.includes("permissions")) return { loader: "js", contents: g + "export const permissions=['expenses_read','expenses_create','expenses_submit','expenses_review','expenses_approve','expenses_disburse','expenses_reconcile','finance_reports','finance_accounts_manage','payments_read','invoices_read']; export const sensitivePermissions=new Set(); export function invalidateLiveMembership(){} export function roleAllows(){return false} export async function staffContext(required,mode){if(mode==='fresh'&&c.revoked)throw new Error('NEXT_NOT_FOUND');if(!c.permissions.length||(required&&!c.permissions.includes(required)))throw new Error('NEXT_NOT_FOUND');return {organizationId:c.org,actor:c.actor,role:c.role,permissions:[...c.permissions]}}" };
        return { loader: "js", contents: g + "export const db={execute(q){return c.db.execute(q)}}" };
      });
    } }],
  });
  const file = resolve("tmp/phase1d-finance.cjs");
  await writeFile(file, bundle.outputFiles[0].contents);
  const m = createRequire(import.meta.url)(file);
  const q = async (text, params = []) => (await pg.query(text, params)).rows;
  const version = async (id) => (await q("SELECT version FROM expenses WHERE id=$1", [id]))[0].version;
  const status = async (id) => (await q("SELECT status FROM expenses WHERE id=$1", [id]))[0].status;
  const today = (await q("SELECT finance_kampala_today()::text AS d"))[0].d;
  const draft = (over = {}) => form({ key: key(), division: "architecture", projectId: ids.u12, category: "Materials", supplierName: "Hardware Ltd", description: "Cement", purpose: "Foundation works for villa", currency: "UGX", netAmount: "1000000", taxAmount: "180000", incurredOn: today, ...over });
  const cmd = (expenseId, command, v, note = "", k = key()) => m.expenseCommand({}, form({ expenseId, command, version: v, note, key: k }));

  // 0. Verified source accounts (approved reference policy: org + method + account + reference).
  const acct = {};
  await check("verified payment accounts: manager-only registration, identity normalization, immutability", async () => {
    const register = (name, o) => m.saveFinanceAccount({}, form({ key: key(), verificationNote: "Checked against bank letter", ...o })).then((r) => { assert.equal(r.ok, true, r.message); acct[name] = r.id; });
    as("fin");
    await assert.rejects(m.saveFinanceAccount({}, form({ key: key(), method: "bank_transfer", provider: "Stanbic", accountIdentifier: "0101", label: "Ops", currency: "UGX", verificationNote: "Checked" })), /NEXT_NOT_FOUND/, "finance cannot register accounts by default");
    as("adm");
    await register("A1", { method: "bank_transfer", provider: "Stanbic Bank", accountIdentifier: "9030-0101", label: "Operations", currency: "UGX" });
    await register("A2", { method: "bank_transfer", provider: "Centenary", accountIdentifier: "3100-0202", label: "Projects", currency: "UGX" });
    await register("M1", { method: "mobile_money", provider: "MTN", accountIdentifier: "+256 772 000 111", label: "Petty MoMo", currency: "UGX" });
    await register("U1", { method: "bank_transfer", provider: "Stanbic Bank", accountIdentifier: "9030-0909", label: "USD account", currency: "USD" });
    const dup = await m.saveFinanceAccount({}, form({ key: key(), method: "bank_transfer", provider: "stanbic-bank", accountIdentifier: "90300101", label: "Copy", currency: "UGX", verificationNote: "Checked again" }));
    assert.match(dup.message, /already registered/, "normalized duplicate account rejected");
    assert.match((await m.saveFinanceAccount({}, form({ key: key(), method: "bank_transfer", provider: "X", accountIdentifier: "1", label: "Y", currency: "UGX", verificationNote: "no" }))).message, /verified/);
    await assert.rejects(pg.query("UPDATE finance_accounts SET account_identifier='1' WHERE id=$1", [acct.A1]), /finance_account_immutable/);
    await assert.rejects(pg.query("DELETE FROM finance_accounts WHERE id=$1", [acct.A1]), /finance_account_immutable/);
    assert.equal((await q("SELECT count(*)::int AS n FROM audit_logs WHERE action='finance_account.verify'"))[0].n, 4);
  });

  // 1. Draft creation, retries and validation.
  let e1;
  await check("draft creation, idempotent retry and validation", async () => {
    as("req");
    const f = draft();
    const r1 = await m.saveExpense({}, f);
    assert.equal(r1.ok, true, r1.message);
    e1 = r1.id;
    const r2 = await m.saveExpense({}, f);
    assert.equal(r2.id, e1, "retry with same key returns same expense");
    assert.deepEqual(await q("SELECT count(*)::int AS n FROM expenses WHERE organization_id='a'"), [{ n: 1 }]);
    assert.deepEqual(await q("SELECT count(*)::int AS n FROM expense_events WHERE expense_id=$1 AND action='created'", [e1]), [{ n: 1 }]);
    assert.deepEqual(await q("SELECT total::text,status,requested_by_id::text FROM expenses WHERE id=$1", [e1]), [{ total: "1180000.00", status: "draft", requested_by_id: ids.u1 }]);
    assert.equal((await m.saveExpense({}, draft({ division: "interiors" }))).ok, false, "project division mismatch rejected");
    assert.match((await m.saveExpense({}, draft({ incurredOn: "2999-01-01" }))).message, /future/);
    assert.equal((await m.saveExpense({}, draft({ netAmount: "1.234" }))).ok, false);
    assert.equal((await m.saveExpense({}, draft({ projectId: ids.u14 }))).ok, false, "other organization's project rejected");
    assert.equal((await m.saveExpense({}, draft({ purpose: "x" }))).ok, false);
    c.origin = "http://evil.test"; assert.equal((await m.saveExpense({}, draft())).ok, false, "cross-origin rejected"); c.origin = "http://app.test";
    assert.deepEqual(await q("SELECT count(*)::int AS n FROM suppliers WHERE organization_id='a'"), [{ n: 1 }], "supplier deduplicated by name");
  });

  await check("suspended staff fail closed", async () => {
    as("gone", roles.req);
    const r = await m.saveExpense({}, draft());
    assert.equal(r.ok, false); assert.match(r.message, /inactive|missing/);
    assert.deepEqual(await q("SELECT status FROM staff_memberships WHERE clerk_user_id='gone'"), [{ status: "suspended" }], "not reactivated");
  });

  await check("submission and requester-only edits", async () => {
    as("rev");
    const v = await version(e1);
    assert.match((await cmd(e1, "submit", v)).message, /Only the employee who requested/);
    as("req");
    const k = key();
    assert.equal((await cmd(e1, "submit", v, "", k)).ok, true);
    assert.equal((await cmd(e1, "submit", v, "", k)).message, "Already recorded.", "idempotent submit");
    assert.equal(await status(e1), "submitted");
    const edit = draft({ id: e1, version: await version(e1) });
    assert.match((await m.saveExpense({}, edit)).message, /can no longer be edited/);
  });

  await check("self-approval denied (application and database)", async () => {
    as("req", [...roles.rev]); // requester holding approval rights
    c.actor = "req";
    assert.match((await cmd(e1, "approve", await version(e1))).message, /own expense request/);
    await assert.rejects(pg.query("UPDATE expenses SET status='approved',approved_by_id=requested_by_id,approved_at=now() WHERE id=$1", [e1]), /expenses_no_self_approval_check/);
  });

  await check("stale review rejected after correction cycle", async () => {
    as("rev");
    const seen = await version(e1);
    assert.equal((await cmd(e1, "return", seen, "Attach the receipt please")).ok, true);
    assert.equal(await status(e1), "returned");
    as("req");
    const fixed = await m.saveExpense({}, draft({ id: e1, version: await version(e1), netAmount: "900000", taxAmount: "" }));
    assert.equal(fixed.ok, true, fixed.message);
    assert.equal((await cmd(e1, "submit", await version(e1))).ok, true, "resubmission");
    as("rev");
    const stale = await cmd(e1, "approve", seen);
    assert.equal(stale.ok, false); assert.match(stale.message, /changed after you opened it/);
    assert.match((await cmd(e1, "reject", await version(e1), "no")).message, /reason/);
  });

  await check("concurrent approvals produce one approval", async () => {
    as("rev");
    const v = await version(e1);
    const results = await Promise.all([cmd(e1, "approve", v), cmd(e1, "approve", v)]);
    assert.equal(results.filter((r) => r.ok).length, 1, JSON.stringify(results));
    assert.deepEqual(await q("SELECT count(*)::int AS n FROM expense_events WHERE expense_id=$1 AND action='approve'", [e1]), [{ n: 1 }]);
    assert.equal(await status(e1), "approved");
    assert.deepEqual(await q("SELECT approved_by_id::text FROM expenses WHERE id=$1", [e1]), [{ approved_by_id: ids.u2 }]);
    assert.deepEqual(await q("SELECT count(*)::int AS n FROM expense_disbursements WHERE expense_id=$1", [e1]), [{ n: 0 }], "approval does not disburse");
  });

  await check("rejection is final; rejected request cannot be resubmitted", async () => {
    as("req");
    const r = await m.saveExpense({}, draft({ description: "Paint", netAmount: "50000" }));
    assert.equal((await cmd(r.id, "submit", await version(r.id))).ok, true);
    as("rev");
    assert.equal((await cmd(r.id, "reject", await version(r.id), "Not a project cost")).ok, true);
    as("req");
    assert.equal((await cmd(r.id, "submit", await version(r.id))).ok, false);
    assert.equal(await status(r.id), "rejected");
  });

  await check("unauthorized and self disbursement denied", async () => {
    const base = { expenseId: e1, currency: "UGX", method: "bank_transfer", sourceAccountId: acct.A1, reference: "TRX-001", paidOn: today, responsibleStaffId: ids.u3 };
    as("rev");
    await assert.rejects(m.recordDisbursement({}, form({ ...base, version: await version(e1), key: key(), amount: "100" })), /NEXT_NOT_FOUND/, "reviewer without disburse permission");
    as("viewer"); c.actor = "fin";
    await assert.rejects(m.recordDisbursement({}, form({ ...base, version: await version(e1), key: key(), amount: "100" })), /NEXT_NOT_FOUND/);
    as("req", [...roles.fin]); c.actor = "req";
    assert.match((await m.recordDisbursement({}, form({ ...base, version: await version(e1), key: key(), amount: "100" }))).message, /own expense request/);
  });

  let d1;
  await check("disbursement recording, currency, limits, duplicates and retries", async () => {
    as("fin");
    const base = { expenseId: e1, currency: "UGX", method: "bank_transfer", sourceAccountId: acct.A1, paidOn: today, responsibleStaffId: ids.u3 };
    assert.match((await m.recordDisbursement({}, form({ ...base, currency: "USD", reference: "X1", version: await version(e1), key: key(), amount: "100" }))).message, /expense currency/);
    assert.match((await m.recordDisbursement({}, form({ ...base, reference: "X2", version: await version(e1), key: key(), amount: "900000.01" }))).message, /exceeds/);
    assert.match((await m.recordDisbursement({}, form({ ...base, reference: "", version: await version(e1), key: key(), amount: "1" }))).message, /transaction reference/);
    assert.match((await m.recordDisbursement({}, form({ ...base, reference: "X3", paidOn: "2999-01-01", version: await version(e1), key: key(), amount: "1" }))).message, /future/);
    const k = key();
    const first = await m.recordDisbursement({}, form({ ...base, reference: "trx 001", version: await version(e1), key: k, amount: "400000" }));
    assert.equal(first.ok, true, first.message); d1 = first.id;
    const retry = await m.recordDisbursement({}, form({ ...base, reference: "trx 001", version: 1, key: k, amount: "400000" }));
    assert.equal(retry.ok, true); assert.equal(retry.id, d1, "retry returns original");
    assert.equal(await status(e1), "approved", "partial payment stays approved");
    const dup = await m.recordDisbursement({}, form({ ...base, reference: "TRX-001", version: await version(e1), key: key(), amount: "1" }));
    assert.match(dup.message, /already recorded/, "normalized duplicate reference rejected");
    const stale = await m.recordDisbursement({}, form({ ...base, reference: "TRX-002", version: 1, key: key(), amount: "1" }));
    assert.match(stale.message, /changed since/);
    const second = await m.recordDisbursement({}, form({ ...base, method: "mobile_money", sourceAccountId: acct.M1, reference: "MM-77", version: await version(e1), key: key(), amount: "500000" }));
    assert.equal(second.ok, true, second.message);
    assert.equal(await status(e1), "paid");
    assert.match((await m.recordDisbursement({}, form({ ...base, reference: "TRX-9", version: await version(e1), key: key(), amount: "1" }))).message, /already been disbursed/);
    assert.deepEqual(await q("SELECT sum(amount)::text AS s,count(*)::int AS n FROM expense_disbursements WHERE expense_id=$1", [e1]), [{ s: "900000.00", n: 2 }]);
  });

  await check("approved reference policy: per organization, method and verified account", async () => {
    as("req");
    const r = await m.saveExpense({}, draft({ description: "Sand", netAmount: "20000", taxAmount: "" }));
    await cmd(r.id, "submit", await version(r.id));
    as("rev"); await cmd(r.id, "approve", await version(r.id));
    as("fin");
    const pay = async (o) => m.recordDisbursement({}, form({ expenseId: r.id, currency: "UGX", method: "bank_transfer", paidOn: today, responsibleStaffId: ids.u3, version: await version(r.id), key: key(), ...o }));
    assert.match((await pay({ reference: "TRX001", amount: "20000" })).message, /verified company account/, "account required for bank transfer");
    assert.match((await pay({ sourceAccountId: acct.A1, reference: "TRX001", amount: "20000" })).message, /already recorded/, "same account + normalized reference rejected across expenses");
    assert.match((await pay({ sourceAccountId: acct.U1, reference: "NEW-1", amount: "1" })).message, /does not match/, "USD account cannot pay UGX expense");
    assert.match((await pay({ sourceAccountId: acct.M1, reference: "NEW-2", amount: "1" })).message, /does not match/, "mobile-money account cannot be used for bank transfer");
    assert.match((await pay({ method: "mobile_money", sourceAccountId: acct.M1, reference: "TRX001", amount: "1" })).ok ? "" : "x", /^$/, "same reference under another method is a different transaction");
    const other = await pay({ sourceAccountId: acct.A2, reference: "TRX-001", amount: "9999" });
    assert.equal(other.ok, true, "same reference on a different verified account allowed: " + other.message);
    as("adm"); assert.equal((await m.setFinanceAccountStatus({}, form({ accountId: acct.A2, status: "inactive" }))).ok, true);
    as("fin");
    assert.match((await pay({ sourceAccountId: acct.A2, reference: "TRX-777", amount: "1" })).message, /inactive/, "inactive account rejected");
    assert.match((await pay({ method: "cash", sourceAccountId: acct.A1, reference: "", amount: "1" })).message, /do not use a source account/);
    const cash = await pay({ method: "cash", reference: "", amount: "10000" });
    assert.equal(cash.ok, true, "cash without reference or account allowed");
    await assert.rejects(pg.query("UPDATE expense_disbursements SET source_account_id=NULL WHERE method='bank_transfer'"), /disbursement_immutable|source_account_check/);
    await assert.rejects(pg.query(`INSERT INTO expense_disbursements(organization_id,expense_id,amount,currency,method,reference,paid_on,responsible_staff_id,recorded_by_id,idempotency_key) VALUES('a',$1,1,'UGX','bank_transfer','RAW-1',current_date,$2,$2,'raw')`, [r.id, ids.u3]), /source_account_check/, "direct insert without account blocked by database");
  });

  await check("reconciliation segregation, void and immutability", async () => {
    as("fin");
    assert.match((await m.disbursementCommand({}, form({ disbursementId: d1, command: "reconcile", key: key(), statementReference: "STMT-1" }))).message, /cannot reconcile/);
    as("rec");
    assert.equal((await m.disbursementCommand({}, form({ disbursementId: d1, command: "reconcile", key: key(), statementReference: "STMT-1" }))).ok, true);
    assert.match((await m.disbursementCommand({}, form({ disbursementId: d1, command: "void", key: key(), note: "Entered twice" }))).message, /Reconciled disbursements/);
    const other = (await q("SELECT id FROM expense_disbursements WHERE expense_id=$1 AND id<>$2", [e1, d1]))[0].id;
    assert.equal((await m.disbursementCommand({}, form({ disbursementId: other, command: "void", key: key(), note: "Wrong reference" }))).ok, true);
    assert.equal(await status(e1), "approved", "void returns paid expense to approved");
    await assert.rejects(pg.query("UPDATE expense_disbursements SET amount=1 WHERE id=$1", [d1]), /disbursement_immutable|reconciled_disbursement_locked/);
    await assert.rejects(pg.query("DELETE FROM expense_disbursements WHERE id=$1", [other]), /disbursement_immutable/);
    await assert.rejects(pg.query("UPDATE expense_events SET note='x'"), /expense_history_immutable/);
    await assert.rejects(pg.query("DELETE FROM expense_events"), /expense_history_immutable/);
    await assert.rejects(pg.query("UPDATE expenses SET total=1,net_amount=1,tax_amount=0 WHERE id=$1", [e1]), /expense_locked/);
  });

  await check("revoked membership refused on financial mutations despite a valid session", async () => {
    as("rev"); c.revoked = true;
    await assert.rejects(cmd(e1, "approve", await version(e1)), /NEXT_NOT_FOUND/);
    c.revoked = false;
  });

  await check("cross-organization access denied", async () => {
    as("other", roles.rev, "b");
    assert.match((await cmd(e1, "approve", await version(e1))).message, /unavailable|inactive|missing/);
    await assert.rejects(m.readExpenseDetail(e1), /NEXT_NOT_FOUND/);
    const list = await m.readExpenseList({ view: "all" });
    assert.equal(list.rows.length, 0);
    as("fin");
    const foreign = await m.recordDisbursement({}, form({ expenseId: e1, currency: "UGX", method: "cash", paidOn: today, responsibleStaffId: ids.u6, version: await version(e1), key: key(), amount: "1" }));
    assert.match(foreign.message, /active employee/, "staff from another organization rejected");
  });

  await check("requester-only visibility without expenses_read", async () => {
    as("rev");
    const own = await m.saveExpense({}, draft({ description: "Reviewer's own", netAmount: "10" }));
    as("req");
    await assert.rejects(m.readExpenseDetail(own.id), /NEXT_NOT_FOUND/);
    const detail = await m.readExpenseDetail(e1);
    assert.equal(detail.expense.id, e1);
    const list = await m.readExpenseList({ view: "all" });
    assert.equal(list.view, "mine");
    assert(list.rows.every((r) => r.requested_by_id === ids.u1));
  });

  await check("currency separation and report consistency", async () => {
    as("req");
    const usd = await m.saveExpense({}, draft({ division: "interiors", projectId: ids.u13, currency: "USD", netAmount: "250.50", taxAmount: "", description: "Light fittings" }));
    await cmd(usd.id, "submit", await version(usd.id));
    as("rev"); await cmd(usd.id, "approve", await version(usd.id));
    as("fin");
    await m.recordDisbursement({}, form({ expenseId: usd.id, currency: "USD", method: "bank_transfer", sourceAccountId: acct.U1, reference: "USD-1", paidOn: today, responsibleStaffId: ids.u3, version: await version(usd.id), key: key(), amount: "100" }));
    const r = await m.readFinancialReports({});
    for (const row of [...r.pipeline, ...r.disbursed, ...r.byDivision, ...r.byCategory]) assert(["UGX", "USD"].includes(row.currency));
    const pipe = Object.fromEntries(r.pipeline.map((p) => [p.currency, p]));
    const direct = await q(`SELECT currency,sum(total) FILTER (WHERE status IN ('approved','paid'))::text AS approved FROM expenses WHERE organization_id='a' GROUP BY currency`);
    for (const d of direct) assert.equal(Number(pipe[d.currency].approved), Number(d.approved), `approved ${d.currency}`);
    assert.equal(Number(pipe.USD.approved), 250.5);
    assert.equal(Number(pipe.USD.outstanding), 150.5);
    const disb = Object.fromEntries(r.disbursed.map((p) => [p.currency, p]));
    assert.equal(Number(disb.UGX.amount), 400000 + 20000, "voided disbursement excluded");
    assert.equal(Number(disb.UGX.reconciled), 400000);
    const divTotal = r.byDivision.filter((x) => x.currency === "UGX").reduce((s, x) => s + Number(x.approved), 0);
    assert.equal(divTotal, Number(pipe.UGX.approved), "division breakdown sums to approved total");
    const filtered = await m.readFinancialReports({ currency: "USD" });
    assert(filtered.pipeline.every((p) => p.currency === "USD"));
    const byProject = await m.readFinancialReports({ projectId: ids.u12 });
    assert(byProject.byProject.every((p) => p.label.startsWith("P-1")));
    as("rev"); c.permissions = roles.rev;
    await assert.rejects(m.readFinancialReports({}), /NEXT_NOT_FOUND/, "reports need finance_reports");
  });

  await check("existing sales ledger unchanged: balances, verification and receivables", async () => {
    await pg.exec(`INSERT INTO invoices(id,organization_id,client_id,project_id,number,status,customer_snapshot,issuer_snapshot,currency,subtotal,total,issued_at,due_on)
      VALUES('${ids.u20}','a','${ids.u10}','${ids.u12}','CAL-I-T-1','issued','{"name":"Client A"}','{"legalName":"A"}','UGX',500000,500000,now(),current_date-5),
            ('${ids.u21}','a','${ids.u10}','${ids.u13}','CAL-I-T-2','issued','{"name":"Client A"}','{"legalName":"A"}','USD',300,300,now(),current_date+5)`);
    const pay = (p) => pg.query("SELECT sales_payment('a','fin',$1::jsonb,'t') AS id", [JSON.stringify(p)]);
    const submitted = (await pay({ command: "submit", invoiceId: ids.u20, amount: "200000", method: "bank_transfer", reference: "R1", receivedAt: new Date().toISOString(), key: key(), evidence: "" })).rows[0].id;
    await pay({ command: "verify", invoiceId: ids.u20, paymentId: submitted, amount: "150000", method: "bank_transfer", reference: "R1", receivedAt: new Date().toISOString(), key: key(), evidence: "Bank statement" });
    const rec = await m.readReceivables("a");
    const ugx = rec.balances.find((b) => b.currency === "UGX");
    assert.equal(Number(ugx.outstanding), 350000, "balance from existing ledger");
    assert.equal(ugx.overdue_count, 1);
    assert.equal(Number(rec.unallocatedTotals.find((u) => u.currency === "UGX").amount), 50000, "unallocated = amount - allocations");
    assert.equal(rec.balances.find((b) => b.currency === "USD").overdue_count, 0);
    as("fin");
    const r = await m.readFinancialReports({});
    assert.equal(Number(r.outstanding.find((x) => x.currency === "UGX").outstanding), 350000);
    assert.equal(Number(r.receipts.find((x) => x.currency === "UGX").amount), 200000, "confirmed receipts");
    assert.equal(Number(r.invoiced.find((x) => x.currency === "UGX").amount), 500000);
    const proj = r.projects.find((p) => p.id === ids.u12 && p.currency === "UGX");
    assert.equal(Number(proj.collected), 150000); assert.equal(Number(proj.outstanding), 350000);
    const scoped = await m.readFinancialReports({ projectId: ids.u12 });
    assert.equal(Number(scoped.receipts.find((x) => x.currency === "UGX").amount), 150000, "scoped receipts only include allocations");
    assert.deepEqual(await q(`SELECT status FROM projects WHERE id=$1`, [ids.u12]), [{ status: "planned" }], "project status untouched by expense payments");
  });

  console.log(`PASS (${passed.length} groups):\n- ${passed.join("\n- ")}`);
} finally {
  await pg.close();
  delete globalThis.__financeTest;
}
