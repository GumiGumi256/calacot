import Link from "next/link";
import { readIncomeTax } from "@/lib/tax/reads";
import { computationKindLabels } from "@/lib/tax/catalog";
import { AccountingNav } from "@/components/accounting/shared";
import { TaxAmount, TaxNav } from "@/components/tax/shared";
import { NewComputation } from "@/components/tax/forms";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function Page() {
  const d = await readIncomeTax();
  return (
    <PageContainer>
      <PageHeader title="Income tax" description="Computations turn accounting profit from the posted ledger into chargeable income through reviewed adjustments, under an approved tax rule. Approval by a second person comes before any provision is posted."
        primaryAction={d.can.compute && d.operational.length > 0 && <NewComputation obligations={d.operational} years={d.years} />} />
      <AccountingNav current="/admin/accounting/tax" />
      <TaxNav current="/admin/accounting/tax/income" />
      {d.operational.length === 0 && <Card variant="attention" tone="warning"><CardContent className="text-sm">No operational corporate income tax obligation is approved, so no computation can be started. See Tax settings.</CardContent></Card>}
      <Card>
        <CardHeader><CardTitle as="h2">Computations</CardTitle><CardDescription>Provisional estimates and final computations are separate; an amended computation supersedes the final one.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.rows.length === 0 ? <EmptyState kind="no-records" compact title="No computations" description="Start one for a financial year once income tax is operational." /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Year</TableHead><TableHead>Kind</TableHead><TableHead>Rule</TableHead><TableHead className="text-right">Chargeable income</TableHead><TableHead className="text-right">Tax charge</TableHead><TableHead>Status</TableHead><TableHead>People</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell><Link className="font-medium hover:underline" href={`/admin/accounting/tax/income/${c.id}`}>{c.fiscal_year}</Link></TableCell>
                    <TableCell>{computationKindLabels[c.kind]}</TableCell>
                    <TableCell className="text-sm">{c.rule}</TableCell>
                    <TableCell className="text-right"><TaxAmount value={c.figures?.chargeableIncome} unknown="Not approved" /></TableCell>
                    <TableCell className="text-right"><TaxAmount value={c.figures?.taxCharge} unknown="Not approved" /></TableCell>
                    <TableCell><StatusBadge domain="taxComputation" status={c.status} /></TableCell>
                    <TableCell className="text-sm">{c.prepared_by}{c.approved_by ? ` · approved by ${c.approved_by}` : ""}</TableCell>
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
