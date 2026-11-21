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
