// Financial statement structure shared by the database tests and the application: statement lines,
// cash-flow classes, the default classification PROPOSAL derived from the chart of accounts, and
// small formatting helpers. Nothing here posts or computes balances: the database does that from the
// posted ledger. A proposal only takes effect after a second person approves it.

export type AccountType = "asset" | "liability" | "equity" | "income" | "cost_of_sales" | "operating_expense" | "other_income" | "other_expense";
export type CashFlowClass = "operating" | "investing" | "financing";

export const statementLines = {
  revenue: { label: "Revenue", statement: "income" },
  cost_of_sales: { label: "Cost of sales", statement: "income" },
  operating_expenses: { label: "Operating expenses", statement: "income" },
  other_income: { label: "Other income", statement: "income" },
  other_expenses: { label: "Other expenses", statement: "income" },
  finance_costs: { label: "Finance costs", statement: "income" },
  income_tax: { label: "Income tax expense", statement: "income" },
  cash_and_bank: { label: "Cash and cash equivalents", statement: "balance" },
  receivables: { label: "Trade and other receivables", statement: "balance" },
  advances_prepayments: { label: "Advances and prepayments", statement: "balance" },
  inventory: { label: "Inventories", statement: "balance" },
  tax_assets: { label: "Tax assets", statement: "balance" },
  other_assets: { label: "Other current assets", statement: "balance" },
  ppe_cost: { label: "Property, plant and equipment (cost)", statement: "balance" },
  accumulated_depreciation: { label: "Accumulated depreciation", statement: "balance" },
  payables: { label: "Trade payables", statement: "balance" },
  accrued_expenses: { label: "Accrued expenses", statement: "balance" },
  customer_advances: { label: "Customer deposits and advances", statement: "balance" },
  tax_liabilities: { label: "Tax liabilities", statement: "balance" },
  borrowings: { label: "Borrowings", statement: "balance" },
  other_liabilities: { label: "Other liabilities", statement: "balance" },
  share_capital: { label: "Share capital", statement: "balance" },
  retained_earnings: { label: "Retained earnings", statement: "balance" },
  distributions: { label: "Dividends and drawings", statement: "balance" },
  opening_balance_equity: { label: "Opening balance equity", statement: "balance" },
  other_equity: { label: "Other reserves", statement: "balance" },
} as const;
export type StatementLine = keyof typeof statementLines;

export const incomeLineOrder: StatementLine[] = ["revenue", "cost_of_sales", "operating_expenses", "other_income", "other_expenses", "finance_costs", "income_tax"];
export const assetLineOrder: StatementLine[] = ["cash_and_bank", "receivables", "advances_prepayments", "inventory", "tax_assets", "other_assets", "ppe_cost", "accumulated_depreciation"];
export const liabilityLineOrder: StatementLine[] = ["payables", "accrued_expenses", "customer_advances", "tax_liabilities", "borrowings", "other_liabilities"];
export const equityLineOrder: StatementLine[] = ["share_capital", "retained_earnings", "distributions", "opening_balance_equity", "other_equity"];

/** Mirrors fs_line_fits in migration 0023: which lines an account of a given type may use. */
export function lineFits(type: AccountType, contra: boolean, line: StatementLine): boolean {
  switch (line) {
    case "revenue": return type === "income";
    case "cost_of_sales": return type === "cost_of_sales";
    case "operating_expenses": return type === "operating_expense";
    case "other_income": return type === "other_income" || type === "income";
    case "other_expenses": case "finance_costs": case "income_tax": return type === "other_expense" || type === "operating_expense";
    case "accumulated_depreciation": return type === "asset" && contra;
    case "cash_and_bank": case "ppe_cost": return type === "asset" && !contra;
    case "receivables": case "advances_prepayments": case "inventory": case "tax_assets": case "other_assets": return type === "asset";
    case "payables": case "accrued_expenses": case "customer_advances": case "tax_liabilities": case "borrowings": case "other_liabilities": return type === "liability";
    default: return type === "equity";
  }
}

export type ClassificationEntry = { line: StatementLine; cashflow: CashFlowClass | null; clearing: boolean };
export type ChartAccount = { id: string; code: string; accountType: AccountType; isContra: boolean; isPostable: boolean; reportingClass: string | null };

/**
 * A starting proposal from the account codes of the Calacot chart. It is a suggestion for the
 * accountant to review line by line, never an approved policy.
 */
