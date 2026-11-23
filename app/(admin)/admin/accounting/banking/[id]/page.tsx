import Link from "next/link";
import { UploadIcon } from "lucide-react";
import { readBankingAccount, type SearchParams } from "@/lib/banking/reads";
import { bankingKindLabels, matchKindLabels, reviewReasonLabels, type BankingKind } from "@/lib/banking/catalog";
import { ledgerAmount } from "@/lib/accounting/format";
import { AccountingNav } from "@/components/accounting/shared";
import { BankingNav, Balances, Money } from "@/components/banking/shared";
import { AdjustmentForm, CancelMatch, ConfirmSuggestion, ManualMatch, ReviewLine } from "@/components/banking/forms";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";

const views = [
  { value: "unmatched", label: "Needs matching" },
  { value: "review", label: "Duplicate review" },
  { value: "all", label: "All lines" },
  { value: "duplicates", label: "Skipped duplicates" },
];

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const d = await readBankingAccount(id, await searchParams);
  const a = d.account;
  const statementPickable = d.lines.filter((l) => l.review_status === "active" && l.residual !== "0.00" && !l.adjustment_status)
    .map((l) => ({ id: l.id, date: l.txn_date, label: `${l.description}${l.reference ? ` · ${l.reference}` : ""}`, residual: l.residual }));
  const ledgerPickable = d.ledger.filter((l) => l.residual !== "0.00").map((l) => ({ id: l.id, date: l.entry_date, label: `${l.number} · ${l.description}`, residual: l.residual }));
  const firstPeriod = d.reconciliations.length > 0 && !d.reconciliations.some((r) => r.status === "finalized");
  return (
    <PageContainer>
      <PageHeader
        title={a.label}
        description={<>{bankingKindLabels[a.kind as BankingKind]}{a.provider ? ` · ${a.provider}` : ""}{a.identifier ? ` · ${a.identifier}` : ""} · {a.currency}{a.ledger_code ? ` · ledger ${a.ledger_code} ${a.ledger_name}` : ""}</>}
        meta={<StatusBadge domain="bankingAccount" status={a.status} />}
        primaryAction={d.can.importStatements && (a.kind === "bank" || a.kind === "mobile_money") && a.ledger_id && <Button render={<Link href={`/admin/accounting/banking/import?account=${a.id}`} />}><UploadIcon data-icon="inline-start" />Import statement</Button>}
        secondaryActions={<Button variant="outline" render={<Link href={`/admin/accounting/reconciliation?account=${a.id}`} />}>Reconciliations</Button>}
      />
      <AccountingNav current="/admin/accounting/banking" />
      <BankingNav current="" />
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Balances currency={a.currency} book={a.book_balance} statement={a.statement_balance} statementDate={a.statement_date} reconciled={a.reconciled_balance} reconciledTo={a.reconciled_to} />
          {!a.ledger_id && <p className="text-sm text-warning">This account has no approved ledger account, so nothing can be matched or posted. <Link className="underline" href="/admin/accounting/banking/setup">Propose one</Link>.</p>}
          {d.lockedUntil && <p className="text-sm text-muted-foreground">Reconciled and locked to {formatDate(d.lockedUntil)}. Matches dated on or before then cannot change unless that reconciliation is reopened.</p>}
        </CardContent>
      </Card>

      <nav aria-label="Statement line views" className="flex flex-wrap gap-2">
        {views.map((v) => <Button key={v.value} size="sm" variant={d.view === v.value ? "default" : "outline"} render={<Link href={`?view=${v.value}`} aria-current={d.view === v.value ? "page" : undefined} />}>{v.label}{v.value === "review" && a.review_count ? ` (${a.review_count})` : v.value === "unmatched" && a.unmatched_count ? ` (${a.unmatched_count})` : ""}</Button>)}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{views.find((v) => v.value === d.view)?.label}</CardTitle>
          <CardDescription>
            {d.view === "unmatched" && "Bank lines not yet explained by the books. Confirm a suggestion, match manually below, or classify bank charges and interest. Suggestions are never applied automatically, and a matching reference alone is never treated as proof."}
            {d.view === "review" && "Lines that may already be in the books from another statement. Decide each one; nothing is counted until you do."}
            {d.view === "all" && "Every statement line kept for this account (skipped duplicates excluded)."}
            {d.view === "duplicates" && "Rows that repeated a line already imported. Kept for the record; never counted."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {d.lines.length === 0 ? <EmptyState kind="no-records" compact title={d.view === "unmatched" ? "Everything is matched" : "Nothing here"} description={d.view === "unmatched" ? "Every imported bank line is explained by the books." : "No lines in this view."} /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Unmatched</TableHead><TableHead className="min-w-64">Next step</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.lines.map((l) => {
                  const sugg = (d.suggestions[l.id] ?? []) as { ledgerId: string; score: number; signals: string[]; ledger: { number: string; description: string; entry_date: string } }[];
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap align-top">{formatDate(l.txn_date)}</TableCell>
                      <TableCell className="min-w-56 align-top">
                        <span className="block">{l.description}</span>
                        <span className="text-xs text-muted-foreground">{l.reference ? `Ref ${l.reference} · ` : ""}{l.file_name} row {l.source_row}</span>
                        {l.review_status !== "active" && <span className="mt-1 block"><StatusBadge domain="statementLine" status={l.review_status} /> <span className="text-xs text-muted-foreground">{l.review_reason ? reviewReasonLabels[l.review_reason] : ""}</span></span>}
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">{ledgerAmount(l.amount)}</TableCell>
                      <TableCell className="text-right align-top tabular-nums">{l.review_status === "active" ? ledgerAmount(l.residual, { blankZero: true }) || "Matched" : "—"}</TableCell>
                      <TableCell className="align-top">
                        {l.review_status === "needs_review" && d.can.match && <ReviewLine id={l.id} reason={l.review_reason} />}
                        {l.review_status === "active" && l.adjustment_status && <span className="text-sm">Adjustment <StatusBadge domain="cashTransaction" status={l.adjustment_status} /></span>}
                        {l.review_status === "active" && l.residual !== "0.00" && !l.adjustment_status && (
                          <div className="flex flex-col gap-2">
                            {sugg.map((s) => (
                              <div key={s.ledgerId} className="flex flex-col gap-1 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-2 text-sm">
                                <span><span className="font-medium">{s.score >= 100 ? "Exact match" : "Suggested"}</span>: {s.ledger.number} · {s.ledger.description} · {formatDate(s.ledger.entry_date)}</span>
                                <span className="text-xs text-muted-foreground">{s.signals.join(" · ")}</span>
                                {d.can.match && <ConfirmSuggestion accountId={a.id} statementLineId={l.id} journalLineId={s.ledgerId} amount={l.residual} label={s.ledger.number} />}
                              </div>
                            ))}
                            {sugg.length === 0 && <span className="text-sm text-muted-foreground">No matching posted entry. Match manually, record the missing transaction, or classify a bank charge or interest.</span>}
                            {d.can.match && l.residual === l.amount && <AdjustmentForm kind="bank_adjustment" sourceId={l.id} label={`${l.description}, ${a.currency} ${ledgerAmount(l.amount)} on ${l.txn_date}`} direction={l.amount.startsWith("-") ? "out" : "in"} approvedCategories={d.approvedCategories} />}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {d.can.match && a.ledger_id && (statementPickable.length > 0 || ledgerPickable.length > 0) && (
        <Card>
          <CardHeader><CardTitle as="h2">Match manually</CardTitle><CardDescription>One bank line with several entries, several bank lines with one entry, part of a line with an explanation, or reversal pairs. The amounts must balance; what is left stays visible as unmatched.</CardDescription></CardHeader>
          <CardContent><ManualMatch accountId={a.id} statement={statementPickable} ledger={ledgerPickable} firstPeriod={firstPeriod} /></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle as="h2">Matches</CardTitle><CardDescription>Confirmed matches. A match never changes the ledger.</CardDescription></CardHeader>
        <CardContent className="flex flex-col divide-y">
          {d.groups.length === 0 ? <p className="text-sm text-muted-foreground">No matches yet.</p> : d.groups.map((g) => (
            <div key={g.id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-medium">{matchKindLabels[g.kind] ?? g.kind} · {formatDate(g.effective_date)}{g.partial ? " · partial" : ""}</p>
                <ul className="text-muted-foreground">{g.items.map((i, n) => <li key={n}>{i.statementLineId ? "Bank" : "Ledger"}: {i.label} · <Money currency={a.currency} value={i.amount} /></li>)}</ul>
                {g.note && <p className="mt-1 break-words">{g.note}</p>}
                <p className="text-xs text-muted-foreground">{g.created_by}, {formatDateTime(g.created_at)}</p>
              </div>
              {d.can.match && !g.locked && g.kind !== "adjustment" && <CancelMatch id={g.id} />}
              {g.locked && <span className="text-xs text-muted-foreground">Locked by a finalized reconciliation</span>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle as="h2">Statement imports</CardTitle><CardDescription>Original files are kept privately with their fingerprint.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.imports.length === 0 ? <p className="text-sm text-muted-foreground">No statements imported.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Dates</TableHead><TableHead className="text-right">Rows</TableHead><TableHead className="text-right">New</TableHead><TableHead className="text-right">Duplicates</TableHead><TableHead className="text-right">To review</TableHead><TableHead>Statement balances</TableHead><TableHead>Imported</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.imports.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.file_name}</TableCell><TableCell className="whitespace-nowrap">{i.first_date} – {i.last_date}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.row_count}</TableCell><TableCell className="text-right tabular-nums">{i.imported_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.duplicate_count}</TableCell><TableCell className="text-right tabular-nums">{i.review_count}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{i.derived_opening_balance ? `${ledgerAmount(i.derived_opening_balance)} → ${ledgerAmount(i.derived_closing_balance)}` : <span className="text-muted-foreground">Not derivable</span>}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{i.imported_by}, {formatDate(i.created_at)}</TableCell>
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
