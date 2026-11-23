import { readDepreciation } from "@/lib/assets/reads";
import { decideAssetJournal, prepareDepreciation } from "@/lib/assets/actions";
import { AccountingNav } from "@/components/accounting/shared";
import { AssetsNav, TaxAmount } from "@/components/tax/shared";
import { CommandButton, DecisionForm } from "@/components/tax/controls";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export default async function Page() {
  const d = await readDepreciation();
  const pending = d.runs.some((r) => r.status === "submitted");
  return (
    <PageContainer>
      <PageHeader title="Depreciation" description="Straight-line depreciation under each asset's approved category policy, one run per period, catching up any months not yet depreciated. Each run posts only after a different person approves it. Tax capital allowances are separate and never posted." />
      <AccountingNav current="/admin/accounting/assets" />
      <AssetsNav current="/admin/accounting/assets/depreciation" />
      <Card>
        <CardHeader><CardTitle as="h2">Periods</CardTitle><CardDescription>Previews are calculated now and write nothing.{pending ? " A run is awaiting approval, so no new run can be prepared." : ""}</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Assets</TableHead><TableHead className="text-right">Depreciation due</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {d.periods.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.name}<span className="block text-xs text-muted-foreground">{formatDate(p.start_date)} – {formatDate(p.end_date)}</span></TableCell>
                  <TableCell>{p.status}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.assets}</TableCell>
                  <TableCell className="text-right"><TaxAmount value={p.preview_total} /></TableCell>
                  <TableCell>{d.can.manage && p.status === "open" && p.preview_total !== "0" && p.preview_total !== "0.00" && !pending && <CommandButton action={prepareDepreciation} hidden={{ periodId: p.id }} label="Prepare run" />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Runs</CardTitle></CardHeader>
        <CardContent className="flex flex-col divide-y">
          {d.runs.length === 0 ? <p className="text-sm text-muted-foreground">No depreciation runs yet.</p> : d.runs.map((j) => (
            <div key={j.id} className="flex flex-col gap-2 py-3 first:pt-0 lg:flex-row lg:justify-between">
              <div className="text-sm"><p className="font-medium">{j.description}</p><p className="text-muted-foreground"><TaxAmount value={j.amount} /> · {j.number ?? "unnumbered"} · {j.reversed ? "reversed" : j.status} · prepared by {j.prepared_by}</p></div>
              <div className="lg:w-80">
                {j.status === "submitted" && d.can.approve && j.prepared_by_id !== d.me && <DecisionForm action={decideAssetJournal} hidden={{ id: j.id }} label="Decide depreciation run" decisions={[{ value: "approve", label: "Approve and post", primary: true }, { value: "reject", label: "Reject" }]} />}
                {j.status === "submitted" && j.prepared_by_id === d.me && <DecisionForm action={decideAssetJournal} hidden={{ id: j.id }} label="Cancel depreciation run" decisions={[{ value: "cancel", label: "Cancel" }]} />}
                {j.status === "posted" && !j.reversed && d.can.approve && <DecisionForm action={decideAssetJournal} hidden={{ id: j.id }} label="Reverse depreciation run" decisions={[{ value: "reverse", label: "Reverse" }]} notePlaceholder="Reason for reversing (required)" />}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
