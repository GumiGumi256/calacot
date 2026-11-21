/**
 * Phase 2A accounting engine: pure, dependency-free rules shared by the journal form (client),
 * server actions and tests. The database enforces the same invariants independently (see
 * drizzle-current/0018_accounting_foundation.sql); this module exists so the rules can be tested
 * without a database and so the form can show balance feedback before anything is saved.
 *
 * Money is held as bigint minor units (2 decimal places) and never as a float.
 */

export const accountTypes = [
  "asset",
  "liability",
  "equity",
  "income",
  "cost_of_sales",
  "operating_expense",
  "other_income",
  "other_expense",
] as const;
export type AccountType = (typeof accountTypes)[number];

export const accountTypeLabels: Record<AccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  cost_of_sales: "Cost of sales",
  operating_expense: "Operating expense",
  other_income: "Other income",
  other_expense: "Other expense",
};

/** Reporting classifications allowed for each account type (mirrors the database CHECK). */
export const reportingClasses: Record<AccountType, readonly string[]> = {
  asset: ["current_asset", "non_current_asset"],
  liability: ["current_liability", "non_current_liability"],
  equity: ["equity"],
  income: ["operating_revenue"],
  cost_of_sales: ["cost_of_sales"],
  operating_expense: ["operating_expense"],
  other_income: ["other_income"],
  other_expense: ["other_expense", "finance_cost", "income_tax_expense"],
};

export const reportingClassLabels: Record<string, string> = {
  current_asset: "Current asset",
  non_current_asset: "Non-current asset",
  current_liability: "Current liability",
  non_current_liability: "Non-current liability",
  equity: "Equity",
  operating_revenue: "Operating revenue",
  cost_of_sales: "Cost of sales",
  operating_expense: "Operating expense",
  other_income: "Other income",
  other_expense: "Other expense",
  finance_cost: "Finance cost",
  income_tax_expense: "Income tax expense",
};

const debitNormal: ReadonlySet<AccountType> = new Set(["asset", "cost_of_sales", "operating_expense", "other_expense"]);

/** Debit-normal for assets and expenses, credit-normal otherwise; contra accounts are opposite. */
export function normalBalanceFor(type: AccountType, contra = false): "debit" | "credit" {
  return debitNormal.has(type) !== contra ? "debit" : "credit";
}

export function isValidClassification(type: AccountType, reportingClass: string | null, postable: boolean) {
  if (!reportingClass) return !postable;
  return reportingClasses[type].includes(reportingClass);
}

export const accountCodePattern = /^[0-9]{3,8}(-[0-9A-Z]{1,6})?$/;

// ---------------------------------------------------------------------------------------------
// Decimal money (2 places) and exchange-rate conversion.
// ---------------------------------------------------------------------------------------------

const amountPattern = /^\d{1,15}(\.\d{1,2})?$/;
const ratePattern = /^\d{1,10}(\.\d{1,10})?$/;
const MAX_MINOR = BigInt("99999999999999999"); // numeric(17,2)

export function isAmount(value: string) {
  return amountPattern.test(value.trim());
}

/** "1234.5" -> 123450n. Throws on anything that is not a non-negative 2-place decimal. */
export function toMinor(value: string): bigint {
  const v = value.trim();
  if (!amountPattern.test(v)) throw new Error("invalid_amount");
  const [whole, fraction = ""] = v.split(".");
  const minor = BigInt(whole + fraction.padEnd(2, "0"));
  if (minor > MAX_MINOR) throw new Error("invalid_amount");
  return minor;
}

