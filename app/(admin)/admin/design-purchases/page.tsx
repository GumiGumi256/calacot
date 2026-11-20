import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ChevronLeftIcon, ChevronRightIcon, MessageCircleIcon } from "lucide-react";
import { db } from "@/database/db";
import { designPurchases } from "@/database/schema";
import { requireAdmin } from "@/lib/design-purchases/permissions";
import { purchaseStatuses, formatAmount, formatDate } from "@/lib/design-purchases/model";
import { statusRegistry } from "@/lib/ui/status";
import { PageHeader } from "@/components/layout/page-header";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Design purchase administration" };

/*
 * Design purchases on the admin layout (Phase 6): PageHeader, status chips, the shared table
 * surface and badges. Query, ordering (submitted payments first) and paging are unchanged.
 */
export default async function AdminPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const parsed = z.enum(purchaseStatuses).safeParse(query.status);
  const status = parsed.success ? parsed.data : undefined;
  const page = Math.min(10000, Math.max(1, Number.parseInt(query.page || "1", 10) || 1));

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
  const rows = purchases.slice(0, 50);
  const hasNext = purchases.length > 50;

  const pageLink = (n: number) =>
    `/admin/design-purchases?${new URLSearchParams({ ...(status ? { status } : {}), page: String(n) })}`;
  const chips = [{ value: "", label: "All" }, ...purchaseStatuses.map((s) => ({ value: s, label: statusRegistry.designPurchase[s].label }))];

  return (
    <PageContainer>
      <PageHeader
        title="Design purchases"
        description="Review customer requests for architectural designs and verify their payments. Submitted payments are listed first."
        secondaryActions={
          <Button variant="outline" nativeButton={false} render={<Link href="/admin/customer-care" />}>
            <MessageCircleIcon /> Customer care inbox
          </Button>
        }
      />

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {chips.map(({ value, label }) => {
          const active = (status || "") === value;
          return (
            <Link
              key={value}
              href={`/admin/design-purchases${value ? `?status=${value}` : ""}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-(--control-h-sm) items-center rounded-full border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="surface-card overflow-hidden">
          {status ? (
            <EmptyState kind="filtered-out" action={<Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/design-purchases" />}>Show all purchases</Button>} />
          ) : (
            <EmptyState kind="no-records" title="No design purchases yet" description="Purchases appear here when a customer requests a design from the architecture catalogue." />
          )}
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table aria-label="Design purchases" className="min-w-[46rem] [&_td]:align-top">
            <TableHeader className="bg-surface-subtle">
              <TableRow className="hover:bg-transparent">
                {["Purchase", "Customer", "Design / package", "Amount", "Status", "Payment", "Created"].map((h, i) => (
                  <TableHead key={h} className={cn("h-10 px-3 type-table-head first:pl-4", i === 3 && "text-right")}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="px-3 py-3 pl-4">
                    <Link href={`/admin/design-purchases/${p.id}`} className="rounded-sm font-medium tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                      {p.purchaseReference}
                    </Link>
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <div className="font-medium">{p.customerName}</div>
                    <div className="type-caption">{p.customerPhone}</div>
                  </TableCell>
                  <TableCell className="max-w-64 px-3 py-3 whitespace-normal">
                    <div>{p.designTitle}</div>
                    <div className="type-caption">{p.packageName}</div>
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right font-medium tabular-nums">{formatAmount(p.amount, p.currency)}</TableCell>
                  <TableCell className="px-3 py-3"><StatusBadge domain="designPurchase" status={p.purchaseStatus} /></TableCell>
                  <TableCell className="px-3 py-3"><StatusBadge domain="payment" status={p.paymentStatus} /></TableCell>
                  <TableCell className="px-3 py-3 text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {(page > 1 || hasNext) && (
        <nav aria-label="Purchase pages" className="flex items-center justify-between gap-4">
          <span className="type-caption">Page {page}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} nativeButton={page <= 1} render={page <= 1 ? undefined : <Link href={pageLink(page - 1)} />}>
              <ChevronLeftIcon /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext} nativeButton={!hasNext} render={hasNext ? <Link href={pageLink(page + 1)} /> : undefined}>
              Next <ChevronRightIcon />
            </Button>
          </div>
        </nav>
      )}
    </PageContainer>
  );
}
