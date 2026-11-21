import Link from "next/link";
import { randomUUID } from "node:crypto";
import { readAccounts, type SearchParams } from "@/lib/accounting/reads";
import { accountTypeLabels, accountTypes, normalBalanceAmount, fromMinor } from "@/lib/accounting/engine";
import { ledgerAmount } from "@/lib/accounting/format";
import { AccountingNav } from "@/components/accounting/shared";
import { AccountForm, ChartControls } from "@/components/accounting/admin-forms";
import { FilterBar } from "@/components/admin/list-controls";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const toMinorSafe = (v: string) => BigInt(v.replace(".", ""));

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await readAccounts(await searchParams);
  const filtered = !!(d.filters.search || d.filters.type || d.filters.status);
  const balance = (a: (typeof d.rows)[number]) => normalBalanceAmount(a.normal_balance as "debit" | "credit", toMinorSafe(a.debit), toMinorSafe(a.credit));
  return (
    <PageContainer>
      <PageHeader
        title="Chart of accounts"
        description="Company-wide accounts classified by nature. Divisions and projects are recorded on journal lines as dimensions, not as separate accounts."
        primaryAction={d.can.manage && <AccountForm requestKey={randomUUID()} parents={d.parents} />}
      />
      <AccountingNav current="/admin/accounting/accounts" />
      {(d.can.manage || d.can.approvePolicy) && (d.totals.total === 0 || d.totals.proposed > 0 || d.can.manage) && (
        <Card variant={d.totals.proposed ? "attention" : "default"} tone="warning">
          <CardHeader>
            <CardTitle as="h2">{d.totals.total === 0 ? "No chart of accounts yet" : d.totals.proposed ? `${d.totals.proposed} account(s) awaiting approval` : "Chart maintenance"}</CardTitle>
            <CardDescription>
              The proposed Calacot chart is documented in docs/CALACOT_CHART_OF_ACCOUNTS.md. Loading it creates proposed accounts only; the accountant must approve them before any posting. Existing codes are never overwritten.
            </CardDescription>
          </CardHeader>
          <CardContent><ChartControls requestKey={randomUUID()} canLoad={d.can.manage} canApprove={d.can.approvePolicy} proposed={d.totals.proposed} total={d.totals.total} /></CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar
            reset="?"
            values={d.filters}
            fields={[
              { name: "search", label: "Search code or name", type: "search" },
              { name: "type", label: "Type", type: "select", options: accountTypes, labels: accountTypeLabels },
              { name: "status", label: "Status", type: "select", options: ["proposed", "active", "inactive"], labels: { proposed: "Proposed", active: "Active", inactive: "Inactive" } },
            ]}
          />
          {d.rows.length === 0 ? (
            <EmptyState kind={filtered ? "filtered-out" : "no-records"} title={filtered ? undefined : "No accounts"} description={filtered ? undefined : d.can.manage ? "Load the proposed Calacot chart or propose accounts one by one." : "Finance staff have not set up the chart of accounts yet."}
              action={filtered ? <Button variant="outline" render={<Link href="?" />}>Clear filters</Button> : undefined} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Account</TableHead><TableHead className="max-md:hidden">Type</TableHead><TableHead className="max-lg:hidden">Normal balance</TableHead><TableHead className="text-right">Posted balance</TableHead><TableHead>Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {d.rows.map((a) => {
                    const b = balance(a);
                    return (
                      <TableRow key={a.id} className={a.is_postable ? undefined : "bg-surface-subtle/50"}>
                        <TableCell className="min-w-64">
                          <div style={{ paddingInlineStart: `${Math.min(a.depth, 5) * 1.25}rem` }}>
                            <Link href={`/admin/accounting/accounts/${a.id}`} className={a.is_postable ? "underline-offset-4 hover:underline" : "font-semibold underline-offset-4 hover:underline"}>
                              <span className="tabular-nums">{a.code}</span> {a.name}
                            </Link>
                            <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                              {!a.is_postable && <span>Header</span>}
                              {a.is_contra && <span>Contra</span>}
                              {!a.manual_posting_allowed && <span>Control account</span>}
                              {a.currency && <span>{a.currency} only</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-md:hidden">{accountTypeLabels[a.account_type as keyof typeof accountTypeLabels]}</TableCell>
                        <TableCell className="capitalize max-lg:hidden">{a.normal_balance}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{a.is_postable ? (a.functional_currency ? `${ledgerAmount(fromMinor(b))} ${a.functional_currency}` : <span className="text-muted-foreground">—</span>) : ""}</TableCell>
                        <TableCell><StatusBadge domain="account" status={a.status} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Posted balance is shown in the account&apos;s normal direction from posted journals only; a negative figure means the account is on its opposite side.</p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
