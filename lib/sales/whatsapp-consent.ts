import { sql } from "drizzle-orm";
import { z } from "zod";

/** Documented permission for one exact contact phone number. Consent is never inferred. */
export const whatsAppConsentSchema = z.object({
  clientId: z.uuid(),
  contactId: z.uuid(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  granted: z.boolean(),
  evidence: z.string().trim().min(10).max(1000),
});
export type WhatsAppConsentInput = z.infer<typeof whatsAppConsentSchema>;

/**
 * Updates the contact only when organization, client, contact and phone all still match, and writes the audit event in the same statement.
 * Every parameter is cast explicitly: jsonb_build_object() takes VARIADIC "any", so PostgreSQL cannot infer an untyped
 * parameter there ("could not determine data type of parameter $n"), and drizzle sends each interpolation as its own parameter.
 */
export function whatsAppConsentStatement(
  ctx: { organizationId: string; actor: string },
  p: WhatsAppConsentInput,
  correlation: string,
) {
  return sql`WITH changed AS (
      UPDATE client_contacts SET whatsapp_consent_at=CASE WHEN ${p.granted}::boolean THEN now() ELSE NULL END,
        whatsapp_consent_source=CASE WHEN ${p.granted}::boolean THEN ${p.evidence}::text ELSE NULL END,updated_at=now()
      WHERE organization_id=${ctx.organizationId}::text AND client_id=${p.clientId}::uuid AND id=${p.contactId}::uuid AND phone=${p.phone}::text
      RETURNING id,client_id
    ), audit AS (
      INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
      SELECT ${ctx.organizationId}::text,${ctx.actor}::text,'staff',${p.granted ? "client.whatsapp_consent_granted" : "client.whatsapp_consent_revoked"}::text,'client',client_id::text,
        jsonb_build_object('contactId',id,'phone',${p.phone}::text,'evidence',${p.evidence}::text),${correlation}::text FROM changed RETURNING id
    ) SELECT id FROM changed`;
}

/**
 * Requeue a WhatsApp delivery that WhatsApp definitively refused (blocked/failed, no provider message id).
 * Never requeues an uncertain send or one WhatsApp accepted, so the client cannot receive it twice.
 * The worker re-checks consent, opt-out, template and document link before sending again.
 */
export function whatsAppDeliveryRetryStatement(
  ctx: { organizationId: string; actor: string },
  id: string,
  correlation: string,
) {
  return sql`WITH eligible AS (
      SELECT d.id,d.entity_type,d.entity_id,d.error_code FROM delivery_intents d
      WHERE d.id=${id}::uuid AND d.organization_id=${ctx.organizationId}::text AND d.channel='whatsapp'
        AND d.status IN ('blocked','failed') AND d.provider_id IS NULL
        AND coalesce(d.error_code,'') NOT LIKE 'provider_ambiguous%'
        AND NOT EXISTS(SELECT 1 FROM whatsapp_messages w WHERE w.id=d.id AND (w.wamid IS NOT NULL OR w.status NOT IN ('queued','failed')))
        AND NOT EXISTS(SELECT 1 FROM whatsapp_contacts c WHERE c.phone=regexp_replace(d.recipient,'^\\+','') AND c.opted_out_at IS NOT NULL)
      FOR UPDATE OF d
    ), requeued AS (
      UPDATE automation_outbox o SET status='pending',attempts=0,available_at=now(),completed_at=NULL,locked_at=NULL,locked_by=NULL,lease_expires_at=NULL,last_error_code=NULL,updated_at=now()
      FROM eligible e WHERE o.organization_id=${ctx.organizationId}::text AND o.event_type='sales.delivery' AND o.payload->>'intentId'=e.id::text AND o.status IN ('dead','failed') RETURNING e.*
    ), message AS (
      UPDATE whatsapp_messages w SET status='queued',error_code=NULL,updated_at=now()
      FROM requeued r WHERE w.id=r.id AND w.status='failed' AND w.wamid IS NULL RETURNING w.id
    ), changed AS (
      UPDATE delivery_intents d SET status='queued',error_code=NULL,updated_at=now()
      FROM requeued r WHERE d.id=r.id AND d.organization_id=${ctx.organizationId}::text RETURNING d.id,r.entity_type,r.entity_id,r.error_code
    ), audit AS (
      INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
      SELECT ${ctx.organizationId}::text,${ctx.actor}::text,'staff','delivery.retry',entity_type,entity_id::text,
        jsonb_build_object('intentId',id,'previousError',error_code,'channel','whatsapp'),${correlation}::text FROM changed RETURNING id
    ) SELECT id FROM changed`;
}
