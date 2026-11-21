import Link from "next/link";
import { readTrialBalance, type SearchParams } from "@/lib/accounting/reads";
import { accountTypeLabels } from "@/lib/accounting/engine";
import { ledgerAmount } from "@/lib/accounting/format";
import { AccountingNav, Amount } from "@/components/accounting/shared";
import { FilterBar } from "@/components/admin/list-controls";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { resolveStatus } from "@/lib/ui/status";

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await readTrialBalance(await searchParams);
  const withMovement = !!d.from;
  return (
    <PageContainer>
      <PageHeader
        title="Trial balance"
        description="Every account with posted activity, from posted journals only. Debit and credit totals must agree. This is a working report, not a financial statement."
      />
      <AccountingNav current="/admin/accounting/trial-balance" />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar reset="?" values={{ asOf: d.asOf, from: d.from ?? "" }} fields={[{ name: "asOf", label: "Balances as at", type: "date" }, { name: "from", label: "Show movement from (optional)", type: "date" }]} />
          {d.unposted.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Not included: {d.unposted.map((u) => `${u.count} ${resolveStatus("journal", u.status).label.toLowerCase()}`).join(", ")} journal(s) dated on or before {formatDate(d.asOf)}. <Link href="/admin/accounting/journals" className="underline underline-offset-4">Review journals</Link>
            </p>
          )}
        </CardContent>
      </Card>
      {d.rows.length === 0 ? (
        <EmptyState kind="no-records" title="Nothing posted" description={`No journals are posted on or before ${formatDate(d.asOf)}.`} />
      ) : d.totals.map((t) => (
        <Card key={t.currency} className="min-w-0">
          <CardHeader>
            <CardTitle as="h2">{t.currency} trial balance as at {formatDate(d.asOf)}</CardTitle>
            <CardDescription className={t.balanced ? undefined : "font-medium text-destructive"}>{t.balanced ? `Balanced across ${t.accounts} account(s).` : "Out of balance. Report this immediately: posted journals should never allow it."}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  {withMovement && <><TableHead className="text-right">Movement debit</TableHead><TableHead className="text-right">Movement credit</TableHead></>}
                  <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.rows.filter((r) => r.currency === t.currency).map((r) => (
                  <TableRow key={r.account_id}>
                    <TableCell className="min-w-56"><Link href={`/admin/accounting/accounts/${r.account_id}?to=${d.asOf}`} className="underline-offset-4 hover:underline"><span className="tabular-nums">{r.code}</span> {r.name}</Link><div className="text-xs text-muted-foreground">{accountTypeLabels[r.account_type as keyof typeof accountTypeLabels]}</div></TableCell>
                    {withMovement && <><TableCell className="text-right"><Amount value={r.period_debit} /></TableCell><TableCell className="text-right"><Amount value={r.period_credit} /></TableCell></>}
                    <TableCell className="text-right"><Amount value={r.closing_debit} /></TableCell>
                    <TableCell className="text-right"><Amount value={r.closing_credit} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-medium">Totals ({t.currency})</TableCell>
                  {withMovement && <><TableCell className="text-right font-medium tabular-nums">{ledgerAmount(t.period_debit)}</TableCell><TableCell className="text-right font-medium tabular-nums">{ledgerAmount(t.period_credit)}</TableCell></>}
                  <TableCell className="text-right font-medium tabular-nums">{ledgerAmount(t.closing_debit)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{ledgerAmount(t.closing_credit)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            {withMovement && <p className="mt-2 text-xs text-muted-foreground">Movement covers {formatDate(d.from)} to {formatDate(d.asOf)}. Debit and credit columns show each account&apos;s net balance at the end date.</p>}
          </CardContent>
        </Card>
      ))}
    </PageContainer>
  );
}
