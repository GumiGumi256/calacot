-- Administrator-verified expenses and agreed pay for project team members (additive).
--
-- 1. An administrator can record an expense that is approved immediately ("admin_verified"), and
--    optionally record its payment in the same transaction, instead of waiting for a second reviewer.
--    The usual request/review workflow is unchanged for everyone else. Every step still writes
--    expense_events and audit_logs, so other administrators can see who recorded what and when.
--    entry_mode is set once, on the submitted -> approved transition, and never changes afterwards.
-- 2. project_members.agreed_amount records what a team member (for example a painter) is to earn on
--    the project, in the project currency, so the project can show agreed, paid and still owed.
--
-- The only replaced objects are expenses_no_self_approval_check (widened for admin_verified rows)
-- and expense_disburse (self-disbursement allowed for admin_verified rows only).

ALTER TABLE expenses ADD COLUMN entry_mode text NOT NULL DEFAULT 'request';
--> statement-breakpoint
ALTER TABLE expenses ADD CONSTRAINT expenses_entry_mode_check CHECK (entry_mode IN ('request', 'admin_verified'));
--> statement-breakpoint
ALTER TABLE expenses DROP CONSTRAINT expenses_no_self_approval_check;
--> statement-breakpoint
ALTER TABLE expenses ADD CONSTRAINT expenses_no_self_approval_check CHECK (entry_mode = 'admin_verified' OR approved_by_id IS NULL OR requested_by_id IS NULL OR approved_by_id <> requested_by_id);
--> statement-breakpoint
CREATE INDEX expenses_entry_mode_idx ON expenses (organization_id, entry_mode, approved_at) WHERE entry_mode = 'admin_verified';
--> statement-breakpoint
-- New rows always start as ordinary requests; only expense_admin_verify may mark one verified.
CREATE OR REPLACE FUNCTION expense_entry_mode_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.entry_mode <> 'request' THEN RAISE EXCEPTION 'expense_locked'; END IF;
  ELSIF NEW.entry_mode IS DISTINCT FROM OLD.entry_mode
    AND NOT (OLD.entry_mode = 'request' AND NEW.entry_mode = 'admin_verified' AND OLD.status = 'submitted' AND NEW.status = 'approved') THEN
    RAISE EXCEPTION 'expense_locked';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER expenses_entry_mode_guard BEFORE INSERT OR UPDATE OF entry_mode ON expenses FOR EACH ROW EXECUTE FUNCTION expense_entry_mode_guard();
--> statement-breakpoint
-- Approves the administrator's own draft, returned or submitted expense without a second reviewer.
-- Application code must confirm the live Clerk administrator role before calling it. The expense
-- passes through 'submitted' so the per-person breakdown check and accounting capture run as usual.
CREATE OR REPLACE FUNCTION expense_admin_verify(org text, actor text, eid uuid, expected integer, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); e expenses; clean text := nullif(trim(coalesce(note, '')), ''); v integer;
BEGIN
  SELECT * INTO e FROM expenses WHERE id = eid AND organization_id = org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_unavailable'; END IF;
  IF expense_replay(org, key, eid, 'admin_verified') THEN RETURN jsonb_build_object('id', eid, 'status', e.status, 'version', e.version, 'already', true); END IF;
  IF length(coalesce(clean, '')) > 4000 THEN RAISE EXCEPTION 'note_too_long'; END IF;
  IF e.requested_by_id IS DISTINCT FROM staff THEN RAISE EXCEPTION 'not_requester'; END IF;
  IF e.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_expense'; END IF;
  IF e.status NOT IN ('draft', 'returned', 'submitted') THEN RAISE EXCEPTION 'invalid_expense_transition'; END IF;
  v := e.version;
  IF e.status <> 'submitted' THEN
    UPDATE expenses SET status = 'submitted', submitted_at = now(), version = version + 1, updated_at = now() WHERE id = eid AND organization_id = org;
    v := v + 1;
  END IF;
  UPDATE expenses SET status = 'approved', entry_mode = 'admin_verified', reviewed_by_id = staff, reviewed_at = now(), review_note = clean,
    approved_by_id = staff, approved_at = now(), version = version + 1, updated_at = now()
  WHERE id = eid AND organization_id = org;
  v := v + 1;
  PERFORM expense_event(org, eid, NULL, actor, staff, 'admin_verified', e.status, 'approved', v, clean,
    jsonb_build_object('total', e.total::text, 'currency', e.currency, 'projectId', e.project_id), key, correlation);
  RETURN jsonb_build_object('id', eid, 'status', 'approved', 'version', v, 'already', false);
