/**
 * Pure straight-line depreciation model, used for previews and to cross-check the database function
 * fixed_asset_depreciation_for() in drizzle-current/0022_tax_assets_payroll.sql. Exact: amounts are
 * integer cents and fractions are rational (BigInt); nothing goes through a float. Extensible: add a
 * method alongside "straight_line" here and in SQL, then approve it as a category policy.
 */
export type Convention = "daily_proration" | "full_month_from_capitalization" | "next_month_after_capitalization";
export type DepreciationInput = { cost: string; residual: string; usefulLifeMonths: number; convention: Convention; depreciationStart: string; accumulated: string };

const cents = (v: string) => {
  const s = v.trim(); if (!/^-?\d{1,15}(\.\d{1,2})?$/.test(s)) throw new Error("Invalid amount");
  const neg = s.startsWith("-"); const [w, f = ""] = (neg ? s.slice(1) : s).split(".");
  const n = BigInt(w) * BigInt(100) + BigInt(f.padEnd(2, "0")); return neg ? -n : n;
};
const toText = (c: bigint) => { const neg = c < BigInt(0); const a = neg ? -c : c; return `${neg ? "-" : ""}${a / BigInt(100)}.${(a % BigInt(100)).toString().padStart(2, "0")}`; };
const day = (iso: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Invalid date"); return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000; };
const iso = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);

/** Depreciation for [start, end] (inclusive ISO dates), capped at what remains above the residual value. */
export function straightLineDepreciation(a: DepreciationInput, start: string, end: string): string {
  if (!Number.isInteger(a.usefulLifeMonths) || a.usefulLifeMonths < 1) throw new Error("Invalid useful life");
  const base = cents(a.cost) - cents(a.residual);
  const remaining = base - cents(a.accumulated);
  if (remaining <= BigInt(0) || day(end) < day(a.depreciationStart)) return "0.00";
  const firstMonth = a.depreciationStart.slice(0, 7);
  // Sum of fractions days/daysInMonth as an exact rational num/den.
  let num = BigInt(0), den = BigInt(1);
  let y = +start.slice(0, 4), m = +start.slice(5, 7);
  for (;;) {
    const ms = Date.UTC(y, m - 1, 1) / 86400000, me = Date.UTC(y, m, 0) / 86400000;
    if (ms > day(end)) break;
    // Month-based conventions count an eligible month in full (mirrors the SQL function).
    let os = a.convention !== "daily_proration" && day(start) <= day(a.depreciationStart) ? ms : Math.max(ms, day(start));
    const oe = Math.min(me, day(end));
    const month = iso(ms).slice(0, 7);
    let counted = 0;
    if (a.convention === "daily_proration") { os = Math.max(os, day(a.depreciationStart)); if (oe >= os) counted = oe - os + 1; }
    else if (a.convention === "full_month_from_capitalization") { if (month >= firstMonth && oe >= os) counted = oe - os + 1; }
    else if (month > firstMonth && oe >= os) counted = oe - os + 1;
    if (counted) { const dim = BigInt(me - ms + 1); num = num * dim + BigInt(counted) * den; den = den * dim; }
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  // amount = base * num / (den * life), rounded half away from zero to cents (PostgreSQL round()).
  const n = base * num, d = den * BigInt(a.usefulLifeMonths);
  const amount = (BigInt(2) * n + d) / (BigInt(2) * d);
  return toText(amount < remaining ? amount : remaining);
}
