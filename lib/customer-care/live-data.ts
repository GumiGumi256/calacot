import "server-only";
import { db } from "@/database/db";
import { ownedOrderQuery } from "./queries";
import { renderOrder, renderSupport, templates } from "./render";
import { sql } from "drizzle-orm";

export async function authorisedOrder(phone: string, reference: string) {
  const result = await db.execute<{
    purchase_reference: string;
    purchase_status: string;
    payment_status: string;
  }>(ownedOrderQuery(phone, reference));
  const r = result.rows[0];
  return r
    ? renderOrder({
        purchaseReference: r.purchase_reference,
        purchaseStatus: r.purchase_status,
        paymentStatus: r.payment_status,
      })
    : templates.order_missing;
}
export async function authorisedSupport(phone: string) {
  const result = await db.execute<{
    kind: string;
    status: string;
  }>(sql`SELECT r.kind,r.status FROM care_requests r
    JOIN care_conversations c ON c.phone=r.phone
    JOIN whatsapp_contacts contact ON contact.phone=c.phone
    WHERE c.phone=${phone} AND c.clerk_user_id IS NOT NULL AND c.linked_until>now() AND contact.opted_out_at IS NULL
    ORDER BY r.created_at DESC LIMIT 3`);
  return renderSupport(result.rows);
}
