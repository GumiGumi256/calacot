-- Allocate an existing approved or paid project expense to team members (additive).
--
-- Team members are often paid out of expenses that were recorded before anyone split them by person
-- (for example a 2.5M "site costs" expense that included the painters' wages). Recording a new expense
-- for those wages would double-count project spending, so the per-person breakdown of an approved or
-- paid expense can now be set afterwards. It only says who received the money: the expense total,
-- status, disbursements and accounting are unchanged. Lines may add up to less than the total; the
-- rest is non-team spending such as materials.
--
-- Only expense_allocate_payees may change lines on an approved/paid expense: it sets a transaction-local
-- flag that expense_payees_guard checks. Drafts keep the existing rules (lines equal the total).

CREATE OR REPLACE FUNCTION expense_payees_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s text; r expense_payees := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'expense_payees_immutable'; END IF;
  SELECT status INTO s FROM expenses WHERE organization_id = r.organization_id AND id = r.expense_id;
  IF s IS NULL OR NOT (s IN ('draft', 'returned')
      OR (s IN ('approved', 'paid') AND coalesce(current_setting('calacot.payee_allocation', true), '') = 'on')) THEN
    RAISE EXCEPTION 'expense_not_editable';
  END IF;
  RETURN r;
END $$;
--> statement-breakpoint
-- p->'payees' is an array of {memberId, amount}; an empty array clears the allocation.
CREATE OR REPLACE FUNCTION expense_allocate_payees(org text, actor text, eid uuid, expected integer, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  staff uuid := finance_staff(org, actor); e expenses; lines jsonb := coalesce(p->'payees', '[]'::jsonb); n integer;
  key text := nullif(p->>'key', ''); before jsonb; after jsonb;
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO e FROM expenses WHERE id = eid AND organization_id = org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_unavailable'; END IF;
  IF expense_replay(org, key, eid, 'payees_allocated') THEN RETURN jsonb_build_object('id', eid, 'version', e.version, 'already', true); END IF;
  IF e.status NOT IN ('approved', 'paid') THEN RAISE EXCEPTION 'expense_not_allocatable'; END IF;
  IF e.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_expense'; END IF;
  IF e.project_id IS NULL THEN RAISE EXCEPTION 'payees_need_project'; END IF;
  IF jsonb_typeof(lines) <> 'array' THEN RAISE EXCEPTION 'invalid_payees'; END IF;
  n := jsonb_array_length(lines);
  IF n > 100 THEN RAISE EXCEPTION 'invalid_payees'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(lines) x WHERE CASE
      WHEN jsonb_typeof(x) = 'object'
        AND coalesce(x->>'memberId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND coalesce(x->>'amount', '') ~ '^\d{1,15}(\.\d{1,2})?$'
      THEN (x->>'amount')::numeric <= 0 ELSE true END) THEN
    RAISE EXCEPTION 'invalid_payees';
  END IF;
  IF (SELECT count(DISTINCT lower(x->>'memberId')) FROM jsonb_array_elements(lines) x) <> n THEN RAISE EXCEPTION 'duplicate_payee'; END IF;
  IF n > 0 THEN
    IF (SELECT count(*) FROM project_members m WHERE m.organization_id = org AND m.project_id = e.project_id
        AND m.id IN (SELECT (x->>'memberId')::uuid FROM jsonb_array_elements(lines) x)) <> n THEN
      RAISE EXCEPTION 'payee_not_on_project';
    END IF;
    IF (SELECT sum((x->>'amount')::numeric) FROM jsonb_array_elements(lines) x) > e.total THEN RAISE EXCEPTION 'payees_exceed_total'; END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('memberId', project_member_id, 'amount', amount::text) ORDER BY project_member_id), '[]'::jsonb) INTO before
  FROM expense_payees WHERE organization_id = org AND expense_id = e.id;
  PERFORM set_config('calacot.payee_allocation', 'on', true);
  DELETE FROM expense_payees WHERE organization_id = org AND expense_id = e.id;
  INSERT INTO expense_payees (organization_id, expense_id, project_member_id, amount)
  SELECT org, e.id, (x->>'memberId')::uuid, (x->>'amount')::numeric FROM jsonb_array_elements(lines) x;
  PERFORM set_config('calacot.payee_allocation', 'off', true);
  SELECT coalesce(jsonb_agg(jsonb_build_object('memberId', project_member_id, 'amount', amount::text) ORDER BY project_member_id), '[]'::jsonb) INTO after
  FROM expense_payees WHERE organization_id = org AND expense_id = e.id;

  UPDATE expenses SET version = version + 1, updated_at = now() WHERE id = e.id AND organization_id = org;
  PERFORM expense_event(org, e.id, NULL, actor, staff, 'payees_allocated', e.status, e.status, e.version + 1, NULL,
    jsonb_build_object('before', before, 'after', after), key, correlation);
  RETURN jsonb_build_object('id', e.id, 'version', e.version + 1, 'already', false);
END $$;
