import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { balanceExpression } from "@/lib/sales/queries";
import { renderPaymentPdf } from "@/lib/sales/payment-pdf";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const ctx = await staffContext("invoices_read");
  if (!ctx.permissions.includes("payments_read")) return new Response("Not found", { status: 404 });
  const result = await db.execute<{ number: string; client: string; currency: string; total: string; balance: string; allocated: string; credits: string; reversed: string }>(sql`SELECT i.number,c.display_name AS client,i.currency,i.total::text,(${balanceExpression})::text AS balance,coalesce((SELECT sum(a.amount) FROM payment_allocations a JOIN payments p ON p.id=a.payment_id AND p.organization_id=a.organization_id WHERE a.invoice_id=i.id AND a.organization_id=i.organization_id AND p.status='confirmed'),0)::text AS allocated,coalesce((SELECT sum(cn.total) FROM credit_notes cn WHERE cn.invoice_id=i.id AND cn.organization_id=i.organization_id AND cn.status='issued'),0)::text AS credits,coalesce((SELECT sum(r.amount) FROM payment_allocation_reversals r JOIN payment_allocations a ON a.id=r.allocation_id AND a.organization_id=r.organization_id JOIN payment_refunds f ON f.id=r.refund_id AND f.organization_id=r.organization_id WHERE a.invoice_id=i.id AND a.organization_id=i.organization_id AND f.status='completed'),0)::text AS reversed FROM invoices i JOIN clients c ON c.id=i.client_id AND c.organization_id=i.organization_id WHERE i.id=${id}::uuid AND i.organization_id=${ctx.organizationId} AND i.status='issued'`);
  const i = result.rows[0];
  if (!i) return new Response("Not found", { status: 404 });
  const payments = await db.execute<{ receipt: string; received: string; amount: string }>(sql`SELECT p.receipt_number AS receipt,p.received_at::text AS received,a.amount::text FROM payment_allocations a JOIN payments p ON p.id=a.payment_id AND p.organization_id=a.organization_id WHERE a.organization_id=${ctx.organizationId} AND a.invoice_id=${id}::uuid AND p.status='confirmed' ORDER BY p.received_at,p.id`);
  const bytes = await renderPaymentPdf("Invoice payment statement", [`Invoice: ${i.number}`, `Client: ${i.client}`, `Invoice total: ${i.currency} ${i.total}`, ...payments.rows.map((p) => `Payment ${p.receipt} | ${p.received.slice(0, 10)} | ${i.currency} ${p.amount} originally allocated`), `Total originally allocated: ${i.currency} ${i.allocated}`, `Issued credits: ${i.currency} ${i.credits}`, `Completed allocation reversals: ${i.currency} ${i.reversed}`, `Current amount due: ${i.currency} ${i.balance}`]);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=payment-statement.pdf", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
