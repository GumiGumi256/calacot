import { readTaxPayments } from "@/lib/tax/reads";
import { decideTaxJournal } from "@/lib/tax/actions";
import { assessmentKindLabels, filingKindLabels, paymentKindLabels } from "@/lib/tax/catalog";
import { AccountingNav } from "@/components/accounting/shared";
import { TaxAmount, TaxNav } from "@/components/tax/shared";
import { DecisionForm } from "@/components/tax/controls";
import { RecordAssessment, RecordFiling, RecordPayment } from "@/components/tax/forms";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export default async function Page() {
  const d = await readTaxPayments();
  return (
    <PageContainer>
      <PageHeader title="Payments & filings" description="Evidence of what was actually paid, filed and assessed. Payments, filings and assessments are separate records: paying never counts as filing. Nothing is transferred or submitted from here."
        primaryAction={d.can.recordPayments && d.obligations.some((o) => o.processing_enabled) && <RecordPayment obligations={d.obligations} years={d.years} documents={d.documents} accounts={d.accounts} today={d.today} />}
        secondaryActions={d.can.recordPayments && <><RecordFiling obligations={d.obligations} years={d.years} documents={d.documents} computations={d.computations} today={d.today} /><RecordAssessment obligations={d.obligations} years={d.years} documents={d.documents} assessments={d.assessments} today={d.today} /></>} />
      <AccountingNav current="/admin/accounting/tax" />
      <TaxNav current="/admin/accounting/tax/payments" />
      <Card>
        <CardHeader><CardTitle as="h2">Payments</CardTitle><CardDescription>Each payment posts, after approval by a second person, against the tax liability (or prepaid tax for instalments) and the paying bank account. It then reconciles with the bank statement like any payment.</CardDescription></CardHeader>
        <CardContent className="flex flex-col divide-y">
          {d.payments.length === 0 ? <p className="text-sm text-muted-foreground">No tax payments recorded.</p> : d.payments.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 lg:flex-row lg:justify-between">
              <div className="text-sm">
                <p className="font-medium">{paymentKindLabels[p.kind]} · {p.obligation_code} {p.fiscal_year} · <TaxAmount value={p.amount} currency={p.currency} /></p>
                <p className="text-muted-foreground">PRN {p.prn} · paid {formatDate(p.paid_on)} from {p.account} · evidence: {p.evidence}</p>
                <p className="flex items-center gap-2"><StatusBadge domain="journal" status={p.status} />{p.number && <span className="text-xs">{p.number}</span>}{p.reversed && <span className="text-xs text-warning">Reversed</span>}</p>
              </div>
              <div className="lg:w-80">
                {p.status === "submitted" && d.can.approve && p.prepared_by_id !== d.me && <DecisionForm action={decideTaxJournal} hidden={{ id: p.link_id }} label="Decide payment" decisions={[{ value: "approve", label: "Approve and post", primary: true }, { value: "reject", label: "Reject" }]} />}
                {p.status === "submitted" && p.prepared_by_id === d.me && <DecisionForm action={decideTaxJournal} hidden={{ id: p.link_id }} label="Cancel payment" decisions={[{ value: "cancel", label: "Cancel" }]} />}
                {p.status === "posted" && !p.reversed && d.can.approve && <DecisionForm action={decideTaxJournal} hidden={{ id: p.link_id }} label="Reverse payment" decisions={[{ value: "reverse", label: "Reverse" }]} notePlaceholder="Reason for reversing (required)" />}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Filed returns</CardTitle><CardDescription>A return counts as filed only when it is recorded here with its acknowledgement.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.filings.length === 0 ? <p className="text-sm text-muted-foreground">No filings recorded.</p> : (
            <Table><TableHeader><TableRow><TableHead>Filed</TableHead><TableHead>Return</TableHead><TableHead>Reference</TableHead><TableHead>Acknowledgement</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
              <TableBody>{d.filings.map((f) => <TableRow key={f.id}><TableCell>{formatDate(f.filed_on)}</TableCell><TableCell>{filingKindLabels[f.kind]} · {f.obligation_code} {f.fiscal_year}</TableCell><TableCell>{f.filing_reference}</TableCell><TableCell>{f.acknowledgement_reference ?? <span className="text-warning">Not recorded</span>}</TableCell><TableCell className="text-sm">{f.evidence}</TableCell></TableRow>)}</TableBody></Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Assessments</CardTitle><CardDescription>Kept forever; corrections supersede earlier assessments.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.assessments.length === 0 ? <p className="text-sm text-muted-foreground">No assessments recorded.</p> : (
            <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>{d.assessments.map((a) => <TableRow key={a.id}><TableCell>{formatDate(a.assessed_on)}</TableCell><TableCell>{assessmentKindLabels[a.kind]} · {a.obligation_code} {a.fiscal_year}</TableCell><TableCell>{a.assessment_reference}</TableCell><TableCell className="text-right"><TaxAmount value={a.amount} /></TableCell><TableCell className="text-sm">{a.superseded ? "Superseded. " : ""}{a.supersedes ? `Supersedes ${a.supersedes}. ` : ""}{a.note}</TableCell></TableRow>)}</TableBody></Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
