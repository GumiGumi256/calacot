import Link from "next/link";
import { readTaxOverview } from "@/lib/tax/reads";
import { AccountingNav } from "@/components/accounting/shared";
import { TaxNav } from "@/components/tax/shared";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { ledgerAmount } from "@/lib/accounting/format";

const statusText = { done: "Evidence recorded", overdue: "Overdue: no evidence recorded", due_soon: "Due within a month", upcoming: "Upcoming" } as const;
const statusClass = { done: "text-success", overdue: "font-medium text-destructive", due_soon: "font-medium text-warning", upcoming: "text-muted-foreground" } as const;

export default async function Page() {
  const d = await readTaxOverview();
  return (
    <PageContainer>
      <PageHeader title="Tax obligations" description="The compliance calendar: provisional returns, instalments, final returns and payments, calculated from approved deadline rules and the approved accounting year. Nothing is filed or paid from here."
        primaryAction={d.can.recordPayments && <Button render={<Link href="/admin/accounting/tax/payments" />}>Record filing or payment</Button>} />
      <AccountingNav current="/admin/accounting/tax" />
      <TaxNav current="/admin/accounting/tax/obligations" />
      {!d.policy && <Card variant="attention" tone="warning"><CardContent className="text-sm">No accounting policy is approved, so the accounting year is unknown and no deadline can be calculated.</CardContent></Card>}
      <Card>
        <CardHeader><CardTitle as="h2">Calendar</CardTitle><CardDescription>An item is complete only when its evidence is recorded: a return needs a recorded filing; a payment never counts as a filing.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.calendar.length === 0 ? <EmptyState kind="no-records" compact title="No deadlines configured" description="Deadlines appear once a registered obligation with confirmed deadline rules is approved under Tax settings." /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Due</TableHead><TableHead>Obligation</TableHead><TableHead>What</TableHead><TableHead>Evidence needed</TableHead><TableHead className="text-right">Paid so far</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.calendar.map((c) => (
                  <TableRow key={`${c.obligation}-${c.fiscalYear}-${c.event}`}>
                    <TableCell className="whitespace-nowrap">{formatDate(c.due)}</TableCell>
                    <TableCell>{c.name} {c.fiscalYear}</TableCell>
                    <TableCell>{c.label}<span className="block text-xs text-muted-foreground">{[c.filing && "return", c.payment && "payment"].filter(Boolean).join(" and ")}</span></TableCell>
                    <TableCell className="text-sm">{c.evidence}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.payment ? ledgerAmount(c.paid) : "—"}</TableCell>
                    <TableCell className={statusClass[c.status]}>{statusText[c.status]}</TableCell>
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
