import Link from "next/link";
import { readAssetRegister } from "@/lib/assets/reads";
import { decideCategory } from "@/lib/assets/actions";
import { assetStates } from "@/lib/assets/states";
import { AccountingNav } from "@/components/accounting/shared";
import { AssetsNav, TaxAmount } from "@/components/tax/shared";
import { DecisionForm } from "@/components/tax/controls";
import { AssetForm, ProposeCategory } from "@/components/assets/forms";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveStatus } from "@/lib/ui/status";
import { formatDate } from "@/lib/format";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const d = await readAssetRegister(await searchParams);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <PageContainer>
      <PageHeader title="Fixed assets" description="Company-owned assets capitalized under approved category policies, and hired equipment recorded for custody. Carrying amounts come only from posted journals."
        primaryAction={d.can.manage && <AssetForm options={d} today={today} />} />
      <AccountingNav current="/admin/accounting/assets" />
      <AssetsNav current="/admin/accounting/assets" />
      <Card>
        <CardHeader>
          <CardTitle as="h2">Asset register</CardTitle>
          <form className="flex flex-wrap items-end gap-3 pt-2" action="">
            <label className="flex flex-col gap-1 text-sm">Search<Input name="search" defaultValue={d.filters.search} placeholder="Name, number or serial" /></label>
            <label className="flex flex-col gap-1 text-sm">Status<NativeSelect name="state" defaultValue={d.filters.state}><option value="">All</option>{assetStates.map((s) => <option key={s} value={s}>{resolveStatus("fixedAsset", s).label}</option>)}</NativeSelect></label>
            <Button type="submit" size="sm" variant="outline">Filter</Button>
          </form>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {d.rows.length === 0 ? <EmptyState kind={d.filters.state || d.filters.search ? "filtered-out" : "no-records"} compact title="No assets" description="Register owned assets and hired equipment." /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Category</TableHead><TableHead>Capitalized</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Accumulated</TableHead><TableHead className="text-right">Carrying amount</TableHead><TableHead>Custody</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="min-w-44"><Link className="font-medium hover:underline" href={`/admin/accounting/assets/${a.id}`}>{a.asset_number}</Link><span className="block">{a.name}</span>{a.serial_number && <span className="text-xs text-muted-foreground">SN {a.serial_number}</span>}</TableCell>
                    <TableCell className="text-sm">{a.category ?? "Hired"}</TableCell>
                    <TableCell className="whitespace-nowrap">{a.capitalization_date ? formatDate(a.capitalization_date) : "—"}</TableCell>
                    <TableCell className="text-right">{a.ownership === "owned" ? <TaxAmount value={a.cost} currency={a.currency} /> : "—"}</TableCell>
                    <TableCell className="text-right">{a.accumulated ? <TaxAmount value={a.accumulated} currency={a.currency} /> : "—"}</TableCell>
                    <TableCell className="text-right">{a.net_book_value ? <TaxAmount value={a.net_book_value} currency={a.currency} /> : "—"}</TableCell>
                    <TableCell className="text-sm">{[a.custodian, a.location, a.division].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell><StatusBadge domain="fixedAsset" status={a.state} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><CardTitle as="h2">Category policies</CardTitle><CardDescription>Useful lives, residual values and conventions are accounting policy entered from the accountant&apos;s decision. Nothing is assumed. A category can be used only after a second person approves it.</CardDescription></div>
            {d.can.manage && <ProposeCategory accounts={d.accounts} />}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {d.categories.length === 0 ? <p className="text-sm text-muted-foreground">No category policies yet. No asset can be capitalized until one is approved.</p> : d.categories.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 py-3 first:pt-0 lg:flex-row lg:justify-between">
              <div className="text-sm">
                <p className="flex flex-wrap items-center gap-2"><span className="font-medium">{c.code} {c.name} v{c.version}</span><StatusBadge domain="accountingProposal" status={c.status} /></p>
                <p className="text-muted-foreground">{c.useful_life_months} months · residual {c.residual_percent} of cost · {c.period_convention.replaceAll("_", " ")} · threshold {c.capitalization_threshold} · accounts {c.cost}/{c.accumulated}/{c.expense}{c.tax_allowance_rule_code ? ` · tax class ${c.tax_allowance_rule_code}` : ""}</p>
                <p className="text-xs text-muted-foreground">{c.policy_basis} · proposed by {c.proposed_by}{c.decided_by ? `; decided by ${c.decided_by}` : ""}</p>
              </div>
              <div className="lg:w-72 lg:shrink-0">
                {c.status === "proposed" && d.can.approve && (c.proposed_by_id === d.me ? <p className="text-sm text-muted-foreground">You proposed this, so someone else must decide.</p>
                  : <DecisionForm action={decideCategory} hidden={{ id: c.id }} label={`Decide ${c.code} v${c.version}`} decisions={[{ value: "approve", label: "Approve", primary: true }, { value: "reject", label: "Reject" }]} />)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
