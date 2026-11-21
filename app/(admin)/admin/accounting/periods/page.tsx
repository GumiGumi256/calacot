import { randomUUID } from "node:crypto";
import { readPeriods } from "@/lib/accounting/reads";
import { monthNames } from "@/lib/accounting/format";
import { AccountingNav } from "@/components/accounting/shared";
import { GenerateYear, PeriodCommand } from "@/components/accounting/admin-forms";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";

export default async function Page() {
  const d = await readPeriods();
  const policy = d.readiness.policy;
  const latestYear = d.periods.reduce((y, p) => Math.max(y, p.fiscal_year), 0);
  const defaultYear = latestYear ? latestYear + 1 : Number(d.readiness.today.slice(0, 4));
  return (
    <PageContainer>
      <PageHeader
        title="Accounting periods"
        description={policy ? `Monthly periods; the financial year starts in ${monthNames[policy.fiscal_year_start_month - 1]} (approved policy v${policy.version}). Nothing can be posted into a closed period.` : "Periods can be created once an accounting policy with the financial-year start has been approved."}
        primaryAction={d.can.manage && policy && <GenerateYear requestKey={randomUUID()} defaultYear={defaultYear} startMonth={policy.fiscal_year_start_month} />}
      />
      <AccountingNav current="/admin/accounting/periods" />
      <Card>
        <CardHeader>
          <CardTitle as="h2">Periods</CardTitle>
          <CardDescription>Closing is done by an authorized approver after the month is reviewed. Reopening needs a separate permission and a recorded reason; corrections to a closed month are made with a reversal in an open period.</CardDescription>
        </CardHeader>
        <CardContent>
          {d.periods.length === 0 ? (
            <EmptyState kind="no-records" title="No periods" description={policy ? "Create the first financial year to start posting." : "An accounting policy must be approved first."} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Dates</TableHead><TableHead className="text-right">Posted journals</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.periods.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(p.start_date)} – {formatDate(p.end_date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.posted}{p.pending > 0 && <div className="text-xs text-warning">{p.pending} awaiting</div>}</TableCell>
                      <TableCell>
                        <StatusBadge domain="period" status={p.status} />
                        {p.status === "closed" && p.closed_by && <div className="mt-1 text-xs text-muted-foreground">{p.closed_by}, {formatDateTime(p.closed_at)}</div>}
                        {p.status === "open" && p.reopened_by && <div className="mt-1 max-w-64 text-xs text-muted-foreground">Reopened by {p.reopened_by}: {p.reopen_reason}</div>}
                      </TableCell>
                      <TableCell>
                        {p.status === "open" && d.can.close && <PeriodCommand periodId={p.id} version={p.version} requestKey={randomUUID()} command="close" name={p.name} pending={p.pending} />}
                        {p.status === "closed" && d.can.reopen && <PeriodCommand periodId={p.id} version={p.version} requestKey={randomUUID()} command="reopen" name={p.name} pending={0} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
