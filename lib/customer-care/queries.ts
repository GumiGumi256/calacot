import { sql } from "drizzle-orm";

/** Replays are safe. Enqueue all previously committed inbound records to heal a partial webhook write. */
export function enqueueQuery(wamid: string) {
  return sql`WITH conversation AS (
    INSERT INTO care_conversations(phone,updated_at)
    SELECT customer_phone,event_at FROM whatsapp_messages WHERE wamid=${wamid} AND direction='inbound'
    ON CONFLICT(phone) DO UPDATE SET updated_at=greatest(care_conversations.updated_at,excluded.updated_at)
  ) SELECT 1`;
}
export function insertJobQuery(wamid: string) {
  return sql`INSERT INTO care_jobs(message_id,phone)
    SELECT id,customer_phone FROM whatsapp_messages WHERE wamid=${wamid} AND direction='inbound'
    ON CONFLICT(message_id) DO NOTHING`;
}
/** One worker lease per phone; expired leases recover safely via the persistent outbox. */
export function claimJobQuery(token: string) {
  return sql`WITH candidate AS (
    SELECT j.id FROM care_jobs j
    WHERE ((j.state='queued' AND j.available_at<=now()) OR (j.state='processing' AND j.lease_until<now()))
      AND j.attempts<5
      AND NOT EXISTS (SELECT 1 FROM care_jobs other WHERE other.phone=j.phone AND other.id<>j.id
        AND ((other.state='processing' AND other.lease_until>=now())
          OR (other.state IN ('queued','processing') AND (other.created_at,other.id)<(j.created_at,j.id))))
    ORDER BY j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE care_jobs j SET state='processing',attempts=attempts+1,lease_token=${token}::uuid,
    lease_until=now()+interval '3 minutes',updated_at=now()
    FROM candidate WHERE j.id=candidate.id RETURNING j.*`;
}
export function ownedOrderQuery(phone: string, reference: string) {
  return sql`SELECT p.purchase_reference,p.purchase_status,p.payment_status FROM design_purchases p
    JOIN care_conversations c ON c.clerk_user_id=p.clerk_user_id
    JOIN whatsapp_contacts contact ON contact.phone=c.phone
    WHERE c.phone=${phone} AND c.linked_until>now() AND contact.opted_out_at IS NULL AND p.purchase_reference=${reference} LIMIT 1`;
}
export function consumeLinkQuery(hash: string, userId: string) {
  return sql`WITH used AS (
    UPDATE care_link_tokens SET used_at=now() WHERE hash=${hash} AND used_at IS NULL AND expires_at>now()
      AND EXISTS (SELECT 1 FROM whatsapp_contacts c WHERE c.phone=care_link_tokens.phone AND c.opted_out_at IS NULL)
    RETURNING phone
  ), linked AS (
    UPDATE care_conversations c SET clerk_user_id=${userId},linked_until=now()+interval '24 hours',updated_at=now()
    FROM used WHERE c.phone=used.phone RETURNING c.phone
  ), audit AS (
    INSERT INTO care_audit(actor,phone,action) SELECT ${userId},phone,'account_linked' FROM linked
  ) SELECT phone FROM linked`;
}

export function claimOutboundQuery(
  id: string,
  requireBot: boolean,
  automated = false,
) {
  return sql`UPDATE whatsapp_messages m SET status='sending',attempted_at=now(),updated_at=now()
    FROM whatsapp_contacts c WHERE m.id=${id}::uuid AND m.status='queued' AND m.customer_phone=c.phone
      AND c.opted_out_at IS NULL AND c.last_inbound_at>now()-interval '24 hours' AND c.last_inbound_at<=now()
      AND EXISTS(SELECT 1 FROM care_conversations conv WHERE conv.phone=m.customer_phone AND conv.mode<>'closed'
        AND (${!automated} OR conv.assigned_to IS NULL))
      AND (${!requireBot} OR EXISTS(SELECT 1 FROM care_conversations conv WHERE conv.phone=m.customer_phone AND conv.mode='bot'))
    RETURNING m.id,m.customer_phone,m.body,m.message_type`;
}

export function revokeLinkQuery(phone: string) {
  return sql`WITH revoked AS (
    UPDATE care_conversations SET clerk_user_id=NULL,linked_until=NULL,updated_at=now() WHERE phone=${phone}
  ) UPDATE care_link_tokens SET used_at=now() WHERE phone=${phone} AND used_at IS NULL`;
}

export function reapDeadJobsQuery() {
  return sql`WITH dead AS (
    UPDATE care_jobs SET state='dead',error_code='attempts_exhausted',updated_at=now()
    WHERE attempts>=5 AND state IN ('queued','processing') AND (lease_until IS NULL OR lease_until<now()) RETURNING id,phone
  ), requests AS (
    INSERT INTO care_requests(job_id,phone,kind) SELECT id,phone,'handoff' FROM dead ON CONFLICT(job_id) DO NOTHING
  ) UPDATE care_conversations SET mode='human',updated_at=now() WHERE phone IN (SELECT phone FROM dead) AND mode='bot'`;
}
