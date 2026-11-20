"use client";

import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { ChartCard, type ChartState } from "@/components/charts/chart-card";
import { CalacotTooltip } from "@/components/charts/chart-tooltip";
import { axisDefaults, chartConfig, moneyTick, monthTick, seriesDash, seriesRoles } from "@/lib/charts/config";
import { formatMoney, formatMonth } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Development gallery only: illustrative values, never rendered in production (see page.tsx).
// Real charts must take their series from the reconciled report reads (docs section G7).
const sample = [
  { month: "2026-06", invoiced: 182_000_000, receipts: 151_000_000, expenses: 96_000_000 },
  { month: "2026-07", invoiced: 204_000_000, receipts: 176_000_000, expenses: 102_000_000 },
  { month: "2026-08", invoiced: 168_000_000, receipts: 171_000_000, expenses: 118_000_000 },
  { month: "2026-09", invoiced: 231_000_000, receipts: 189_000_000, expenses: 109_000_000 },
  { month: "2026-10", invoiced: 247_000_000, receipts: 214_000_000, expenses: 121_000_000 },
  { month: "2026-11", invoiced: 139_000_000, receipts: 122_000_000, expenses: 74_000_000 },
];
const config = chartConfig({
  invoiced: ["Invoiced", "invoiced"],
  receipts: ["Confirmed receipts", "moneyIn"],
  expenses: ["Approved expenses", "committed"],
});
const labels = Object.fromEntries(Object.entries(config).map(([k, v]) => [k, v.label]));

export function SampleMoneyChart({ state = "ready" }: { state?: ChartState }) {
  const received = sample.reduce((n, r) => n + r.receipts, 0);
  const invoiced = sample.reduce((n, r) => n + r.invoiced, 0);
  return (
    <ChartCard
      title="Money in vs. out (UGX)"
      description="Invoiced and confirmed receipts against approved expenses, by Kampala month."
      info="Receipts are confirmed customer payments. Expenses are approved requests dated in the month. Not a profit figure."
      state={state}
      emptyMessage="No invoices, receipts or expenses in this period"
      footer={
        <>
          <span>Receipts were {Math.round((received / invoiced) * 100)}% of invoicing in this period.</span>
          <span>Nov 2026 is a partial month.</span>
        </>
      }
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Invoiced</TableHead>
              <TableHead className="text-right">Receipts</TableHead>
              <TableHead className="text-right">Expenses</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sample.map((r) => (
              <TableRow key={r.month}>
                <TableCell>{formatMonth(r.month)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney("UGX", r.invoiced)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney("UGX", r.receipts)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney("UGX", r.expenses)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    >
      <ChartContainer config={config} className="aspect-auto h-full w-full">
        <ComposedChart data={sample} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthTick} {...axisDefaults} />
          <YAxis tickFormatter={moneyTick()} width={48} {...axisDefaults} />
          <Tooltip cursor={{ fillOpacity: 0.4 }} content={<CalacotTooltip currency="UGX" labels={labels} labelFormatter={formatMonth} />} />
          <Bar dataKey="invoiced" fill={seriesRoles.invoiced} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="receipts" fill={seriesRoles.moneyIn} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Line dataKey="expenses" stroke={seriesRoles.committed} strokeWidth={2} strokeDasharray={seriesDash.committed} dot={false} type="linear" />
        </ComposedChart>
      </ChartContainer>
    </ChartCard>
  );
}
