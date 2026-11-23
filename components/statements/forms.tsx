"use client";
import { useActionState, useMemo, useState } from "react";
import { PlusIcon, PrinterIcon, Trash2Icon } from "lucide-react";
import {
  addCloseEvidence, assignCloseReviewer, createAdjustment, createStatementSet, prepareYearEnd, proposeClassificationAction, proposeClosePolicyAction, proposeOverheadAction, raiseCloseException, reopenYearEnd,
} from "@/lib/statements/actions";
import { closeCheckLabels, lineFits, proposeClassification, statementKinds, statementLines, type AccountType, type ChartAccount, type ClassificationEntry, type StatementLine } from "@/lib/accounting/statements";
import { FormDialog, Message, initial } from "@/components/accounting/admin-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const newKey = () => crypto.randomUUID();

/** Checkbox whose value is always submitted through a hidden input ("on" or empty). */
function BoxInput({ name, defaultChecked, label, id }: { name: string; defaultChecked: boolean; label: string; id?: string }) {
  const [on, setOn] = useState(defaultChecked);
  return <><Checkbox id={id} aria-label={label} checked={on} onCheckedChange={(v) => setOn(!!v)} /><input type="hidden" name={name} value={on ? "on" : ""} /></>;
}

/** Browser print dialog; the page's print styles show the status banner and hide navigation. */
export function PrintButton() {
  return <Button variant="outline" size="sm" onClick={() => window.print()}><PrinterIcon aria-hidden data-icon="inline-start" />Print or save as PDF</Button>;
}

