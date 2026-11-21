"use client";
import { useActionState, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import {
  backfillIntegration, decideIntegrationStage, decideMapping, integrationEventCommand, processIntegrationQueue, proposeIntegrationStage, proposeMapping,
} from "@/lib/accounting/integration-actions";
import { conditionLabels, conditionValues, mappableEvents, stageInfo } from "@/lib/accounting/integration-catalog";
import { FormDialog, Message, initial } from "@/components/accounting/admin-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";

const divisions = conditionValues.division as readonly string[];

// ---------------------------------------------------------------------------------------------
// Rollout stage
// ---------------------------------------------------------------------------------------------

export function ProposeStage({ requestKey, current, testDatabase }: { requestKey: string; current: { stage: string; control_accounts: Record<string, string> } | null; testDatabase: boolean }) {
  const [state, action, pending] = useActionState(proposeIntegrationStage, initial);
  const [stage, setStage] = useState(current?.stage === "isolated_test" && !testDatabase ? "shadow" : current?.stage ?? "shadow");
  const c = current?.control_accounts ?? { receivables: "1200", unallocatedReceipts: "2140", payables: "2110", outputTax: "" };
  return (
    <FormDialog trigger="Propose stage change" title="Propose an integration stage" description="A second person with policy-approval authority must approve the change. Real production posting is not available in this phase." state={state} action={action} pending={pending} submitLabel="Propose">
      <input type="hidden" name="key" value={requestKey} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="stage">Stage</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="stage" name="stage" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="disabled">{stageInfo.disabled.label}</option>
            <option value="shadow">{stageInfo.shadow.label}</option>
            <option value="isolated_test" disabled={!testDatabase}>{stageInfo.isolated_test.label}{testDatabase ? "" : " (test databases only)"}</option>
          </NativeSelect>
          <FieldDescription>{stageInfo[stage as keyof typeof stageInfo]?.summary}</FieldDescription>
        </Field>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Control accounts for reconciliation (account codes)</legend>
          {([["receivables", "Receivables"], ["unallocatedReceipts", "Unallocated receipts"], ["payables", "Payables"], ["outputTax", "Output tax"]] as const).map(([k, label]) => (
            <Field key={k}><FieldLabel htmlFor={`ctl-${k}`}>{label}</FieldLabel><Input id={`ctl-${k}`} name={k} defaultValue={c[k] ?? ""} inputMode="numeric" pattern="[0-9]{3,8}(-[0-9A-Za-z]{1,6})?" /></Field>
          ))}
        </fieldset>
        <Field><FieldLabel htmlFor="stage-note">Basis for the change</FieldLabel><Textarea id="stage-note" name="note" required minLength={5} maxLength={2000} placeholder="For example: accountant asked for shadow reconciliation of September invoices." /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

function DecisionForm({ action, pending, state, id, requestKey, decisions, label }: {
  action: (d: FormData) => void; pending: boolean; state: { ok: boolean; message: string }; id: string; requestKey: string; decisions: ("approve" | "reject" | "retire")[]; label: string;
}) {
  const [note, setNote] = useState("");
  if (state.ok) return <p role="status" className="text-sm">{state.message}</p>;
  return (
    <form action={action} className="flex flex-col gap-2" aria-label={`Decide on ${label}`}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="key" value={requestKey} />
      <Textarea name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} placeholder="Decision note (required to reject or retire)" aria-label="Decision note" />
      <div className="flex flex-wrap gap-2">
        {decisions.map((d) => (
          <Button key={d} type="submit" name="decision" value={d} size="sm" variant={d === "approve" ? "default" : "outline"} loading={pending}>
            {{ approve: "Approve", reject: "Reject", retire: "Retire" }[d]}
          </Button>
        ))}
      </div>
      <Message state={state} />
    </form>
  );
}

export function DecideStage({ id, requestKey, label }: { id: string; requestKey: string; label: string }) {
  const [state, action, pending] = useActionState(decideIntegrationStage, initial);
  return <DecisionForm action={action} pending={pending} state={state} id={id} requestKey={requestKey} decisions={["approve", "reject"]} label={label} />;
}

export function DecideMapping({ id, requestKey, status, label }: { id: string; requestKey: string; status: string; label: string }) {
  const [state, action, pending] = useActionState(decideMapping, initial);
  return <DecisionForm action={action} pending={pending} state={state} id={id} requestKey={requestKey} decisions={status === "approved" ? ["retire"] : ["approve", "reject"]} label={label} />;
}

// ---------------------------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------------------------

type DraftLine = { side: "debit" | "credit"; amount: string; mode: "code" | "division"; code: string; byDivision: Record<string, string>; fallback: string; memo: string };
const blankLine = (side: "debit" | "credit", amount: string): DraftLine => ({ side, amount, mode: "code", code: "", byDivision: {}, fallback: "", memo: "" });

export function ProposeMapping({ requestKey, today, accounts }: { requestKey: string; today: string; accounts: { code: string; name: string; status: string }[] }) {
  const [state, action, pending] = useActionState(proposeMapping, initial);
  const [eventType, setEventType] = useState(mappableEvents[0].type);
  const ev = mappableEvents.find((e) => e.type === eventType) ?? mappableEvents[0];
  const [treatment, setTreatment] = useState<"journal" | "no_entry">("journal");
  const [conditions, setConditions] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<DraftLine[]>([blankLine("debit", ev.amountKeys[0]), blankLine("credit", ev.amountKeys[0])]);
  const change = (type: string) => {
    const next = mappableEvents.find((e) => e.type === type) ?? mappableEvents[0];
    setEventType(type); setConditions({});
    setLines([blankLine("debit", next.amountKeys[0]), blankLine("credit", next.amountKeys[0])]);
  };
  const update = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const payloadLines = lines.map((l) => ({
    side: l.side, amount: l.amount, ...(l.memo ? { memo: l.memo } : {}),
    account: l.mode === "code" ? { code: l.code.trim().toUpperCase() } : { byDivision: Object.fromEntries(Object.entries(l.byDivision).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim().toUpperCase()])), ...(l.fallback.trim() ? { fallback: l.fallback.trim().toUpperCase() } : {}) },
  }));
  return (
    <FormDialog trigger="Propose mapping" title="Propose an event mapping" description="Says which ledger accounts a business event posts to. It has no effect until a second authorized person approves it. Events that match no approved mapping go to the exception queue; nothing is guessed." state={state} action={action} pending={pending} submitLabel="Propose mapping">
      <input type="hidden" name="key" value={requestKey} />
      <input type="hidden" name="conditions" value={JSON.stringify(conditions)} />
      <input type="hidden" name="lines" value={JSON.stringify(payloadLines)} />
      <datalist id="mapping-accounts">{accounts.map((a) => <option key={a.code} value={a.code}>{a.name}{a.status === "active" ? "" : ` (${a.status})`}</option>)}</datalist>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="map-event">Business event</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="map-event" name="eventType" value={eventType} onChange={(e) => change(e.target.value)}>
            {mappableEvents.map((e) => <option key={e.type} value={e.type}>{e.label}</option>)}
          </NativeSelect>
          <FieldDescription>{ev.when}</FieldDescription>
        </Field>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">Conditions (leave empty to match any)</legend>
          {ev.conditionKeys.map((k) => {
            const values = conditionValues[k];
            return (
              <Field key={k}>
                <FieldLabel htmlFor={`cond-${k}`}>{conditionLabels[k] ?? k}</FieldLabel>
                {Array.isArray(values) ? (
                  <NativeSelect wrapperClassName="w-full" id={`cond-${k}`} value={conditions[k] ?? ""} onChange={(e) => setConditions((c) => ({ ...c, [k]: e.target.value }))}>
                    <option value="">Any</option>
                    {values.map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}
                  </NativeSelect>
                ) : <Input id={`cond-${k}`} value={conditions[k] ?? ""} maxLength={100} onChange={(e) => setConditions((c) => ({ ...c, [k]: e.target.value }))} placeholder="Any" />}
              </Field>
            );
          })}
        </fieldset>
        <Field>
          <FieldLabel htmlFor="map-treatment">Treatment</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="map-treatment" name="treatment" value={treatment} onChange={(e) => setTreatment(e.target.value as "journal" | "no_entry")}>
            <option value="journal">Post a journal</option>
            <option value="no_entry">No accounting entry (recorded decision)</option>
          </NativeSelect>
        </Field>
        {treatment === "journal" && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">Journal lines</legend>
            {lines.map((l, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[7rem_8rem_minmax(0,1fr)_auto]">
                  <NativeSelect aria-label={`Line ${i + 1} side`} value={l.side} onChange={(e) => update(i, { side: e.target.value as "debit" | "credit" })}><option value="debit">Debit</option><option value="credit">Credit</option></NativeSelect>
                  <NativeSelect aria-label={`Line ${i + 1} amount`} value={l.amount} onChange={(e) => update(i, { amount: e.target.value })}>{ev.amountKeys.map((a) => <option key={a} value={a}>{a}</option>)}</NativeSelect>
                  <NativeSelect aria-label={`Line ${i + 1} account choice`} value={l.mode} onChange={(e) => update(i, { mode: e.target.value as "code" | "division" })}><option value="code">One account</option><option value="division">Account per division</option></NativeSelect>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove line ${i + 1}`} disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2Icon aria-hidden /></Button>
                </div>
                {l.mode === "code" ? (
                  <Input aria-label={`Line ${i + 1} account code`} list="mapping-accounts" value={l.code} onChange={(e) => update(i, { code: e.target.value })} placeholder="Account code, e.g. 1200" />
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {divisions.map((d) => <Input key={d} aria-label={`Line ${i + 1} account for ${d}`} list="mapping-accounts" value={l.byDivision[d] ?? ""} onChange={(e) => update(i, { byDivision: { ...l.byDivision, [d]: e.target.value } })} placeholder={d} />)}
                    <Input aria-label={`Line ${i + 1} fallback account`} list="mapping-accounts" value={l.fallback} onChange={(e) => update(i, { fallback: e.target.value })} placeholder="Fallback (optional)" />
                  </div>
                )}
                <Input aria-label={`Line ${i + 1} memo`} value={l.memo} maxLength={200} onChange={(e) => update(i, { memo: e.target.value })} placeholder="Line memo (optional)" />
              </div>
            ))}
            {lines.length < 20 && <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setLines((ls) => [...ls, blankLine("credit", ev.amountKeys[0])])}><PlusIcon aria-hidden />Add line</Button>}
          </fieldset>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field><FieldLabel htmlFor="map-from">Effective from</FieldLabel><Input id="map-from" name="effectiveFrom" type="date" required defaultValue={today} /></Field>
          <Field><FieldLabel htmlFor="map-priority">Priority</FieldLabel><Input id="map-priority" name="priority" type="number" min={0} max={1000} defaultValue={0} /></Field>
          <Field><FieldLabel htmlFor="map-policy">Policy version</FieldLabel><Input id="map-policy" name="policyVersion" inputMode="numeric" pattern="[0-9]*" placeholder="Any" /></Field>
        </div>
        <Field><FieldLabel htmlFor="map-desc">Accounting basis</FieldLabel><Textarea id="map-desc" name="description" required minLength={5} maxLength={1000} placeholder="Which approved policy decision this implements, e.g. C1 revenue at invoice for design fees." /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Queue operations
// ---------------------------------------------------------------------------------------------

export function ProcessQueue({ requestKey, disabled }: { requestKey: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(processIntegrationQueue, initial);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="key" value={requestKey} /><input type="hidden" name="batch" value="100" />
      <Button type="submit" loading={pending} disabled={disabled}>Process waiting events</Button>
      <Message state={state} />
    </form>
  );
}

export function Backfill({ requestKey }: { requestKey: string }) {
  const [state, action, pending] = useActionState(backfillIntegration, initial);
  return (
    <FormDialog trigger="Capture historical records" variant="outline" title="Capture historical records" description="Creates an event for every existing issued invoice, credit note, confirmed payment, allocation, completed refund, approved expense and disbursement that does not have one yet. Nothing is posted by this step; events already captured are left unchanged." state={state} action={action} pending={pending} submitLabel="Capture">
      <input type="hidden" name="key" value={requestKey} />
    </FormDialog>
  );
}

export function RetryEvent({ eventId, requestKey }: { eventId: string; requestKey: string }) {
  const [state, action, pending] = useActionState(integrationEventCommand, initial);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="key" value={requestKey} /><input type="hidden" name="command" value="retry" />
      <Button type="submit" size="sm" loading={pending} disabled={state.ok}>Retry</Button>
      <Message state={state} />
    </form>
  );
}

export function RedateEvent({ eventId, requestKey, effectiveDate, openPeriods }: { eventId: string; requestKey: string; effectiveDate: string; openPeriods: { name: string; start_date: string; end_date: string }[] }) {
  const [state, action, pending] = useActionState(integrationEventCommand, initial);
  const first = openPeriods[0];
  const min = first && first.start_date > effectiveDate ? first.start_date : effectiveDate;
  return (
    <FormDialog trigger="Post in a later open period" variant="outline" title="Post in a later open period" description="The entry keeps its original source date on record and is posted in the open period you choose. It can only move forward, never back, and the reason is kept in the history." state={state} action={action} pending={pending} submitLabel="Re-date and queue">
      <input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="key" value={requestKey} /><input type="hidden" name="command" value="redate" />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="redate-date">Posting date</FieldLabel>
          <Input id="redate-date" name="postingDate" type="date" required min={min} defaultValue={min} />
          <FieldDescription>{openPeriods.length ? `Open periods: ${openPeriods.slice(0, 3).map((p) => p.name).join(", ")}${openPeriods.length > 3 ? "…" : ""}` : "No open period exists on or after the source date. Create the financial year first."}</FieldDescription>
        </Field>
        <Field><FieldLabel htmlFor="redate-reason">Reason</FieldLabel><Textarea id="redate-reason" name="reason" required minLength={5} maxLength={500} /></Field>
      </FieldGroup>
    </FormDialog>
  );
}
