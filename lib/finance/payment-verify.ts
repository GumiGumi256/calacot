"use server";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { balanceExpression } from "@/lib/sales/queries";
import { expireAdminData } from "@/lib/cache-tags";
import { financeMutation, type FinanceResult } from "./context";

export type VerifyOptions = {
  invoices: { id: string; number: string | null; balance: string; total: string }[];
  /** The invoice the payment was recorded against (from the payment.submit audit entry), when still open. */
  suggestedInvoiceId: string | null;
  /** Amount of the payment still free to apply. */
  available: string;
  /** A confirmed payment this one appears to repeat (same client, currency and amount; same reference or within 3 days). */
  duplicateOf: { receipt: string | null; receivedAt: string } | null;
};

/**
 * Options for verifying a payment straight from the payments list: the client's issued invoices in the
 * payment currency that still have a balance, the invoice the payment was originally recorded against,
 * and a confirmed payment it seems to duplicate.
 */
export async function paymentVerifyOptions(paymentId: string): Promise<VerifyOptions | null> {
  const ctx = await staffContext("payments_verify", "fresh");
  if (!z.uuid().safeParse(paymentId).success) return null;
  const org = ctx.organizationId;
  const pay = (await db.execute<{ client_id: string; currency: string; status: string; available: string }>(sql`SELECT p.client_id,p.currency,p.status,
      (p.amount-coalesce((SELECT sum(a.amount) FROM payment_allocations a WHERE a.organization_id=p.organization_id AND a.payment_id=p.id),0)
        -coalesce((SELECT sum(r.amount) FROM payment_refunds r WHERE r.organization_id=p.organization_id AND r.payment_id=p.id AND r.status='completed'),0))::numeric(17,2)::text AS available
    FROM payments p WHERE p.organization_id=${org} AND p.id=${paymentId}::uuid`)).rows[0];
  if (!pay || pay.status !== "submitted") return null;
  const [invoices, submittedFor, duplicate] = await Promise.all([
    db.execute<{ id: string; number: string | null; balance: string; total: string }>(sql`SELECT * FROM (SELECT i.id,i.number,i.total::text AS total,(${balanceExpression})::numeric(17,2)::text AS balance
      FROM invoices i WHERE i.organization_id=${org} AND i.client_id=${pay.client_id}::uuid AND i.currency=${pay.currency} AND i.status='issued') x
      WHERE balance::numeric>0 ORDER BY number NULLS LAST,id LIMIT 50`),
    db.execute<{ entity_id: string }>(sql`SELECT entity_id FROM audit_logs WHERE organization_id=${org} AND action='payment.submit' AND entity_type='invoice'
      AND changes->>'paymentId'=${paymentId} ORDER BY created_at DESC LIMIT 1`),
    db.execute<{ receipt_number: string | null; received_at: string }>(sql`SELECT d.receipt_number,d.received_at::text AS received_at
      FROM payments p JOIN payments d ON d.organization_id=p.organization_id AND d.client_id=p.client_id AND d.currency=p.currency
        AND d.amount=p.amount AND d.id<>p.id AND d.status='confirmed'
        AND (lower(coalesce(d.reference,''))=lower(coalesce(p.reference,'')) OR abs(extract(epoch FROM d.received_at-p.received_at))<=3*86400)
      WHERE p.organization_id=${org} AND p.id=${paymentId}::uuid ORDER BY abs(extract(epoch FROM d.received_at-p.received_at)) LIMIT 1`),
  ]);
  const suggested = submittedFor.rows[0]?.entity_id;
  const dup = duplicate.rows[0];
  return {
    invoices: invoices.rows,
    suggestedInvoiceId: invoices.rows.some((i) => i.id === suggested) ? suggested! : invoices.rows[0]?.id ?? null,
    available: pay.available,
    duplicateOf: dup ? { receipt: dup.receipt_number, receivedAt: dup.received_at } : null,
  };
}

/** Rejects a payment awaiting verification (e.g. a duplicate). Nothing is applied from it; accounting is unaffected. */
export async function rejectPayment(paymentId: string, reason: string): Promise<FinanceResult> {
  const p = z.object({ paymentId: z.uuid(), reason: z.string().trim().min(3).max(2000) }).safeParse({ paymentId, reason });
  if (!p.success) return { ok: false, message: "Give a short reason (at least 3 characters)." };
  return financeMutation("payments_verify", async (ctx, correlation) => {
    await db.execute(sql`SELECT payment_reject(${ctx.organizationId},${ctx.actor},${p.data.paymentId}::uuid,${p.data.reason},${correlation})`);
    revalidatePath("/admin/payments");
    expireAdminData(ctx.organizationId);
    return { ok: true, id: p.data.paymentId, message: "Payment rejected." };
  });
}
