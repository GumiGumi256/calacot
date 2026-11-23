import Link from "next/link";
import { readClosing } from "@/lib/statements/reads";
import { decideFsPolicy, decideYearEnd, startClose } from "@/lib/statements/actions";
import { AccountingNav } from "@/components/accounting/shared";
import { PrepareYearEnd, ProposeClosePolicy, ReopenYearEnd } from "@/components/statements/forms";
import { CommandButton, DecisionForm } from "@/components/tax/controls";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ledgerAmount } from "@/lib/accounting/format";
import { formatDateTime } from "@/lib/format";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Props) {
  const d = await readClosing(await searchParams);
  const pol = d.policy;
  const live = d.yearEnds.find((y) => y.status === "prepared" || y.status === "closed");
  return (
    <PageContainer>
      <PageHeader title="Period closing" description="Month-end checklist, evidence, exceptions and a second approver for every close; year-end closing of income and expenses to retained earnings." />
      <AccountingNav current="/admin/accounting/closing" />

      <Card>
        <CardHeader>
          <CardTitle as="h2">Close policy</CardTitle>
          <CardDescription>{pol.current
            ? `Version ${pol.current.version} approved. Periods close and reopen only through this page. Required: ${[pol.current.require_bank_reconciliation && "finalized bank reconciliations", pol.current.require_cash_count && "cash counts", pol.current.evidence_items.length && `evidence (${pol.current.evidence_items.join(", ")})`].filter(Boolean).join("; ") || "standard checks only"}.`
            : "No close policy is approved. Until one is, the controlled close cannot start and periods can still be closed from Periods without a checklist."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {pol.proposal && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm"><StatusBadge domain="fsPolicy" status="proposed" />Version {pol.proposal.version} proposed by {pol.proposal.proposed_by}: {pol.proposal.note}</div>
              {d.can.closeApprove && pol.proposal.proposed_by_id !== d.me && <DecisionForm action={decideFsPolicy} hidden={{ id: pol.proposal.id, entity: "close_policy" }} label="Close policy decision" decisions={[{ value: "approve", label: "Approve policy", primary: true }, { value: "reject", label: "Reject" }]} />}
            </>
          )}
          {d.can.closeStart && !pol.proposal && <div><ProposeClosePolicy current={pol.current} /></div>}
        </CardContent>
      </Card>

      {d.years.length > 1 && (
        <nav aria-label="Financial years" className="flex flex-wrap gap-2">
          {d.years.map((y) => <Button key={y} size="sm" variant={y === d.fy ? "secondary" : "ghost"} render={<Link href={`/admin/accounting/closing?year=${y}`} aria-current={y === d.fy ? "page" : undefined} />}>FY{y}</Button>)}
        </nav>
      )}

      <Card>
        <CardHeader><CardTitle as="h2">{d.fy ? `Periods of FY${d.fy}` : "Periods"}</CardTitle><CardDescription>Close periods in order. A closed period accepts no postings; reopening requires authority and a recorded reason.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.periods.length === 0 ? <p className="text-sm text-muted-foreground">No accounting periods exist yet. Generate them under Periods.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Dates</TableHead><TableHead>Ledger</TableHead><TableHead>Close</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{d.periods.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><Link className="font-medium underline-offset-4 hover:underline" href={`/admin/accounting/closing/${p.id}`}>{p.name}</Link></TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{p.start_date} – {p.end_date}</TableCell>
                  <TableCell><StatusBadge domain="period" status={p.status} /></TableCell>
                  <TableCell>{p.close_status ? <StatusBadge domain="periodClose" status={p.close_status} /> : <span className="text-sm text-muted-foreground">Not started</span>}{p.exceptions > 0 && <span className="block text-xs text-warning">{p.exceptions} exception(s) awaiting decision</span>}</TableCell>
                  <TableCell>{d.can.closeStart && pol.current && p.status === "open" && (!p.close_status || ["reopened", "cancelled"].includes(p.close_status)) && p.end_date <= d.today
                    ? <CommandButton action={startClose} hidden={{ periodId: p.id }} label="Start close" />
                    : <Button size="sm" variant="ghost" render={<Link href={`/admin/accounting/closing/${p.id}`} />}>Open</Button>}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {d.fy && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Year-end FY{d.fy}</CardTitle>
            <CardDescription>Requires every other period closed, the final period&apos;s close submitted, and approved annual statements matching the current ledger. Approval posts the closing entries and closes the final period in one step; the result is transferred to retained earnings once only.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {d.yearEnds.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Status</TableHead><TableHead className="text-right">Result to retained earnings</TableHead><TableHead>Closing journal</TableHead><TableHead>Prepared</TableHead><TableHead>Decided</TableHead></TableRow></TableHeader>
                  <TableBody>{d.yearEnds.map((y) => (
                    <TableRow key={y.id}>
                      <TableCell className="whitespace-normal"><StatusBadge domain="yearEnd" status={y.status} />{y.reopen_reason && <span className="block text-xs text-muted-foreground">Reopened: {y.reopen_reason}</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{ledgerAmount(y.net_result)}</TableCell>
                      <TableCell>{y.journal_id ? <Link className="underline-offset-4 hover:underline" href={`/admin/accounting/journals/${y.journal_id}`}>{y.journal_number ?? "Awaiting approval"}</Link> : "No income or expense balances"}{y.reversal_number && <span className="block text-xs">Reversed by {y.reversal_number}</span>}</TableCell>
                      <TableCell className="text-sm">{y.prepared_by}<span className="block text-xs text-muted-foreground">{formatDateTime(y.prepared_at)}</span></TableCell>
                      <TableCell className="text-sm">{y.decided_by ?? "—"}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            )}
            {live?.status === "prepared" && (d.can.yearEnd && live.prepared_by_id !== d.me
              ? <DecisionForm action={decideYearEnd} hidden={{ id: live.id }} label="Year-end decision" decisions={[{ value: "approve", label: "Approve and close the year", primary: true }, { value: "reject", label: "Reject" }]} />
              : <p className="text-sm text-muted-foreground">Awaiting approval by a different person with year-end authority.</p>)}
            {live?.status === "closed" && d.can.reopen && <div><ReopenYearEnd id={live.id} /></div>}
            {!live && d.can.closeStart && <div><PrepareYearEnd fiscalYear={d.fy} sets={d.annualSets} /></div>}
            {!live && d.annualSets.length === 0 && <p className="text-sm text-muted-foreground">No approved annual statements match the current ledger for FY{d.fy}. Prepare and approve them under Financial statements (type: financial year).</p>}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
