import Link from "next/link";
import { readCashPage, type SearchParams } from "@/lib/banking/reads";
import { cashKindLabels, categoryLabels, type CashKind, type Category } from "@/lib/banking/catalog";
import { ledgerAmount } from "@/lib/accounting/format";
import { AccountingNav } from "@/components/accounting/shared";
import { BankingNav, Money } from "@/components/banking/shared";
import { AdjustmentForm, CashCountForm, CashDecision, CashForm } from "@/components/banking/forms";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

const statusFilters = [{ value: "", label: "All" }, { value: "submitted", label: "Awaiting approval" }, { value: "posted", label: "Posted" }, { value: "rejected", label: "Rejected" }, { value: "discarded", label: "Cancelled" }];

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await readCashPage(await searchParams);
  const pending = d.rows.filter((r) => r.status === "submitted");
  const formData = {
    accounts: d.accounts.filter((a) => a.status === "active"), counters: d.counters, expenses: d.expenses,
    staff: d.staff.map((s) => ({ id: s.id, label: s.name })), advances: d.advances, approvedCategories: d.approvedCategories, today: d.today,
  };
  return (
    <PageContainer>
      <PageHeader
        title="Cash"
        description="Receipts, payments, transfers between company accounts, staff advances and cash counts. Each is prepared by one person and approved and posted by another through the general ledger."
        primaryAction={d.can.createCash && <CashForm data={formData} />}
        secondaryActions={d.can.createCash && <CashCountForm accounts={formData.accounts} staff={formData.staff} today={d.today} me={d.me} />}
      />
      <AccountingNav current="/admin/accounting/banking" />
      <BankingNav current="/admin/accounting/banking/cash" />
      {d.accounts.length === 0 && <EmptyState kind="no-records" title="No usable accounts" description="Cash transactions need active accounts with an approved ledger mapping. Set them up under Accounts and mappings." />}

      {pending.length > 0 && (
        <Card variant="attention" tone="warning">
          <CardHeader><CardTitle as="h2">Awaiting approval ({pending.length})</CardTitle><CardDescription>Approving posts the journal to the general ledger. You cannot approve what you prepared.</CardDescription></CardHeader>
          <CardContent className="flex flex-col divide-y">
            {pending.map((t) => (
              <div key={t.id} className="flex flex-col gap-3 py-3 first:pt-0 lg:flex-row lg:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{cashKindLabels[t.kind as CashKind]} · <Money currency={t.currency} value={t.amount} /> · {formatDate(t.txn_date)}</p>
                  <p>{t.description}{t.reference ? ` · ref ${t.reference}` : ""}</p>
                  <p className="text-muted-foreground">{[t.account, t.to_account && `→ ${t.to_account}`, t.counter, t.staff, t.category && categoryLabels[t.category as Category]].filter(Boolean).join(" · ")}</p>
                  <p className="text-xs text-muted-foreground">Prepared by {t.prepared_by}{t.evidence ? " · evidence attached" : ""} · <Link className="underline underline-offset-4" href={`/admin/accounting/journals/${t.journal_id}`}>journal lines</Link></p>
                </div>
                <div className="lg:w-80 lg:shrink-0"><CashDecision id={t.id} canApprove={d.can.approveCash} isPreparer={t.prepared_by_id === d.me} label={`${cashKindLabels[t.kind as CashKind]} ${t.description}`} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle as="h2">Advances outstanding</CardTitle><CardDescription>Cash given to employees and not yet accounted for. It is an asset of the company, not an expense, until receipts are accepted.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.advances.length === 0 ? <p className="text-sm text-muted-foreground">No outstanding advances.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Date</TableHead><TableHead>Purpose</TableHead><TableHead className="text-right">Advanced</TableHead><TableHead className="text-right">Outstanding</TableHead></TableRow></TableHeader>
              <TableBody>{d.advances.map((a) => <TableRow key={a.id}><TableCell>{a.staff}</TableCell><TableCell>{formatDate(a.txn_date)}</TableCell><TableCell>{a.description}{a.reference ? ` · ${a.reference}` : ""}</TableCell><TableCell className="text-right"><Money currency={a.currency} value={a.amount} /></TableCell><TableCell className="text-right"><Money currency={a.currency} value={a.outstanding} strong /></TableCell></TableRow>)}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle as="h2">Cash counts</CardTitle><CardDescription>Physical counts compared with the posted book balance on the count date. A difference needs an adjustment with evidence, approved by someone else.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.counts.length === 0 ? <p className="text-sm text-muted-foreground">No counts recorded.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Counted</TableHead><TableHead className="text-right">Book</TableHead><TableHead className="text-right">Difference</TableHead><TableHead>By</TableHead><TableHead>Adjustment</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.counts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.account}</TableCell><TableCell>{formatDate(c.count_date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{ledgerAmount(c.counted_amount)}</TableCell><TableCell className="text-right tabular-nums">{ledgerAmount(c.book_balance)}</TableCell>
                    <TableCell className={c.difference === "0.00" ? "text-right tabular-nums" : "text-right font-medium tabular-nums text-warning"}>{ledgerAmount(c.difference)}</TableCell>
                    <TableCell className="text-sm">{c.counted_by}{c.witness ? `, witnessed by ${c.witness}` : ""}{c.pending_journals ? <span className="block text-xs text-warning">{c.pending_journals} unposted transaction(s) at count time</span> : null}</TableCell>
                    <TableCell>
                      {c.difference === "0.00" ? <span className="text-sm text-muted-foreground">Agrees</span>
                        : c.adjustment_status ? <StatusBadge domain="cashTransaction" status={c.adjustment_status} />
                        : d.can.createCash ? <AdjustmentForm kind="count_adjustment" sourceId={c.id} label={`${c.account}: counted ${ledgerAmount(c.counted_amount)}, book ${ledgerAmount(c.book_balance)}`} direction={c.difference.startsWith("-") ? "out" : "in"} approvedCategories={d.approvedCategories} />
                        : <span className="text-sm text-warning">Needs adjustment</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">All cash transactions</CardTitle>
          <nav aria-label="Filter by status" className="flex flex-wrap gap-2 pt-2">
            {statusFilters.map((f) => <Button key={f.value} size="sm" variant={d.filters.status === f.value ? "default" : "outline"} render={<Link href={f.value ? `?status=${f.value}` : "?"} />}>{f.label}</Button>)}
          </nav>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {d.rows.length === 0 ? <EmptyState kind={d.filters.status ? "filtered-out" : "no-records"} compact title="No cash transactions" description="Prepared transactions appear here with their approval status." /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>Accounts</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead>Journal</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(t.txn_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{cashKindLabels[t.kind as CashKind]}</TableCell>
                    <TableCell className="min-w-48">{t.description}{t.reference ? <span className="block text-xs text-muted-foreground">Ref {t.reference}</span> : null}{t.outstanding && t.outstanding !== "0.00" ? <span className="block text-xs text-warning">Outstanding {ledgerAmount(t.outstanding)}</span> : null}</TableCell>
                    <TableCell className="min-w-40 text-sm">{[t.account, t.to_account && `→ ${t.to_account}`, t.counter, t.staff].filter(Boolean).join(" · ")}</TableCell>
                    <TableCell className="text-right"><Money currency={t.currency} value={t.amount} /></TableCell>
                    <TableCell><StatusBadge domain="cashTransaction" status={t.status} /></TableCell>
                    <TableCell className="whitespace-nowrap"><Link className="underline underline-offset-4" href={`/admin/accounting/journals/${t.journal_id}`}>{t.number ?? "Draft"}</Link></TableCell>
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
