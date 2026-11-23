import Link from "next/link";
import { readGeneralLedger } from "@/lib/statements/reads";
import { AccountingNav, Amount } from "@/components/accounting/shared";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ledgerAmount } from "@/lib/accounting/format";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Props) {
  const d = await readGeneralLedger(await searchParams);
  const pages = Math.max(1, Math.ceil(d.totals.n / d.size));
  const qs = (page: number) => new URLSearchParams({ from: d.from, to: d.to, ...(d.account ? { account: d.account } : {}), page: String(page) }).toString();
  const selected = d.accounts.find((a) => a.id === d.account);
  return (
    <PageContainer>
      <PageHeader title="General ledger" description="Every posted journal line in date order. Drafts and journals awaiting approval are never shown here. Select a journal number to open it." />
      <AccountingNav current="/admin/accounting/ledger" />
      <Card>
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end" aria-label="Ledger filters">
            <label className="flex flex-col gap-1 text-sm lg:col-span-2">Account
              <NativeSelect wrapperClassName="w-full" name="account" defaultValue={d.account}><option value="">All accounts</option>{d.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm">From<Input type="date" name="from" defaultValue={d.from} /></label>
            <label className="flex flex-col gap-1 text-sm">To<Input type="date" name="to" defaultValue={d.to} /></label>
            <Button type="submit" className="lg:col-span-4 lg:justify-self-start">Show</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{selected ? `${selected.code} ${selected.name}` : "All accounts"} · {d.from} to {d.to}</CardTitle>
          <CardDescription>{d.totals.n} posted lines · debits {ledgerAmount(d.totals.debit)} · credits {ledgerAmount(d.totals.credit)} ({d.currency}){selected && d.openingBalance !== null ? ` · opening balance ${ledgerAmount(d.openingBalance)} (debit positive)` : ""}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {d.lines.length === 0 ? <p className="text-sm text-muted-foreground">No posted lines in this range.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Journal</TableHead>{!selected && <TableHead>Account</TableHead>}<TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead>{selected && <TableHead className="text-right">Balance</TableHead>}</TableRow></TableHeader>
              <TableBody>
                {d.lines.map((l, i) => (
                  <TableRow key={`${l.journal_id}-${i}`}>
                    <TableCell className="whitespace-nowrap">{l.entry_date}</TableCell>
                    <TableCell><Link className="font-medium underline-offset-4 hover:underline" href={`/admin/accounting/journals/${l.journal_id}`}>{l.number}</Link></TableCell>
                    {!selected && <TableCell><Link className="underline-offset-4 hover:underline" href={`/admin/accounting/ledger?${new URLSearchParams({ account: l.account_id, from: d.from, to: d.to })}`}>{l.code} {l.name}</Link></TableCell>}
                    <TableCell className="min-w-48">{l.line_description ?? l.description}{(l.division || l.project) && <span className="block text-xs text-muted-foreground">{[l.division, l.project].filter(Boolean).join(" · ")}</span>}</TableCell>
                    <TableCell className="text-right"><Amount value={l.debit} /></TableCell>
                    <TableCell className="text-right"><Amount value={l.credit} /></TableCell>
                    {selected && <TableCell className="text-right tabular-nums">{ledgerAmount(l.running)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {pages > 1 && (
            <nav aria-label="Ledger pages" className="mt-3 flex items-center gap-2 text-sm">
              {d.page > 1 && <Button variant="outline" size="sm" render={<Link href={`/admin/accounting/ledger?${qs(d.page - 1)}`} />}>Previous</Button>}
              <span>Page {d.page} of {pages}</span>
              {d.page < pages && <Button variant="outline" size="sm" render={<Link href={`/admin/accounting/ledger?${qs(d.page + 1)}`} />}>Next</Button>}
            </nav>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
