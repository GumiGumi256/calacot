import type { DesignPurchaseRecord } from "@/database/schema";
import {
  formatAmount,
  formatDate,
  statusLabels,
} from "@/lib/design-purchases/model";

export function PurchaseStatus({
  purchase: p,
}: {
  purchase: DesignPurchaseRecord;
}) {
  const label =
    p.purchaseStatus === "cancelled"
      ? "Cancelled"
      : p.paymentStatus === "rejected"
        ? "Payment needs correction"
        : statusLabels[p.purchaseStatus];
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1.5 text-xs ${p.purchaseStatus === "payment_submitted" ? "border-brand-primary/50 bg-brand-primary/15" : "border-border bg-muted/40"}`}
    >
      {label}
    </span>
  );
}
export function PurchaseSummary({
  purchase: p,
}: {
  purchase: DesignPurchaseRecord;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <PurchaseStatus purchase={p} />
      <h2 className="mt-5 break-words text-2xl font-medium tracking-tight">
        {p.designTitle}
      </h2>
      {p.designCode && (
        <p className="mt-1 text-xs text-muted-foreground">{p.designCode}</p>
      )}
      <p className="mt-5 text-base font-medium">{p.packageName}</p>
      {p.packageDescription && (
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          {p.packageDescription}
        </p>
      )}
      <ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-6 text-muted-foreground">
        {p.packageIncludes.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
      <dl className="mt-7 space-y-4 border-t border-border pt-6 text-sm">
        {[
          ["Purchase reference", p.purchaseReference],
          ["Invoice", p.invoiceNumber],
          ["Requested", formatDate(p.createdAt)],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-border pt-5">
          <dt>Total</dt>
          <dd className="text-2xl font-medium tracking-tight">
            {formatAmount(p.amount, p.currency)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
