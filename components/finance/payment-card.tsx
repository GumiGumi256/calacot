"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, CheckCircle2Icon, CheckIcon, CircleCheckIcon, ClockIcon, CopyIcon, DownloadIcon, EyeIcon, FileSearchIcon, XCircleIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { paymentCommand } from "@/lib/sales/actions";
import { paymentVerifyOptions, rejectPayment, type VerifyOptions } from "@/lib/finance/payment-verify";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/format";
import type { PaymentRow } from "@/lib/admin/reads";

const methodLabels: Record<string, string> = { mobile_money: "Mobile money", bank_transfer: "Bank transfer", cash: "Cash", other: "Other" };
const kampala = (iso: string, opts: Intl.DateTimeFormatOptions) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "Africa/Kampala" }).format(d);
};

function CopyReceipt({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-card-edge bg-background px-2 py-1 font-mono text-xs font-medium">
      <span className="truncate">{value}</span>
      <button type="button" aria-label={copied ? "Receipt number copied" : `Copy receipt number ${value}`} className="-m-1 shrink-0 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }); }}>
        {copied ? <CheckIcon className="size-3.5 text-success" aria-hidden /> : <CopyIcon className="size-3.5" aria-hidden />}
      </button>
    </span>
  );
}

/**
 * Verify a payment without leaving the list: choose the invoice (preselected to the one it was recorded
 * against), the amount to apply and what was checked. Confirms it, issues the receipt and applies it.
 */
