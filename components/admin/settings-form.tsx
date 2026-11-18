"use client";
import { useActionState, useState } from "react";
import { decideSettings, proposeSettings } from "@/lib/admin/settings-actions";
import type { CompanySettings } from "@/lib/admin/settings-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";

const initial = { ok: false, message: "" };
const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
function Message({ state }: { state: { ok: boolean; message: string } }) {
  return state.message ? <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p> : null;
}
function Text({ id, label, value, onChange, hint, type = "text", max = 200 }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; type?: string; max?: number }) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type={type} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />{hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}</Field>;
}

export function SettingsForm({ initialSettings, version, requestKey, locked }: { initialSettings: CompanySettings; version: number; requestKey: string; locked: boolean }) {
  const [s, setS] = useState<CompanySettings>(initialSettings);
  const [state, action, pending] = useActionState(proposeSettings, initial);
  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const paymentChanged = JSON.stringify(s.payment) !== JSON.stringify(initialSettings.payment);
  const bank = s.payment.bank, mobile = s.payment.mobile;
  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6">
      <input type="hidden" name="settings" value={JSON.stringify(s)} /><input type="hidden" name="baseVersion" value={String(version)} /><input type="hidden" name="key" value={requestKey} />
      <FieldSet><FieldLegend>Legal and trading identity</FieldLegend><FieldGroup>
        <Text id="set-legal" label="Legal company name" value={s.identity.legalName} onChange={(v) => set("identity", { ...s.identity, legalName: v })} hint="Printed as the issuer on new quotations and invoices." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Text id="set-trading" label="Trading name" value={s.identity.tradingName} onChange={(v) => set("identity", { ...s.identity, tradingName: v })} />
          <Text id="set-tin" label="Tax identification number (TIN)" value={s.identity.taxIdentifier} max={60} onChange={(v) => set("identity", { ...s.identity, taxIdentifier: v })} />
        </div>
      </FieldGroup></FieldSet>
      <FieldSet><FieldLegend>Business contacts and address</FieldLegend><FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Text id="set-email" type="email" label="Business email" value={s.contacts.email} max={254} onChange={(v) => set("contacts", { ...s.contacts, email: v })} />
          <Text id="set-phone" label="Business phone" value={s.contacts.phone} max={30} onChange={(v) => set("contacts", { ...s.contacts, phone: v })} />
        </div>
        <Text id="set-line1" label="Street address" value={s.address.line1} onChange={(v) => set("address", { ...s.address, line1: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Text id="set-city" label="City" value={s.address.city} max={100} onChange={(v) => set("address", { ...s.address, city: v })} />
          <Text id="set-country" label="Country" value={s.address.country} max={100} onChange={(v) => set("address", { ...s.address, country: v })} />
        </div>
      </FieldGroup></FieldSet>
      <FieldSet><FieldLegend>Operating divisions</FieldLegend><FieldDescription>Display names and which divisions are offered for new records. Existing records keep their division.</FieldDescription><FieldGroup>
        {s.divisions.map((d, i) => (
          <div key={d.key} className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
            <Text id={`div-${d.key}`} label={`Display name (${d.key})`} value={d.label} max={60} onChange={(v) => set("divisions", s.divisions.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
            <label className="flex h-9 items-center gap-2 text-sm"><Checkbox checked={d.enabled} onCheckedChange={(c) => set("divisions", s.divisions.map((x, j) => (j === i ? { ...x, enabled: !!c } : x)))} />Enabled</label>
          </div>
        ))}
      </FieldGroup></FieldSet>
      <FieldSet><FieldLegend>Approved payment instructions</FieldLegend>
        <FieldDescription>Shown to customers on new quotations, invoices, design purchases and WhatsApp. Any change needs approval by a second administrator before it takes effect.</FieldDescription>
        <FieldGroup>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!bank} onCheckedChange={(c) => set("payment", { ...s.payment, bank: c ? { name: "", number: "", account: "", swift: "", currency: "UGX" } : null })} />Offer bank transfer</label>
          {bank && <div className="grid gap-4 sm:grid-cols-2">
            <Text id="bank-name" label="Bank" value={bank.name} max={100} onChange={(v) => set("payment", { ...s.payment, bank: { ...bank, name: v } })} />
            <Text id="bank-acct-name" label="Account name" value={bank.account} max={120} onChange={(v) => set("payment", { ...s.payment, bank: { ...bank, account: v } })} />
            <Text id="bank-number" label="Account number" value={bank.number} max={60} onChange={(v) => set("payment", { ...s.payment, bank: { ...bank, number: v } })} />
            <Text id="bank-swift" label="SWIFT (optional)" value={bank.swift} max={20} onChange={(v) => set("payment", { ...s.payment, bank: { ...bank, swift: v } })} />
            <Field><FieldLabel htmlFor="bank-currency">Currency</FieldLabel><select id="bank-currency" className={selectClass} value={bank.currency} onChange={(e) => set("payment", { ...s.payment, bank: { ...bank, currency: e.target.value as "UGX" | "USD" } })}><option>UGX</option><option>USD</option></select></Field>
          </div>}
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!mobile} onCheckedChange={(c) => set("payment", { ...s.payment, mobile: c ? { network: "", number: "", account: "", currency: "UGX" } : null })} />Offer mobile money</label>
          {mobile && <div className="grid gap-4 sm:grid-cols-2">
            <Text id="mm-network" label="Network" value={mobile.network} max={60} onChange={(v) => set("payment", { ...s.payment, mobile: { ...mobile, network: v } })} />
            <Text id="mm-number" label="Number" value={mobile.number} max={30} onChange={(v) => set("payment", { ...s.payment, mobile: { ...mobile, number: v } })} />
            <Text id="mm-account" label="Registered name" value={mobile.account} max={120} onChange={(v) => set("payment", { ...s.payment, mobile: { ...mobile, account: v } })} />
            <Field><FieldLabel htmlFor="mm-currency">Currency</FieldLabel><select id="mm-currency" className={selectClass} value={mobile.currency} onChange={(e) => set("payment", { ...s.payment, mobile: { ...mobile, currency: e.target.value as "UGX" | "USD" } })}><option>UGX</option><option>USD</option></select></Field>
          </div>}
        </FieldGroup>
      </FieldSet>
      <FieldSet><FieldLegend>Operational defaults</FieldLegend><FieldGroup>
        <Field><FieldLabel htmlFor="def-currency">Default currency for new expense requests</FieldLabel><select id="def-currency" className={selectClass} value={s.defaults.defaultCurrency} onChange={(e) => set("defaults", { defaultCurrency: e.target.value as "UGX" | "USD" })}><option>UGX</option><option>USD</option></select></Field>
      </FieldGroup></FieldSet>
      <Field><FieldLabel htmlFor="set-note">Reason for this change</FieldLabel><Textarea id="set-note" name="note" required minLength={5} maxLength={1000} /></Field>
      {paymentChanged && <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">Payment instructions changed: this will be saved as a proposal and will not take effect until another administrator approves it.</p>}
      <div><Button type="submit" disabled={pending || locked}>{pending ? "Saving..." : paymentChanged ? "Submit for approval" : "Save settings"}</Button></div>
      {locked && <p className="text-sm text-muted-foreground">Editing is paused while a payment-instruction proposal awaits a decision.</p>}
      <Message state={state} />
    </form>
  );
}

export function DecideProposal({ versionId, canDecide }: { versionId: string; canDecide: boolean }) {
  const [state, action, pending] = useActionState(decideSettings, initial);
  if (!canDecide) return <p className="text-sm text-muted-foreground">You proposed this change. Another administrator must approve or reject it.</p>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="versionId" value={versionId} />
      <Field><FieldLabel htmlFor="decision-note">Verification note</FieldLabel><Textarea id="decision-note" name="note" required minLength={5} maxLength={1000} aria-describedby="decision-hint" /><FieldDescription id="decision-hint">Confirm how you verified the new payment details (for example a bank letter), independently of the proposer.</FieldDescription></Field>
      <div className="flex flex-wrap gap-2"><Button type="submit" name="decision" value="approve" disabled={pending}>Approve</Button><Button type="submit" name="decision" value="reject" variant="outline" disabled={pending}>Reject</Button></div>
      <Message state={state} />
    </form>
  );
}
