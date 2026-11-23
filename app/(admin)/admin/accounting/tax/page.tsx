import Link from "next/link";
import { readTaxOverview } from "@/lib/tax/reads";
import { registrationLabels, taxTypeLabels } from "@/lib/tax/catalog";
import { AccountingNav } from "@/components/accounting/shared";
import { TaxAmount, TaxNav } from "@/components/tax/shared";
import { AttentionStrip, type AttentionEntry } from "@/components/layout/attention-strip";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export default async function Page() {
  const d = await readTaxOverview();
  const cit = d.obligations.find((o) => o.tax_type === "corporate_income_tax");
  const overdue = d.calendar.filter((c) => c.status === "overdue");
  const soon = d.calendar.filter((c) => c.status === "due_soon" || c.status === "upcoming").slice(0, 6);
  const items: AttentionEntry[] = [
    { key: "overdue", label: "deadlines past due without recorded evidence", count: overdue.length, href: "/admin/accounting/tax/obligations", tone: "destructive" as const },
    { key: "policy", label: "tax rules or obligations awaiting approval", count: (d.pending.rules ?? 0) + (d.pending.obligations ?? 0), href: "/admin/accounting/tax/settings", tone: "warning" as const },
    { key: "comp", label: "computations awaiting review", count: d.pending.computations ?? 0, href: "/admin/accounting/tax/income", tone: "warning" as const },
    { key: "journals", label: "tax journals awaiting approval", count: d.pending.journals ?? 0, href: "/admin/accounting/tax/payments", tone: "warning" as const },
  ].filter((i) => i.count > 0);
  return (
    <PageContainer>
      <PageHeader title="Tax management" description="Registrations, income-tax computations, filings, assessments and payments. Nothing here files a return with URA or makes a payment: it records reviewed evidence and posts approved journals." />
      <AccountingNav current="/admin/accounting/tax" />
      <TaxNav current="/admin/accounting/tax" />
      {!cit?.processing_enabled && (
        <Card variant="attention" tone="warning">
          <CardHeader><CardTitle as="h2">Income tax is not configured</CardTitle>
            <CardDescription>No approved, operational corporate income tax obligation exists, so no liability can be determined. This does not mean nothing is owed. Record the registration with its evidence, an approved tax rule and the tax accounts under Tax settings.</CardDescription></CardHeader>
          {d.can.managePolicy && <CardContent><Button render={<Link href="/admin/accounting/tax/settings" />}>Open tax settings</Button></CardContent>}
        </Card>
      )}
      <AttentionStrip items={items} />
      <Card>
        <CardHeader><CardTitle as="h2">Registrations</CardTitle><CardDescription>Approved obligation settings. VAT, withholding tax, PAYE and NSSF cannot be operational in this phase.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.obligations.length === 0 ? <p className="text-sm text-warning">No tax obligation has been recorded and approved. Calacot&apos;s registrations are therefore unknown to the system.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Obligation</TableHead><TableHead>Status</TableHead><TableHead>Processing</TableHead><TableHead>Effective</TableHead></TableRow></TableHeader>
              <TableBody>{d.obligations.map((o) => <TableRow key={o.id}><TableCell><span className="font-medium">{o.name}</span><span className="block text-xs text-muted-foreground">{taxTypeLabels[o.tax_type]} · version {o.version}</span></TableCell><TableCell>{registrationLabels[o.registration_status]}</TableCell><TableCell>{o.processing_enabled ? "Operational" : "Inactive"}</TableCell><TableCell>{formatDate(o.effective_from)}{o.effective_to ? ` – ${formatDate(o.effective_to)}` : ""}</TableCell></TableRow>)}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Income tax by year</CardTitle><CardDescription>Estimates, approved computations, URA assessments, the ledger provision and payments are kept apart. The liability follows the latest assessment, otherwise the approved final computation.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.positions.length === 0 ? <p className="text-sm text-muted-foreground">No operational income-tax obligation, or no accounting years yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Year</TableHead><TableHead className="text-right">Estimate</TableHead><TableHead className="text-right">Computed</TableHead><TableHead className="text-right">Assessed</TableHead><TableHead className="text-right">In ledger</TableHead><TableHead className="text-right">Credits</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead>Filed</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.positions.map((p) => {
                  const x = p as unknown as Record<string, unknown> & { filings: { kind: string }[] };
                  return (
                    <TableRow key={`${p.code}-${String(x.fiscalYear)}`}>
                      <TableCell className="font-medium">{String(x.fiscalYear)}</TableCell>
                      <TableCell className="text-right"><TaxAmount value={x.estimate} unknown="—" /></TableCell>
                      <TableCell className="text-right"><TaxAmount value={x.computedTax} unknown="Not computed" /></TableCell>
                      <TableCell className="text-right"><TaxAmount value={x.assessed} unknown="None recorded" /></TableCell>
                      <TableCell className="text-right"><TaxAmount value={x.provided} /></TableCell>
                      <TableCell className="text-right"><TaxAmount value={x.credits} /></TableCell>
                      <TableCell className="text-right"><TaxAmount value={x.paid} />{x.paymentsPending !== "0.00" && <span className="block text-xs text-warning">+ pending approval</span>}</TableCell>
                      <TableCell className="text-right">{x.overpaid && x.overpaid !== "0.00" ? <span>Overpaid <TaxAmount value={x.overpaid} /></span> : <TaxAmount value={x.outstanding} />}</TableCell>
                      <TableCell className="text-sm">{x.filings.length ? x.filings.map((f) => f.kind.replace("_", " ")).join(", ") : <span className="text-muted-foreground">Nothing recorded</span>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Next deadlines</CardTitle><CardDescription>From approved deadline rules and the approved accounting year.</CardDescription></CardHeader>
        <CardContent>
          {soon.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming deadlines are configured.</p> : (
            <ul className="flex flex-col gap-2 text-sm">{soon.map((c) => <li key={`${c.obligation}-${c.fiscalYear}-${c.event}`} className="flex flex-wrap justify-between gap-2"><span>{c.label} · {c.name} {c.fiscalYear}</span><span className="tabular-nums">{formatDate(c.due)}</span></li>)}</ul>
          )}
          <Button className="mt-4" size="sm" variant="outline" render={<Link href="/admin/accounting/tax/obligations" />}>Full compliance calendar</Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
