import { readBankingReports, type SearchParams } from "@/lib/banking/reads";
import { fromMinor, toMinor } from "@/lib/accounting/bank-reconciliation";
import { bankingKindLabels, categoryLabels, type BankingKind, type Category } from "@/lib/banking/catalog";
import { AccountingNav } from "@/components/accounting/shared";
import { BankingNav, Money, providerBalanceNote } from "@/components/banking/shared";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

/** Exact decimal-string addition for per-currency subtotals (never floats, never across currencies). */
function addDecimal(a: string, b: string) {
  const norm = (v: string) => v.replace(/^--/, "");
  return fromMinor(toMinor(norm(a)) + toMinor(norm(b)));
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await readBankingReports(await searchParams);
  const currencies = [...new Set(d.accounts.map((a) => a.currency))];
  const totals = (cur: string, field: "book") => d.accounts.filter((a) => a.currency === cur && a.mapped).reduce((s, a) => addDecimal(s, a[field]), "0.00");
  return (
    <PageContainer>
      <PageHeader title="Banking and cash reports" description="Balances, reconciliation progress, cash movements, advances, counts, transfers, and recognized bank charges and interest. Every figure is shown per currency; nothing is converted or combined across currencies." />
      <AccountingNav current="/admin/accounting/banking" />
      <BankingNav current="/admin/accounting/banking/reports" />
      <Card>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" action="">
            <label className="flex flex-col gap-1 text-sm">From<Input type="date" name="from" defaultValue={d.from} max={d.today} /></label>
            <label className="flex flex-col gap-1 text-sm">To (balances as at)<Input type="date" name="to" defaultValue={d.to} max={d.today} /></label>
            <Button type="submit" size="sm" variant="outline">Update</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle as="h2">Balances as at {formatDate(d.to)}</CardTitle><CardDescription>{providerBalanceNote}</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Book (posted ledger)</TableHead><TableHead className="text-right">Statement (imported)</TableHead><TableHead className="text-right">Reconciled</TableHead><TableHead className="text-right">Unmatched bank lines</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><span className="font-medium">{a.label}</span><span className="block text-xs text-muted-foreground">{bankingKindLabels[a.kind as BankingKind]} · {a.currency}{a.mapped ? "" : " · no approved ledger account"}</span></TableCell>
                  <TableCell className="text-right">{a.mapped ? <Money currency={a.currency} value={a.book} /> : "—"}</TableCell>
                  <TableCell className="text-right"><Money currency={a.currency} value={a.statement} />{a.statement_date && <span className="block text-xs text-muted-foreground">{formatDate(a.statement_date)}</span>}</TableCell>
                  <TableCell className="text-right"><Money currency={a.currency} value={a.reconciled_balance} />{a.reconciled_to && <span className="block text-xs text-muted-foreground">to {formatDate(a.reconciled_to)}</span>}</TableCell>
                  <TableCell className="text-right">{a.unmatched_count ? <><Money currency={a.currency} value={a.unmatched_net} /><span className="block text-xs text-warning">{a.unmatched_count} line(s)</span></> : "None"}</TableCell>
                </TableRow>
              ))}
              {currencies.map((cur) => <TableRow key={cur} className="font-medium"><TableCell>Total book balance, {cur}</TableCell><TableCell className="text-right"><Money currency={cur} value={totals(cur, "book")} strong /></TableCell><TableCell colSpan={3} /></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle as="h2">Reconciliation progress</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-sm">
            {(["in_progress", "submitted", "finalized"] as const).map((s) => <span key={s} className="flex items-center gap-2"><StatusBadge domain="bankReconciliation" status={s} /><span className="tabular-nums">{d.progress[s] ?? 0}</span></span>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle as="h2">Bank charges, interest and cash differences recognized</CardTitle><CardDescription>Posted adjustments in the period.</CardDescription></CardHeader>
          <CardContent>
            {d.recognized.length === 0 ? <p className="text-sm text-muted-foreground">None in this period.</p> : (
              <ul className="flex flex-col gap-1 text-sm">{d.recognized.map((r) => <li key={`${r.category}-${r.currency}`} className="flex justify-between gap-4"><span>{categoryLabels[r.category as Category] ?? r.category} ({r.count})</span><Money currency={r.currency} value={r.total} /></li>)}</ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle as="h2">Cash movement by month</CardTitle><CardDescription>Posted money in and out of each account, {formatDate(d.from)} to {formatDate(d.to)}. Transfers appear on both accounts.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.movement.length === 0 ? <p className="text-sm text-muted-foreground">No posted movements in this period.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Account</TableHead><TableHead className="text-right">In</TableHead><TableHead className="text-right">Out</TableHead><TableHead className="text-right">Net</TableHead></TableRow></TableHeader>
              <TableBody>{d.movement.map((m) => <TableRow key={`${m.month}-${m.label}`}><TableCell>{m.month}</TableCell><TableCell>{m.label}</TableCell><TableCell className="text-right"><Money currency={m.currency} value={m.inflow} /></TableCell><TableCell className="text-right"><Money currency={m.currency} value={m.outflow} /></TableCell><TableCell className="text-right"><Money currency={m.currency} value={addDecimal(m.inflow, `-${m.outflow}`)} /></TableCell></TableRow>)}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle as="h2">Cash advances outstanding</CardTitle><CardDescription>Current, by employee.</CardDescription></CardHeader>
          <CardContent>
            {d.advances.length === 0 ? <p className="text-sm text-muted-foreground">None outstanding.</p> : (
              <ul className="flex flex-col gap-1 text-sm">{d.advances.map((a) => <li key={`${a.staff}-${a.currency}`} className="flex justify-between gap-4"><span>{a.staff} · {a.count} advance(s), oldest {formatDate(a.oldest)}</span><Money currency={a.currency} value={a.outstanding} strong /></li>)}</ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle as="h2">Cash count differences</CardTitle></CardHeader>
          <CardContent>
            {d.counts.length === 0 ? <p className="text-sm text-muted-foreground">No counts in this period.</p> : (
              <ul className="flex flex-col gap-1 text-sm">{d.counts.map((c, i) => <li key={i} className="flex justify-between gap-4"><span>{c.account}, {formatDate(c.count_date)}</span><span className={c.difference === "0.00" ? "" : "text-warning"}><Money currency={c.currency} value={c.difference} /></span></li>)}</ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle as="h2">Transfers between accounts</CardTitle><CardDescription>{formatDate(d.from)} to {formatDate(d.to)}. Transfers are neither income nor expense.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.transfers.length === 0 ? <p className="text-sm text-muted-foreground">No transfers in this period.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{d.transfers.map((t, i) => <TableRow key={i}><TableCell>{formatDate(t.txn_date)}</TableCell><TableCell>{t.from_label}</TableCell><TableCell>{t.to_label}</TableCell><TableCell>{t.reference}</TableCell><TableCell className="text-right"><Money currency={t.currency} value={t.amount} /></TableCell><TableCell><StatusBadge domain="cashTransaction" status={t.status} /></TableCell></TableRow>)}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
