// Phase 2F parallel accounting verification (synthetic). A full representative financial year is
// posted through the real journal functions, closed month by month and closed at year end. Every
// report is then recomputed by an INDEPENDENT reference model written here in TypeScript (integer
// cents, no SQL, no shared code with the database functions) from the raw list of journals the test
// itself generated. Every figure is compared; any difference is classified and the run fails.
// No real Calacot record is used. Writes an evidence summary to tmp/parallel-run-evidence.json.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { chartSeedPayload } from "../lib/accounting/chart";
import { proposeClassification, type ChartAccount, type ClassificationEntry } from "../lib/accounting/statements";

const db = new PGlite();
const q = async <T = Record<string, unknown>,>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = async (call: string, params: unknown[] = []) => (await q<{ r: any }>(`SELECT ${call} AS r`, params))[0].r;
const key = () => randomUUID();
const S = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// Deterministic pseudo-random numbers so a run can be reproduced exactly.
let seed = 20260601;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const cents = (lo: number, hi: number) => BigInt(Math.round((lo + rand() * (hi - lo)) * 100));
const fmt = (c: bigint) => { const neg = c < BigInt(0); const a = neg ? -c : c; return `${neg ? "-" : ""}${a / BigInt(100)}.${String(a % BigInt(100)).padStart(2, "0")}`; };
const toC = (v: unknown): bigint => { if (typeof v === "bigint") return v; const s = String(v); const neg = s.startsWith("-"); const [w, f = ""] = (neg ? s.slice(1) : s).split("."); const c = BigInt(w) * BigInt(100) + BigInt((f + "00").slice(0, 2)); return neg ? -c : c; };

type Line = { code: string; dr: bigint; cr: bigint; division?: string };
type J = { date: string; description: string; lines: Line[]; kind: string };
const differences: { report: string; item: string; system: string; reference: string; classification: string }[] = [];
const compare = (report: string, item: string, system: unknown, reference: bigint) => {
  const s = toC(system);
  if (s !== reference) differences.push({ report, item, system: fmt(s), reference: fmt(reference), classification: "unexplained: system and independent model disagree" });
};

