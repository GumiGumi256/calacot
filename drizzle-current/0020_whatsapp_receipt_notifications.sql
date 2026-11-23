-- Queue one receipt message per allocation in the same transaction as the ledger entry.
-- The worker rechecks the selected invoice contact's consent and global opt-out at send time.
CREATE OR REPLACE FUNCTION sales_queue_whatsapp_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE info record;
BEGIN
  SELECT i.number AS invoice, p.receipt_number AS receipt, p.currency, c.display_name AS client,
         coalesce(cc.phone,'') AS phone
    INTO info
    FROM invoices i
    JOIN payments p ON p.id=NEW.payment_id AND p.organization_id=NEW.organization_id AND p.status='confirmed'
    JOIN clients c ON c.id=i.client_id AND c.organization_id=i.organization_id
    LEFT JOIN quotation_versions v ON v.id=i.quotation_version_id AND v.organization_id=i.organization_id
    LEFT JOIN client_contacts cc ON cc.id=v.delivery_contact_id AND cc.client_id=i.client_id AND cc.organization_id=i.organization_id
    WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id AND i.status='issued';
  IF FOUND AND info.receipt IS NOT NULL THEN
    PERFORM sales_intent(NEW.organization_id,'invoice',NEW.invoice_id,'whatsapp',info.phone,
      jsonb_build_object('notificationKind','payment-receipt','paymentId',NEW.payment_id,'receipt',info.receipt,
        'client',info.client,'invoice',info.invoice,'currency',info.currency,'amount',NEW.amount::text),
      gen_random_uuid()::text,'sales/'||NEW.organization_id||'/payment/'||NEW.payment_id||'/invoice/'||NEW.invoice_id||'/whatsapp-receipt');
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sales_queue_whatsapp_receipt ON payment_allocations;
--> statement-breakpoint
CREATE TRIGGER sales_queue_whatsapp_receipt AFTER INSERT ON payment_allocations FOR EACH ROW EXECUTE FUNCTION sales_queue_whatsapp_receipt();
