import { accountCodePattern, isValidClassification, normalBalanceFor, type AccountType } from "./engine";

/**
 * PROPOSED Calacot chart of accounts (Phase 2A). Not approved.
 *
 * Accounts are company-wide and classified by nature. Painting, Architecture, Interiors, Estates
 * and Technology are NOT separate accounts: every journal line carries an optional division and
 * project as analytical dimensions, so division results come from the same accounts.
 *
 * Loading this chart creates accounts with status "proposed". They cannot receive postings until
 * a second authorized person (intended: the company accountant) approves them. Tax-related
 * accounts are placeholders only: no tax rule is computed anywhere in Phase 2A.
 * See docs/CALACOT_CHART_OF_ACCOUNTS.md.
 */
export type ProposedAccount = {
  code: string;
  name: string;
  accountType: AccountType;
  reportingClass: string | null;
  parentCode?: string;
  isPostable?: boolean;
  isContra?: boolean;
  /** False for control accounts maintained only by sub-ledger postings (receivables, payables). */
  manualPostingAllowed?: boolean;
  currency?: "UGX" | "USD";
  description?: string;
  /** Requires confirmation by the accountant or tax adviser before activation. */
  confirm?: string;
};

const header = (code: string, name: string, accountType: AccountType, parentCode?: string): ProposedAccount => ({
  code, name, accountType, reportingClass: null, parentCode, isPostable: false,
});

