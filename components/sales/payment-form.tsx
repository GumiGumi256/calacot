"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { paymentCommand } from "@/lib/sales/actions";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { TextField, ChoiceField, FormMessage } from "./form-controls";
import { ShareDocument } from "./share-document";

type Payment = Record<string, unknown>;

export function PaymentForm({ invoiceId, payments, currency, balance, canDownloadReceipts }: {
  invoiceId: string; payments: Payment[]; currency: string; balance: string; canDownloadReceipts: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<"submit" | "verify">("submit");
  const [message, setMessage] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [evidence, setEvidence] = useState("");
  const [key, setKey] = useState("");
  const inFlight = useRef(false);
  const due = Number(balance);
  const eligible = payments.filter((p) => p.status !== "rejected" && Number(p.available) > 0 && Number(p.applied_here) === 0);
  const selected = eligible.find((p) => p.id === paymentId);
  const applied = payments.filter((p) => Number(p.applied_here) > 0);
  const candidate = Number(amount);
  const max = selected ? Math.min(Number(selected.available), due) : 0;
  const canPreview = step === "verify" && !!selected && /^\d{1,15}(\.\d{1,2})?$/.test(amount) && candidate > 0 && candidate <= max;

  function chooseStep(next: "submit" | "verify") {
    setStep(next); setMessage(""); setKey(""); setPaymentId(""); setAmount(""); setEvidence("");
  }
  function choosePayment(id: string) {
    const payment = eligible.find((p) => p.id === id);
    setPaymentId(id);
    setAmount(payment ? String(Math.max(0, Math.min(Number(payment.available), due))) : "");
    setEvidence(""); setKey(""); setMessage("");
  }
  async function save(requestKey: string) {
    if (step === "verify" && !selected) { setMessage("Select an available payment first."); return; }
    if (step === "verify" && !canPreview) { setMessage("Enter an amount greater than zero that does not exceed the available payment or invoice balance."); return; }
    const result = await paymentCommand({
      command: step, invoiceId, paymentId: step === "verify" ? paymentId : undefined,
      amount, method: step === "verify" ? String(selected?.method) : method,
      reference: step === "verify" ? String(selected?.reference) : reference,
      receivedAt: step === "submit" ? new Date(receivedAt).toISOString() : new Date().toISOString(),
      evidence: step === "verify" ? evidence : "", key: requestKey,
    });
    if (!result.ok) { setMessage(result.error); return; }
    setKey(""); setAmount(""); setEvidence(""); setReference(""); setReceivedAt("");
    if (step === "submit") {
      setStep("verify"); setPaymentId(result.value);
      setMessage("Payment recorded and awaiting verification. Once the list refreshes, enter the amount to apply and the verification evidence.");
    } else {
      setPaymentId(""); setMessage("Payment applied. The balance has been updated and a client confirmation has been queued; see delivery status below.");
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">Current amount due</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(currency, balance)}</p>
        <p className="mt-2 text-sm text-muted-foreground">Only verified payments applied to this invoice reduce this balance.</p>
      </div>
      {applied.length > 0 && <div className="space-y-2">
        <h3 className="font-semibold">Payments applied to this invoice</h3>
        <p className="text-sm text-muted-foreground">Amounts shown are original allocations; the balance above also reflects credits and refunds.</p>
        <ul className="divide-y rounded-lg border">{applied.map((p) => <li key={String(p.id)} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <span><span className="font-medium">{String(p.reference)}</span><span className="block text-muted-foreground">{p.receipt_number ? `Receipt ${p.receipt_number} · ` : ""}{formatDateTime(String(p.received_at))}</span></span>
          <span className="font-medium tabular-nums">{formatMoney(currency, String(p.applied_here))} applied</span>
          {canDownloadReceipts && p.status === "confirmed" && !!p.receipt_number && <a className="underline underline-offset-4" href={`/api/sales/payments/${p.id}/receipt`}>Download receipt</a>}
          {canDownloadReceipts && p.status === "confirmed" && !!p.receipt_number && <ShareDocument kind="receipt" id={String(p.id)} />}
        </li>)}</ul>
      </div>}
      <div className="flex flex-wrap gap-2" aria-label="Payment steps">
        <Button type="button" variant={step === "submit" ? "default" : "outline"} aria-pressed={step === "submit"} onClick={() => chooseStep("submit")} disabled={pending}>1. Record payment</Button>
        <Button type="button" variant={step === "verify" ? "default" : "outline"} aria-pressed={step === "verify"} onClick={() => chooseStep("verify")} disabled={pending}>2. Verify and apply{eligible.length ? ` (${eligible.length})` : ""}</Button>
      </div>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (inFlight.current) return;
        inFlight.current = true;
        const requestKey = key || crypto.randomUUID(); setKey(requestKey);
        start(async () => { try { await save(requestKey); } catch { setMessage("Could not save the payment. Please try again."); } finally { inFlight.current = false; } });
      }}>
        <FieldGroup>
          {step === "submit" ? <>
            <div><h3 className="font-semibold">Record money received</h3><p className="mt-1 text-sm text-muted-foreground">Save the payment details first. The balance will not change until the payment is verified and applied.</p></div>
            <TextField label={`Amount received (${currency})`} value={amount} onChange={setAmount} required placeholder="For example, 500000" />
            <ChoiceField label="Payment method" value={method} onChange={setMethod} options={[
              { value: "bank_transfer", label: "Bank transfer" }, { value: "mobile_money", label: "Mobile money" }, { value: "cash", label: "Cash" }, { value: "other", label: "Other" },
            ]} />
            <TextField label="Payment reference" value={reference} onChange={setReference} required hint="Use the bank or mobile money reference, or a cash receipt reference." />
            <TextField label="Date and time received" value={receivedAt} type="datetime-local" onChange={setReceivedAt} required />
          </> : <>
            <div><h3 className="font-semibold">Verify and apply a payment</h3><p className="mt-1 text-sm text-muted-foreground">Check the payment against your evidence, then choose how much to apply to this invoice.</p></div>
            {eligible.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No available payments to apply. Record a payment first, or check that the payment has not already been applied.</p> : <>
              <ChoiceField label="Payment" value={paymentId} onChange={choosePayment} placeholder="Select a payment" options={eligible.map((p) => ({ value: String(p.id), label: `${p.reference} · ${formatMoney(currency, String(p.available))} available · ${p.status === "submitted" ? "Awaiting verification" : "Verified"}` }))} />
              {selected && <>
                <div className="rounded-lg border bg-muted/30 p-4 text-sm"><p><span className="text-muted-foreground">Payment received: </span>{formatMoney(currency, String(selected.amount))} · {String(selected.method).replaceAll("_", " ")}</p><p className="mt-1"><span className="text-muted-foreground">Available to apply: </span>{formatMoney(currency, String(selected.available))}</p><p className="mt-1 text-muted-foreground">{selected.status === "submitted" ? "Awaiting verification" : "Already verified"} · {formatDateTime(String(selected.received_at))}</p></div>
                <TextField label={`Amount to apply (${currency})`} value={amount} onChange={setAmount} required hint={`Up to ${formatMoney(currency, String(max))} can be applied to this invoice.`} />
                {canPreview && <p className="rounded-lg bg-muted/30 p-3 text-sm">Balance after applying: <strong className="tabular-nums">{formatMoney(currency, Math.max(0, due - candidate))}</strong></p>}
                {selected.status === "submitted" && <TextField label="Verification evidence" value={evidence} onChange={setEvidence} multiline required hint="For example, the bank statement or mobile money transaction checked." />}
              </>}
            </>}
          </>}
          <FormMessage>{message}</FormMessage>
          <Button disabled={pending || (step === "verify" && (!selected || due <= 0))} type="submit">{pending ? "Saving…" : step === "submit" ? "Record pending payment" : selected?.status === "confirmed" ? "Apply payment" : "Verify and apply payment"}</Button>
        </FieldGroup>
      </form>
    </div>
  );
}
