"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { paymentCommand } from "@/lib/sales/actions";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { TextField, ChoiceField, FormMessage } from "./form-controls";
export function PaymentForm({
  invoiceId,
  payments,
}: {
  invoiceId: string;
  payments: Record<string, unknown>[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    command: "submit",
    paymentId: "",
    amount: "",
    method: "bank_transfer",
    reference: "",
    receivedAt: "",
    evidence: "",
  });
  const [key, setKey] = useState("");
  const inFlight = useRef(false);
  const update = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));
  const run = async (requestKey: string) => {
    if (form.command === "verify" && !form.paymentId) {
      setMessage("Select the payment to verify first.");
      return;
    }
    const r = await paymentCommand({
      ...form,
      invoiceId,
      paymentId: form.paymentId || undefined,
      key: requestKey,
      receivedAt: form.receivedAt
        ? new Date(form.receivedAt).toISOString()
        : new Date().toISOString(),
    });
    if (r.ok) {
      setMessage(
        form.command === "submit"
          ? "Payment submitted for verification. Invoice is not marked paid. Use �Verify and allocate payment� next."
          : "Verified payment allocated.",
      );
      setKey("");
      setForm((f) => ({
        ...f,
        paymentId: "",
        amount: "",
        reference: "",
        receivedAt: "",
        evidence: "",
      }));
      router.refresh();
    } else setMessage(r.error);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (inFlight.current) return;
        inFlight.current = true;
        const requestKey = key || crypto.randomUUID();
        setKey(requestKey);
        start(async () => {
          try {
            await run(requestKey);
          } catch {
            setMessage("Could not save the payment. Please try again.");
          } finally {
            inFlight.current = false;
          }
        });
      }}
    >
      <FieldGroup>
        <ChoiceField
          label="Payment action"
          value={form.command}
          onChange={(v) => update("command", v)}
          options={[
            { value: "submit", label: "Record pending payment" },
            { value: "verify", label: "Verify and allocate payment" },
          ]}
        />
        {form.command === "verify" && (
          <ChoiceField
            label="Payment to verify / allocate"
            value={form.paymentId}
            onChange={(v) => {
              const p = payments.find((p) => p.id === v);
              setForm((f) => ({
                ...f,
                paymentId: v,
                reference: String(p?.reference || ""),
                amount: String(p?.amount || ""),
              }));
            }}
            options={payments.map((p) => ({
              value: String(p.id),
              label: `${p.reference} · ${p.currency} ${p.amount} · ${p.status} · allocated ${p.allocated}`,
            }))}
          />
        )}
        <TextField
          label="Amount to record / allocate"
          value={form.amount}
          onChange={(v) => update("amount", v)}
          required
        />
        <ChoiceField
          label="Method"
          value={form.method}
          onChange={(v) => update("method", v)}
          options={["bank_transfer", "mobile_money", "cash", "other"].map(
            (value) => ({ value, label: value.replaceAll("_", " ") }),
          )}
        />
        <TextField
          label="Payment reference"
          value={form.reference}
          onChange={(v) => update("reference", v)}
          required
        />
        <TextField
          label="Received time"
          value={form.receivedAt}
          type="datetime-local"
          onChange={(v) => update("receivedAt", v)}
          required={form.command === "submit"}
        />
        {form.command === "verify" && (
          <TextField
            label="Verification evidence"
            value={form.evidence}
            onChange={(v) => update("evidence", v)}
            multiline
            required
          />
        )}
        <FormMessage>{message}</FormMessage>
        <Button disabled={pending} type="submit">
          {pending ? "Processing…" : "Save payment action"}
        </Button>
      </FieldGroup>
    </form>
  );
}
