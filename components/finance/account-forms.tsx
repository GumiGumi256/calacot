"use client";
import { useActionState, useState } from "react";
import { saveFinanceAccount, setFinanceAccountStatus } from "@/lib/finance/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const initial = { ok: false, message: "" };
const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function RegisterAccount({ requestKey }: { requestKey: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveFinanceAccount, initial);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Register account</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Register verified payment account</DialogTitle>
          <DialogDescription>Only register company accounts you have verified (for example against a bank letter or statement). Details cannot be edited later.</DialogDescription>
        </DialogHeader>
        {state.ok ? (
          <div className="flex flex-col gap-3"><p role="status" className="text-sm">{state.message}</p><DialogFooter><Button onClick={() => setOpen(false)}>Close</Button></DialogFooter></div>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="key" value={requestKey} />
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="acc-method">Payment method</FieldLabel><select id="acc-method" name="method" className={selectClass} defaultValue="bank_transfer"><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="cheque">Cheque</option></select></Field>
                <Field><FieldLabel htmlFor="acc-currency">Currency</FieldLabel><select id="acc-currency" name="currency" className={selectClass} defaultValue="UGX"><option value="UGX">UGX</option><option value="USD">USD</option></select></Field>
              </div>
              <Field><FieldLabel htmlFor="acc-provider">Bank or mobile-money provider</FieldLabel><Input id="acc-provider" name="provider" required maxLength={100} /></Field>
              <Field><FieldLabel htmlFor="acc-number">Account number or wallet number</FieldLabel><Input id="acc-number" name="accountIdentifier" required maxLength={100} /></Field>
              <Field><FieldLabel htmlFor="acc-label">Label</FieldLabel><Input id="acc-label" name="label" required maxLength={120} placeholder="e.g. Operations account" /></Field>
              <Field><FieldLabel htmlFor="acc-note">How was this account verified?</FieldLabel><Textarea id="acc-note" name="verificationNote" required minLength={5} maxLength={2000} aria-describedby="acc-note-hint" /><FieldDescription id="acc-note-hint">Recorded with your name and the time as the verification evidence.</FieldDescription></Field>
            </FieldGroup>
            <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Saving..." : "Register as verified"}</Button></DialogFooter>
            {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AccountStatus({ accountId, status }: { accountId: string; status: string }) {
  const [state, action, pending] = useActionState(setFinanceAccountStatus, initial);
  const target = status === "active" ? "inactive" : "active";
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="status" value={target} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>{target === "inactive" ? "Deactivate" : "Reactivate"}</Button>
      {state.message && <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-xs" : "text-xs text-destructive"}>{state.message}</p>}
    </form>
  );
}
