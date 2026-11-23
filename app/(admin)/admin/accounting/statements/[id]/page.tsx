import { readStatementSet } from "@/lib/statements/reads";
import { decideStatementSet } from "@/lib/statements/actions";
import { AccountingNav } from "@/components/accounting/shared";
import { StatementReport } from "@/components/statements/report";
import { FsHistory, StatementStatus, StatementsNav } from "@/components/statements/shared";
import { PrintButton } from "@/components/statements/forms";
import { DecisionForm } from "@/components/tax/controls";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { ReportType } from "@/lib/accounting/statements";

const sections: { report: ReportType; title: string; key: string }[] = [
  { report: "income", title: "Income statement", key: "incomeStatement" },
  { report: "balance", title: "Balance sheet", key: "balanceSheet" },
  { report: "cashflow", title: "Cash flow statement", key: "cashFlow" },
  { report: "equity", title: "Statement of changes in equity", key: "equity" },
];

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await readStatementSet(id);
  const s = d.set;
  const p = s.payload;
  const range = { from: s.period_start, to: s.period_end };
  const compareRange = s.comparative_start && s.comparative_end ? { from: s.comparative_start, to: s.comparative_end } : null;
  const approved = s.status === "approved";
  const canDecide = d.can.approve && s.status === "draft" && s.prepared_by_id !== d.me;
  return (
    <PageContainer>
      <PageHeader title={`Statements ${s.period_start} to ${s.period_end}`} description={`${s.kind === "year" ? "Annual" : s.kind === "month" ? "Monthly" : s.kind === "quarter" ? "Quarterly" : "Custom"} statement set prepared by ${s.prepared_by} on ${formatDateTime(s.prepared_at)}.`}
        meta={<StatusBadge domain="statementSet" status={s.status} />}
        secondaryActions={<div className="flex flex-wrap gap-2 print:hidden"><PrintButton /><Button variant="outline" size="sm" render={<a href={`/api/accounting/statements?set=${s.id}`} />}>Download CSV</Button></div>} />
      <div className="print:hidden"><AccountingNav current="/admin/accounting/statements" /></div>
      <StatementsNav current="/admin/accounting/statements" />
      <StatementStatus approved={approved} provisional={s.provisional} generatedAt={formatDateTime(s.prepared_at)} openPeriods={p.openPeriods} />
      {s.stale && s.status !== "superseded" && (
        <Card variant="attention" tone="warning">
          <CardHeader><CardTitle as="h2">The ledger has changed since this set was prepared</CardTitle>
            <CardDescription>{approved ? "These approved figures remain as approved, but the ledger now differs. Prepare and approve a new set if the change belongs in this period." : "This draft can no longer be approved. Prepare a new set."}</CardDescription></CardHeader>
        </Card>
      )}
      {p.problems?.length > 0 && (
        <Card variant="attention" tone="destructive">
          <CardHeader><CardTitle as="h2">Cannot be approved</CardTitle><CardDescription>{(p.problems as string[]).map((x) => x.replaceAll("_", " ")).join("; ")}.</CardDescription></CardHeader>
        </Card>
      )}
      {canDecide && !s.stale && !s.provisional && (
        <Card className="print:hidden">
          <CardHeader><CardTitle as="h2">Review</CardTitle><CardDescription>Approval makes this snapshot permanent. Check it against the trial balance, reconciliations and close evidence first.</CardDescription></CardHeader>
          <CardContent><DecisionForm action={decideStatementSet} hidden={{ id: s.id }} label="Statement set decision" decisions={[{ value: "approve", label: "Approve statements", primary: true }, { value: "reject", label: "Reject" }]} /></CardContent>
        </Card>
      )}
      {s.status === "draft" && s.prepared_by_id === d.me && <p className="text-sm text-muted-foreground print:hidden">You prepared this set, so a different person must approve it.</p>}
      {sections.map((x) => (
        <Card key={x.key} className="break-inside-avoid">
          <CardHeader><CardTitle as="h2">{x.title}</CardTitle><CardDescription>Amounts in {p.functionalCurrency}.</CardDescription></CardHeader>
          <CardContent><StatementReport report={x.report} current={p[x.key]} comparative={p.comparative?.[x.key] ?? null} range={range} compareRange={compareRange} drill={false} /></CardContent>
        </Card>
      ))}
      <Card className="break-inside-avoid">
        <CardHeader><CardTitle as="h2">Trial balance</CardTitle></CardHeader>
        <CardContent><StatementReport report="trial" current={p.trialBalance} range={range} drill={false} /></CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Snapshot SHA-256 {s.payload_sha256}{s.classification_version ? ` · classification version ${s.classification_version}` : ""}{s.decided_by ? ` · ${s.status} by ${s.decided_by} on ${formatDateTime(s.decided_at ?? "")}` : ""}{s.decision_note ? ` · “${s.decision_note}”` : ""}</p>
      <div className="print:hidden"><FsHistory events={d.events} /></div>
    </PageContainer>
  );
}