try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await db.exec(s);
  await db.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,display_name,status) VALUES ('${S(1)}','a','prep','Preparer','active'),('${S(2)}','a','review','Reviewer','active'),('${S(3)}','a','third','Third','active');`);
  const Y = Number((await q<{ d: string }>("SELECT finance_kampala_today()::text AS d"))[0].d.slice(0, 4)) - 1;
  const D = (m: number, d: number, y = Y) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const lastDay = (m: number) => new Date(Date.UTC(Y, m, 0)).getUTCDate();
  await fn("accounting_chart_seed('a','prep',$1::jsonb,$2,'t')", [JSON.stringify(chartSeedPayload()), key()]);
  await fn("accounting_chart_approve('a','review',$1,'t')", [key()]);
  const pol = await fn("accounting_policy_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: true, note: "Fixture policy" })]);
  await fn("accounting_policy_decide('a','review',$1,'approve','ok',$2,'t')", [pol.id, key()]);
  await fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [Y, key()]);
  await fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [Y + 1, key()]);
  const accounts = await q<{ id: string; code: string; account_type: string; is_contra: boolean; is_postable: boolean; reporting_class: string | null }>("SELECT id,code,account_type,is_contra,is_postable,reporting_class FROM accounting_accounts WHERE organization_id='a'");
  const byCode = Object.fromEntries(accounts.map((a) => [a.code, a]));
  const mapping = proposeClassification(accounts.map((a): ChartAccount => ({ id: a.id, code: a.code, accountType: a.account_type as ChartAccount["accountType"], isContra: a.is_contra, isPostable: a.is_postable, reportingClass: a.reporting_class })));
  const cls = await fn("fs_classification_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), mappings: mapping, retainedEarningsAccountId: byCode["3200"].id, note: "Fixture classification" })]);
  await fn("fs_policy_decide('a','review','classification',$1::uuid,'approve','ok',$2,'t')", [cls.id, key()]);
  const cp = await fn("period_close_policy_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), requireBankReconciliation: false, requireCashCount: false, evidenceItems: ["Bank statements"], note: "Fixture close policy" })]);
  await fn("fs_policy_decide('a','review','close_policy',$1::uuid,'approve','ok',$2,'t')", [cp.id, key()]);
  const map = (code: string): ClassificationEntry => mapping[byCode[code].id];

  // ---------------------------------------------------------------------------------------------
  // A representative year: capital, loan, sales by division, materials, payroll-type costs, rent
  // accrued then paid, a computer purchase, monthly depreciation, prepaid insurance, bank charges,
  // petty-cash transfers, interest, a dividend and an income-tax provision.
  // ---------------------------------------------------------------------------------------------
  const J: J[] = [];
  const add = (kind: string, date: string, description: string, lines: Line[]) => J.push({ kind, date, description, lines });
  const two = (kind: string, date: string, description: string, dr: string, cr: string, amt: bigint, division?: string) =>
    add(kind, date, description, [{ code: dr, dr: amt, cr: BigInt(0), division: dr >= "4" ? division : undefined }, { code: cr, dr: BigInt(0), cr: amt, division: cr >= "4" ? division : undefined }]);
  const divisions = ["estates", "architecture", "painting", "interiors", "tech"];
  const revenue = ["4100", "4200", "4300", "4500", "4600"];
  two("capital", D(1, 2), "Share capital", "1120", "3100", BigInt(8000000000));
  two("loan", D(1, 15), "Bank loan drawn", "1120", "2510", BigInt(3000000000));
  two("asset", D(2, 3), "Computers bought", "1540", "1120", BigInt(1200000000));
  two("prepaid", D(1, 20), "Annual insurance prepaid", "1240", "1120", BigInt(240000000));
  for (let m = 1; m <= 12; m++) {
    for (let i = 0; i < 8; i++) { const d = pick(divisions); two("sale", D(m, 1 + Math.floor(rand() * 27)), "Fees received", "1120", pick(revenue), cents(300_000, 6_000_000), d); }
    for (let i = 0; i < 5; i++) { const d = pick(divisions); two("cost", D(m, 1 + Math.floor(rand() * 27)), "Site materials", pick(["5100", "5200", "5300"]), "1120", cents(100_000, 2_000_000), d); }
    two("payroll", D(m, 25), "Salaries", "6100", "1120", cents(3_000_000, 3_500_000));
    const rent = BigInt(150000000);
    two("accrual", D(m, lastDay(m)), "Rent accrued", "6200", "2120", rent);
    if (m > 1) two("payment", D(m, 5), "Rent paid", "2120", "1120", rent);
    two("depreciation", D(m, lastDay(m)), "Depreciation", "6900", "1590", m >= 2 ? BigInt(33333333) : BigInt(0));
    two("prepaid", D(m, lastDay(m)), "Insurance expensed", "6920", "1240", BigInt(20000000));
    two("bank", D(m, lastDay(m)), "Bank charges", "6910", "1120", cents(20_000, 60_000));
    two("transfer", D(m, 3), "Petty cash float", "1110", "1120", BigInt(30000000));
    two("petty", D(m, 20), "Office supplies from petty cash", "6700", "1110", cents(100_000, 290_000));
  }
  two("interest", D(6, 30), "Interest received", "1120", "7100", BigInt(45000000));
  two("finance", D(12, 31), "Loan interest", "8100", "1120", BigInt(210000000));
  two("dividend", D(9, 30), "Dividend paid", "3300", "1120", BigInt(500000000));
  const usable = J.filter((j) => j.lines.every((l) => l.dr + l.cr > BigInt(0)));
  // Tax provision at 30% of profit before tax (a fixture figure, not a tax computation).
  const pbt = usable.flatMap((j) => j.lines).filter((l) => /^[4-8]/.test(l.code)).reduce((s, l) => s + l.cr - l.dr, BigInt(0));
  const tax = (pbt * BigInt(30)) / BigInt(100);
  usable.push({ kind: "tax", date: D(12, 31), description: "Income tax provision", lines: [{ code: "8900", dr: tax, cr: BigInt(0) }, { code: "2195", dr: BigInt(0), cr: tax }] });
  usable.sort((a, b) => a.date.localeCompare(b.date));

  const t0 = Date.now();
  for (const j of usable) {
    const lines = j.lines.map((l) => ({ accountId: byCode[l.code].id, currency: "UGX", ...(l.dr ? { debit: fmt(l.dr) } : { credit: fmt(l.cr) }), ...(l.division ? { division: l.division } : {}) }));
    const s = await fn("accounting_journal_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), entryDate: j.date, description: j.description, lines })]);
    const sub = await fn("accounting_journal_command('a','prep',$1,'submit',1,'',$2,'t')", [s.id, key()]);
    const ap = await fn("accounting_journal_command('a','review',$1,'approve',$2,'',$3,'t')", [s.id, sub.version, key()]);
    await fn("accounting_journal_command('a','review',$1,'post',$2,'',$3,'t')", [s.id, ap.version, key()]);
  }
  const postMs = Date.now() - t0;
  console.log(`Posted ${usable.length} journals (${usable.reduce((n, j) => n + j.lines.length, 0)} lines) through the real workflow in ${postMs} ms`);

  // ---------------------------------------------------------------------------------------------
  // Independent reference model.
  // ---------------------------------------------------------------------------------------------
  const isPL = (code: string) => /^[4-8]/.test(code);
  const inRange = (j: J, s: string, e: string) => j.date >= s && j.date <= e;
  const balances = (s: string, e: string, filter?: (l: Line) => boolean) => {
    const open = new Map<string, bigint>(), mov = new Map<string, bigint>();
    for (const j of usable) for (const l of j.lines) {
      if (filter && !filter(l)) continue;
      if (j.date < s) open.set(l.code, (open.get(l.code) ?? BigInt(0)) + l.dr - l.cr);
      else if (j.date <= e) mov.set(l.code, (mov.get(l.code) ?? BigInt(0)) + l.dr - l.cr);
    }
    return { open, mov };
  };
  const pnl = (s: string, e: string, division?: string) => {
    const { mov } = balances(s, e, division ? (l) => l.division === division : undefined);
    const byLine = new Map<string, bigint>();
    for (const [code, v] of mov) if (isPL(code)) byLine.set(map(code).line, (byLine.get(map(code).line) ?? BigInt(0)) - v);
    const g = (k: string) => byLine.get(k) ?? BigInt(0);
    const rev = g("revenue"), cos = g("cost_of_sales"), opx = g("operating_expenses"), oth = g("other_income") + g("other_expenses") + g("finance_costs");
    return { revenue: rev, costOfSales: cos, grossProfit: rev + cos, operatingExpenses: opx, operatingProfit: rev + cos + opx, profitBeforeTax: rev + cos + opx + oth, netProfit: rev + cos + opx + oth + g("income_tax") };
  };
  const bs = (asOf: string) => {
    const { open, mov } = balances("0000-01-01", asOf);
    let assets = BigInt(0), liab = BigInt(0), equity = BigInt(0), results = BigInt(0);
    for (const [code, v0] of [...open, ...mov]) {
      const v = v0;
      const t = byCode[code].account_type;
      if (isPL(code)) results -= v; else if (t === "asset") assets += v; else if (t === "liability") liab -= v; else equity -= v;
    }
    return { totalAssets: assets, totalLiabilities: liab, equityAccounts: equity, currentPeriodResults: results };
  };
  const cash = (code: string) => map(code).line === "cash_and_bank";
  const cashFlow = (s: string, e: string) => {
    let open = BigInt(0), close = BigInt(0); const cls: Record<string, bigint> = { operating: BigInt(0), investing: BigInt(0), financing: BigInt(0) }; let transfers = BigInt(0);
    for (const j of usable) {
      const cashLines = j.lines.filter((l) => cash(l.code));
      const net = cashLines.reduce((x, l) => x + l.dr - l.cr, BigInt(0));
      if (j.date < s) open += net;
      if (j.date <= e) close += net;
      if (!inRange(j, s, e) || !cashLines.length) continue;
      if (j.lines.every((l) => cash(l.code))) { transfers += cashLines.reduce((x, l) => x + l.cr, BigInt(0)); continue; }
      for (const l of j.lines) if (!cash(l.code)) cls[map(l.code).cashflow!] += l.cr - l.dr;
    }
    return { openingCash: open, closingCash: close, ...cls, internalTransfers: transfers };
  };

  console.log("comparing reports...");
  const months = Array.from({ length: 12 }, (_, i) => ({ s: D(i + 1, 1), e: D(i + 1, lastDay(i + 1)) }));
  const ranges = [...months, { s: D(1, 1), e: D(12, 31) }];
  for (const r of ranges) {
    const tr = Date.now();
    const sys = await fn("fs_income_statement('a',$1::date,$2::date)", [r.s, r.e]);
    const ref = pnl(r.s, r.e);
    for (const [k, v] of Object.entries(ref)) compare("income", `${r.s}..${r.e} ${k}`, sys[k], v);
    const sb = await fn("fs_balance_sheet('a',$1::date)", [r.e]);
    const rb = bs(r.e);
    for (const [k, v] of Object.entries(rb)) compare("balance", `${r.e} ${k}`, sb[k], v);
    if (sb.balanced !== true) differences.push({ report: "balance", item: `${r.e} equation`, system: String(sb.difference), reference: "0.00", classification: "balance sheet does not balance" });
    const sc = await fn("fs_cash_flow('a',$1::date,$2::date)", [r.s, r.e]);
    const rc = cashFlow(r.s, r.e);
    for (const [k, v] of Object.entries(rc)) compare("cashflow", `${r.s}..${r.e} ${k}`, sc[k], v);
    const tb = await fn("fs_trial_balance('a',$1::date,$2::date)", [r.s, r.e]);
    const { open, mov } = balances(r.s, r.e);
    for (const row of tb.rows as { code: string; debit: string; credit: string; closingDebit: string; closingCredit: string }[]) {
      const refMov = mov.get(row.code) ?? BigInt(0);
      compare("trial", `${r.s}..${r.e} ${row.code} movement`, toC(row.debit) - toC(row.credit), refMov);
      compare("trial", `${r.s}..${r.e} ${row.code} closing`, toC(row.closingDebit) - toC(row.closingCredit), (open.get(row.code) ?? BigInt(0)) + refMov);
    }
    console.log(`  ${r.s}..${r.e} compared in ${Date.now() - tr} ms`);
    if (!tb.balanced) differences.push({ report: "trial", item: `${r.s}..${r.e}`, system: "unbalanced", reference: "balanced", classification: "trial balance does not agree" });
  }
  for (const d of divisions) {
    const sys = await fn("fs_income_statement('a',$1::date,$2::date,$3,NULL)", [D(1, 1), D(12, 31), d]);
    compare("division", `${d} net`, sys.netProfit, pnl(D(1, 1), D(12, 31), d).netProfit);
  }
  // General ledger: every generated line is in the ledger exactly once.
  const gl = (await q<{ n: number; d: string; c: string }>("SELECT count(*)::int AS n,sum(functional_debit)::text AS d,sum(functional_credit)::text AS c FROM accounting_journal_lines l JOIN accounting_journals j ON j.id=l.journal_id AND j.status='posted' WHERE l.organization_id='a'"))[0];
  assert.equal(gl.n, usable.reduce((n, j) => n + j.lines.length, 0), "general ledger line count");
  compare("ledger", "total debits", gl.d, usable.flatMap((j) => j.lines).reduce((s, l) => s + l.dr, BigInt(0)));
  compare("ledger", "total credits", gl.c, usable.flatMap((j) => j.lines).reduce((s, l) => s + l.cr, BigInt(0)));
  // Subledger-type balances: payables-type accrual, prepaid, fixed assets, tax liability.
  const bal = (code: string, asOf: string) => usable.filter((j) => j.date <= asOf).flatMap((j) => j.lines).filter((l) => l.code === code).reduce((s, l) => s + l.dr - l.cr, BigInt(0));
  for (const code of ["2120", "1240", "1540", "1590", "2195", "2510", "1110"]) {
    const sys = (await q<{ v: string }>("SELECT coalesce(sum(closing),0)::text AS v FROM fs_account_balances('a',$1::date,$1::date) WHERE code=$2", [D(12, 31), code]))[0].v;
    compare("subledger", `${code} at year end`, sys, bal(code, D(12, 31)));
  }

  // ---------------------------------------------------------------------------------------------
  // Close every month, then the year; check retained earnings and carry-forward against the model.
  // ---------------------------------------------------------------------------------------------
  const periods = await q<{ id: string }>("SELECT id FROM accounting_periods WHERE organization_id='a' AND fiscal_year=$1 ORDER BY start_date", [Y]);
  const ver = async (cid: string) => (await q<{ version: number }>("SELECT version FROM period_closes WHERE id=$1", [cid]))[0].version;
  const tClose = Date.now();
  const closeIds: string[] = [];
  for (const [i, p] of periods.entries()) {
    console.log(`  closing period ${i + 1} (${Date.now() - tClose} ms)`);
    const c = await fn("period_close_start('a','prep',$1::uuid,$2,'t')", [p.id, key()]);
    await fn("period_close_evidence_add('a','prep',$1::uuid,$2::jsonb,'t')", [c.id, JSON.stringify({ key: key(), item: "Bank statements", reference: `Statement ${i + 1} (synthetic)` })]);
    if (i === 11) {
      const x = await fn("period_close_exception_raise('a','prep',$1::uuid,$2::jsonb,'t')", [c.id, JSON.stringify({ key: key(), checkKey: "tax_provision", explanation: "Fixture provision at 30%; no Phase 2D computation in this synthetic run" })]);
      await fn("period_close_exception_decide('a','review',$1::uuid,'approve','Accepted for the synthetic run',$2,'t')", [x.id, key()]);
    }
    await fn("period_close_command('a','prep',$1::uuid,'submit',$2,'Ready',$3,'t')", [c.id, await ver(c.id), key()]);
    if (i < 11) await fn("period_close_command('a','review',$1::uuid,'approve',$2,'ok',$3,'t')", [c.id, await ver(c.id), key()]);
    closeIds.push(c.id);
  }
  const closeMs = Date.now() - tClose;
  const set = await fn("fs_statement_set_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), kind: "year", periodStart: D(1, 1), periodEnd: D(12, 31) })]);
  assert.deepEqual(set.problems, [], "annual statements have no problems");
  await fn("fs_statement_set_decide('a','review',$1::uuid,'approve','Agreed to the independent model',$2,'t')", [set.id, key()]);
  const ye = await fn("year_end_prepare('a','prep',$1,$2::jsonb,'t')", [Y, JSON.stringify({ key: key(), statementSetId: set.id })]);
  const refNet = pnl(D(1, 1), D(12, 31)).netProfit;
  compare("year-end", "result transferred", ye.netResult, refNet);
  await fn("year_end_decide('a','review',$1::uuid,'approve','ok',$2,'t')", [ye.id, key()]);
  const re = (await q<{ v: string }>("SELECT coalesce(-sum(closing),0)::text AS v FROM fs_account_balances('a',$1::date,$1::date) WHERE code='3200'", [D(12, 31)]))[0].v;
  compare("year-end", "retained earnings", re, refNet);
  const plLeft = (await q<{ v: string }>("SELECT coalesce(sum(closing),0)::text AS v FROM fs_account_balances('a',$1::date,$1::date) WHERE account_type IN ('income','other_income','cost_of_sales','operating_expense','other_expense')", [D(12, 31)]))[0].v;
  compare("year-end", "income and expense balances after closing", plLeft, BigInt(0));
  const nextTb = await fn("fs_trial_balance('a',$1::date,$2::date)", [D(1, 1, Y + 1), D(1, 31, Y + 1)]);
  for (const row of nextTb.rows as { code: string; openingDebit: string; openingCredit: string }[]) {
    const refOpen = isPL(row.code) ? BigInt(0) : bal(row.code, D(12, 31)) + (row.code === "3200" ? -refNet : BigInt(0));
    compare("carry-forward", `${row.code} opening`, toC(row.openingDebit) - toC(row.openingCredit), refOpen);
  }
  const yearPnl = await fn("fs_income_statement('a',$1::date,$2::date)", [D(1, 1), D(12, 31)]);
  compare("year-end", "income statement unchanged by closing", yearPnl.netProfit, refNet);
  assert.equal((await q<{ n: number }>("SELECT count(*)::int AS n FROM accounting_journals WHERE organization_id='a' AND idempotency_key LIKE 'ye:%'"))[0].n, 1, "one closing journal");

  // A correction affecting an approved period marks that approval as stale and needs a new approval.
  const mar = await fn("fs_statement_set_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), kind: "month", periodStart: D(1, 1, Y + 1), periodEnd: D(1, 31, Y + 1) })]);
  await fn("fs_statement_set_decide('a','review',$1::uuid,'approve','ok',$2,'t')", [mar.id, key()]);
  const corr = { date: D(1, 20, Y + 1), lines: [{ accountId: byCode["6200"].id, debit: "1000.00", currency: "UGX" }, { accountId: byCode["1120"].id, credit: "1000.00", currency: "UGX" }] };
  const cj = await fn("accounting_journal_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), entryDate: corr.date, description: "Late correction", lines: corr.lines })]);
  const cs = await fn("accounting_journal_command('a','prep',$1,'submit',1,'',$2,'t')", [cj.id, key()]);
  const ca = await fn("accounting_journal_command('a','review',$1,'approve',$2,'',$3,'t')", [cj.id, cs.version, key()]);
  await fn("accounting_journal_command('a','review',$1,'post',$2,'',$3,'t')", [cj.id, ca.version, key()]);
  const stale = (await q<{ stale: boolean; status: string }>("SELECT status, ledger_fingerprint <> fs_ledger_fingerprint(organization_id, period_end) AS stale FROM fs_statement_sets WHERE id=$1", [mar.id]))[0];
  assert.deepEqual(stale, { status: "approved", stale: true }, "the earlier approval is visibly stale after the correction");
  const mar2 = await fn("fs_statement_set_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), kind: "month", periodStart: D(1, 1, Y + 1), periodEnd: D(1, 31, Y + 1) })]);
  await fn("fs_statement_set_decide('a','review',$1::uuid,'approve','Re-approved after correction',$2,'t')", [mar2.id, key()]);
  assert.equal((await q<{ status: string }>("SELECT status FROM fs_statement_sets WHERE id=$1", [mar.id]))[0].status, "superseded");

  const evidence = {
    run: "synthetic", financialYear: Y, journals: usable.length, lines: usable.reduce((n, j) => n + j.lines.length, 0),
    comparedFigures: "income statement, balance sheet, cash flow and trial balance for 12 months and the year; 5 division results; ledger totals; 7 account balances; year-end transfer, retained earnings, closed P&L, next-year opening balances",
    netProfit: fmt(refNet), totalAssets: fmt(bs(D(12, 31)).totalAssets), closingCash: fmt(cashFlow(D(1, 1), D(12, 31)).closingCash), retainedEarnings: re,
    postMs, closeMs, differences,
  };
  await mkdir("tmp", { recursive: true });
  await writeFile("tmp/parallel-run-evidence.json", JSON.stringify(evidence, null, 2));
  if (differences.length) { console.table(differences.slice(0, 30)); assert.fail(`${differences.length} unexplained difference(s) between the system and the independent model`); }
  console.log(`Parallel run: ${usable.length} journals; net profit ${fmt(refNet)}; every compared figure agrees with the independent model (0 differences). Period closes ${closeMs} ms.`);
} finally {
  await db.close();
}
