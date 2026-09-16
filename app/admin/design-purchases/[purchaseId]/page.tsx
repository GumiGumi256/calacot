import Link from "next/link";
import { getAdminDesignPurchase } from "@/lib/design-purchases/permissions";
import { formatDate } from "@/lib/design-purchases/model";
import { PurchaseSummary } from "@/components/architecture/purchase-summary";
import {
  AdminReviewForms,
  RetryPurchaseEmailForm,
} from "@/components/architecture/purchase-forms";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Review design purchase" };
export default async function AdminPurchasePage({
  params,
}: {
  params: Promise<{ purchaseId: string }>;
}) {
  const p = await getAdminDesignPurchase((await params).purchaseId);
  const open =
    p.purchaseStatus !== "completed" && p.purchaseStatus !== "cancelled";
  const details = [
    ["Name", p.customerName],
    ["Email", p.customerEmail],
    ["Phone", p.customerPhone],
    ["Preferred contact", p.preferredContactMethod],
    ["Customer note", p.customerNote],
    ["Payment method", p.paymentMethod?.replaceAll("_", " ")],
    ["Payment reference", p.paymentReference],
    [
      "Payment submitted",
      p.paymentSubmittedAt ? formatDate(p.paymentSubmittedAt) : null,
    ],
    ["Reviewed by", p.reviewedBy],
    ["Reviewed", p.reviewedAt ? formatDate(p.reviewedAt) : null],
    ["Admin notes", p.adminNotes],
    [
      "Invoice email",
      p.invoiceEmailSentAt
        ? `Sent ${formatDate(p.invoiceEmailSentAt)}`
        : "Not sent / delivery not recorded",
    ],
    [
      "Confirmation email",
      p.confirmationEmailSentAt
        ? `Sent ${formatDate(p.confirmationEmailSentAt)}`
        : "Not sent / delivery not recorded",
    ],
  ];
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 pb-24 pt-28 text-foreground sm:px-8">
      <Link
        href="/admin/design-purchases"
        className="text-sm text-muted-foreground"
      >
        ← All design purchases
      </Link>
      <h1 className="mt-7 break-words text-3xl font-medium tracking-tight sm:text-4xl">
        Review purchase.
      </h1>
      <p className="mt-3 break-all text-sm text-muted-foreground">
        {p.purchaseReference}
      </p>
      <div className="mt-9 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section>
          <h2 className="text-xl font-medium">Customer & payment</h2>
          <dl className="mt-5 divide-y divide-border">
            {details
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="py-4">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                    {value}
                  </dd>
                </div>
              ))}
          </dl>
          <a
            href={`/api/design-purchases/${p.id}/invoice`}
            className={buttonVariants({
              variant: "outline",
              className: "mt-5",
            })}
          >
            Download invoice
          </a>
          {p.purchaseStatus !== "cancelled" &&
            (!p.invoiceEmailSentAt ||
              (p.purchaseStatus === "completed" &&
                !p.confirmationEmailSentAt)) && (
              <RetryPurchaseEmailForm purchaseId={p.id} />
            )}
          {open && (
            <AdminReviewForms
              purchaseId={p.id}
              revision={p.revision}
              submitted={p.paymentStatus === "submitted"}
            />
          )}
        </section>
        <PurchaseSummary purchase={p} />
      </div>
    </main>
  );
}
