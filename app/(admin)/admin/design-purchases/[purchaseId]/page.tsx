import Link from "next/link";
import { getAdminDesignPurchase } from "@/lib/design-purchases/permissions";
import { formatDate } from "@/lib/design-purchases/model";
import { PurchaseSummary } from "@/components/architecture/purchase-summary";
import { PurchaseStatus } from "@/components/architecture/purchase-status";
import {
  AdminReviewForms,
  RetryPurchaseEmailForm,
  RetryPurchaseWhatsAppForm,
} from "@/components/architecture/purchase-forms";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLeftIcon, FileTextIcon } from "lucide-react";

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
    ["WhatsApp status", p.whatsappStatus?.replaceAll("_", " ")],
    [
      "Team invoice email",
      p.invoiceTeamEmailSentAt
        ? `Accepted ${formatDate(p.invoiceTeamEmailSentAt)}`
        : "Not sent",
    ],
    [
      "Team confirmation email",
      p.confirmationTeamEmailSentAt
        ? `Accepted ${formatDate(p.confirmationTeamEmailSentAt)}`
        : "Not sent",
    ],
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
      {/* Navigation */}
      <Link
        href="/admin/design-purchases"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        All design purchases
      </Link>

      {/* Header with Title + Badge + Actions */}
      <div className="mt-4 flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
              Review purchase
            </h1>
            <PurchaseSummary purchase={p} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground font-mono">
            {p.purchaseReference}
          </p>
        </div>

        <a
          href={`/api/design-purchases/${p.id}/invoice`}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "w-fit items-center gap-2",
          })}
        >
          <FileTextIcon className="h-4 w-4" />
          Download invoice
        </a>
      </div>

      {/* Main Grid */}
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left Column: Details & Actions */}
        <div className="space-y-8">
          {/* Customer & Payment Information */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-xs">
            <h2 className="text-lg font-medium">Customer & payment details</h2>
            <dl className="mt-6 grid gap-y-4 sm:grid-cols-2 sm:gap-x-6">
              {details
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label} className="border-b border-border/50 pb-3">
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap wrap-break-word text-sm font-normal leading-relaxed">
                      {value}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>

          {/* System Operations & Retries */}
          {(p.purchaseStatus !== "cancelled" &&
            (!p.invoiceEmailSentAt ||
              !p.invoiceTeamEmailSentAt ||
              (p.purchaseStatus === "completed" &&
                (!p.confirmationEmailSentAt ||
                  !p.confirmationTeamEmailSentAt)))) ||
          (open &&
            p.preferredContactMethod === "whatsapp" &&
            ["not_started", "failed"].includes(p.whatsappStatus)) ? (
            <section className="space-y-4 rounded-xl border border-amber-200/60 bg-amber-50/40 p-6 dark:border-amber-900/40 dark:bg-amber-950/20">
              <h2 className="text-base font-medium text-amber-900 dark:text-amber-300">
                Action required / Dispatch retries
              </h2>
              {p.purchaseStatus !== "cancelled" &&
                (!p.invoiceEmailSentAt ||
                  !p.invoiceTeamEmailSentAt ||
                  (p.purchaseStatus === "completed" &&
                    (!p.confirmationEmailSentAt ||
                      !p.confirmationTeamEmailSentAt))) && (
                  <RetryPurchaseEmailForm purchaseId={p.id} />
                )}
              {open &&
                p.preferredContactMethod === "whatsapp" &&
                ["not_started", "failed"].includes(p.whatsappStatus) && (
                  <RetryPurchaseWhatsAppForm purchaseId={p.id} />
                )}
            </section>
          ) : null}

          {/* Admin Review & Decision Form */}
          {open && (
            <section className="rounded-xl border border-border bg-card p-6 shadow-xs">
              <h2 className="mb-4 text-lg font-medium">Review decision</h2>
              <AdminReviewForms
                purchaseId={p.id}
                revision={p.revision}
                submitted={p.paymentStatus === "submitted"}
              />
            </section>
          )}
        </div>

        {/* Right Sidebar */}
        <aside className="lg:sticky lg:top-28 space-y-4">
          <PurchaseStatus purchase={p} />
        </aside>
      </div>
    </main>
  );
}
