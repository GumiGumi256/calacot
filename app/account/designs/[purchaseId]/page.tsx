import Link from "next/link";
import {
  requireUser,
  getOwnedDesignPurchase,
} from "@/lib/design-purchases/permissions";
import { canAccessDesign, formatAmount } from "@/lib/design-purchases/model";
import { paymentInstructions, purchaseWhatsAppUrl } from "@/lib/company";
import { PurchaseSummary } from "@/components/architecture/purchase-summary";
import {
  PaymentReferenceForm,
  PurchaseAssistanceForm,
} from "@/components/architecture/purchase-forms";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Your design purchase" };
export default async function DesignPurchasePage({
  params,
}: {
  params: Promise<{ purchaseId: string }>;
}) {
  const { purchaseId } = await params;
  const userId = await requireUser(`/account/designs/${purchaseId}`);
  const p = await getOwnedDesignPurchase(purchaseId, userId);
  const instructions = paymentInstructions();
  const mobile =
    instructions.mobile?.currency === p.currency ? instructions.mobile : null;
  const bank =
    instructions.bank?.currency === p.currency ? instructions.bank : null;
  const whatsapp = purchaseWhatsAppUrl(p);
  const payable =
    p.purchaseStatus === "awaiting_payment" ||
    p.purchaseStatus === "awaiting_contact";
  const active = canAccessDesign(p);
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 pb-24 pt-28 text-foreground sm:px-8">
      <Link
        href="/account/designs"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← My designs
      </Link>
      <header className="my-9">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Calacot Architecture
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl font-medium tracking-tight sm:text-5xl">
          {p.purchaseStatus === "cancelled"
            ? "Your request is cancelled."
            : active
              ? "Your design is purchased."
              : "Your design request is confirmed."}
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          {p.purchaseStatus === "cancelled"
            ? "This request is closed. Contact our team if you need assistance."
            : "Your selection is saved. You can return to this page through your account at any time."}
        </p>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
        <section className="min-w-0">
          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/design-purchases/${p.id}/invoice`}
              className={buttonVariants({ variant: "outline" })}
            >
              Download invoice
            </a>
            {whatsapp && payable && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({
                  className: "h-auto min-h-11 whitespace-normal py-3",
                })}
              >
                Complete purchase on WhatsApp
              </a>
            )}
          </div>
          {p.paymentStatus === "submitted" &&
            p.purchaseStatus !== "cancelled" && (
              <div
                role="status"
                className="mt-8 rounded-xl border border-brand-primary/40 bg-brand-primary/10 p-6"
              >
                <h2 className="font-medium">
                  Payment submitted for verification.
                </h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Our team is reviewing reference {p.paymentReference}. Access
                  will become active after confirmation.
                </p>
              </div>
            )}
          {active && (
            <div className="mt-8 rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium">Access is active</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Your purchase is confirmed. The Calacot team will make your
                design documents available through your account.
              </p>
              <Link
                href={`/start-project?service=architecture&design=${encodeURIComponent(p.designSlug)}`}
                className="mt-4 inline-block text-sm underline underline-offset-4"
              >
                Request customisation
              </Link>
            </div>
          )}
          {p.purchaseStatus === "awaiting_payment" && (
            <PurchaseAssistanceForm purchaseId={p.id} />
          )}
          {p.purchaseStatus === "awaiting_contact" && (
            <p
              role="status"
              className="mt-5 text-sm leading-7 text-muted-foreground"
            >
              Your request is with Calacot. Our team will contact you using your
              preferred method. You can also complete payment below.
            </p>
          )}
          {payable && (
            <>
              {p.paymentStatus === "rejected" && (
                <p
                  role="status"
                  className="mt-6 rounded-xl border border-border p-4 text-sm leading-7"
                >
                  We couldn&apos;t verify your previous payment reference. Check
                  your receipt and submit a corrected reference, or contact
                  Calacot for help.
                </p>
              )}
              <h2 className="mt-9 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                How to pay
              </h2>
              <p className="mt-3 text-2xl font-medium">
                {formatAmount(p.amount, p.currency)}
              </p>
              <p className="mt-2 break-words text-sm leading-7 text-muted-foreground">
                Use {p.purchaseReference} as your payment narration where
                possible.
              </p>
              <div className="mt-6 space-y-5">
                {mobile && (
                  <section className="rounded-xl border border-border p-5">
                    <h3 className="font-medium">Mobile Money</h3>
                    <dl className="mt-4 space-y-3 text-sm">
                      {[
                        ["Network", mobile.network],
                        ["Number", mobile.number],
                        ["Account name", mobile.account],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-xs text-muted-foreground">{k}</dt>
                          <dd className="mt-1 break-words">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
                {bank && (
                  <section className="rounded-xl border border-border p-5">
                    <h3 className="font-medium">Bank transfer</h3>
                    <dl className="mt-4 space-y-3 text-sm">
                      {[
                        ["Bank", bank.name],
                        ["Account number", bank.number],
                        ["Account name", bank.account],
                        ...(bank.swift ? [["SWIFT", bank.swift]] : []),
                      ].map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-xs text-muted-foreground">{k}</dt>
                          <dd className="mt-1 break-words">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
                {!mobile && !bank && (
                  <p className="rounded-xl bg-muted/50 p-5 text-sm leading-7 text-muted-foreground">
                    Contact Calacot with your purchase reference for payment
                    instructions.{" "}
                    <Link
                      href="/contact"
                      className="underline underline-offset-4"
                    >
                      Contact our team
                    </Link>
                    .
                  </p>
                )}
              </div>
              <PaymentReferenceForm purchaseId={p.id} />
            </>
          )}
        </section>
        <PurchaseSummary purchase={p} />
      </div>
    </main>
  );
}
