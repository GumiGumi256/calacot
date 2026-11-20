/**
 * Calacot Admin Design System V1: the one place money, numbers and dates are formatted.
 * All dates are shown in Kampala time. UGX has no minor unit in practice; USD shows cents.
 * Pure functions with no server or client dependencies, so they run in both.
 */

export const TIME_ZONE = "Africa/Kampala";
const LOCALE = "en-UG";

type Numeric = string | number | null | undefined;

const toNumber = (value: Numeric) => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

export const currencyDecimals = (currency: string) => (currency.toUpperCase() === "USD" ? 2 : 0);

/** "UGX 1,250,000" / "USD 1,250.50". Missing values render as an em dash, never as zero. */
export function formatMoney(currency: string, value: Numeric, options: { compact?: boolean; signed?: boolean } = {}) {
  const n = toNumber(value);
  if (n === null) return "—";
  const code = currency.toUpperCase();
  const digits = currencyDecimals(code);
  const body = new Intl.NumberFormat("en-US", options.compact
    ? { notation: "compact", maximumFractionDigits: 1 }
    : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(n));
  const sign = n < 0 ? "−" : options.signed && n > 0 ? "+" : "";
  return `${sign}${code} ${body}`;
}

/** Plain grouped number: "1,204". */
export function formatNumber(value: Numeric, maximumFractionDigits = 0) {
  const n = toNumber(value);
  return n === null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(n);
}

/** "+12.5%" style change. Pass a ratio (0.125), not a percentage. */
export function formatPercent(ratio: Numeric, { signed = false, digits = 1 } = {}) {
  const n = toNumber(ratio);
  if (n === null) return "—";
  const body = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: digits }).format(Math.abs(n));
  return `${n < 0 ? "−" : signed && n > 0 ? "+" : ""}${body}`;
}

type DateInput = string | number | Date | null | undefined;
const toDate = (value: DateInput) => {
  if (value === null || value === undefined || value === "") return null;
  // A bare ISO date (YYYY-MM-DD) is a calendar date, not a UTC instant: pin it to Kampala noon.
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+03:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "19 Nov 2026". */
export function formatDate(value: DateInput) {
  const d = toDate(value);
  return d ? new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeZone: TIME_ZONE }).format(d) : "—";
}

/** "19 Nov 2026, 14:05". */
export function formatDateTime(value: DateInput) {
  const d = toDate(value);
  return d ? new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }).format(d) : "—";
}

/** "Nov 2026" for chart axes and monthly periods. Accepts "2026-11". */
export function formatMonth(value: DateInput) {
  const d = typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? toDate(`${value}-15`) : toDate(value);
  return d ? new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric", timeZone: TIME_ZONE }).format(d) : "—";
}

/** "3h ago", "in 2 days". Falls back to the date beyond 30 days. */
export function formatRelative(value: DateInput, now: Date = new Date()) {
  const d = toDate(value);
  if (!d) return "—";
  const seconds = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs > 30 * 86400) return formatDate(d);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
}