function VerifyPayment({ row }: { row: PaymentRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<VerifyOptions | null | "loading">(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [evidence, setEvidence] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const min = (a: string, b: string) => String(Math.min(Number(a), Number(b)));
  const choose = (o: VerifyOptions, id: string) => { setInvoiceId(id); const inv = o.invoices.find((i) => i.id === id); setAmount(inv ? min(o.available, inv.balance) : ""); };

  const openDialog = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setError(""); setEvidence(""); setKey(crypto.randomUUID()); setOptions("loading");
    void paymentVerifyOptions(row.id).then((o) => { setOptions(o); if (o?.suggestedInvoiceId) choose(o, o.suggestedInvoiceId); }).catch(() => setOptions(null));
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await paymentCommand({ command: "verify", invoiceId, paymentId: row.id, amount, method: row.method, reference: row.reference || "-", receivedAt: new Date(row.received_at).toISOString(), key, evidence });
      if (!r.ok) { setError("error" in r ? String(r.error) : "Could not verify this payment."); return; }
      setOpen(false);
      router.refresh();
    });
  };
  const loaded = options && options !== "loading" ? options : null;
  const selected = loaded?.invoices.find((i) => i.id === invoiceId);

  return (
    <>
      <Button size="sm" className="min-h-11 sm:min-h-0" onClick={() => openDialog(true)}><CircleCheckIcon aria-hidden />Verify &amp; issue receipt</Button>
      <Dialog open={open} onOpenChange={openDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify payment</DialogTitle>
            <DialogDescription className="tabular-nums">{formatMoney(row.currency, row.amount)} · {methodLabels[row.method] ?? row.method}{row.reference ? ` · ${row.reference}` : ""}</DialogDescription>
          </DialogHeader>
          {options === "loading" ? <p className="text-sm text-muted-foreground" role="status">Loading…</p>
            : !loaded ? <p className="text-sm text-destructive" role="alert">Already handled. Refresh the list.</p>
            : loaded.invoices.length === 0 ? <RejectInstead row={row} duplicateOf={loaded.duplicateOf} onDone={() => { setOpen(false); router.refresh(); }} />
            : (
              <form onSubmit={submit} className="flex flex-col gap-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor={`vp-inv-${row.id}`}>Apply to invoice</FieldLabel>
                    <NativeSelect wrapperClassName="w-full" id={`vp-inv-${row.id}`} value={invoiceId} onChange={(e) => choose(loaded, e.target.value)} required>
                      {loaded.invoices.map((i) => <option key={i.id} value={i.id}>{i.number ?? "Draft"} · due {formatMoney(row.currency, i.balance)}{i.id === loaded.suggestedInvoiceId && loaded.invoices.length > 1 ? " (recorded against)" : ""}</option>)}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`vp-amt-${row.id}`}>Amount to apply ({row.currency})</FieldLabel>
                    <Input id={`vp-amt-${row.id}`} inputMode="decimal" required pattern="\d{1,15}(\.\d{1,2})?" value={amount} onChange={(e) => setAmount(e.target.value.trim())} className="tabular-nums" />
                    {selected && Number(selected.balance) < Number(loaded.available) && <FieldDescription>Invoice due: {formatMoney(row.currency, selected.balance)}</FieldDescription>}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`vp-ev-${row.id}`}>Checked against</FieldLabel>
                    <Input id={`vp-ev-${row.id}`} required minLength={3} maxLength={2000} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. Centenary statement, 6 Oct" />
                  </Field>
                </FieldGroup>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <DialogFooter><Button type="submit" disabled={pending || !invoiceId}>{pending ? "Verifying…" : "Verify & issue receipt"}</Button></DialogFooter>
              </form>
            )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Shown in the verify dialog when the client has no open invoice. Usually a duplicate: say which receipt it
 * repeats and reject it in one tap (reason prefilled). Otherwise reject with a reason, or go issue an invoice.
 */
function RejectInstead({ row, duplicateOf, onDone }: { row: PaymentRow; duplicateOf: VerifyOptions["duplicateOf"]; onDone: () => void }) {
  const [reason, setReason] = useState(duplicateOf ? `Duplicate of ${duplicateOf.receipt ?? "a confirmed payment"}` : "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const reject = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await rejectPayment(row.id, reason);
      if (!r.ok) { setError(r.message); return; }
      onDone();
    });
  };
  return (
    <form onSubmit={reject} className="flex flex-col gap-4">
      {duplicateOf ? (
        <p className="flex gap-2 rounded-(--control-radius) bg-warning-soft px-3 py-2.5 text-sm">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>Already paid: <span className="font-medium">{duplicateOf.receipt ?? "confirmed payment"}</span> · {kampala(duplicateOf.receivedAt, { day: "numeric", month: "short" })}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No open invoice for {row.client}.</p>
      )}
      <Field>
        <FieldLabel htmlFor={`rj-${row.id}`}>Reason</FieldLabel>
        <Input id={`rj-${row.id}`} required minLength={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" />
      </Field>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
        {!duplicateOf ? <Button variant="ghost" size="sm" render={<Link href={`/admin/invoices?search=${encodeURIComponent(row.client)}`} />}>Issue invoice</Button> : <span />}
        <Button type="submit" variant="destructive" disabled={pending}><XCircleIcon aria-hidden />{pending ? "Rejecting…" : duplicateOf ? "Reject duplicate" : "Reject payment"}</Button>
      </DialogFooter>
    </form>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="min-w-0 text-sm">{children}</dd></div>;
}

/** Phone card for one customer payment: who paid, how much, receipt, allocation, ledger state and the next step. */
export function PaymentCard({ row, actions, canSeeClients, canSeeInvoices, canVerify }: { row: PaymentRow; actions: ReactNode; canSeeClients: boolean; canSeeInvoices: boolean; canVerify: boolean }) {
  const confirmed = row.status === "confirmed", submitted = row.status === "submitted";
  const unallocated = Number(row.unallocated);
  const firstInvoice = row.invoices[0];
  const name = canSeeClients
    ? <Link className="font-semibold break-words underline-offset-4 hover:underline" href={`/admin/clients/${row.client_id}`}>{row.client}</Link>
    : <span className="font-semibold break-words">{row.client}</span>;

  const allocation = confirmed
    ? unallocated <= 0
      ? <span className="inline-flex flex-wrap items-center gap-x-1.5"><span className="inline-flex items-center gap-1 font-medium text-success"><CheckCircle2Icon className="size-4" aria-hidden />Fully allocated</span><span className="text-muted-foreground">· {formatMoney(row.currency, 0)}</span></span>
      : <span className="inline-flex flex-wrap items-center gap-x-1.5"><span className="inline-flex items-center gap-1 font-medium text-warning"><AlertCircleIcon className="size-4" aria-hidden />Unallocated</span><span className="tabular-nums">{formatMoney(row.currency, row.unallocated)}</span></span>
    : submitted
      ? <span className="inline-flex flex-wrap items-center gap-x-1.5"><span aria-hidden className="size-1.5 rounded-full bg-muted-foreground" /><span className="font-medium tabular-nums">{formatMoney(row.currency, row.amount)}</span><span className="text-muted-foreground">(on hold)</span></span>
      : <span className="inline-flex items-center gap-1 text-muted-foreground"><XCircleIcon className="size-4" aria-hidden />Not allocated</span>;

  const ledger = confirmed ? "Posted to client ledger" : submitted ? "Awaiting finance check" : "Not posted (rejected)";

  // Footer. Awaiting: details on the left, verify (the next step) on the right for staff who can verify.
  // Confirmed: receipt and allocation on the left, PDF on the right.
  const invoiceHref = firstInvoice ? `/admin/invoices/${firstInvoice.id}` : null;
  const details = canSeeInvoices && invoiceHref ? { href: invoiceHref, label: confirmed ? "View receipt & allocation" : "View details" }
    : canSeeClients ? { href: `/admin/clients/${row.client_id}`, label: "View client" } : null;
  const verify = submitted && canVerify && canSeeInvoices;
  const pdf = confirmed && row.receipt_number ? `/api/sales/payments/${row.id}/receipt` : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {name}
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span>{methodLabels[row.method] ?? row.method}</span>
            {row.reference && <><span aria-hidden>•</span><span className="min-w-0 max-w-full truncate font-mono">{row.reference}</span></>}
          </span>
        </div>
        <div className="-mr-2 flex shrink-0 items-center gap-0.5"><StatusBadge domain="payment" status={row.status} />{actions}</div>
      </div>

      <div>
        <p className="type-eyebrow text-muted-foreground">Payment amount</p>
        <p className="type-metric tabular-nums">{formatMoney(row.currency, row.amount)}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-4">
        <Cell label="Receipt">{row.receipt_number ? <CopyReceipt value={row.receipt_number} />
          : submitted ? <span className="inline-flex items-center gap-1 font-medium text-warning"><ClockIcon className="size-4" aria-hidden />Pending receipt</span>
          : <span className="text-muted-foreground">None</span>}</Cell>
        <Cell label="Allocation">{allocation}</Cell>
        <Cell label="Received"><span className="font-medium">{kampala(row.received_at, { day: "numeric", month: "short", year: "numeric" })}</span><span className="text-muted-foreground"> · {kampala(row.received_at, { hour: "2-digit", minute: "2-digit", hour12: false })} EAT</span></Cell>
        <Cell label="Ledger status"><span className="font-medium">{ledger}</span></Cell>
      </dl>

      {(details || verify || pdf) && (
        <div className="-mx-4 -mb-4 flex items-center justify-between gap-2 border-t border-card-edge px-4 py-3">
          {details ? <Button variant="ghost" size="sm" className="min-h-11 px-2 sm:min-h-0" render={<Link href={details.href} />}>{confirmed ? <EyeIcon aria-hidden /> : <FileSearchIcon aria-hidden />}{details.label}</Button> : <span />}
          {verify && <VerifyPayment row={row} />}
          {pdf && <Button variant="outline" size="sm" className="min-h-11 sm:min-h-0" render={<a href={pdf} />}><DownloadIcon aria-hidden />PDF</Button>}
        </div>
      )}
    </div>
  );
}