export function CreateStatementSet({ from, to, comparative }: { from: string; to: string; comparative: { from: string; to: string } | null }) {
  const [state, action, pending] = useActionState(createStatementSet, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog variant="outline" trigger="Prepare statement set" title="Prepare a statement set" description="The database computes every statement from the posted ledger and stores a hashed snapshot. A different person must approve it." state={state} action={action} pending={pending} submitLabel="Prepare draft">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <Field><FieldLabel htmlFor="ss-kind">Type</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="ss-kind" name="kind" defaultValue="month">{Object.entries(statementKinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="ss-from">From</FieldLabel><Input id="ss-from" type="date" name="periodStart" required defaultValue={from} /></Field>
          <Field><FieldLabel htmlFor="ss-to">To</FieldLabel><Input id="ss-to" type="date" name="periodEnd" required defaultValue={to} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="ss-cfrom">Comparative from (optional)</FieldLabel><Input id="ss-cfrom" type="date" name="comparativeStart" defaultValue={comparative?.from ?? ""} /></Field>
          <Field><FieldLabel htmlFor="ss-cto">Comparative to</FieldLabel><Input id="ss-cto" type="date" name="comparativeEnd" defaultValue={comparative?.to ?? ""} /></Field>
        </div>
        <FieldDescription>Annual statements used for year-end must cover exactly the financial year.</FieldDescription>
      </FieldGroup>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------------------------

type Acct = { id: string; code: string; name: string; account_type: string; is_contra: boolean; is_postable: boolean; reporting_class: string | null; status: string };
export function ClassificationForm({ accounts, current }: { accounts: Acct[]; current: { mappings: Record<string, { line: string; cashflow: string | null; clearing?: boolean }>; retained_earnings_account_id: string } | null }) {
  const [state, action, pending] = useActionState(proposeClassificationAction, initial);
  const [key] = useState(newKey);
  const suggested = useMemo(() => proposeClassification(accounts.map((a): ChartAccount => ({ id: a.id, code: a.code, accountType: a.account_type as AccountType, isContra: a.is_contra, isPostable: a.is_postable, reportingClass: a.reporting_class }))), [accounts]);
  const start = (id: string): ClassificationEntry | undefined => (current?.mappings[id] as ClassificationEntry | undefined) ?? suggested[id];
  const reOptions = accounts.filter((a) => a.account_type === "equity");
  if (state.ok) return <p role="status" className="text-sm">{state.message}</p>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="key" value={key} />
      <p className="text-sm text-muted-foreground">{current ? "Starting from the approved classification." : "Starting from a suggestion based on the account codes. Review every line: nothing takes effect until a different person approves it."}</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Statement line</TableHead><TableHead>Cash-flow class</TableHead><TableHead>Clearing</TableHead></TableRow></TableHeader>
          <TableBody>
            {accounts.map((a) => {
              const s = start(a.id);
              const lines = (Object.keys(statementLines) as StatementLine[]).filter((l) => lineFits(a.account_type as AccountType, a.is_contra, l));
              return (
                <TableRow key={a.id}>
                  <TableCell className="min-w-48"><span className="font-medium">{a.code}</span> {a.name}{a.status !== "active" && <span className="block text-xs text-muted-foreground">{a.status}</span>}</TableCell>
                  <TableCell><NativeSelect aria-label={`${a.code} statement line`} name={`line:${a.id}`} defaultValue={s?.line ?? ""}><option value="">Not classified</option>{lines.map((l) => <option key={l} value={l}>{statementLines[l].label}</option>)}</NativeSelect></TableCell>
                  <TableCell><NativeSelect aria-label={`${a.code} cash-flow class`} name={`cf:${a.id}`} defaultValue={s?.cashflow ?? ""}><option value="">None (no cash effect)</option><option value="operating">Operating</option><option value="investing">Investing</option><option value="financing">Financing</option></NativeSelect></TableCell>
                  <TableCell><BoxInput label={`${a.code} is a clearing account`} name={`clearing:${a.id}`} defaultChecked={s?.clearing ?? false} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <FieldGroup>
        <Field><FieldLabel htmlFor="cl-re">Retained earnings account (receives the year-end result)</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="cl-re" name="retainedEarningsAccountId" required defaultValue={current?.retained_earnings_account_id ?? reOptions.find((a) => a.code.startsWith("32"))?.id ?? ""}>
            <option value="" disabled>Choose an equity account</option>{reOptions.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </NativeSelect>
        </Field>
        <Field><FieldLabel htmlFor="cl-note">Basis for this classification</FieldLabel><Textarea id="cl-note" name="note" required minLength={5} maxLength={2000} placeholder="Reviewed with the accountant; presentation follows IFRS for SMEs" /></Field>
      </FieldGroup>
      <Button type="submit" loading={pending} className="self-start">Propose classification</Button>
      <Message state={state} />
    </form>
  );
}

const divisions = ["estates", "architecture", "painting", "interiors", "tech"] as const;
export function ProposeOverhead() {
  const [state, action, pending] = useActionState(proposeOverheadAction, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog variant="outline" trigger="Propose allocation policy" title="Propose an overhead allocation policy" description="Shared costs (entries without a division) are shown as allocated memo amounts only under an approved policy. Allocation never posts journals." state={state} action={action} pending={pending} submitLabel="Propose">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          {divisions.map((d) => <Field key={d}><FieldLabel htmlFor={`oh-${d}`} className="capitalize">{d} (%)</FieldLabel><Input id={`oh-${d}`} name={`share:${d}`} inputMode="decimal" pattern="\d{1,3}(\.\d{1,2})?" placeholder="0" /></Field>)}
        </div>
        <FieldDescription>Percentages must add up to exactly 100.</FieldDescription>
        <Field><FieldLabel htmlFor="oh-from">Effective from</FieldLabel><Input id="oh-from" type="date" name="effectiveFrom" required /></Field>
        <Field><FieldLabel htmlFor="oh-note">Basis</FieldLabel><Textarea id="oh-note" name="note" required minLength={5} maxLength={2000} placeholder="e.g. head-count or floor-space basis agreed by management" /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

export function ProposeClosePolicy({ current }: { current: { require_bank_reconciliation: boolean; require_cash_count: boolean; clearing_tolerance: string; evidence_items: string[] } | null }) {
  const [state, action, pending] = useActionState(proposeClosePolicyAction, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog variant="outline" trigger={current ? "Propose policy change" : "Propose close policy"} title="Propose a period-close policy" description="Once a close policy is approved, accounting periods can only be closed and reopened through Period closing, with its checklist, evidence and a second approver." state={state} action={action} pending={pending} submitLabel="Propose">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <Field orientation="horizontal"><BoxInput id="cp-bank" label="Require bank reconciliations" name="requireBankReconciliation" defaultChecked={current?.require_bank_reconciliation ?? true} /><FieldLabel htmlFor="cp-bank">Bank and mobile-money reconciliations must be finalized to the period end</FieldLabel></Field>
        <Field orientation="horizontal"><BoxInput id="cp-cash" label="Require cash counts" name="requireCashCount" defaultChecked={current?.require_cash_count ?? true} /><FieldLabel htmlFor="cp-cash">Cash and petty cash must be counted in the period</FieldLabel></Field>
        <Field><FieldLabel htmlFor="cp-tol">Clearing account tolerance (UGX)</FieldLabel><Input id="cp-tol" name="clearingTolerance" inputMode="decimal" defaultValue={current?.clearing_tolerance ?? "0"} /></Field>
        <Field><FieldLabel htmlFor="cp-ev">Required evidence, one per line</FieldLabel><Textarea id="cp-ev" name="evidenceItems" rows={4} defaultValue={(current?.evidence_items ?? ["Bank statements", "Supplier statement reconciliations"]).join("\n")} /></Field>
        <Field><FieldLabel htmlFor="cp-note">Basis</FieldLabel><Textarea id="cp-note" name="note" required minLength={5} maxLength={2000} /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------------------------

type LineInput = { accountId: string; debit: string; credit: string; description: string; division: string };
const blank = (): LineInput => ({ accountId: "", debit: "", credit: "", description: "", division: "" });
const adjustmentKinds = { accrual: "Accrual", prepayment: "Prepayment", deferral: "Deferral", provision: "Provision", depreciation: "Depreciation correction", reclassification: "Reclassification", correction: "Error correction", prior_period: "Prior-period correction", other: "Other" };
export function AdjustmentForm({ accounts }: { accounts: { id: string; code: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createAdjustment, initial);
  const [key] = useState(newKey);
  const [lines, setLines] = useState<LineInput[]>([blank(), blank()]);
  const set = (i: number, patch: Partial<LineInput>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const cents = (v: string) => (/^\d{1,15}(\.\d{1,2})?$/.test(v) ? Math.round(Number(v) * 100) : 0);
  const dr = lines.reduce((s, l) => s + cents(l.debit), 0), cr = lines.reduce((s, l) => s + cents(l.credit), 0);
  return (
    <FormDialog trigger="New adjustment" title="Prepare an adjusting entry" description="Posted through the journal engine: balanced, dated in an open period, and approved and posted by a different person. Give the reason and the evidence." state={state} action={action} pending={pending} submitLabel="Submit for review">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="lines" value={JSON.stringify(lines.filter((l) => l.accountId))} />
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="aj-kind">Type</FieldLabel><NativeSelect wrapperClassName="w-full" id="aj-kind" name="kind" defaultValue="accrual">{Object.entries(adjustmentKinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="aj-date">Entry date</FieldLabel><Input id="aj-date" type="date" name="entryDate" required /></Field>
        </div>
        <Field><FieldLabel htmlFor="aj-desc">Description</FieldLabel><Input id="aj-desc" name="description" required minLength={3} maxLength={500} /></Field>
        <Field><FieldLabel htmlFor="aj-reason">Reason</FieldLabel><Textarea id="aj-reason" name="reason" required minLength={10} maxLength={2000} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="aj-ev">Evidence reference</FieldLabel><Input id="aj-ev" name="evidenceReference" required minLength={3} maxLength={300} placeholder="Document name or number" /></Field>
          <Field><FieldLabel htmlFor="aj-ref">Reference (optional)</FieldLabel><Input id="aj-ref" name="reference" maxLength={100} /></Field>
        </div>
        <Field><FieldLabel htmlFor="aj-rev">Reverse automatically on (optional)</FieldLabel><Input id="aj-rev" type="date" name="autoReverseOn" /><FieldDescription>For accruals and similar entries that reverse at the start of the next period.</FieldDescription></Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Lines</legend>
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <NativeSelect aria-label={`Line ${i + 1} account`} value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })}><option value="">Account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</NativeSelect>
              <Input aria-label={`Line ${i + 1} debit`} inputMode="decimal" placeholder="Debit" value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
              <Input aria-label={`Line ${i + 1} credit`} inputMode="decimal" placeholder="Credit" value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2Icon aria-hidden /></Button>
              <Input aria-label={`Line ${i + 1} description`} placeholder="Line description (optional)" className="sm:col-span-2" value={l.description} onChange={(e) => set(i, { description: e.target.value })} />
              <NativeSelect aria-label={`Line ${i + 1} division`} value={l.division} onChange={(e) => set(i, { division: e.target.value })}><option value="">No division</option>{divisions.map((d) => <option key={d} value={d}>{d}</option>)}</NativeSelect>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setLines((ls) => [...ls, blank()])}><PlusIcon aria-hidden data-icon="inline-start" />Add line</Button>
          <p className={dr === cr && dr > 0 ? "text-sm text-muted-foreground" : "text-sm text-warning"} aria-live="polite">Debits {(dr / 100).toFixed(2)} · Credits {(cr / 100).toFixed(2)}{dr !== cr ? " · not balanced" : ""}</p>
        </fieldset>
      </FieldGroup>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Period close
// ---------------------------------------------------------------------------------------------

export function EvidenceForm({ closeId, items }: { closeId: string; items: string[] }) {
  const [state, action, pending] = useActionState(addCloseEvidence, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog variant="outline" trigger="Record evidence" title="Record close evidence" description="Say what was checked and where the evidence is kept. Evidence records cannot be edited or deleted." state={state} action={action} pending={pending} submitLabel="Record">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="closeId" value={closeId} />
      <FieldGroup>
        <Field><FieldLabel htmlFor="ev-item">Item</FieldLabel><Input id="ev-item" name="item" required minLength={3} maxLength={120} list="ev-items" /><datalist id="ev-items">{items.map((i) => <option key={i} value={i} />)}</datalist></Field>
        <Field><FieldLabel htmlFor="ev-ref">Where it is kept</FieldLabel><Input id="ev-ref" name="reference" required minLength={3} maxLength={300} placeholder="Document name, folder or number" /></Field>
        <Field><FieldLabel htmlFor="ev-note">Note (optional)</FieldLabel><Textarea id="ev-note" name="note" maxLength={2000} /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

export function ExceptionForm({ closeId, failing }: { closeId: string; failing: string[] }) {
  const [state, action, pending] = useActionState(raiseCloseException, initial);
  const [key] = useState(newKey);
  if (!failing.length) return null;
  return (
    <FormDialog variant="outline" trigger="Raise exception" title="Raise a close exception" description="An exception lets a failed check stand, with an explanation, once a different person with close approval authority accepts it." state={state} action={action} pending={pending} submitLabel="Raise">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="closeId" value={closeId} />
      <FieldGroup>
        <Field><FieldLabel htmlFor="ex-check">Check</FieldLabel><NativeSelect wrapperClassName="w-full" id="ex-check" name="checkKey">{failing.map((k) => <option key={k} value={k}>{closeCheckLabels[k] ?? k}</option>)}</NativeSelect></Field>
        <Field><FieldLabel htmlFor="ex-exp">Explanation</FieldLabel><Textarea id="ex-exp" name="explanation" required minLength={20} maxLength={2000} /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

export function AssignReviewer({ closeId, version, staff, current, exclude }: { closeId: string; version: number; staff: { id: string; name: string }[]; current: string | null; exclude: string[] }) {
  const [state, action, pending] = useActionState(assignCloseReviewer, initial);
  const [key] = useState(newKey);
  if (state.ok) return <p role="status" className="text-sm">{state.message}</p>;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" aria-label="Assign reviewer">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="id" value={closeId} />
      <input type="hidden" name="version" value={version} />
      <label className="flex flex-col gap-1 text-sm">Assigned reviewer
        <NativeSelect name="reviewerId" defaultValue={current ?? ""}><option value="">Anyone with close approval authority</option>{staff.filter((s) => !exclude.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
      </label>
      <Button type="submit" variant="outline" size="sm" loading={pending}>Save</Button>
      <Message state={state} />
    </form>
  );
}

export function PrepareYearEnd({ fiscalYear, sets }: { fiscalYear: number; sets: { id: string; period_start: string; period_end: string }[] }) {
  const [state, action, pending] = useActionState(prepareYearEnd, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog trigger="Prepare year-end" title={`Prepare year-end FY${fiscalYear}`} description="Builds the closing entries (every income and expense balance to retained earnings) and submits them. A different person approves; approval posts them and closes the final period in one step." state={state} action={action} pending={pending} submitLabel="Prepare">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="fiscalYear" value={fiscalYear} />
      <FieldGroup>
        <Field><FieldLabel htmlFor="ye-set">Approved annual statements</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="ye-set" name="statementSetId" required defaultValue={sets[0]?.id ?? ""}>
            <option value="" disabled>{sets.length ? "Choose" : "No current approved annual statements"}</option>
            {sets.map((s) => <option key={s.id} value={s.id}>{s.period_start} – {s.period_end}</option>)}
          </NativeSelect>
        </Field>
        <Field><FieldLabel htmlFor="ye-note">Note (optional)</FieldLabel><Textarea id="ye-note" name="note" maxLength={2000} /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

export function ReopenYearEnd({ id }: { id: string }) {
  const [state, action, pending] = useActionState(reopenYearEnd, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog variant="destructive" trigger="Reopen year" title="Reopen the financial year" description="Reverses the closing entries (both entries stay in the ledger), reopens the final period and allows a new year-end. The reason is recorded." state={state} action={action} pending={pending} submitLabel="Reopen year">
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="id" value={id} />
      <Field><FieldLabel htmlFor="yr-note">Reason</FieldLabel><Textarea id="yr-note" name="note" required minLength={10} maxLength={2000} /></Field>
    </FormDialog>
  );
}
