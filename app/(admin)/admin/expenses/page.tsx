import Link from "next/link";
import { readExpenseList, type SearchParams } from "@/lib/finance/expenses";
import { expenseStatuses, expenseStatusLabels, formatAmount, type ExpenseView } from "@/lib/finance/options";
import { divisions } from "@/lib/sales/contracts";
import { FilterBar, Pager, fmtDate } from "@/components/admin/list-controls";
import { ExpenseStatusBadge } from "@/components/finance/expense-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const viewLabels: Record<ExpenseView, string> = { mine: "My requests", review: "Needs review", payable: "Approved, awaiting payment", all: "All expenses" };
const exceptionLabels: Record<string, string> = {
  paid_without_disbursement: "Paid expenses without a disbursement record (recorded before this workflow)",
  unreconciled_over_30_days: "Disbursements not reconciled after 30 days",
  cash_without_reference_or_evidence: "Cash disbursements with no reference or evidence",
  pending_review_over_7_days: "Requests waiting for review for more than 7 days",
};

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const data = await readExpenseList(await searchParams);
  const exceptions = data.exceptions;
  const views: ExpenseView[] = data.canAll ? ["mine", ...(data.canReview ? ["review" as const] : []), ...(data.canPay ? ["payable" as const] : []), "all"] : ["mine"];
  const tabHref = (view: ExpenseView) => `?view=${view}`;
  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Expenses</CardTitle>
            <CardDescription>Request, review, approve and record payment of company spending. Approval authorizes spending; disbursements record money actually paid.</CardDescription>
          </div>
          {data.canCreate && <Button render={<Link href="/admin/expenses/new" />}>New expense request</Button>}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav aria-label="Expense views" className="flex flex-wrap gap-2">
            {views.map((v) => (
              <Button key={v} size="sm" variant={data.view === v ? "default" : "outline"} render={<Link href={tabHref(v)} aria-current={data.view === v ? "page" : undefined} />}>
                {viewLabels[v]}
                {v === "review" && data.counts?.review ? ` (${data.counts.review})` : ""}
                {v === "payable" && data.counts?.payable ? ` (${data.counts.payable})` : ""}
                {v === "mine" && data.counts?.mine_returned ? ` (${data.counts.mine_returned} returned)` : ""}
              </Button>
            ))}
          </nav>
          {exceptions.length > 0 && (
            <section aria-labelledby="expense-exceptions" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <h2 id="expense-exceptions" className="font-medium">Needs attention</h2>
              <ul className="mt-1 list-disc pl-5">{exceptions.map((x) => <li key={x.kind}>{exceptionLabels[x.kind] ?? x.kind}: {x.count}</li>)}</ul>
            </section>
          )}
          <FilterBar
            reset={`?view=${data.view}`}
            values={data.filters}
            fields={[
              { name: "search", label: "Search", type: "search" },
              { name: "status", label: "Status", type: "select", options: expenseStatuses },
              { name: "division", label: "Division", type: "select", options: divisions },
              { name: "currency", label: "Currency", type: "select", options: ["UGX", "USD"] },
              { name: "from", label: "From date", type: "date" },
              { name: "to", label: "Through date", type: "date" },
            ]}
            hidden={{ view: data.view, projectId: data.filters.projectId }}
          />
          {data.summary.length > 0 && (
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm" aria-label="Totals for matching expenses">
              {data.summary.map((s) => (
                <div key={s.currency} className="flex flex-wrap gap-x-4">
                  <dt className="font-medium">{s.currency}</dt>
                  <dd>Pending review {formatAmount(s.currency, s.requested)}</dd>
                  <dd>Approved {formatAmount(s.currency, s.approved)}</dd>
                  <dd>Disbursed {formatAmount(s.currency, s.disbursed)}</dd>
                  <dd>Outstanding {formatAmount(s.currency, s.outstanding)}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Division / project</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Disbursed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expense date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      {data.view === "review" ? "No requests are waiting for review." : data.view === "payable" ? "No approved expenses are waiting for payment." : data.view === "mine" ? "You have no expense requests matching these filters." : "No expenses match these filters."}
                    </TableCell>
                  </TableRow>
                )}
                {data.rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="max-w-72">
                      <Link href={`/admin/expenses/${e.id}`} className="font-medium underline-offset-4 hover:underline">{e.description}</Link>
                      <div className="text-xs text-muted-foreground">{e.category}{e.supplier ? ` / ${e.supplier}` : ""}</div>
                    </TableCell>
                    <TableCell>
                      <span className="capitalize">{e.division}</span>
                      {e.project_id && <div className="text-xs"><Link href={`/admin/projects/${e.project_id}`} className="underline-offset-4 hover:underline">{e.project}</Link></div>}
                    </TableCell>
                    <TableCell>{e.requester ?? "Not recorded"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(e.currency, e.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.legacy_paid ? <span className="text-xs text-muted-foreground">No record</span> : formatAmount(e.currency, e.disbursed)}</TableCell>
                    <TableCell><ExpenseStatusBadge status={e.status} reconciled={e.status === "paid" && Number(e.disbursed) > 0 && e.reconciled === e.disbursed} /></TableCell>
                    <TableCell>{fmtDate(e.incurred_on)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager path="" params={{ ...data.filters, size: String(data.size) }} page={data.page} size={data.size} total={data.total} />
          <p className="text-xs text-muted-foreground">Status guide: {expenseStatuses.map((s) => expenseStatusLabels[s]).join(", ")}. Amounts are shown per currency and never combined.</p>
        </CardContent>
      </Card>
    </main>
  );
}