export function proposeClassification(accounts: ChartAccount[]): Record<string, ClassificationEntry> {
  const out: Record<string, ClassificationEntry> = {};
  for (const a of accounts) {
    if (!a.isPostable) continue;
    const c = a.code;
    const e = (line: StatementLine, cashflow: CashFlowClass | null, clearing = false): ClassificationEntry => ({ line, cashflow, clearing });
    let entry: ClassificationEntry;
    switch (a.accountType) {
      case "asset":
        if (/^11[123]/.test(c) && !a.isContra) entry = e("cash_and_bank", null);
        else if (c.startsWith("114")) entry = e("other_assets", "operating", true);
        else if (/^1[56]/.test(c)) entry = a.isContra ? e("accumulated_depreciation", "investing") : e("ppe_cost", "investing");
        else if (c.startsWith("124") || c.startsWith("123")) entry = e("advances_prepayments", "operating");
        else if (c.startsWith("125")) entry = e("inventory", "operating");
        else if (c.startsWith("127") || c.startsWith("128")) entry = e("tax_assets", "operating");
        else if (/^12[0126]/.test(c)) entry = e("receivables", "operating");
        else entry = a.reportingClass === "non_current_asset" ? e(a.isContra ? "accumulated_depreciation" : "ppe_cost", "investing") : e("other_assets", "operating");
        break;
      case "liability":
        if (c.startsWith("211")) entry = e("payables", "operating");
        else if (c.startsWith("212") || c.startsWith("215")) entry = e("accrued_expenses", "operating");
        else if (c.startsWith("213") || c.startsWith("214")) entry = e("customer_advances", "operating");
        else if (/^21[6-9]/.test(c)) entry = e("tax_liabilities", "operating");
        else if (c.startsWith("22") || c.startsWith("25")) entry = e("borrowings", "financing");
        else entry = e("other_liabilities", "operating");
        break;
      case "equity":
        if (c.startsWith("31")) entry = e("share_capital", "financing");
        else if (c.startsWith("32")) entry = e("retained_earnings", null);
        else if (c.startsWith("33")) entry = e("distributions", "financing");
        else if (c.startsWith("39")) entry = e("opening_balance_equity", null);
        else entry = e("other_equity", null);
        break;
      case "income": entry = e("revenue", "operating"); break;
      case "cost_of_sales": entry = e("cost_of_sales", "operating"); break;
      case "operating_expense": entry = e("operating_expenses", "operating"); break;
      case "other_income": entry = e("other_income", c.startsWith("73") ? "investing" : "operating"); break;
      default:
        if (a.reportingClass === "income_tax_expense") entry = e("income_tax", "operating");
        else if (a.reportingClass === "finance_cost") entry = e("finance_costs", "operating");
        else entry = e("other_expenses", c.startsWith("83") ? "investing" : "operating");
    }
    out[a.id] = entry;
  }
  return out;
}

/** Statement kinds and their date ranges. */
export const statementKinds = { month: "Month", quarter: "Quarter", year: "Financial year", custom: "Custom range" } as const;
export type StatementKind = keyof typeof statementKinds;

export const reportTypes = {
  income: "Income statement",
  balance: "Balance sheet",
  cashflow: "Cash flow statement",
  equity: "Changes in equity",
  trial: "Trial balance",
  divisions: "Division results",
  projects: "Project results",
} as const;
export type ReportType = keyof typeof reportTypes;

export const closeCheckLabels: Record<string, string> = {
  prior_periods: "Earlier periods closed",
  pending_journals: "Journals awaiting approval or posting",
  draft_journals: "Draft journals",
  integration_events: "Source transactions processed",
  receivables_payables: "Receivables and payables reconciled",
  bank_reconciliation: "Bank reconciliations finalized",
  cash_counts: "Cash counted",
  depreciation: "Depreciation posted",
  pending_source_journals: "Tax and asset journals approved",
  tax_provision: "Year-end tax provision reviewed",
  clearing_accounts: "Clearing accounts cleared",
  trial_balance: "Trial balance agrees",
  classification: "Accounts classified",
  foreign_currency: "Foreign-currency postings",
  evidence: "Close evidence recorded",
};
export const exceptableChecks = ["draft_journals", "integration_events", "receivables_payables", "bank_reconciliation", "cash_counts", "depreciation",
  "pending_source_journals", "tax_provision", "clearing_accounts", "classification", "foreign_currency", "evidence"] as const;

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/**
 * Flattens a statement computed by the database into export rows (section, code, account, amount,
 * comparative). Amounts are copied as returned; nothing is recalculated.
 */
