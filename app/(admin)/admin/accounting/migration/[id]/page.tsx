import { CheckCircle2Icon, CircleAlertIcon, CircleDashedIcon } from "lucide-react";
import { readMigrationBatch } from "@/lib/migration/reads";
import { migrationBatchCommand } from "@/lib/migration/actions";
import { migrationRowKinds, migrationSourceSystems } from "@/lib/accounting/migration";
import { AccountingNav } from "@/components/accounting/shared";
import { LoadRows } from "@/components/migration/forms";
import { DecisionForm } from "@/components/tax/controls";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ledgerAmount } from "@/lib/accounting/format";
import { formatDateTime } from "@/lib/format";

const icon = { pass: CheckCircle2Icon, fail: CircleAlertIcon, not_applicable: CircleDashedIcon } as const;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await readMigrationBatch(id);
  const b = d.batch;
  const mine = b.prepared_by_id === d.me || b.submitted_by_id === d.me;
  return (
    <PageContainer>
      <PageHeader title={`Opening balances at ${b.cutoff_date}`} description={`${migrationSourceSystems[b.source_system as keyof typeof migrationSourceSystems] ?? b.source_system}: ${b.source_description}. Evidence: ${b.evidence_reference}.`}
        meta={<StatusBadge domain="migrationBatch" status={b.status} />} />
      <AccountingNav current="/admin/accounting/migration" />
      <Card variant="attention" tone="warning">
        <CardHeader><CardTitle as="h2">Staging only</CardTitle><CardDescription>Nothing on this page posts to the general ledger. Approval records that these figures are the agreed opening position; the opening journal is created later through a separately reviewed activation step.</CardDescription></CardHeader>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Reconciliation</CardTitle><CardDescription>{d.validation.ready ? "Every required check passes." : "Failed checks block submission. Differences are shown, never adjusted."}</CardDescription></CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {d.validation.checks.map((c) => {
              const Icon = icon[c.status as keyof typeof icon] ?? CircleDashedIcon;
              const detail = (c.detail ?? []).map((v) => (typeof v === "string" ? v : Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k} ${x}`).join(", "))).slice(0, 6);
              return (
                <li key={c.key} className="flex gap-3 text-sm">
                  <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${c.status === "pass" ? "text-success" : c.status === "fail" ? "text-destructive" : "text-muted-foreground"}`} />
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{c.label}</span><StatusBadge domain="closeCheck" status={c.status} /></div>
                    {c.status !== "pass" && detail.length > 0 && <p className="mt-1 wrap-break-word text-muted-foreground">{detail.join("; ")}</p>}</div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
      {b.status === "draft" && d.can.prepare && b.prepared_by_id === d.me && (
        <Card>
          <CardHeader><CardTitle as="h2">Load rows</CardTitle><CardDescription>Use the template. Keep each record&apos;s original identifier in source_ref so it can be traced back.</CardDescription></CardHeader>
          <CardContent><LoadRows batchId={b.id} version={b.version} /></CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle as="h2">Review</CardTitle><CardDescription>Prepared by {b.prepared_by} on {formatDateTime(b.prepared_at)}{b.decided_by ? ` · ${b.status} by ${b.decided_by}${b.decision_note ? `: ${b.decision_note}` : ""}` : ""}. The approver must differ from the preparer and the submitter.</CardDescription></CardHeader>
        <CardContent>
          {b.status === "draft" && d.can.prepare && <DecisionForm action={migrationBatchCommand} hidden={{ id: b.id, version: b.version }} label="Submit batch" notePlaceholder="Note (optional)" decisions={d.validation.ready ? [{ value: "submit", label: "Submit for approval", primary: true }] : []} />}
          {b.status === "submitted" && d.can.approve && !mine && <DecisionForm action={migrationBatchCommand} hidden={{ id: b.id, version: b.version }} label="Batch decision" decisions={[{ value: "approve", label: "Approve opening balances", primary: true }, { value: "reject", label: "Reject" }]} />}
          {b.status === "submitted" && b.prepared_by_id === d.me && <DecisionForm action={migrationBatchCommand} hidden={{ id: b.id, version: b.version }} label="Withdraw batch" decisions={[{ value: "withdraw", label: "Withdraw to draft" }]} />}
          {b.status === "submitted" && mine && <p className="mt-2 text-sm text-muted-foreground">A different person must approve this batch.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Staged rows</CardTitle><CardDescription>Trial balance amounts are signed (debit positive). Schedules show outstanding amounts.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.rows.length === 0 ? <p className="text-sm text-muted-foreground">No rows loaded.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Kind</TableHead><TableHead>Source reference</TableHead><TableHead>Account</TableHead><TableHead>Counterparty / document</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>{d.rows.map((r) => (
                <TableRow key={`${r.row_kind}-${r.source_ref}`}>
                  <TableCell className="text-sm">{migrationRowKinds[r.row_kind as keyof typeof migrationRowKinds]?.split(" (")[0] ?? r.row_kind}</TableCell>
                  <TableCell className="text-sm">{r.source_ref}{r.source_account && <span className="block text-xs text-muted-foreground">{r.source_account}</span>}</TableCell>
                  <TableCell className="text-sm">{r.code ? `${r.code} ${r.name}` : "—"}</TableCell>
                  <TableCell className="text-sm">{[r.counterparty, r.document_number].filter(Boolean).join(" · ") || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.currency} {ledgerAmount(r.amount)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">History</CardTitle></CardHeader>
        <CardContent>{d.events.length === 0 ? <p className="text-sm text-muted-foreground">No history.</p> : <ol className="flex flex-col gap-2 text-sm">{d.events.map((e) => <li key={e.id} className="border-l-2 border-border pl-3"><span className="font-medium">{e.action.replaceAll("_", " ")}</span> · {e.actor} · {formatDateTime(e.created_at)}{e.note ? ` · ${e.note}` : ""}</li>)}</ol>}</CardContent>
      </Card>
    </PageContainer>
  );
}
