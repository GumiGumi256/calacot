// Phase 2D: real PostgreSQL checks with independent connections whose transactions genuinely overlap.
// Synthetic data only. Usage: echo "<connection string>" | npx tsx scripts/verify-tax-assets-concurrency-postgres.mjs
// Refuses any database not named phase2d_tax_fixture and applies the chain only to an empty database.
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chartSeedPayload } from "../lib/accounting/chart.ts";

let input = ""; for await (const chunk of process.stdin) input += chunk;
const url = new URL(input.trim());
if (url.pathname !== "/phase2d_tax_fixture") throw Error("Refusing non-fixture database");
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
  const org = `phase2d-${randomUUID()}`;
  const fn = async (client, call, params) => (await client.query(`SELECT ${call} AS r`, params)).rows[0].r;
  await a.query("INSERT INTO organizations(id,name,legal_name) VALUES($1,'Fixture','Fixture')", [org]);
  await a.query("INSERT INTO staff_memberships(organization_id,clerk_user_id,status) VALUES($1,'prep','active'),($1,'review','active'),($1,'third','active')", [org]);
  const Y = Number((await a.query("SELECT finance_kampala_today()::text AS d")).rows[0].d.slice(0, 4)) - 1;
  await fn(a, "accounting_chart_seed($1,'prep',$2::jsonb,$3,'t')", [org, JSON.stringify(chartSeedPayload()), key()]);
  await fn(a, "accounting_chart_approve($1,'review',$2,'t')", [org, key()]);
  const pol = await fn(a, "accounting_policy_propose($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: true, note: "Fixture policy" })]);
  await fn(a, "accounting_policy_decide($1,'review',$2,'approve','ok',$3,'t')", [org, pol.id, key()]);
  await fn(a, "accounting_period_generate_year($1,'prep',$2,$3,'t')", [org, Y, key()]);
  const acct = Object.fromEntries((await a.query("SELECT code,id FROM accounting_accounts WHERE organization_id=$1", [org])).rows.map((r) => [r.code, r.id]));
  const doc = async () => (await a.query("INSERT INTO documents(organization_id,name,kind,storage_key,mime_type,size_bytes) VALUES($1,'Evidence','policy',$2,'application/pdf',1) RETURNING id", [org, `t/${randomUUID()}`])).rows[0].id;
  const ev = await doc();
  const rule = await fn(a, "tax_rule_propose($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), ruleCode: "cit-rate", ruleKind: "income_tax_rate", description: "Fixture rate", parameters: { rate: "0.3" }, effectiveFrom: `${Y - 1}-01-01`, legalBasis: "Fixture basis", evidenceDocumentId: ev })]);
  await fn(a, "tax_rule_decide($1,'review',$2::uuid,'approve','ok',$3,'t')", [org, rule.id, key()]);

  await check("two reviewers approve the same obligation proposal at once: one approval, the other refused", async () => {
    const o = await fn(a, "tax_obligation_propose($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), code: "cit", taxType: "corporate_income_tax", name: "CIT", registrationStatus: "registered", taxpayerName: "Fixture", effectiveFrom: `${Y - 1}-01-01`,
      legalBasis: "Fixture registration", periodBasis: "accounting_year", filingFrequency: "annual", calculationRuleCode: "cit-rate", processingEnabled: true, evidenceDocumentId: ev, accounts: { expense: acct["8900"], liability: acct["2195"] } })]);
    await a.query("BEGIN"); await b.query("BEGIN");
    await fn(a, "tax_obligation_decide($1,'review',$2::uuid,'approve','ok',$3,'t')", [org, o.id, key()]);
    const second = settle(fn(b, "tax_obligation_decide($1,'third',$2::uuid,'approve','ok',$3,'t')", [org, o.id, key()]));
    await pause(); assert.equal(second.done, false, "the second approver waits");
    await a.query("COMMIT");
    const err = await second.result; await b.query("ROLLBACK");
    assert.match(String(err?.message), /tax_obligation_unavailable/);
    assert.equal((await a.query("SELECT count(*)::int AS n FROM tax_obligation_versions WHERE organization_id=$1 AND status='approved'", [org])).rows[0].n, 1);
  });

  await check("concurrent approvals of one computation: exactly one approval with one snapshot", async () => {
    await (async () => { // revenue so the computation has a tax charge
      const j = await fn(a, "accounting_journal_save($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), entryDate: `${Y}-03-31`, description: "Fees", lines: [{ accountId: acct["1120"], debit: "1000000", currency: "UGX" }, { accountId: acct["4100"], credit: "1000000", currency: "UGX" }] })]);
      const s = await fn(a, "accounting_journal_command($1,'prep',$2,'submit',1,'',$3,'t')", [org, j.id, key()]);
      const ap = await fn(a, "accounting_journal_command($1,'review',$2,'approve',$3,'',$4,'t')", [org, j.id, s.version, key()]);
      await fn(a, "accounting_journal_command($1,'review',$2,'post',$3,'',$4,'t')", [org, j.id, ap.version, key()]);
    })();
    const comp = await fn(a, "income_tax_computation_create($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), obligationCode: "cit", fiscalYear: String(Y), kind: "final" })]);
    await fn(a, "income_tax_computation_command($1,'prep',$2::uuid,'submit',1,'',$3,'t')", [org, comp.id, key()]);
    await a.query("BEGIN"); await b.query("BEGIN");
    await fn(a, "income_tax_computation_command($1,'review',$2::uuid,'approve',2,'ok',$3,'t')", [org, comp.id, key()]);
    const second = settle(fn(b, "income_tax_computation_command($1,'third',$2::uuid,'approve',2,'ok',$3,'t')", [org, comp.id, key()]));
    await pause(); assert.equal(second.done, false);
    await a.query("COMMIT");
    const err = await second.result; await b.query("ROLLBACK");
    assert.match(String(err?.message), /stale_tax_computation|invalid_tax_transition/);
    const row = (await a.query("SELECT status,figures->>'taxCharge' AS t FROM income_tax_computations WHERE id=$1", [comp.id])).rows[0];
    assert.deepEqual([row.status, row.t], ["approved", "300000.00"]);
  });

  await check("the same PRN recorded by two people at once: one payment, the other refused", async () => {
    const fa = await fn(a, "finance_account_save($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), method: "bank_transfer", provider: "Fixture Bank", accountIdentifier: "000999", label: "Bank", currency: "UGX", verificationNote: "Synthetic fixture" })]);
    const bank = (await fn(a, "banking_account_register($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), kind: "bank", financeAccountId: fa.id })])).id;
    const bm = await fn(a, "bank_mapping_propose($1,'prep',$2::uuid,$3::uuid,'Bank mapping',$4,'t')", [org, bank, acct["1120"], key()]);
    await fn(a, "bank_mapping_decide($1,'review',$2::uuid,'approve','',$3,'t')", [org, bm.id, key()]);
    const pay = (client, actor) => fn(client, `tax_payment_record($1,'${actor}',$2::jsonb,'t')`, [org, JSON.stringify({ key: key(), obligationCode: "cit", fiscalYear: String(Y), kind: "final_balance", amount: "300000", paidOn: `${Y}-12-20`, prn: "PRN-0042", bankingAccountId: bank, evidenceDocumentId: ev })]);
    await a.query("BEGIN"); await b.query("BEGIN");
    await pay(a, "prep");
    const second = settle(pay(b, "third"));
    await pause(); assert.equal(second.done, false);
    await a.query("COMMIT");
    const err = await second.result; await b.query("ROLLBACK");
    assert.match(String(err?.message), /duplicate_tax_payment/);
    assert.equal((await a.query("SELECT count(*)::int AS n FROM tax_payments WHERE organization_id=$1", [org])).rows[0].n, 1);
  });

  await check("two depreciation runs prepared at once: one run, the other refused", async () => {
    const cat = await fn(a, "asset_category_propose($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), code: "COMP", name: "Computers", usefulLifeMonths: 12, residualPercent: "0", periodConvention: "full_month_from_capitalization", capitalizationThreshold: "0",
      policyBasis: "Fixture policy", accounts: { cost: acct["1540"], accumulated: acct["1590"], expense: acct["6900"], impairment: acct["6900"], gain: acct["7300"], loss: acct["8300"] } })]);
    await fn(a, "asset_category_decide($1,'review',$2::uuid,'approve','',$3,'t')", [org, cat.id, key()]);
    const asset = await fn(a, "fixed_asset_save($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), name: "Laptop", ownership: "owned", categoryCode: "COMP", acquisitionDate: `${Y}-01-05`, capitalizationDate: `${Y}-01-05`, cost: "1200000", currency: "UGX", capitalizationSource: "direct_credit", creditAccountId: acct["2120"] })]);
    const cap = await fn(a, "fixed_asset_capitalize($1,'prep',$2::uuid,$3::jsonb,'t')", [org, asset.id, JSON.stringify({ key: key() })]);
    await fn(a, "ledger_link_decide($1,'review',$2::uuid,'approve','ok',$3,'t')", [org, cap.id, key()]);
    const jan = (await a.query("SELECT id FROM accounting_periods WHERE organization_id=$1 AND start_date=$2", [org, `${Y}-01-01`])).rows[0].id;
    await a.query("BEGIN"); await b.query("BEGIN");
    const r1 = await fn(a, "asset_depreciation_prepare($1,'prep',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), periodId: jan })]);
    const second = settle(fn(b, "asset_depreciation_prepare($1,'third',$2::jsonb,'t')", [org, JSON.stringify({ key: key(), periodId: jan })]));
    await pause(); assert.equal(second.done, false);
    await a.query("COMMIT");
    const err = await second.result; await b.query("ROLLBACK");
    assert.match(String(err?.message), /depreciation_run_pending/);
    assert.equal(r1.total, "100000.00");
  });

  await check("ledger integrity after concurrent activity: posted journals balance", async () => {
    assert.equal((await a.query("SELECT count(*)::int AS n FROM accounting_journals WHERE organization_id=$1 AND status='posted' AND total_debit<>total_credit", [org])).rows[0].n, 0);
  });
  console.log(`Tax and asset PostgreSQL concurrency checks passed (${passed.length} + migration).`);
} finally { await a.end().catch(() => {}); await b.end().catch(() => {}); }