END $$;
--> statement-breakpoint
-- One-tap administrator entry: saves the expense (with its optional per-person breakdown), approves
-- it, and records its payment when p->'payment' is an object. All or nothing, in one transaction.
-- p->'payment' takes the expense_disburse fields (method, reference, sourceAccountId, paidOn,
-- responsibleStaffId, notes, optional amount; the full total by default).
CREATE OR REPLACE FUNCTION expense_record_verified(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE key text := nullif(p->>'key', ''); pay jsonb := p->'payment'; r jsonb; v jsonb; d jsonb; e expenses;
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF pay IS NOT NULL AND jsonb_typeof(pay) NOT IN ('object', 'null') THEN RAISE EXCEPTION 'invalid_payment'; END IF;
  r := expense_save_with_payees(org, actor, p - 'payment' - 'id' - 'version' - 'note', correlation);
  SELECT * INTO e FROM expenses WHERE organization_id = org AND id = (r->>'id')::uuid FOR UPDATE;
  IF (r->>'already')::boolean THEN
    RETURN jsonb_build_object('id', e.id, 'status', e.status, 'version', e.version, 'already', true);
  END IF;
  v := expense_admin_verify(org, actor, e.id, e.version, p->>'note', key || ':verify', correlation);
  IF jsonb_typeof(pay) = 'object' THEN
    d := expense_disburse(org, actor, pay || jsonb_build_object('expenseId', e.id, 'version', (v->>'version')::integer, 'currency', e.currency,
      'amount', coalesce(nullif(pay->>'amount', ''), e.total::text), 'key', key || ':pay'), correlation);
    RETURN jsonb_build_object('id', e.id, 'status', d->>'status', 'disbursementId', d->>'id', 'already', false);
  END IF;
  RETURN jsonb_build_object('id', e.id, 'status', 'approved', 'already', false);
END $$;
--> statement-breakpoint
-- Same as 0010_disbursement_account_policy, except that an administrator may record payment of an
-- expense they recorded as verified. Requested expenses keep the no-self-disbursement rule.
CREATE OR REPLACE FUNCTION expense_disburse(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  staff uuid := finance_staff(org,actor); e expenses; d expense_disbursements; did uuid; disbursed numeric; amt numeric;
  key text := nullif(p->>'key',''); resp uuid; paid date; ref text := nullif(trim(coalesce(p->>'reference','')),''); target text; cname text;
  account uuid; needs_account boolean;
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO e FROM expenses WHERE id=(p->>'expenseId')::uuid AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_unavailable'; END IF;
  IF coalesce(p->>'amount','') !~ '^\d{1,15}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  amt := (p->>'amount')::numeric;
  SELECT * INTO d FROM expense_disbursements WHERE organization_id=org AND idempotency_key=key;
  IF FOUND THEN
    IF d.expense_id<>e.id OR d.amount<>amt THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id',d.id,'status',e.status,'already',true);
  END IF;
  IF e.status<>'approved' THEN RAISE EXCEPTION '%', CASE WHEN e.status='paid' THEN 'expense_fully_disbursed' ELSE 'expense_not_approved' END; END IF;
  IF e.version IS DISTINCT FROM (p->>'version')::integer THEN RAISE EXCEPTION 'stale_expense'; END IF;
  IF e.requested_by_id=staff AND e.entry_mode<>'admin_verified' THEN RAISE EXCEPTION 'self_disbursement_denied'; END IF;
  IF p->>'currency' IS DISTINCT FROM e.currency THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
  IF amt<=0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF coalesce(p->>'method','') NOT IN ('bank_transfer','mobile_money','cash','cheque','other') THEN RAISE EXCEPTION 'invalid_method'; END IF;
  needs_account := p->>'method' IN ('bank_transfer','mobile_money','cheque');
  IF needs_account THEN
    SELECT id INTO account FROM finance_accounts WHERE id=nullif(p->>'sourceAccountId','')::uuid AND organization_id=org AND status='active' AND method=p->>'method' AND currency=e.currency;
    IF account IS NULL THEN RAISE EXCEPTION '%', CASE WHEN nullif(p->>'sourceAccountId','') IS NULL THEN 'source_account_required' ELSE 'source_account_unavailable' END; END IF;
  ELSIF nullif(p->>'sourceAccountId','') IS NOT NULL THEN RAISE EXCEPTION 'source_account_not_applicable';
  END IF;
  IF p->>'method'<>'cash' AND nullif(upper(regexp_replace(coalesce(ref,''),'[^A-Za-z0-9]','','g')),'') IS NULL THEN RAISE EXCEPTION 'transaction_reference_required'; END IF;
  IF length(coalesce(ref,''))>200 OR length(coalesce(p->>'notes',''))>2000 THEN RAISE EXCEPTION 'invalid_reference'; END IF;
  IF coalesce(p->>'paidOn','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_payment_date'; END IF;
  paid := (p->>'paidOn')::date;
  IF paid>finance_kampala_today() THEN RAISE EXCEPTION 'future_payment_date'; END IF;
  SELECT coalesce(sum(amount),0) INTO disbursed FROM expense_disbursements WHERE organization_id=org AND expense_id=e.id AND status='recorded';
  IF amt>e.total-disbursed THEN RAISE EXCEPTION 'disbursement_exceeds_approved'; END IF;
  SELECT id INTO resp FROM staff_memberships WHERE id=nullif(p->>'responsibleStaffId','')::uuid AND organization_id=org AND status='active';
  IF resp IS NULL THEN RAISE EXCEPTION 'responsible_unavailable'; END IF;
  IF nullif(p->>'evidenceDocumentId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM document_links l JOIN documents doc ON doc.id=l.document_id AND doc.organization_id=l.organization_id WHERE l.organization_id=org AND l.expense_id=e.id AND l.document_id=(p->>'evidenceDocumentId')::uuid AND doc.archived_at IS NULL) THEN RAISE EXCEPTION 'evidence_unavailable'; END IF;
  -- Fast path for a clear message; the unique index below is the authoritative concurrent guard.
  IF ref IS NOT NULL AND EXISTS(SELECT 1 FROM expense_disbursements WHERE organization_id=org AND method=p->>'method' AND source_account_id IS NOT DISTINCT FROM account AND status='recorded' AND reference_normalized=nullif(upper(regexp_replace(ref,'[^A-Za-z0-9]','','g')),'')) THEN RAISE EXCEPTION 'duplicate_disbursement_reference'; END IF;
  BEGIN
    INSERT INTO expense_disbursements(organization_id,expense_id,amount,currency,method,reference,source_account_id,paid_on,responsible_staff_id,recorded_by_id,evidence_document_id,notes,idempotency_key)
    VALUES(org,e.id,amt,e.currency,p->>'method',ref,account,paid,resp,staff,nullif(p->>'evidenceDocumentId','')::uuid,nullif(trim(coalesce(p->>'notes','')),''),key) RETURNING id INTO did;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS cname = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', CASE WHEN cname='expense_disbursements_account_reference_uq' THEN 'duplicate_disbursement_reference' ELSE 'idempotency_conflict' END;
  END;
  disbursed := disbursed+amt;
  target := CASE WHEN disbursed=e.total THEN 'paid' ELSE 'approved' END;
  UPDATE expenses SET status=target,paid_at=CASE WHEN target='paid' THEN paid::timestamp AT TIME ZONE 'Africa/Kampala' ELSE paid_at END,
    payment_reference=CASE WHEN target='paid' THEN ref ELSE payment_reference END,version=version+1,updated_at=now()
  WHERE id=e.id AND organization_id=org;
  PERFORM expense_event(org,e.id,did,actor,staff,'disbursement_recorded',e.status,target,e.version+1,NULL,jsonb_build_object('amount',amt::text,'currency',e.currency,'method',p->>'method','reference',ref,'sourceAccountId',account,'paidOn',paid,'responsibleStaffId',resp),key,correlation);
  RETURN jsonb_build_object('id',did,'status',target,'already',false);
END $$;
--> statement-breakpoint
ALTER TABLE project_members ADD COLUMN agreed_amount numeric(17,2);
--> statement-breakpoint
ALTER TABLE project_members ADD CONSTRAINT project_members_agreed_amount_check CHECK (agreed_amount IS NULL OR agreed_amount >= 0);
