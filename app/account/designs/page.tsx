import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/database/db";
import { designPurchases } from "@/database/schema";
import { requireUser } from "@/lib/design-purchases/permissions";
import {
  formatAmount,
  formatDate,
  canAccessDesign,
} from "@/lib/design-purchases/model";
import { purchaseWhatsAppUrl } from "@/lib/company";
import { PurchaseStatus } from "@/components/architecture/purchase-summary";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "My designs" };
export default async function MyDesignsPage() {
  const userId = await requireUser();
  const purchases = await db
    .select()
    .from(designPurchases)
    .where(eq(designPurchases.clerkUserId, userId))
    .orderBy(desc(designPurchases.createdAt));
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 pb-24 pt-28 text-foreground sm:px-8">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        Your Calacot account
      </p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
        <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
          My designs.
        </h1>
        <Link
          href="/architecture/designs"
          className="text-sm underline underline-offset-4"
        >
          Explore architectural designs
        </Link>
      </div>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        Your selections, invoices and purchased designs, all in one place.
      </p>
      {!purchases.length ? (
        <div className="mt-12 rounded-2xl border border-border p-8 sm:p-12">
          <h2 className="text-2xl">You haven&apos;t purchased a design yet.</h2>
          <Link
            href="/architecture/designs"
            className={buttonVariants({ className: "mt-6" })}
          >
            Explore architectural designs
          </Link>
        </div>
      ) : (
        <div className="mt-10 divide-y divide-border border-y border-border">
          {purchases.map((p) => {
            const whatsapp = purchaseWhatsAppUrl(p);
            return (
              <article
                key={p.id}
                className="grid gap-5 py-8 sm:grid-cols-[1fr_auto]"
              >
                <div>
                  <PurchaseStatus purchase={p} />
                  <h2 className="mt-4 text-2xl font-medium tracking-tight">
                    <Link href={`/account/designs/${p.id}`}>
                      {p.designTitle}
                    </Link>
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {p.packageName}
                  </p>
                  <p className="mt-3 break-all text-xs text-muted-foreground">
                    {p.purchaseReference} · {formatDate(p.createdAt)}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xl font-medium">
                    {formatAmount(p.amount, p.currency)}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-4 text-sm sm:justify-end">
                    <Link
                      href={`/account/designs/${p.id}`}
                      className="underline underline-offset-4"
                    >
                      {p.purchaseStatus === "awaiting_payment"
                        ? "Complete purchase"
                        : "View purchase"}
                    </Link>
                    {p.purchaseStatus !== "cancelled" && (
                      <a
                        href={`/api/design-purchases/${p.id}/invoice`}
                        className="underline underline-offset-4"
                      >
                        Download invoice
                      </a>
                    )}
                    {p.purchaseStatus === "awaiting_contact" && whatsapp && (
                      <a
                        href={whatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4"
                      >
                        WhatsApp Calacot
                      </a>
                    )}
                  </div>
                  {canAccessDesign(p) && (
                    <div className="mt-4 flex flex-wrap gap-4 text-sm sm:justify-end">
                      <Link
                        href={`/architecture/designs/${encodeURIComponent(p.designSlug)}`}
                        className="underline underline-offset-4"
                      >
                        View design
                      </Link>
                      <Link
                        href={`/start-project?service=architecture&design=${encodeURIComponent(p.designSlug)}`}
                        className="underline underline-offset-4"
                      >
                        Request customisation
                      </Link>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
