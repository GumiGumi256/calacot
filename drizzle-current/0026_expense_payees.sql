-- Per-person breakdown of a project expense (additive only).
--
-- A lump-sum expense such as "Painters - week 3" can be split across members of the project team so
-- the project can report how much each person was allocated and has been paid. Lines are a breakdown
-- of the expense total, not separate payments: disbursements stay at expense level, and a line counts
-- as paid once its expense is paid in full. Lines are written only by expense_save_with_payees while
-- the expense is a draft or returned for correction, and must add up to the expense total.
--
-- No existing table, constraint, trigger or function is altered.

CREATE TABLE expense_payees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  expense_id uuid NOT NULL,
  project_member_id uuid NOT NULL,
  amount numeric(17,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_payees_org_id_uq UNIQUE (organization_id, id),
  CONSTRAINT expense_payees_member_uq UNIQUE (organization_id, expense_id, project_member_id),
  CONSTRAINT expense_payees_expense_fk FOREIGN KEY (organization_id, expense_id) REFERENCES expenses(organization_id, id) ON DELETE RESTRICT,
  -- A team member with payment lines cannot be removed from the project (keeps per-person totals intact).
  CONSTRAINT expense_payees_member_fk FOREIGN KEY (organization_id, project_member_id) REFERENCES project_members(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_payees_amount_check CHECK (amount > 0)
);
--> statement-breakpoint
CREATE INDEX expense_payees_member_idx ON expense_payees (organization_id, project_member_id);
--> statement-breakpoint
-- Lines are replaced, never edited, and only while the parent expense is editable.
CREATE OR REPLACE FUNCTION expense_payees_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s text; r expense_payees := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'expense_payees_immutable'; END IF;
  SELECT status INTO s FROM expenses WHERE organization_id = r.organization_id AND id = r.expense_id;
  IF s IS NULL OR s NOT IN ('draft', 'returned') THEN RAISE EXCEPTION 'expense_not_editable'; END IF;
  RETURN r;
END $$;
--> statement-breakpoint
CREATE TRIGGER expense_payees_guard BEFORE INSERT OR UPDATE OR DELETE ON expense_payees FOR EACH ROW EXECUTE FUNCTION expense_payees_guard();
--> statement-breakpoint
CREATE TRIGGER expense_payees_no_truncate BEFORE TRUNCATE ON expense_payees FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Safety net for any path that changes an expense without going through expense_save_with_payees:
-- an expense with a breakdown cannot be submitted unless the lines still match its total and project.
CREATE OR REPLACE FUNCTION expense_payees_submit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total numeric; mismatched boolean;
BEGIN
  SELECT sum(l.amount), bool_or(m.project_id IS DISTINCT FROM NEW.project_id) INTO total, mismatched
  FROM expense_payees l LEFT JOIN project_members m ON m.organization_id = l.organization_id AND m.id = l.project_member_id
  WHERE l.organization_id = NEW.organization_id AND l.expense_id = NEW.id;
  IF total IS NOT NULL AND (mismatched OR total <> NEW.total) THEN RAISE EXCEPTION 'payees_total_mismatch'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER expense_payees_submit_guard AFTER UPDATE OF status ON expenses FOR EACH ROW
  WHEN (NEW.status = 'submitted' AND OLD.status IS DISTINCT FROM 'submitted') EXECUTE FUNCTION expense_payees_submit_guard();
--> statement-breakpoint
-- Saves the expense exactly as expense_save does, then replaces its per-person breakdown in the same
-- transaction. p->'payees' is an array of {memberId, amount}; an empty array clears the breakdown.
CREATE OR REPLACE FUNCTION expense_save_with_payees(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  lines jsonb := coalesce(p->'payees', '[]'::jsonb); n integer; r jsonb; e expenses; before jsonb; after jsonb;
BEGIN
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

  r := expense_save(org, actor, p, correlation);
  IF (r->>'already')::boolean THEN RETURN r; END IF;

  SELECT * INTO e FROM expenses WHERE organization_id = org AND id = (r->>'id')::uuid FOR UPDATE;
  IF n > 0 THEN
    IF e.project_id IS NULL THEN RAISE EXCEPTION 'payees_need_project'; END IF;
    IF (SELECT count(*) FROM project_members m WHERE m.organization_id = org AND m.project_id = e.project_id
        AND m.id IN (SELECT (x->>'memberId')::uuid FROM jsonb_array_elements(lines) x)) <> n THEN
      RAISE EXCEPTION 'payee_not_on_project';
    END IF;
    IF (SELECT sum((x->>'amount')::numeric) FROM jsonb_array_elements(lines) x) <> e.total THEN RAISE EXCEPTION 'payees_total_mismatch'; END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('memberId', project_member_id, 'amount', amount::text) ORDER BY project_member_id), '[]'::jsonb) INTO before
  FROM expense_payees WHERE organization_id = org AND expense_id = e.id;
  DELETE FROM expense_payees WHERE organization_id = org AND expense_id = e.id;
  INSERT INTO expense_payees (organization_id, expense_id, project_member_id, amount)
  SELECT org, e.id, (x->>'memberId')::uuid, (x->>'amount')::numeric FROM jsonb_array_elements(lines) x;
  SELECT coalesce(jsonb_agg(jsonb_build_object('memberId', project_member_id, 'amount', amount::text) ORDER BY project_member_id), '[]'::jsonb) INTO after
  FROM expense_payees WHERE organization_id = org AND expense_id = e.id;
  IF before IS DISTINCT FROM after THEN
    PERFORM expense_event(org, e.id, NULL, actor, finance_staff(org, actor), 'payees_updated', e.status, e.status, e.version, NULL,
      jsonb_build_object('before', before, 'after', after), NULL, correlation);
  END IF;
  RETURN r;
END $$;
