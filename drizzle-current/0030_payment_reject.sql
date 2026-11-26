-- Reject a payment that is awaiting verification, e.g. a duplicate entry (additive).
--
-- Only a submitted payment with nothing applied from it can be rejected. The reason is kept in notes and
-- the audit log. Accounting is unaffected: only confirmed payments are captured. Repeating the call on an
-- already rejected payment changes nothing.
CREATE OR REPLACE FUNCTION payment_reject(org text, actor text, pid uuid, reason text, correlation text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE pay payments; clean text := nullif(trim(coalesce(reason, '')), '');
BEGIN
  SELECT * INTO pay FROM payments WHERE id = pid AND organization_id = org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_unavailable'; END IF;
  IF pay.status = 'rejected' THEN RETURN pid; END IF;
  IF pay.status <> 'submitted' OR EXISTS (SELECT 1 FROM payment_allocations WHERE organization_id = org AND payment_id = pid) THEN
    RAISE EXCEPTION 'payment_not_rejectable';
  END IF;
  IF clean IS NULL OR length(clean) < 3 OR length(clean) > 2000 THEN RAISE EXCEPTION 'reject_reason_required'; END IF;
  UPDATE payments SET status = 'rejected', notes = clean, updated_at = now() WHERE id = pid AND organization_id = org;
  INSERT INTO audit_logs(organization_id, actor_clerk_user_id, actor_type, action, entity_type, entity_id, changes, request_id)
  VALUES (org, actor, 'staff', 'payment.reject', 'payment', pid::text,
    jsonb_build_object('reason', clean, 'amount', pay.amount::text, 'currency', pay.currency, 'reference', pay.reference), correlation);
  RETURN pid;
END $$;
