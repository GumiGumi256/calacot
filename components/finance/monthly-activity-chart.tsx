"use client";

import Link from "next/link";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { ChartCard } from "@/components/charts/chart-card";
import { CalacotTooltip } from "@/components/charts/chart-tooltip";
import { useUrlQuery } from "@/components/data-table/use-url-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { axisDefaults, chartConfig, maxTicks, moneyTick, seriesDash, seriesRoles, tickInterval } from "@/lib/charts/config";
import { monthPeriod, monthlySeries, type CurrencySeries, type MonthlyActivityRow } from "@/lib/charts/series";
import { formatMoney, formatMonth, formatPercent } from "@/lib/format";

const config = chartConfig({
  invoiced: ["Invoiced", "invoiced"],
  receipts: ["Confirmed receipts", "moneyIn"],
  approved: ["Approved expenses", "committed"],
  disbursed: ["Disbursed", "moneyOut"],
});
const labels = Object.fromEntries(Object.entries(config).map(([k, v]) => [k, v.label]));

/**
 * Financial reports, "Activity by month": answers "is money coming in faster than it is
 * committed and paid out?" One chart per currency. Data is exactly the report's monthly read,
 * so the chart reconciles with the table shown behind "View as table".
 */
export function MonthlyActivityChart({ rows, from, to, today }: { rows: MonthlyActivityRow[]; from: string; to: string; today: string }) {
  const series = monthlySeries(rows, { from, to, today });
  if (!series.length) {
    return (
      <ChartCard
        title="Activity by month"
        description="Invoices issued, confirmed receipts, approved expenses and disbursements, by Kampala month."
        state="empty"
        emptyMessage="No invoices, receipts or expenses in this period"
        height={240}
      />
    );
  }
  return (
    <>
      {series.map((s) => (
        <CurrencyChart key={s.currency} series={s} from={from} to={to} />
      ))}
    </>
  );
}

function CurrencyChart({ series, from, to }: { series: CurrencySeries; from: string; to: string }) {
  const { set, hrefWith } = useUrlQuery();
  const { currency, points, totals } = series;
  const partial = points.filter((p) => p.partial).map((p) => formatMonth(p.month));
  const drill = (month?: string) => {
    if (!month || points.length < 2) return;
    set(monthPeriod(month, { from, to }));
  };
  const coverage = totals.invoiced > 0 ? totals.receipts / totals.invoiced : null;

  return (
    <ChartCard
      title={`Activity by month (${currency})`}
      description="Invoices issued, confirmed receipts, approved expenses and disbursements, by Kampala month."
      info="Receipts are confirmed customer payments received in the month, which may settle invoices from earlier months. Expenses are approved requests dated in the month. This is not profit."
      footer={
        <>
          {coverage !== null && (
            <span>
              Confirmed receipts equalled {formatPercent(coverage, { digits: 0 })} of amounts invoiced in this period ({formatMoney(currency, totals.receipts)} of {formatMoney(currency, totals.invoiced)}).
            </span>
          )}
          {partial.length > 0 && <span>Partial {partial.length === 1 ? "month" : "months"} (shown lighter): {partial.join(", ")}.</span>}
          {points.length > 1 && <span>Select a month to report on it alone.</span>}
        </>
      }
      table={
        <Table aria-label={`Activity by month in ${currency}`}>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Invoiced</TableHead>
              <TableHead className="text-right">Confirmed receipts</TableHead>
              <TableHead className="text-right">Approved expenses</TableHead>
              <TableHead className="text-right">Disbursed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {points.map((p) => (
              <TableRow key={p.month}>
                <TableCell>
                  <Link className="underline-offset-4 hover:underline" scroll={false} href={hrefWith(monthPeriod(p.month, { from, to }))}>
                    {formatMonth(p.month)}
                  </Link>
                  {p.partial && <span className="ml-1.5 type-caption">(partial)</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(currency, p.invoiced)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(currency, p.receipts)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(currency, p.approved)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(currency, p.disbursed)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-medium">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(currency, totals.invoiced)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(currency, totals.receipts)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(currency, totals.approved)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(currency, totals.disbursed)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      }
    >
      <ChartContainer config={config} className="aspect-auto h-full w-full">
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
          accessibilityLayer
          onClick={(state) => drill(typeof state?.activeLabel === "string" ? state.activeLabel : undefined)}
          className={points.length > 1 ? "cursor-pointer" : undefined}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={formatMonth} interval={tickInterval(points.length, maxTicks.mobile)} {...axisDefaults} />
          <YAxis tickFormatter={moneyTick()} width={48} {...axisDefaults} />
          <Tooltip cursor={{ fillOpacity: 0.35 }} content={<CalacotTooltip currency={currency} labels={labels} labelFormatter={formatMonth} />} />
          <ChartLegend content={<ChartLegendContent />} verticalAlign="bottom" />
          <Bar dataKey="invoiced" fill={seriesRoles.invoiced} radius={[4, 4, 0, 0]} maxBarSize={28}>
            {points.map((p) => <Cell key={p.month} fillOpacity={p.partial ? 0.45 : 1} />)}
          </Bar>
          <Bar dataKey="receipts" fill={seriesRoles.moneyIn} radius={[4, 4, 0, 0]} maxBarSize={28}>
            {points.map((p) => <Cell key={p.month} fillOpacity={p.partial ? 0.45 : 1} />)}
          </Bar>
          <Line dataKey="approved" stroke={seriesRoles.committed} strokeWidth={2} strokeDasharray={seriesDash.committed} dot={{ r: 2.5 }} type="linear" connectNulls={false} />
          <Line dataKey="disbursed" stroke={seriesRoles.moneyOut} strokeWidth={2} dot={{ r: 2.5 }} type="linear" connectNulls={false} />
        </ComposedChart>
      </ChartContainer>
    </ChartCard>
  );
}
