"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminVerifyExpense, disbursementCommand, expenseCommand, recordDisbursement } from "@/lib/finance/actions";
import { disbursementMethodLabels, disbursementMethods, evidenceMaxBytes, formatAmount } from "@/lib/finance/options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";

const initial = { ok: false, message: "" };
function Message({ state }: { state: { ok: boolean; message: string } }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p>;
}

/** Requester controls: submit (primary), withdraw from review, cancel a draft. */
export function RequesterActions({ expenseId, version, requestKey, canSubmit, canWithdraw, canCancel }: { expenseId: string; version: number; requestKey: string; canSubmit: boolean; canWithdraw: boolean; canCancel: boolean }) {
  const [state, action, pending] = useActionState(expenseCommand, initial);
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (!canSubmit && !canWithdraw && !canCancel) return null;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="version" value={String(version)} />
      <input type="hidden" name="key" value={requestKey} />
      <div className="flex flex-wrap gap-2">
        {canSubmit && <Button type="submit" name="command" value="submit" disabled={pending}>{pending ? "Working..." : "Submit for review"}</Button>}
        {canWithdraw && <Button type="submit" name="command" value="withdraw" variant="outline" disabled={pending}>Withdraw to draft</Button>}
        {canCancel && !confirmCancel && <Button type="button" variant="ghost" onClick={() => setConfirmCancel(true)} disabled={pending}>Cancel request</Button>}
        {canCancel && confirmCancel && <><Button type="submit" name="command" value="cancel" variant="destructive" disabled={pending}>Confirm cancellation</Button><Button type="button" variant="ghost" onClick={() => setConfirmCancel(false)}>Keep request</Button></>}
      </div>
      <Message state={state} />
    </form>
  );
}

