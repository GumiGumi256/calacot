import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { designPurchases } from "@/database/schema";
import { requireAdmin } from "@/lib/design-purchases/permissions";
import {
  purchaseStatuses,
  statusLabels,
  formatAmount,
  formatDate,
} from "@/lib/design-purchases/model";
import { PurchaseStatus } from "@/components/architecture/purchase-summary";

export const metadata = { title: "Design purchase administration" };
export default async function AdminPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const parsed = z.enum(purchaseStatuses).safeParse(query.status);
  const status = parsed.success ? parsed.data : undefined;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
  );
  const purchases = await db
    .select()
    .from(designPurchases)
    .where(status ? eq(designPurchases.purchaseStatus, status) : undefined)
    .orderBy(
      sql`case when ${designPurchases.purchaseStatus} = 'payment_submitted' then 0 else 1 end`,
      desc(designPurchases.createdAt),
    )
    .limit(51)
    .offset((page - 1) * 50);
  const pageLink = (n: number) =>
    `/admin/design-purchases?${new URLSearchParams({ ...(status ? { status } : {}), page: String(n) })}`;
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 pb-24 pt-28 text-foreground sm:px-8">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        Calacot Administration
      </p>
      <h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">
        Design purchases.
      </h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Review customer requests and verify payments. Submitted payments appear
        first.
      </p>
      <nav aria-label="Filter purchases" className="my-8 flex flex-wrap gap-2">
        {[
          { value: "", label: "All purchases" },
          ...purchaseStatuses.map((s) => ({
            value: s,
            label: statusLabels[s],
          })),
        ].map(({ value, label }) => (
          <Link
            key={value}
            href={`/admin/design-purchases${value ? `?status=${value}` : ""}`}
            aria-current={(status || "") === value ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-xs ${(status || "") === value ? "border-foreground bg-foreground text-background" : "border-border"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {[
                "Purchase",
                "Customer",
                "Design / package",
                "Amount",
                "Payment",
                "Created",
              ].map((heading) => (
                <th key={heading} className="px-5 py-4 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {purchases.slice(0, 50).map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-5 py-5">
                  <Link
                    href={`/admin/design-purchases/${p.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {p.purchaseReference}
                  </Link>
                  <div className="mt-2">
                    <PurchaseStatus purchase={p} />
                  </div>
                </td>
                <td className="px-5 py-5">
                  {p.customerName}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.customerPhone}
                  </p>
                </td>
                <td className="px-5 py-5">
                  {p.designTitle}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.packageName}
                  </p>
                </td>
                <td className="whitespace-nowrap px-5 py-5">
                  {formatAmount(p.amount, p.currency)}
                </td>
                <td className="px-5 py-5 capitalize">{p.paymentStatus}</td>
                <td className="whitespace-nowrap px-5 py-5">
                  {formatDate(p.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!purchases.length && (
          <p className="p-8 text-sm text-muted-foreground">
            No purchases match this filter.
          </p>
        )}
      </div>
      <nav
        aria-label="Purchase pages"
        className="mt-6 flex justify-between text-sm"
      >
        {page > 1 ? (
          <Link href={pageLink(page - 1)}>← Previous</Link>
        ) : (
          <span />
        )}
        {purchases.length > 50 && <Link href={pageLink(page + 1)}>Next →</Link>}
      </nav>
    </main>
  );
}
