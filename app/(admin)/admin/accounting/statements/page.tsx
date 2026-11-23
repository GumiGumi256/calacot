import Link from "next/link";
import { readStatements } from "@/lib/statements/reads";
import { comparisonModes, reportTypes } from "@/lib/accounting/statements";
import { AccountingNav } from "@/components/accounting/shared";
import { StatementReport } from "@/components/statements/report";
import { StatementStatus, StatementsNav } from "@/components/statements/shared";
import { CreateStatementSet, PrintButton } from "@/components/statements/forms";
import { AttentionStrip, type AttentionEntry } from "@/components/layout/attention-strip";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Props) {
  const d = await readStatements(await searchParams);
  const q = d.query;
  const provisional = Boolean(d.current?.provisional) || (q.report === "balance" && d.current?.balanced === false) || (q.report === "cashflow" && d.current?.reconciles === false);
  const exportQs = new URLSearchParams({ report: q.report, from: q.from, to: q.to, compare: q.compare, ...(q.division ? { division: q.division } : {}) }).toString();
  const items: AttentionEntry[] = [
    { key: "cls", label: "no approved statement classification: every statement is provisional", count: d.classificationVersion ? 0 : 1, href: "/admin/accounting/statements/classification", tone: "warning" as const },
    { key: "prop", label: "classification proposal awaiting approval", count: d.proposalVersion ? 1 : 0, href: "/admin/accounting/statements/classification", tone: "warning" as const },
    { key: "drafts", label: "statement sets awaiting approval", count: d.sets.filter((s) => s.status === "draft" && !s.stale).length, tone: "warning" as const },
  ].filter((i) => i.count > 0);
  return (
    <PageContainer>
      <PageHeader title="Financial statements" description="Income statement, balance sheet, cash flow, changes in equity and trial balance, computed only from posted journal lines in the functional currency."
        primaryAction={d.can.adjust ? <CreateStatementSet from={q.from} to={q.to} comparative={q.comparative} /> : undefined}
        secondaryActions={<div className="flex flex-wrap gap-2 print:hidden"><PrintButton /><Button variant="outline" size="sm" render={<a href={`/api/accounting/statements?${exportQs}`} />}>Download CSV</Button></div>} />
      <div className="print:hidden"><AccountingNav current="/admin/accounting/statements" /></div>
      <StatementsNav current="/admin/accounting/statements" />
      {!d.policyReady && <p role="alert" className="text-sm text-warning">No approved accounting policy exists, so there is no functional currency or ledger to report from.</p>}
      <div className="print:hidden"><AttentionStrip items={items} /></div>

      <Card className="print:hidden">
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end" aria-label="Statement options">
            <label className="flex flex-col gap-1 text-sm lg:col-span-2">Report
              <NativeSelect wrapperClassName="w-full" name="report" defaultValue={q.report}>{Object.entries(reportTypes).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm">From<Input type="date" name="from" defaultValue={q.from} /></label>
            <label className="flex flex-col gap-1 text-sm">To<Input type="date" name="to" defaultValue={q.to} /></label>
            <label className="flex flex-col gap-1 text-sm">Compare with
              <NativeSelect wrapperClassName="w-full" name="compare" defaultValue={q.compare}>{Object.entries(comparisonModes).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm">Division (income statement)
              <NativeSelect wrapperClassName="w-full" name="division" defaultValue={q.division}><option value="">All divisions</option>{["estates", "architecture", "painting", "interiors", "tech"].map((x) => <option key={x} value={x}>{x}</option>)}</NativeSelect>
            </label>
            <Button type="submit" className="self-end lg:col-span-6 lg:justify-self-start">Show</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{reportTypes[q.report]}{q.report === "balance" ? ` as at ${q.to}` : ` ${q.from} to ${q.to}`}</CardTitle>
          <CardDescription>Amounts in {d.currency}. Select an account to see its ledger lines and journals.</CardDescription>
          <StatementStatus approved={false} provisional={provisional} generatedAt={formatDateTime(new Date())} openPeriods={d.openPeriods} />
        </CardHeader>
        <CardContent><StatementReport report={q.report} current={d.current} comparative={d.comparative} range={{ from: q.from, to: q.to }} compareRange={q.comparative} /></CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader><CardTitle as="h2">Statement sets</CardTitle><CardDescription>Snapshots prepared by the database and approved by a different person. An approved set never changes; a set whose ledger has since moved is marked stale.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.sets.length === 0 ? <p className="text-sm text-muted-foreground">No statement sets have been prepared.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Prepared</TableHead><TableHead>Approved by</TableHead></TableRow></TableHeader>
              <TableBody>{d.sets.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><Link className="font-medium underline-offset-4 hover:underline" href={`/admin/accounting/statements/${s.id}`}>{s.period_start} – {s.period_end}</Link></TableCell>
                  <TableCell className="capitalize">{s.kind}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1"><StatusBadge domain="statementSet" status={s.status} />{s.provisional && <span className="text-xs text-warning">Provisional</span>}{s.stale && s.status !== "superseded" && <span className="text-xs text-warning">Ledger changed since</span>}</div></TableCell>
                  <TableCell className="text-sm">{s.prepared_by}<span className="block text-xs text-muted-foreground">{formatDateTime(s.prepared_at)}</span></TableCell>
                  <TableCell className="text-sm">{s.decided_by ?? "—"}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
