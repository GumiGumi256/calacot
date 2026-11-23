import { readPayroll } from "@/lib/payroll/reads";
import { decidePayroll } from "@/lib/payroll/actions";
import { AccountingNav } from "@/components/accounting/shared";
import { DecisionForm } from "@/components/tax/controls";
import { TaxAmount } from "@/components/tax/shared";
import { ComponentForm, ProfileForm, SimulateForm, StructureForm } from "@/components/payroll/forms";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";

export default async function Page() {
  const d = await readPayroll();
  const decide = (entity: string, id: string, preparer: string, label: string) =>
    d.can.approve && (preparer === d.me ? <p className="text-sm text-muted-foreground">You prepared this, so someone else must approve it.</p>
      : <DecisionForm action={decidePayroll} hidden={{ id, entity }} label={label} decisions={[{ value: "approve", label: "Approve", primary: true }, { value: "reject", label: "Reject" }]} />);
  const employees = d.profiles.filter((p) => p.engagement_type === "employee" && p.status === "active");
  const components = d.components.filter((c) => c.status === "approved" && !c.statutory);
  return (
    <PageContainer>
      <PageHeader title="Payroll (foundation)" description="Payroll profiles, pay components and salary structures, with simulations. Payroll is not live: nothing is approved for payment, paid or posted, and PAYE and NSSF are not calculated until they are confirmed and separately approved."
        primaryAction={d.can.admin && <ProfileForm staff={d.staff} />}
        secondaryActions={d.can.admin && <><ComponentForm accounts={d.accounts} /><StructureForm profiles={employees} components={components} /><SimulateForm /></>} />
      <AccountingNav current="/admin/accounting/payroll" />
      <Card variant="attention" tone="warning">
        <CardContent className="text-sm">
          Restricted: visible only to payroll administrators and approvers. Statutory deductions: {d.obligations.length ? d.obligations.map((o) => `${o.tax_type.toUpperCase()} ${o.registration_status.replace("_", " ")}${o.processing_enabled ? "" : " (not operational)"}`).join(", ") : "PAYE and NSSF not configured"}.
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Profiles</CardTitle><CardDescription>Explicit records only; the staff directory never implies payroll. Contractors are paid as suppliers.</CardDescription></CardHeader>
        <CardContent className="flex flex-col divide-y">
          {d.profiles.length === 0 ? <p className="text-sm text-muted-foreground">No payroll profiles.</p> : d.profiles.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 lg:flex-row lg:justify-between">
              <div className="text-sm">
                <p className="flex flex-wrap items-center gap-2"><span className="font-medium">{p.employee_number} {p.person_name}</span><StatusBadge domain="payrollRecord" status={p.status} /><span>{p.engagement_type}</span></p>
                <p className="text-muted-foreground">From {formatDate(p.start_date)}{p.end_date ? ` to ${formatDate(p.end_date)}` : ""} · {p.payment_method.replace("_", " ")}{p.payment_account_last4 ? ` ••••${p.payment_account_last4}` : ""} · TIN {p.has_tin ? "recorded" : "missing"} · NSSF {p.has_nssf ? "recorded" : "missing"}{p.staff ? ` · staff: ${p.staff}` : ""}</p>
              </div>
              <div className="lg:w-72 lg:shrink-0">{p.status === "proposed" && decide("payroll_profile", p.id, p.prepared_by_id, `Decide profile ${p.employee_number}`)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Components and salary structures</CardTitle></CardHeader>
        <CardContent className="flex flex-col divide-y">
          {d.components.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:justify-between">
              <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{c.code} {c.name}</span><StatusBadge domain="payrollRecord" status={c.status} /><span className="text-muted-foreground">{c.kind.replaceAll("_", " ")}{c.taxable ? " · taxable" : ""}{c.statutory ? ` · statutory ${c.statutory} (computed from policy only)` : ""}</span></p>
              <div className="lg:w-72 lg:shrink-0">{c.status === "proposed" && decide("payroll_component", c.id, c.proposed_by_id, `Decide component ${c.code}`)}</div>
            </div>
          ))}
          {d.structures.map((s) => (
            <div key={s.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:justify-between">
              <div className="text-sm"><p className="flex flex-wrap items-center gap-2"><span className="font-medium">{s.person_name} from {formatDate(s.effective_from)}</span><StatusBadge domain="payrollRecord" status={s.status} /></p>
                <p className="text-muted-foreground">{s.lines.map((l) => `${l.componentCode} ${s.currency} ${l.amount}`).join(" · ")}</p></div>
              <div className="lg:w-72 lg:shrink-0">{s.status === "proposed" && decide("payroll_structure", s.id, s.prepared_by_id, `Decide structure for ${s.person_name}`)}</div>
            </div>
          ))}
          {d.components.length === 0 && d.structures.length === 0 && <p className="text-sm text-muted-foreground">No components or structures.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Simulations</CardTitle><CardDescription>Payslip structure only: gross pay and non-statutory deductions. Not for payment.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.runs.length === 0 ? <p className="text-sm text-muted-foreground">No simulations.</p> : (
            <Table><TableHeader><TableRow><TableHead>Period</TableHead><TableHead className="text-right">Employees</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Net before statutory</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>{d.runs.map((r) => <TableRow key={r.id}><TableCell>{formatDate(r.period_start)} – {formatDate(r.period_end)}<span className="block text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span></TableCell><TableCell className="text-right">{String(r.totals.employees ?? 0)}</TableCell><TableCell className="text-right"><TaxAmount value={r.totals.gross} /></TableCell><TableCell className="text-right"><TaxAmount value={r.totals.netBeforeStatutory} /></TableCell><TableCell className="text-sm">{r.problems.map((p) => p.replaceAll("_", " ")).join("; ")}</TableCell></TableRow>)}</TableBody></Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