export const proposedChart: ProposedAccount[] = [
  // 1000 Assets
  header("1000", "Assets", "asset"),
  header("1100", "Current assets", "asset", "1000"),
  { code: "1110", name: "Petty cash", accountType: "asset", reportingClass: "current_asset", parentCode: "1100", description: "Office and site petty cash floats." },
  { code: "1120", name: "Bank - UGX operating account", accountType: "asset", reportingClass: "current_asset", parentCode: "1100", currency: "UGX", description: "One ledger account per verified bank account; rename or add accounts to match the registered payment accounts." },
  { code: "1121", name: "Bank - USD account", accountType: "asset", reportingClass: "current_asset", parentCode: "1100", currency: "USD", description: "Cannot receive postings while multi-currency posting is disabled.", confirm: "Requires approved exchange-rate policy before use." },
  { code: "1130", name: "Mobile money wallets", accountType: "asset", reportingClass: "current_asset", parentCode: "1100", currency: "UGX" },
  { code: "1140", name: "Cash in transit / undeposited receipts", accountType: "asset", reportingClass: "current_asset", parentCode: "1100", description: "Clearing account for receipts not yet banked." },
  { code: "1200", name: "Trade receivables", accountType: "asset", reportingClass: "current_asset", parentCode: "1100", manualPostingAllowed: false, description: "Control account. Maintained from issued invoices, payment allocations and credit notes only." },
  { code: "1210", name: "Allowance for expected credit losses", accountType: "asset", reportingClass: "current_asset", parentCode: "1100", isContra: true, confirm: "Impairment policy required." },
  { code: "1220", name: "Other receivables", accountType: "asset", reportingClass: "current_asset", parentCode: "1100" },
  { code: "1230", name: "Staff advances and imprests", accountType: "asset", reportingClass: "current_asset", parentCode: "1100" },
  { code: "1240", name: "Prepayments and deposits paid", accountType: "asset", reportingClass: "current_asset", parentCode: "1100" },
  { code: "1250", name: "Materials and supplies inventory", accountType: "asset", reportingClass: "current_asset", parentCode: "1100", description: "Paints, finishes and site materials held for projects.", confirm: "Inventory costing method required." },
  { code: "1255", name: "Property held for sale", accountType: "asset", reportingClass: "current_asset", parentCode: "1100", description: "Estates properties acquired or developed for resale.", confirm: "Confirm whether Estates holds property as inventory, investment property or agent only." },
  { code: "1260", name: "Contract assets and unbilled work", accountType: "asset", reportingClass: "current_asset", parentCode: "1100", confirm: "Revenue-recognition policy required." },
  { code: "1270", name: "VAT recoverable (input VAT)", accountType: "asset", reportingClass: "current_asset", parentCode: "1100", confirm: "Tax adviser to confirm VAT registration and treatment. No tax is computed." },
  { code: "1280", name: "Withholding tax receivable", accountType: "asset", reportingClass: "current_asset", parentCode: "1100", confirm: "Tax adviser to confirm. No tax is computed." },
  header("1500", "Non-current assets", "asset", "1000"),
  { code: "1510", name: "Land and buildings", accountType: "asset", reportingClass: "non_current_asset", parentCode: "1500" },
  { code: "1520", name: "Motor vehicles", accountType: "asset", reportingClass: "non_current_asset", parentCode: "1500" },
  { code: "1530", name: "Furniture and office equipment", accountType: "asset", reportingClass: "non_current_asset", parentCode: "1500" },
  { code: "1540", name: "Computer equipment", accountType: "asset", reportingClass: "non_current_asset", parentCode: "1500" },
  { code: "1550", name: "Tools and site equipment", accountType: "asset", reportingClass: "non_current_asset", parentCode: "1500" },
  { code: "1590", name: "Accumulated depreciation", accountType: "asset", reportingClass: "non_current_asset", parentCode: "1500", isContra: true, confirm: "Depreciation policy required." },
  { code: "1610", name: "Software and intangible assets", accountType: "asset", reportingClass: "non_current_asset", parentCode: "1500" },
  { code: "1690", name: "Accumulated amortisation", accountType: "asset", reportingClass: "non_current_asset", parentCode: "1500", isContra: true },

  // 2000 Liabilities
  header("2000", "Liabilities", "liability"),
  header("2100", "Current liabilities", "liability", "2000"),
  { code: "2110", name: "Trade payables", accountType: "liability", reportingClass: "current_liability", parentCode: "2100", manualPostingAllowed: false, description: "Control account for supplier balances." },
  { code: "2120", name: "Accrued expenses", accountType: "liability", reportingClass: "current_liability", parentCode: "2100" },
  { code: "2130", name: "Customer deposits and advances", accountType: "liability", reportingClass: "current_liability", parentCode: "2100", description: "Payments received before the related work is invoiced or delivered.", confirm: "Revenue-recognition policy required." },
  { code: "2140", name: "Unallocated customer receipts", accountType: "liability", reportingClass: "current_liability", parentCode: "2100", manualPostingAllowed: false, description: "Clearing account: confirmed payments not yet allocated to invoices." },
  { code: "2150", name: "Staff reimbursements payable", accountType: "liability", reportingClass: "current_liability", parentCode: "2100" },
  { code: "2160", name: "PAYE payable", accountType: "liability", reportingClass: "current_liability", parentCode: "2100", confirm: "Payroll is outside this system; confirm before use." },
  { code: "2170", name: "NSSF payable", accountType: "liability", reportingClass: "current_liability", parentCode: "2100", confirm: "Payroll is outside this system; confirm before use." },
  { code: "2180", name: "VAT payable (output VAT)", accountType: "liability", reportingClass: "current_liability", parentCode: "2100", confirm: "Tax adviser to confirm VAT registration and treatment. No tax is computed." },
  { code: "2190", name: "Withholding tax payable", accountType: "liability", reportingClass: "current_liability", parentCode: "2100", confirm: "Tax adviser to confirm. No tax is computed." },
  { code: "2195", name: "Income tax payable", accountType: "liability", reportingClass: "current_liability", parentCode: "2100", confirm: "Tax adviser to confirm." },
  { code: "2200", name: "Short-term borrowings", accountType: "liability", reportingClass: "current_liability", parentCode: "2100" },
  header("2500", "Non-current liabilities", "liability", "2000"),
  { code: "2510", name: "Long-term borrowings", accountType: "liability", reportingClass: "non_current_liability", parentCode: "2500" },
  { code: "2520", name: "Shareholder and director loans", accountType: "liability", reportingClass: "non_current_liability", parentCode: "2500" },

  // 3000 Equity
  header("3000", "Equity", "equity"),
  { code: "3100", name: "Share capital", accountType: "equity", reportingClass: "equity", parentCode: "3000" },
  { code: "3200", name: "Retained earnings", accountType: "equity", reportingClass: "equity", parentCode: "3000", description: "Year-end close process is not implemented in Phase 2A." },
  { code: "3300", name: "Dividends and owner drawings", accountType: "equity", reportingClass: "equity", parentCode: "3000", isContra: true },
  { code: "3900", name: "Opening balance equity", accountType: "equity", reportingClass: "equity", parentCode: "3000", description: "Reserved for the approved QuickBooks opening-balance migration. No opening balances are created in Phase 2A.", confirm: "Use only for accountant-approved migration balances." },

  // 4000 Income (by nature; division is a dimension)
  header("4000", "Income", "income"),
  { code: "4100", name: "Design and consultancy fees", accountType: "income", reportingClass: "operating_revenue", parentCode: "4000", description: "Architecture and interior design, drawings, supervision and advisory services." },
  { code: "4200", name: "Contract and installation works", accountType: "income", reportingClass: "operating_revenue", parentCode: "4000", description: "Painting, fit-out and construction works.", confirm: "Revenue-recognition policy for contracts (point in time vs over time) required." },
  { code: "4300", name: "Design plan sales", accountType: "income", reportingClass: "operating_revenue", parentCode: "4000", description: "Ready-made architectural designs sold through the website." },
  { code: "4400", name: "Property sales", accountType: "income", reportingClass: "operating_revenue", parentCode: "4000", confirm: "Confirm whether Estates sells property as principal." },
  { code: "4410", name: "Agency and brokerage commissions", accountType: "income", reportingClass: "operating_revenue", parentCode: "4000" },
  { code: "4500", name: "Property management and rental income", accountType: "income", reportingClass: "operating_revenue", parentCode: "4000" },
  { code: "4600", name: "Technology services and software", accountType: "income", reportingClass: "operating_revenue", parentCode: "4000" },
  { code: "4900", name: "Sales discounts and credit notes", accountType: "income", reportingClass: "operating_revenue", parentCode: "4000", isContra: true, description: "Contra-revenue for issued credit notes and discounts." },

  // 5000 Cost of sales
  header("5000", "Cost of sales", "cost_of_sales"),
  { code: "5100", name: "Direct materials and supplies", accountType: "cost_of_sales", reportingClass: "cost_of_sales", parentCode: "5000" },
  { code: "5200", name: "Subcontractors and direct labour", accountType: "cost_of_sales", reportingClass: "cost_of_sales", parentCode: "5000" },
  { code: "5300", name: "Site and project expenses", accountType: "cost_of_sales", reportingClass: "cost_of_sales", parentCode: "5000", description: "Site transport, equipment hire and other costs traceable to a project." },
  { code: "5400", name: "Cost of property sold", accountType: "cost_of_sales", reportingClass: "cost_of_sales", parentCode: "5000" },
  { code: "5500", name: "Software, hosting and licences (direct)", accountType: "cost_of_sales", reportingClass: "cost_of_sales", parentCode: "5000" },

  // 6000 Operating expenses
  header("6000", "Operating expenses", "operating_expense"),
  { code: "6100", name: "Salaries and wages", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },
  { code: "6110", name: "Staff benefits and employer NSSF", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },
  { code: "6200", name: "Rent and utilities", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },
  { code: "6300", name: "Marketing and advertising", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },
  { code: "6400", name: "Transport and travel", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },
  { code: "6500", name: "Communication and internet", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },
  { code: "6600", name: "Professional fees", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000", description: "Legal, audit, accounting and consultancy." },
  { code: "6700", name: "Office supplies and stationery", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },
  { code: "6800", name: "Repairs and maintenance", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },
  { code: "6900", name: "Depreciation and amortisation", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },
  { code: "6910", name: "Bank and mobile-money charges", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },
  { code: "6920", name: "Insurance", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },
  { code: "6930", name: "Licences, permits and subscriptions", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },
  { code: "6940", name: "Expected credit losses and bad debts", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },
  { code: "6990", name: "General and administrative expenses", accountType: "operating_expense", reportingClass: "operating_expense", parentCode: "6000" },

  // 7000 Other income
  header("7000", "Other income", "other_income"),
  { code: "7100", name: "Interest income", accountType: "other_income", reportingClass: "other_income", parentCode: "7000" },
  { code: "7200", name: "Foreign exchange gains", accountType: "other_income", reportingClass: "other_income", parentCode: "7000", confirm: "Exchange-difference policy required." },
  { code: "7300", name: "Gain on disposal of assets", accountType: "other_income", reportingClass: "other_income", parentCode: "7000" },
  { code: "7900", name: "Sundry income", accountType: "other_income", reportingClass: "other_income", parentCode: "7000" },

  // 8000 Other expenses
  header("8000", "Other expenses", "other_expense"),
  { code: "8100", name: "Interest and finance costs", accountType: "other_expense", reportingClass: "finance_cost", parentCode: "8000" },
  { code: "8200", name: "Foreign exchange losses", accountType: "other_expense", reportingClass: "other_expense", parentCode: "8000", confirm: "Exchange-difference policy required." },
  { code: "8300", name: "Loss on disposal of assets", accountType: "other_expense", reportingClass: "other_expense", parentCode: "8000" },
  { code: "8900", name: "Income tax expense", accountType: "other_expense", reportingClass: "income_tax_expense", parentCode: "8000", confirm: "Tax adviser to confirm." },
];

/** Structural checks the database will also enforce; used by tests and before loading. */
export function validateChart(chart: ProposedAccount[]): string[] {
  const errors: string[] = [];
  const byCode = new Map<string, ProposedAccount>();
  chart.forEach((a, index) => {
    if (!accountCodePattern.test(a.code)) errors.push(`${a.code}: invalid code`);
    if (byCode.has(a.code)) errors.push(`${a.code}: duplicate code`);
    if (!isValidClassification(a.accountType, a.reportingClass, a.isPostable !== false)) errors.push(`${a.code}: classification does not match type`);
    if (a.parentCode) {
      const parent = byCode.get(a.parentCode);
      if (!parent) errors.push(`${a.code}: parent ${a.parentCode} must appear earlier`);
      else {
        if (parent.accountType !== a.accountType) errors.push(`${a.code}: parent has a different type`);
        if (parent.isPostable !== false) errors.push(`${a.code}: parent ${a.parentCode} is postable`);
      }
    }
    byCode.set(a.code, a);
    void index;
  });
  return errors;
}

/** The payload passed to accounting_chart_seed (parents first, as listed). */
export function chartSeedPayload(chart: ProposedAccount[] = proposedChart) {
  return chart.map((a) => ({
    code: a.code,
    name: a.name,
    accountType: a.accountType,
    reportingClass: a.reportingClass,
    parentCode: a.parentCode ?? null,
    isPostable: a.isPostable !== false,
    isContra: !!a.isContra,
    manualPostingAllowed: a.manualPostingAllowed !== false,
    currency: a.currency ?? null,
    description: [a.description, a.confirm ? `To confirm: ${a.confirm}` : ""].filter(Boolean).join(" ") || null,
  }));
}

export const normalBalanceOf = (a: ProposedAccount) => normalBalanceFor(a.accountType, !!a.isContra);
