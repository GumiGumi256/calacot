import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { readComputation } from "@/lib/tax/reads";
import { computationCommand, decideTaxJournal, importSchedules, prepareProvision } from "@/lib/tax/actions";
import { adjustmentLabels, computationKindLabels, creditLabels, problemLabels } from "@/lib/tax/catalog";
import { AccountingNav } from "@/components/accounting/shared";
import { TaxAmount, TaxNav } from "@/components/tax/shared";
import { CommandButton, DecisionForm } from "@/components/tax/controls";
import { ScheduleEditor } from "@/components/tax/forms";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await readComputation(id);
  const { c } = d;
  const f = d.figures as Record<string, string | string[] | boolean | number>;
  const problems = (f.problems as string[]) ?? [];
  const isPreparer = d.me === c.prepared_by_id, isSubmitter = d.me === c.submitted_by_id;
  const row = (label: string, value: unknown, strong = false, note?: string) => (
    <div className="flex items-baseline justify-between gap-4 py-1.5"><dt className={strong ? "font-medium" : undefined}>{label}{note && <span className="block text-xs text-muted-foreground">{note}</span>}</dt><dd className={strong ? "font-medium" : undefined}><TaxAmount value={value} /></dd></div>
  );
  return (
    <PageContainer>
      <PageHeader title={`Income tax ${c.fiscal_year}: ${computationKindLabels[c.kind]}`} description={<>{formatDate(c.period_start)} – {formatDate(c.period_end)} · rule {c.rule} · prepared by {c.prepared_by}{c.approved_by ? ` · approved by ${c.approved_by}` : ""}</>}
        meta={<StatusBadge domain="taxComputation" status={c.status} />} />
      <AccountingNav current="/admin/accounting/tax" />
      <TaxNav current="/admin/accounting/tax/income" />
      <Card variant={problems.length ? "attention" : "default"} tone="warning">
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">{problems.length ? <CircleAlertIcon aria-hidden className="size-5 text-warning" /> : <CheckCircle2Icon aria-hidden className="size-5 text-success" />}{c.status === "approved" ? "Approved" : problems.length ? "Not ready" : "Ready for review"}</CardTitle>
          <CardDescription>{c.status === "draft" ? "Figures are live from the posted ledger until submission, when accounting profit is fixed." : c.status === "submitted" ? "A different person must approve or return it. If posted entries change, approval is refused." : "Approved figures are fixed. Posting the tax charge needs a provision journal approved by a second person."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {problems.length > 0 && <ul className="flex flex-col gap-1 text-sm">{problems.map((p) => <li key={p}>{problemLabels[p] ?? p}</li>)}</ul>}
          {c.review_note && <p className="text-sm">Review note: {c.review_note}</p>}
          <div className="flex flex-wrap gap-3">
            {c.status === "draft" && isPreparer && d.can.compute && (
              <>
                <ScheduleEditor id={c.id} version={c.version} documents={d.documents} provisional={c.kind === "provisional"} estimatedProfit={c.estimated_profit} lossBroughtForward={c.loss_brought_forward}
                  adjustments={d.adjustments.filter((a) => a.source === "manual").map((a) => ({ kind: a.kind, description: a.description, amount: a.amount, evidenceDocumentId: a.evidence_document_id ?? "" }))}
                  credits={d.credits.map((x) => ({ kind: x.kind, certificateReference: x.certificate_reference, counterparty: x.counterparty ?? "", amount: x.amount, evidenceDocumentId: x.evidence_document_id }))} />
                {c.kind !== "provisional" && <CommandButton action={importSchedules} hidden={{ id: c.id }} label="Import depreciation and capital allowance schedules" />}
                <DecisionForm action={computationCommand} hidden={{ id: c.id, version: c.version }} decisions={[{ value: "submit", label: "Submit for review", primary: true, name: "command" }]} label="Submit computation" notePlaceholder="Note (optional)" />
              </>
            )}
            {c.status === "submitted" && d.can.approve && !isPreparer && !isSubmitter && (
              <DecisionForm action={computationCommand} hidden={{ id: c.id, version: c.version }} label="Review computation"
                decisions={[{ value: "approve", label: "Approve", primary: true, name: "command" }, { value: "return", label: "Return", name: "command" }, { value: "reject", label: "Reject", name: "command" }]} />
            )}
            {c.status === "submitted" && (isPreparer || isSubmitter) && <p className="text-sm text-muted-foreground">You prepared or submitted this, so someone else must review it.</p>}
            {c.status === "approved" && c.kind !== "provisional" && d.can.compute && <CommandButton action={prepareProvision} hidden={{ id: c.id, entryDate: "" }} label="Prepare provision journal" variant="default" />}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle as="h2">From accounting profit to chargeable income</CardTitle><CardDescription>{f.profitBasis === "estimate" ? "Provisional: based on the entered estimate." : "Accounting profit before tax from posted journals in the year."}</CardDescription></CardHeader>
          <CardContent><dl className="divide-y text-sm">
            {row("Accounting profit before tax", f.accountingProfit, true)}
            {row("+ Increases (non-deductible, add-backs)", f.increases)}
            {row("− Decreases (deductions, exempt income, capital allowances)", f.decreases)}
            {row("= Adjusted profit", f.adjustedProfit, true)}
            {row("− Losses brought forward used", f.lossUsed, false, `Available ${f.lossBroughtForward}; carried forward ${f.lossCarriedForward}`)}
            {row("= Chargeable income", f.chargeableIncome, true)}
          </dl></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle as="h2">Tax</CardTitle><CardDescription>Rate {String(f.rate)} from the approved rule in force at year end.</CardDescription></CardHeader>
          <CardContent><dl className="divide-y text-sm">
            {row("Tax charge", f.taxCharge, true)}
            {row("− Credits (withholding and other)", f.credits)}
            {row("− Instalments paid (posted)", f.instalmentsPaid, false, f.paymentsPending !== "0.00" ? `Plus ${f.paymentsPending} awaiting approval` : undefined)}
            {row("= Net payable (negative: overpaid)", f.netPayable, true)}
          </dl></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle as="h2">Adjustments</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.adjustments.length === 0 ? <p className="text-sm text-muted-foreground">No adjustments.</p> : (
            <Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>{d.adjustments.map((a) => <TableRow key={a.id}><TableCell>{adjustmentLabels[a.kind] ?? a.kind}</TableCell><TableCell>{a.description}</TableCell><TableCell className="text-sm">{a.source === "manual" ? "Entered" : a.source === "ledger_depreciation" ? "Ledger" : "Asset schedule"}</TableCell><TableCell className="text-right"><TaxAmount value={a.amount} /></TableCell></TableRow>)}</TableBody></Table>
          )}
          {d.allowances.length > 0 && (
            <Table className="mt-4"><TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Capital allowance rule</TableHead><TableHead className="text-right">Tax value before</TableHead><TableHead className="text-right">Allowance</TableHead></TableRow></TableHeader>
              <TableBody>{d.allowances.map((a) => <TableRow key={a.asset_number}><TableCell>{a.asset_number} {a.name}</TableCell><TableCell className="text-sm">{a.rule}</TableCell><TableCell className="text-right"><TaxAmount value={a.tax_value_before} /></TableCell><TableCell className="text-right"><TaxAmount value={a.amount} /></TableCell></TableRow>)}</TableBody></Table>
          )}
        </CardContent>
      </Card>
      {d.credits.length > 0 && (
        <Card>
          <CardHeader><CardTitle as="h2">Credits</CardTitle><CardDescription>Customer withholding credits are claimed here with their certificates. They are not yet recorded against customer balances in the ledger.</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Certificate</TableHead><TableHead>From</TableHead><TableHead>Evidence</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>{d.credits.map((x) => <TableRow key={x.id}><TableCell>{creditLabels[x.kind]}</TableCell><TableCell>{x.certificate_reference}</TableCell><TableCell>{x.counterparty}</TableCell><TableCell className="text-sm">{x.evidence}</TableCell><TableCell className="text-right"><TaxAmount value={x.amount} /></TableCell></TableRow>)}</TableBody></Table></CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle as="h2">Provision journals</CardTitle><CardDescription>The tax charge reaches the ledger only through these, approved and posted by a second person.</CardDescription></CardHeader>
        <CardContent className="flex flex-col divide-y">
          {d.journals.length === 0 ? <p className="text-sm text-muted-foreground">None prepared.</p> : d.journals.map((j) => (
            <div key={j.id} className="flex flex-col gap-2 py-3 first:pt-0 lg:flex-row lg:justify-between">
              <div className="text-sm"><p className="font-medium">{j.description}</p><p className="text-muted-foreground">{formatDate(j.entry_date)} · <TaxAmount value={j.amount} /> · {j.number ?? "unnumbered"} · {j.reversed ? "reversed" : j.status}</p></div>
              <div className="lg:w-80">
                {j.status === "submitted" && d.can.approve && j.prepared_by_id !== d.me && <DecisionForm action={decideTaxJournal} hidden={{ id: j.id }} label="Decide provision" decisions={[{ value: "approve", label: "Approve and post", primary: true }, { value: "reject", label: "Reject" }]} />}
                {j.status === "submitted" && j.prepared_by_id === d.me && <DecisionForm action={decideTaxJournal} hidden={{ id: j.id }} label="Cancel provision" decisions={[{ value: "cancel", label: "Cancel" }]} />}
                {j.status === "posted" && !j.reversed && d.can.approve && <DecisionForm action={decideTaxJournal} hidden={{ id: j.id }} label="Reverse provision" decisions={[{ value: "reverse", label: "Reverse" }]} notePlaceholder="Reason for reversing (required)" />}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">History</CardTitle><CardDescription>Every change is recorded and cannot be edited.</CardDescription></CardHeader>
        <CardContent><ol className="flex flex-col gap-3">{d.events.map((e) => <li key={e.id} className="border-l-2 border-border pl-3 text-sm"><div className="font-medium">{e.action.replaceAll("_", " ")}</div><div className="text-xs text-muted-foreground">{e.actor} · {formatDateTime(e.created_at)}</div>{e.note && <p className="mt-1 break-words">{e.note}</p>}</li>)}</ol></CardContent>
      </Card>
    </PageContainer>
  );
}
