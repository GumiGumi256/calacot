import Link from "next/link";
import { readReconciliations, type SearchParams } from "@/lib/banking/reads";
import { AccountingNav } from "@/components/accounting/shared";
import { BankingNav, Money } from "@/components/banking/shared";
import { StartReconciliation } from "@/components/banking/forms";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await readReconciliations(await searchParams);
  const reconcilable = d.accounts.filter((a) => a.ledger_id && !a.open_reconciliation_id);
  const focus = d.account ? d.accounts.find((a) => a.id === d.account) : undefined;
  const last = d.account ? d.rows.find((r) => r.status === "finalized" && r.banking_account_id === d.account) : undefined;
  const nextDay = (iso: string) => { const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
  return (
    <PageContainer>
      <PageHeader
        title="Bank reconciliation"
        description="Agree each account's statement with its books, period by period. A period is finalized by a second person only when the balance equation holds with nothing unexplained; its figures are then kept forever."
        primaryAction={d.can.reconcile && reconcilable.length > 0 && <StartReconciliation accounts={reconcilable} today={d.today}
          defaults={focus && last ? { accountId: focus.id, start: nextDay(last.period_end), opening: last.closing_statement_balance } : focus ? { accountId: focus.id, start: "", opening: "" } : undefined} />}
      />
      <AccountingNav current="/admin/accounting/reconciliation" />
      <BankingNav current="/admin/accounting/reconciliation" />
      <Card>
        <CardHeader><CardTitle as="h2">{focus ? `${focus.label} reconciliations` : "All reconciliations"}</CardTitle><CardDescription>{focus ? <Link className="underline underline-offset-4" href="?">Show all accounts</Link> : "Unfinished periods first."}</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.rows.length === 0 ? <EmptyState kind="no-records" compact title="No reconciliations yet" description="Import a statement, then start a reconciliation with the balances printed on it." /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Period</TableHead><TableHead className="text-right">Closing statement</TableHead><TableHead className="text-right">Closing book</TableHead><TableHead className="text-right">Unexplained</TableHead><TableHead>Status</TableHead><TableHead>People</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Link className="font-medium hover:underline" href={`/admin/accounting/reconciliation/${r.id}`}>{r.account_label}</Link></TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(r.period_start)} – {formatDate(r.period_end)}</TableCell>
                    <TableCell className="text-right"><Money currency={r.currency} value={r.closing_statement_balance} /></TableCell>
                    <TableCell className="text-right"><Money currency={r.currency} value={r.figures?.closingBook} /></TableCell>
                    <TableCell className={r.figures?.balanced ? "text-right" : "text-right font-medium text-destructive"}>{r.figures?.balanced ? "None" : <Money currency={r.currency} value={r.figures?.difference} />}{!r.figures?.balanced && r.figures?.unmatchedStatementCount ? <span className="block text-xs">{r.figures.unmatchedStatementCount} unmatched</span> : null}</TableCell>
                    <TableCell><StatusBadge domain="bankReconciliation" status={r.status} />{r.reopen_count > 0 && <span className="block text-xs text-muted-foreground">Reopened {r.reopen_count}×</span>}</TableCell>
                    <TableCell className="text-sm">{r.prepared_by}{r.finalized_by ? ` · finalized by ${r.finalized_by}` : r.submitted_by ? ` · submitted by ${r.submitted_by}` : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
