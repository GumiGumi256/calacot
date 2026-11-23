"use client";
import { useActionState, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import {
  createComputation, proposeTaxObligation, proposeTaxRule, recordAssessment, recordFiling, recordTaxPayment, saveComputation,
} from "@/lib/tax/actions";
import {
  adjustmentKinds, adjustmentLabels, assessmentKindLabels, creditLabels, filingKindLabels, paymentKindLabels, registrationLabels, registrationStatuses,
  ruleKindLabels, ruleKinds, ruleParameterHelp, taxTypeLabels, taxTypes, operableTaxTypes,
} from "@/lib/tax/catalog";
import { FormDialog, initial } from "@/components/accounting/admin-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";

const newKey = () => crypto.randomUUID();
type Doc = { id: string; name: string };
type Account = { id: string; code: string; name: string; account_type: string; is_contra: boolean };

/** Evidence must already be uploaded under Documents (private storage, verification and audit apply). */
export function EvidenceSelect({ documents, name = "evidenceDocumentId", label = "Supporting evidence", required = true }: { documents: Doc[]; name?: string; label?: string; required?: boolean }) {
  return (
    <Field>
      <FieldLabel htmlFor={`ev-${name}`}>{label}</FieldLabel>
      <NativeSelect wrapperClassName="w-full" id={`ev-${name}`} name={name} required={required} defaultValue="">
        <option value="" disabled={required}>{documents.length ? (required ? "Choose a document" : "None") : "No documents uploaded yet"}</option>
        {documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </NativeSelect>
      <FieldDescription>Upload the certificate, notice, return or slip under Documents first, then choose it here.</FieldDescription>
    </Field>
  );
}

export function ProposeRule({ documents }: { documents: Doc[] }) {
  const [state, action, pending] = useActionState(proposeTaxRule, initial);
  const [key] = useState(newKey);
  const [kind, setKind] = useState<(typeof ruleKinds)[number]>("income_tax_rate");
  return (
    <FormDialog variant="outline" trigger="Propose tax rule" title="Propose a tax rule version" description="A rate or band exists only as an approved, evidenced rule with an effective date. Nothing is assumed or hardcoded. A different person must approve it." state={state} action={action} pending={pending} submitLabel="Propose">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="tr-code">Rule code</FieldLabel><Input id="tr-code" name="ruleCode" required pattern="[a-z0-9][a-z0-9_.\-]{2,59}" placeholder="cit-resident-company" /></Field>
          <Field>
            <FieldLabel htmlFor="tr-kind">Type</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="tr-kind" name="ruleKind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>{ruleKinds.map((k) => <option key={k} value={k}>{ruleKindLabels[k]}</option>)}</NativeSelect>
          </Field>
        </div>
        <Field><FieldLabel htmlFor="tr-desc">Description</FieldLabel><Input id="tr-desc" name="description" required minLength={5} maxLength={500} /></Field>
        <Field><FieldLabel htmlFor="tr-params">Parameters (JSON)</FieldLabel><Textarea id="tr-params" name="parameters" required rows={3} className="font-mono text-xs" /><FieldDescription>{ruleParameterHelp[kind]}</FieldDescription></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="tr-from">Effective from</FieldLabel><Input id="tr-from" type="date" name="effectiveFrom" required /></Field>
          <Field><FieldLabel htmlFor="tr-to">Effective to (optional)</FieldLabel><Input id="tr-to" type="date" name="effectiveTo" /></Field>
        </div>
        <Field><FieldLabel htmlFor="tr-basis">Legal basis</FieldLabel><Textarea id="tr-basis" name="legalBasis" required minLength={5} maxLength={1000} placeholder="Act, section and the accountant's confirmation" /></Field>
        <EvidenceSelect documents={documents} />
      </FieldGroup>
    </FormDialog>
  );
}

type DeadlineDraft = { event: string; label: string; anchor: "period_end" | "year_start"; monthsOffset: string; day: string; filing: boolean; payment: boolean };
export function ProposeObligation({ documents, accounts, initialCode }: { documents: Doc[]; accounts: Account[]; initialCode?: { code: string; taxType: string; name: string } }) {
  const [state, action, pending] = useActionState(proposeTaxObligation, initial);
  const [key] = useState(newKey);
  const [taxType, setTaxType] = useState(initialCode?.taxType ?? "corporate_income_tax");
  const [status, setStatus] = useState("pending_verification");
  const [enabled, setEnabled] = useState(false);
  const [deadlines, setDeadlines] = useState<DeadlineDraft[]>([]);
  const operable = operableTaxTypes.has(taxType);
  const set = (i: number, patch: Partial<DeadlineDraft>) => setDeadlines((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const payload = deadlines.map((d) => ({ ...d, monthsOffset: Number(d.monthsOffset || 0), day: d.day === "last" ? "last" : Number(d.day || 1) }));
  return (
    <FormDialog trigger={initialCode ? "Propose new version" : <><PlusIcon data-icon="inline-start" />Propose obligation</>} variant={initialCode ? "outline" : "default"} title={initialCode ? `New version of ${initialCode.name}` : "Propose a tax obligation"}
      description="Records Calacot's registration status and how the tax is filed and paid. It changes nothing until a different person with tax approval authority approves it, and only corporate income tax can be operational at present."
      state={state} action={action} pending={pending} submitLabel="Propose">
      <input type="hidden" name="key" value={key} /><input type="hidden" name="deadlineRules" value={JSON.stringify(payload)} /><input type="hidden" name="processingEnabled" value={String(enabled && operable)} />
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="ob-code">Code</FieldLabel><Input id="ob-code" name="code" required defaultValue={initialCode?.code} readOnly={!!initialCode} pattern="[a-z0-9][a-z0-9_\-]{2,39}" placeholder="cit" /></Field>
          <Field>
            <FieldLabel htmlFor="ob-type">Tax type</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="ob-type" name="taxType" value={taxType} onChange={(e) => setTaxType(e.target.value)} disabled={!!initialCode}>{taxTypes.map((t) => <option key={t} value={t}>{taxTypeLabels[t]}</option>)}</NativeSelect>
            {initialCode && <input type="hidden" name="taxType" value={taxType} />}
          </Field>
        </div>
        <Field><FieldLabel htmlFor="ob-name">Name</FieldLabel><Input id="ob-name" name="name" required defaultValue={initialCode?.name} maxLength={120} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ob-status">Registration status</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="ob-status" name="registrationStatus" value={status} onChange={(e) => setStatus(e.target.value)}>{registrationStatuses.map((s) => <option key={s} value={s}>{registrationLabels[s]}</option>)}</NativeSelect>
            <FieldDescription>Every status except &ldquo;pending verification&rdquo; needs evidence.</FieldDescription>
          </Field>
          <Field><FieldLabel htmlFor="ob-tin">Taxpayer TIN (optional)</FieldLabel><Input id="ob-tin" name="taxpayerTin" inputMode="numeric" pattern="[0-9]{6,15}" /></Field>
        </div>
        <Field><FieldLabel htmlFor="ob-payer">Taxpayer (legal entity)</FieldLabel><Input id="ob-payer" name="taxpayerName" required maxLength={200} placeholder="Calacot Group Uganda Ltd" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="ob-from">Effective from</FieldLabel><Input id="ob-from" type="date" name="effectiveFrom" required /></Field>
          <Field><FieldLabel htmlFor="ob-to">Effective to (optional)</FieldLabel><Input id="ob-to" type="date" name="effectiveTo" /></Field>
          <Field>
            <FieldLabel htmlFor="ob-basis">Tax period</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="ob-basis" name="periodBasis" defaultValue="accounting_year"><option value="accounting_year">Approved accounting year</option><option value="calendar_month">Calendar month</option><option value="calendar_quarter">Calendar quarter</option></NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="ob-freq">Filing frequency</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="ob-freq" name="filingFrequency" defaultValue="annual">{["annual", "semi_annual", "quarterly", "monthly", "none"].map((f) => <option key={f} value={f}>{f.replace("_", "-")}</option>)}</NativeSelect>
          </Field>
        </div>
        <Field><FieldLabel htmlFor="ob-legal">Legal basis</FieldLabel><Textarea id="ob-legal" name="legalBasis" required minLength={5} maxLength={1000} /></Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Filing and payment deadlines</legend>
          {deadlines.map((d, i) => (
            <div key={i} className="grid gap-2 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-2 sm:grid-cols-2">
              <Input aria-label={`Deadline ${i + 1} label`} placeholder="Label, e.g. Final return" value={d.label} onChange={(e) => set(i, { label: e.target.value })} />
              <Input aria-label={`Deadline ${i + 1} event code`} placeholder="event_code, e.g. final_return" value={d.event} onChange={(e) => set(i, { event: e.target.value })} />
              <NativeSelect wrapperClassName="w-full" aria-label={`Deadline ${i + 1} counted from`} value={d.anchor} onChange={(e) => set(i, { anchor: e.target.value as DeadlineDraft["anchor"] })}><option value="year_start">Months from year start</option><option value="period_end">Months after period end</option></NativeSelect>
              <div className="flex gap-2">
                <Input aria-label={`Deadline ${i + 1} months`} inputMode="numeric" placeholder="Months" value={d.monthsOffset} onChange={(e) => set(i, { monthsOffset: e.target.value })} />
                <Input aria-label={`Deadline ${i + 1} day`} placeholder="Day or last" value={d.day} onChange={(e) => set(i, { day: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.filing} onChange={(e) => set(i, { filing: e.target.checked })} />Return to file</label>
              <div className="flex items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.payment} onChange={(e) => set(i, { payment: e.target.checked })} />Payment due</label>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove deadline ${i + 1}`} onClick={() => setDeadlines((x) => x.filter((_, j) => j !== i))}><Trash2Icon /></Button></div>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setDeadlines((x) => [...x, { event: "", label: "", anchor: "period_end", monthsOffset: "6", day: "last", filing: true, payment: true }])}><PlusIcon data-icon="inline-start" />Add deadline</Button>
          <FieldDescription>Enter only deadlines confirmed by the accountant. Dates are calculated from the approved accounting year.</FieldDescription>
        </fieldset>
        {operable && (
          <>
            <Field><FieldLabel htmlFor="ob-rule">Calculation rule code</FieldLabel><Input id="ob-rule" name="calculationRuleCode" placeholder="cit-resident-company" /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              {([["expenseAccountId", "Tax expense", (a: Account) => ["other_expense", "operating_expense"].includes(a.account_type)], ["liabilityAccountId", "Tax payable", (a: Account) => a.account_type === "liability"], ["prepaymentAccountId", "Prepaid tax (optional)", (a: Account) => a.account_type === "asset" && !a.is_contra]] as const).map(([n, l, f]) => (
                <Field key={n}><FieldLabel htmlFor={`ob-${n}`}>{l}</FieldLabel>
                  <NativeSelect wrapperClassName="w-full" id={`ob-${n}`} name={n} defaultValue=""><option value="">None</option>{accounts.filter(f).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</NativeSelect></Field>
              ))}
            </div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /><span><span className="font-medium">Enable processing</span><span className="block text-muted-foreground">Allows computations, provisions and payments once approved. Needs a registered or applicable status, evidence, an approved rule and both tax accounts.</span></span></label>
          </>
        )}
        {!operable && <p className="text-sm text-muted-foreground">{taxTypeLabels[taxType]} cannot be made operational in this phase. Record the registration status and evidence only.</p>}
        <EvidenceSelect documents={documents} required={status !== "pending_verification"} />
        <Field><FieldLabel htmlFor="ob-note">Note</FieldLabel><Textarea id="ob-note" name="note" maxLength={2000} /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

export function NewComputation({ obligations, years }: { obligations: { code: string; name: string }[]; years: { fiscal_year: number }[] }) {
  const [state, action, pending] = useActionState(createComputation, initial);
  const [key] = useState(newKey);
  const [kind, setKind] = useState("final");
  return (
    <FormDialog trigger={<><PlusIcon data-icon="inline-start" />New computation</>} title="Start an income-tax computation" description="Final and amended computations start from the posted ledger for the approved accounting year. A provisional computation uses your estimate of chargeable profit." state={state} action={action} pending={pending} submitLabel="Start">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <Field><FieldLabel htmlFor="nc-ob">Obligation</FieldLabel><NativeSelect wrapperClassName="w-full" id="nc-ob" name="obligationCode" required>{obligations.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}</NativeSelect></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="nc-year">Financial year</FieldLabel><NativeSelect wrapperClassName="w-full" id="nc-year" name="fiscalYear" required>{years.map((y) => <option key={y.fiscal_year} value={y.fiscal_year}>{y.fiscal_year}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="nc-kind">Kind</FieldLabel><NativeSelect wrapperClassName="w-full" id="nc-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}><option value="provisional">Provisional estimate</option><option value="final">Final computation</option><option value="amended">Amended computation</option></NativeSelect></Field>
        </div>
        {kind === "provisional" && <Field><FieldLabel htmlFor="nc-est">Estimated chargeable profit</FieldLabel><Input id="nc-est" name="estimatedProfit" required inputMode="decimal" pattern="-?\d{1,15}(\.\d{1,2})?" /></Field>}
        <Field><FieldLabel htmlFor="nc-note">Note</FieldLabel><Textarea id="nc-note" name="note" maxLength={2000} /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

type AdjDraft = { kind: string; description: string; amount: string; evidenceDocumentId: string };
type CreditDraft = { kind: string; certificateReference: string; counterparty: string; amount: string; evidenceDocumentId: string };
export function ScheduleEditor({ id, version, documents, adjustments, credits, lossBroughtForward, estimatedProfit, provisional }: {
  id: string; version: number; documents: Doc[]; adjustments: AdjDraft[]; credits: CreditDraft[]; lossBroughtForward: string; estimatedProfit: string | null; provisional: boolean;
}) {
  const [state, action, pending] = useActionState(saveComputation, initial);
  const [key] = useState(newKey);
  const [adj, setAdj] = useState<AdjDraft[]>(adjustments);
  const [cr, setCr] = useState<CreditDraft[]>(credits);
  return (
    <FormDialog variant="outline" trigger="Edit adjustments and credits" title="Taxable-income schedules" description="Adjustments turn accounting profit into chargeable income. Credits reduce the tax payable and need certificate evidence. Depreciation add-backs and capital allowances come from Import schedules." state={state} action={action} pending={pending} submitLabel="Save schedules">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={version} /><input type="hidden" name="key" value={key} />
      <input type="hidden" name="adjustments" value={JSON.stringify(adj)} /><input type="hidden" name="credits" value={JSON.stringify(cr)} />
      <FieldGroup>
        {provisional && <Field><FieldLabel htmlFor="se-est">Estimated chargeable profit</FieldLabel><Input id="se-est" name="estimatedProfit" defaultValue={estimatedProfit ?? ""} inputMode="decimal" /></Field>}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Adjustments</legend>
          {adj.map((a, i) => (
            <div key={i} className="grid gap-2 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
              <NativeSelect wrapperClassName="w-full" aria-label={`Adjustment ${i + 1} type`} value={a.kind} onChange={(e) => setAdj((x) => x.map((y, j) => j === i ? { ...y, kind: e.target.value } : y))}>{adjustmentKinds.map((k) => <option key={k} value={k}>{adjustmentLabels[k]}</option>)}</NativeSelect>
              <Input aria-label={`Adjustment ${i + 1} description`} placeholder="Description" value={a.description} onChange={(e) => setAdj((x) => x.map((y, j) => j === i ? { ...y, description: e.target.value } : y))} />
              <Input aria-label={`Adjustment ${i + 1} amount`} inputMode="decimal" placeholder="Amount" value={a.amount} onChange={(e) => setAdj((x) => x.map((y, j) => j === i ? { ...y, amount: e.target.value } : y))} />
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove adjustment ${i + 1}`} onClick={() => setAdj((x) => x.filter((_, j) => j !== i))}><Trash2Icon /></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setAdj((x) => [...x, { kind: "non_deductible", description: "", amount: "", evidenceDocumentId: "" }])}><PlusIcon data-icon="inline-start" />Add adjustment</Button>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Credits</legend>
          {cr.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-2 sm:grid-cols-2">
              <NativeSelect wrapperClassName="w-full" aria-label={`Credit ${i + 1} type`} value={c.kind} onChange={(e) => setCr((x) => x.map((y, j) => j === i ? { ...y, kind: e.target.value } : y))}>{Object.entries(creditLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect>
              <Input aria-label={`Credit ${i + 1} certificate`} placeholder="Certificate reference" value={c.certificateReference} onChange={(e) => setCr((x) => x.map((y, j) => j === i ? { ...y, certificateReference: e.target.value } : y))} />
              <Input aria-label={`Credit ${i + 1} counterparty`} placeholder="Issued by (customer)" value={c.counterparty} onChange={(e) => setCr((x) => x.map((y, j) => j === i ? { ...y, counterparty: e.target.value } : y))} />
              <Input aria-label={`Credit ${i + 1} amount`} inputMode="decimal" placeholder="Amount" value={c.amount} onChange={(e) => setCr((x) => x.map((y, j) => j === i ? { ...y, amount: e.target.value } : y))} />
              <NativeSelect wrapperClassName="w-full sm:col-span-2" aria-label={`Credit ${i + 1} evidence`} value={c.evidenceDocumentId} onChange={(e) => setCr((x) => x.map((y, j) => j === i ? { ...y, evidenceDocumentId: e.target.value } : y))}>
                <option value="">Certificate document (required)</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </NativeSelect>
              <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setCr((x) => x.filter((_, j) => j !== i))}><Trash2Icon data-icon="inline-start" />Remove</Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setCr((x) => [...x, { kind: "withholding_credit", certificateReference: "", counterparty: "", amount: "", evidenceDocumentId: "" }])}><PlusIcon data-icon="inline-start" />Add credit</Button>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="se-loss">Tax loss brought forward</FieldLabel><Input id="se-loss" name="lossBroughtForward" defaultValue={lossBroughtForward === "0.00" ? "" : lossBroughtForward} inputMode="decimal" /><FieldDescription>Only where permitted, with the earlier assessment or computation as evidence.</FieldDescription></Field>
          <EvidenceSelect documents={documents} name="lossEvidenceDocumentId" label="Loss evidence" required={false} />
        </div>
      </FieldGroup>
    </FormDialog>
  );
}

type Obligation = { code: string; name: string; registration_status: string; processing_enabled: boolean };
const ObligationSelect = ({ obligations, id }: { obligations: Obligation[]; id: string }) => (
  <Field><FieldLabel htmlFor={id}>Obligation</FieldLabel><NativeSelect wrapperClassName="w-full" id={id} name="obligationCode" required>{obligations.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}</NativeSelect></Field>
);
const YearSelect = ({ years, id }: { years: { fiscal_year: number }[]; id: string }) => (
  <Field><FieldLabel htmlFor={id}>Financial year</FieldLabel><NativeSelect wrapperClassName="w-full" id={id} name="fiscalYear" required>{years.map((y) => <option key={y.fiscal_year} value={y.fiscal_year}>{y.fiscal_year}</option>)}</NativeSelect></Field>
);

export function RecordFiling({ obligations, years, documents, computations, today }: { obligations: Obligation[]; years: { fiscal_year: number }[]; documents: Doc[]; computations: { id: string; obligation_code: string; fiscal_year: number; kind: string }[]; today: string }) {
  const [state, action, pending] = useActionState(recordFiling, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog variant="outline" trigger="Record filing" title="Record a filed return" description="Record a return that was actually filed with URA, with its acknowledgement as evidence. This does not submit anything to URA and does not record a payment." state={state} action={action} pending={pending} submitLabel="Record filing">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <ObligationSelect obligations={obligations.filter((o) => ["registered", "applicable"].includes(o.registration_status))} id="rf-ob" />
        <div className="grid gap-3 sm:grid-cols-2"><YearSelect years={years} id="rf-y" />
          <Field><FieldLabel htmlFor="rf-kind">Return</FieldLabel><NativeSelect wrapperClassName="w-full" id="rf-kind" name="kind">{Object.entries(filingKindLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="rf-date">Filed on</FieldLabel><Input id="rf-date" type="date" name="filedOn" required max={today} /></Field>
          <Field><FieldLabel htmlFor="rf-ref">Return reference</FieldLabel><Input id="rf-ref" name="filingReference" required maxLength={100} /></Field>
        </div>
        <Field><FieldLabel htmlFor="rf-ack">Acknowledgement reference</FieldLabel><Input id="rf-ack" name="acknowledgementReference" maxLength={100} /></Field>
        <Field><FieldLabel htmlFor="rf-comp">Approved computation (optional)</FieldLabel><NativeSelect wrapperClassName="w-full" id="rf-comp" name="computationId" defaultValue=""><option value="">None</option>{computations.map((c) => <option key={c.id} value={c.id}>{c.obligation_code} {c.fiscal_year} {c.kind}</option>)}</NativeSelect></Field>
        <EvidenceSelect documents={documents} label="Return and acknowledgement" />
      </FieldGroup>
    </FormDialog>
  );
}

export function RecordAssessment({ obligations, years, documents, assessments, today }: { obligations: Obligation[]; years: { fiscal_year: number }[]; documents: Doc[]; assessments: { id: string; assessment_reference: string; fiscal_year: number }[]; today: string }) {
  const [state, action, pending] = useActionState(recordAssessment, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog variant="outline" trigger="Record assessment" title="Record a URA assessment" description="Assessments are kept forever. A correction (amended assessment or objection decision) supersedes an earlier one rather than changing it." state={state} action={action} pending={pending} submitLabel="Record">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <ObligationSelect obligations={obligations} id="ra-ob" />
        <div className="grid gap-3 sm:grid-cols-2"><YearSelect years={years} id="ra-y" />
          <Field><FieldLabel htmlFor="ra-kind">Type</FieldLabel><NativeSelect wrapperClassName="w-full" id="ra-kind" name="kind">{Object.entries(assessmentKindLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="ra-ref">Assessment reference</FieldLabel><Input id="ra-ref" name="assessmentReference" required maxLength={100} /></Field>
          <Field><FieldLabel htmlFor="ra-date">Assessed on</FieldLabel><Input id="ra-date" type="date" name="assessedOn" required max={today} /></Field>
          <Field><FieldLabel htmlFor="ra-amt">Amount</FieldLabel><Input id="ra-amt" name="amount" required inputMode="decimal" pattern="\d{1,15}(\.\d{1,2})?" /></Field>
          <Field><FieldLabel htmlFor="ra-sup">Supersedes</FieldLabel><NativeSelect wrapperClassName="w-full" id="ra-sup" name="supersedesId" defaultValue=""><option value="">Nothing</option>{assessments.map((a) => <option key={a.id} value={a.id}>{a.assessment_reference} ({a.fiscal_year})</option>)}</NativeSelect></Field>
        </div>
        <EvidenceSelect documents={documents} label="Assessment notice" />
        <Field><FieldLabel htmlFor="ra-note">Note</FieldLabel><Textarea id="ra-note" name="note" maxLength={2000} /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

export function RecordPayment({ obligations, years, documents, accounts, today }: { obligations: Obligation[]; years: { fiscal_year: number }[]; documents: Doc[]; accounts: { id: string; label: string; currency: string; identifier: string }[]; today: string }) {
  const [state, action, pending] = useActionState(recordTaxPayment, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog trigger={<><PlusIcon data-icon="inline-start" />Record tax payment</>} title="Record a tax payment already made" description="Record money actually paid to URA, identified by its PRN. A journal is prepared for a second person to approve; nothing is transferred from here. The same PRN cannot be recorded twice." state={state} action={action} pending={pending} submitLabel="Record payment">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <ObligationSelect obligations={obligations.filter((o) => o.processing_enabled)} id="rp-ob" />
        <div className="grid gap-3 sm:grid-cols-2"><YearSelect years={years} id="rp-y" />
          <Field><FieldLabel htmlFor="rp-kind">Payment for</FieldLabel><NativeSelect wrapperClassName="w-full" id="rp-kind" name="kind">{Object.entries(paymentKindLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="rp-amt">Amount</FieldLabel><Input id="rp-amt" name="amount" required inputMode="decimal" pattern="\d{1,15}(\.\d{1,2})?" /></Field>
          <Field><FieldLabel htmlFor="rp-date">Paid on</FieldLabel><Input id="rp-date" type="date" name="paidOn" required max={today} /></Field>
          <Field><FieldLabel htmlFor="rp-prn">PRN</FieldLabel><Input id="rp-prn" name="prn" required maxLength={40} /></Field>
          <Field><FieldLabel htmlFor="rp-acct">Paid from</FieldLabel><NativeSelect wrapperClassName="w-full" id="rp-acct" name="bankingAccountId" required>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label} {a.identifier} ({a.currency})</option>)}</NativeSelect></Field>
        </div>
        <EvidenceSelect documents={documents} label="Payment slip and bank evidence" />
      </FieldGroup>
    </FormDialog>
  );
}
