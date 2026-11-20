import { decimal, scaled } from "./money";

/*
 * Payment stages by percentage. People enter percentages; amounts are derived from the quotation
 * total, rounded (whole shillings for UGX, cents for USD), and the last stage takes the rounding
 * difference so the stages always add up to the total exactly, as the server requires.
 * All arithmetic is in integer cents (bigint): no floating-point money.
 */

/**
 * "Agree on approval": no payment schedule yet. The database requires at least one stage summing
 * to the total, so it is stored as a single full-total stage with this exact label, which the
 * builder and the PDF recognise. (Invoicing then bills the full total, as for a single payment.)
 */
export const AGREED_ON_APPROVAL = "Payment terms to be agreed on approval";
export const isAgreedOnApproval = (stages: { label: string }[]) => stages.length === 1 && stages[0].label === AGREED_ON_APPROVAL;

const percentPattern = /^\d{1,3}(\.\d{1,2})?$/;
/** Rounding step in cents: whole units for UGX, cents for USD. */
const step = (currency: string) => (currency === "UGX" ? BigInt(100) : BigInt(1));
/** Percent as hundredths of a percent ("12.5" -> 1250n), or null if not a valid percentage. */
export const percentBasis = (p: string) => (percentPattern.test(p.trim()) ? scaled(p.trim()) : null);
export const HUNDRED = BigInt(10000); // 100.00% in hundredths

export function percentTotal(percents: string[]) {
  let sum = BigInt(0);
  for (const p of percents) {
    const v = percentBasis(p);
    if (v === null) return null;
    sum += v;
  }
  return sum;
}

/** Amounts for each stage, or null while the total or the percentages are not usable. */
export function allocateStages(total: string, percents: string[], currency: string): string[] | null {
  let totalCents: bigint;
  try { totalCents = scaled(total); } catch { return null; }
  const basis = percents.map(percentBasis);
  if (!basis.length || basis.some((b) => b === null || b <= BigInt(0))) return null;
  if (basis.reduce<bigint>((s, b) => s + (b as bigint), BigInt(0)) !== HUNDRED) return null;
  const unit = step(currency);
  const amounts: bigint[] = [];
  let allocated = BigInt(0);
  basis.forEach((b, i) => {
    if (i === basis.length - 1) return void amounts.push(totalCents - allocated);
    const exact = totalCents * (b as bigint); // cents x hundredths of a percent
    const divisor = HUNDRED * unit;
    const rounded = ((exact + divisor / BigInt(2)) / divisor) * unit;
    amounts.push(rounded);
    allocated += rounded;
  });
  if (amounts.some((a) => a <= BigInt(0))) return null;
  return amounts.map(decimal);
}

/** Percentages that reproduce saved amounts (for drafts saved before percentages existed). */
export function percentsFromAmounts(amounts: string[], total: string): string[] {
  const n = BigInt(Math.max(1, amounts.length));
  let out: bigint[];
  try {
    const t = scaled(total);
    if (t <= BigInt(0)) throw new Error("no total");
    out = amounts.map((a) => (scaled(a) * HUNDRED + t / BigInt(2)) / t);
  } catch {
    // No usable total yet: split evenly.
    out = amounts.map(() => HUNDRED / n);
  }
  out[out.length - 1] += HUNDRED - out.reduce((s, v) => s + v, BigInt(0));
  return out.map(formatPercent);
}

/** 5000n -> "50", 3333n -> "33.33", 1250n -> "12.5". */
export const formatPercent = (v: bigint) => decimal(v).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");

export const stagePresets: { label: string; stages: { label: string; percent: string }[] }[] = [
  { label: "100%", stages: [{ label: "Full payment", percent: "100" }] },
  { label: "50 / 50", stages: [{ label: "Deposit", percent: "50" }, { label: "Balance on completion", percent: "50" }] },
  { label: "60 / 40", stages: [{ label: "Deposit", percent: "60" }, { label: "Balance on completion", percent: "40" }] },
  { label: "30 / 40 / 30", stages: [{ label: "Deposit", percent: "30" }, { label: "Progress payment", percent: "40" }, { label: "Balance on completion", percent: "30" }] },
];
