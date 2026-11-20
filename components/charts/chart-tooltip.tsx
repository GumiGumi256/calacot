"use client";

import type { ReactNode } from "react";
import { formatMoney, formatNumber } from "@/lib/format";

type Item = { dataKey?: string | number; name?: string | number; value?: unknown; color?: string; payload?: Record<string, unknown> };

/**
 * Standard Calacot tooltip (docs section G5) for Recharts `<Tooltip content={...} />`.
 * Period label, then one row per series: swatch, label, formatted value. Money is always
 * formatted with its currency; missing values read "No data", never 0.
 */
export function CalacotTooltip({
  active,
  payload,
  label,
  currency,
  labels = {},
  labelFormatter,
  total = false,
}: {
  active?: boolean;
  payload?: readonly Item[];
  label?: string | number;
  /** Set for money series; omit for counts. */
  currency?: string;
  /** dataKey -> human label (usually from the chart config). */
  labels?: Record<string, ReactNode>;
  labelFormatter?: (label: string) => ReactNode;
  /** Show a total row (only when summing the series is meaningful). */
  total?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const fmt = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : null;
    if (n === null || !Number.isFinite(n)) return "No data";
    return currency ? formatMoney(currency, n) : formatNumber(n, 2);
  };
  const sum = payload.reduce((acc, p) => acc + (typeof p.value === "number" ? p.value : 0), 0);
  return (
    <div className="grid min-w-40 gap-1.5 rounded-xl border border-border/60 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-e3">
      {label !== undefined && <p className="font-medium">{labelFormatter ? labelFormatter(String(label)) : label}</p>}
      <ul className="grid gap-1">
        {payload.map((p) => {
          const key = String(p.dataKey ?? p.name);
          return (
            <li key={key} className="flex items-center gap-2">
              <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />
              <span className="text-muted-foreground">{labels[key] ?? p.name}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums">{fmt(p.value)}</span>
            </li>
          );
        })}
      </ul>
      {total && payload.length > 1 && (
        <p className="flex justify-between border-t pt-1 font-medium tabular-nums">
          <span>Total</span>
          <span>{fmt(sum)}</span>
        </p>
      )}
    </div>
  );
}
