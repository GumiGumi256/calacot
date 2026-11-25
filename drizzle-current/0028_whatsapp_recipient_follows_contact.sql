-- WhatsApp messages follow a client contact's new phone number (additive).
--
-- Invoice WhatsApp messages (invoice notices and payment receipts) are addressed to the quotation's
-- delivery contact, but delivery_intents stores the number captured when the message was queued. After
-- the contact's number changed, the worker's consent lookup (cc.phone = recipient) no longer matched, so
-- the message was skipped and "retry after consent" could never succeed.
--
-- When a contact's phone changes, every never-attempted WhatsApp intent (queued or skipped, no provider id,
-- no first attempt) that was addressed to that contact's old number is moved to the new number. Its stored
-- consent is replaced with the contact's current consent, which sales_client clears whenever the number
-- changes, so nothing is sent to the new number until permission for it is recorded. Skipped intents whose
-- reason was about the recipient become 'consent_missing', the state "retry after consent" acts on.
-- Sent, in-flight, failed, blocked and uncertain messages are never changed. Each move is audited without
-- storing phone numbers.

CREATE OR REPLACE FUNCTION client_contact_phone_retarget() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.phone IS NOT DISTINCT FROM OLD.phone THEN RETURN NEW; END IF;
  WITH moved AS (
    UPDATE delivery_intents d SET
      recipient = coalesce(NEW.phone, ''),
      payload = d.payload || jsonb_build_object('consentAt', NEW.whatsapp_consent_at, 'consentSource', NEW.whatsapp_consent_source),
      error_code = CASE WHEN d.status = 'skipped' AND d.error_code IN ('consent_missing', 'invalid_phone', 'recipient_missing', 'recipient_opted_out')
        THEN 'consent_missing' ELSE d.error_code END,
      updated_at = now()
    FROM invoices i
    JOIN quotation_versions v ON v.id = i.quotation_version_id AND v.organization_id = i.organization_id
    WHERE d.organization_id = NEW.organization_id AND d.channel = 'whatsapp' AND d.entity_type = 'invoice'
      AND i.organization_id = d.organization_id AND i.id = d.entity_id AND i.client_id = NEW.client_id
      AND v.delivery_contact_id = NEW.id
      AND d.recipient IS NOT DISTINCT FROM coalesce(OLD.phone, '')
      AND d.status IN ('queued', 'skipped') AND d.provider_id IS NULL AND d.first_attempt_at IS NULL
    RETURNING d.id, d.entity_id, d.status
  )
  INSERT INTO audit_logs(organization_id, actor_clerk_user_id, actor_type, action, entity_type, entity_id, changes)
  SELECT NEW.organization_id, NULL, 'system', 'delivery.recipient_updated', 'invoice', entity_id::text,
    jsonb_build_object('intentId', id, 'status', status, 'contactId', NEW.id, 'reason', 'contact_phone_changed')
  FROM moved;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER client_contacts_phone_retarget AFTER UPDATE OF phone ON client_contacts
  FOR EACH ROW EXECUTE FUNCTION client_contact_phone_retarget();
