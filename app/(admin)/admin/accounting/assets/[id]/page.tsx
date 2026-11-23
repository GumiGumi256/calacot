import { readAsset } from "@/lib/assets/reads";
import { capitalizeAsset, decideAssetJournal } from "@/lib/assets/actions";
import { AccountingNav } from "@/components/accounting/shared";
import { AssetsNav, TaxAmount } from "@/components/tax/shared";
import { CommandButton, DecisionForm } from "@/components/tax/controls";
import { DisposalForm, ImpairmentForm, TransferForm } from "@/components/assets/forms";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";

const purposeLabels: Record<string, string> = { asset_capitalization: "Capitalization", asset_impairment: "Impairment", asset_disposal: "Disposal" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await readAsset(id);
  const a = d.a;
  const today = new Date().toISOString().slice(0, 10);
  const inService = a.state === "in_service" || a.state === "fully_depreciated";
  const field = (label: string, value: React.ReactNode) => <div><dt className="text-muted-foreground">{label}</dt><dd>{value ?? "—"}</dd></div>;
  return (
    <PageContainer>
      <PageHeader title={`${a.asset_number} ${a.name}`} description={a.ownership === "hired" ? `Hired equipment${a.hire_reference ? ` · ${a.hire_reference}` : ""}${a.supplier ? ` from ${a.supplier}` : ""}` : `${a.category} · ${a.currency}`}
        meta={<StatusBadge domain="fixedAsset" status={a.state} />}
        primaryAction={d.can.manage && a.state === "draft" && <CommandButton action={capitalizeAsset} hidden={{ id: a.id }} label="Prepare capitalization" variant="default" />} />
      <AccountingNav current="/admin/accounting/assets" />
      <AssetsNav current="/admin/accounting/assets" />
      <Card>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            {field("Cost", a.ownership === "owned" ? <TaxAmount value={a.cost} currency={a.currency} /> : "Not capitalized")}
            {field("Accumulated depreciation and impairment", a.accumulated ? <TaxAmount value={a.accumulated} currency={a.currency} /> : "—")}
            {field("Carrying amount", a.net_book_value ? <TaxAmount value={a.net_book_value} currency={a.currency} /> : "—")}
            {field("Residual value", a.ownership === "owned" ? <TaxAmount value={a.residual_value} currency={a.currency} /> : "—")}
            {field("Useful life", a.useful_life_months ? `${a.useful_life_months} months` : "—")}
            {field("Acquired / capitalized", `${formatDate(a.acquisition_date)}${a.capitalization_date ? ` / ${formatDate(a.capitalization_date)}` : ""}`)}
            {field("Custodian", a.custodian)}
            {field("Location", a.location)}
            {field("Division / project", [a.division, a.project].filter(Boolean).join(" / ") || null)}
            {field("Serial number", a.serial_number)}
            {field("Supplier", a.supplier)}
          </dl>
          {d.can.manage && (
            <div className="mt-4 flex flex-wrap gap-2">
              {a.state !== "disposed" && <TransferForm id={a.id} options={d} today={today} />}
              {inService && <ImpairmentForm id={a.id} documents={d.documents} today={today} />}
              {inService && <DisposalForm id={a.id} documents={d.documents} banks={d.banks} accounts={d.accounts} today={today} />}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Journals</CardTitle><CardDescription>Capitalization, impairment and disposal post only after a different person approves them. Posted journals are reversed, never edited.</CardDescription></CardHeader>
        <CardContent className="flex flex-col divide-y">
          {d.links.length === 0 ? <p className="text-sm text-muted-foreground">No journals yet.</p> : d.links.map((j) => (
            <div key={j.id} className="flex flex-col gap-2 py-3 first:pt-0 lg:flex-row lg:justify-between">
              <div className="text-sm"><p className="font-medium">{purposeLabels[j.purpose]} · {formatDate(j.entry_date)}</p><p className="text-muted-foreground"><TaxAmount value={j.amount} currency={a.currency} /> · {j.number ?? "unnumbered"} · {j.reversed ? "reversed" : j.status} · prepared by {j.prepared_by}</p></div>
              <div className="lg:w-80">
                {j.status === "submitted" && d.can.approve && j.prepared_by_id !== d.me && <DecisionForm action={decideAssetJournal} hidden={{ id: j.id }} label="Decide asset journal" decisions={[{ value: "approve", label: "Approve and post", primary: true }, { value: "reject", label: "Reject" }]} />}
                {j.status === "submitted" && j.prepared_by_id === d.me && <DecisionForm action={decideAssetJournal} hidden={{ id: j.id }} label="Cancel asset journal" decisions={[{ value: "cancel", label: "Cancel" }]} />}
                {j.status === "posted" && !j.reversed && d.can.approve && <DecisionForm action={decideAssetJournal} hidden={{ id: j.id }} label="Reverse asset journal" decisions={[{ value: "reverse", label: "Reverse" }]} notePlaceholder="Reason for reversing (required)" />}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Depreciation</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.depreciation.length === 0 ? <p className="text-sm text-muted-foreground">No depreciation yet.</p> : (
            <Table><TableHeader><TableRow><TableHead>Period end</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Accumulated before</TableHead><TableHead>Journal</TableHead></TableRow></TableHeader>
              <TableBody>{d.depreciation.map((x, i) => <TableRow key={i}><TableCell>{formatDate(x.period_end)}</TableCell><TableCell className="text-right"><TaxAmount value={x.amount} currency={a.currency} /></TableCell><TableCell className="text-right"><TaxAmount value={x.accumulated_before} currency={a.currency} /></TableCell><TableCell>{x.number ?? x.status}{x.status === "posted" && !x.effective ? " (reversed)" : ""}</TableCell></TableRow>)}</TableBody></Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Transfers and history</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {d.transfers.map((t, i) => <p key={i}>{formatDate(t.transfer_date)}: {t.reason} <span className="text-muted-foreground">({t.recorded_by})</span></p>)}
          <ol className="flex flex-col gap-2">{d.events.map((e) => <li key={e.id} className="border-l-2 border-border pl-3"><span className="font-medium">{e.action}</span> <span className="text-xs text-muted-foreground">{e.actor} · {formatDateTime(e.created_at)}</span></li>)}</ol>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
