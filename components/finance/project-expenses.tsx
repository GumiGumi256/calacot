import Link from "next/link";
import { expenseStatusLabels, formatAmount } from "@/lib/finance/options";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Row = Record<string, unknown>;
type Summary = { currency: string; requested: string; approved: string; disbursed: string; outstanding: string; reconciled: string };
const actionLabels: Record<string, string> = {
  created: "draft created", updated: "edited", submit: "submitted", withdraw: "withdrawn", cancel: "cancelled", approve: "approved", return: "returned for correction",
  reject: "rejected", disbursement_recorded: "disbursement recorded", disbursement_void: "disbursement voided", disbursement_reconcile: "disbursement reconciled", document_attached: "document attached",
};
const day = (v: unknown) => {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeZone: "Africa/Kampala" }).format(d);
};

/** Read-only project expenditure. Shown only to staff with expenses_read. */
export function ProjectExpenses({ projectId, expenses, summary, activity }: { projectId: string; expenses: Row[]; summary: Summary[]; activity: Row[] }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Project expenditure</CardTitle>
          <CardDescription>Approved spending, recorded payments and evidence. Paying an expense does not change project, milestone or invoice status.</CardDescription>
        </div>
        <Button variant="outline" size="sm" render={<Link href={`/admin/expenses?view=all&projectId=${projectId}`} />}>View all project expenses</Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {summary.length ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            {summary.map((s) => (
              <div key={s.currency} className="rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-3 text-sm">
                <dt className="font-medium">{s.currency}</dt>
                <dd className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                  <span className="text-muted-foreground">Pending review</span><span>{formatAmount(s.currency, s.requested)}</span>
                  <span className="text-muted-foreground">Approved</span><span>{formatAmount(s.currency, s.approved)}</span>
                  <span className="text-muted-foreground">Paid (disbursed)</span><span>{formatAmount(s.currency, s.disbursed)}</span>
                  <span className="text-muted-foreground">Approved, not yet paid</span><span>{formatAmount(s.currency, s.outstanding)}</span>
                  <span className="text-muted-foreground">Reconciled</span><span>{formatAmount(s.currency, s.reconciled)}</span>
                </dd>
              </div>
            ))}
          </dl>
        ) : <p className="text-sm text-muted-foreground">No expenses linked to this project.</p>}
        {expenses.length > 0 && (
          <ul className="divide-y text-sm" aria-label="Most recent 50 project expenses">
            {expenses.map((e) => (
              <li key={String(e.id)} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link className="underline-offset-4 hover:underline" href={`/admin/expenses/${e.id}`}>{String(e.description)}</Link>
                <span className="text-muted-foreground">
                  {expenseStatusLabels[String(e.status)] ?? String(e.status)} / {formatAmount(String(e.currency), String(e.total))} / paid {formatAmount(String(e.currency), String(e.disbursed))} / {Number(e.documents)} document(s)
                </span>
              </li>
            ))}
          </ul>
        )}
        {activity.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Financial activity (most recent 30)</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {activity.map((a, i) => <li key={i}>{day(a.created_at)}: <Link className="underline-offset-4 hover:underline" href={`/admin/expenses/${a.expense_id}`}>{String(a.description)}</Link> {actionLabels[String(a.action)] ?? String(a.action)} by {String(a.actor)}</li>)}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
