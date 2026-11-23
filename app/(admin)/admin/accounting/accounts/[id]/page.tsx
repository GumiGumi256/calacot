import Link from "next/link";
import { randomUUID } from "node:crypto";
import { readAccount, type SearchParams } from "@/lib/accounting/reads";
import { accountTypeLabels, fromMinor, normalBalanceAmount, reportingClassLabels } from "@/lib/accounting/engine";
import { ledgerAmount } from "@/lib/accounting/format";
import { AccountCommand, AccountForm } from "@/components/accounting/admin-forms";
import { Amount, History } from "@/components/accounting/shared";
import { FilterBar, Pager } from "@/components/admin/list-controls";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

const m = (v: string) => BigInt(v.replace(".", ""));

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const d = await readAccount(id, await searchParams);
  const a = d.account;
  const normal = a.normal_balance as "debit" | "credit";
  const opening = d.opening.map((o) => ({ currency: o.currency, amount: normalBalanceAmount(normal, m(o.debit), m(o.credit)) }));
  const periodNet = normalBalanceAmount(normal, m(d.totals.debit), m(d.totals.credit));
  const canEdit = d.can.manage && a.status !== "inactive";
  const ownProposal = d.me === a.created_by_id;
  return (
    <PageContainer>
      <PageHeader
        title={`${a.code} ${a.name}`}
        description={a.description ?? undefined}
        meta={<><StatusBadge domain="account" status={a.status} /><span className="text-sm text-muted-foreground">{accountTypeLabels[a.account_type as keyof typeof accountTypeLabels]} · normal {a.normal_balance} balance</span></>}
        secondaryActions={canEdit && <AccountForm requestKey={randomUUID()} parents={d.parents} account={a} />}
        primaryAction={
          a.status === "proposed" && d.can.approvePolicy && !ownProposal ? <AccountCommand accountId={id} version={a.version} requestKey={randomUUID()} command="activate" /> :
          a.status === "active" && d.can.manage ? <AccountCommand accountId={id} version={a.version} requestKey={randomUUID()} command="deactivate" /> :
          a.status === "inactive" && d.can.approvePolicy ? <AccountCommand accountId={id} version={a.version} requestKey={randomUUID()} command="reactivate" /> : undefined
        }
      />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle as="h2">Account activity</CardTitle>
              <CardDescription>Posted lines between the dates, with a running balance in the {a.normal_balance} direction.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FilterBar reset="?" values={{ from: d.from, to: d.to }} fields={[{ name: "from", label: "From", type: "date" }, { name: "to", label: "Through", type: "date" }]} />
              <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm tabular-nums">
                <div><dt className="inline text-muted-foreground">Opening balance: </dt><dd className="inline">{opening.length ? opening.map((o) => `${ledgerAmount(fromMinor(o.amount))} ${o.currency}`).join(", ") : "0.00"}</dd></div>
                <div><dt className="inline text-muted-foreground">Debits: </dt><dd className="inline">{ledgerAmount(d.totals.debit)}</dd></div>
                <div><dt className="inline text-muted-foreground">Credits: </dt><dd className="inline">{ledgerAmount(d.totals.credit)}</dd></div>
                <div><dt className="inline text-muted-foreground">Net movement: </dt><dd className="inline">{ledgerAmount(fromMinor(periodNet))}</dd></div>
              </dl>
              {d.activity.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No posted activity in these dates.</p> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Journal</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Running balance</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {d.activity.map((l, i) => (
                        <TableRow key={`${l.journal_id}-${i}`}>
                          <TableCell className="whitespace-nowrap">{formatDate(l.entry_date)}</TableCell>
                          <TableCell className="whitespace-nowrap"><Link href={`/admin/accounting/journals/${l.journal_id}`} className="font-medium underline-offset-4 hover:underline">{l.number}</Link>{l.journal_type === "reversal" && <div className="text-xs text-muted-foreground">Reversal</div>}</TableCell>
                          <TableCell className="max-w-80 whitespace-normal"><span className="line-clamp-2 wrap-break-word">{l.line_description ?? l.description}</span>{(l.division || l.project) && <div className="text-xs capitalize text-muted-foreground">{[l.division, l.project].filter(Boolean).join(" · ")}</div>}</TableCell>
                          <TableCell className="text-right"><Amount value={l.functional_debit} /></TableCell>
                          <TableCell className="text-right"><Amount value={l.functional_credit} /></TableCell>
                          <TableCell className="text-right tabular-nums">{ledgerAmount(l.running)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="mt-2 text-xs text-muted-foreground">The running balance starts from zero at the first line in the selected dates; add the opening balance for the full balance.</p>
                </div>
              )}
              <Pager path="" params={{ from: d.from, to: d.to }} page={d.page} size={d.size} total={d.totals.n} />
            </CardContent>
          </Card>
          <History events={d.events} />
        </div>
        <Card>
          <CardHeader><CardTitle as="h2">Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Classification</dt><dd>{a.reporting_class ? reportingClassLabels[a.reporting_class] : "Header (none)"}</dd>
              <dt className="text-muted-foreground">Parent</dt><dd>{a.parent_id ? <Link className="underline-offset-4 hover:underline" href={`/admin/accounting/accounts/${a.parent_id}`}>{a.parent_code} {a.parent_name}</Link> : "Top level"}</dd>
              <dt className="text-muted-foreground">Receives entries</dt><dd>{a.is_postable ? "Yes" : "No (header)"}</dd>
              <dt className="text-muted-foreground">Manual journals</dt><dd>{a.manual_posting_allowed ? "Allowed" : "Not allowed (control account)"}</dd>
              <dt className="text-muted-foreground">Currency</dt><dd>{a.currency ? `${a.currency} only` : "Any"}</dd>
              <dt className="text-muted-foreground">Contra account</dt><dd>{a.is_contra ? "Yes" : "No"}</dd>
              <dt className="text-muted-foreground">Proposed by</dt><dd>{a.created_by}</dd>
              <dt className="text-muted-foreground">Approved by</dt><dd>{a.activated_by ? `${a.activated_by}, ${formatDate(a.activated_at)}` : "Not approved"}</dd>
              {a.status === "inactive" && <><dt className="text-muted-foreground">Deactivated</dt><dd className="break-words">{a.deactivation_reason}</dd></>}
            </dl>
            {a.status === "proposed" && ownProposal && <p className="mt-4 text-sm text-muted-foreground">You proposed this account, so someone else must approve it.</p>}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
