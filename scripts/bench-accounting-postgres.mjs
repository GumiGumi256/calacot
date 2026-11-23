// Phase 2F performance and migration rehearsal on a throwaway PostgreSQL database with representative
// volumes. Synthetic data only. Usage: echo "<connection string>" | npx tsx scripts/bench-accounting-postgres.mjs [journals]
// Refuses any database not named phase2f_bench_fixture and requires it to be empty.
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chartSeedPayload } from "../lib/accounting/chart.ts";
import { proposeClassification } from "../lib/accounting/statements.ts";

let input = ""; for await (const chunk of process.stdin) input += chunk;
const url = new URL(input.trim());
if (url.pathname !== "/phase2f_bench_fixture") throw Error("Refusing non-fixture database");
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw Error("Refusing a non-local database: fixtures run on a throwaway local PostgreSQL");
const N = Number(process.argv[2] ?? 20000);
const connect = async () => { const c = new Client({ connectionString: url.toString() }); await c.connect(); return c; };
const a = await connect();
const key = () => randomUUID();
const fn = async (client, call, params) => (await client.query(`SELECT ${call} AS r`, params)).rows[0].r;
const time = async (label, f, runs = 3) => { const t = []; let r; for (let i = 0; i < runs; i++) { const s = performance.now(); r = await f(); t.push(performance.now() - s); } t.sort((x, y) => x - y); results[label] = { medianMs: +t[Math.floor(t.length / 2)].toFixed(1), runs }; console.log(label.padEnd(58), `${results[label].medianMs} ms`); return r; };
const results = {};
try {
  if ((await a.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n) throw Error("Fixture database must be empty");
  // Migration rehearsal: the whole active chain in one transaction, timed per migration.
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  const perMigration = {};
  const m0 = performance.now();
  await a.query("BEGIN");
  for (const e of journal.entries) { const s = performance.now(); for (const st of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (st.trim()) await a.query(st); perMigration[e.tag] = +(performance.now() - s).toFixed(1); }
  await a.query("COMMIT");
  results.migrationChainMs = +(performance.now() - m0).toFixed(1);
  results.migrationsMs = Object.fromEntries(Object.entries(perMigration).filter(([k]) => k >= "0018"));
  console.log("migration chain (all", journal.entries.length, "migrations)".padEnd(30), results.migrationChainMs, "ms");

  const org = `bench-${randomUUID()}`;
  await a.query("INSERT INTO organizations(id,name,legal_name) VALUES($1,'Bench','Bench')", [org]);
  await a.query("INSERT INTO staff_memberships(organization_id,clerk_user_id,status) VALUES($1,'prep','active'),($1,'review','active')", [org]);
  const Y = Number((await a.query("SELECT finance_kampala_today()::text AS d")).rows[0].d.slice(0, 4)) - 1;
  await fn(a, "accounting_chart_seed($1,'prep',$2::jsonb,$3,'t')", [org, JSON.stringify(chartSeedPayload()), key()]);
  await fn(a, "accounting_chart_approve($1,'review',$2,'t')", [org, key()]);
  const pol = await fn(a, "accounting_policy_propose($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: true, note: "Bench" })]);
  await fn(a, "accounting_policy_decide($1,'review',$2,'approve','ok',$3,'t')", [org, pol.id, key()]);
  await fn(a, "accounting_period_generate_year($1,'prep',$2,$3,'t')", [org, Y, key()]);
  await fn(a, "accounting_period_generate_year($1,'prep',$2,$3,'t')", [org, Y + 1, key()]);
  const accts = (await a.query("SELECT id,code,account_type,is_contra,is_postable,reporting_class FROM accounting_accounts WHERE organization_id=$1", [org])).rows;
  const id = Object.fromEntries(accts.map((x) => [x.code, x.id]));
  const mapping = proposeClassification(accts.map((x) => ({ id: x.id, code: x.code, accountType: x.account_type, isContra: x.is_contra, isPostable: x.is_postable, reportingClass: x.reporting_class })));
  const cls = await fn(a, "fs_classification_propose($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), mappings: mapping, retainedEarningsAccountId: id["3200"], note: "Bench" })]);
  await fn(a, "fs_policy_decide($1,'review','classification',$2::uuid,'approve','ok',$3,'t')", [org, cls.id, key()]);

  // Bulk load: N posted journals across the year through the real posting gate (draft insert, lines,
  // then the guarded transition to posted), in batches of 500 per transaction.
  const pairs = [["1120", "4100"], ["1120", "4200"], ["5100", "1120"], ["6100", "1120"], ["6200", "2120"], ["2120", "1120"], ["1110", "1120"], ["6700", "1110"], ["1540", "2120"], ["6600", "2120"]];
  const divisions = ["estates", "architecture", "painting", "interiors", "tech"];
  const prepId = (await a.query("SELECT id FROM staff_memberships WHERE organization_id=$1 AND clerk_user_id='prep'", [org])).rows[0].id;
  const reviewId = (await a.query("SELECT id FROM staff_memberships WHERE organization_id=$1 AND clerk_user_id='review'", [org])).rows[0].id;
  const l0 = performance.now();
  for (let b = 0; b < N; b += 500) {
    await a.query("BEGIN");
    for (let i = b; i < Math.min(N, b + 500); i++) {
      const [dr, cr] = pairs[i % pairs.length];
      const day = 1 + (i % 365);
      const date = new Date(Date.UTC(Y, 0, day)).toISOString().slice(0, 10);
      const amt = (1000 + (i * 7919) % 900000).toFixed(2);
      const div = divisions[i % 5];
      const j = (await a.query("INSERT INTO accounting_journals(organization_id,journal_type,status,entry_date,description,prepared_by_id,idempotency_key) VALUES($1,'manual','draft',$2,'Bench entry',$3,$4) RETURNING id", [org, date, prepId, key()])).rows[0].id;
      await a.query(`INSERT INTO accounting_journal_lines(organization_id,journal_id,line_number,account_id,currency,debit,credit,exchange_rate,functional_debit,functional_credit,division)
        VALUES ($1,$2,1,$3,'UGX',$5,0,1,$5,0,$6),($1,$2,2,$4,'UGX',0,$5,1,0,$5,$6)`, [org, j, id[dr], id[cr], amt, dr >= "4" || cr >= "4" ? div : null]);
      await a.query("UPDATE accounting_journals SET status='submitted',submitted_by_id=$3,submitted_at=now(),version=2 WHERE organization_id=$1 AND id=$2", [org, j, prepId]);
      await a.query("UPDATE accounting_journals SET status='approved',approved_by_id=$3,approved_at=now(),approved_version=3,reviewed_by_id=$3,reviewed_at=now(),version=3 WHERE organization_id=$1 AND id=$2", [org, j, reviewId]);
      await a.query("UPDATE accounting_journals SET status='posted',posted_by_id=$3,posted_at=now(),version=4 WHERE organization_id=$1 AND id=$2", [org, j, reviewId]);
    }
    await a.query("COMMIT");
  }
  results.bulkLoad = { journals: N, lines: N * 2, ms: +(performance.now() - l0).toFixed(0), perJournalMs: +((performance.now() - l0) / N).toFixed(2) };
  console.log(`loaded ${N} posted journals in ${results.bulkLoad.ms} ms (${results.bulkLoad.perJournalMs} ms each, through the posting gate)`);
  await a.query("ANALYZE");

  const s = `${Y}-01-01`, e = `${Y}-12-31`, ms = `${Y}-06-01`, me = `${Y}-06-30`;
  await time("trial balance, full year", () => fn(a, "fs_trial_balance($1,$2::date,$3::date)", [org, s, e]));
  await time("income statement, full year", () => fn(a, "fs_income_statement($1,$2::date,$3::date)", [org, s, e]));
  await time("income statement, one month", () => fn(a, "fs_income_statement($1,$2::date,$3::date)", [org, ms, me]));
  await time("income statement, one division, full year", () => fn(a, "fs_income_statement($1,$2::date,$3::date,'architecture',NULL)", [org, s, e]));
  await time("balance sheet at year end", () => fn(a, "fs_balance_sheet($1,$2::date)", [org, e]));
  await time("cash flow, full year", () => fn(a, "fs_cash_flow($1,$2::date,$3::date)", [org, s, e]));
  await time("changes in equity, full year", () => fn(a, "fs_equity_changes($1,$2::date,$3::date)", [org, s, e]));
  await time("division report, full year", () => fn(a, "fs_division_report($1,$2::date,$3::date)", [org, s, e]));
  await time("ledger fingerprint at year end", () => fn(a, "fs_ledger_fingerprint($1,$2::date)", [org, e]));
  await time("statement set (all statements + comparative)", () => fn(a, "fs_statement_payload($1,$2::date,$3::date,$4::date,$5::date)", [org, ms, me, `${Y}-05-01`, `${Y}-05-31`]));
  const p6 = (await a.query("SELECT id FROM accounting_periods WHERE organization_id=$1 AND start_date=$2", [org, ms])).rows[0].id;
  await time("period close checklist (one month)", () => fn(a, "period_close_checks($1,$2::uuid)", [org, p6]));
  await time("general ledger page (100 lines, one account, running balance)", () => a.query(`SELECT * FROM (SELECT j.number,(sum(l.functional_debit-l.functional_credit) OVER (ORDER BY j.entry_date,j.number,l.line_number)) AS running,row_number() OVER (ORDER BY j.entry_date,j.number,l.line_number) AS rn
    FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id AND j.status='posted' WHERE l.organization_id=$1 AND l.account_id=$2 AND j.entry_date BETWEEN $3 AND $4) x WHERE rn>5000 ORDER BY rn LIMIT 100`, [org, id["1120"], s, e]));

  // Trigger overhead: posting with the Phase 2E control triggers enabled versus disabled.
  const postOne = async (client) => {
    const j = (await client.query("INSERT INTO accounting_journals(organization_id,journal_type,status,entry_date,description,prepared_by_id,idempotency_key) VALUES($1,'manual','draft',$2,'Overhead probe',$3,$4) RETURNING id", [org, `${Y + 1}-02-10`, prepId, key()])).rows[0].id;
    await client.query(`INSERT INTO accounting_journal_lines(organization_id,journal_id,line_number,account_id,currency,debit,credit,exchange_rate,functional_debit,functional_credit) VALUES ($1,$2,1,$3,'UGX',10,0,1,10,0),($1,$2,2,$4,'UGX',0,10,1,0,10)`, [org, j, id["6200"], id["1120"]]);
    await client.query("UPDATE accounting_journals SET status='submitted',submitted_by_id=$3,submitted_at=now(),version=2 WHERE organization_id=$1 AND id=$2", [org, j, prepId]);
    await client.query("UPDATE accounting_journals SET status='approved',approved_by_id=$3,approved_at=now(),approved_version=3,reviewed_by_id=$3,reviewed_at=now(),version=3 WHERE organization_id=$1 AND id=$2", [org, j, reviewId]);
    await client.query("UPDATE accounting_journals SET status='posted',posted_by_id=$3,posted_at=now(),version=4 WHERE organization_id=$1 AND id=$2", [org, j, reviewId]);
  };
  const probe = async () => { const t = performance.now(); await a.query("BEGIN"); for (let i = 0; i < 300; i++) await postOne(a); await a.query("COMMIT"); return (performance.now() - t) / 300; };
  const withTriggers = await probe();
  await a.query("ALTER TABLE accounting_journals DISABLE TRIGGER accounting_journals_year_end_control");
  const without = await probe();
  await a.query("ALTER TABLE accounting_journals ENABLE TRIGGER accounting_journals_year_end_control");
  results.triggerOverhead = { postWithMs: +withTriggers.toFixed(3), postWithoutMs: +without.toFixed(3), overheadMsPerJournal: +(withTriggers - without).toFixed(3) };
  console.log("year-end control trigger overhead per posted journal", results.triggerOverhead);

  // Posting concurrency and lock contention: 8 connections posting into the same open period.
  const clients = await Promise.all(Array.from({ length: 8 }, connect));
  const c0 = performance.now();
  const lat = [];
  await Promise.all(clients.map(async (c) => { for (let i = 0; i < 100; i++) { const t = performance.now(); await c.query("BEGIN"); await postOne(c); await c.query("COMMIT"); lat.push(performance.now() - t); } }));
  lat.sort((x, y) => x - y);
  results.concurrentPosting = { connections: 8, journals: 800, totalMs: +(performance.now() - c0).toFixed(0), throughputPerSec: +(800 / ((performance.now() - c0) / 1000)).toFixed(0), p50Ms: +lat[400].toFixed(1), p95Ms: +lat[760].toFixed(1), maxMs: +lat[799].toFixed(1) };
  console.log("concurrent posting", results.concurrentPosting);
  // A period close approval while 8 connections post into the period: how long postings wait.
  const cp = await fn(a, "period_close_policy_propose($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), requireBankReconciliation: false, requireCashCount: false, evidenceItems: [], note: "Bench" })]);
  await fn(a, "fs_policy_decide($1,'review','close_policy',$2::uuid,'approve','ok',$3,'t')", [org, cp.id, key()]);
  const janNext = (await a.query("SELECT id FROM accounting_periods WHERE organization_id=$1 AND start_date=$2", [org, `${Y}-01-01`])).rows[0].id;
  const cl = await fn(a, "period_close_start($1,'prep',$2::uuid,$3,'t')", [org, janNext, key()]);
  const v = async () => (await a.query("SELECT version FROM period_closes WHERE id=$1", [cl.id])).rows[0].version;
  await fn(a, "period_close_command($1,'prep',$2::uuid,'submit',$3,'Ready',$4,'t')", [org, cl.id, await v(), key()]);
  const blocked = [];
  const posting = Promise.all(clients.map(async (c) => { for (let i = 0; i < 20; i++) { const t = performance.now(); await c.query("BEGIN"); await postOne(c); await c.query("COMMIT"); blocked.push(performance.now() - t); } }));
  const tApprove = performance.now();
  await fn(a, "period_close_command($1,'review',$2::uuid,'approve',$3,'ok',$4,'t')", [org, cl.id, await v(), key()]);
  results.periodCloseApprovalMs = +(performance.now() - tApprove).toFixed(1);
  await posting;
  blocked.sort((x, y) => x - y);
  results.postingDuringClose = { journals: blocked.length, p50Ms: +blocked[Math.floor(blocked.length / 2)].toFixed(1), maxMs: +blocked.at(-1).toFixed(1) };
  console.log("period close approval (re-runs the checklist, closes the period)", results.periodCloseApprovalMs, "ms; postings into another period meanwhile", results.postingDuringClose);
  await Promise.all(clients.map((c) => c.end()));

  results.volume = (await a.query("SELECT (SELECT count(*) FROM accounting_journals)::int AS journals,(SELECT count(*) FROM accounting_journal_lines)::int AS lines,pg_size_pretty(pg_total_relation_size('accounting_journal_lines')) AS lines_size")).rows[0];
  await mkdir("tmp", { recursive: true });
  await writeFile("tmp/bench-results.json", JSON.stringify(results, null, 2));
  console.log("written tmp/bench-results.json");
} finally {
  await a.end().catch(() => {});
}
