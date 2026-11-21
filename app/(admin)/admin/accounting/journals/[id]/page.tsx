import Link from "next/link";
import { randomUUID } from "node:crypto";
import { readJournal } from "@/lib/accounting/reads";
import { summarizeLines, fromMinor } from "@/lib/accounting/engine";
import { ledgerAmount } from "@/lib/accounting/format";
import { Amount, History, ReadinessPanel } from "@/components/accounting/shared";
import { JournalActions, ReverseJournal } from "@/components/accounting/journal-actions";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";

const statusHelp: Record<string, string> = {
  draft: "Draft. It does not affect any balance. The preparer can edit it and submit it for approval.",
  submitted: "Awaiting approval by someone other than the preparer. Lines are locked.",
  approved: "Approved but not yet in the ledger. It must be posted to affect balances.",
  posted: "Posted to the general ledger. It is permanent and can only be corrected by a reversal.",
  rejected: "Rejected. It never affected the ledger and is kept for the record.",
  discarded: "Discarded by the preparer. It never affected the ledger and is kept for the record.",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await readJournal(id);
  const j = d.journal;
  const summary = summarizeLines(d.lines.map((l) => ({ accountId: l.account_id, debit: l.debit, credit: l.credit, currency: l.currency, exchangeRate: l.exchange_rate_id ? l.exchange_rate : null })));
  const foreign = d.lines.some((l) => l.exchange_rate_id || (d.readiness.policy && l.currency !== d.readiness.policy.functional_currency));
  const inactive = d.lines.filter((l) => l.account_status !== "active");
  const blocked = !d.readiness.postingReady ? d.readiness.checklist.find((c) => !c.done)?.label + " is not complete." :
    foreign ? "Lines in another currency cannot be posted while multi-currency posting is disabled." :
    inactive.length ? `Account ${inactive[0].code} is not active.` : undefined;
  const a = d.actions;
  const hasActions = a.edit || a.submit || a.withdraw || a.discard || a.review || a.returnApproved || a.post || a.reverse;
  const ownSubmitted = d.mine && j.status === "submitted";
  return (
    <PageContainer>
      <PageHeader
        title={j.number ?? `${j.journal_type === "reversal" ? "Reversal" : "Journal"} (${j.status === "draft" ? "draft" : "not posted"})`}
        description={j.description}
        meta={<><StatusBadge domain="journal" status={j.status} /><span className="text-sm text-muted-foreground">Dated {formatDate(j.entry_date)}{j.period ? ` · ${j.period}` : ""}{j.reference ? ` · Ref ${j.reference}` : ""}</span></>}
      />
      <div className={hasActions || ownSubmitted ? "grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]" : "flex min-w-0 flex-col gap-6"}>
        {(hasActions || ownSubmitted) && (
          <aside aria-label="Next step" className="flex min-w-0 flex-col gap-6 xl:col-start-2 xl:row-start-1">
            <Card variant="attention" tone="warning">
              <CardHeader><CardTitle as="h2">Next step</CardTitle><CardDescription>{statusHelp[j.status]}</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-4">
                {a.edit && <div><Button variant="outline" render={<Link href={`/admin/accounting/journals/${id}/edit`} />}>Edit draft</Button></div>}
                <JournalActions journalId={id} version={j.version} requestKey={randomUUID()} actions={a} postingReady={!blocked} postBlockedReason={blocked} balanced={summary.balanced && d.lines.length >= 2} />
                {ownSubmitted && <p className="text-sm text-muted-foreground">You prepared this journal, so a different authorized person must approve it.</p>}
                {a.reverse && j.number && <ReverseJournal journalId={id} number={j.number} requestKey={randomUUID()} today={d.today} entryDate={j.entry_date} />}
              </CardContent>
            </Card>
            {a.post && <ReadinessPanel readiness={d.readiness} compact />}
          </aside>
        )}
        <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-start-1">
          {(j.reverses_number || j.reversal_number) && (
            <Card variant="flat">
              <CardContent className="text-sm">
                {j.reverses_journal_id && <p>Reverses <Link className="font-medium underline-offset-4 hover:underline" href={`/admin/accounting/journals/${j.reverses_journal_id}`}>{j.reverses_number}</Link>. Reason: {j.reversal_reason}</p>}
                {j.reversal_id && <p>Reversed by <Link className="font-medium underline-offset-4 hover:underline" href={`/admin/accounting/journals/${j.reversal_id}`}>{j.reversal_number}</Link>. This journal remains in the ledger; the two together net to zero.</p>}
              </CardContent>
            </Card>
          )}
          <Card className="min-w-0">
            <CardHeader><CardTitle as="h2">Lines</CardTitle><CardDescription>{j.status === "posted" ? `Posted in ${j.functional_currency}.` : "Not posted: these lines do not affect any balance."}</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead className="w-10">#</TableHead><TableHead>Account</TableHead><TableHead>Dimensions</TableHead><TableHead>Currency</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {d.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-muted-foreground">{l.line_number}</TableCell>
                      <TableCell className="min-w-56">
                        <Link href={`/admin/accounting/accounts/${l.account_id}`} className="font-medium underline-offset-4 hover:underline">{l.code} {l.name}</Link>
                        {l.account_status !== "active" && <span className="ml-2 text-xs text-warning">({l.account_status})</span>}
                        {l.description && <div className="text-xs text-muted-foreground break-words">{l.description}</div>}
                      </TableCell>
                      <TableCell className="text-xs"><span className="capitalize">{l.division ?? "—"}</span>{l.project && <div>{l.project}</div>}</TableCell>
                      <TableCell className="text-xs">{l.currency}{l.exchange_rate_id && <div className="text-muted-foreground">@ {l.exchange_rate} ({l.rate_date})<br />= {ledgerAmount(l.functional_debit !== "0.00" ? l.functional_debit : l.functional_credit)} functional</div>}</TableCell>
                      <TableCell className="text-right"><Amount value={l.debit} /></TableCell>
                      <TableCell className="text-right"><Amount value={l.credit} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  {summary.byCurrency.map((t) => (
                    <TableRow key={t.currency}>
                      <TableCell colSpan={3} className="font-medium">Total {t.currency}{t.difference !== BigInt(0) && <span className="ml-2 text-destructive">difference {ledgerAmount(fromMinor(t.difference))}</span>}</TableCell>
                      <TableCell>{t.currency}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{ledgerAmount(fromMinor(t.debit))}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{ledgerAmount(fromMinor(t.credit))}</TableCell>
                    </TableRow>
                  ))}
                </TableFooter>
              </Table>
              {d.lines.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No lines yet.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle as="h2">Approval record</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
                <dt className="text-muted-foreground">Prepared by</dt><dd>{j.prepared_by}, {formatDateTime(j.prepared_at)}</dd>
                <dt className="text-muted-foreground">Submitted</dt><dd>{j.submitted_at ? formatDateTime(j.submitted_at) : "Not submitted"}</dd>
                <dt className="text-muted-foreground">Approved by</dt><dd>{j.journal_type === "reversal" ? "Not required (controlled reversal)" : j.approved_by ? `${j.approved_by}, ${formatDateTime(j.approved_at)}` : "Not approved"}</dd>
                {j.review_note && <><dt className="text-muted-foreground">Reviewer note</dt><dd className="break-words">{j.reviewed_by}: {j.review_note}</dd></>}
                <dt className="text-muted-foreground">Posted by</dt><dd>{j.posted_by ? `${j.posted_by}, ${formatDateTime(j.posted_at)}` : "Not posted"}</dd>
                <dt className="text-muted-foreground">Version</dt><dd>{j.version}</dd>
              </dl>
            </CardContent>
          </Card>
          <History events={d.events} />
        </div>
      </div>
    </PageContainer>
  );
}
