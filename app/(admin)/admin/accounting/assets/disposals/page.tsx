import Link from "next/link";
import { readDisposals } from "@/lib/assets/reads";
import { decideAssetJournal } from "@/lib/assets/actions";
import { AccountingNav } from "@/components/accounting/shared";
import { AssetsNav, TaxAmount } from "@/components/tax/shared";
import { DecisionForm } from "@/components/tax/controls";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export default async function Page() {
  const d = await readDisposals();
  const pendingOther = d.links.filter((j) => j.status === "submitted");
  return (
    <PageContainer>
      <PageHeader title="Transfers & disposals" description="Disposals with their gain or loss, capitalizations and impairments awaiting approval, and custody transfers. Prepare a disposal, impairment or transfer from the asset's page." />
      <AccountingNav current="/admin/accounting/assets" />
      <AssetsNav current="/admin/accounting/assets/disposals" />
      {pendingOther.length > 0 && (
        <Card variant="attention" tone="warning">
          <CardHeader><CardTitle as="h2">Awaiting approval</CardTitle><CardDescription>Capitalizations and impairments prepared by someone else.</CardDescription></CardHeader>
          <CardContent className="flex flex-col divide-y">
            {pendingOther.map((j) => (
              <div key={j.id} className="flex flex-col gap-2 py-3 first:pt-0 lg:flex-row lg:justify-between">
                <div className="text-sm"><p className="font-medium">{j.description}</p><p className="text-muted-foreground"><TaxAmount value={j.amount} /> · {formatDate(j.entry_date)} · prepared by {j.prepared_by}</p></div>
                <div className="lg:w-80">
                  {d.can.approve && j.prepared_by_id !== d.me && <DecisionForm action={decideAssetJournal} hidden={{ id: j.id }} label="Decide asset journal" decisions={[{ value: "approve", label: "Approve and post", primary: true }, { value: "reject", label: "Reject" }]} />}
                  {j.prepared_by_id === d.me && <DecisionForm action={decideAssetJournal} hidden={{ id: j.id }} label="Cancel asset journal" decisions={[{ value: "cancel", label: "Cancel" }]} />}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle as="h2">Disposals</CardTitle><CardDescription>Depreciation to the disposal date, carrying amount and gain or loss are calculated by the system. A reversed disposal returns the asset to service.</CardDescription></CardHeader>
        <CardContent className="flex flex-col divide-y">
          {d.disposals.length === 0 ? <p className="text-sm text-muted-foreground">No disposals.</p> : d.disposals.map((x) => (
            <div key={x.id} className="flex flex-col gap-2 py-3 first:pt-0 lg:flex-row lg:justify-between">
              <div className="text-sm">
                <p className="font-medium">{x.asset_number} {x.name} · {x.kind.replaceAll("_", " ")} on {formatDate(x.disposal_date)}</p>
                <p className="text-muted-foreground">Proceeds <TaxAmount value={x.proceeds} currency={x.currency} /> · carrying amount <TaxAmount value={x.net_book_value} currency={x.currency} /> · {Number(x.gain_or_loss) >= 0 ? "gain" : "loss"} <TaxAmount value={x.gain_or_loss.replace("-", "")} currency={x.currency} /></p>
                <p className="text-xs">{x.number ?? "unnumbered"} · {x.reversed ? "reversed" : x.status}</p>
              </div>
              <div className="lg:w-80">
                {x.status === "submitted" && d.can.approve && x.prepared_by_id !== d.me && <DecisionForm action={decideAssetJournal} hidden={{ id: x.link_id }} label="Decide disposal" decisions={[{ value: "approve", label: "Approve and post", primary: true }, { value: "reject", label: "Reject" }]} />}
                {x.status === "submitted" && x.prepared_by_id === d.me && <DecisionForm action={decideAssetJournal} hidden={{ id: x.link_id }} label="Cancel disposal" decisions={[{ value: "cancel", label: "Cancel" }]} />}
                {x.status === "posted" && !x.reversed && d.can.approve && <DecisionForm action={decideAssetJournal} hidden={{ id: x.link_id }} label="Reverse disposal" decisions={[{ value: "reverse", label: "Reverse" }]} notePlaceholder="Reason for reversing (required)" />}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Transfers</CardTitle><CardDescription>Changes of custodian, location, division or project. No financial effect.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.transfers.length === 0 ? <p className="text-sm text-muted-foreground">No transfers.</p> : (
            <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Asset</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
              <TableBody>{d.transfers.map((t, i) => <TableRow key={i}><TableCell>{formatDate(t.transfer_date)}</TableCell><TableCell>{t.asset_number} {t.name}</TableCell><TableCell>{t.reason}</TableCell></TableRow>)}</TableBody></Table>
          )}
          <p className="mt-3 text-sm"><Link className="underline underline-offset-4" href="/admin/accounting/assets">Go to the register</Link> to transfer or dispose of an asset.</p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
