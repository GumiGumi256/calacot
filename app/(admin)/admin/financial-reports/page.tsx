import Link from "next/link";
import type { ReactNode } from "react";
import { readFinancialReports, type ExpenseGroupRow, type SearchParams } from "@/lib/finance/reports";
import { formatAmount } from "@/lib/finance/options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonthlyActivityChart } from "@/components/finance/monthly-activity-chart";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const divisions = ["estates", "architecture", "painting", "interiors", "tech"];

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="overflow-x-auto">{children}</CardContent>
    </Card>
  );
}
function Empty({ children = "No activity for these filters." }: { children?: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
function CurrencyFigures({ rows }: { rows: { currency: string; label: string; value: string; note?: string }[] }) {
  if (!rows.length) return <Empty />;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={`${r.currency}-${r.label}`} className="rounded-lg border p-3">
          <dt className="text-xs text-muted-foreground">{r.label} ({r.currency})</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatAmount(r.currency, r.value)}</dd>
          {r.note && <dd className="text-xs text-muted-foreground">{r.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
function GroupTable({ rows, label }: { rows: ExpenseGroupRow[]; label: string }) {
  if (!rows.length) return <Empty>No approved expenses for these filters.</Empty>;
  return (
    <Table>
      <TableHeader><TableRow><TableHead>{label}</TableHead><TableHead>Currency</TableHead><TableHead className="text-right">Requests</TableHead><TableHead className="text-right">Approved</TableHead><TableHead className="text-right">Disbursed</TableHead><TableHead className="text-right">Outstanding</TableHead></TableRow></TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.label}-${r.currency}`}>
            <TableCell className="capitalize">{r.label}</TableCell><TableCell>{r.currency}</TableCell><TableCell className="text-right">{r.count}</TableCell>
            <TableCell className="text-right tabular-nums">{formatAmount(r.currency, r.approved)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatAmount(r.currency, r.disbursed)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatAmount(r.currency, r.outstanding)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const r = await readFinancialReports(await searchParams);
  const f = r.filters;
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle as="h1">Financial reports</CardTitle>
          <CardDescription>
            Operational reports from invoices, customer payments and expense records. These are not accounting statements or profit figures:
            no general ledger, accrual accounting or revenue-recognition policy is configured. UGX and USD are always reported separately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-4" aria-label="Report filters">
            <div className="flex flex-col gap-2"><Label htmlFor="rf-from">From</Label><Input id="rf-from" name="from" type="date" defaultValue={f.from} /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="rf-to">Through</Label><Input id="rf-to" name="to" type="date" defaultValue={f.to} /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="rf-division">Division</Label><select id="rf-division" name="division" defaultValue={f.division} className={`${selectClass} capitalize`}><option value="">All divisions</option>{divisions.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
            <div className="flex flex-col gap-2"><Label htmlFor="rf-project">Project</Label><select id="rf-project" name="projectId" defaultValue={f.projectId} className={`${selectClass} max-w-64`}><option value="">All projects</option>{r.projectOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
            <div className="flex flex-col gap-2"><Label htmlFor="rf-currency">Currency</Label><select id="rf-currency" name="currency" defaultValue={f.currency} className={selectClass}><option value="">UGX and USD (separately)</option><option value="UGX">UGX</option><option value="USD">USD</option></select></div>
            <Button type="submit">Apply</Button>
            <Button variant="outline" render={<Link href="?" />}>Reset</Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">Period {f.from} to {f.to} (Kampala dates). Periods longer than three years are shortened.</p>
        </CardContent>
      </Card>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="Customer receipts and invoicing" description={r.scoped ? "Receipts show only confirmed payments allocated to invoices in the selected division/project. Unallocated receipts cannot be attributed." : "Confirmed customer receipts by date received, invoices issued in the period, and credit notes. Collections are cash received, not revenue or profit."}>
          <CurrencyFigures rows={[
            ...r.receipts.map((x) => ({ currency: x.currency, label: r.scoped ? "Confirmed receipts allocated" : "Confirmed receipts", value: x.amount, note: `${x.count} payment(s)` })),
            ...r.refunds.map((x) => ({ currency: x.currency, label: "Refunds completed", value: x.amount })),
            ...r.invoiced.map((x) => ({ currency: x.currency, label: "Invoiced (issued)", value: x.amount, note: `${x.count} invoice(s), excluding voided` })),
            ...r.credits.map((x) => ({ currency: x.currency, label: "Credit notes issued", value: x.amount })),
          ]} />
          <p className="mt-3 text-xs text-muted-foreground">Recognized revenue: not available. Recognizing revenue requires an approved accounting policy and general ledger, which this system does not implement.</p>
        </Section>
        <Section title="Outstanding customer balances" description="As of today, from the existing invoice ledger (issued invoices less confirmed allocations and credit notes). Not limited to the period.">
          <CurrencyFigures rows={r.outstanding.flatMap((x) => [
            { currency: x.currency, label: "Outstanding", value: x.outstanding, note: `${x.invoices} invoice(s) with a balance` },
            { currency: x.currency, label: "Overdue", value: x.overdue, note: "Past the invoice due date" },
          ])} />
        </Section>
        <Section title="Approved versus paid expenses" description="Expenses dated in the period (pending, approved, outstanding) and disbursements paid in the period.">
          <CurrencyFigures rows={[
            ...r.pipeline.flatMap((x) => [
              { currency: x.currency, label: "Pending review (requested)", value: x.pending },
              { currency: x.currency, label: "Approved (committed)", value: x.approved },
              { currency: x.currency, label: "Approved, not yet paid", value: x.outstanding },
              ...(Number(x.legacy_paid) > 0 ? [{ currency: x.currency, label: "Marked paid without disbursement record", value: x.legacy_paid, note: "Recorded before this workflow" }] : []),
            ]),
            ...r.disbursed.flatMap((x) => [
              { currency: x.currency, label: "Disbursed (actual payments recorded)", value: x.amount, note: `${x.count} disbursement(s)` },
              { currency: x.currency, label: "Of which reconciled", value: x.reconciled },
            ]),
          ]} />
        </Section>
        <Section title="Expenses by division" description="Approved and paid expenses dated in the period.">
          <GroupTable rows={r.byDivision} label="Division" />
        </Section>
        <Section title="Expenses by category" description="Approved and paid expenses dated in the period.">
          <GroupTable rows={r.byCategory} label="Category" />
        </Section>
        <Section title="Expenses by project" description="Approved and paid expenses dated in the period.">
          <GroupTable rows={r.byProject} label="Project" />
        </Section>
      </div>

      <Section title="Project financial summaries" description="Lifetime to date for each project and currency. Collections are confirmed payments allocated to the project's invoices. This is not project profit.">
        {r.projects.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Currency</TableHead><TableHead className="text-right">Invoiced</TableHead><TableHead className="text-right">Collected</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Approved expenses</TableHead><TableHead className="text-right">Disbursed</TableHead></TableRow></TableHeader>
            <TableBody>
              {r.projects.map((p) => (
                <TableRow key={`${p.id}-${p.currency}`}>
                  <TableCell><Link className="underline-offset-4 hover:underline" href={`/admin/projects/${p.id}`}>{p.code} {p.name}</Link></TableCell>
                  <TableCell>{p.currency}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(p.currency, p.invoiced)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(p.currency, p.collected)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(p.currency, p.outstanding)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(p.currency, p.approved)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(p.currency, p.disbursed)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : <Empty>No project invoices or approved project expenses for these filters.</Empty>}
      </Section>

      {/* Design System V1 Phase 3: chart per currency; the original monthly table sits behind "View as table". */}
      <MonthlyActivityChart rows={r.monthly} from={f.from} to={f.to} today={r.today} />
    </div>
  );
}
