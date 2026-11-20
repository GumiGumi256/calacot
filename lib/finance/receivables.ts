import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { listBase } from "@/lib/sales/queries";
import { staffContext } from "@/lib/sales/permissions";
import { adminCache } from "@/lib/cache-tags";

/**
 * Receivables overview for the Payments and Invoices pages. Invoice balances and the
 * overdue rule come from the existing sales list query (listBase -> balanceExpression and
 * its `payment` classification); nothing here recalculates an invoice balance.
 * Unallocated funds mirror the available-funds check in sales_payment():
 * amount - allocations - completed refunds.
 */
export async function readReceivables(org: string) {
  "use cache: remote";
  adminCache(org);
  const invoices = listBase(org, "invoices");
  const available = sql`SELECT p.id,p.receipt_number,p.client_id,c.display_name AS client,p.currency,p.amount::text AS amount,p.received_at::text AS received_at,
      (p.amount-coalesce((SELECT sum(a.amount) FROM payment_allocations a WHERE a.organization_id=p.organization_id AND a.payment_id=p.id),0)
        -coalesce((SELECT sum(f.amount) FROM payment_refunds f WHERE f.organization_id=p.organization_id AND f.payment_id=p.id AND f.status='completed'),0)) AS available
    FROM payments p JOIN clients c ON c.id=p.client_id AND c.organization_id=p.organization_id
    WHERE p.organization_id=${org} AND p.status='confirmed'`;
  const [balances, pending, unallocated, stalePending, overdue, unallocatedSummary] = await Promise.all([
    db.execute<{ currency: string; outstanding: string; open: number; overdue: string; overdue_count: number }>(sql`WITH b AS (${invoices})
      SELECT currency,coalesce(sum(balance::numeric),0)::text AS outstanding,count(*) FILTER (WHERE balance::numeric>0)::int AS open,
        coalesce(sum(balance::numeric) FILTER (WHERE payment='overdue'),0)::text AS overdue,count(*) FILTER (WHERE payment='overdue')::int AS overdue_count
      FROM b WHERE status='issued' GROUP BY currency ORDER BY currency`),
    db.execute<{ currency: string; count: number; amount: string; oldest: string }>(sql`SELECT currency,count(*)::int AS count,sum(amount)::text AS amount,min(received_at)::text AS oldest FROM payments WHERE organization_id=${org} AND status='submitted' GROUP BY currency ORDER BY currency`),
    db.execute<{ id: string; receipt_number: string | null; client_id: string; client: string; currency: string; amount: string; unallocated: string; received_at: string }>(sql`SELECT id,receipt_number,client_id,client,currency,amount,received_at,available::text AS unallocated FROM (${available}) u WHERE available>0 ORDER BY received_at,id LIMIT 20`),
    db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM payments WHERE organization_id=${org} AND status='submitted' AND received_at<now()-interval '7 days'`),
    db.execute<{ id: string; number: string; client: string; client_id: string; currency: string; balance: string; due: string }>(sql`WITH b AS (${invoices}) SELECT id,number,client,client_id,currency,balance,due FROM b WHERE payment='overdue' ORDER BY due,id LIMIT 10`),
    db.execute<{ currency: string; count: number; amount: string }>(sql`SELECT currency,count(*)::int AS count,sum(available)::text AS amount FROM (${available}) u WHERE available>0 GROUP BY currency ORDER BY currency`),
  ]);
  const unallocatedTotals = unallocatedSummary.rows;
  const unallocatedCount = unallocatedTotals.reduce((n, r) => n + r.count, 0);
  const exceptions = [
    stalePending.rows[0]?.count ? { label: `${stalePending.rows[0].count} payment(s) awaiting verification for more than 7 days`, href: "/admin/payments?status=submitted" } : null,
    unallocatedCount ? { label: `${unallocatedCount} confirmed payment(s) with unallocated funds`, href: "/admin/payments?status=confirmed" } : null,
    ...balances.rows.filter((b) => b.overdue_count > 0).map((b) => ({ label: `${b.overdue_count} overdue ${b.currency} invoice(s)`, href: `/admin/invoices?payment=overdue&currency=${b.currency}` })),
  ].filter((x): x is { label: string; href: string } => !!x);
  return { balances: balances.rows, pending: pending.rows, unallocated: unallocated.rows, unallocatedTotals, overdue: overdue.rows, exceptions };
}

/** Page entry point: authorizes, then reads the organization's receivables overview. */
export async function receivablesOverview(required: "payments_read" | "invoices_read") {
  const ctx = await staffContext(required);
  return { ...(await readReceivables(ctx.organizationId)), canSeeInvoices: ctx.permissions.includes("invoices_read"), canSeePayments: ctx.permissions.includes("payments_read"), canSeeClients: ctx.permissions.includes("clients_read") };
}
