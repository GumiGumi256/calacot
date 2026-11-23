import Link from "next/link";
import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { readReconciliation } from "@/lib/banking/reads";
import { problemLabels } from "@/lib/banking/catalog";
import { AccountingNav } from "@/components/accounting/shared";
import { BankingNav, Money } from "@/components/banking/shared";
import { EditReconciliation, ReconciliationActions } from "@/components/banking/forms";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";

const actionLabels: Record<string, string> = { created: "Started", updated: "Statement details edited", submit: "Submitted for review", return: "Returned to preparer", finalize: "Finalized", reopen: "Reopened" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await readReconciliation(id);
  const { r, figures: f } = d;
  const c = r.currency;
  const commands: ("submit" | "return" | "finalize" | "reopen")[] = [];
  if (r.status === "in_progress" && d.can.reconcile && f.balanced) commands.push("submit");
  if (r.status === "submitted" && d.can.finalize && d.me !== r.submitted_by_id && d.me !== r.prepared_by_id) commands.push("finalize", "return");
  if (r.status === "submitted" && d.can.finalize && (d.me === r.submitted_by_id || d.me === r.prepared_by_id)) commands.push("return");
  if (r.status === "finalized" && d.can.reopen && !d.hasLater) commands.push("reopen");
  const row = (label: string, value: string | null, note?: string, strong = false) => (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className={strong ? "font-medium" : undefined}>{label}{note && <span className="block text-xs text-muted-foreground">{note}</span>}</dt>
      <dd className="text-right"><Money currency={c} value={value} strong={strong} /></dd>
    </div>
  );
  return (
    <PageContainer>
      <PageHeader
        title={`${r.account_label}: ${formatDate(r.period_start)} – ${formatDate(r.period_end)}`}
        description={<>Prepared by {r.prepared_by}{r.submitted_by ? ` · submitted by ${r.submitted_by}` : ""}{r.finalized_by ? ` · finalized by ${r.finalized_by} on ${formatDateTime(r.finalized_at)}` : ""}</>}
        meta={<StatusBadge domain="bankReconciliation" status={r.status} />}
        secondaryActions={<Button variant="outline" render={<Link href={`/admin/accounting/banking/${r.banking_account_id}`} />}>Match transactions</Button>}
      />
      <AccountingNav current="/admin/accounting/reconciliation" />
      <BankingNav current="/admin/accounting/reconciliation" />

      <Card variant={f.balanced ? "default" : "attention"} tone="destructive">
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            {f.balanced ? <CheckCircle2Icon aria-hidden className="size-5 text-success" /> : <CircleAlertIcon aria-hidden className="size-5 text-destructive" />}
            {r.status === "finalized" ? "Finalized" : f.balanced ? "Reconciles: ready for review" : "Does not reconcile yet"}
          </CardTitle>
          <CardDescription>{f.balanced ? (r.status === "in_progress" ? "Submit it for a second person to review and finalize." : r.status === "submitted" ? "A different authorized person can now finalize it." : "The figures are preserved below.") : "Resolve each item below. Differences are never balanced automatically."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!f.balanced && (
            <ul className="flex flex-col gap-1 text-sm">
              {f.problems.map((p) => <li key={p} className="flex gap-2"><CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />{problemLabels[p] ?? p}</li>)}
            </ul>
          )}
          {f.pendingJournals > 0 && <p className="text-sm text-warning">{f.pendingJournals} journal(s) on this account dated in or before the period are not posted yet and are not in the book balance.</p>}
          {r.review_note && <p className="text-sm">Review note: {r.review_note}</p>}
          {r.reopen_reason && <p className="text-sm">Reopened by {r.reopened_by} on {formatDateTime(r.reopened_at)}: {r.reopen_reason}</p>}
          <ReconciliationActions id={r.id} version={r.version} commands={commands} />
          {r.status === "submitted" && d.me === r.submitted_by_id && <p className="text-sm text-muted-foreground">You submitted this, so a different person must finalize it.</p>}
          {r.status === "finalized" && d.hasLater && <p className="text-sm text-muted-foreground">A later period exists, so this one cannot be reopened until the later one is reopened.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><CardTitle as="h2">Statement</CardTitle><CardDescription>From the bank statement and imported lines.</CardDescription></div>
              {r.status === "in_progress" && d.can.reconcile && <EditReconciliation id={r.id} version={r.version} periodEnd={r.period_end} closing={r.closing_statement_balance} today={d.today} />}
            </div>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              {row("Opening statement balance", f.openingStatement)}
              {row("Statement lines in the period", f.statementMovement)}
              {row("Closing statement balance", f.closingStatement, "As printed on the statement", true)}
              {row("Check (must be zero)", f.statementCheck, "Opening + lines − closing")}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle as="h2">Balance equation</CardTitle><CardDescription>Adjusted statement balance must equal the book balance.</CardDescription></CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              {row("Closing statement balance", f.closingStatement)}
              {row("+ Deposits in transit", f.depositsInTransit, `${f.depositsInTransitCount} in the books, not yet on the statement`)}
              {row("− Outstanding payments", f.outstandingPayments, `${f.outstandingPaymentsCount} in the books, not yet on the statement`)}
              {row("− Unmatched bank lines", f.unmatchedStatementNet, `${f.unmatchedStatementCount} on the statement, not in the books`)}
              {row("= Adjusted statement balance", f.adjustedStatement, undefined, true)}
              {row("Book balance (posted ledger)", f.closingBook, `Opening book ${f.openingBook}`, true)}
              {row("Unexplained difference", f.difference, "Must be zero", true)}
            </dl>
          </CardContent>
        </Card>
      </div>

      {d.unmatched.length > 0 && (
        <Card>
          <CardHeader><CardTitle as="h2">Bank lines to resolve</CardTitle><CardDescription>On the statement up to the period end but not matched to the books. Match them, prepare an adjustment for charges and interest, or resolve duplicate reviews.</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Unmatched</TableHead><TableHead>State</TableHead></TableRow></TableHeader>
              <TableBody>{d.unmatched.map((u) => <TableRow key={u.id}><TableCell>{formatDate(u.txn_date)}</TableCell><TableCell>{u.description}{u.reference ? ` · ${u.reference}` : ""}</TableCell><TableCell className="text-right"><Money currency={c} value={u.residual} /></TableCell><TableCell><StatusBadge domain="statementLine" status={u.review_status} /></TableCell></TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {d.outstanding.length > 0 && (
        <Card>
          <CardHeader><CardTitle as="h2">Timing differences</CardTitle><CardDescription>Posted entries not yet on the statement at the period end. They should clear on a later statement; long-outstanding items need investigation.</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Journal</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Outstanding</TableHead></TableRow></TableHeader>
              <TableBody>{d.outstanding.map((o) => <TableRow key={o.id}><TableCell>{formatDate(o.entry_date)}</TableCell><TableCell>{o.number}</TableCell><TableCell>{o.description}</TableCell><TableCell className="text-right"><Money currency={c} value={o.residual} /></TableCell></TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {d.snapshots.length > 0 && (
        <Card>
          <CardHeader><CardTitle as="h2">Finalized figures</CardTitle><CardDescription>Every finalization is kept, including those later reopened.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {d.snapshots.map((s) => <p key={s.sequence}>#{s.sequence} · {s.finalized_by}, {formatDateTime(s.finalized_at)} · statement <Money currency={c} value={s.figures.closingStatement} /> · book <Money currency={c} value={s.figures.closingBook} /> · difference <Money currency={c} value={s.figures.difference} /></p>)}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle as="h2">History</CardTitle><CardDescription>Every change is recorded and cannot be edited.</CardDescription></CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3">
            {d.events.map((e) => <li key={e.id} className="border-l-2 border-border pl-3 text-sm"><div className="font-medium">{actionLabels[e.action] ?? e.action}</div><div className="text-xs text-muted-foreground">{e.actor} · {formatDateTime(e.created_at)}</div>{e.note && <p className="mt-1 break-words">{e.note}</p>}</li>)}
          </ol>
          {d.previousId && <p className="mt-4 text-sm"><Link className="underline underline-offset-4" href={`/admin/accounting/reconciliation/${d.previousId}`}>Previous period</Link></p>}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
