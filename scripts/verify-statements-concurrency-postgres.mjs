// Phase 2E: real PostgreSQL checks with independent connections whose transactions genuinely overlap.
// Synthetic data only. Usage: echo "<connection string>" | npx tsx scripts/verify-statements-concurrency-postgres.mjs
// Refuses any database not named phase2e_statements_fixture and applies the chain only to an empty database.
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chartSeedPayload } from "../lib/accounting/chart.ts";
import { proposeClassification } from "../lib/accounting/statements.ts";

let input = ""; for await (const chunk of process.stdin) input += chunk;
const url = new URL(input.trim());
if (url.pathname !== "/phase2e_statements_fixture") throw Error("Refusing non-fixture database");
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw Error("Refusing a non-local database: fixtures run on a throwaway local PostgreSQL");
const connect = async () => { const c = new Client({ connectionString: url.toString() }); await c.connect(); c.on("error", () => {}); return c; };
const a = await connect(), b = await connect();
const settle = (p) => { const s = { done: false }; s.result = p.then((v) => { s.done = true; return v; }, (e) => { s.done = true; return e; }); return s; };
const pause = (ms = 700) => new Promise((r) => setTimeout(r, ms));
const key = () => randomUUID();
const passed = [];
const check = async (name, fn) => { await fn(); passed.push(name); console.log("PASS", name); };
try {
  if ((await a.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n) throw Error("Fixture database must be empty");
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  await a.query("BEGIN");
  try { for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await a.query(s); await a.query("COMMIT"); }
  catch (e) { await a.query("ROLLBACK"); throw e; }
  console.log(`PASS migration chain 0000-${journal.entries.at(-1).tag} applied in one transaction`);
  const org = `phase2e-${randomUUID()}`;
  const fn = async (client, call, params) => (await client.query(`SELECT ${call} AS r`, params)).rows[0].r;
  await a.query("INSERT INTO organizations(id,name,legal_name) VALUES($1,'Fixture','Fixture')", [org]);
  await a.query("INSERT INTO staff_memberships(organization_id,clerk_user_id,status) VALUES($1,'prep','active'),($1,'review','active'),($1,'third','active')", [org]);
  const Y = Number((await a.query("SELECT finance_kampala_today()::text AS d")).rows[0].d.slice(0, 4)) - 1;
  const D = (m, d, y = Y) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  await fn(a, "accounting_chart_seed($1,'prep',$2::jsonb,$3,'t')", [org, JSON.stringify(chartSeedPayload()), key()]);
  await fn(a, "accounting_chart_approve($1,'review',$2,'t')", [org, key()]);
  const pol = await fn(a, "accounting_policy_propose($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: true, note: "Fixture policy" })]);
  await fn(a, "accounting_policy_decide($1,'review',$2,'approve','ok',$3,'t')", [org, pol.id, key()]);
  await fn(a, "accounting_period_generate_year($1,'prep',$2,$3,'t')", [org, Y, key()]);
  await fn(a, "accounting_period_generate_year($1,'prep',$2,$3,'t')", [org, Y + 1, key()]);
  const accounts = (await a.query("SELECT id,code,account_type,is_contra,is_postable,reporting_class FROM accounting_accounts WHERE organization_id=$1", [org])).rows;
  const acct = Object.fromEntries(accounts.map((r) => [r.code, r.id]));
  const mapping = proposeClassification(accounts.map((x) => ({ id: x.id, code: x.code, accountType: x.account_type, isContra: x.is_contra, isPostable: x.is_postable, reportingClass: x.reporting_class })));
  const cls = await fn(a, "fs_classification_propose($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), mappings: mapping, retainedEarningsAccountId: acct["3200"], note: "Fixture classification" })]);
  await fn(a, "fs_policy_decide($1,'review','classification',$2::uuid,'approve','ok',$3,'t')", [org, cls.id, key()]);
  const cp = await fn(a, "period_close_policy_propose($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), requireBankReconciliation: false, requireCashCount: false, evidenceItems: [], note: "Fixture close policy" })]);
  await fn(a, "fs_policy_decide($1,'review','close_policy',$2::uuid,'approve','ok',$3,'t')", [org, cp.id, key()]);
  const periods = (await a.query("SELECT id,start_date::text AS s,fiscal_year FROM accounting_periods WHERE organization_id=$1 ORDER BY start_date", [org])).rows;
  const P = (fy, n) => periods.filter((p) => p.fiscal_year === fy)[n - 1].id;
  const L = (code, side, amount) => ({ accountId: acct[code], [side]: amount, currency: "UGX" });
  const approved = async (date, lines) => {
    const j = await fn(a, "accounting_journal_save($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), entryDate: date, description: "Synthetic entry", lines })]);
    const s = await fn(a, "accounting_journal_command($1,'prep',$2,'submit',1,'',$3,'t')", [org, j.id, key()]);
    const ap = await fn(a, "accounting_journal_command($1,'review',$2,'approve',$3,'',$4,'t')", [org, j.id, s.version, key()]);
    return { id: j.id, version: ap.version };
  };
  const post = async (date, lines) => { const j = await approved(date, lines); await fn(a, "accounting_journal_command($1,'review',$2,'post',$3,'',$4,'t')", [org, j.id, j.version, key()]); return j.id; };
  const ver = async (cid) => (await a.query("SELECT version FROM period_closes WHERE id=$1", [cid])).rows[0].version;
  const submitted = async (pid) => { const c = await fn(a, "period_close_start($1,'prep',$2::uuid,$3,'t')", [org, pid, key()]); await fn(a, "period_close_command($1,'prep',$2::uuid,'submit',$3,'Ready',$4,'t')", [org, c.id, await ver(c.id), key()]); return c.id; };
  const fees = await post(D(1, 10), [L("1120", "debit", "1000000.00"), L("4100", "credit", "1000000.00")]);

  await check("a posting racing the period close: it waits for the close and is then refused; nothing lands in a closed period", async () => {
    const cid = await submitted(P(Y, 1));
    await a.query("BEGIN"); await b.query("BEGIN");
    await fn(a, "period_close_command($1,'review',$2::uuid,'approve',$3,'ok',$4,'t')", [org, cid, await ver(cid), key()]);
    // A reversal is created and posted in one call, dated in the period being closed.
    const posting = settle(fn(b, "accounting_journal_reverse($1,'third',$2,$3::jsonb,'t')", [org, fees, JSON.stringify({ key: key(), reason: "Racing the close", entryDate: D(1, 30) })]));
    await pause(); assert.equal(posting.done, false, "the posting waits for the close transaction");
    await a.query("COMMIT");
    const err = await posting.result; await b.query("ROLLBACK");
    assert.match(String(err?.message), /period_closed/);
    assert.equal((await a.query("SELECT count(*)::int AS n FROM accounting_journals WHERE reverses_journal_id=$1", [fees])).rows[0].n, 0, "the reversal was rolled back entirely");
  });

  await check("a close approval racing an in-flight posting: the close waits, then re-runs its checks on the committed ledger", async () => {
    const cid = await submitted(P(Y, 2));
    const j = await approved(D(2, 20), [L("6200", "debit", "2000.00"), L("1120", "credit", "2000.00")]);
    // The approved journal would fail the checklist; post it first in an open transaction.
    await b.query("BEGIN"); await a.query("BEGIN");
    await fn(b, "accounting_journal_command($1,'third',$2,'post',$3,'',$4,'t')", [org, j.id, j.version, key()]);
    const closing = settle(fn(a, "period_close_command($1,'review',$2::uuid,'approve',$3,'ok',$4,'t')", [org, cid, await ver(cid), key()]));
    await pause(); assert.equal(closing.done, false, "the close waits for the posting transaction");
    await b.query("COMMIT");
    const r = await closing.result; await a.query("COMMIT");
    assert.ok(!(r instanceof Error), String(r?.message));
    assert.equal((await a.query("SELECT status FROM accounting_periods WHERE id=$1", [P(Y, 2)])).rows[0].status, "closed");
    const checks = (await a.query("SELECT approval_checks FROM period_closes WHERE id=$1", [cid])).rows[0].approval_checks;
    assert.equal(checks.checks.find((x) => x.key === "pending_journals").status, "pass", "the re-run saw the journal as posted");
  });

  await check("two approvers approve the same close at once: one closes the period, the other is refused", async () => {
    const cid = await submitted(P(Y, 3));
    const v = await ver(cid);
    await a.query("BEGIN"); await b.query("BEGIN");
    await fn(a, "period_close_command($1,'review',$2::uuid,'approve',$3,'ok',$4,'t')", [org, cid, v, key()]);
    const second = settle(fn(b, "period_close_command($1,'third',$2::uuid,'approve',$3,'ok',$4,'t')", [org, cid, v, key()]));
    await pause(); assert.equal(second.done, false);
    await a.query("COMMIT");
    const err = await second.result; await b.query("ROLLBACK");
    assert.match(String(err?.message), /stale_period_close|invalid_close_transition/);
    assert.equal((await a.query("SELECT count(*)::int AS n FROM fs_events WHERE entity_id=$1 AND action='approve'", [cid])).rows[0].n, 1);
  });

  await check("two year-end preparations at once: one closing journal, the other refused", async () => {
    for (let n = 4; n <= 11; n++) { const cid = await submitted(P(Y, n)); await fn(a, "period_close_command($1,'review',$2::uuid,'approve',$3,'ok',$4,'t')", [org, cid, await ver(cid), key()]); }
    { const c12 = await fn(a, "period_close_start($1,'prep',$2::uuid,$3,'t')", [org, P(Y, 12), key()]);
      const x = await fn(a, "period_close_exception_raise($1,'prep',$2::uuid,$3::jsonb,'t')", [org, c12.id, JSON.stringify({ key: key(), checkKey: "tax_provision", explanation: "Tax computed externally for this synthetic fixture" })]);
      await fn(a, "period_close_exception_decide($1,'review',$2::uuid,'approve','Accepted',$3,'t')", [org, x.id, key()]);
      await fn(a, "period_close_command($1,'prep',$2::uuid,'submit',$3,'Ready',$4,'t')", [org, c12.id, await ver(c12.id), key()]); }
    const set = await fn(a, "fs_statement_set_create($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), kind: "year", periodStart: D(1, 1), periodEnd: D(12, 31) })]);
    await fn(a, "fs_statement_set_decide($1,'review',$2::uuid,'approve','ok',$3,'t')", [org, set.id, key()]);
    await a.query("BEGIN"); await b.query("BEGIN");
    await fn(a, "year_end_prepare($1,'prep',$2,$3::jsonb,'t')", [org, Y, JSON.stringify({ key: key(), statementSetId: set.id })]);
    const second = settle(fn(b, "year_end_prepare($1,'third',$2,$3::jsonb,'t')", [org, Y, JSON.stringify({ key: key(), statementSetId: set.id })]));
    await pause(); assert.equal(second.done, false);
    await a.query("COMMIT");
    const err = await second.result; await b.query("ROLLBACK");
    assert.match(String(err?.message), /year_end_exists/);
    assert.equal((await a.query("SELECT count(*)::int AS n FROM accounting_journals WHERE organization_id=$1 AND idempotency_key LIKE 'ye:%' AND idempotency_key NOT LIKE '%:%:%'", [org])).rows[0].n, 1);
  });

  await check("two approvers approve the year-end at once: retained earnings receive the result exactly once", async () => {
    const y = (await a.query("SELECT id FROM year_end_closes WHERE organization_id=$1 AND status='prepared'", [org])).rows[0].id;
    await a.query("BEGIN"); await b.query("BEGIN");
    await fn(a, "year_end_decide($1,'review',$2::uuid,'approve','ok',$3,'t')", [org, y, key()]);
    const second = settle(fn(b, "year_end_decide($1,'third',$2::uuid,'approve','ok',$3,'t')", [org, y, key()]));
    await pause(); assert.equal(second.done, false);
    await a.query("COMMIT");
    const err = await second.result; await b.query("ROLLBACK");
    assert.match(String(err?.message), /year_end_unavailable/);
    const re = (await a.query("SELECT coalesce(sum(l.functional_credit-l.functional_debit),0)::text AS v FROM accounting_journal_lines l JOIN accounting_journals j ON j.id=l.journal_id AND j.status='posted' WHERE l.organization_id=$1 AND l.account_id=$2", [org, acct["3200"]])).rows[0].v;
    assert.equal(re, "998000.00", "1,000,000 revenue less 2,000 rent, once");
    assert.equal((await a.query("SELECT status FROM accounting_periods WHERE id=$1", [P(Y, 12)])).rows[0].status, "closed");
  });

  await check("statement approval racing a posting: the approval waits, then refuses the now-stale snapshot", async () => {
    const set = await fn(a, "fs_statement_set_create($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), kind: "month", periodStart: D(1, 1, Y + 1), periodEnd: D(1, 31, Y + 1) })]);
    const j = await approved(D(1, 15, Y + 1), [L("1120", "debit", "700.00"), L("4100", "credit", "700.00")]);
    await b.query("BEGIN"); await a.query("BEGIN");
    await fn(b, "accounting_journal_command($1,'third',$2,'post',$3,'',$4,'t')", [org, j.id, j.version, key()]);
    const approval = settle(fn(a, "fs_statement_set_decide($1,'review',$2::uuid,'approve','ok',$3,'t')", [org, set.id, key()]));
    await pause(); assert.equal(approval.done, false, "the approval waits for the posting transaction");
    await b.query("COMMIT");
    const err = await approval.result; await a.query("ROLLBACK");
    assert.match(String(err?.message), /statements_stale/);
    assert.equal((await a.query("SELECT status FROM fs_statement_sets WHERE id=$1", [set.id])).rows[0].status, "draft");
  });

  await check("two scheduled reversals of one adjustment at once: one reversal journal", async () => {
    const adj = await fn(a, "fs_adjustment_create($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), kind: "accrual", entryDate: D(1, 31, Y + 1), description: "Accrual", reason: "Fee for January not yet invoiced",
      evidenceReference: "EL-9", autoReverseOn: D(2, 1, Y + 1), lines: [L("6600", "debit", "500.00"), L("2120", "credit", "500.00")] })]);
    const v = (await a.query("SELECT version FROM accounting_journals WHERE id=$1", [adj.journalId])).rows[0].version;
    const ap = await fn(a, "fs_adjustment_command($1,'review',$2::uuid,'approve',$3,'',$4,'t')", [org, adj.id, v, key()]);
    await fn(a, "fs_adjustment_command($1,'review',$2::uuid,'post',$3,'',$4,'t')", [org, adj.id, ap.version, key()]);
    await a.query("BEGIN"); await b.query("BEGIN");
    await fn(a, "fs_adjustment_reverse($1,'prep',$2::uuid,$3,'t')", [org, adj.id, key()]);
    const second = settle(fn(b, "fs_adjustment_reverse($1,'third',$2::uuid,$3,'t')", [org, adj.id, key()]));
    await pause(); assert.equal(second.done, false);
    await a.query("COMMIT");
    const err = await second.result; await b.query("ROLLBACK");
    assert.match(String(err?.message), /journal_already_reversed/);
    assert.equal((await a.query("SELECT count(*)::int AS n FROM accounting_journals WHERE reverses_journal_id=$1", [adj.journalId])).rows[0].n, 1);
  });

  console.log(`\nAll ${passed.length} Phase 2E PostgreSQL concurrency checks passed.`);
} finally {
  await a.end().catch(() => {}); await b.end().catch(() => {});
}
