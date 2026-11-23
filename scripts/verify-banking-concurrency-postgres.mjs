// Phase 2C: real PostgreSQL checks for banking, using independent connections whose transactions
// genuinely overlap, and a real backend termination for crash safety. Synthetic data only.
// Usage: echo "<connection string>" | node scripts/verify-banking-concurrency-postgres.mjs
// Refuses any database not named phase2c_banking_fixture, applies the migration chain only to an
// empty database, and uses a random organization id.
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chartSeedPayload } from "../lib/accounting/chart.ts";

let input = ""; for await (const chunk of process.stdin) input += chunk;
const url = new URL(input.trim());
if (url.pathname !== "/phase2c_banking_fixture") throw Error("Refusing non-fixture database");
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw Error("Refusing a non-local database: fixtures run on a throwaway local PostgreSQL");
const connect = async () => { const c = new Client({ connectionString: url.toString() }); await c.connect(); c.on("error", () => {}); return c; };
const a = await connect(), b = await connect();
const settle = (p) => { const s = { done: false }; s.result = p.then((v) => { s.done = true; return v; }, (e) => { s.done = true; return e; }); return s; };
const pause = (ms = 700) => new Promise((r) => setTimeout(r, ms));
const key = () => randomUUID();
const passed = [];
const check = async (name, fn) => { await fn(); passed.push(name); console.log("PASS", name); };
try {
  const existing = await a.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
  if (existing.rows[0].n) throw Error("Fixture database must be empty");
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  await a.query("BEGIN");
  try { for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await a.query(s); await a.query("COMMIT"); }
  catch (e) { await a.query("ROLLBACK"); throw e; }
  console.log(`PASS migration chain 0000-${journal.entries.at(-1).tag} applied in one transaction`);

  const org = `phase2c-${randomUUID()}`;
  const fn = async (client, call, params) => (await client.query(`SELECT ${call} AS r`, params)).rows[0].r;
  await a.query("INSERT INTO organizations(id,name,legal_name) VALUES($1,'Fixture','Fixture')", [org]);
  await a.query("INSERT INTO staff_memberships(organization_id,clerk_user_id,status) VALUES($1,'prep','active'),($1,'review','active')", [org]);
  const today = (await a.query("SELECT finance_kampala_today()::text AS d")).rows[0].d;
  const Y = Number(today.slice(0, 4)) - 1, D = (m, d) => `${Y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  await fn(a, "accounting_chart_seed($1,'prep',$2::jsonb,$3,'t')", [org, JSON.stringify(chartSeedPayload()), key()]);
  await fn(a, "accounting_chart_approve($1,'review',$2,'t')", [org, key()]);
  const pol = await fn(a, "accounting_policy_propose($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: true, note: "Fixture policy" })]);
  await fn(a, "accounting_policy_decide($1,'review',$2,'approve','ok',$3,'t')", [org, pol.id, key()]);
  await fn(a, "accounting_period_generate_year($1,'prep',$2,$3,'t')", [org, Y, key()]);
  const acct = Object.fromEntries((await a.query("SELECT code,id FROM accounting_accounts WHERE organization_id=$1", [org])).rows.map((r) => [r.code, r.id]));
  const fa = await fn(a, "finance_account_save($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), method: "bank_transfer", provider: "Fixture Bank", accountIdentifier: "000111222", label: "Fixture", currency: "UGX", verificationNote: "Synthetic fixture" })]);
  const bank = (await fn(a, "banking_account_register($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), kind: "bank", financeAccountId: fa.id })])).id;
  const petty = (await fn(a, "banking_account_register($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), kind: "petty_cash", label: "Petty", currency: "UGX", custodianId: (await a.query("SELECT id FROM staff_memberships WHERE organization_id=$1 AND clerk_user_id='prep'", [org])).rows[0].id })])).id;

  await check("concurrent mapping approvals on two connections record one decision", async () => {
    const m = await fn(a, "bank_mapping_propose($1,'prep',$2::uuid,$3::uuid,'Fixture mapping',$4,'t')", [org, bank, acct["1120"], key()]);
    const k = key();
    await a.query("BEGIN"); await b.query("BEGIN");
    const first = await fn(a, "bank_mapping_decide($1,'review',$2::uuid,'approve','',$3,'t')", [org, m.id, k]);
    const second = settle(fn(b, "bank_mapping_decide($1,'review',$2::uuid,'approve','',$3,'t')", [org, m.id, k]));
    await pause(); assert.equal(second.done, false, "the second decision waits");
    await a.query("COMMIT");
    const r2 = await second.result; await b.query("COMMIT");
    assert.equal(first.already, false); assert.equal(r2.already, true);
    const pm = await fn(a, "bank_mapping_propose($1,'prep',$2::uuid,$3::uuid,'Petty mapping',$4,'t')", [org, petty, acct["1110"], key()]);
    await fn(a, "bank_mapping_decide($1,'review',$2::uuid,'approve','',$3,'t')", [org, pm.id, key()]);
  });

  const rows = (n0, n1) => Array.from({ length: n1 - n0 + 1 }, (_, i) => ({ row: i + 2, date: D(2, n0 + i), description: `Deposit ${n0 + i}`, reference: `R${n0 + i}`, amount: "1000", balance: "" }));
  const importP = (rs) => JSON.stringify({ key: key(), bankingAccountId: bank, currency: "UGX", fileName: "f.csv", fileSha256: randomUUID().replaceAll("-", "").padEnd(64, "a"), fileSize: 100, storageKey: `t/${randomUUID()}`, sourceFormat: "csv", columnMapping: { date: 0 }, rows: rs });

  await check("overlapping concurrent imports: the second waits, then classifies against the first; no transaction is live twice", async () => {
    await a.query("BEGIN"); await b.query("BEGIN");
    const r1 = await fn(a, "bank_statement_import($1,'prep',$2::jsonb,'t')", [org, importP(rows(1, 10))]);
    const s2 = settle(fn(b, "bank_statement_import($1,'prep',$2::jsonb,'t')", [org, importP(rows(6, 15))]));
    await pause(); assert.equal(s2.done, false, "the overlapping import waits for the first");
    await a.query("COMMIT");
    const r2 = await s2.result; await b.query("COMMIT");
    assert.equal(r1.imported, 10);
    assert.deepEqual([r2.imported, r2.duplicates], [5, 5]);
    const live = (await a.query("SELECT count(*)::int AS n, count(DISTINCT dedupe_key)::int AS d FROM bank_statement_lines WHERE organization_id=$1 AND review_status IN ('active','needs_review')", [org])).rows[0];
    assert.deepEqual([live.n, live.d], [15, 15]);
  });

  await check("crash during an import (backend terminated before commit) leaves nothing; the retry imports once", async () => {
    const victim = await connect();
    const pid = (await victim.query("SELECT pg_backend_pid() AS p")).rows[0].p;
    const p = importP(rows(20, 25));
    await victim.query("BEGIN");
    await fn(victim, "bank_statement_import($1,'prep',$2::jsonb,'t')", [org, p]);
    await a.query("SELECT pg_terminate_backend($1)", [pid]);
    await pause(300);
    assert.equal((await a.query("SELECT count(*)::int AS n FROM bank_statement_lines WHERE organization_id=$1 AND txn_date>=$2", [org, D(2, 20)])).rows[0].n, 0);
    const r = await fn(a, "bank_statement_import($1,'prep',$2::jsonb,'t')", [org, p]);
    assert.equal(r.imported, 6);
    assert.equal((await fn(a, "bank_statement_import($1,'prep',$2::jsonb,'t')", [org, p])).already, true);
  });

  // Ledger entries to match: one posted receipt of 1,000 dated 1 February.
  const receipt = await fn(a, "cash_transaction_create($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), kind: "receipt", bankingAccountId: bank, counterAccountId: acct["4100"], date: D(2, 1), amount: "1000", description: "Deposit 1", reference: "R1" })]);
  await fn(a, "cash_transaction_decide($1,'review',$2::uuid,'approve','',$3,'t')", [org, receipt.id, key()]);
  const jl = (await a.query("SELECT l.id FROM accounting_journal_lines l JOIN cash_transactions t ON t.journal_id=l.journal_id WHERE t.id=$1 AND l.account_id=$2", [receipt.id, acct["1120"]])).rows[0].id;
  const line = async (d) => (await a.query("SELECT id FROM bank_statement_lines WHERE organization_id=$1 AND txn_date=$2 AND review_status='active' LIMIT 1", [org, d])).rows[0].id;

  await check("concurrent matching of the same ledger entry: the second waits and is refused; nothing is matched twice", async () => {
    const m = (client, sid) => fn(client, "bank_match_create($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), bankingAccountId: bank, kind: "match", items: [{ statementLineId: sid, amount: "1000" }, { journalLineId: jl, amount: "1000" }] })]);
    const [s1, s2] = [await line(D(2, 1)), await line(D(2, 2))];
    await a.query("BEGIN"); await b.query("BEGIN");
    await m(a, s1);
    const second = settle(m(b, s2));
    await pause(); assert.equal(second.done, false, "the second matcher waits for the first");
    await a.query("COMMIT");
    const err = await second.result; await b.query("ROLLBACK");
    assert.match(String(err?.message), /match_exceeds_available/);
    assert.equal((await a.query("SELECT coalesce(sum(i.amount),0)::text AS s FROM bank_match_items i JOIN bank_match_groups g ON g.id=i.group_id AND g.status='active' WHERE i.journal_line_id=$1", [jl])).rows[0].s, "1000.00");
  });

  await check("duplicate transfer submitted from both sides at once: exactly one is recorded", async () => {
    const t = (client, from, to) => fn(client, "cash_transaction_create($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), kind: "transfer", bankingAccountId: from, toAccountId: to, date: D(2, 3), amount: "500", description: "Top-up", reference: "T-77" })]);
    await a.query("BEGIN"); await b.query("BEGIN");
    await t(a, bank, petty);
    const second = settle(t(b, petty, bank));
    await pause(); assert.equal(second.done, false);
    await a.query("COMMIT");
    const err = await second.result; await b.query("ROLLBACK");
    assert.match(String(err?.message), /duplicate_transfer/);
    assert.equal((await a.query("SELECT count(*)::int AS n FROM cash_transactions WHERE organization_id=$1 AND kind='transfer'", [org])).rows[0].n, 1);
  });

  await check("the same request retried concurrently (same key) creates one cash transaction and one journal", async () => {
    const p = JSON.stringify({ key: key(), kind: "payment", bankingAccountId: bank, counterAccountId: acct["6200"], date: D(2, 4), amount: "100", description: "Rent", reference: "RENT-1" });
    await a.query("BEGIN"); await b.query("BEGIN");
    await fn(a, "cash_transaction_create($1,'prep',$2::jsonb,'t')", [org, p]);
    const second = settle(fn(b, "cash_transaction_create($1,'prep',$2::jsonb,'t')", [org, p]));
    await pause(); assert.equal(second.done, false);
    await a.query("COMMIT");
    const r = await second.result; await b.query("ROLLBACK");
    assert.ok(r instanceof Error, "the concurrent duplicate fails rather than creating a second record");
    assert.equal((await fn(a, "cash_transaction_create($1,'prep',$2::jsonb,'t')", [org, p])).already, true, "a later retry returns the original");
    assert.equal((await a.query("SELECT count(*)::int AS n FROM accounting_journals WHERE organization_id=$1 AND idempotency_key LIKE 'banking:%' AND description LIKE '%Rent%'", [org])).rows[0].n, 1);
  });

  await check("finalizing a reconciliation while someone matches in that period: the match waits, then is refused", async () => {
    // Make February reconcile: opening balance match is not needed (no ledger before the period); match the
    // remaining statement lines through a statement offset is not possible, so reconcile a fresh account.
    const fb = await fn(a, "finance_account_save($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), method: "bank_transfer", provider: "Second Bank", accountIdentifier: "999888", label: "Second", currency: "UGX", verificationNote: "Synthetic fixture" })]);
    const acc = await fn(a, "accounting_account_save($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), code: "1120-09", name: "Second bank", accountType: "asset", reportingClass: "current_asset", parentId: acct["1100"], currency: "UGX" })]);
    await fn(a, "accounting_chart_approve($1,'review',$2,'t')", [org, key()]);
    const b2 = (await fn(a, "banking_account_register($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), kind: "bank", financeAccountId: fb.id })])).id;
    const mp = await fn(a, "bank_mapping_propose($1,'prep',$2::uuid,$3::uuid,'Second mapping',$4,'t')", [org, b2, acc.id, key()]);
    await fn(a, "bank_mapping_decide($1,'review',$2::uuid,'approve','',$3,'t')", [org, mp.id, key()]);
    const r1 = await fn(a, "cash_transaction_create($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), kind: "receipt", bankingAccountId: b2, counterAccountId: acct["4100"], date: D(3, 2), amount: "700", description: "Fee", reference: "F1" })]);
    await fn(a, "cash_transaction_decide($1,'review',$2::uuid,'approve','',$3,'t')", [org, r1.id, key()]);
    const r2 = await fn(a, "cash_transaction_create($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), kind: "receipt", bankingAccountId: b2, counterAccountId: acct["4100"], date: D(3, 3), amount: "300", description: "Fee 2", reference: "F2" })]);
    await fn(a, "cash_transaction_decide($1,'review',$2::uuid,'approve','',$3,'t')", [org, r2.id, key()]);
    await fn(a, "bank_statement_import($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), bankingAccountId: b2, currency: "UGX", fileName: "m.csv", fileSha256: "c".repeat(64), fileSize: 10, storageKey: "t/m", sourceFormat: "csv", columnMapping: { date: 0 }, rows: [{ row: 2, date: D(3, 2), description: "Fee", reference: "F1", amount: "700" }] })]);
    const sid = (await a.query("SELECT id FROM bank_statement_lines WHERE banking_account_id=$1", [b2])).rows[0].id;
    const ledger = async (tid) => (await a.query("SELECT l.id FROM accounting_journal_lines l JOIN cash_transactions t ON t.journal_id=l.journal_id WHERE t.id=$1 AND l.account_id=$2", [tid, acc.id])).rows[0].id;
    await fn(a, "bank_match_create($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), bankingAccountId: b2, kind: "match", items: [{ statementLineId: sid, amount: "700" }, { journalLineId: await ledger(r1.id), amount: "700" }] })]);
    const rec = await fn(a, "bank_reconciliation_create($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), bankingAccountId: b2, periodStart: D(3, 1), periodEnd: D(3, 31), openingStatementBalance: "0", closingStatementBalance: "700" })]);
    await fn(a, "bank_reconciliation_command($1,'prep',$2::uuid,'submit',1,'',$3,'t')", [org, rec.id, key()]);
    await a.query("BEGIN"); await b.query("BEGIN");
    await fn(a, "bank_reconciliation_command($1,'review',$2::uuid,'finalize',2,'Agreed',$3,'t')", [org, rec.id, key()]);
    const late = settle(fn(b, "bank_match_create($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), bankingAccountId: b2, kind: "ledger_offset", note: "Try to change a finalized period", items: [{ journalLineId: await ledger(r2.id), amount: "300" }] })]));
    await pause(); assert.equal(late.done, false, "matching waits while the period is being finalized");
    await a.query("COMMIT");
    const err = await late.result; await b.query("ROLLBACK");
    assert.match(String(err?.message), /match_in_finalized_period|match_unbalanced/);
    assert.equal((await a.query("SELECT status FROM bank_reconciliations WHERE id=$1", [rec.id])).rows[0].status, "finalized");
    assert.equal((await a.query("SELECT count(*)::int AS n FROM bank_reconciliation_snapshots WHERE reconciliation_id=$1", [rec.id])).rows[0].n, 1);
  });

  await check("ledger integrity after all concurrent activity: posted journals balance; book balance equals ledger lines", async () => {
    const bad = await a.query("SELECT id FROM accounting_journals WHERE organization_id=$1 AND status='posted' AND total_debit<>total_credit", [org]);
    assert.equal(bad.rowCount, 0);
    const book = (await a.query("SELECT banking_book_balance($1,$2,NULL)::text AS v", [org, bank])).rows[0].v;
    const direct = (await a.query("SELECT coalesce(sum(l.debit-l.credit),0)::text AS v FROM accounting_journal_lines l JOIN accounting_journals j ON j.id=l.journal_id AND j.status='posted' WHERE l.organization_id=$1 AND l.account_id=$2", [org, acct["1120"]])).rows[0].v;
    assert.equal(book, direct);
  });
  console.log(`Banking PostgreSQL concurrency checks passed (${passed.length} + migration).`);
} finally { await a.end().catch(() => {}); await b.end().catch(() => {}); }
