import Link from "next/link";
import { randomUUID } from "node:crypto";
import { readIntegrationWorkspace } from "@/lib/accounting/integration";
import type { SearchParams } from "@/lib/accounting/reads";
import { eventLabel, guidanceFor, integrationEvents, integrationEventStatuses, stageInfo, type IntegrationStage } from "@/lib/accounting/integration-catalog";
import { AccountingNav } from "@/components/accounting/shared";
import { Backfill, DecideStage, ProcessQueue, ProposeStage } from "@/components/accounting/integration-forms";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";
import { resolveStatus } from "@/lib/ui/status";
import { ledgerAmount } from "@/lib/accounting/format";

const statusOrder = ["blocked", "failed", "pending", "shadowed", "posted", "no_effect"] as const;

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await readIntegrationWorkspace(await searchParams);
  const stage = d.stage as IntegrationStage;
  const query = (patch: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ status: d.filters.status, type: d.filters.type, view: d.filters.attention ? "" : "all", ...patch }).filter(([, v]) => v));
    const s = p.toString();
    return s ? `?${s}` : "?";
  };
  return (
    <PageContainer>
      <PageHeader
        title="Accounting integration"
        description="Business events (invoices, payments, credit notes, refunds, expenses and disbursements) captured for the ledger, what happened to each, and what needs attention. Posted entries are never edited; corrections are reversals."
        primaryAction={d.can.operate && stage !== "disabled" && <ProcessQueue requestKey={randomUUID()} disabled={stage === "isolated_test" && !d.testDatabase} />}
      />
      <AccountingNav current="/admin/accounting/integration" />
      <nav aria-label="Integration sections" className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" render={<Link href="/admin/accounting/integration/mappings" />}>Event mappings</Button>
        <Button size="sm" variant="outline" render={<Link href="/admin/accounting/integration/reconciliation" />}>Reconciliation</Button>
      </nav>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card variant={stage === "disabled" ? "attention" : "default"} tone="warning">
          <CardHeader>
            <CardTitle as="h2" className="flex flex-wrap items-center gap-2">Rollout stage <StatusBadge domain="integrationStage" status={stage} /></CardTitle>
            <CardDescription>{stageInfo[stage].summary}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {d.current && <p className="text-muted-foreground">Version {d.current.version}, approved by {d.current.decided_by} on {formatDate(d.current.decided_at)}: {d.current.note}</p>}
            {!d.policy && <p>No accounting policy is approved, so events cannot be applied yet.</p>}
            {stage === "isolated_test" && !d.testDatabase && <p role="alert" className="text-destructive">This database is not marked as a test database, so nothing can be posted here.</p>}
            <p className="text-muted-foreground">Production activation is not available in this phase. It needs the accountant&apos;s sign-off and a reviewed database change.</p>
            <div className="flex flex-wrap gap-2">
              {d.can.propose && !d.proposal && <ProposeStage requestKey={randomUUID()} current={d.current} testDatabase={d.testDatabase} />}
              {d.can.operate && stage !== "disabled" && <Backfill requestKey={randomUUID()} />}
            </div>
          </CardContent>
        </Card>
        <Card variant={d.proposal ? "attention" : "default"} tone="warning">
          <CardHeader><CardTitle as="h2">Pending stage proposal</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {d.proposal ? (
              <>
                <p>Version {d.proposal.version}: <span className="font-medium">{stageInfo[d.proposal.stage as IntegrationStage]?.label ?? d.proposal.stage}</span>.</p>
                {Object.keys(d.proposal.control_accounts ?? {}).length > 0 && <p className="text-muted-foreground">Control accounts: {Object.entries(d.proposal.control_accounts).map(([k, v]) => `${k} ${v}`).join(", ")}</p>}
                <p className="text-muted-foreground">Proposed by {d.proposal.proposed_by}, {formatDateTime(d.proposal.proposed_at)}: {d.proposal.note}</p>
                {d.can.approve && d.proposal.proposed_by_id !== d.me ? <DecideStage id={d.proposal.id} requestKey={randomUUID()} label={`stage version ${d.proposal.version}`} />
                  : <p className="text-muted-foreground">{d.can.approve ? "You proposed this, so someone else must decide." : "Awaiting an authorized approver."}</p>}
              </>
            ) : <p className="text-muted-foreground">No proposal is waiting.</p>}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="queue-summary" className="flex flex-col gap-3">
        <h2 id="queue-summary" className="sr-only">Event summary</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statusOrder.map((s) => (
            <li key={s}>
              <Link href={query({ status: s, view: "" })} className="flex flex-col gap-1 rounded-lg border bg-card p-3 hover:bg-muted/50 focus-visible:outline-2" aria-current={d.filters.status === s ? "page" : undefined}>
                <span className="text-xs text-muted-foreground">{resolveStatus("integrationEvent", s).label}</span>
                <span className="text-2xl font-semibold tabular-nums">{d.counts[s] ?? 0}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {(d.blockedCodes.length > 0 || d.captureFailures.length > 0) && (
        <Card variant="attention" tone="warning">
          <CardHeader><CardTitle as="h2">Needs attention</CardTitle><CardDescription>Each blocked event explains what is missing and which authorized action resolves it. Nothing is discarded.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {d.blockedCodes.length > 0 && (
              <ul className="flex flex-col gap-3">
                {d.blockedCodes.map((c) => {
                  const g = guidanceFor(c.code);
                  return (
                    <li key={c.code ?? "none"} className="flex flex-col gap-1">
                      <span className="font-medium">{c.n} × {c.code}</span>
                      <span>{g.problem}</span>
                      <span className="text-muted-foreground">To resolve: {g.resolve}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {d.captureFailures.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="font-medium">{d.captureFailures.length} business records could not be captured</p>
                <p className="text-muted-foreground">The business transactions themselves succeeded. Capture historical records to recover them; they will then appear as events. Latest: {d.captureFailures.slice(0, 3).map((f) => `${eventLabel(f.event_type)} (${f.error_code}, ${formatDateTime(f.created_at)})`).join("; ")}.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{d.filters.status ? resolveStatus("integrationEvent", d.filters.status).label : d.filters.attention ? "Waiting and blocked events" : "All events"}</CardTitle>
          <CardDescription>Each event is one authoritative change to one business record, captured in the same transaction as the change.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-wrap items-end gap-3" action="">
            <label className="flex flex-col gap-1 text-sm">Status
              <NativeSelect name="status" defaultValue={d.filters.status}>
                <option value="">Waiting and blocked</option>
                {integrationEventStatuses.map((s) => <option key={s} value={s}>{resolveStatus("integrationEvent", s).label}</option>)}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm">Event
              <NativeSelect name="type" defaultValue={d.filters.type}>
                <option value="">Any event</option>
                {integrationEvents.map((e) => <option key={e.type} value={e.type}>{e.label}</option>)}
              </NativeSelect>
            </label>
            <Button type="submit" size="sm" variant="outline">Apply</Button>
            <Button size="sm" variant="ghost" render={<Link href="?view=all" />}>Show all events</Button>
          </form>
          {d.events.length === 0 ? (
            <EmptyState kind={d.filters.status || d.filters.type ? "filtered-out" : "no-records"} title={stage === "disabled" ? "Integration is disabled" : d.filters.attention ? "Nothing needs attention" : undefined}
              description={stage === "disabled" ? "No business events are captured until a stage is approved." : undefined} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead>Outcome</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="min-w-48">
                        <Link href={`/admin/accounting/integration/${e.id}`} className="font-medium underline-offset-4 hover:underline">{eventLabel(e.event_type)}</Link>
                        <div className="text-xs text-muted-foreground">{e.document ?? e.source_id.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(e.effective_date)}{e.posting_date && <div className="text-xs text-muted-foreground">posted {formatDate(e.posting_date)}</div>}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{e.currency} {ledgerAmount(e.amount)}</TableCell>
                      <TableCell><StatusBadge domain="integrationEvent" status={e.status} /></TableCell>
                      <TableCell className="max-w-80 text-xs">
                        {e.journal_number ? <Link href={`/admin/accounting/journals/${e.journal_id}`} className="underline-offset-4 hover:underline">{e.journal_number}</Link>
                          : e.last_error_code ? guidanceFor(e.last_error_code).problem : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <nav aria-label="Pages" className="flex gap-2">
            {d.page > 1 && <Button size="sm" variant="outline" render={<Link href={query({ page: String(d.page - 1) })} />}>Previous</Button>}
            {d.hasMore && <Button size="sm" variant="outline" render={<Link href={query({ page: String(d.page + 1) })} />}>Next</Button>}
          </nav>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
