import Link from "next/link";
import { formatAmount } from "@/lib/finance/options";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ReactNode } from "react";

type Row = Record<string, unknown>;
const day = (v: unknown) => {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeZone: "Africa/Kampala" }).format(d);
};

/** Read-only project expenditure. Shown only to staff with expenses_read. */
export function ProjectExpenses({ projectId, expenses, createAction }: { projectId: string; expenses: Row[]; createAction?: ReactNode }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-xl flex-col gap-1.5">
          <CardTitle>Project expenditure</CardTitle>
          <CardDescription>Approved spending, recorded payments and evidence. Paying an expense does not change project, milestone or invoice status.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">{createAction}<Button variant="outline" size="sm" render={<Link href={`/admin/expenses?view=all&projectId=${projectId}`} />}>View all project expenses</Button></div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {expenses.length > 0 ? (
          <ul className="divide-y overflow-hidden rounded-(--card-radius-inner) border border-card-edge bg-card text-sm" aria-label="Most recent 50 project expenses">
            {expenses.map((e) => (
              <li key={String(e.id)} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0"><Link className="font-medium break-words underline-offset-4 hover:underline" href={`/admin/expenses/${e.id}`}>{String(e.description)}</Link><p className="mt-0.5 text-xs text-muted-foreground">{day(e.incurred_at) || "Date unavailable"}</p></div>
                <div className="flex items-center gap-3"><StatusBadge domain="expense" status={String(e.status)} /><span className="font-semibold tabular-nums">{formatAmount(String(e.currency), String(e.total))}</span></div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No expenses linked to this project.</p>}
      </CardContent>
    </Card>
  );
}
