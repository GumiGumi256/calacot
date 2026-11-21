// Phase 2B: real PostgreSQL checks for the accounting integration worker, using independent
// connections whose transactions genuinely overlap, and a real backend termination for crashes.
// Usage: echo "<connection string>" | node scripts/verify-accounting-integration-concurrency-postgres.mjs
// Refuses any database not named phase2b_accounting_fixture. Marks ONLY that database as a test
// database (ALTER DATABASE ... SET calacot.accounting_test_database = 'on'), applies the migration
// chain only to an empty database, and uses a random organization id.
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

let input = ""; for await (const chunk of process.stdin) input += chunk;
const url = new URL(input.trim());
if (url.pathname !== "/phase2b_accounting_fixture") throw Error("Refusing non-fixture database");
const connect = async () => { const c = new Client({ connectionString: url.toString() }); await c.connect(); c.on("error", () => {}); return c; };
let a = await connect();
const settle = (p) => { const s = { done: false }; s.result = p.then((v) => { s.done = true; return v; }, (e) => { s.done = true; return e; }); return s; };
const pause = (ms = 700) => new Promise((r) => setTimeout(r, ms));
const passed = [];
const check = async (name, fn) => { await fn(); passed.push(name); console.log("PASS", name); };
try {
  const migrated = await a.query("SELECT 1 FROM information_schema.tables WHERE table_name='accounting_integration_events'");
  if (!migrated.rowCount) {
    const existing = await a.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
    if (existing.rows[0].n) throw Error("Fixture database is not empty and not migrated; refusing");
    const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
    await a.query("BEGIN");
    try { for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await a.query(s); await a.query("COMMIT"); }
    catch (e) { await a.query("ROLLBACK"); throw e; }
    passed.push(`migration chain 0000-${journal.entries.at(-1).tag} applied in one transaction`);
  }
  await a.query("ALTER DATABASE phase2b_accounting_fixture SET calacot.accounting_test_database = 'on'");
  await a.end(); a = await connect();
  let b = await connect();
  assert.equal((await a.query("SELECT accounting_integration_test_database() AS t")).rows[0].t, true);
  const version = (await a.query("SELECT version()")).rows[0].version.split(" ").slice(0, 2).join(" ");
  const org = "phase2b-" + randomUUID();
  const staff = Object.fromEntries(["fin", "acct"].map((n) => [n, randomUUID()]));
  await a.query("INSERT INTO organizations(id,name,legal_name) VALUES($1,'Fixture','Fixture')", [org]);
  for (const [clerk, sid] of Object.entries(staff)) await a.query("INSERT INTO staff_memberships(id,organization_id,clerk_user_id,status) VALUES($1,$2,$3,'active')", [sid, org, clerk]);
  const client = randomUUID(), project = randomUUID();
  await a.query("INSERT INTO clients(id,organization_id,kind,display_name) VALUES($1,$2,'company','Fixture client')", [client, org]);
  await a.query("INSERT INTO projects(id,organization_id,client_id,code,name,division,currency) VALUES($1,$2,$3,'P-1','Fixture','architecture','UGX')", [project, org, client]);
  const fn = async (c, call, params) => (await c.query(`SELECT ${call} AS r`, params)).rows[0].r;
  const today = (await a.query("SELECT finance_kampala_today()::text AS d")).rows[0].d;
  const year = Number(today.slice(0, 4));

  // Fixture ledger: accounts, approved policy, periods, isolated-test stage and one mapping.
  for (const [code, name, type, cls] of [["1200", "Trade receivables", "asset", "current_asset"], ["4100", "Fees", "income", "operating_revenue"]])
    await fn(a, "accounting_account_save($1,'fin',$2::jsonb,'t')", [org, JSON.stringify({ key: randomUUID(), code, name, accountType: type, reportingClass: cls, manualPostingAllowed: code !== "1200" })]);
  await fn(a, "accounting_chart_approve($1,'acct',$2,'t')", [org, randomUUID()]);
  const pol = await fn(a, "accounting_policy_propose($1,'fin',$2::jsonb,'t')", [org, JSON.stringify({ key: randomUUID(), functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: false, note: "Concurrency fixture" })]);
  await fn(a, "accounting_policy_decide($1,'acct',$2,'approve','',$3,'t')", [org, pol.id, randomUUID()]);
  await fn(a, "accounting_period_generate_year($1,'fin',$2,$3,'t')", [org, year, randomUUID()]);
  const st = await fn(a, "accounting_integration_settings_propose($1,'fin',$2::jsonb,'t')", [org, JSON.stringify({ key: randomUUID(), stage: "isolated_test", note: "Concurrency fixture", controlAccounts: { receivables: "1200" } })]);
  await fn(a, "accounting_integration_settings_decide($1,'acct',$2,'approve','',$3,'t')", [org, st.id, randomUUID()]);
  const m = await fn(a, "accounting_mapping_propose($1,'fin',$2::jsonb,'t')", [org, JSON.stringify({ key: randomUUID(), eventType: "invoice_issued", conditions: {}, treatment: "journal", effectiveFrom: `${year}-01-01`, description: "Fixture mapping",
    definition: { lines: [{ side: "debit", account: { code: "1200" }, amount: "total" }, { side: "credit", account: { code: "4100" }, amount: "total" }] } })]);
  await fn(a, "accounting_mapping_decide($1,'acct',$2,'approve','',$3,'t')", [org, m.id, randomUUID()]);

  let numbering = 0;
  const issue = async (c = a, total = "1000") => {
    const id = randomUUID();
    await c.query(`INSERT INTO invoices(id,organization_id,client_id,project_id,number,status,customer_snapshot,issuer_snapshot,currency,subtotal,total,issued_at) VALUES($1,$2,$3,$4,$5,'draft','{}','{}','UGX',$6,$6,now())`, [id, org, client, project, `FX-${++numbering}-${id.slice(0, 6)}`, total]);
    await c.query("UPDATE invoices SET status='issued' WHERE id=$1", [id]);
    return id;
  };
  const processOn = (c, max = 100) => fn(c, "accounting_integration_process($1,'fin',$2,'worker','t')", [org, max]);
  const count = async (sql, params = [org]) => (await a.query(sql, params)).rows[0].n;
  const journals = () => count("SELECT count(*)::int n FROM accounting_journals WHERE organization_id=$1 AND journal_type='system'");

  await check("an uncommitted business transaction is invisible to the worker; its event appears atomically on commit", async () => {
    await b.query("BEGIN");
    const id = await issue(b);
    const r = await processOn(a);
    assert.equal(r.claimed, 0, "the worker cannot see an uncommitted outbox row");
    await b.query("COMMIT");
    const r2 = await processOn(a);
    assert.equal(r2.claimed, 1);
    assert.equal(await count("SELECT count(*)::int n FROM accounting_journals WHERE organization_id=$1 AND source_id=$2", [org, id]), 1);
  });

  await check("overlapping workers claim disjoint events (SKIP LOCKED), wait only on gapless numbering, and post each event once", async () => {
    for (let i = 0; i < 20; i++) await issue();
    const before = await journals();
    await a.query("BEGIN"); await b.query("BEGIN");
    const first = await processOn(a, 10);
    const bPid = (await b.query("SELECT pg_backend_pid() AS p")).rows[0].p;
    const s = settle(processOn(b, 100));
    await pause();
    // Worker B skipped A's ten locked events and claimed the other ten; it then waits for the
    // journal-number counter row, which Phase 2A serializes to keep numbering gapless.
    assert.equal(s.done, false, "B waits while A holds the numbering counter");
    const observer = await connect();
    const aPid = (await a.query("SELECT pg_backend_pid() AS p")).rows[0].p;
    const waiting = (await observer.query("SELECT wait_event_type, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1", [bPid])).rows[0];
    await observer.end();
    assert.equal(waiting.wait_event_type, "Lock");
    assert.deepEqual(waiting.blockers, [aPid], "B is blocked only by A");
    // Which events did B lock? None of A's: B's ten claimed events are already locked by B.
    assert.equal((await a.query("SELECT count(*)::int n FROM accounting_integration_events WHERE organization_id=$1 AND status='pending'", [org])).rows[0].n, 10, "A sees B's ten claims still pending (uncommitted)");
    await a.query("COMMIT");
    const second = await s.result;
    assert.ok(!(second instanceof Error), String(second));
    assert.equal(first.claimed, 10);
    assert.equal(second.claimed, 10, "B claimed only the events A had not locked");
    await b.query("COMMIT");
    assert.equal(await journals(), before + 20);
    assert.equal(await count(`SELECT count(*)::int n FROM (SELECT source_event FROM accounting_journals WHERE organization_id=$1 AND journal_type='system' GROUP BY source_event HAVING count(*)>1) d`), 0, "no duplicate journal per source event");
    const nums = (await a.query("SELECT number FROM accounting_journals WHERE organization_id=$1 AND status='posted' ORDER BY number", [org])).rows.map((r) => Number(r.number.slice(-6)));
    assert.deepEqual(nums, nums.map((_, i) => i + 1), "journal numbering stays gapless across concurrent workers");
  });

  await check("duplicate delivery racing on two connections creates one event", async () => {
    const id = randomUUID();
    await a.query(`INSERT INTO invoices(id,organization_id,client_id,project_id,number,status,customer_snapshot,issuer_snapshot,currency,subtotal,total,issued_at) VALUES($1,$2,$3,$4,$5,'issued','{}','{}','UGX',500,500,now())`, [id, org, client, project, `FX-DUP-${id.slice(0, 6)}`]);
    await a.query("BEGIN"); await b.query("BEGIN");
    // The trigger already captured it on insert; force two explicit re-deliveries in overlapping transactions.
    const r1 = await fn(a, "accounting_capture($1,'invoice_issued',$2,'backfill','isolated_test')", [org, id]);
    const s = settle(fn(b, "accounting_capture($1,'invoice_issued',$2,'backfill','isolated_test')", [org, id]));
    await pause();
    await a.query("COMMIT");
    const r2 = await s.result; await b.query("COMMIT");
    assert.deepEqual([r1, r2], [false, false], "both re-deliveries are no-ops");
    assert.equal(await count("SELECT count(*)::int n FROM accounting_integration_events WHERE organization_id=$1 AND source_id=$2", [org, id]), 1);
    await processOn(a);
  });

  await check("crash before commit: a terminated worker leaves no journal and the event pending; recovery posts it once", async () => {
    const id = await issue();
    const before = await journals();
    await b.query("BEGIN");
    const r = await processOn(b);
    assert.equal(r.claimed, 1);
    const pid = (await b.query("SELECT pg_backend_pid() AS p")).rows[0].p;
    await a.query("SELECT pg_terminate_backend($1)", [pid]);
    await pause(300);
    b = await connect();
    assert.equal(await journals(), before, "nothing from the crashed transaction survived");
    const ev = (await a.query("SELECT status,attempts,journal_id FROM accounting_integration_events WHERE organization_id=$1 AND source_id=$2", [org, id])).rows[0];
    assert.deepEqual([ev.status, ev.attempts, ev.journal_id], ["pending", 0, null]);
    await processOn(b);
    assert.equal(await journals(), before + 1);
  });

  await check("crash after commit (lost acknowledgement): re-running the worker and re-delivering the event post nothing new", async () => {
    const before = await journals();
    const again = await processOn(a);
    assert.equal(again.claimed, 0);
    const bf = await fn(a, "accounting_integration_backfill($1,'fin',$2,'t')", [org, randomUUID()]);
    assert.equal(bf.created, 0);
    assert.equal((await processOn(b)).claimed, 0);
    assert.equal(await journals(), before);
  });

  await check("posting vs period close: the close waits for the in-flight posting; later events are blocked, not backdated", async () => {
    await issue();
    const per = (await a.query("SELECT id,version FROM accounting_periods WHERE organization_id=$1 AND $2::date BETWEEN start_date AND end_date", [org, today])).rows[0];
    await a.query("BEGIN");
    const r = await processOn(a);
    assert.equal(r.claimed, 1);
    const s = settle(fn(b, "accounting_period_command($1,'acct',$2,'close',$3,'Month end',$4,'t')", [org, per.id, per.version, randomUUID()]));
    await pause();
    assert.equal(s.done, false, "close must wait for the posting transaction");
    await a.query("COMMIT");
    const closed = await s.result;
    assert.ok(!(closed instanceof Error), String(closed));
    const late = await issue();
    await processOn(a);
    const ev = (await a.query("SELECT status,last_error_code FROM accounting_integration_events WHERE organization_id=$1 AND source_id=$2", [org, late])).rows[0];
    assert.deepEqual([ev.status, ev.last_error_code], ["blocked", "period_closed"]);
    const tb = (await a.query("SELECT sum(debit)::text d,sum(credit)::text c FROM accounting_trial_balance($1,$2::date)", [org, today])).rows[0];
    assert.equal(tb.d, tb.c, "ledger balanced");
  });

  console.log(`PostgreSQL: ${version}`);
  console.log(`Accounting integration concurrency checks passed (${passed.length}).`);
  await b.end();
} finally {
  await a.end().catch(() => {});
}
