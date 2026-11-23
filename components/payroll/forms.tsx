"use client";
import { useActionState, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { proposeComponent, proposeStructure, saveProfile, simulateRun } from "@/lib/payroll/actions";
import { FormDialog, initial } from "@/components/accounting/admin-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";

const newKey = () => crypto.randomUUID();

export function ProfileForm({ staff }: { staff: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveProfile, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog trigger={<><PlusIcon data-icon="inline-start" />Add payroll profile</>} title="Add a payroll profile" description="A payroll profile is an explicit record: being in the staff directory never puts anyone on payroll. Contractors are recorded separately and paid as suppliers. A different person must approve it." state={state} action={action} pending={pending} submitLabel="Propose">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="pp-name">Full name</FieldLabel><Input id="pp-name" name="personName" required maxLength={160} /></Field>
          <Field><FieldLabel htmlFor="pp-eng">Engagement</FieldLabel><NativeSelect wrapperClassName="w-full" id="pp-eng" name="engagementType"><option value="employee">Employee</option><option value="contractor">Contractor (not on payroll)</option></NativeSelect></Field>
          <Field><FieldLabel htmlFor="pp-num">Employee number</FieldLabel><Input id="pp-num" name="employeeNumber" required pattern="[A-Za-z0-9\-]{1,30}" /></Field>
          <Field><FieldLabel htmlFor="pp-staff">Staff directory link (optional)</FieldLabel><NativeSelect wrapperClassName="w-full" id="pp-staff" name="staffId" defaultValue=""><option value="">None</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="pp-start">Start date</FieldLabel><Input id="pp-start" type="date" name="startDate" required /></Field>
          <Field><FieldLabel htmlFor="pp-end">End date</FieldLabel><Input id="pp-end" type="date" name="endDate" /></Field>
          <Field><FieldLabel htmlFor="pp-tin">TIN</FieldLabel><Input id="pp-tin" name="tin" inputMode="numeric" pattern="[0-9]{6,15}" /></Field>
          <Field><FieldLabel htmlFor="pp-nssf">NSSF number</FieldLabel><Input id="pp-nssf" name="nssfNumber" maxLength={30} /></Field>
          <Field><FieldLabel htmlFor="pp-pm">Payment method</FieldLabel><NativeSelect wrapperClassName="w-full" id="pp-pm" name="paymentMethod"><option value="bank">Bank</option><option value="mobile_money">Mobile money</option><option value="cash">Cash</option></NativeSelect></Field>
          <Field><FieldLabel htmlFor="pp-acct">Payment account</FieldLabel><Input id="pp-acct" name="paymentAccount" autoComplete="off" maxLength={40} /><FieldDescription>Only the last four characters are stored.</FieldDescription></Field>
        </div>
      </FieldGroup>
    </FormDialog>
  );
}

export function ComponentForm({ accounts }: { accounts: { id: string; code: string; name: string; account_type: string }[] }) {
  const [state, action, pending] = useActionState(proposeComponent, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog variant="outline" trigger="Propose component" title="Propose a pay component" description="Salary, allowances, bonuses, deductions and employer contributions. Statutory components (PAYE, NSSF) are placeholders: their amounts come only from approved policy once those taxes are operational." state={state} action={action} pending={pending} submitLabel="Propose">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="pc-code">Code</FieldLabel><Input id="pc-code" name="code" required pattern="[A-Za-z0-9][A-Za-z0-9_]{1,29}" /></Field>
          <Field><FieldLabel htmlFor="pc-name">Name</FieldLabel><Input id="pc-name" name="name" required maxLength={120} /></Field>
          <Field><FieldLabel htmlFor="pc-kind">Type</FieldLabel><NativeSelect wrapperClassName="w-full" id="pc-kind" name="kind">{["basic_salary", "allowance", "bonus", "deduction", "employer_contribution"].map((k) => <option key={k} value={k}>{k.replaceAll("_", " ")}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="pc-tax">Taxable</FieldLabel><NativeSelect wrapperClassName="w-full" id="pc-tax" name="taxable"><option value="true">Yes</option><option value="false">No</option></NativeSelect></Field>
          <Field><FieldLabel htmlFor="pc-stat">Statutory</FieldLabel><NativeSelect wrapperClassName="w-full" id="pc-stat" name="statutory" defaultValue=""><option value="">No</option><option value="paye">PAYE</option><option value="nssf_employee">NSSF (employee)</option><option value="nssf_employer">NSSF (employer)</option></NativeSelect></Field>
          <Field><FieldLabel htmlFor="pc-exp">Expense account</FieldLabel><NativeSelect wrapperClassName="w-full" id="pc-exp" name="expenseAccountId" defaultValue=""><option value="">None</option>{accounts.filter((a) => a.account_type !== "liability").map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="pc-lia">Liability account</FieldLabel><NativeSelect wrapperClassName="w-full" id="pc-lia" name="liabilityAccountId" defaultValue=""><option value="">None</option>{accounts.filter((a) => a.account_type === "liability").map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</NativeSelect></Field>
        </div>
      </FieldGroup>
    </FormDialog>
  );
}

export function StructureForm({ profiles, components }: { profiles: { id: string; person_name: string }[]; components: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState(proposeStructure, initial);
  const [key] = useState(newKey);
  const [lines, setLines] = useState([{ componentCode: components[0]?.code ?? "", amount: "" }]);
  return (
    <FormDialog variant="outline" trigger="Propose salary structure" title="Propose a salary structure" description="Approved, non-statutory components only. A different person must approve it." state={state} action={action} pending={pending} submitLabel="Propose">
      <input type="hidden" name="key" value={key} /><input type="hidden" name="lines" value={JSON.stringify(lines.filter((l) => l.componentCode && l.amount))} />
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field><FieldLabel htmlFor="ss-p">Employee</FieldLabel><NativeSelect wrapperClassName="w-full" id="ss-p" name="profileId" required>{profiles.map((p) => <option key={p.id} value={p.id}>{p.person_name}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="ss-from">Effective from</FieldLabel><Input id="ss-from" type="date" name="effectiveFrom" required /></Field>
          <Field><FieldLabel htmlFor="ss-cur">Currency</FieldLabel><NativeSelect wrapperClassName="w-full" id="ss-cur" name="currency"><option value="UGX">UGX</option><option value="USD">USD</option></NativeSelect></Field>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
            <NativeSelect wrapperClassName="w-full" aria-label={`Line ${i + 1} component`} value={l.componentCode} onChange={(e) => setLines((x) => x.map((y, j) => j === i ? { ...y, componentCode: e.target.value } : y))}>{components.map((c) => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}</NativeSelect>
            <Input aria-label={`Line ${i + 1} monthly amount`} inputMode="decimal" placeholder="Monthly amount" value={l.amount} onChange={(e) => setLines((x) => x.map((y, j) => j === i ? { ...y, amount: e.target.value } : y))} />
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((x) => x.length > 1 ? x.filter((_, j) => j !== i) : x)}><Trash2Icon /></Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setLines((x) => [...x, { componentCode: components[0]?.code ?? "", amount: "" }])}><PlusIcon data-icon="inline-start" />Add line</Button>
      </FieldGroup>
    </FormDialog>
  );
}

export function SimulateForm() {
  const [state, action, pending] = useActionState(simulateRun, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog variant="outline" trigger="Simulate a period" title="Simulate payroll" description="Calculates gross pay and non-statutory deductions from approved structures. Nothing is approved, paid or posted, and statutory deductions are not computed." state={state} action={action} pending={pending} submitLabel="Simulate">
      <input type="hidden" name="key" value={key} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field><FieldLabel htmlFor="sm-s">Period start</FieldLabel><Input id="sm-s" type="date" name="periodStart" required /></Field>
        <Field><FieldLabel htmlFor="sm-e">Period end</FieldLabel><Input id="sm-e" type="date" name="periodEnd" required /></Field>
      </div>
    </FormDialog>
  );
}