/** Reviewer controls. The server rejects self-review and stale versions. */
export function ReviewPanel({ expenseId, version, requestKey, canApprove, canReturnOrReject }: { expenseId: string; version: number; requestKey: string; canApprove: boolean; canReturnOrReject: boolean }) {
  const [state, action, pending] = useActionState(expenseCommand, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="version" value={String(version)} />
      <input type="hidden" name="key" value={requestKey} />
      <Field>
        <FieldLabel htmlFor="review-note">Reviewer note</FieldLabel>
        <Textarea id="review-note" name="note" maxLength={4000} aria-describedby="review-note-hint" />
        <FieldDescription id="review-note-hint">Required when returning or rejecting. The requester sees this note.</FieldDescription>
      </Field>
      <div className="flex flex-wrap gap-2">
        {canApprove && <Button type="submit" name="command" value="approve" disabled={pending}>{pending ? "Working..." : "Approve"}</Button>}
        {canReturnOrReject && <Button type="submit" name="command" value="return" variant="outline" disabled={pending}>Return for correction</Button>}
        {canReturnOrReject && <Button type="submit" name="command" value="reject" variant="ghost" className="text-destructive" disabled={pending}>Reject</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Approval authorizes spending only. It does not pay anyone.</p>
      <Message state={state} />
    </form>
  );
}

type Staff = { id: string; name: string };
type Doc = { id: string; name: string };
type Account = { id: string; method: string; label: string };
export function RecordDisbursement({ expenseId, version, currency, outstanding, requestKey, staff, documents, accounts, defaultResponsible, today }: { expenseId: string; version: number; currency: string; outstanding: string; requestKey: string; staff: Staff[]; documents: Doc[]; accounts: Account[]; defaultResponsible: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(recordDisbursement, initial);
  const [method, setMethod] = useState("bank_transfer");
  const needsAccount = ["bank_transfer", "mobile_money", "cheque"].includes(method);
  const methodAccounts = accounts.filter((a) => a.method === method);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Record disbursement</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record disbursement</DialogTitle>
          <DialogDescription>Record money that has already been paid outside this system. This is not an automatic payout or a verified bank settlement.</DialogDescription>
        </DialogHeader>
        {state.ok ? (
          <div className="flex flex-col gap-3"><Message state={state} /><DialogFooter><Button onClick={() => setOpen(false)}>Close</Button></DialogFooter></div>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="expenseId" value={expenseId} />
            <input type="hidden" name="version" value={String(version)} />
            <input type="hidden" name="key" value={requestKey} />
            <input type="hidden" name="currency" value={currency} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="disb-amount">Amount ({currency})</FieldLabel>
                <Input id="disb-amount" name="amount" inputMode="decimal" required defaultValue={outstanding} pattern="\d{1,15}(\.\d{1,2})?" aria-describedby="disb-amount-hint" />
                <FieldDescription id="disb-amount-hint">Outstanding approved amount: {formatAmount(currency, outstanding)}. Currency is fixed to the expense currency.</FieldDescription>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="disb-method">Payment method</FieldLabel>
                  <NativeSelect wrapperClassName="w-full" id="disb-method" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                    {disbursementMethods.map((m) => <option key={m} value={m}>{disbursementMethodLabels[m]}</option>)}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="disb-date">Payment date</FieldLabel>
                  <Input id="disb-date" name="paidOn" type="date" required max={today} defaultValue={today} />
                </Field>
              </div>
              {needsAccount && (
                <Field>
                  <FieldLabel htmlFor="disb-account">Paid from (verified company account)</FieldLabel>
                  <NativeSelect wrapperClassName="w-full" key={method} id="disb-account" name="sourceAccountId" required defaultValue="" aria-describedby="disb-account-hint">
                    <option value="" disabled>{methodAccounts.length ? "Select an account" : "No verified account for this method and currency"}</option>
                    {methodAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </NativeSelect>
                  <FieldDescription id="disb-account-hint">Only active, verified {currency} accounts are listed. An administrator registers accounts under Payment accounts.</FieldDescription>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="disb-reference">Transaction reference{method === "cash" ? " (optional for cash)" : ""}</FieldLabel>
                <Input id="disb-reference" name="reference" maxLength={200} required={method !== "cash"} aria-describedby="disb-reference-hint" />
                <FieldDescription id="disb-reference-hint">Bank, mobile-money or cheque reference. The same reference cannot be recorded twice for the same method and account.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="disb-responsible">Responsible employee</FieldLabel>
                <NativeSelect wrapperClassName="w-full" id="disb-responsible" name="responsibleStaffId" required defaultValue={defaultResponsible}>
                  <option value="" disabled>Select an employee</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="disb-evidence">Supporting evidence</FieldLabel>
                <NativeSelect wrapperClassName="w-full" id="disb-evidence" name="evidenceDocumentId" defaultValue="" aria-describedby="disb-evidence-hint">
                  <option value="">No document selected</option>
                  {documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </NativeSelect>
                <FieldDescription id="disb-evidence-hint">Upload proof of payment under Documents first, then select it here.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="disb-notes">Notes (optional)</FieldLabel>
                <Textarea id="disb-notes" name="notes" maxLength={2000} />
              </Field>
            </FieldGroup>
            <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Recording..." : "Record disbursement"}</Button></DialogFooter>
            <Message state={state} />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DisbursementControls({ disbursementId, voidKey, reconcileKey, canVoid, canReconcile }: { disbursementId: string; voidKey: string; reconcileKey: string; canVoid: boolean; canReconcile: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {canReconcile && <DisbursementDialog disbursementId={disbursementId} requestKey={reconcileKey} command="reconcile" />}
      {canVoid && <DisbursementDialog disbursementId={disbursementId} requestKey={voidKey} command="void" />}
    </div>
  );
}

function DisbursementDialog({ disbursementId, requestKey, command }: { disbursementId: string; requestKey: string; command: "void" | "reconcile" }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(disbursementCommand, initial);
  const reconcile = command === "reconcile";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant={reconcile ? "outline" : "ghost"} className={reconcile ? "" : "text-destructive"} />}>{reconcile ? "Reconcile" : "Void"}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{reconcile ? "Reconcile disbursement" : "Void disbursement"}</DialogTitle>
          <DialogDescription>{reconcile ? "Confirm that this payment appears on the bank or mobile-money statement. The person who recorded it cannot reconcile it." : "Use this only for a payment recorded in error. The record is kept, marked void, and the amount becomes outstanding again."}</DialogDescription>
        </DialogHeader>
        {state.ok ? <div className="flex flex-col gap-3"><Message state={state} /><DialogFooter><Button onClick={() => setOpen(false)}>Close</Button></DialogFooter></div> : (
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="disbursementId" value={disbursementId} />
            <input type="hidden" name="command" value={command} />
            <input type="hidden" name="key" value={requestKey} />
            {reconcile && <Field><FieldLabel htmlFor={`stmt-${disbursementId}`}>Statement line or reference</FieldLabel><Input id={`stmt-${disbursementId}`} name="statementReference" required maxLength={200} /></Field>}
            <Field><FieldLabel htmlFor={`note-${disbursementId}-${command}`}>{reconcile ? "Notes (optional)" : "Reason for voiding"}</FieldLabel><Textarea id={`note-${disbursementId}-${command}`} name="note" required={!reconcile} minLength={reconcile ? undefined : 5} maxLength={2000} /></Field>
            <DialogFooter><Button type="submit" variant={reconcile ? "default" : "destructive"} disabled={pending}>{pending ? "Saving..." : reconcile ? "Mark reconciled" : "Void disbursement"}</Button></DialogFooter>
            <Message state={state} />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Uploads to the private finance document route; the server validates type, size and ownership. */
export function EvidenceUpload({ expenseId, role, label }: { expenseId: string; role: "requester" | "finance"; label: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => {
      e.preventDefault();
      const file = input.current?.files?.[0];
      if (!file) { setMessage({ ok: false, text: "Choose a file first." }); return; }
      if (file.size > evidenceMaxBytes) { setMessage({ ok: false, text: "Files must be 10 MB or smaller." }); return; }
      const body = new FormData();
      // A new id per upload: storage keys are never reused, so a second file cannot overwrite the first.
      body.set("file", file); body.set("role", role); body.set("documentId", crypto.randomUUID());
      start(async () => {
        try {
          const res = await fetch(`/api/finance/expenses/${expenseId}/documents`, { method: "POST", body });
          const json = (await res.json().catch(() => ({ message: "Upload failed." }))) as { message?: string };
          setMessage({ ok: res.ok, text: json.message ?? (res.ok ? "File attached." : "Upload failed.") });
          if (res.ok) { if (input.current) input.current.value = ""; router.refresh(); }
        } catch { setMessage({ ok: false, text: "Upload failed. Check your connection and try again." }); }
      });
    }}>
      <Field>
        <FieldLabel htmlFor={`upload-${role}`}>{label}</FieldLabel>
        <Input ref={input} id={`upload-${role}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-describedby={`upload-${role}-hint`} />
        <FieldDescription id={`upload-${role}-hint`}>PDF, JPEG, PNG or WebP, up to 10 MB. Files are stored privately.</FieldDescription>
      </Field>
      <div><Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Uploading..." : "Upload"}</Button></div>
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm" : "text-sm text-destructive"}>{message.text}</p>}
    </form>
  );
}

/** Administrators: approve your own expense without a second reviewer. Recorded in the expense history. */
export function AdminVerifyExpense({ expenseId, version, requestKey }: { expenseId: string; version: number; requestKey: string }) {
  const [state, action, pending] = useActionState(adminVerifyExpense, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="version" value={String(version)} />
      <input type="hidden" name="key" value={requestKey} />
      <div><Button type="submit" disabled={pending}>{pending ? "Working..." : "Verify and approve as administrator"}</Button></div>
      <p className="text-xs text-muted-foreground">Approves this expense now without another reviewer. Other administrators can see that you verified it.</p>
      <Message state={state} />
    </form>
  );
}
