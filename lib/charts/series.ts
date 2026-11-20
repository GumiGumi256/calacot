/**
 * Chart series derived from report reads (docs section G7). Pure functions so the
 * reconciliation check (scripts/verify-design-system.ts) can prove chart totals equal the
 * report table totals.
 */

export type MonthlyActivityRow = {
  month: string; // YYYY-MM, Kampala
  currency: string;
  invoiced: string;
  receipts: string;
  approved: string;
  disbursed: string;
};

export const monthlyMeasures = ["invoiced", "receipts", "approved", "disbursed"] as const;
export type MonthlyMeasure = (typeof monthlyMeasures)[number];

export type MonthlyPoint = Record<MonthlyMeasure, number | null> & {
  month: string;
  /** The period covers only part of this month (range edge or the current month). */
  partial: boolean;
};

export type CurrencySeries = {
  currency: string;
  points: MonthlyPoint[];
  totals: Record<MonthlyMeasure, number>;
};

const toNumber = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Inclusive list of YYYY-MM months between two ISO dates (capped at 60 months). */
export function monthRange(from: string, to: string) {
  const months: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  while (months.length < 60) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    months.push(key);
    if (key >= end) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/**
 * One series per currency (UGX and USD are never combined), one point per month in the period.
 * A month missing from the report query for a currency is filled with 0: the query unions every
 * source of activity (invoices, receipts, expenses, disbursements), so absence proves there was
 * none. A value the database returned but that cannot be parsed stays null ("No data"), never 0.
 */
export function monthlySeries(rows: MonthlyActivityRow[], period: { from: string; to: string; today: string }): CurrencySeries[] {
  const months = monthRange(period.from, period.to);
  const effectiveEnd = period.to < period.today ? period.to : period.today;
  const currencies = [...new Set(rows.map((r) => r.currency))].sort();
  return currencies.map((currency) => {
    const byMonth = new Map(rows.filter((r) => r.currency === currency).map((r) => [r.month, r]));
    const points = months.map((month): MonthlyPoint => {
      const row = byMonth.get(month);
      const partial = `${month}-01` < period.from || lastDay(month) > effectiveEnd;
      const value = (k: MonthlyMeasure) => (row ? toNumber(row[k]) : 0);
      return { month, partial, invoiced: value("invoiced"), receipts: value("receipts"), approved: value("approved"), disbursed: value("disbursed") };
    });
    const totals = Object.fromEntries(
      monthlyMeasures.map((k) => [k, points.reduce((sum, p) => sum + (p[k] ?? 0), 0)]),
    ) as Record<MonthlyMeasure, number>;
    return { currency, points, totals };
  });
}

/** First and last day of a YYYY-MM month, clamped to the report period (for drill-down links). */
export function monthPeriod(month: string, period: { from: string; to: string }) {
  const start = `${month}-01`;
  const end = lastDay(month);
  return { from: start < period.from ? period.from : start, to: end > period.to ? period.to : end };
}