/** 123450n -> "1234.50" (negative values keep their sign). */
export function fromMinor(minor: bigint): string {
  const negative = minor < BigInt(0);
  const abs = negative ? -minor : minor;
  const whole = abs / BigInt(100);
  const fraction = (abs % BigInt(100)).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Empty or zero counts as "no amount" on that side of a line. */
export function optionalMinor(value: string | null | undefined): bigint {
  const v = (value ?? "").trim();
  return v === "" ? BigInt(0) : toMinor(v);
}

/**
 * Converts a transaction amount to functional currency with an approved rate, rounding half
 * away from zero to 2 places exactly as PostgreSQL round(numeric, 2) does.
 */
export function convertMinor(amountMinor: bigint, rate: string): bigint {
  const r = rate.trim();
  if (!ratePattern.test(r) || /^0+(\.0+)?$/.test(r)) throw new Error("invalid_exchange_rate");
  const [whole, fraction = ""] = r.split(".");
  const scale = BigInt(10) ** BigInt(fraction.length);
  const rateScaled = BigInt(whole + fraction);
  const product = amountMinor * rateScaled; // minor units * scale
  const negative = product < BigInt(0);
  const abs = negative ? -product : product;
  const rounded = (abs + scale / BigInt(2)) / scale;
  return negative ? -rounded : rounded;
}

// ---------------------------------------------------------------------------------------------
// Journal validation.
// ---------------------------------------------------------------------------------------------

export type JournalLineInput = {
  accountId: string;
  debit: string;
  credit: string;
  currency: string;
  /** Approved rate (transaction -> functional). Absent means the line is in functional currency. */
  exchangeRate?: string | null;
  exchangeRateId?: string | null;
  description?: string;
  division?: string | null;
  projectId?: string | null;
};

export type CurrencyTotals = { currency: string; debit: bigint; credit: bigint; difference: bigint };

export type JournalSummary = {
  lineCount: number;
  byCurrency: CurrencyTotals[];
  functional: { debit: bigint; credit: bigint; difference: bigint };
  /** True when every currency balances on its own and functional amounts balance. */
  balanced: boolean;
  /** Lines whose amounts could not be read (shown as errors in the form). */
  invalidLines: number[];
};

/** Totals per transaction currency and in functional amounts. Never adds different currencies. */
export function summarizeLines(lines: JournalLineInput[]): JournalSummary {
  const map = new Map<string, CurrencyTotals>();
  let fd = BigInt(0);
  let fc = BigInt(0);
  const invalidLines: number[] = [];
  lines.forEach((line, index) => {
    let d: bigint;
    let c: bigint;
    try {
      d = optionalMinor(line.debit);
      c = optionalMinor(line.credit);
    } catch {
      invalidLines.push(index);
      return;
    }
    if ((d > BigInt(0)) === (c > BigInt(0))) {
      invalidLines.push(index);
      return;
    }
    const t = map.get(line.currency) ?? { currency: line.currency, debit: BigInt(0), credit: BigInt(0), difference: BigInt(0) };
    t.debit += d;
    t.credit += c;
    t.difference = t.debit - t.credit;
    map.set(line.currency, t);
    try {
      fd += line.exchangeRate ? convertMinor(d, line.exchangeRate) : d;
      fc += line.exchangeRate ? convertMinor(c, line.exchangeRate) : c;
    } catch {
      invalidLines.push(index);
    }
  });
  const byCurrency = [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  const functional = { debit: fd, credit: fc, difference: fd - fc };
  const balanced =
    invalidLines.length === 0 &&
    byCurrency.length > 0 &&
    byCurrency.every((t) => t.difference === BigInt(0)) &&
    functional.difference === BigInt(0) &&
    functional.debit > BigInt(0);
  return { lineCount: lines.length, byCurrency, functional, balanced, invalidLines };
}

export type ValidationCode =
  | "journal_lines_required"
  | "invalid_journal_line"
  | "journal_unbalanced"
  | "invalid_currency"
  | "multi_currency_posting_disabled"
  | "exchange_rate_required";

/**
 * Checks a journal the way the database will. `stage` decides how strict to be: drafts may be
 * incomplete; submission and posting require at least two lines and a balanced entry.
 */
export function validateJournal(
  lines: JournalLineInput[],
  options: { stage: "draft" | "submit" | "post"; functionalCurrency?: string | null; multiCurrencyEnabled?: boolean },
): ValidationCode[] {
  const errors = new Set<ValidationCode>();
  if (lines.length < 1 || lines.length > 200) errors.add("journal_lines_required");
  for (const line of lines) if (!["UGX", "USD"].includes(line.currency)) errors.add("invalid_currency");
  const summary = summarizeLines(lines);
  if (summary.invalidLines.length) errors.add("invalid_journal_line");
  if (options.stage !== "draft") {
    if (lines.length < 2) errors.add("journal_lines_required");
    if (!summary.balanced) errors.add("journal_unbalanced");
  }
  if (options.stage === "post") {
    const functional = options.functionalCurrency;
    for (const line of lines) {
      const foreign = !!functional && line.currency !== functional;
      if (foreign && !options.multiCurrencyEnabled) errors.add("multi_currency_posting_disabled");
      if (foreign && !line.exchangeRate) errors.add("exchange_rate_required");
      if (!foreign && line.exchangeRate && !options.multiCurrencyEnabled) errors.add("multi_currency_posting_disabled");
    }
  }
  return [...errors];
}

/** The reversal of a set of lines: same accounts, dimensions and rates, sides swapped. */
export function reverseLines<T extends JournalLineInput>(lines: T[]): T[] {
  return lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
}

/** Balance in the account's normal direction (positive = normal side). */
export function normalBalanceAmount(normal: "debit" | "credit", debit: bigint, credit: bigint) {
  return normal === "debit" ? debit - credit : credit - debit;
}

/** Trial-balance presentation of a net balance: exactly one side is non-zero. */
export function trialBalanceSides(debit: bigint, credit: bigint) {
  const net = debit - credit;
  return { debit: net > BigInt(0) ? net : BigInt(0), credit: net < BigInt(0) ? -net : BigInt(0) };
}
