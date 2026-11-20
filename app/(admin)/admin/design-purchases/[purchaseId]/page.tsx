import { getAdminDesignPurchase } from "@/lib/design-purchases/permissions";
import { formatAmount, formatDate } from "@/lib/design-purchases/model";
import { PurchaseStatus } from "@/components/architecture/purchase-status";
import {
  AdminReviewForms,
  RetryPurchaseEmailForm,
  RetryPurchaseWhatsAppForm,
} from "@/components/architecture/purchase-forms";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { PageContainer } from "@/components/layout/page-container";
import { FileTextIcon, TriangleAlertIcon } from "lucide-react";

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
    <PageContainer>
      <PageHeader
        title={<span className="tabular-nums">{p.purchaseReference}</span>}
        description={<>{p.designTitle} · {p.packageName} · {formatAmount(p.amount, p.currency)}</>}
        meta={<><StatusBadge domain="designPurchase" status={p.purchaseStatus} /><StatusBadge domain="payment" status={p.paymentStatus} /></>}
        secondaryActions={
          <Button variant="outline" nativeButton={false} render={<a href={`/api/design-purchases/${p.id}/invoice`} />}>
            <FileTextIcon /> Download invoice
          </Button>
        }
      />

      {/* Main Grid */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Left Column: Details & Actions */}
        <div className="flex min-w-0 flex-col gap-6">
          {/* Customer & Payment Information */}
          <section className="surface-card p-4 sm:p-6">
            <h2 className="type-card-title">Customer & payment details</h2>
            <dl className="mt-6 grid gap-y-4 sm:grid-cols-2 sm:gap-x-6">
              {details
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label} className="border-b border-border pb-3">
                    <dt className="type-eyebrow text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap wrap-break-word type-body">
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
            <section aria-labelledby="dispatch-title" className="flex flex-col gap-4 surface-card p-4 sm:p-6">
              <h2 id="dispatch-title" className="flex items-center gap-2 type-card-title">
                <TriangleAlertIcon aria-hidden className="size-4 text-warning" />
                Messages to resend
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
            <section className="surface-card p-4 sm:p-6">
              <h2 className="mb-4 type-card-title">Review decision</h2>
              <AdminReviewForms
                purchaseId={p.id}
                revision={p.revision}
                submitted={p.paymentStatus === "submitted"}
              />
            </section>
          )}
        </div>

        {/* Right Sidebar */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
          <PurchaseStatus purchase={p} />
        </aside>
      </div>
    </PageContainer>
  );
}
