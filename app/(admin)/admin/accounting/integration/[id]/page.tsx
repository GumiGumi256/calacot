import Link from "next/link";
import { randomUUID } from "node:crypto";
import { readIntegrationEvent } from "@/lib/accounting/integration";
import { eventLabel, guidanceFor, integrationEvents, sourceHref } from "@/lib/accounting/integration-catalog";
import { ledgerAmount } from "@/lib/accounting/format";
import { AccountingNav } from "@/components/accounting/shared";
import { RedateEvent, RetryEvent } from "@/components/accounting/integration-forms";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";

const actionLabels: Record<string, string> = { captured: "Captured", process: "Processed", retry: "Queued again", redate: "Re-dated into a later period", replay: "Re-queued after shadow preview" };
const payloadHidden = new Set(["clientId", "projectId", "supplierId", "invoiceId", "paymentId", "allocationId", "refundId", "expenseId", "creditNoteId", "financeAccountId"]);

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await readIntegrationEvent(id);
  const e = d.event;
  const def = integrationEvents.find((x) => x.type === e.event_type);
  const href = sourceHref(e.event_type, e.source_id, e.payload);
  const g = guidanceFor(e.last_error_code);
  const canRedate = ["period_closed", "period_missing", "reversal_date_before_original"].includes(e.last_error_code ?? "");
  return (
    <PageContainer>
      <PageHeader title={`${eventLabel(e.event_type)} ${e.document ?? ""}`.trim()} description={def?.when ?? ""} />
      <AccountingNav current="/admin/accounting/integration" />
      {(e.status === "blocked" || e.status === "failed") && (
        <Card variant="attention" tone={e.status === "failed" ? "destructive" : "warning"}>
          <CardHeader><CardTitle as="h2">What needs attention</CardTitle><CardDescription>{e.last_error_code}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>{g.problem}</p>
            <p className="text-muted-foreground">To resolve: {g.resolve}</p>
            {e.status === "failed" && e.last_error_detail && <p className="break-words text-xs text-muted-foreground">Technical detail: {e.last_error_detail}</p>}
            {e.next_attempt_at && <p className="text-muted-foreground">Automatic retry after {formatDateTime(e.next_attempt_at)}.</p>}
            {d.can.operate && (
              <div className="flex flex-wrap items-start gap-2">
                <RetryEvent eventId={e.id} requestKey={randomUUID()} />
                {canRedate && <RedateEvent eventId={e.id} requestKey={randomUUID()} effectiveDate={e.effective_date} openPeriods={d.openPeriods} />}
                {["mapping_missing", "mapping_account_missing", "mapping_ambiguous", "tax_treatment_unapproved", "mapping_unbalanced"].includes(e.last_error_code ?? "") &&
                  <Button size="sm" variant="outline" render={<Link href="/admin/accounting/integration/mappings" />}>Open event mappings</Button>}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle as="h2" className="flex flex-wrap items-center gap-2">Event <StatusBadge domain="integrationEvent" status={e.status} /></CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Amount</dt><dd className="tabular-nums">{e.currency} {ledgerAmount(e.amount)}</dd>
              <dt className="text-muted-foreground">Happened</dt><dd>{formatDateTime(e.occurred_at)}</dd>
              <dt className="text-muted-foreground">Accounting date</dt><dd>{formatDate(e.effective_date)}{e.posting_date && <span className="block text-muted-foreground">Posted in a later period on {formatDate(e.posting_date)}: {e.resolution_note}</span>}</dd>
              <dt className="text-muted-foreground">Source document</dt><dd>{href ? <Link href={href} className="underline-offset-4 hover:underline">{e.document ?? "Open"}</Link> : e.document ?? "—"}</dd>
              <dt className="text-muted-foreground">Ledger entry</dt><dd>{e.journal_id ? <Link href={`/admin/accounting/journals/${e.journal_id}`} className="underline-offset-4 hover:underline">{e.journal_number}</Link> : e.status === "no_effect" ? `None: ${e.resolution_note === "no_recognition_policy" ? "no approved recognition policy for this event" : e.resolution_note === "original_had_no_effect" ? "the original event had no accounting effect" : "the approved mapping records no entry"}` : "—"}</dd>
              <dt className="text-muted-foreground">Mapping</dt><dd>{e.mapping_id ? `Version ${e.mapping_version}: ${e.mapping_description}` : "—"}</dd>
              <dt className="text-muted-foreground">Policy version</dt><dd>{e.policy_version ?? "—"}</dd>
              <dt className="text-muted-foreground">Attempts</dt><dd>{e.attempts}</dd>
              <dt className="text-muted-foreground">Identity</dt><dd className="break-all font-mono text-xs">{e.event_key}</dd>
              <dt className="text-muted-foreground">Captured</dt><dd>{formatDateTime(e.created_at)} by {e.captured_by === "backfill" ? "historical capture" : "the business transaction"} ({e.capture_stage.replace("_", " ")})</dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle as="h2">Captured details</CardTitle><CardDescription>A snapshot taken in the same transaction as the business change. It never changes.</CardDescription></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              {Object.entries(e.payload).filter(([k, v]) => !payloadHidden.has(k) && v !== null && v !== "").map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{String(v)}</dd></div>
              ))}
            </dl>
            {d.dependencies.length > 0 && (
              <div className="mt-4 flex flex-col gap-1 text-sm">
                <p className="font-medium">Depends on</p>
                <ul className="flex flex-col gap-1">
                  {d.dependencies.map((x) => <li key={x.id}><Link href={`/admin/accounting/integration/${x.id}`} className="underline-offset-4 hover:underline">{eventLabel(x.event_type)}</Link> <StatusBadge domain="integrationEvent" status={x.status} /></li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {d.shadowLines.length > 0 && (
        <Card>
          <CardHeader><CardTitle as="h2">Shadow preview</CardTitle><CardDescription>The entry this event would post. It is not in the general ledger.</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
              <TableBody>{d.shadowLines.map((l) => <TableRow key={l.line_number}><TableCell>{l.account_code}</TableCell><TableCell className="text-right tabular-nums">{ledgerAmount(l.debit, { blankZero: true })}</TableCell><TableCell className="text-right tabular-nums">{ledgerAmount(l.credit, { blankZero: true })}</TableCell><TableCell>{formatDate(l.entry_date)}</TableCell></TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle as="h2">History</CardTitle><CardDescription>Every capture, attempt and resolution, append-only.</CardDescription></CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3 text-sm">
            {d.attempts.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 border-l-2 pl-3">
                <span className="font-medium">{actionLabels[a.action] ?? a.action}{a.to_status && <> → <StatusBadge domain="integrationEvent" status={a.to_status} /></>}</span>
                <span className="text-muted-foreground">{formatDateTime(a.created_at)}{a.actor ? ` · ${a.actor}` : ""}{a.worker ? ` · ${a.worker}` : ""}{a.error_code ? ` · ${a.error_code}` : ""}</span>
                {a.note && a.action !== "captured" && <span className="break-words">{a.note}</span>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
