CREATE OR REPLACE FUNCTION sales_payment(org text, actor text, p jsonb, correlation text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i invoices; pay payments; pid uuid; staff uuid; paid numeric; credited numeric; due numeric; notification_recipient text; receipt text;
BEGIN
  SELECT * INTO i FROM invoices WHERE id=(p->>'invoiceId')::uuid AND organization_id=org FOR UPDATE;
  IF NOT FOUND OR i.status<>'issued' THEN RAISE EXCEPTION 'invoice_unavailable'; END IF;
  IF p->>'command'='submit' THEN
    pid:=gen_random_uuid();
    PERFORM pg_advisory_xact_lock(hashtextextended(org||'/payment/'||i.client_id::text||'/'||lower(p->>'reference'),0));
    IF NOT EXISTS(SELECT 1 FROM payments WHERE organization_id=org AND idempotency_key=p->>'key') AND EXISTS(SELECT 1 FROM payments WHERE organization_id=org AND client_id=i.client_id AND currency=i.currency AND lower(reference)=lower(p->>'reference') AND amount=(p->>'amount')::numeric AND status<>'rejected') THEN RAISE EXCEPTION 'duplicate_payment'; END IF;
    INSERT INTO payments(id,organization_id,client_id,amount,currency,method,reference,idempotency_key,received_at) VALUES(pid,org,i.client_id,(p->>'amount')::numeric,i.currency,p->>'method',p->>'reference',p->>'key',(p->>'receivedAt')::timestamptz) ON CONFLICT(organization_id,idempotency_key) DO NOTHING;
    SELECT id INTO pid FROM payments WHERE organization_id=org AND idempotency_key=p->>'key' AND client_id=i.client_id AND currency=i.currency;
    IF pid IS NULL THEN RAISE EXCEPTION 'payment_key_conflict'; END IF;
  ELSE
    SELECT * INTO pay FROM payments WHERE id=(p->>'paymentId')::uuid AND organization_id=org AND client_id=i.client_id AND currency=i.currency FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'payment_unavailable'; END IF;
    pid:=pay.id;
    IF EXISTS(SELECT 1 FROM payment_allocations WHERE payment_id=pid AND invoice_id=i.id AND organization_id=org) THEN RETURN pid; END IF;
    SELECT id INTO staff FROM staff_memberships WHERE organization_id=org AND clerk_user_id=actor;
    IF staff IS NULL THEN RAISE EXCEPTION 'staff_mirror_required_for_ledger'; END IF;
    IF pay.status='rejected' THEN RAISE EXCEPTION 'payment_rejected'; END IF;
    IF pay.status='submitted' THEN
      IF nullif(p->>'evidence','') IS NULL THEN RAISE EXCEPTION 'verification_evidence_required'; END IF;
      UPDATE payments SET status='confirmed',confirmed_at=now(),confirmed_by_id=staff,receipt_number=sales_number(org,'receipt'),notes=p->>'evidence',updated_at=now() WHERE id=pid;
    END IF;
    SELECT coalesce(sum(amount),0) INTO paid FROM payment_allocations WHERE payment_id=pid AND organization_id=org;
    SELECT coalesce(sum(amount),0) INTO credited FROM payment_refunds WHERE payment_id=pid AND organization_id=org AND status='completed';
    IF (p->>'amount')::numeric<=0 OR (p->>'amount')::numeric>pay.amount-paid-credited THEN RAISE EXCEPTION 'allocation_exceeds_funds'; END IF;
    SELECT coalesce(sum(a.amount),0) INTO paid FROM payment_allocations a JOIN payments pp ON pp.id=a.payment_id AND pp.organization_id=a.organization_id WHERE a.invoice_id=i.id AND a.organization_id=org AND pp.status='confirmed';
    SELECT coalesce(sum(total),0) INTO credited FROM credit_notes WHERE invoice_id=i.id AND organization_id=org AND status='issued';
    SELECT i.total-paid-credited+coalesce(sum(r.amount),0) INTO due FROM payment_allocation_reversals r JOIN payment_allocations a ON a.id=r.allocation_id AND a.organization_id=r.organization_id JOIN payment_refunds f ON f.id=r.refund_id AND f.organization_id=r.organization_id WHERE a.invoice_id=i.id AND a.organization_id=org AND f.status='completed';
    IF (p->>'amount')::numeric>due THEN RAISE EXCEPTION 'allocation_exceeds_balance'; END IF;
    INSERT INTO payment_allocations(organization_id,payment_id,client_id,currency,invoice_id,amount) VALUES(org,pid,i.client_id,i.currency,i.id,(p->>'amount')::numeric);
    SELECT coalesce((SELECT recipient FROM delivery_intents WHERE organization_id=org AND entity_type='invoice' AND entity_id=i.id AND channel='email' AND recipient<>'' ORDER BY created_at LIMIT 1), (SELECT email FROM client_contacts WHERE organization_id=org AND client_id=i.client_id AND is_primary AND email IS NOT NULL LIMIT 1), '') INTO notification_recipient;
    SELECT receipt_number INTO receipt FROM payments WHERE organization_id=org AND id=pid;
    PERFORM sales_intent(org,'invoice',i.id,'email',notification_recipient,
      jsonb_build_object('template','payment-confirmation-v1','from',coalesce(p->>'notificationFrom',''),'replyTo',coalesce(p->>'notificationReplyTo',''), 'receipt',receipt,'invoice',i.number,'currency',i.currency,'amount',p->>'amount','total',i.total::text,'balance',(due-(p->>'amount')::numeric)::text),
      correlation,'sales/'||org||'/payment/'||pid||'/invoice/'||i.id||'/confirmation');
  END IF;
  PERFORM sales_audit(org,actor,'payment.'||(p->>'command'),'invoice',i.id::text,jsonb_build_object('paymentId',pid,'amount',p->>'amount','evidence',p->>'evidence'),correlation);
  RETURN pid;
END $$;

