"use client";

import { useActionState, useState } from "react";
import { recordTeamMemberPayment } from "@/lib/finance/actions";
import { disbursementMethodLabels, disbursementMethods, formatAmount, type VerifiedPaymentOptions } from "@/lib/finance/options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";

export type TeamPaymentSetup = { projectId: string; today: string; options: VerifiedPaymentOptions };

/** Administrators: record one payment (an instalment) to a team member with its date, method and reference. */
export function RecordTeamMemberPayment({ setup, memberId, name, currency, owed }: { setup: TeamPaymentSetup; memberId: string; name: string; currency: string; owed: string | null }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [method, setMethod] = useState("cash");
  const [state, action, pending] = useActionState(async (prev: { ok: boolean; message: string }, data: FormData) => {
    const r = await recordTeamMemberPayment(prev, data);
    if (r.ok) setOpen(false);
    return r;
  }, { ok: false, message: "" });
  const needsAccount = ["bank_transfer", "mobile_money", "cheque"].includes(method);
  const accounts = setup.options.accounts.filter((a) => a.method === method && a.currency === currency);
  const suggested = owed && Number(owed) > 0 ? String(Number(owed)) : "";
  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) setKey(crypto.randomUUID()); setOpen(next); }}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Record payment</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment to {name}</DialogTitle>
          <DialogDescription>For money already paid, including past instalments. It is added once to project spending as Labour and to {name}&apos;s payment history. If this money is already inside an expense you recorded, open that expense and allocate it instead.</DialogDescription>
        </DialogHeader>
        {open && key && (
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="projectId" value={setup.projectId} />
            <input type="hidden" name="memberId" value={memberId} />
            <input type="hidden" name="key" value={key} />
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="tp-amount">Amount paid ({currency})</FieldLabel>
                  <Input id="tp-amount" name="amount" inputMode="decimal" required pattern="\d{1,15}(\.\d{1,2})?" defaultValue={suggested} className="tabular-nums" />
                  {owed !== null && <FieldDescription>Still owed: {formatAmount(currency, owed)}</FieldDescription>}
                </Field>
                <Field>
                  <FieldLabel htmlFor="tp-date">Date paid</FieldLabel>
                  <Input id="tp-date" name="paidOn" type="date" required max={setup.today} defaultValue={setup.today} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tp-method">Paid by</FieldLabel>
                  <NativeSelect wrapperClassName="w-full" id="tp-method" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                    {disbursementMethods.map((m) => <option key={m} value={m}>{disbursementMethodLabels[m]}</option>)}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="tp-reference">Reference{method === "cash" ? " (optional)" : ""}</FieldLabel>
                  <Input id="tp-reference" name="reference" maxLength={200} required={method !== "cash"} placeholder={method === "mobile_money" ? "e.g. transaction ID" : method === "cash" ? "e.g. receipt or voucher no." : ""} />
                </Field>
                {needsAccount && (
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor="tp-account">From company account</FieldLabel>
                    <NativeSelect wrapperClassName="w-full" id="tp-account" name="sourceAccountId" required defaultValue="" key={method}>
                      <option value="" disabled>{accounts.length ? "Select an account" : `No verified ${disbursementMethodLabels[method].toLowerCase()} account in ${currency}`}</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </NativeSelect>
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="tp-by">Paid by (employee)</FieldLabel>
                  <NativeSelect wrapperClassName="w-full" id="tp-by" name="responsibleStaffId" required defaultValue={setup.options.me}>
                    <option value="" disabled>Select an employee</option>
                    {setup.options.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="tp-note">Note (optional)</FieldLabel>
                  <Input id="tp-note" name="note" maxLength={300} placeholder="e.g. Instalment 2 of 3" />
                </Field>
              </div>
            </FieldGroup>
            <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Saving..." : "Record payment"}</Button></DialogFooter>
            {state.message && !state.ok && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
