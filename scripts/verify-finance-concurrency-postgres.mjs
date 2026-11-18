// Phase 1D: real PostgreSQL concurrency checks with two independent connections whose
// transactions genuinely overlap (each case holds transaction A open while B runs).
// Usage: echo "<connection string>" | node scripts/verify-finance-concurrency-postgres.mjs
// Refuses any database not named phase1d_finance_fixture. Applies the migration chain only to
// an empty database, then uses a random organization id, so it never touches existing records.
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

let input = ""; for await (const chunk of process.stdin) input += chunk;
const url = new URL(input.trim());
if (url.pathname !== "/phase1d_finance_fixture") throw Error("Refusing non-fixture database");
const a = new Client({ connectionString: url.toString() }), b = new Client({ connectionString: url.toString() });
await a.connect(); await b.connect();
const settle = (p) => { const s = { done: false }; s.result = p.then((v) => { s.done = true; return v; }, (e) => { s.done = true; return e; }); return s; };
const pause = () => new Promise((r) => setTimeout(r, 700));
const passed = [];
try {
  const migrated = await a.query("SELECT 1 FROM information_schema.tables WHERE table_name='finance_accounts'");
  if (!migrated.rowCount) {
    const existing = await a.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
    if (existing.rows[0].n) throw Error("Fixture database is not empty and not migrated; refusing");
    const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
    await a.query("BEGIN");
    try { for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await a.query(s); await a.query("COMMIT"); }
    catch (e) { await a.query("ROLLBACK"); throw e; }
    passed.push(`migration chain 0000-${journal.entries.at(-1).tag} applied in one transaction`);
  }
  const version = (await a.query("SELECT version()")).rows[0].version.split(" ").slice(0, 2).join(" ");
  const org = "phase1d-" + randomUUID(), staff = Object.fromEntries(["req", "rev", "rev2", "fin", "fin2", "adm"].map((n) => [n, randomUUID()]));
  await a.query("INSERT INTO organizations(id,name,legal_name) VALUES($1,'Fixture','Fixture')", [org]);
  for (const [clerk, sid] of Object.entries(staff)) await a.query("INSERT INTO staff_memberships(id,organization_id,clerk_user_id,status) VALUES($1,$2,$3,'active')", [sid, org, clerk]);
  const account = async (provider, number) => (await a.query("SELECT finance_account_save($1,'adm',$2::jsonb,'t') AS r", [org, JSON.stringify({ key: randomUUID(), method: "bank_transfer", provider, accountIdentifier: number, label: provider, currency: "UGX", verificationNote: "Fixture verification" })])).rows[0].r.id;
  const acc1 = await account("Bank One", "001"), acc2 = await account("Bank Two", "002");
  const today = new Date().toISOString().slice(0, 10);
  const save = (c, key) => c.query("SELECT expense_save($1,'req',$2::jsonb,'t') AS r", [org, JSON.stringify({ key, division: "tech", category: "Software", description: "Fixture", purpose: "Concurrency fixture", currency: "UGX", netAmount: "1000", incurredOn: today })]);
  const approved = async () => {
    const id = (await save(a, randomUUID())).rows[0].r.id;
    await a.query("SELECT expense_command($1,'req',$2,'submit',1,'',$3,'t')", [org, id, randomUUID()]);
    await a.query("SELECT expense_command($1,'rev',$2,'approve',2,'',$3,'t')", [org, id, randomUUID()]);
    return id;
  };
  const pay = (c, expenseId, o) => c.query("SELECT expense_disburse($1,'fin',$2::jsonb,'t') AS r", [org, JSON.stringify({ expenseId, version: 3, key: randomUUID(), amount: "1000", currency: "UGX", method: "bank_transfer", paidOn: today, responsibleStaffId: staff.fin, ...o })]);
  const overlap = async (first, second, check, name) => {
    await a.query("BEGIN"); await b.query("BEGIN");
    await first(a);
    const s = settle(second(b));
    await pause(); assert.equal(s.done, false, `${name}: second transaction must block while the first is open`);
    await a.query("COMMIT");
    const result = await s.result;
    await b.query(result instanceof Error ? "ROLLBACK" : "COMMIT");
    await check(result);
    passed.push(name);
  };

  // 1. Same idempotency key creating a draft from two connections: one expense.
  const createKey = randomUUID();
  await overlap((c) => save(c, createKey), (c) => save(c, createKey), async (r) => {
    assert.equal(r.rows?.[0]?.r?.already, true, String(r));
    assert.equal((await a.query("SELECT count(*)::int AS n FROM expenses WHERE organization_id=$1 AND idempotency_key=$2", [org, createKey])).rows[0].n, 1);
  }, "same-key draft creation: one expense");

  // 2. Two reviewers acting on the same version: second waits, then is stale.
  const e1 = (await a.query("SELECT id FROM expenses WHERE organization_id=$1 AND idempotency_key=$2", [org, createKey])).rows[0].id;
  await a.query("SELECT expense_command($1,'req',$2,'submit',1,'',$3,'t')", [org, e1, randomUUID()]);
  await overlap((c) => c.query("SELECT expense_command($1,'rev',$2,'approve',2,'',$3,'t')", [org, e1, randomUUID()]),
    (c) => c.query("SELECT expense_command($1,'rev2',$2,'reject',2,'Too expensive',$3,'t')", [org, e1, randomUUID()]),
    async (r) => { assert.match(String(r), /stale_review/); assert.equal((await a.query("SELECT status FROM expenses WHERE id=$1", [e1])).rows[0].status, "approved"); },
    "concurrent approve/reject: one decision, the other rejected as stale");
  assert.equal((await a.query("SELECT count(*)::int AS n FROM expense_disbursements WHERE expense_id=$1", [e1])).rows[0].n, 0, "approval records no payment");

  // 3. Same disbursement key from two connections (double click / retry): one disbursement.
  const key = randomUUID();
  await overlap((c) => pay(c, e1, { key, sourceAccountId: acc1, reference: "REF-1" }), (c) => pay(c, e1, { key, sourceAccountId: acc1, reference: "REF-1" }), async (r) => {
    assert.equal(r.rows?.[0]?.r?.already, true, String(r));
    assert.equal((await a.query("SELECT count(*)::int AS n FROM expense_disbursements WHERE expense_id=$1", [e1])).rows[0].n, 1);
  }, "same-key disbursement retry: one payment record");

  // 4. Same account + reference on two different expenses (different keys): one wins.
  const e2 = await approved(), e3 = await approved();
  await overlap((c) => pay(c, e2, { sourceAccountId: acc1, reference: "TX-SAME" }), (c) => pay(c, e3, { sourceAccountId: acc1, reference: "tx same" }),
    async (r) => assert.match(String(r), /duplicate_disbursement_reference/), "duplicate account+reference on different expenses: second blocked by unique index");

  // 5. Same reference on a different verified account is a different transaction: both succeed.
  //    Overlapping inserts with the same reference on different accounts do not block each other.
  const e5 = await approved();
  await a.query("BEGIN"); await b.query("BEGIN");
  await pay(a, e3, { sourceAccountId: acc2, reference: "TX-NEW" });
  const parallel = settle(pay(b, e5, { sourceAccountId: acc1, reference: "TX-NEW" }));
  await pause(); assert.equal(parallel.done, true, "different accounts must not wait on each other");
  assert(!((await parallel.result) instanceof Error), String(await parallel.result));
  await a.query("COMMIT"); await b.query("COMMIT");
  assert.equal((await a.query("SELECT count(*)::int AS n FROM expense_disbursements WHERE organization_id=$1 AND reference_normalized='TXNEW'", [org])).rows[0].n, 2);
  passed.push("same reference on different verified accounts: both accepted without blocking");

  // 6. Void and reconcile racing on one disbursement: exactly one succeeds.
  const d = (await a.query("SELECT id FROM expense_disbursements WHERE expense_id=$1", [e2])).rows[0].id;
  await overlap((c) => c.query("SELECT expense_disbursement_command($1,'fin2',$2,'reconcile',$3::jsonb,'t')", [org, d, JSON.stringify({ key: randomUUID(), statementReference: "STMT" })]),
    (c) => c.query("SELECT expense_disbursement_command($1,'fin',$2,'void',$3::jsonb,'t')", [org, d, JSON.stringify({ key: randomUUID(), note: "Entered in error" })]),
    async (r) => assert.match(String(r), /reconciled_disbursement_locked/), "void vs reconcile race: reconciled record stays locked");

  // 7. Two partial disbursements on one expense that together exceed the approved total.
  const e4 = await approved();
  await overlap((c) => pay(c, e4, { sourceAccountId: acc1, reference: "P-1", amount: "700" }), (c) => pay(c, e4, { sourceAccountId: acc1, reference: "P-2", amount: "700" }),
    async (r) => assert.match(String(r), /stale_expense|disbursement_exceeds_approved/), "overlapping partial payments cannot exceed the approved amount");

  console.log(`PASS on ${version} (${passed.length}):\n- ${passed.join("\n- ")}`);
} finally { await a.end(); await b.end(); }
