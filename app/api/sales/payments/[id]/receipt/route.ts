import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { renderPaymentPdf } from "@/lib/sales/payment-pdf";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const { organizationId } = await staffContext("payments_read");
  const result = await db.execute<{ receipt_number: string; client: string; amount: string; currency: string; method: string; reference: string | null; received_at: string; refunded: string }>(sql`SELECT p.receipt_number,c.display_name AS client,p.amount::text,p.currency,p.method,p.reference,p.received_at::text,coalesce((SELECT sum(f.amount) FROM payment_refunds f WHERE f.organization_id=p.organization_id AND f.payment_id=p.id AND f.status='completed'),0)::text AS refunded FROM payments p JOIN clients c ON c.id=p.client_id AND c.organization_id=p.organization_id WHERE p.id=${id}::uuid AND p.organization_id=${organizationId} AND p.status='confirmed' AND p.receipt_number IS NOT NULL`);
  const p = result.rows[0];
  if (!p) return new Response("Not found", { status: 404 });
  const bytes = await renderPaymentPdf("Payment receipt", [`Receipt: ${p.receipt_number}`, `Received from: ${p.client}`, `Amount received: ${p.currency} ${p.amount}`, `Received: ${p.received_at.slice(0, 10)}`, `Method: ${p.method.replaceAll("_", " ")}`, `Reference: ${p.reference || "—"}`, `Completed refunds: ${p.currency} ${p.refunded}`, "This receipt confirms the original payment received. Refunds shown are current as of generation."]);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=payment-receipt.pdf", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
