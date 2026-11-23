"use client";
import { useActionState, useMemo, useState } from "react";
import { PaperclipIcon, PlusIcon, Trash2Icon } from "lucide-react";
import {
  bankingAccountCommand, cancelMatch, createCashTransaction, createMatch, createReconciliation, decideBankMapping, decideCashTransaction, decideCategoryAccount,
  proposeBankMapping, proposeCategoryAccount, reconciliationCommand, recordCashCount, registerBankingAccount, reviewStatementLine, updateReconciliation,
} from "@/lib/banking/actions";
import { bankingKindHelp, bankingKindLabels, bankingKinds, categories, categoryHelp, categoryLabels, type BankingKind, type CashKind } from "@/lib/banking/catalog";
import { ledgerAmount } from "@/lib/accounting/format";
import { FormDialog, Message, initial, type State } from "@/components/accounting/admin-forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";

const newKey = () => crypto.randomUUID();
type Option = { id: string; label: string };

/** Small inline decision form (approve / reject / ...), with a note that becomes required to refuse. */
function Decision({ action, pending, state, hidden, decisions, label, notePlaceholder = "Note (required to reject)" }: {
  action: (d: FormData) => void; pending: boolean; state: State; hidden: Record<string, string>; decisions: { value: string; label: string; primary?: boolean }[]; label: string; notePlaceholder?: string;
}) {
  const [key] = useState(newKey);
  if (state.ok) return <p role="status" className="text-sm">{state.message}</p>;
  return (
    <form action={action} className="flex flex-col gap-2" aria-label={label}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="key" value={key} />
      <Textarea name="note" maxLength={2000} rows={2} placeholder={notePlaceholder} aria-label={`${label}: note`} />
      <div className="flex flex-wrap gap-2">
        {decisions.map((d) => <Button key={d.value} type="submit" name="decision" value={d.value} size="sm" variant={d.primary ? "default" : "outline"} loading={pending}>{d.label}</Button>)}
      </div>
      <Message state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Accounts and mappings
// ---------------------------------------------------------------------------------------------

export function RegisterAccount({ financeAccounts, staff }: { financeAccounts: { id: string; method: string; provider: string; label: string; currency: string; identifier: string }[]; staff: Option[] }) {
  const [state, action, pending] = useActionState(registerBankingAccount, initial);
  const [key] = useState(newKey);
  const [kind, setKind] = useState<BankingKind>("bank");
  const linked = kind === "bank" || kind === "mobile_money";
  const choices = financeAccounts.filter((f) => f.method === (kind === "bank" ? "bank_transfer" : "mobile_money"));
  return (
    <FormDialog trigger={<><PlusIcon data-icon="inline-start" />Register account</>} title="Register a company money account" description="Bank and mobile-money accounts come from the verified Payment accounts register; each can be registered once. Cash, petty cash and clearing accounts are unique by name." state={state} action={action} pending={pending} submitLabel="Register">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="ba-kind">Type</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="ba-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as BankingKind)}>
            {bankingKinds.map((k) => <option key={k} value={k}>{bankingKindLabels[k]}</option>)}
          </NativeSelect>
          <FieldDescription>{bankingKindHelp[kind]}</FieldDescription>
        </Field>
        {linked ? (
          <Field>
            <FieldLabel htmlFor="ba-finance">Verified payment account</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="ba-finance" name="financeAccountId" required defaultValue="">
              <option value="" disabled>{choices.length ? "Choose an account" : "No unregistered verified accounts"}</option>
              {choices.map((f) => <option key={f.id} value={f.id}>{f.provider} · {f.label} · {f.identifier} · {f.currency}</option>)}
            </NativeSelect>
            <FieldDescription>Missing an account? Verify it first under Payment accounts. Only the last four characters are shown.</FieldDescription>
          </Field>
        ) : (
          <>
            <Field><FieldLabel htmlFor="ba-label">Name</FieldLabel><Input id="ba-label" name="label" required maxLength={120} placeholder={kind === "petty_cash" ? "Head office petty cash" : kind === "cash" ? "Site cash, Ntinda" : "Receipts not yet banked"} /></Field>
            <Field>
              <FieldLabel htmlFor="ba-currency">Currency</FieldLabel>
              <NativeSelect wrapperClassName="w-full" id="ba-currency" name="currency" required defaultValue="UGX"><option value="UGX">UGX</option><option value="USD">USD</option></NativeSelect>
            </Field>
          </>
        )}
        {(kind === "cash" || kind === "petty_cash") && (
          <Field>
            <FieldLabel htmlFor="ba-custodian">Custodian</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="ba-custodian" name="custodianId" required defaultValue="">
              <option value="" disabled>Choose the employee who holds the cash</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </NativeSelect>
          </Field>
        )}
        {kind === "petty_cash" && (
          <Field><FieldLabel htmlFor="ba-float">Approved float</FieldLabel><Input id="ba-float" name="floatAmount" inputMode="decimal" pattern="\d{1,15}(\.\d{1,2})?" placeholder="500000" /><FieldDescription>Replenishments cannot take the balance above this amount. Leave empty for no limit.</FieldDescription></Field>
        )}
      </FieldGroup>
    </FormDialog>
  );
}

export function AccountSettings({ account, staff }: { account: { id: string; version: number; kind: string; status: string; label: string; custodian_id: string | null; float_amount: string | null }; staff: Option[] }) {
  const [state, action, pending] = useActionState(bankingAccountCommand, initial);
  const [key] = useState(newKey);
  const [command, setCommand] = useState<"update" | "deactivate" | "reactivate">(account.status === "active" ? "update" : "reactivate");
  const cash = account.kind === "cash" || account.kind === "petty_cash";
  return (
    <FormDialog variant="outline" trigger="Account settings" title={`${account.label}: settings`} description="Every change is recorded with your explanation. Verified details (type, currency, bank or wallet) never change." state={state} action={action} pending={pending} submitLabel="Save">
      <input type="hidden" name="id" value={account.id} /><input type="hidden" name="version" value={account.version} /><input type="hidden" name="key" value={key} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="as-cmd">Change</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="as-cmd" name="command" value={command} onChange={(e) => setCommand(e.target.value as typeof command)}>
            {account.status === "active" && cash && <option value="update">Change custodian or float</option>}
            {account.status === "active" && !cash && <option value="update" disabled>No editable settings</option>}
            {account.status === "active" ? <option value="deactivate">Deactivate</option> : <option value="reactivate">Reactivate</option>}
          </NativeSelect>
        </Field>
        {command === "update" && cash && (
          <>
            <Field>
              <FieldLabel htmlFor="as-cust">Custodian</FieldLabel>
              <NativeSelect wrapperClassName="w-full" id="as-cust" name="custodianId" defaultValue={account.custodian_id ?? ""}>{staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</NativeSelect>
            </Field>
            {account.kind === "petty_cash" && <Field><FieldLabel htmlFor="as-float">Approved float</FieldLabel><Input id="as-float" name="floatAmount" defaultValue={account.float_amount ?? ""} inputMode="decimal" pattern="\d{1,15}(\.\d{1,2})?" /></Field>}
          </>
        )}
        <Field><FieldLabel htmlFor="as-note">Reason</FieldLabel><Textarea id="as-note" name="note" required minLength={5} maxLength={2000} placeholder="For example: custodian handed over after a witnessed count." /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

export function ProposeMapping({ accountId, accountLabel, currency, ledgers }: { accountId: string; accountLabel: string; currency: string; ledgers: { id: string; code: string; name: string; currency: string | null }[] }) {
  const [state, action, pending] = useActionState(proposeBankMapping, initial);
  const [key] = useState(newKey);
  const eligible = ledgers.filter((l) => !l.currency || l.currency === currency);
  return (
    <FormDialog variant="outline" trigger="Propose ledger account" title={`Ledger account for ${accountLabel}`} description="The general-ledger account that represents this account's money. A different person with policy-approval authority must approve it. Each ledger account can represent only one company account." state={state} action={action} pending={pending} submitLabel="Propose">
      <input type="hidden" name="key" value={key} /><input type="hidden" name="bankingAccountId" value={accountId} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="pm-ledger">Ledger account</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="pm-ledger" name="ledgerAccountId" required defaultValue="">
            <option value="" disabled>{eligible.length ? "Choose an asset account" : "No unused asset accounts. Add one in the chart of accounts."}</option>
            {eligible.map((l) => <option key={l.id} value={l.id}>{l.code} {l.name}{l.currency ? ` (${l.currency})` : ""}</option>)}
          </NativeSelect>
          <FieldDescription>Active, postable asset accounts in {currency} that accept manual journals and are not used by another account. Add sub-accounts (for example 1130-01 MTN, 1130-02 Airtel) in the chart of accounts.</FieldDescription>
        </Field>
        <Field><FieldLabel htmlFor="pm-note">Basis</FieldLabel><Textarea id="pm-note" name="note" required minLength={5} maxLength={2000} placeholder="For example: agreed with the accountant on 3 March; matches QuickBooks account Stanbic Operations." /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

export function DecideMapping({ id, status, label }: { id: string; status: string; label: string }) {
  const [state, action, pending] = useActionState(decideBankMapping, initial);
  return <Decision action={action} pending={pending} state={state} hidden={{ id }} label={`Decide on ${label}`} notePlaceholder={status === "approved" ? "Reason for retiring (required)" : "Note (required to reject)"}
    decisions={status === "approved" ? [{ value: "retire", label: "Retire" }] : [{ value: "approve", label: "Approve", primary: true }, { value: "reject", label: "Reject" }]} />;
}

export function ProposeCategory({ accounts }: { accounts: { id: string; code: string; name: string; account_type: string }[] }) {
  const [state, action, pending] = useActionState(proposeCategoryAccount, initial);
  const [key] = useState(newKey);
  const [category, setCategory] = useState<(typeof categories)[number]>("bank_fee");
  const fits = (t: string) => category === "staff_advances" ? t === "asset" : ["interest_income", "cash_overage"].includes(category) ? ["other_income", "income"].includes(t) : ["operating_expense", "other_expense"].includes(t);
  return (
    <FormDialog variant="outline" trigger="Propose category account" title="Ledger account for an adjustment category" description="Bank charges, interest, cash differences and staff advances post to the approved account for their category. A different person must approve it." state={state} action={action} pending={pending} submitLabel="Propose">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="pc-cat">Category</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="pc-cat" name="category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {categories.map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
          </NativeSelect>
          <FieldDescription>{categoryHelp[category]}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="pc-acct">Ledger account</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="pc-acct" name="ledgerAccountId" required defaultValue="">
            <option value="" disabled>Choose an account</option>
            {accounts.filter((a) => fits(a.account_type)).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </NativeSelect>
        </Field>
        <Field><FieldLabel htmlFor="pc-note">Basis</FieldLabel><Textarea id="pc-note" name="note" required minLength={5} maxLength={2000} /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

export function DecideCategory({ id, status, label }: { id: string; status: string; label: string }) {
  const [state, action, pending] = useActionState(decideCategoryAccount, initial);
  return <Decision action={action} pending={pending} state={state} hidden={{ id }} label={`Decide on ${label}`}
    decisions={status === "approved" ? [{ value: "retire", label: "Retire" }] : [{ value: "approve", label: "Approve", primary: true }, { value: "reject", label: "Reject" }]} />;
}

// ---------------------------------------------------------------------------------------------
// Statement review and matching
// ---------------------------------------------------------------------------------------------

export function ReviewLine({ id, reason }: { id: string; reason: string | null }) {
  const [state, action, pending] = useActionState(reviewStatementLine, initial);
  return <Decision action={action} pending={pending} state={state} hidden={{ id }} label="Resolve possible duplicate" notePlaceholder="What did you check? (required)"
    decisions={[{ value: "duplicate", label: "It is a duplicate", primary: reason !== "in_finalized_period" }, { value: "accept", label: "Genuine transaction" }]} />;
}

/** One-click confirmation of a suggested exact or near match. The suggestion itself is never saved. */
export function ConfirmSuggestion({ accountId, statementLineId, journalLineId, amount, label }: { accountId: string; statementLineId: string; journalLineId: string; amount: string; label: string }) {
  const [state, action, pending] = useActionState(createMatch, initial);
  const [key] = useState(newKey);
  if (state.ok) return <p role="status" className="text-sm">{state.message}</p>;
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="key" value={key} /><input type="hidden" name="bankingAccountId" value={accountId} /><input type="hidden" name="kind" value="match" />
      <input type="hidden" name="items" value={JSON.stringify([{ statementLineId, amount }, { journalLineId, amount }])} />
      <Button type="submit" size="sm" variant="outline" loading={pending} aria-label={`Confirm match with ${label}`}>Confirm match</Button>
      <Message state={state} />
    </form>
  );
}

type Pickable = { id: string; date: string; label: string; residual: string };
const toCents = (v: string) => { const neg = v.trim().startsWith("-"); const [w, f = ""] = v.trim().replace("-", "").split("."); return (neg ? -1 : 1) * (Number(w || 0) * 100 + Number((f + "00").slice(0, 2))); };
const fromCents = (c: number) => `${c < 0 ? "-" : ""}${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, "0")}`;

/**
 * Manual matching: pick bank lines and ledger entries, adjust amounts for partial matches, and see
 * the difference before saving. Amounts are handled in integer cents; the database re-checks all.
 */
export function ManualMatch({ accountId, statement, ledger, firstPeriod }: { accountId: string; statement: Pickable[]; ledger: Pickable[]; firstPeriod: boolean }) {
  const [state, action, pending] = useActionState(createMatch, initial);
  const [key, setKey] = useState(newKey);
  const [kind, setKind] = useState<"match" | "statement_offset" | "ledger_offset" | "opening_balance">("match");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const toggle = (id: string, residual: string) => setPicked((p) => { const n = { ...p }; if (n[id] !== undefined) delete n[id]; else n[id] = residual; return n; });
  const sItems = statement.filter((s) => picked[s.id] !== undefined), lItems = ledger.filter((l) => picked[l.id] !== undefined);
  const sSum = sItems.reduce((t, s) => t + toCents(picked[s.id] || "0"), 0), lSum = lItems.reduce((t, l) => t + toCents(picked[l.id] || "0"), 0);
  const partial = [...sItems, ...lItems].some((x) => picked[x.id] !== x.residual);
  const diff = kind === "match" ? sSum - lSum : kind === "statement_offset" ? sSum : kind === "ledger_offset" ? lSum : 0;
  const items = [...sItems.map((s) => ({ statementLineId: s.id, amount: picked[s.id] })), ...lItems.map((l) => ({ journalLineId: l.id, amount: picked[l.id] }))];
  const showS = kind === "match" || kind === "statement_offset", showL = kind !== "statement_offset";
  const ready = items.length > 0 && diff === 0 && (kind !== "match" || (sItems.length > 0 && lItems.length > 0));
  const reset = () => { setPicked({}); setKey(newKey()); };
  const list = (rows: Pickable[], title: string) => (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{title}</legend>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing unmatched.</p> : (
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto pr-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-2 text-sm">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <Checkbox checked={picked[r.id] !== undefined} onCheckedChange={() => toggle(r.id, r.residual)} />
                <span className="min-w-0"><span className="block truncate">{r.label}</span><span className="text-xs text-muted-foreground">{r.date} · unmatched {ledgerAmount(r.residual)}</span></span>
              </label>
              {picked[r.id] !== undefined && <Input aria-label={`Amount to match for ${r.label}`} className="w-28 text-right tabular-nums" inputMode="decimal" value={picked[r.id]} onChange={(e) => setPicked((p) => ({ ...p, [r.id]: e.target.value }))} />}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
  return (
    <form action={(d) => { action(d); }} className="flex flex-col gap-4" aria-label="Manual match">
      <input type="hidden" name="key" value={key} /><input type="hidden" name="bankingAccountId" value={accountId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="items" value={JSON.stringify(items)} />
      <Field>
        <FieldLabel htmlFor="mm-kind">What are you matching?</FieldLabel>
        <NativeSelect wrapperClassName="w-full sm:w-96" id="mm-kind" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setPicked({}); }}>
          <option value="match">Bank lines with ledger entries</option>
          <option value="statement_offset">Bank lines that cancel out (a reversal)</option>
          <option value="ledger_offset">Ledger entries that cancel out (a journal and its reversal)</option>
          {firstPeriod && <option value="opening_balance">Ledger entries that make up the opening statement balance</option>}
        </NativeSelect>
      </Field>
      <div className="grid gap-4 lg:grid-cols-2">
        {showS && list(statement, "Bank statement lines")}
        {showL && list(ledger, kind === "opening_balance" ? "Ledger entries before the first period" : "Posted ledger entries")}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md bg-muted/50 p-3 text-sm tabular-nums" aria-live="polite">
        {showS && <span>Bank: {ledgerAmount(fromCents(sSum))}</span>}
        {showL && <span>Ledger: {ledgerAmount(fromCents(lSum))}</span>}
        {kind !== "opening_balance" && <span className={diff === 0 ? "font-medium text-success" : "font-medium text-destructive"}>Difference: {ledgerAmount(fromCents(diff))}</span>}
        {partial && <span className="text-warning">Partial: the rest stays unmatched and visible.</span>}
      </div>
      {(partial || kind !== "match") && <Field><FieldLabel htmlFor="mm-note">Explanation</FieldLabel><Textarea id="mm-note" name="note" required minLength={5} maxLength={2000} placeholder="For example: deposit banked in two lots; bank reversed a returned item." /></Field>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!ready} loading={pending}>Save match</Button>
        <Button type="button" variant="ghost" onClick={reset}>Clear</Button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function CancelMatch({ id }: { id: string }) {
  const [state, action, pending] = useActionState(cancelMatch, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog variant="outline" trigger="Unmatch" title="Cancel this match" description="The lines become unmatched again. The match stays in the history; the ledger is not changed." state={state} action={action} pending={pending} submitLabel="Cancel match">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="key" value={key} />
      <Field><FieldLabel htmlFor={`cm-${id}`}>Reason</FieldLabel><Textarea id={`cm-${id}`} name="reason" required minLength={5} maxLength={2000} /></Field>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------------------------

export function StartReconciliation({ accounts, defaults, today }: { accounts: { id: string; label: string; currency: string }[]; defaults?: { accountId: string; start: string; opening: string }; today: string }) {
  const [state, action, pending] = useActionState(createReconciliation, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog trigger={<><PlusIcon data-icon="inline-start" />Start reconciliation</>} title="Start a reconciliation period" description="Enter the period and the balances printed on the bank statement. A period starts the day after the previous one ended, and its opening balance is the previous closing balance." state={state} action={action} pending={pending} submitLabel="Start">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="sr-acct">Account</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="sr-acct" name="bankingAccountId" required defaultValue={defaults?.accountId ?? ""}>
            <option value="" disabled>Choose an account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.currency})</option>)}
          </NativeSelect>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="sr-start">Period start</FieldLabel><Input id="sr-start" type="date" name="periodStart" required max={today} defaultValue={defaults?.start} /></Field>
          <Field><FieldLabel htmlFor="sr-end">Period end (statement date)</FieldLabel><Input id="sr-end" type="date" name="periodEnd" required max={today} /></Field>
          <Field><FieldLabel htmlFor="sr-open">Opening statement balance</FieldLabel><Input id="sr-open" name="openingStatementBalance" required inputMode="decimal" pattern="-?\d{1,15}(\.\d{1,2})?" defaultValue={defaults?.opening} /></Field>
          <Field><FieldLabel htmlFor="sr-close">Closing statement balance</FieldLabel><Input id="sr-close" name="closingStatementBalance" required inputMode="decimal" pattern="-?\d{1,15}(\.\d{1,2})?" /></Field>
        </div>
        <FieldDescription>Use a minus sign for an overdrawn balance. No grouping commas.</FieldDescription>
      </FieldGroup>
    </FormDialog>
  );
}

export function EditReconciliation({ id, version, periodEnd, closing, today }: { id: string; version: number; periodEnd: string; closing: string; today: string }) {
  const [state, action, pending] = useActionState(updateReconciliation, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog variant="outline" trigger="Edit statement details" title="Statement details" description="Correct the period end or the closing balance printed on the statement. Allowed only while the reconciliation is in progress." state={state} action={action} pending={pending} submitLabel="Save">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={version} /><input type="hidden" name="key" value={key} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field><FieldLabel htmlFor="er-end">Period end</FieldLabel><Input id="er-end" type="date" name="periodEnd" required max={today} defaultValue={periodEnd} /></Field>
        <Field><FieldLabel htmlFor="er-close">Closing statement balance</FieldLabel><Input id="er-close" name="closingStatementBalance" required inputMode="decimal" pattern="-?\d{1,15}(\.\d{1,2})?" defaultValue={closing} /></Field>
      </div>
    </FormDialog>
  );
}

export function ReconciliationActions({ id, version, commands }: { id: string; version: number; commands: ("submit" | "return" | "finalize" | "reopen")[] }) {
  const [state, action, pending] = useActionState(reconciliationCommand, initial);
  const [key] = useState(newKey);
  if (!commands.length) return null;
  if (state.ok) return <p role="status" className="text-sm">{state.message}</p>;
  const labels = { submit: "Submit for review", return: "Return to preparer", finalize: "Finalize reconciliation", reopen: "Reopen" };
  const needsNote = commands.some((c) => c === "return" || c === "reopen");
  return (
    <form action={action} className="flex flex-col gap-2" aria-label="Reconciliation decision">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={version} /><input type="hidden" name="key" value={key} />
      {needsNote || commands.includes("finalize") ? <Textarea name="note" rows={2} maxLength={2000} placeholder={commands.includes("reopen") ? "Reason for reopening (required)" : "Review note (required to return)"} aria-label="Note" /> : null}
      <div className="flex flex-wrap gap-2">
        {commands.map((c, i) => <Button key={c} type="submit" name="command" value={c} variant={i === 0 && c !== "reopen" ? "default" : "outline"} loading={pending}>{labels[c]}</Button>)}
      </div>
      <Message state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Cash
// ---------------------------------------------------------------------------------------------

/** Uploads one evidence file to private storage and returns its id through onDone. */
export function EvidenceUpload({ onDone, required }: { onDone: (id: string) => void; required?: boolean }) {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setStatus(null);
    const body = new FormData(); body.set("file", file); body.set("key", newKey());
    try {
      const res = await fetch("/api/banking/evidence", { method: "POST", body });
      const json = (await res.json()) as { ok: boolean; message: string; id?: string };
      setStatus(json);
      if (json.ok && json.id) onDone(json.id);
    } catch { setStatus({ ok: false, message: "The upload failed. Try again." }); }
    finally { setBusy(false); }
  };
  return (
    <Field>
      <FieldLabel htmlFor="ev-file"><PaperclipIcon aria-hidden className="size-4" />Supporting evidence{required ? "" : " (optional)"}</FieldLabel>
      <Input id="ev-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
      <FieldDescription>PDF, JPEG, PNG or WebP, up to 10 MB. Stored privately.</FieldDescription>
      {status && <p role={status.ok ? "status" : "alert"} className={status.ok ? "text-sm" : "text-sm text-destructive"}>{busy ? "Uploading…" : status.message}</p>}
    </Field>
  );
}

type CashAccount = { id: string; label: string; kind: string; currency: string; float_amount: string | null; book_balance: string };
export type CashFormData = {
  accounts: CashAccount[]; counters: { id: string; code: string; name: string; account_type: string; currency: string | null }[]; expenses: { id: string; code: string; name: string }[];
  staff: Option[]; advances: { id: string; staff: string; currency: string; outstanding: string; txn_date: string; reference: string | null }[]; approvedCategories: string[]; today: string;
};
const cashChoices: { kind: CashKind; label: string; help: string }[] = [
  { kind: "receipt", label: "Money received", help: "Cash or a deposit received from outside the company, for example a customer or a loan. Not for moving money between company accounts." },
  { kind: "payment", label: "Money paid out", help: "A payment to an outside party, charged to an expense or other account." },
  { kind: "transfer", label: "Transfer between company accounts", help: "Moving money between two company accounts, including topping up petty cash. Recorded once; never income or expense." },
  { kind: "advance", label: "Advance to an employee", help: "Cash given to an employee to spend for the company. It stays an asset until accounted for." },
  { kind: "accountability", label: "Account for an advance", help: "Receipts for what was spent, plus any unspent cash returned. Evidence is required." },
];

export function CashForm({ data }: { data: CashFormData }) {
  const [state, action, pending] = useActionState(createCashTransaction, initial);
  const [key] = useState(newKey);
  const [kind, setKind] = useState<CashKind>("receipt");
  const [accountId, setAccountId] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [advanceId, setAdvanceId] = useState("");
  const [lines, setLines] = useState<{ accountId: string; amount: string; description: string }[]>([{ accountId: "", amount: "", description: "" }]);
  const account = data.accounts.find((a) => a.id === accountId);
  const counters = useMemo(() => data.counters.filter((c) => !account || !c.currency || c.currency === account.currency), [data.counters, account]);
  const advance = data.advances.find((a) => a.id === advanceId);
  const blocked = (kind === "advance" || kind === "accountability") && !data.approvedCategories.includes("staff_advances");
  const choice = cashChoices.find((c) => c.kind === kind)!;
  return (
    <FormDialog trigger={<><PlusIcon data-icon="inline-start" />New cash transaction</>} title="New cash transaction" description="It is prepared and submitted for approval. Nothing reaches the ledger until a different authorized person approves and posts it." state={state} action={action} pending={pending} submitLabel="Submit for approval">
      <input type="hidden" name="key" value={key} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="evidenceId" value={evidenceId} />
      {kind === "accountability" && <input type="hidden" name="expenses" value={JSON.stringify(lines.filter((l) => l.accountId && l.amount))} />}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="cf-kind">What happened?</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="cf-kind" value={kind} onChange={(e) => setKind(e.target.value as CashKind)}>
            {cashChoices.map((c) => <option key={c.kind} value={c.kind}>{c.label}</option>)}
          </NativeSelect>
          <FieldDescription>{choice.help}</FieldDescription>
        </Field>
        {blocked && <p role="alert" className="text-sm text-destructive">No staff advances account is approved yet. Ask for the Staff advances category account to be approved under Accounts and mappings.</p>}
        {kind === "accountability" ? (
          <Field>
            <FieldLabel htmlFor="cf-adv">Advance</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="cf-adv" name="advanceId" required value={advanceId} onChange={(e) => setAdvanceId(e.target.value)}>
              <option value="" disabled>{data.advances.length ? "Choose an outstanding advance" : "No outstanding advances"}</option>
              {data.advances.map((a) => <option key={a.id} value={a.id}>{a.staff} · {a.txn_date} · {a.reference ?? "no ref"} · outstanding {a.currency} {ledgerAmount(a.outstanding)}</option>)}
            </NativeSelect>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="cf-acct">{kind === "transfer" ? "From account" : kind === "receipt" ? "Into account" : "From account"}</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="cf-acct" name="bankingAccountId" required value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="" disabled>Choose a company account</option>
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.currency}) · book {ledgerAmount(a.book_balance)}</option>)}
            </NativeSelect>
          </Field>
        )}
        {kind === "transfer" && (
          <Field>
            <FieldLabel htmlFor="cf-to">To account</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="cf-to" name="toAccountId" required defaultValue="">
              <option value="" disabled>Choose a company account</option>
              {data.accounts.filter((a) => a.id !== accountId && (!account || a.currency === account.currency)).map((a) => <option key={a.id} value={a.id}>{a.label} ({a.currency}){a.float_amount ? ` · float ${ledgerAmount(a.float_amount)}` : ""}</option>)}
            </NativeSelect>
          </Field>
        )}
        {(kind === "receipt" || kind === "payment") && (
          <Field>
            <FieldLabel htmlFor="cf-counter">{kind === "receipt" ? "Received for (ledger account)" : "Paid for (ledger account)"}</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="cf-counter" name="counterAccountId" required defaultValue="">
              <option value="" disabled>Choose an account</option>
              {counters.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
            </NativeSelect>
            <FieldDescription>Customer invoice payments are recorded on the invoice, not here.</FieldDescription>
          </Field>
        )}
        {kind === "advance" && (
          <Field>
            <FieldLabel htmlFor="cf-staff">Employee</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="cf-staff" name="staffId" required defaultValue="">
              <option value="" disabled>Choose the employee</option>
              {data.staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </NativeSelect>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="cf-date">Date</FieldLabel><Input id="cf-date" type="date" name="date" required max={data.today} defaultValue={data.today} /></Field>
          {kind !== "accountability" && <Field><FieldLabel htmlFor="cf-amount">Amount{account ? ` (${account.currency})` : ""}</FieldLabel><Input id="cf-amount" name="amount" required inputMode="decimal" pattern="\d{1,15}(\.\d{1,2})?" /></Field>}
        </div>
        {kind === "accountability" && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">What was spent</legend>
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
                <NativeSelect wrapperClassName="w-full" aria-label={`Spending line ${i + 1}: account`} value={l.accountId} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, accountId: e.target.value } : x))}>
                  <option value="">Expense account</option>
                  {data.expenses.map((e) => <option key={e.id} value={e.id}>{e.code} {e.name}</option>)}
                </NativeSelect>
                <Input aria-label={`Spending line ${i + 1}: amount`} inputMode="decimal" placeholder="Amount" value={l.amount} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove spending line ${i + 1}`} onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)}><Trash2Icon /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setLines((ls) => [...ls, { accountId: "", amount: "", description: "" }])}><PlusIcon data-icon="inline-start" />Add line</Button>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="cf-ret">Unspent cash returned</FieldLabel><Input id="cf-ret" name="cashReturned" inputMode="decimal" pattern="\d{1,15}(\.\d{1,2})?" placeholder="0" /></Field>
              <Field>
                <FieldLabel htmlFor="cf-retacct">Returned into</FieldLabel>
                <NativeSelect wrapperClassName="w-full" id="cf-retacct" name="bankingAccountId" defaultValue="">
                  <option value="">No cash returned</option>
                  {data.accounts.filter((a) => !advance || a.currency === advance.currency).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </NativeSelect>
              </Field>
            </div>
            {advance && <FieldDescription>Outstanding on this advance: {advance.currency} {ledgerAmount(advance.outstanding)}. You cannot account for more than this.</FieldDescription>}
          </fieldset>
        )}
        <Field><FieldLabel htmlFor="cf-desc">Description</FieldLabel><Input id="cf-desc" name="description" required={kind !== "accountability"} maxLength={500} /></Field>
        <Field><FieldLabel htmlFor="cf-ref">Reference{kind === "transfer" ? "" : " (optional)"}</FieldLabel><Input id="cf-ref" name="reference" required={kind === "transfer"} maxLength={100} placeholder="Receipt, cheque or transfer number" /></Field>
        <EvidenceUpload required={kind === "accountability"} onDone={setEvidenceId} />
      </FieldGroup>
    </FormDialog>
  );
}

export function CashDecision({ id, canApprove, isPreparer, label }: { id: string; canApprove: boolean; isPreparer: boolean; label: string }) {
  const [state, action, pending] = useActionState(decideCashTransaction, initial);
  const decisions = [
    ...(canApprove && !isPreparer ? [{ value: "approve", label: "Approve and post", primary: true }, { value: "reject", label: "Reject" }] : []),
    ...(isPreparer ? [{ value: "cancel", label: "Cancel" }] : []),
  ];
  if (!decisions.length) return <span className="text-xs text-muted-foreground">{isPreparer ? "" : "Awaiting an approver"}</span>;
  return <Decision action={action} pending={pending} state={state} hidden={{ id }} decisions={decisions} label={`Decide on ${label}`} notePlaceholder={isPreparer && !canApprove ? "Why cancel? (required)" : "Note (required to reject or cancel)"} />;
}

export function CashCountForm({ accounts, staff, today, me }: { accounts: CashAccount[]; staff: Option[]; today: string; me: string | null }) {
  const [state, action, pending] = useActionState(recordCashCount, initial);
  const [key] = useState(newKey);
  const [evidenceId, setEvidenceId] = useState("");
  return (
    <FormDialog variant="outline" trigger="Record cash count" title="Record a cash count" description="Count the cash physically, ideally with a witness. The count is compared with the posted book balance on that date. Differences need an approved adjustment with evidence." state={state} action={action} pending={pending} submitLabel="Record count">
      <input type="hidden" name="key" value={key} /><input type="hidden" name="evidenceId" value={evidenceId} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="cc-acct">Cash account</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="cc-acct" name="bankingAccountId" required defaultValue="">
            <option value="" disabled>Choose cash or petty cash</option>
            {accounts.filter((a) => a.kind === "cash" || a.kind === "petty_cash").map((a) => <option key={a.id} value={a.id}>{a.label} ({a.currency})</option>)}
          </NativeSelect>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="cc-date">Count date</FieldLabel><Input id="cc-date" type="date" name="countDate" required max={today} defaultValue={today} /></Field>
          <Field><FieldLabel htmlFor="cc-amt">Amount counted</FieldLabel><Input id="cc-amt" name="countedAmount" required inputMode="decimal" pattern="\d{1,15}(\.\d{1,2})?" /></Field>
        </div>
        <Field>
          <FieldLabel htmlFor="cc-wit">Witness (optional)</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="cc-wit" name="witnessId" defaultValue="">
            <option value="">No witness</option>
            {staff.filter((s) => s.id !== me).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </NativeSelect>
        </Field>
        <Field><FieldLabel htmlFor="cc-note">Note</FieldLabel><Textarea id="cc-note" name="note" maxLength={2000} /></Field>
        <EvidenceUpload onDone={setEvidenceId} />
      </FieldGroup>
    </FormDialog>
  );
}

/** Prepares a count adjustment or a bank charge/interest adjustment for approval. */
export function AdjustmentForm({ kind, sourceId, label, direction, approvedCategories }: { kind: "count_adjustment" | "bank_adjustment"; sourceId: string; label: string; direction: "in" | "out"; approvedCategories: string[] }) {
  const [state, action, pending] = useActionState(createCashTransaction, initial);
  const [key] = useState(newKey);
  const [evidenceId, setEvidenceId] = useState("");
  const options = kind === "bank_adjustment" ? (direction === "out" ? ["bank_fee", "interest_expense"] : ["interest_income"]) : [direction === "out" ? "cash_shortage" : "cash_overage"];
  const missing = options.filter((o) => !approvedCategories.includes(o));
  return (
    <FormDialog variant="outline" trigger={kind === "bank_adjustment" ? "Classify" : "Prepare adjustment"} title={kind === "bank_adjustment" ? "Classify a bank line" : "Adjust for a cash count difference"}
      description={kind === "bank_adjustment" ? `${label}. A draft adjustment journal is prepared against the approved category account. Once a different person approves and posts it, it is matched to this bank line automatically.` : `${label}. A second person must approve the adjustment. Evidence is required.`}
      state={state} action={action} pending={pending} submitLabel="Submit for approval">
      <input type="hidden" name="key" value={key} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="evidenceId" value={evidenceId} />
      <input type="hidden" name={kind === "bank_adjustment" ? "statementLineId" : "cashCountId"} value={sourceId} />
      <FieldGroup>
        {kind === "bank_adjustment" && (
          <Field>
            <FieldLabel htmlFor={`adj-cat-${sourceId}`}>What is it?</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id={`adj-cat-${sourceId}`} name="category" required defaultValue={options[0]}>
              {options.map((o) => <option key={o} value={o} disabled={!approvedCategories.includes(o)}>{categoryLabels[o as keyof typeof categoryLabels]}{approvedCategories.includes(o) ? "" : " (no approved account)"}</option>)}
            </NativeSelect>
            <FieldDescription>Anything else (a payment you forgot to record, a bank error) is not an adjustment: record the real transaction, or ask the bank to correct it.</FieldDescription>
          </Field>
        )}
        {missing.length === options.length && <p role="alert" className="text-sm text-destructive">No approved ledger account exists for this category yet. Ask for it to be approved under Accounts and mappings.</p>}
        <Field><FieldLabel htmlFor={`adj-desc-${sourceId}`}>Explanation</FieldLabel><Textarea id={`adj-desc-${sourceId}`} name="description" required={kind === "count_adjustment"} minLength={kind === "count_adjustment" ? 5 : undefined} maxLength={500} /></Field>
        <EvidenceUpload required={kind === "count_adjustment"} onDone={setEvidenceId} />
      </FieldGroup>
    </FormDialog>
  );
}
