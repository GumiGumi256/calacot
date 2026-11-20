/**
 * Calacot Admin Design System V1: central chart configuration (docs section G).
 * Series colours are assigned by *meaning*, never by position, so "receipts" looks the same
 * on every page. Pages build a ChartConfig from these roles instead of choosing colours.
 */
import { formatMoney, formatMonth, formatNumber } from "@/lib/format";

export const seriesRoles = {
  primary: "var(--chart-primary)",
  muted: "var(--chart-muted)",
  moneyIn: "var(--chart-money-in)",
  moneyOut: "var(--chart-money-out)",
  /** Money committed but not necessarily paid yet (e.g. approved expenses): lighter rust, dashed. */
  committed: "color-mix(in oklch, var(--chart-money-out) 55%, var(--card))",
  invoiced: "var(--chart-invoiced)",
  overdue: "var(--chart-overdue)",
  pending: "var(--chart-pending)",
} as const;
export type SeriesRole = keyof typeof seriesRoles;

/** Stroke patterns so series are distinguishable without colour. */
export const seriesDash: Partial<Record<SeriesRole, string>> = {
  committed: "6 4",
  pending: "2 3",
};

/** Build a shadcn ChartConfig from { dataKey: [label, role] }. */
export function chartConfig<K extends string>(series: Record<K, readonly [label: string, role: SeriesRole]>) {
  return Object.fromEntries(
    Object.entries(series).map(([key, value]) => {
      const [label, role] = value as readonly [string, SeriesRole];
      return [key, { label, color: seriesRoles[role] }];
    }),
  ) as Record<K, { label: string; color: string }>;
}

/** Plot heights by breakpoint (G4). */
export const chartHeights = { mobile: 240, tablet: 280, desktop: 320 } as const;

/** Maximum x-axis ticks before labels are thinned (G4). */
export const maxTicks = { mobile: 6, desktop: 12 } as const;

/** Shared axis props: subtle, no axis lines, compact labels. */
export const axisDefaults = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  fontSize: 12,
} as const;

/**
 * Y-axis money ticks: "1.2M". The currency belongs in the chart title ("Money in vs. out (UGX)")
 * so axis labels stay on one line at every width. One currency per chart; never mix UGX and USD.
 * Tooltips always show the full amount with its currency (formatMoney).
 */
export const moneyTick = () => (value: number) => formatCompact(value);
export const formatCompact = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
/** Full money label for annotations outside the plot. */
export const moneyLabel = (currency: string, value: number) => formatMoney(currency, value, { compact: true });
export const countTick = (value: number) => formatNumber(value);
export const monthTick = (value: string) => formatMonth(value);

/** Index interval that keeps at most `max` labels on a category axis. */
export function tickInterval(points: number, max: number) {
  return points <= max ? 0 : Math.ceil(points / max) - 1;
}

/**
 * Change between two complete, equal-length periods as a ratio, or null when it would be
 * misleading (missing data, zero base, incomplete period). Never fabricate a delta.
 */
export function periodChange(current: number | null | undefined, previous: number | null | undefined, opts: { complete?: boolean } = {}) {
  if (opts.complete === false) return null;
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