export function flattenStatement(report: ReportType, cur: J, cmp: J | null): string[][] {
  const out: string[][] = [];
  const c = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const lineRows = (order: StatementLine[]) => {
    for (const line of order) {
      const a: J[] = cur.lines?.[line] ?? [], b: J[] = cmp?.lines?.[line] ?? [];
      if (!a.length && !b.length) continue;
      out.push([statementLines[line].label, "", "Total", c(cur.lineTotals?.[line] ?? "0"), cmp ? c(cmp.lineTotals?.[line] ?? "0") : ""]);
      const ids = [...new Set([...a, ...b].map((x) => x.accountId))];
      for (const id of ids) { const x = a.find((y) => y.accountId === id) ?? b.find((y) => y.accountId === id)!; out.push([statementLines[line].label, x.code, x.name, c(a.find((y) => y.accountId === id)?.amount ?? "0"), cmp ? c(b.find((y) => y.accountId === id)?.amount ?? "0") : ""]); }
    }
  };
  const totals = (pairs: [string, string][]) => { for (const [label, k] of pairs) out.push(["Total", "", label, c(cur[k]), cmp ? c(cmp[k]) : ""]); };
  if (report === "income") {
    lineRows(incomeLineOrder);
    totals([["Gross profit", "grossProfit"], ["Operating profit", "operatingProfit"], ["Profit before tax", "profitBeforeTax"], ["Profit for the period", "netProfit"]]);
  } else if (report === "balance") {
    lineRows([...assetLineOrder, ...liabilityLineOrder, ...equityLineOrder]);
    totals([["Total assets", "totalAssets"], ["Total liabilities", "totalLiabilities"], ["Results not yet closed", "currentPeriodResults"], ["Total equity", "totalEquity"], ["Total liabilities and equity", "totalLiabilitiesAndEquity"], ["Difference", "difference"]]);
  } else if (report === "cashflow") {
    for (const k of ["operating", "investing", "financing"]) for (const [name, v] of Object.entries((cur.detail?.[k] ?? {}) as Record<string, string>)) out.push([k, "", name, c(v), cmp ? c(cmp.detail?.[k]?.[name] ?? "0") : ""]);
    totals([["Opening cash", "openingCash"], ["Operating", "operating"], ["Investing", "investing"], ["Financing", "financing"], ["Unclassified", "unclassifiedTotal"], ["Closing cash", "closingCash"], ["Internal transfers (excluded)", "internalTransfers"]]);
  } else if (report === "equity") {
    totals([["Equity at the start", "openingEquity"], ["Capital introduced", "capitalIntroduced"], ["Dividends and drawings", "distributions"], ["Profit for the period", "profitForPeriod"], ["Prior-period corrections", "priorPeriodCorrections"], ["Other movements", "otherMovements"], ["Year-end transfers (within equity)", "yearEndTransfers"], ["Equity at the end", "closingEquity"]]);
  } else if (report === "trial") {
    for (const r of cur.rows as J[]) out.push(["Trial balance", r.code, r.name, c(r.closingDebit), c(r.closingCredit)]);
    out.push(["Total", "", "Closing debits / credits", c(cur.totals.closingDebit), c(cur.totals.closingCredit)]);
  } else if (report === "divisions") {
    for (const d of cur.divisions as J[]) out.push(["Division", "", d.division, c(d.netProfit), c(d.allocatedOverhead ?? "")]);
    out.push(["Shared", "", "Not assigned to a division", c(cur.sharedNet), ""]);
  } else {
    for (const d of cur.projects as J[]) out.push(["Project", "", d.name, c(d.netProfit), ""]);
  }
  return out;
}

export const comparisonModes = { none: "No comparison", prior_period: "Previous period", prior_year: "Same period last year" } as const;
export type ComparisonMode = keyof typeof comparisonModes;

const addMonths = (iso: string, months: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = y * 12 + (m - 1) + months;
  const ny = Math.floor(t / 12), nm = (t % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
};
const isMonthStart = (iso: string) => iso.endsWith("-01");
const isMonthEnd = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() === d; };
const dayShift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const monthEnd = (iso: string) => { const [y, m] = iso.split("-").map(Number); return `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };

/** The comparative range for a statement range, or null. Whole-month ranges compare by months. */
export function comparativeRange(from: string, to: string, mode: ComparisonMode): { from: string; to: string } | null {
  if (mode === "none") return null;
  if (mode === "prior_year") return { from: addMonths(from, -12), to: isMonthEnd(to) ? monthEnd(addMonths(to, -12)) : addMonths(to, -12) };
  if (isMonthStart(from) && isMonthEnd(to)) {
    const [fy, fm] = from.split("-").map(Number), [ty, tm] = to.split("-").map(Number);
    const months = (ty * 12 + tm) - (fy * 12 + fm) + 1;
    return { from: addMonths(from, -months), to: dayShift(from, -1) };
  }
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  return { from: dayShift(from, -days), to: dayShift(from, -1) };
}

/** Date range of a statement kind ending in the month of `end` (YYYY-MM-DD), given the fiscal start month. */
export function rangeFor(kind: Exclude<StatementKind, "custom">, end: string, fiscalStartMonth: number): { start: string; end: string } {
  const [y, m] = end.split("-").map(Number);
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const iso = (yy: number, mm: number, dd: number) => `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const back = (months: number) => { const t = y * 12 + (m - 1) - months; return [Math.floor(t / 12), (t % 12) + 1] as const; };
  const endIso = iso(y, m, last(y, m));
  if (kind === "month") return { start: iso(y, m, 1), end: endIso };
  if (kind === "quarter") { const [sy, sm] = back(2); return { start: iso(sy, sm, 1), end: endIso }; }
  // The whole financial year that contains this month.
  const offset = ((m - fiscalStartMonth) % 12 + 12) % 12;
  const [sy, sm] = back(offset);
  const t = sy * 12 + (sm - 1) + 11;
  const ey = Math.floor(t / 12), em = (t % 12) + 1;
  return { start: iso(sy, sm, 1), end: iso(ey, em, last(ey, em)) };
}
