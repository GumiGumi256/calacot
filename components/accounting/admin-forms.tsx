"use client";
import { useActionState, useState } from "react";
import {
  accountCommand, approveChart, decidePolicy, decideRate, generateFiscalYear, loadProposedChart, periodCommand, proposePolicy, proposeRate, saveAccount,
} from "@/lib/accounting/actions";
import { accountTypeLabels, accountTypes, normalBalanceFor, reportingClassLabels, reportingClasses, type AccountType } from "@/lib/accounting/engine";
import { monthNames } from "@/lib/accounting/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type State = { ok: boolean; message: string; id?: string };
export const initial: State = { ok: false, message: "" };
export function Message({ state }: { state: State }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p>;
}

/** Dialog shell that swaps the form for its success message, like the other finance dialogs. */
export function FormDialog({ trigger, title, description, state, children, action, submitLabel, pending, variant = "default" }: {
  trigger: React.ReactNode; title: string; description: string; state: State; children: React.ReactNode; action: (data: FormData) => void; submitLabel: string; pending: boolean; variant?: "default" | "outline" | "destructive";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant === "destructive" ? "outline" : variant} size={variant === "default" ? "default" : "sm"} />}>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {state.ok ? (
          <div className="flex flex-col gap-3"><p role="status" className="text-sm">{state.message}</p><DialogFooter><Button onClick={() => setOpen(false)}>Close</Button></DialogFooter></div>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            {children}
            <DialogFooter><Button type="submit" variant={variant === "destructive" ? "destructive" : "default"} loading={pending}>{submitLabel}</Button></DialogFooter>
            <Message state={state} />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------------------------

export type EditableAccount = { id: string; version: number; code: string; name: string; description: string | null; account_type: string; is_contra: boolean; reporting_class: string | null; parent_id: string | null; is_postable: boolean; manual_posting_allowed: boolean; currency: string | null; status: string };

export function AccountForm({ requestKey, parents, account }: { requestKey: string; parents: { id: string; code: string; name: string; account_type: string }[]; account?: EditableAccount }) {
  const [state, action, pending] = useActionState(saveAccount, initial);
  const [type, setType] = useState<AccountType>((account?.account_type as AccountType) ?? "operating_expense");
  const [contra, setContra] = useState(account?.is_contra ?? false);
  const [postable, setPostable] = useState(account?.is_postable ?? true);
  const locked = !!account && account.status !== "proposed";
  return (
    <FormDialog
      trigger={account ? "Edit account" : "Propose account"} variant={account ? "outline" : "default"}
      title={account ? `Edit ${account.code}` : "Propose an account"}
      description={locked ? "This account is approved: its code, type and position in the chart are fixed. You can change its name, description and reporting details." : "New accounts start as proposed. A second authorized person must approve them before they can receive postings."}
      state={state} action={action} pending={pending} submitLabel={account ? "Save changes" : "Propose account"}
    >
      <input type="hidden" name="key" value={requestKey} />
      {account && <><input type="hidden" name="id" value={account.id} /><input type="hidden" name="version" value={String(account.version)} /></>}
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <Field><FieldLabel htmlFor="acc-code">Code</FieldLabel><Input id="acc-code" name="code" required={!locked} disabled={locked} defaultValue={account?.code} pattern="[0-9]{3,8}(-[0-9A-Za-z]{1,6})?" inputMode="numeric" /></Field>
          <Field><FieldLabel htmlFor="acc-name">Name</FieldLabel><Input id="acc-name" name="name" required maxLength={120} defaultValue={account?.name} /></Field>
        </div>
        {!locked && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="acc-type">Account type</FieldLabel>
              <NativeSelect wrapperClassName="w-full" id="acc-type" name="accountType" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                {accountTypes.map((t) => <option key={t} value={t}>{accountTypeLabels[t]}</option>)}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="acc-parent">Parent (header) account</FieldLabel>
              <NativeSelect wrapperClassName="w-full" id="acc-parent" name="parentId" defaultValue={account?.parent_id ?? ""}>
                <option value="">None (top level)</option>
                {parents.filter((p) => p.account_type === type && p.id !== account?.id).map((p) => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
              </NativeSelect>
            </Field>
          </div>
        )}
        {locked && <input type="hidden" name="accountType" value={account.account_type} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="acc-class">Reporting classification</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="acc-class" name="reportingClass" defaultValue={account?.reporting_class ?? reportingClasses[type][0]} key={type}>
              {!postable && <option value="">None (header)</option>}
              {reportingClasses[type].map((c) => <option key={c} value={c}>{reportingClassLabels[c]}</option>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="acc-cur">Currency restriction</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="acc-cur" name="currency" defaultValue={account?.currency ?? ""}>
              <option value="">Any currency</option><option value="UGX">UGX only</option><option value="USD">USD only</option>
            </NativeSelect>
          </Field>
        </div>
        {!locked && (
          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-2 text-sm"><Checkbox name="isPostableBox" checked={!postable} onCheckedChange={(v) => setPostable(!v)} /><span>Header account (groups sub-accounts; cannot receive entries)</span></label>
            <input type="hidden" name="isPostable" value={String(postable)} />
            <label className="flex items-start gap-2 text-sm"><Checkbox name="isContraBox" checked={contra} onCheckedChange={(v) => setContra(!!v)} /><span>Contra account (normal balance is {normalBalanceFor(type, true)}, e.g. accumulated depreciation)</span></label>
            <input type="hidden" name="isContra" value={String(contra)} />
          </div>
        )}
        <ManualPostingField defaultValue={account?.manual_posting_allowed ?? true} />
        <p className="text-xs text-muted-foreground">Normal balance: <span className="font-medium">{normalBalanceFor(type, contra)}</span>.</p>
        <Field><FieldLabel htmlFor="acc-desc">Description (optional)</FieldLabel><Textarea id="acc-desc" name="description" maxLength={1000} defaultValue={account?.description ?? ""} /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

function ManualPostingField({ defaultValue }: { defaultValue: boolean }) {
  const [manual, setManual] = useState(defaultValue);
  return (
    <>
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={!manual} onCheckedChange={(v) => setManual(!v)} /><span>Control account: only sub-ledger postings (receivables, payables), never manual journals</span></label>
      <input type="hidden" name="manualPostingAllowed" value={String(manual)} />
    </>
  );
}

export function AccountCommand({ accountId, version, requestKey, command }: { accountId: string; version: number; requestKey: string; command: "activate" | "deactivate" | "reactivate" }) {
  const [state, action, pending] = useActionState(accountCommand, initial);
  if (command === "deactivate") {
    return (
      <FormDialog trigger="Deactivate" variant="destructive" title="Deactivate account" description="Only accounts with a zero posted balance and no journals awaiting approval can be deactivated. History stays visible." state={state} action={action} pending={pending} submitLabel="Deactivate account">
        <input type="hidden" name="accountId" value={accountId} /><input type="hidden" name="version" value={String(version)} /><input type="hidden" name="key" value={requestKey} /><input type="hidden" name="command" value="deactivate" />
        <Field><FieldLabel htmlFor="deact-note">Reason</FieldLabel><Textarea id="deact-note" name="note" required minLength={5} maxLength={2000} /></Field>
      </FormDialog>
    );
  }
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="accountId" value={accountId} /><input type="hidden" name="version" value={String(version)} /><input type="hidden" name="key" value={requestKey} /><input type="hidden" name="command" value={command} />
      <Button type="submit" size="sm" variant={command === "activate" ? "default" : "outline"} loading={pending}>{command === "activate" ? "Approve account" : "Reactivate"}</Button>
      <Message state={state} />
    </form>
  );
}

export function ChartControls({ requestKey, canLoad, canApprove, proposed, total }: { requestKey: string; canLoad: boolean; canApprove: boolean; proposed: number; total: number }) {
  const [loadState, loadAction, loading] = useActionState(loadProposedChart, initial);
  const [approveState, approveAction, approving] = useActionState(approveChart, initial);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canLoad && (
          <form action={loadAction}><input type="hidden" name="key" value={requestKey} /><Button type="submit" variant={total ? "outline" : "default"} loading={loading}>{total ? "Add missing proposed accounts" : "Load proposed Calacot chart"}</Button></form>
        )}
        {canApprove && proposed > 0 && !confirm && <Button variant="outline" onClick={() => setConfirm(true)}>Approve proposed accounts ({proposed})</Button>}
        {canApprove && proposed > 0 && confirm && (
          <form action={approveAction} className="flex flex-wrap gap-2"><input type="hidden" name="key" value={requestKey} /><Button type="submit" loading={approving}>Confirm approval of {proposed} accounts</Button><Button type="button" variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button></form>
        )}
      </div>
      {confirm && <p className="text-sm text-muted-foreground">Approve only after the accountant has reviewed the chart (docs/CALACOT_CHART_OF_ACCOUNTS.md). Accounts you proposed yourself stay proposed for someone else to approve.</p>}
      <Message state={loadState} /><Message state={approveState} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------------------------

export function GenerateYear({ requestKey, defaultYear, startMonth }: { requestKey: string; defaultYear: number; startMonth: number }) {
  const [state, action, pending] = useActionState(generateFiscalYear, initial);
  return (
    <FormDialog trigger="Create financial year" title="Create a financial year" description={`Creates twelve monthly periods starting in ${monthNames[startMonth - 1]}, as set by the approved accounting policy.`} state={state} action={action} pending={pending} submitLabel="Create 12 periods">
      <input type="hidden" name="key" value={requestKey} />
      <Field><FieldLabel htmlFor="fy">Year the financial year starts in</FieldLabel><Input id="fy" name="fiscalYear" inputMode="numeric" pattern="20[0-9]{2}" required defaultValue={String(defaultYear)} /><FieldDescription>Periods are labelled by this starting year, e.g. FY{defaultYear} P01.</FieldDescription></Field>
    </FormDialog>
  );
}

export function PeriodCommand({ periodId, version, requestKey, command, name, pending: pendingJournals }: { periodId: string; version: number; requestKey: string; command: "close" | "reopen"; name: string; pending: number }) {
  const [state, action, pending] = useActionState(periodCommand, initial);
  return (
    <FormDialog trigger={command === "close" ? "Close" : "Reopen"} variant="outline" title={`${command === "close" ? "Close" : "Reopen"} ${name}`}
      description={command === "close" ? (pendingJournals ? `${pendingJournals} journal(s) dated in this period await approval or posting. Resolve them first.` : "Nothing can be posted or reversed into a closed period. Posted balances stay exactly as they are.") : "Reopening allows postings into this period again. The reason is recorded permanently."}
      state={state} action={action} pending={pending} submitLabel={command === "close" ? "Close period" : "Reopen period"}>
      <input type="hidden" name="periodId" value={periodId} /><input type="hidden" name="version" value={String(version)} /><input type="hidden" name="key" value={requestKey} /><input type="hidden" name="command" value={command} />
      <Field><FieldLabel htmlFor="p-note">{command === "close" ? "Close note (optional)" : "Reason for reopening"}</FieldLabel><Textarea id="p-note" name="note" required={command === "reopen"} minLength={command === "reopen" ? 5 : undefined} maxLength={2000} /></Field>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Policy and exchange rates
// ---------------------------------------------------------------------------------------------

export function ProposePolicy({ requestKey, current }: { requestKey: string; current: { functional_currency: string; fiscal_year_start_month: number; manual_posting_enabled: boolean } | null }) {
  const [state, action, pending] = useActionState(proposePolicy, initial);
  return (
    <FormDialog trigger={current ? "Propose a change" : "Propose accounting policy"} variant={current ? "outline" : "default"} title="Propose accounting policy"
      description="Record what the accountant has decided. A different authorized person must approve it before it takes effect. Automatic and multi-currency posting cannot be enabled in this phase."
      state={state} action={action} pending={pending} submitLabel="Submit proposal">
      <input type="hidden" name="key" value={requestKey} />
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="pol-cur">Functional currency</FieldLabel><NativeSelect wrapperClassName="w-full" id="pol-cur" name="functionalCurrency" defaultValue={current?.functional_currency ?? ""} required><option value="" disabled>Choose</option><option value="UGX">UGX</option><option value="USD">USD</option></NativeSelect></Field>
          <Field><FieldLabel htmlFor="pol-month">Financial year starts in</FieldLabel><NativeSelect wrapperClassName="w-full" id="pol-month" name="fiscalYearStartMonth" defaultValue={current ? String(current.fiscal_year_start_month) : ""} required><option value="" disabled>Choose month</option>{monthNames.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}</NativeSelect></Field>
        </div>
        <Field><FieldLabel htmlFor="pol-post">Manual journal posting</FieldLabel><NativeSelect wrapperClassName="w-full" id="pol-post" name="manualPostingEnabled" defaultValue={current?.manual_posting_enabled ? "true" : "false"}><option value="false">Disabled (prepare and approve only)</option><option value="true">Enabled</option></NativeSelect></Field>
        <Field><FieldLabel htmlFor="pol-note">Basis for this policy</FieldLabel><Textarea id="pol-note" name="note" required minLength={5} maxLength={2000} placeholder="e.g. Confirmed by the company accountant on ..., per the registered financial year." /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

export function Decide({ kind, id, requestKey, label }: { kind: "policy" | "rate"; id: string; requestKey: string; label: string }) {
  const [state, action, pending] = useActionState(kind === "policy" ? decidePolicy : decideRate, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="key" value={requestKey} />
      <Field><FieldLabel htmlFor={`dec-${id}`} className="sr-only">Decision note for {label}</FieldLabel><Input id={`dec-${id}`} name="note" maxLength={2000} placeholder="Note (required to reject)" /></Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve" size="sm" loading={pending}>Approve</Button>
        <Button type="submit" name="decision" value="reject" size="sm" variant="destructive-ghost" disabled={pending}>Reject</Button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function ProposeRate({ requestKey, today, functionalCurrency }: { requestKey: string; today: string; functionalCurrency: string | null }) {
  const [state, action, pending] = useActionState(proposeRate, initial);
  const to = functionalCurrency ?? "UGX";
  const from = to === "UGX" ? "USD" : "UGX";
  return (
    <FormDialog trigger="Record exchange rate" variant="outline" title="Record an exchange rate" description="Enter a rate from an approved source. It cannot be used until a different authorized person approves it. Rates are never fetched or estimated automatically." state={state} action={action} pending={pending} submitLabel="Record rate">
      <input type="hidden" name="key" value={requestKey} />
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="r-from">From</FieldLabel><NativeSelect wrapperClassName="w-full" id="r-from" name="fromCurrency" defaultValue={from}><option value="USD">USD</option><option value="UGX">UGX</option></NativeSelect></Field>
          <Field><FieldLabel htmlFor="r-to">To</FieldLabel><NativeSelect wrapperClassName="w-full" id="r-to" name="toCurrency" defaultValue={to}><option value="UGX">UGX</option><option value="USD">USD</option></NativeSelect></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="r-rate">Rate (1 from = ? to)</FieldLabel><Input id="r-rate" name="rate" inputMode="decimal" required pattern="[0-9]{1,10}(\.[0-9]{1,10})?" /></Field>
          <Field><FieldLabel htmlFor="r-date">Rate date</FieldLabel><Input id="r-date" name="rateDate" type="date" max={today} defaultValue={today} required /></Field>
        </div>
        <Field><FieldLabel htmlFor="r-src">Source</FieldLabel><Input id="r-src" name="source" required minLength={3} maxLength={200} placeholder="e.g. Bank of Uganda published mid-rate" /></Field>
      </FieldGroup>
    </FormDialog>
  );
}
