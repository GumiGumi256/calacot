// Phase 2E: financial statements, period closing and year-end on a disposable in-memory PGlite
// database migrated with the real drizzle-current chain (0000-0023). Synthetic data only: no
// environment variables, no network, no real financial data. Every figure below is derived by hand
// from the synthetic journals, so the statements are checked against independent arithmetic.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { chartSeedPayload } from "../lib/accounting/chart";
import { proposeClassification, lineFits, rangeFor, comparativeRange, flattenStatement, type ChartAccount } from "../lib/accounting/statements";

const db = new PGlite();
const passed: string[] = [];
const check = async (name: string, f: () => Promise<void>) => { await f(); passed.push(name); console.log("PASS", name); };
const q = async <T = Record<string, unknown>,>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
const one = async <T = Record<string, unknown>,>(text: string, params: unknown[] = []) => (await q<T>(text, params))[0];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = async (call: string, params: unknown[] = []) => (await one<{ r: any }>(`SELECT ${call} AS r`, params)).r;
const key = () => randomUUID();
const S = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const num = (v: unknown) => Number(v);
let adjustmentId = "";

try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  assert.ok(journal.entries.some((e) => e.tag === "0023_financial_statements_closing"));
  for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await db.exec(s);
  console.log("PASS migration chain applied through 0023");

  await db.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A'),('b','B','B');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,display_name,status) VALUES
      ('${S(1)}','a','prep','Preparer','active'),('${S(2)}','a','review','Reviewer','active'),('${S(3)}','a','third','Third','active'),
      ('${S(9)}','b','other','Other','active');`);
  const today = (await one<{ d: string }>("SELECT finance_kampala_today()::text AS d")).d;
  const Y = Number(today.slice(0, 4)) - 1;
  const D = (m: number, d: number, y = Y) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const ye = D(12, 31);

  await fn("accounting_chart_seed('a','prep',$1::jsonb,$2,'t')", [JSON.stringify(chartSeedPayload()), key()]);
  const acct: Record<string, string> = {};
  const loadAccounts = async () => { for (const r of await q<{ id: string; code: string }>("SELECT id,code FROM accounting_accounts WHERE organization_id='a'")) acct[r.code] = r.id; };
  await loadAccounts();
  await fn("accounting_account_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), code: "1120-01", name: "Bank UGX", accountType: "asset", reportingClass: "current_asset", parentId: acct["1100"], currency: "UGX" })]);
  await fn("accounting_chart_approve('a','review',$1,'t')", [key()]);
  await loadAccounts();
  const pol = await fn("accounting_policy_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: true, note: "Fixture policy" })]);
  await fn("accounting_policy_decide('a','review',$1,'approve','ok',$2,'t')", [pol.id, key()]);
  await fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [Y, key()]);
  await fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [Y + 1, key()]);
  const periods = await q<{ id: string; name: string; start_date: string; end_date: string; fiscal_year: number }>("SELECT id,name,start_date::text,end_date::text,fiscal_year FROM accounting_periods WHERE organization_id='a' ORDER BY start_date");
  const P = (fy: number, n: number) => periods.filter((p) => p.fiscal_year === fy)[n - 1];

  const L = (code: string, side: "debit" | "credit", amount: string, extra: Record<string, unknown> = {}) => ({ accountId: acct[code], [side]: amount, currency: "UGX", ...extra });
  const postManual = async (date: string, description: string, lines: Record<string, unknown>[]) => {
    const j = await fn("accounting_journal_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), entryDate: date, description, lines })]);
    const s = await fn("accounting_journal_command('a','prep',$1,'submit',1,'',$2,'t')", [j.id, key()]);
    const a = await fn("accounting_journal_command('a','review',$1,'approve',$2,'',$3,'t')", [j.id, s.version, key()]);
    await fn("accounting_journal_command('a','review',$1,'post',$2,'',$3,'t')", [j.id, a.version, key()]);
    return String(j.id);
  };

  // ------------------------------------------------------------------------------------------
  // Synthetic year Y. Hand-computed expectations:
  //   profit = 10,000,000 revenue - 3,000,000 cost of sales - 1,000,000 rent - 500,000 depreciation
  //            - 300,000 accrued fees (adjustment) + 100,000 interest - 1,500,000 income tax = 3,800,000
  //   cash   = 50,000,000 capital + 10,000,000 + 100,000 + 5,000,000 loan - 3,000,000 - 1,000,000
  //            - 6,000,000 computer - 1,000,000 dividend = 54,100,000 (200,000 moved bank -> petty cash)
  await postManual(D(1, 5), "Share capital subscribed", [L("1120-01", "debit", "50000000.00"), L("3100", "credit", "50000000.00")]);
  await postManual(D(1, 20), "Design fees received", [L("1120-01", "debit", "10000000.00"), L("4100", "credit", "10000000.00", { division: "architecture" })]);
  await postManual(D(2, 10), "Site materials", [L("5100", "debit", "3000000.00", { division: "architecture" }), L("1120-01", "credit", "3000000.00")]);
  await postManual(D(2, 28), "Rent accrued", [L("6200", "debit", "1000000.00"), L("2120", "credit", "1000000.00")]);
  await postManual(D(3, 15), "Rent paid", [L("2120", "debit", "1000000.00"), L("1120-01", "credit", "1000000.00")]);
  await postManual(D(3, 20), "Computer bought", [L("1540", "debit", "6000000.00"), L("1120-01", "credit", "6000000.00")]);
  await postManual(D(4, 2), "Petty cash float", [L("1110", "debit", "200000.00"), L("1120-01", "credit", "200000.00")]);
  await postManual(D(6, 30), "Interest received", [L("1120-01", "debit", "100000.00"), L("7100", "credit", "100000.00")]);
  await postManual(D(7, 1), "Bank loan drawn", [L("1120-01", "debit", "5000000.00"), L("2510", "credit", "5000000.00")]);
  await postManual(D(9, 30), "Dividend paid", [L("3300", "debit", "1000000.00"), L("1120-01", "credit", "1000000.00")]);
  await postManual(D(12, 31), "Depreciation for the year", [L("6900", "debit", "500000.00"), L("1590", "credit", "500000.00")]);
  await postManual(D(12, 31), "Income tax provision", [L("8900", "debit", "1500000.00"), L("2195", "credit", "1500000.00")]);
  // Never in any statement: a draft and a submitted journal.
  const draftJ = await fn("accounting_journal_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), entryDate: D(1, 25), description: "Draft only", lines: [L("6200", "debit", "999.00"), L("1120-01", "credit", "999.00")] })]);
  const subJ = await fn("accounting_journal_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), entryDate: D(3, 25), description: "Submitted only", lines: [L("6200", "debit", "777.00"), L("1120-01", "credit", "777.00")] })]);
  const subJs = await fn("accounting_journal_command('a','prep',$1,'submit',1,'',$2,'t')", [subJ.id, key()]);

  const chart = (await q<{ id: string; code: string; account_type: string; is_contra: boolean; is_postable: boolean; reporting_class: string | null }>(
    "SELECT id,code,account_type,is_contra,is_postable,reporting_class FROM accounting_accounts WHERE organization_id='a'")).map((a): ChartAccount => ({
    id: a.id, code: a.code, accountType: a.account_type as ChartAccount["accountType"], isContra: a.is_contra, isPostable: a.is_postable, reportingClass: a.reporting_class }));
  const fullMapping = proposeClassification(chart);
  const propose = (mappings: unknown, actor = "prep", re = acct["3200"]) => fn("fs_classification_propose('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), mappings, retainedEarningsAccountId: re, note: "Statement classification for review" })]);
  const policyDecide = (etype: string, id: unknown, actor = "review", decision = "approve", note = "Reviewed") => fn("fs_policy_decide('a',$1,$2,$3::uuid,$4,$5,$6,'t')", [actor, etype, id, decision, note, key()]);

  await check("classification: proposal mirrors the database line rules; invalid lines, self-approval and edits are refused", async () => {
    for (const a of chart.filter((c) => c.isPostable)) assert.ok(lineFits(a.accountType, a.isContra, fullMapping[a.id].line), `${a.code} proposal fits`);
    await assert.rejects(propose({ ...fullMapping, [acct["1120-01"]]: { line: "revenue", cashflow: null, clearing: false } }), /classification_line_invalid/);
    await assert.rejects(propose({ ...fullMapping, [acct["4100"]]: { line: "revenue", cashflow: "sideways", clearing: false } }), /invalid_classification/);
    await assert.rejects(propose(fullMapping, "prep", acct["3100"]), /retained_earnings_account_invalid/);
    // Version 1 deliberately leaves interest income (7100) unclassified.
    const partial = { ...fullMapping }; delete partial[acct["7100"]];
    const v1 = await propose(partial);
    await assert.rejects(propose(fullMapping), /classification_pending/);
    await assert.rejects(policyDecide("classification", v1.id, "prep"), /fs_self_approval_denied/);
    await policyDecide("classification", v1.id);
    await assert.rejects(q("UPDATE fs_classification_versions SET mappings='{}' WHERE id=$1", [v1.id]), /fs_history_immutable/);
    await assert.rejects(q("DELETE FROM fs_classification_versions WHERE id=$1", [v1.id]), /fs_history_immutable/);
    const pnl = await fn("fs_income_statement('a',$1::date,$2::date)", [D(1, 1), ye]);
    assert.equal(pnl.provisional, true, "unclassified activity makes the statement provisional");
    assert.equal(pnl.unmapped[0].code, "7100");
  });

  await check("adjustments: reason and evidence required; prior-period corrections must touch retained earnings; 2A separation of duties applies", async () => {
    const adj = (p: Record<string, unknown>, actor = "prep") => fn("fs_adjustment_create('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), kind: "accrual", entryDate: ye, description: "Audit fee accrual",
      reason: "Audit fee for the year, invoice not yet received", evidenceReference: "Engagement letter EL-1", lines: [L("6600", "debit", "300000.00"), L("2120", "credit", "300000.00")], ...p })]);
    await assert.rejects(adj({ reason: "short" }), /adjustment_reason_required/);
    await assert.rejects(adj({ evidenceReference: "" }), /adjustment_evidence_required/);
    await assert.rejects(adj({ autoReverseOn: D(12, 1) }), /auto_reverse_date_invalid/);
    await assert.rejects(adj({ kind: "prior_period" }), /prior_period_requires_retained_earnings/);
    const a = await adj({ autoReverseOn: D(1, 1, Y + 1) });
    const j = await one<{ status: string; version: number }>("SELECT status,version FROM accounting_journals WHERE id=$1", [a.journalId]);
    assert.equal(j.status, "submitted", "an adjustment is submitted for review on creation");
    await assert.rejects(fn("fs_adjustment_command('a','prep',$1::uuid,'approve',$2,'',$3,'t')", [a.id, j.version, key()]), /accounting_self_approval_denied/);
    const ap = await fn("fs_adjustment_command('a','review',$1::uuid,'approve',$2,'',$3,'t')", [a.id, j.version, key()]);
    await fn("fs_adjustment_command('a','review',$1::uuid,'post',$2,'',$3,'t')", [a.id, ap.version, key()]);
    await assert.rejects(q("UPDATE adjustment_entries SET reason='changed reason text' WHERE id=$1", [a.id]), /fs_history_immutable/);
    adjustmentId = String(a.id);
  });

  await check("reports: posted lines only; income statement, balance sheet, cash flow, equity and trial balance agree with hand arithmetic", async () => {
    const v2 = await propose(fullMapping);
    await policyDecide("classification", v2.id);
    assert.equal((await one<{ status: string }>("SELECT status FROM fs_classification_versions WHERE organization_id='a' AND version=1")).status, "superseded");
    const pnl = await fn("fs_income_statement('a',$1::date,$2::date)", [D(1, 1), ye]);
    assert.equal(pnl.provisional, false);
    assert.equal(num(pnl.revenue), 10000000);
    assert.equal(num(pnl.costOfSales), -3000000);
    assert.equal(num(pnl.grossProfit), 7000000);
    assert.equal(num(pnl.operatingExpenses), -1800000, "rent 1,000,000 + depreciation 500,000 + accrued fees 300,000; the draft and submitted journals are excluded");
    assert.equal(num(pnl.otherIncome), 100000);
    assert.equal(num(pnl.incomeTax), -1500000);
    assert.equal(num(pnl.netProfit), 3800000);
    const bs = await fn("fs_balance_sheet('a',$1::date)", [ye]);
    assert.equal(bs.balanced, true);
    assert.equal(num(bs.difference), 0);
    assert.equal(num(bs.totalAssets), 59600000, "cash 54,100,000 + PPE 6,000,000 - accumulated depreciation 500,000");
    assert.equal(num(bs.totalLiabilities), 6800000);
    assert.equal(num(bs.equityAccounts), 49000000);
    assert.equal(num(bs.currentPeriodResults), 3800000);
    const cf = await fn("fs_cash_flow('a',$1::date,$2::date)", [D(1, 1), ye]);
    assert.equal(num(cf.openingCash), 0);
    assert.equal(num(cf.operating), 6100000);
    assert.equal(num(cf.investing), -6000000);
    assert.equal(num(cf.financing), 54000000);
    assert.equal(num(cf.closingCash), 54100000);
    assert.equal(num(cf.internalTransfers), 200000, "the petty-cash float is an internal transfer, not a cash flow");
    assert.equal(cf.reconciles, true);
    assert.equal(cf.provisional, false);
    const eq = await fn("fs_equity_changes('a',$1::date,$2::date)", [D(1, 1), ye]);
    assert.equal(num(eq.capitalIntroduced), 50000000);
    assert.equal(num(eq.distributions), -1000000);
    assert.equal(num(eq.profitForPeriod), 3800000);
    assert.equal(num(eq.closingEquity), 52800000);
    assert.equal(eq.reconciles, true);
    const tb = await fn("fs_trial_balance('a',$1::date,$2::date)", [D(1, 1), ye]);
    assert.equal(tb.balanced, true);
    assert.equal(tb.totals.closingDebit, tb.totals.closingCredit);
    // Monthly view: February only.
    const feb = await fn("fs_income_statement('a',$1::date,$2::date)", [D(2, 1), D(2, 28)]);
    assert.equal(num(feb.netProfit), -4000000);
    const div = await fn("fs_division_report('a',$1::date,$2::date)", [D(1, 1), ye]);
    const arch = div.divisions.find((d: { division: string }) => d.division === "architecture");
    assert.equal(num(arch.netProfit), 7000000);
    assert.equal(div.allocated, false, "shared costs are not allocated without an approved policy");
    assert.equal(num(div.sharedNet), -3200000);
  });

  await check("statement sets: computed by the database, hashed, approved by a second person, immutable, and stale once the ledger moves", async () => {
    const mk = (p: Record<string, unknown>, actor = "prep") => fn("fs_statement_set_create('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), ...p })]);
    await assert.rejects(mk({ kind: "month", periodStart: D(3, 1), periodEnd: D(3, 31), comparativeStart: D(3, 1), comparativeEnd: D(3, 31) }), /invalid_statement_set/);
    const mar = await mk({ kind: "month", periodStart: D(3, 1), periodEnd: D(3, 31), comparativeStart: D(2, 1), comparativeEnd: D(2, 28) });
    assert.deepEqual(mar.problems, []);
    await assert.rejects(fn("fs_statement_set_decide('a','prep',$1::uuid,'approve','',$2,'t')", [mar.id, key()]), /fs_self_approval_denied/);
    await assert.rejects(fn("fs_statement_set_decide('b','other',$1::uuid,'approve','',$2,'t')", [mar.id, key()]), /statement_set_unavailable/);
    const k = key();
    await fn("fs_statement_set_decide('a','review',$1::uuid,'approve','Agreed to trial balance',$2,'t')", [mar.id, k]);
    assert.equal((await fn("fs_statement_set_decide('a','review',$1::uuid,'approve','Agreed to trial balance',$2,'t')", [mar.id, k])).already, true);
    await assert.rejects(q("UPDATE fs_statement_sets SET payload='{}' WHERE id=$1", [mar.id]), /statement_set_immutable/);
    await assert.rejects(q("DELETE FROM fs_statement_sets WHERE id=$1", [mar.id]), /fs_history_immutable/);
    const row = await one<{ payload: unknown; payload_sha256: string }>("SELECT payload, payload_sha256, encode(sha256(convert_to(payload::text,'UTF8')),'hex') = payload_sha256 AS ok FROM fs_statement_sets WHERE id=$1", [mar.id]);
    assert.ok((row as unknown as { ok: boolean }).ok, "stored hash matches the stored payload");
    await assert.rejects(q("INSERT INTO fs_statement_sets(organization_id,kind,period_start,period_end,payload,payload_sha256,ledger_fingerprint,provisional,prepared_by_id,idempotency_key) VALUES('a','month',$1,$2,'{\"netProfit\":\"999\"}',repeat('a',64),'x',false,$3,$4)", [D(3, 1), D(3, 31), S(1), key()]), /invalid_statement_set/, "a client cannot store figures that do not match their hash");
    const stale = await mk({ kind: "month", periodStart: D(4, 1), periodEnd: D(4, 30) });
    await postManual(D(4, 30), "Bank charges", [L("6910", "debit", "0.01"), L("1120-01", "credit", "0.01")]);
    await assert.rejects(fn("fs_statement_set_decide('a','review',$1::uuid,'approve','',$2,'t')", [stale.id, key()]), /statements_stale/);
    // Undo the 0.01 so the year figures above remain exact.
    await postManual(D(4, 30), "Bank charges refunded", [L("1120-01", "debit", "0.01"), L("6910", "credit", "0.01")]);
  });

  // ------------------------------------------------------------------------------------------
  const closeStart = (pid: string, actor = "prep") => fn("period_close_start('a',$1,$2::uuid,$3,'t')", [actor, pid, key()]);
  const closeCmd = async (cid: string, cmd: string, actor = "review", note = "Reviewed and agreed") => {
    const v = (await one<{ version: number }>("SELECT version FROM period_closes WHERE id=$1", [cid])).version;
    return fn("period_close_command('a',$1,$2::uuid,$3,$4,$5,$6,'t')", [actor, cid, cmd, v, note, key()]);
  };
  const evidence = (cid: string) => fn("period_close_evidence_add('a','prep',$1::uuid,$2::jsonb,'t')", [cid, JSON.stringify({ key: key(), item: "Bank statements", reference: "Statement pack (synthetic)" })]);
  // No income-tax computation exists in this fixture: the final-period tax check stands only as an approved exception.
  const exceptTax = async (cid: string) => { const x = await fn("period_close_exception_raise('a','prep',$1::uuid,$2::jsonb,'t')", [cid, JSON.stringify({ key: key(), checkKey: "tax_provision", explanation: "Tax computed by the external adviser; provision journal already posted" })]);
    await fn("period_close_exception_decide('a','review',$1::uuid,'approve','Adviser computation seen',$2,'t')", [x.id, key()]); };
  const closeFully = async (pid: string) => { const c = await closeStart(pid); await evidence(c.id); await closeCmd(c.id, "submit", "prep", "Ready"); await closeCmd(c.id, "approve"); return String(c.id); };

  await check("close policy: two-person approval; afterwards periods close and reopen only through the controlled workflow", async () => {
    const last = P(Y + 1, 12);
    const per = await one<{ version: number }>("SELECT version FROM accounting_periods WHERE id=$1", [last.id]);
    const c1 = await fn("accounting_period_command('a','prep',$1,'close',$2,'legacy close',$3,'t')", [last.id, per.version, key()]);
    assert.equal(c1.status, "closed", "without a close policy the Phase 2A command still works");
    await fn("accounting_period_command('a','prep',$1,'reopen',$2,'legacy reopen reason',$3,'t')", [last.id, per.version + 1, key()]);
    const p1 = await fn("period_close_policy_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), requireBankReconciliation: true, requireCashCount: false, clearingTolerance: "0", evidenceItems: ["Bank statements"], note: "Month-end close policy" })]);
    await assert.rejects(policyDecide("close_policy", p1.id, "prep"), /fs_self_approval_denied/);
    await policyDecide("close_policy", p1.id);
    const now = await one<{ version: number }>("SELECT version FROM accounting_periods WHERE id=$1", [last.id]);
    await assert.rejects(fn("accounting_period_command('a','review',$1,'close',$2,'legacy close',$3,'t')", [last.id, now.version, key()]), /period_close_controlled/);
    await assert.rejects(q("UPDATE accounting_periods SET status='closed', closed_by_id=$2, closed_at=now() WHERE id=$1", [last.id, S(1)]), /period_close_controlled/, "direct SQL cannot close a period either");
  });

  await check("period close: checklist, evidence, exceptions approved by a second person, separation of duties, atomic close", async () => {
    const jan = P(Y, 1);
    const c = await closeStart(jan.id);
    await assert.rejects(closeStart(jan.id), /period_close_exists/);
    let chk = await fn("period_close_checks('a',$1::uuid)", [jan.id]);
    const status = (k: string) => chk.checks.find((x: { key: string }) => x.key === k).status;
    assert.equal(chk.ready, false);
    assert.equal(status("draft_journals"), "fail");
    assert.equal(status("evidence"), "fail");
    assert.equal(status("trial_balance"), "pass");
    assert.equal(status("bank_reconciliation"), "pass", "no bank account is registered in banking yet");
    await assert.rejects(closeCmd(c.id, "submit", "prep"), /close_checks_failed/);
    await evidence(c.id);
    await assert.rejects(fn("period_close_exception_raise('a','prep',$1::uuid,$2::jsonb,'t')", [c.id, JSON.stringify({ key: key(), checkKey: "trial_balance", explanation: "Trying to except a non-exceptable check here" })]), /invalid_close_exception/);
    await assert.rejects(fn("period_close_exception_raise('a','prep',$1::uuid,$2::jsonb,'t')", [c.id, JSON.stringify({ key: key(), checkKey: "draft_journals", explanation: "too short" })]), /exception_explanation_required/);
    const x = await fn("period_close_exception_raise('a','prep',$1::uuid,$2::jsonb,'t')", [c.id, JSON.stringify({ key: key(), checkKey: "draft_journals", explanation: "Draft held for February; it will be redated before posting" })]);
    await assert.rejects(closeCmd(c.id, "submit", "prep"), /close_checks_failed/, "a proposed exception does not count");
    await assert.rejects(fn("period_close_exception_decide('a','prep',$1::uuid,'approve','ok fine',$2,'t')", [x.id, key()]), /fs_self_approval_denied/);
    await fn("period_close_exception_decide('a','review',$1::uuid,'approve','Accepted for January',$2,'t')", [x.id, key()]);
    chk = await fn("period_close_checks('a',$1::uuid)", [jan.id]);
    assert.equal(status("draft_journals"), "excepted");
    assert.equal(chk.ready, true);
    await closeCmd(c.id, "submit", "prep", "January ready");
    await assert.rejects(closeCmd(c.id, "approve", "prep"), /fs_self_approval_denied/, "the preparer cannot approve the close");
    await closeCmd(c.id, "approve", "review");
    assert.equal((await one<{ status: string }>("SELECT status FROM accounting_periods WHERE id=$1", [jan.id])).status, "closed");
    await assert.rejects(postManual(D(1, 31), "Late entry", [L("6200", "debit", "1.00"), L("1120-01", "credit", "1.00")]), /period_closed/);
    await assert.rejects(fn("accounting_journal_command('a','prep',$1,'submit',$2,'',$3,'t')", [draftJ.id, 1, key()]), /period_closed/, "the excepted draft cannot be posted into the closed period");
    // February onwards. March has a submitted journal, which can never be excepted.
    await closeFully(P(Y, 2).id);
    const mar = await closeStart(P(Y, 3).id);
    await evidence(mar.id);
    await assert.rejects(closeCmd(mar.id, "submit", "prep"), /close_checks_failed/);
    await assert.rejects(fn("period_close_exception_raise('a','prep',$1::uuid,$2::jsonb,'t')", [mar.id, JSON.stringify({ key: key(), checkKey: "pending_journals", explanation: "Pending journal will be reviewed next month" })]), /invalid_close_exception/);
    await fn("accounting_journal_command('a','review',$1,'reject',$2,'Not supported by evidence',$3,'t')", [subJ.id, subJs.version, key()]);
    await closeCmd(mar.id, "submit", "prep", "March ready");
    await closeCmd(mar.id, "return", "review", "Please attach the loan agreement");
    await closeCmd(mar.id, "submit", "prep", "March ready again");
    const mv = (await one<{ version: number }>("SELECT version FROM period_closes WHERE id=$1", [mar.id])).version;
    await assert.rejects(fn("period_close_assign('a','review',$1::uuid,$2::uuid,$3,$4,'t')", [mar.id, S(1), mv, key()]), /fs_self_approval_denied|check/, "the preparer cannot be the assigned reviewer");
    await fn("period_close_assign('a','review',$1::uuid,$2::uuid,$3,$4,'t')", [mar.id, S(3), mv, key()]);
    await assert.rejects(closeCmd(mar.id, "approve", "review"), /close_reviewer_assigned/, "only the assigned reviewer approves");
    await closeCmd(mar.id, "approve", "third");
    for (let n = 4; n <= 11; n++) await closeFully(P(Y, n).id);
    await assert.rejects(q("UPDATE period_closes SET status='in_progress' WHERE id=$1", [c.id]), /invalid_close_transition/);
    await assert.rejects(q("DELETE FROM period_closes WHERE id=$1", [c.id]), /fs_history_immutable/);
  });

  await check("reopen: authorized, reasoned, latest period first; history kept; the period can be closed again", async () => {
    const octClose = (await one<{ id: string }>("SELECT id FROM period_closes WHERE period_id=$1 AND status='closed'", [P(Y, 10).id])).id;
    await assert.rejects(closeCmd(octClose, "reopen", "review", "Correction needed in October"), /later_period_closed/);
    const novClose = (await one<{ id: string }>("SELECT id FROM period_closes WHERE period_id=$1 AND status='closed'", [P(Y, 11).id])).id;
    await assert.rejects(closeCmd(novClose, "reopen", "review", "short"), /reopen_reason_required/);
    await closeCmd(novClose, "reopen", "review", "Supplier invoice dated November arrived late");
    assert.equal((await one<{ status: string }>("SELECT status FROM accounting_periods WHERE id=$1", [P(Y, 11).id])).status, "open");
    await closeFully(P(Y, 11).id);
    assert.equal((await one<{ n: number }>("SELECT count(*)::int AS n FROM period_closes WHERE period_id=$1", [P(Y, 11).id])).n, 2, "the reopened close remains in history");
  });

  let yearEndId = "";
  await check("year-end: needs approved annual statements and a submitted final close; closing entries go to retained earnings exactly once", async () => {
    const dec = P(Y, 12);
    const fc = await closeStart(dec.id);
    await evidence(fc.id);
    const pre = await fn("period_close_checks('a',$1::uuid)", [dec.id]);
    assert.equal(pre.checks.find((x: { key: string }) => x.key === "tax_provision").status, "fail", "the final period requires a reviewed tax provision");
    await exceptTax(fc.id);
    await closeCmd(fc.id, "submit", "prep", "December ready");
    await assert.rejects(fn("year_end_prepare('a','prep',$1,$2::jsonb,'t')", [Y, JSON.stringify({ key: key() })]), /annual_statements_required/);
    const set = await fn("fs_statement_set_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), kind: "year", periodStart: D(1, 1), periodEnd: ye })]);
    assert.deepEqual(set.problems, []);
    await fn("fs_statement_set_decide('a','review',$1::uuid,'approve','Annual statements agreed',$2,'t')", [set.id, key()]);
    const k = key();
    const y = await fn("year_end_prepare('a','prep',$1,$2::jsonb,'t')", [Y, JSON.stringify({ key: k, statementSetId: set.id })]);
    assert.equal(num(y.netResult), 3800000);
    assert.equal((await fn("year_end_prepare('a','prep',$1,$2::jsonb,'t')", [Y, JSON.stringify({ key: k, statementSetId: set.id })])).already, true);
    await assert.rejects(fn("year_end_prepare('a','prep',$1,$2::jsonb,'t')", [Y, JSON.stringify({ key: key(), statementSetId: set.id })]), /year_end_exists/);
    const cj = await one<{ status: string; version: number }>("SELECT status,version FROM accounting_journals WHERE id=$1", [y.journalId]);
    assert.equal(cj.status, "submitted");
    await assert.rejects(fn("accounting_journal_command('a','review',$1,'approve',$2,'',$3,'t')", [y.journalId, cj.version, key()]), /year_end_journal_controlled/, "the closing journal cannot be approved from the journal screens");
    await assert.rejects(closeCmd(fc.id, "approve", "review"), /year_end_pending/);
    await assert.rejects(fn("year_end_decide('a','prep',$1::uuid,'approve','',$2,'t')", [y.id, key()]), /fs_self_approval_denied/);
    const dk = key();
    await fn("year_end_decide('a','review',$1::uuid,'approve','Year-end approved',$2,'t')", [y.id, dk]);
    assert.equal((await fn("year_end_decide('a','review',$1::uuid,'approve','Year-end approved',$2,'t')", [y.id, dk])).already, true);
    assert.equal((await one<{ status: string }>("SELECT status FROM accounting_periods WHERE id=$1", [dec.id])).status, "closed");
    const pnlBal = await one<{ n: string }>("SELECT coalesce(sum(closing),0)::text AS n FROM fs_account_balances('a',$1::date,$1::date) WHERE account_type IN ('income','other_income','cost_of_sales','operating_expense','other_expense')", [ye]);
    assert.equal(num(pnlBal.n), 0, "every income and expense account is closed");
    const bs = await fn("fs_balance_sheet('a',$1::date)", [ye]);
    assert.equal(num(bs.currentPeriodResults), 0);
    assert.equal(bs.lines.retained_earnings[0].amount, "3800000.00");
    assert.equal(bs.balanced, true);
    const pnl = await fn("fs_income_statement('a',$1::date,$2::date)", [D(1, 1), ye]);
    assert.equal(num(pnl.netProfit), 3800000, "the closing entry never distorts the year's income statement");
    const eq = await fn("fs_equity_changes('a',$1::date,$2::date)", [D(1, 1), ye]);
    assert.equal(num(eq.yearEndTransfers), 3800000);
    assert.equal(eq.reconciles, true);
    // Opening balances of the next year are the carried-forward ledger balances.
    const tb = await fn("fs_trial_balance('a',$1::date,$2::date)", [D(1, 1, Y + 1), D(1, 31, Y + 1)]);
    const re = tb.rows.find((r: { code: string }) => r.code === "3200");
    assert.equal(re.openingCredit, "3800000.00");
    assert.equal(tb.rows.find((r: { code: string }) => r.code === "4100"), undefined, "income accounts start the new year at zero");
    yearEndId = String(y.id);
  });

  await check("year-end reopen: reasoned, reverses the closing entry with history kept, and a new closing transfers the result only once", async () => {
    await assert.rejects(fn("year_end_reopen('a','review',$1::uuid,'short',$2,'t')", [yearEndId, key()]), /reopen_reason_required/);
    const r = await fn("year_end_reopen('a','review',$1::uuid,'Auditor adjustment to the year required',$2,'t')", [yearEndId, key()]);
    assert.ok(r.reversalId);
    const dec = P(Y, 12);
    assert.equal((await one<{ status: string }>("SELECT status FROM accounting_periods WHERE id=$1", [dec.id])).status, "open");
    let bs = await fn("fs_balance_sheet('a',$1::date)", [ye]);
    assert.equal(num(bs.currentPeriodResults), 3800000, "the result is back in the current-period line");
    await assert.rejects(fn("year_end_prepare('a','prep',$1,$2::jsonb,'t')", [Y, JSON.stringify({ key: key() })]), /final_period_close_not_submitted/);
    const fc = await closeStart(dec.id);
    await evidence(fc.id);
    await exceptTax(fc.id);
    await closeCmd(fc.id, "submit", "prep", "December ready again");
    const set = await fn("fs_statement_set_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), kind: "year", periodStart: D(1, 1), periodEnd: ye })]);
    await fn("fs_statement_set_decide('a','review',$1::uuid,'approve','Re-approved after reopen',$2,'t')", [set.id, key()]);
    assert.equal((await one<{ n: number }>("SELECT count(*)::int AS n FROM fs_statement_sets WHERE organization_id='a' AND kind='year' AND status='superseded'")).n, 1);
    const y2 = await fn("year_end_prepare('a','prep',$1,$2::jsonb,'t')", [Y, JSON.stringify({ key: key(), statementSetId: set.id })]);
    assert.equal(num(y2.netResult), 3800000);
    await fn("year_end_decide('a','review',$1::uuid,'approve','',$2,'t')", [y2.id, key()]);
    bs = await fn("fs_balance_sheet('a',$1::date)", [ye]);
    assert.equal(bs.lines.retained_earnings[0].amount, "3800000.00", "retained earnings receive the result once, not twice");
    assert.equal(bs.balanced, true);
    assert.equal((await one<{ n: number }>("SELECT count(*)::int AS n FROM year_end_closes WHERE organization_id='a' AND fiscal_year=$1", [Y])).n, 2);
    await assert.rejects(q("DELETE FROM year_end_closes WHERE id=$1", [yearEndId]), /fs_history_immutable/);
  });

  await check("next year: scheduled reversal of the accrual, prior-period correction shown separately in equity", async () => {
    const k = key();
    const r = await fn("fs_adjustment_reverse('a','prep',$1::uuid,$2,'t')", [adjustmentId, k]);
    assert.equal((await fn("fs_adjustment_reverse('a','prep',$1::uuid,$2,'t')", [adjustmentId, k])).already, true);
    await assert.rejects(fn("fs_adjustment_reverse('a','prep',$1::uuid,$2,'t')", [adjustmentId, key()]), /journal_already_reversed/);
    assert.equal((await one<{ entry_date: string }>("SELECT entry_date::text FROM accounting_journals WHERE id=$1", [r.journalId])).entry_date, D(1, 1, Y + 1));
    const ppa = await fn("fs_adjustment_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), kind: "prior_period", entryDate: D(1, 15, Y + 1), description: "Prior-year expense omitted",
      reason: "Utility bill for last year found after the close", evidenceReference: "UMEME bill (synthetic)", lines: [L("3200", "debit", "50000.00"), L("2120", "credit", "50000.00")] })]);
    const j = await one<{ version: number }>("SELECT version FROM accounting_journals WHERE id=$1", [ppa.journalId]);
    const ap = await fn("fs_adjustment_command('a','review',$1::uuid,'approve',$2,'',$3,'t')", [ppa.id, j.version, key()]);
    await fn("fs_adjustment_command('a','review',$1::uuid,'post',$2,'',$3,'t')", [ppa.id, ap.version, key()]);
    const eq = await fn("fs_equity_changes('a',$1::date,$2::date)", [D(1, 1, Y + 1), D(1, 31, Y + 1)]);
    assert.equal(num(eq.priorPeriodCorrections), -50000);
    assert.equal(num(eq.profitForPeriod), 300000, "the reversed accrual is income of the new year");
    assert.equal(eq.reconciles, true);
  });

  await check("division reporting: shared costs allocated only under an approved policy, as a memo that never posts", async () => {
    const before = (await one<{ n: number }>("SELECT count(*)::int AS n FROM accounting_journals WHERE organization_id='a'")).n;
    const prop = (shares: Record<string, string>) => fn("overhead_allocation_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), shares, effectiveFrom: D(1, 1), note: "Head-office cost shares" })]);
    await assert.rejects(prop({ architecture: "0.5", tech: "0.4" }), /overhead_shares_total/);
    await assert.rejects(prop({ architecture: "0.5", marketing: "0.5" }), /invalid_overhead_policy/);
    const o = await prop({ architecture: "0.6", tech: "0.4" });
    await policyDecide("overhead_policy", o.id);
    const div = await fn("fs_division_report('a',$1::date,$2::date)", [D(1, 1), ye]);
    assert.equal(div.allocated, true);
    const arch = div.divisions.find((d: { division: string }) => d.division === "architecture");
    assert.equal(num(arch.allocatedOverhead), -1080000, "60% of shared operating expenses of 1,800,000");
    assert.equal((await one<{ n: number }>("SELECT count(*)::int AS n FROM accounting_journals WHERE organization_id='a'")).n, before);
  });

  await check("banking interplay: an unreconciled bank account fails the close check and makes the cash flow provisional until excepted", async () => {
    const fa = await fn("finance_account_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), method: "bank_transfer", provider: "Fixture Bank", accountIdentifier: "000111", label: "Bank", currency: "UGX", verificationNote: "Synthetic fixture" })]);
    const bank = String((await fn("banking_account_register('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), kind: "bank", financeAccountId: fa.id })])).id);
    const bm = await fn("bank_mapping_propose('a','prep',$1::uuid,$2::uuid,'Bank mapping',$3,'t')", [bank, acct["1120-01"], key()]);
    await fn("bank_mapping_decide('a','review',$1::uuid,'approve','',$2,'t')", [bm.id, key()]);
    const cf = await fn("fs_cash_flow('a',$1::date,$2::date)", [D(1, 1, Y + 1), D(1, 31, Y + 1)]);
    assert.equal(cf.provisional, true);
    const c = await closeStart(P(Y + 1, 1).id);
    await evidence(c.id);
    const chk = await fn("period_close_checks('a',$1::uuid)", [P(Y + 1, 1).id]);
    assert.equal(chk.checks.find((x: { key: string }) => x.key === "bank_reconciliation").status, "fail");
    const x = await fn("period_close_exception_raise('a','prep',$1::uuid,$2::jsonb,'t')", [c.id, JSON.stringify({ key: key(), checkKey: "bank_reconciliation", explanation: "Statement for January not yet received from the bank" })]);
    await fn("period_close_exception_decide('a','review',$1::uuid,'approve','Accepted; reconcile in February',$2,'t')", [x.id, key()]);
    await closeCmd(c.id, "submit", "prep", "January ready");
    await closeCmd(c.id, "approve", "review");
  });

  await check("pure helpers: date ranges, comparatives and export rows copied from the database result", async () => {
    assert.deepEqual(rangeFor("month", "2025-02-10", 1), { start: "2025-02-01", end: "2025-02-28" });
    assert.deepEqual(rangeFor("quarter", "2025-03-31", 1), { start: "2025-01-01", end: "2025-03-31" });
    assert.deepEqual(rangeFor("year", "2025-03-31", 7), { start: "2024-07-01", end: "2025-06-30" });
    assert.deepEqual(comparativeRange("2025-01-01", "2025-03-31", "prior_period"), { from: "2024-10-01", to: "2024-12-31" });
    assert.deepEqual(comparativeRange("2024-03-01", "2024-03-31", "prior_year"), { from: "2023-03-01", to: "2023-03-31" });
    assert.deepEqual(comparativeRange("2024-01-01", "2024-02-29", "prior_year"), { from: "2023-01-01", to: "2023-02-28" });
    const pnl = await fn("fs_income_statement('a',$1::date,$2::date)", [D(1, 1), ye]);
    const rows = flattenStatement("income", pnl, null);
    assert.ok(rows.some((r) => r[2] === "Profit for the period" && r[3] === pnl.netProfit));
  });



  console.log(`\nAll ${passed.length} Phase 2E database checks passed.`);
} finally {
  await db.close();
}
