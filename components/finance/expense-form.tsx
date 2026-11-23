"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { saveExpense } from "@/lib/finance/actions";
import { expenseCategories, formatAmount } from "@/lib/finance/options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";

const divisions = ["estates", "architecture", "painting", "interiors", "tech"] as const;
type Project = { id: string; name: string; code: string; division: string; currency: string };
type Supplier = { id: string; name: string };
export type ExpenseFormValues = {
  id?: string; version?: number; division: string; projectId: string; category: string; supplierId: string; description: string; purpose: string;
  currency: string; netAmount: string; taxAmount: string; incurredOn: string; supplierInvoiceReference: string;
  payees?: PayeeLine[];
};
/** A project team member who can receive a share of the expense. */
export type PayeeMember = { id: string; project_id: string; name: string; detail: string | null };
type PayeeLine = { memberId: string; amount: string };

const valid = (v: string) => /^\d{1,15}(\.\d{1,2})?$/.test(v);
const cents = (v: string) => { const [w, f = ""] = v.split("."); return BigInt(w + f.padEnd(2, "0")); };
const fromCents = (c: bigint) => `${c < BigInt(0) ? "-" : ""}${(c < BigInt(0) ? -c : c) / BigInt(100)}.${((c < BigInt(0) ? -c : c) % BigInt(100)).toString().padStart(2, "0")}`;
function addMoney(a: string, b: string) {
  if (!valid(a) || (b && !valid(b))) return null;
  return fromCents(cents(a) + (b ? cents(b) : BigInt(0)));
}

