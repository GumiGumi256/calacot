import Link from "next/link";
import { readReconciliationPage } from "@/lib/accounting/integration";
import type { SearchParams } from "@/lib/accounting/reads";
import { reconciliationChecks } from "@/lib/accounting/integration-catalog";
import { ledgerAmount } from "@/lib/accounting/format";
import { AccountingNav } from "@/components/accounting/shared";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await readReconciliationPage(await searchParams);
  const unexplained = d.rows.filter((r) => r.status === "unexplained").length;
  return (
    <PageContainer>
      <PageHeader
        title="Source-to-ledger reconciliation"
        description="Operational records compared with the ledger by currency, as at a date. Differences are shown, never balanced away. A difference is explained only when events that are captured but not yet posted account for all of it."
      />
      <AccountingNav current="/admin/accounting/integration" />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-wrap items-end gap-3" action="">
            <label className="flex flex-col gap-1 text-sm">As at<Input type="date" name="asOf" defaultValue={d.asOf} max={d.today} /></label>
            <label className="flex flex-col gap-1 text-sm">Compare with
              <NativeSelect name="mode" defaultValue={d.mode}>
                <option value="ledger">General ledger (posted entries)</option>
                <option value="shadow">Shadow preview</option>
              </NativeSelect>
            </label>
            <Button type="submit" size="sm" variant="outline">Reconcile</Button>
          </form>
          {d.periods.length > 0 && (
            <nav aria-label="Period ends" className="flex flex-wrap gap-2">
              {d.periods.slice(0, 6).map((p) => <Button key={p.end_date} size="sm" variant={d.asOf === p.end_date ? "default" : "ghost"} render={<Link href={`?asOf=${p.end_date}&mode=${d.mode}`} />}>{p.name}{p.status === "closed" ? " (closed)" : ""}</Button>)}
            </nav>
          )}
          {Object.keys(d.controls).length === 0 && <p className="text-sm text-muted-foreground">No control accounts are set in the approved integration stage, so only the traced checks (disbursements, refunds) are shown.</p>}
        </CardContent>
      </Card>
      <Card variant={unexplained ? "attention" : "default"} tone="destructive">
        <CardHeader>
          <CardTitle as="h2">As at {formatDate(d.asOf)}, {d.mode === "shadow" ? "shadow preview" : "general ledger"}</CardTitle>
          <CardDescription>{unexplained ? `${unexplained} unexplained difference${unexplained === 1 ? "" : "s"}. Check for records captured while integration was off (run historical capture), capture failures, or manual journals on control accounts.` : "Every difference is matched or explained by unposted events."}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {d.rows.length === 0 ? <EmptyState kind="no-records" title="Nothing to reconcile" description="No operational balances or ledger entries exist for this date." /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Check</TableHead><TableHead>Currency</TableHead><TableHead className="text-right">Operational</TableHead><TableHead className="text-right">Ledger</TableHead><TableHead className="text-right">Difference</TableHead><TableHead className="text-right">Unposted events</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.rows.map((r) => (
                  <TableRow key={`${r.check_key}-${r.currency}`}>
                    <TableCell className="min-w-56"><div className="font-medium">{reconciliationChecks[r.check_key]?.label ?? r.check_key}{r.account_code ? ` (${r.account_code})` : ""}</div><div className="text-xs text-muted-foreground">{reconciliationChecks[r.check_key]?.describe}</div></TableCell>
                    <TableCell>{r.currency}</TableCell>
                    <TableCell className="text-right tabular-nums">{ledgerAmount(r.operational)}</TableCell>
                    <TableCell className="text-right tabular-nums">{ledgerAmount(r.ledger)}</TableCell>
                    <TableCell className="text-right tabular-nums">{ledgerAmount(r.difference)}</TableCell>
                    <TableCell className="text-right tabular-nums">{ledgerAmount(r.unposted)}</TableCell>
                    <TableCell><StatusBadge domain="reconciliation" status={r.status} /></TableCell>
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
