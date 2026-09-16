import { sql } from "drizzle-orm";
import type { InboundMessage, StatusEvent } from "./types";
import { isWhatsAppOptOut } from "./webhook";

/** Insertion, session tracking and purchase activity are atomic, including retries. */
export function recordInboundQuery(m: InboundMessage) {
  const stop = isWhatsAppOptOut(m.body);
  return sql`
    WITH candidates AS (
      SELECT id FROM design_purchases
      WHERE (whatsapp_phone = ${m.phone} OR (whatsapp_phone IS NULL AND customer_phone IN (${m.phone}, ${"+" + m.phone})))
        AND purchase_status IN ('awaiting_payment', 'awaiting_contact', 'payment_submitted')
      LIMIT 2
    ), inserted AS (
      INSERT INTO whatsapp_messages (wamid, purchase_id, customer_phone, direction, message_type, raw_message_type, body, event_at)
      VALUES (${m.wamid}, (SELECT id FROM candidates WHERE (SELECT count(*) FROM candidates) = 1), ${m.phone}, 'inbound', ${m.type}, ${m.rawType}, ${m.body}, ${m.timestamp.toISOString()}::timestamptz)
      ON CONFLICT (wamid) DO NOTHING RETURNING *
    ), contact AS (
      INSERT INTO whatsapp_contacts (phone, last_inbound_at, opted_out_at)
      SELECT customer_phone, event_at, CASE WHEN ${stop} THEN event_at ELSE NULL END FROM inserted
      ON CONFLICT (phone) DO UPDATE SET
        last_inbound_at = greatest(whatsapp_contacts.last_inbound_at, excluded.last_inbound_at),
        opted_out_at = greatest(whatsapp_contacts.opted_out_at, excluded.opted_out_at), updated_at = now()
    ), activity AS (
      UPDATE design_purchases p SET
        whatsapp_status = CASE WHEN ${stop} THEN 'closed' ELSE 'customer_replied' END,
        whatsapp_last_message_id = i.wamid,
        whatsapp_started_at = coalesce(p.whatsapp_started_at, i.event_at),
        whatsapp_last_activity_at = i.event_at
      FROM inserted i WHERE p.id = i.purchase_id AND (p.whatsapp_last_activity_at IS NULL OR p.whatsapp_last_activity_at <= i.event_at)
    ) SELECT id, purchase_id FROM inserted`;
}

/** Receipt ranks are monotonic: a late delivered/sent event cannot overwrite read. */
export function recordStatusQuery(s: StatusEvent) {
  const rank = { sent: 1, failed: 2, delivered: 3, read: 4 }[s.status];
  return sql`
    WITH changed AS (
      UPDATE whatsapp_messages SET wamid = ${s.wamid}, status = ${s.status},
        status_at = ${s.timestamp.toISOString()}::timestamptz, error_code = ${s.errorCode}, updated_at = now()
      WHERE direction = 'outbound' AND customer_phone = ${s.phone}
        AND (wamid = ${s.wamid} OR (id = ${s.callbackId}::uuid AND wamid IS NULL))
        AND CASE status WHEN 'sent' THEN 1 WHEN 'failed' THEN 2 WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 ELSE 0 END < ${rank}
      RETURNING purchase_id, wamid, status, status_at
    ) UPDATE design_purchases p SET
      whatsapp_status = CASE WHEN p.whatsapp_status IN ('customer_replied', 'advisor_connected', 'closed') THEN p.whatsapp_status WHEN c.status = 'failed' THEN 'failed' ELSE 'message_sent' END,
      whatsapp_last_message_id = c.wamid,
      whatsapp_started_at = coalesce(p.whatsapp_started_at, c.status_at),
      whatsapp_last_activity_at = c.status_at
    FROM changed c WHERE p.id = c.purchase_id
      AND (p.whatsapp_last_activity_at IS NULL OR p.whatsapp_last_activity_at <= c.status_at)`;
}