export function ExpenseForm({ requestKey, projects, suppliers, members = [], initial, today, divisionOptions = divisions.map((key) => ({ key, label: key })), defaultCurrency = "UGX", fixedProject, onSaved }: { requestKey: string; projects: Project[]; suppliers: Supplier[]; members?: PayeeMember[]; initial?: ExpenseFormValues; today: string; divisionOptions?: { key: string; label: string }[]; defaultCurrency?: string; fixedProject?: Project; onSaved?: (id: string) => void }) {
  const router = useRouter();
  const { orgSlug } = useAuth();
  const [state, action, pending] = useActionState(saveExpense, { ok: false, message: "" });
  const [form, setForm] = useState<ExpenseFormValues>(initial ?? { division: fixedProject?.division ?? "", projectId: fixedProject?.id ?? "", category: "", supplierId: "", description: "", purpose: "", currency: fixedProject?.currency ?? defaultCurrency, netAmount: "", taxAmount: "", incurredOn: today, supplierInvoiceReference: "" });
  const [newSupplier, setNewSupplier] = useState(false);
  const set = (k: keyof ExpenseFormValues, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const projectOptions = useMemo(() => projects.filter((p) => !form.division || p.division === form.division), [projects, form.division]);
  const total = addMoney(form.netAmount || "0", form.taxAmount);
  const [payees, setPayees] = useState<PayeeLine[]>(initial?.payees ?? []);
  const team = useMemo(() => members.filter((m) => m.project_id === form.projectId), [members, form.projectId]);
  // Lines with neither a person nor an amount are ignored; partly filled lines go to the server and fail validation there.
  const filled = payees.filter((l) => l.memberId || l.amount);
  const allocated = filled.every((l) => valid(l.amount)) ? filled.reduce((s, l) => s + cents(l.amount), BigInt(0)) : null;
  const remaining = total && allocated !== null ? cents(total) - allocated : null;
  const setLine = (i: number, k: keyof PayeeLine, v: string) => setPayees((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const changeProject = (id: string) => { set("projectId", id); setPayees([]); };
  useEffect(() => {
    if (state.ok && state.id) {
      if (onSaved) { onSaved(state.id); router.refresh(); return; }
      router.push(`${orgSlug ? "/" + encodeURIComponent(orgSlug) : ""}/admin/expenses/${state.id}`);
      router.refresh();
    }
  }, [state, router, orgSlug, onSaved]);
  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6" noValidate={false}>
      <input type="hidden" name="key" value={requestKey} />
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      {initial?.version !== undefined && <input type="hidden" name="version" value={String(initial.version)} />}
      <FieldSet>
        <FieldLegend>What is this expense for?</FieldLegend>
        <FieldGroup>
          {fixedProject ? <><input type="hidden" name="division" value={fixedProject.division} /><input type="hidden" name="projectId" value={fixedProject.id} /><p className="text-sm">Project: <span className="font-medium">{fixedProject.code} {fixedProject.name}</span> · {fixedProject.division}</p></> : <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="expense-division">Division</FieldLabel>
              <NativeSelect wrapperClassName="w-full" className="capitalize" id="expense-division" name="division" required value={form.division} onChange={(e) => { set("division", e.target.value); if (projects.find((p) => p.id === form.projectId)?.division !== e.target.value) changeProject(""); }}>
                <option value="" disabled>Select a division</option>
                {divisionOptions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}{initial && !divisionOptions.some((d) => d.key === initial.division) && <option value={initial.division}>{initial.division}</option>}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="expense-project">Project (optional)</FieldLabel>
              <NativeSelect wrapperClassName="w-full" className="capitalize" id="expense-project" name="projectId" value={form.projectId} onChange={(e) => { changeProject(e.target.value); const p = projects.find((x) => x.id === e.target.value); if (p) set("division", p.division); }} aria-describedby="expense-project-hint">
                <option value="">No project (operational expense)</option>
                {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
              </NativeSelect>
              <FieldDescription id="expense-project-hint">Projects are filtered to the selected division.</FieldDescription>
            </Field>
          </div>}
          <Field>
            <FieldLabel htmlFor="expense-description">Description</FieldLabel>
            <Input id="expense-description" name="description" required maxLength={500} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Cement for foundation, 40 bags" />
          </Field>
          <Field>
            <FieldLabel htmlFor="expense-purpose">Business purpose</FieldLabel>
            <Textarea id="expense-purpose" name="purpose" required minLength={5} maxLength={4000} value={form.purpose} onChange={(e) => set("purpose", e.target.value)} aria-describedby="expense-purpose-hint" />
            <FieldDescription id="expense-purpose-hint">Explain why the spending is needed. Reviewers rely on this.</FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="expense-category">Category</FieldLabel>
              <Input id="expense-category" name="category" required maxLength={100} list="expense-categories" value={form.category} onChange={(e) => set("category", e.target.value)} />
              <datalist id="expense-categories">{expenseCategories.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field>
              <FieldLabel htmlFor="expense-date">Expense date</FieldLabel>
              <Input id="expense-date" name="incurredOn" type="date" required max={today} value={form.incurredOn} onChange={(e) => set("incurredOn", e.target.value)} />
            </Field>
          </div>
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend>Supplier</FieldLegend>
        <FieldGroup>
          {newSupplier ? (
            <Field>
              <FieldLabel htmlFor="expense-supplier-name">New supplier name</FieldLabel>
              <Input id="expense-supplier-name" name="supplierName" maxLength={200} aria-describedby="expense-supplier-hint" />
              <FieldDescription id="expense-supplier-hint">An existing supplier with the same name is reused automatically. <button type="button" className="underline underline-offset-4" onClick={() => setNewSupplier(false)}>Choose from the list instead</button></FieldDescription>
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="expense-supplier">Supplier (optional)</FieldLabel>
              <NativeSelect wrapperClassName="w-full" className="capitalize" id="expense-supplier" name="supplierId" value={form.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
                <option value="">No supplier / not yet known</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect>
              <FieldDescription><button type="button" className="underline underline-offset-4" onClick={() => { setNewSupplier(true); set("supplierId", ""); }}>Add a supplier that is not listed</button></FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="expense-supplier-ref">Supplier invoice or receipt number (optional)</FieldLabel>
            <Input id="expense-supplier-ref" name="supplierInvoiceReference" maxLength={200} value={form.supplierInvoiceReference} onChange={(e) => set("supplierInvoiceReference", e.target.value)} />
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend>Amount requested</FieldLegend>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="expense-currency">Currency</FieldLabel>
              <NativeSelect wrapperClassName="w-full" className="capitalize" id="expense-currency" name="currency" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                <option value="UGX">UGX</option>
                <option value="USD">USD</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="expense-net">Amount before tax</FieldLabel>
              <Input id="expense-net" name="netAmount" inputMode="decimal" required pattern="\d{1,15}(\.\d{1,2})?" value={form.netAmount} onChange={(e) => set("netAmount", e.target.value.trim())} aria-invalid={!!form.netAmount && !valid(form.netAmount)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="expense-tax">Tax (optional)</FieldLabel>
              <Input id="expense-tax" name="taxAmount" inputMode="decimal" pattern="\d{1,15}(\.\d{1,2})?" value={form.taxAmount} onChange={(e) => set("taxAmount", e.target.value.trim())} aria-invalid={!!form.taxAmount && !valid(form.taxAmount)} />
            </Field>
          </div>
          <p className="text-sm" aria-live="polite">
            Total requested: <span className="font-medium">{total ? formatAmount(form.currency, total) : "Enter amounts using digits and up to two decimals"}</span>
          </p>
        </FieldGroup>
      </FieldSet>
      {form.projectId && (
        <FieldSet>
          <FieldLegend>Who received this money? (optional)</FieldLegend>
          <FieldDescription>For a lump sum paid to several people, such as painters, record each person&apos;s share. The shares must add up to the total. The project page then shows how much each person has been paid.</FieldDescription>
          <input type="hidden" name="payees" value={JSON.stringify(filled)} />
          {team.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody is on this project&apos;s team yet. Add the people you pay to the project team, then come back to split this expense.</p>
          ) : (
            <FieldGroup>
              {payees.map((line, i) => (
                <div key={i} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
                  <Field>
                    <FieldLabel htmlFor={`payee-member-${i}`}>Person {i + 1}</FieldLabel>
                    <NativeSelect wrapperClassName="w-full" id={`payee-member-${i}`} value={line.memberId} onChange={(e) => setLine(i, "memberId", e.target.value)}>
                      <option value="" disabled>Select a team member</option>
                      {team.filter((m) => m.id === line.memberId || !payees.some((l) => l.memberId === m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}{m.detail ? ` (${m.detail})` : ""}</option>)}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`payee-amount-${i}`}>Amount</FieldLabel>
                    <Input id={`payee-amount-${i}`} inputMode="decimal" pattern="\d{1,15}(\.\d{1,2})?" value={line.amount} onChange={(e) => setLine(i, "amount", e.target.value.trim())} aria-invalid={!!line.amount && !valid(line.amount)} />
                  </Field>
                  <Button type="button" variant="outline" onClick={() => setPayees((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove person ${i + 1}`}>Remove</Button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                {payees.length < team.length && <Button type="button" variant="outline" size="sm" onClick={() => setPayees((ls) => [...ls, { memberId: "", amount: remaining && remaining > BigInt(0) && ls.length > 0 ? fromCents(remaining) : "" }])}>Add person</Button>}
                {filled.length > 0 && (
                  <p className="text-sm tabular-nums" aria-live="polite">
                    {allocated === null || remaining === null ? "Enter each amount using digits and up to two decimals." : remaining === BigInt(0) ? <>Fully allocated: <span className="font-medium">{formatAmount(form.currency, fromCents(allocated))}</span></> : remaining > BigInt(0) ? <span className="text-destructive">{formatAmount(form.currency, fromCents(remaining))} still to allocate</span> : <span className="text-destructive">Over the total by {formatAmount(form.currency, fromCents(-remaining))}</span>}
                  </p>
                )}
              </div>
            </FieldGroup>
          )}
        </FieldSet>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : initial?.id ? "Save corrections" : "Save draft"}</Button>
        <p className="text-sm text-muted-foreground">Saving does not submit the request. You can attach receipts and submit from the expense page.</p>
      </div>
      {state.message && <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p>}
    </form>
  );
}
