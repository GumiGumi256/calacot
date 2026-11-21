// Phase 2A: real PostgreSQL concurrency checks for the accounting engine, using two independent
// connections whose transactions genuinely overlap (transaction A is held open while B runs, and
// the script asserts that B is actually blocked before A commits).
// Usage: echo "<connection string>" | node scripts/verify-accounting-concurrency-postgres.mjs
// Refuses any database not named phase2a_accounting_fixture. Applies the migration chain only to
// an empty database, then uses a random organization id, so it never touches existing records.
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

let input = ""; for await (const chunk of process.stdin) input += chunk;
const url = new URL(input.trim());
if (url.pathname !== "/phase2a_accounting_fixture") throw Error("Refusing non-fixture database");
const a = new Client({ connectionString: url.toString() }), b = new Client({ connectionString: url.toString() });
await a.connect(); await b.connect();
const settle = (p) => { const s = { done: false }; s.result = p.then((v) => { s.done = true; return v; }, (e) => { s.done = true; return e; }); return s; };
const pause = () => new Promise((r) => setTimeout(r, 700));
const passed = [];
try {
  const migrated = await a.query("SELECT 1 FROM information_schema.tables WHERE table_name='accounting_journals'");
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
  const org = "phase2a-" + randomUUID();
  const staff = Object.fromEntries(["prep", "appr", "acct", "prep2"].map((n) => [n, randomUUID()]));
  await a.query("INSERT INTO organizations(id,name,legal_name) VALUES($1,'Fixture','Fixture')", [org]);
  for (const [clerk, sid] of Object.entries(staff)) await a.query("INSERT INTO staff_memberships(id,organization_id,clerk_user_id,status) VALUES($1,$2,$3,'active')", [sid, org, clerk]);
  const fn = async (c, call, params) => (await c.query(`SELECT ${call} AS r`, params)).rows[0].r;
  const today = (await a.query("SELECT finance_kampala_today()::text AS d")).rows[0].d;
  const year = Number(today.slice(0, 4));

  // Fixture: two accounts, approved policy with posting enabled, one year of periods.
  const acct = async (code, name, type, cls) => (await fn(a, "accounting_account_save($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: randomUUID(), code, name, accountType: type, reportingClass: cls })])).id;
  const cash = await acct("1110", "Cash", "asset", "current_asset"), capital = await acct("3100", "Capital", "equity", "equity"), rent = await acct("6200", "Rent", "operating_expense", "operating_expense");
  await fn(a, "accounting_chart_approve($1,'appr',$2,'t')", [org, randomUUID()]);
  const pol = await fn(a, "accounting_policy_propose($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: randomUUID(), functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: true, note: "Concurrency fixture" })]);
  await fn(a, "accounting_policy_decide($1,'acct',$2,'approve','',$3,'t')", [org, pol.id, randomUUID()]);
  await fn(a, "accounting_period_generate_year($1,'prep',$2,$3,'t')", [org, year, randomUUID()]);
  const lines = (amount, dr = cash, cr = capital) => [{ accountId: dr, debit: amount, credit: "", currency: "UGX" }, { accountId: cr, debit: "", credit: amount, currency: "UGX" }];
  const save = (c, k, amount = "100", date = today) => fn(c, "accounting_journal_save($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: k, entryDate: date, description: "Concurrency fixture", lines: lines(amount) })]);
  const cmd = (c, actor, id, command, v, note = "") => fn(c, "accounting_journal_command($1,$2,$3,$4,$5,$6,$7,'t')", [org, actor, id, command, v, note, randomUUID()]);
  const approvedJournal = async (amount = "100", date = today, dr = cash, cr = capital) => {
    const j = await fn(a, "accounting_journal_save($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: randomUUID(), entryDate: date, description: "Concurrency fixture", lines: lines(amount, dr, cr) })]);
    await cmd(a, "prep", j.id, "submit", 1); await cmd(a, "appr", j.id, "approve", 2);
    return j.id;
  };
  const overlap = async (first, second, check, name, expectBlock = true) => {
    await a.query("BEGIN"); await b.query("BEGIN");
    const firstResult = await first(a).then((v) => v, (e) => e);
    const s = settle(second(b));
    await pause();
    if (expectBlock) assert.equal(s.done, false, `${name}: second transaction must block while the first is open`);
    await a.query(firstResult instanceof Error ? "ROLLBACK" : "COMMIT");
    const result = await s.result;
    await b.query(result instanceof Error ? "ROLLBACK" : "COMMIT");
    await check(result, firstResult);
    passed.push(name);
  };

  // 1. Same idempotency key creating a journal from two connections: one journal.
  const k1 = randomUUID();
  await overlap((c) => save(c, k1), (c) => save(c, k1), async (r) => {
    assert.equal(r.already, true, String(r));
    assert.equal((await a.query("SELECT count(*)::int n FROM accounting_journals WHERE organization_id=$1 AND idempotency_key=$2", [org, k1])).rows[0].n, 1);
  }, "same-key journal creation from two connections creates one journal");

  // 2. The same approved journal posted twice concurrently: posted once, numbered once.
  const j2 = await approvedJournal();
  await overlap((c) => cmd(c, "appr", j2, "post", 3), (c) => cmd(c, "acct", j2, "post", 3), async (r, f) => {
    assert.equal(f.status, "posted");
    assert.match(String(r?.message), /journal_already_posted/);
    const row = (await a.query("SELECT status,number FROM accounting_journals WHERE id=$1", [j2])).rows[0];
    assert.equal(row.number, f.number);
  }, "double posting of one journal: one posting, second refused after waiting");

  // 3. Two different journals posted concurrently: second waits on the counter; numbers gapless.
  const j3a = await approvedJournal("10"), j3b = await approvedJournal("20");
  await overlap((c) => cmd(c, "appr", j3a, "post", 3), (c) => cmd(c, "appr", j3b, "post", 3), async (r, f) => {
    const n1 = Number(String(f.number).slice(-6)), n2 = Number(String(r.number).slice(-6));
    assert.equal(n2, n1 + 1, `sequential numbers ${f.number} then ${r.number}`);
    const all = (await a.query("SELECT number FROM accounting_journals WHERE organization_id=$1 AND status='posted' ORDER BY number", [org])).rows.map((x) => Number(x.number.slice(-6)));
    assert.deepEqual(all, all.map((_, i) => i + 1), "gapless");
  }, "concurrent postings of different journals are serialized and gapless");

  // 4. A failed posting releases its number (rolled back with the transaction).
  const j4 = await approvedJournal("30");
  await a.query("BEGIN");
  await cmd(a, "appr", j4, "post", 3);
  await a.query("ROLLBACK");
  const r4 = await cmd(a, "appr", j4, "post", 3);
  const expected = (await a.query("SELECT count(*)::int n FROM accounting_journals WHERE organization_id=$1 AND status='posted'", [org])).rows[0].n;
  assert.equal(Number(String(r4.number).slice(-6)), expected, "rolled-back posting did not consume a number");
  passed.push("rolled-back posting leaves no gap in numbering");

  // 5. Posting holds the period: a concurrent close waits, then closes over the posted entry.
  const lastMonth = new Date(Date.UTC(year, 0, 15)).toISOString().slice(0, 10);
  const j5 = await approvedJournal("40", lastMonth);
  const period = (await a.query("SELECT id,version FROM accounting_periods WHERE organization_id=$1 AND $2::date BETWEEN start_date AND end_date", [org, lastMonth])).rows[0];
  await overlap((c) => cmd(c, "appr", j5, "post", 3), (c) => fn(c, "accounting_period_command($1,'acct',$2,'close',$3,'',$4,'t')", [org, period.id, period.version, randomUUID()]), async (r, f) => {
    assert.equal(f.status, "posted");
    assert.equal(r.status, "closed", String(r));
  }, "posting vs period close: close waits for the posting, then closes");

  // 6. Close holds the period: a reversal dated inside it waits, then is refused.
  await overlap(
    async (c) => { await fn(c, "accounting_period_command($1,'acct',$2,'reopen',$3,'Adjustment needed',$4,'t')", [org, period.id, period.version + 1, randomUUID()]); return fn(c, "accounting_period_command($1,'acct',$2,'close',$3,'',$4,'t')", [org, period.id, period.version + 2, randomUUID()]); },
    (c) => fn(c, "accounting_journal_reverse($1,'acct',$2,$3::jsonb,'t')", [org, j5, JSON.stringify({ key: randomUUID(), reason: "Racing the close", entryDate: lastMonth })]),
    async (r) => {
      assert.match(String(r?.message), /period_closed/);
      assert.equal((await a.query("SELECT count(*)::int n FROM accounting_journals WHERE reverses_journal_id=$1", [j5])).rows[0].n, 0);
    }, "period close vs reversal into it: reversal waits, then is refused");

  // 7. Two different reversals of the same journal: exactly one.
  await overlap(
    (c) => fn(c, "accounting_journal_reverse($1,'acct',$2,$3::jsonb,'t')", [org, j2, JSON.stringify({ key: randomUUID(), reason: "First reversal" })]),
    (c) => fn(c, "accounting_journal_reverse($1,'appr',$2,$3::jsonb,'t')", [org, j2, JSON.stringify({ key: randomUUID(), reason: "Second reversal" })]),
    async (r) => {
      assert.match(String(r?.message), /journal_already_reversed/);
      assert.equal((await a.query("SELECT count(*)::int n FROM accounting_journals WHERE reverses_journal_id=$1", [j2])).rows[0].n, 1);
    }, "concurrent reversals of one journal: one reversal");

  // 8. A line written directly while the journal is being posted: blocked, then refused.
  const j8 = await approvedJournal("50");
  await a.query("UPDATE accounting_journals SET status='draft',approved_by_id=NULL,approved_at=NULL,approved_version=NULL WHERE id=$1", [j8]);
  await cmd(a, "prep", j8, "submit", 3); await cmd(a, "appr", j8, "approve", 4);
  await overlap((c) => cmd(c, "appr", j8, "post", 5),
    (c) => c.query("INSERT INTO accounting_journal_lines(organization_id,journal_id,line_number,account_id,currency,debit,credit,functional_debit,functional_credit) VALUES($1,$2,9,$3,'UGX',1,0,1,0)", [org, j8, cash]),
    async (r) => {
      assert.match(String(r?.message), /journal_lines_locked/);
      assert.equal((await a.query("SELECT count(*)::int n FROM accounting_journal_lines WHERE journal_id=$1", [j8])).rows[0].n, 2);
    }, "line insertion racing a posting: waits, then refused");

  // 9. Approve vs return by two reviewers: one decision, the other is stale.
  const j9 = await fn(a, "accounting_journal_save($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: randomUUID(), entryDate: today, description: "Review race", lines: lines("60") })]);
  await cmd(a, "prep", j9.id, "submit", 1);
  await overlap((c) => cmd(c, "appr", j9.id, "approve", 2), (c) => cmd(c, "acct", j9.id, "return", 2, "Needs a receipt"), async (r) => {
    assert.match(String(r?.message), /stale_journal/);
    assert.equal((await a.query("SELECT status FROM accounting_journals WHERE id=$1", [j9.id])).rows[0].status, "approved");
  }, "approve vs return race: one decision, the other refused as stale");

  // 10. Posting vs deactivation of an account it uses: the deactivation waits, then sees the balance.
  const j10 = await approvedJournal("70", today, rent, cash);
  const rentVersion = (await a.query("SELECT version FROM accounting_accounts WHERE id=$1", [rent])).rows[0].version;
  await overlap((c) => cmd(c, "appr", j10, "post", 3), (c) => fn(c, "accounting_account_command($1,'acct',$2,'deactivate',$3,'Racing a posting',$4,'t')", [org, rent, rentVersion, randomUUID()]), async (r) => {
    assert.match(String(r?.message), /account_has_balance/);
    assert.equal((await a.query("SELECT status FROM accounting_accounts WHERE id=$1", [rent])).rows[0].status, "active");
  }, "posting vs account deactivation: deactivation waits, then refused (balance)");

  // 11. Deactivating an unrelated account while posting: neither waits for the other.
  const other = await acct("6300", "Marketing", "operating_expense", "operating_expense");
  await fn(a, "accounting_account_command($1,'appr',$2,'activate',1,'',$3,'t')", [org, other, randomUUID()]);
  const j11 = await approvedJournal("80", today, rent, cash);
  await overlap(
    (c) => fn(c, "accounting_account_command($1,'acct',$2,'deactivate',2,'Unused account',$3,'t')", [org, other, randomUUID()]),
    (c) => cmd(c, "appr", j11, "post", 3),
    async (r, f) => {
      assert.equal(f.status, "inactive", String(f));
      assert.equal(r.status, "posted", String(r));
    }, "deactivating an unrelated account does not block posting", false);
  // A used account cannot be deactivated while a journal using it awaits posting.
  const j11b = await approvedJournal("90", today, other === rent ? cash : rent, cash);
  const rv = (await a.query("SELECT version FROM accounting_accounts WHERE id=$1", [rent])).rows[0].version;
  await assert.rejects(fn(a, "accounting_account_command($1,'acct',$2,'deactivate',$3,'Pending journal',$4,'t')", [org, rent, rv, randomUUID()]), /account_in_pending_journals|account_has_balance/);
  await cmd(a, "appr", j11b, "post", 3);

  const tb = (await a.query("SELECT coalesce(sum(debit),0)::text d,coalesce(sum(credit),0)::text c FROM accounting_trial_balance($1,$2::date)", [org, `${year}-12-31`])).rows[0];
  assert.equal(tb.d, tb.c, "trial balance still balances after all races");
  passed.push("trial balance balances after every race");
  console.log(`PostgreSQL ${version}`);
  console.log(passed.map((p) => `PASS ${p}`).join("\n"));
  console.log(`Accounting concurrency checks passed (${passed.length}).`);
} finally {
  await a.end(); await b.end();
}
