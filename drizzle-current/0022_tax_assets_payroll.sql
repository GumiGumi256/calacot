-- Phase 2D: tax management, fixed assets and the payroll accounting foundation (additive only).
--
-- Nothing here alters an existing table, row, constraint or function. Invoices, payments, allocations,
-- expenses, banking and the Phase 2A-2C ledger keep working exactly as before.
--
-- Safety switches enforced by the database itself:
--   * No tax is operational because its schema exists. Every obligation and rule is a versioned
--     proposal that needs evidence and a second person's approval.
--   * Only corporate income tax can be made operational in this phase. VAT, withholding tax, PAYE,
--     NSSF and other taxes cannot be enabled (CHECK constraint); their readiness tables refuse writes.
--   * Payroll runs can only be drafted and simulated: approval, payment and posting are impossible
--     (CHECK constraint). Lifting any of these needs a future, reviewed migration.
--   * Every financial effect (tax provision, tax payment, capitalization, depreciation, impairment,
--     disposal) is an ordinary MANUAL journal through the Phase 2A functions: balance, open period,
--     approved policy, active accounts and two-person approval all apply. There is no second ledger.
--
-- Called through the Neon HTTP driver: each function call is one PostgreSQL transaction. Functions are
-- INVOKER. The application checks Clerk permissions; these functions enforce record-level rules.

-- ---------------------------------------------------------------------------------------------
-- History, helpers and the link between Phase 2D records and their journals
-- ---------------------------------------------------------------------------------------------

CREATE TABLE tax_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  entity_type text NOT NULL CHECK (entity_type IN ('tax_rule','tax_obligation','income_tax_computation','tax_filing','tax_assessment','tax_payment','ledger_link',
    'asset_category','fixed_asset','depreciation_run','asset_disposal','asset_impairment','asset_transfer','payroll_profile','payroll_component','payroll_structure','payroll_run')),
  entity_id text NOT NULL,
  actor_clerk_user_id text NOT NULL,
  actor_staff_id uuid,
  action text NOT NULL,
  note text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, actor_staff_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX tax_events_idempotency_uq ON tax_events (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX tax_events_entity_idx ON tax_events (organization_id, entity_type, entity_id, created_at);
--> statement-breakpoint
CREATE TRIGGER tax_events_immutable BEFORE UPDATE OR DELETE ON tax_events FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER tax_events_no_truncate BEFORE TRUNCATE ON tax_events FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tax_event(org text, etype text, eid text, actor text, staff uuid, act text, note text, changes jsonb, key text, correlation text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO tax_events (organization_id, entity_type, entity_id, actor_clerk_user_id, actor_staff_id, action, note, changes, idempotency_key, correlation_id)
  VALUES (org, etype, eid, actor, staff, act, nullif(trim(coalesce(note, '')), ''), coalesce(changes, '{}'::jsonb), key, correlation);
  INSERT INTO audit_logs (organization_id, actor_clerk_user_id, actor_type, action, entity_type, entity_id, changes, request_id)
  VALUES (org, actor, 'staff', 'tax.' || etype || '.' || act, etype, eid, coalesce(changes, '{}'::jsonb), correlation);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tax_replay(org text, key text, etype text, eid text, act text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE ev tax_events;
BEGIN
  IF key IS NULL OR length(key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO ev FROM tax_events WHERE organization_id = org AND idempotency_key = key;
  IF NOT FOUND THEN RETURN false; END IF;
  IF ev.entity_type <> etype OR ev.entity_id <> eid OR ev.action <> act THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN true;
END $$;
--> statement-breakpoint
-- A supporting document must be a live company document of this organization.
CREATE OR REPLACE FUNCTION tax_document_required(org text, v text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE did uuid;
BEGIN
  IF NOT accounting_is_uuid(v) THEN RAISE EXCEPTION 'tax_evidence_required'; END IF;
  SELECT id INTO did FROM documents WHERE organization_id = org AND id = v::uuid AND archived_at IS NULL;
  IF did IS NULL THEN RAISE EXCEPTION 'tax_evidence_unavailable'; END IF;
  RETURN did;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tax_rate_value(v text) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF coalesce(v, '') !~ '^(0(\.\d{1,6})?|1(\.0{1,6})?)$' THEN RAISE EXCEPTION 'invalid_tax_rate'; END IF;
  RETURN v::numeric;
END $$;
--> statement-breakpoint
-- A journal counts only when it is posted and has not been reversed by a posted reversal.
CREATE OR REPLACE FUNCTION ledger_journal_effective(org text, jid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM accounting_journals j WHERE j.organization_id = org AND j.id = jid AND j.status = 'posted')
    AND NOT EXISTS (SELECT 1 FROM accounting_journals r WHERE r.organization_id = org AND r.reverses_journal_id = jid AND r.status = 'posted');
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ledger_journal_live(org text, jid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM accounting_journals j WHERE j.organization_id = org AND j.id = jid AND j.status NOT IN ('rejected','discarded'))
    AND NOT EXISTS (SELECT 1 FROM accounting_journals r WHERE r.organization_id = org AND r.reverses_journal_id = jid AND r.status = 'posted');
$$;
--> statement-breakpoint
-- Every Phase 2D journal is recorded here with its purpose and source record.
CREATE TABLE ledger_source_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  purpose text NOT NULL CHECK (purpose IN ('tax_provision','tax_payment','asset_capitalization','asset_depreciation','asset_impairment','asset_disposal')),
  source_id uuid NOT NULL,
  journal_id uuid NOT NULL,
  amount numeric(17,2) NOT NULL,
  prepared_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, journal_id),
  FOREIGN KEY (organization_id, journal_id) REFERENCES accounting_journals(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX ledger_source_links_source_idx ON ledger_source_links (organization_id, purpose, source_id);
--> statement-breakpoint
CREATE TRIGGER ledger_source_links_immutable BEFORE UPDATE OR DELETE ON ledger_source_links FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER ledger_source_links_no_truncate BEFORE TRUNCATE ON ledger_source_links FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Internal: create a draft manual journal, write its lines, submit it, and link it to its source.
CREATE OR REPLACE FUNCTION ledger_link_prepare(org text, actor text, staff uuid, purpose text, source uuid, entry date, descr text, ref text, lines jsonb, amount numeric, key text, correlation text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE jid uuid; lid uuid;
BEGIN
  INSERT INTO accounting_journals (organization_id, journal_type, status, entry_date, description, reference, prepared_by_id, idempotency_key)
  VALUES (org, 'manual', 'draft', entry, left(descr, 500), left(ref, 100), staff, 'phase2d:' || key) RETURNING id INTO jid;
  PERFORM accounting_journal_write_lines(org, jid, lines);
  PERFORM accounting_event(org, 'journal', jid::text, actor, staff, 'created', NULL, 'draft', 1, NULL, accounting_journal_totals(org, jid) || jsonb_build_object('source', purpose), NULL, correlation);
  INSERT INTO ledger_source_links (organization_id, purpose, source_id, journal_id, amount, prepared_by_id) VALUES (org, purpose, source, jid, amount, staff) RETURNING id INTO lid;
  PERFORM accounting_journal_command(org, actor, jid, 'submit', 1, NULL, 'phase2d-submit:' || key, correlation);
  PERFORM tax_event(org, 'ledger_link', lid::text, actor, staff, 'prepared', descr, jsonb_build_object('purpose', purpose, 'sourceId', source, 'journalId', jid, 'amount', amount::text), NULL, correlation);
  RETURN lid;
END $$;
--> statement-breakpoint
-- approve: a different person approves and posts. reject: a reviewer refuses. cancel: the preparer withdraws.
-- reverse: a posted journal is reversed by a new posted journal (the original never changes).
CREATE OR REPLACE FUNCTION ledger_link_decide(org text, actor text, lid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); l ledger_source_links; j accounting_journals; r jsonb; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF decision NOT IN ('approve','reject','cancel','reverse') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  IF key IS NULL OR length(key) > 180 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO l FROM ledger_source_links WHERE organization_id = org AND id = lid;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger_link_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':ledger_link:' || l.purpose || ':' || l.source_id, 0));
  IF tax_replay(org, key, 'ledger_link', lid::text, decision) THEN
    SELECT * INTO j FROM accounting_journals WHERE organization_id = org AND id = l.journal_id;
    RETURN jsonb_build_object('id', lid, 'status', j.status, 'number', j.number, 'already', true);
  END IF;
  SELECT * INTO j FROM accounting_journals WHERE organization_id = org AND id = l.journal_id FOR UPDATE;
  IF decision = 'approve' THEN
    IF j.status <> 'submitted' THEN RAISE EXCEPTION 'ledger_link_not_pending'; END IF;
    r := accounting_journal_command(org, actor, j.id, 'approve', j.version, clean, key || ':approve', correlation);
    r := accounting_journal_command(org, actor, j.id, 'post', (r->>'version')::integer, NULL, key || ':post', correlation);
  ELSIF decision = 'reject' THEN
    IF j.status <> 'submitted' THEN RAISE EXCEPTION 'ledger_link_not_pending'; END IF;
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
    r := accounting_journal_command(org, actor, j.id, 'reject', j.version, clean, key || ':reject', correlation);
  ELSIF decision = 'cancel' THEN
    IF j.status <> 'submitted' THEN RAISE EXCEPTION 'ledger_link_not_pending'; END IF;
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
    r := accounting_journal_command(org, actor, j.id, 'withdraw', j.version, clean, key || ':withdraw', correlation);
    r := accounting_journal_command(org, actor, j.id, 'discard', (r->>'version')::integer, clean, key || ':discard', correlation);
  ELSE
    IF NOT ledger_journal_effective(org, j.id) THEN RAISE EXCEPTION 'journal_not_posted'; END IF;
    PERFORM ledger_link_reverse_check(org, l);
    r := accounting_journal_reverse(org, actor, j.id, jsonb_build_object('key', key || ':reverse', 'reason', clean), correlation);
  END IF;
  PERFORM tax_event(org, 'ledger_link', lid::text, actor, staff, decision, clean, jsonb_build_object('purpose', l.purpose, 'journalId', j.id, 'result', r), key, correlation);
  RETURN jsonb_build_object('id', lid, 'status', coalesce(r->>'status', 'reversed'), 'number', r->>'number', 'already', false);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Tax rules: versioned, evidenced, approved calculation parameters. Nothing is hardcoded: a rate
-- exists only as an approved rule version with an effective date and a legal basis.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE tax_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  rule_code text NOT NULL CHECK (rule_code ~ '^[a-z0-9][a-z0-9_.-]{2,59}$'),
  version integer NOT NULL CHECK (version > 0),
  rule_kind text NOT NULL CHECK (rule_kind IN ('income_tax_rate','capital_allowance_class','paye_bands','nssf_rates','vat_rate','withholding_rate')),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 5 AND 500),
  parameters jsonb NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  legal_basis text NOT NULL CHECK (length(trim(legal_basis)) BETWEEN 5 AND 1000),
  evidence_document_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','superseded','retired')),
  proposed_by_id uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, rule_code, version),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, evidence_document_id) REFERENCES documents(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, proposed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK ((status = 'proposed') = (decided_by_id IS NULL)),
  CHECK (decided_by_id IS NULL OR decided_by_id <> proposed_by_id)
);
--> statement-breakpoint
CREATE TRIGGER tax_rule_versions_no_truncate BEFORE TRUNCATE ON tax_rule_versions FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Parameters per rule kind. Rates are decimal fractions (0.3 = 30%) with at most 6 decimals.
CREATE OR REPLACE FUNCTION tax_rule_parameters_valid(k text, p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE b jsonb; prev numeric := -1;
BEGIN
  IF jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;
  IF k IN ('income_tax_rate','vat_rate','withholding_rate') THEN
    PERFORM tax_rate_value(p->>'rate');
    IF k = 'income_tax_rate' THEN
      IF p ? 'lossOffsetLimit' AND p->>'lossOffsetLimit' IS NOT NULL THEN PERFORM tax_rate_value(p->>'lossOffsetLimit'); END IF;
    END IF;
  ELSIF k = 'capital_allowance_class' THEN
    IF coalesce(p->>'classCode', '') !~ '^[A-Za-z0-9_.-]{1,40}$' OR coalesce(p->>'method', '') NOT IN ('straight_line','reducing_balance') THEN RETURN false; END IF;
    PERFORM tax_rate_value(p->>'rate');
  ELSIF k = 'paye_bands' THEN
    IF jsonb_typeof(p->'bands') <> 'array' OR jsonb_array_length(p->'bands') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
    FOR b IN SELECT value FROM jsonb_array_elements(p->'bands') LOOP
      PERFORM tax_rate_value(b->>'rate');
      IF b->>'upTo' IS NOT NULL THEN
        IF b->>'upTo' !~ '^\d{1,15}(\.\d{1,2})?$' OR (b->>'upTo')::numeric <= prev THEN RETURN false; END IF;
        prev := (b->>'upTo')::numeric;
      END IF;
    END LOOP;
  ELSIF k = 'nssf_rates' THEN
    PERFORM tax_rate_value(p->>'employeeRate'); PERFORM tax_rate_value(p->>'employerRate');
  ELSE RETURN false;
  END IF;
  RETURN true;
EXCEPTION WHEN raise_exception THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tax_rule_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'tax_history_immutable'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'proposed' THEN RAISE EXCEPTION 'tax_history_immutable'; END IF;
    IF NOT tax_rule_parameters_valid(NEW.rule_kind, NEW.parameters) THEN RAISE EXCEPTION 'invalid_tax_rule'; END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','decision_note']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','decision_note'])
     OR NOT ((OLD.status = 'proposed' AND NEW.status IN ('approved','rejected')) OR (OLD.status = 'approved' AND NEW.status IN ('superseded','retired'))) THEN
    RAISE EXCEPTION 'tax_history_immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER tax_rule_guard BEFORE INSERT OR UPDATE OR DELETE ON tax_rule_versions FOR EACH ROW EXECUTE FUNCTION tax_rule_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tax_rule_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); r tax_rule_versions; rid uuid; v integer; ev uuid;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO r FROM tax_rule_versions WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF r.rule_code IS DISTINCT FROM p->>'ruleCode' OR r.proposed_by_id <> staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', r.id, 'version', r.version, 'already', true);
  END IF;
  ev := tax_document_required(org, p->>'evidenceDocumentId');
  IF coalesce(p->>'effectiveFrom', '') !~ '^\d{4}-\d{2}-\d{2}$' OR (nullif(p->>'effectiveTo', '') IS NOT NULL AND p->>'effectiveTo' !~ '^\d{4}-\d{2}-\d{2}$') THEN RAISE EXCEPTION 'invalid_effective_date'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':tax_rule:' || coalesce(p->>'ruleCode', ''), 0));
  IF EXISTS (SELECT 1 FROM tax_rule_versions WHERE organization_id = org AND rule_code = p->>'ruleCode' AND status = 'proposed') THEN RAISE EXCEPTION 'tax_rule_pending'; END IF;
  IF EXISTS (SELECT 1 FROM tax_rule_versions WHERE organization_id = org AND rule_code = p->>'ruleCode' AND rule_kind <> p->>'ruleKind') THEN RAISE EXCEPTION 'invalid_tax_rule'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v FROM tax_rule_versions WHERE organization_id = org AND rule_code = p->>'ruleCode';
  BEGIN
    INSERT INTO tax_rule_versions (organization_id, rule_code, version, rule_kind, description, parameters, effective_from, effective_to, legal_basis, evidence_document_id, proposed_by_id, idempotency_key)
    VALUES (org, p->>'ruleCode', v, p->>'ruleKind', trim(coalesce(p->>'description', '')), coalesce(p->'parameters', '{}'::jsonb), (p->>'effectiveFrom')::date, nullif(p->>'effectiveTo', '')::date,
      trim(coalesce(p->>'legalBasis', '')), ev, staff, key) RETURNING id INTO rid;
  EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'invalid_tax_rule';
  END;
  PERFORM tax_event(org, 'tax_rule', rid::text, actor, staff, 'proposed', p->>'legalBasis', jsonb_build_object('ruleCode', p->>'ruleCode', 'version', v, 'kind', p->>'ruleKind', 'parameters', p->'parameters', 'effectiveFrom', p->>'effectiveFrom'), key, correlation);
  RETURN jsonb_build_object('id', rid, 'version', v, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tax_rule_decide(org text, actor text, rid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
#variable_conflict use_variable
DECLARE staff uuid := finance_staff(org, actor); r tax_rule_versions; target text; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF decision NOT IN ('approve','reject','retire') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO r FROM tax_rule_versions WHERE organization_id = org AND id = rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'tax_rule_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':tax_rule:' || r.rule_code, 0));
  IF tax_replay(org, key, 'tax_rule', rid::text, decision) THEN RETURN jsonb_build_object('id', rid, 'already', true); END IF;
  SELECT * INTO r FROM tax_rule_versions WHERE organization_id = org AND id = rid FOR UPDATE;
  IF (decision IN ('approve','reject') AND r.status <> 'proposed') OR (decision = 'retire' AND r.status <> 'approved') THEN RAISE EXCEPTION 'tax_rule_unavailable'; END IF;
  IF r.proposed_by_id = staff AND decision <> 'retire' THEN RAISE EXCEPTION 'tax_self_approval_denied'; END IF;
  IF decision <> 'approve' AND length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
  IF decision = 'approve' THEN
    -- A newer approved version supersedes older approved versions of the same rule (kept for history and past dates).
    UPDATE tax_rule_versions SET status = 'superseded' WHERE organization_id = org AND rule_code = r.rule_code AND status = 'approved' AND id <> r.id;
  END IF;
  target := CASE decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'retired' END;
  UPDATE tax_rule_versions SET status = target,
    decided_by_id = CASE WHEN decision = 'retire' THEN decided_by_id ELSE staff END, decided_at = CASE WHEN decision = 'retire' THEN decided_at ELSE now() END,
    decision_note = CASE WHEN decision = 'retire' THEN decision_note ELSE clean END
  WHERE organization_id = org AND id = rid;
  PERFORM tax_event(org, 'tax_rule', rid::text, actor, staff, decision, clean, jsonb_build_object('ruleCode', r.rule_code, 'version', r.version, 'status', target), key, correlation);
  RETURN jsonb_build_object('id', rid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint
-- The rule version in force on a date: approved or superseded (history still applies to past dates).
CREATE OR REPLACE FUNCTION tax_rule_at(org text, code text, d date) RETURNS tax_rule_versions LANGUAGE sql STABLE AS $$
  SELECT * FROM tax_rule_versions WHERE organization_id = org AND rule_code = code AND status IN ('approved','superseded')
    AND effective_from <= d AND (effective_to IS NULL OR effective_to >= d) ORDER BY effective_from DESC, version DESC LIMIT 1;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Tax obligations: what Calacot is registered for, how often it files and pays, which accounts are
-- used, and whether processing is enabled. Versioned; every version needs a second person's approval.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE tax_obligation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  code text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
  version integer NOT NULL CHECK (version > 0),
  tax_type text NOT NULL CHECK (tax_type IN ('corporate_income_tax','vat','withholding_tax','paye','nssf','other')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 3 AND 120),
  registration_status text NOT NULL CHECK (registration_status IN ('not_registered','registered','applicable','exempt','pending_verification','inactive')),
  taxpayer_name text NOT NULL CHECK (length(trim(taxpayer_name)) BETWEEN 2 AND 200),
  taxpayer_tin text CHECK (taxpayer_tin IS NULL OR taxpayer_tin ~ '^[0-9]{6,15}$'),
  effective_from date NOT NULL,
  effective_to date,
  legal_basis text NOT NULL CHECK (length(trim(legal_basis)) BETWEEN 5 AND 1000),
  period_basis text NOT NULL CHECK (period_basis IN ('accounting_year','calendar_month','calendar_quarter')),
  filing_frequency text NOT NULL CHECK (filing_frequency IN ('annual','semi_annual','quarterly','monthly','none')),
  deadline_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculation_rule_code text,
  expense_account_id uuid,
  liability_account_id uuid,
  prepayment_account_id uuid,
  processing_enabled boolean NOT NULL DEFAULT false,
  evidence_document_id uuid,
  note text CHECK (note IS NULL OR length(note) <= 2000),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','superseded')),
  proposed_by_id uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code, version),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, evidence_document_id) REFERENCES documents(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, expense_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, liability_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepayment_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, proposed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK ((status = 'proposed') = (decided_by_id IS NULL)),
  CHECK (decided_by_id IS NULL OR decided_by_id <> proposed_by_id),
  -- Only corporate income tax can be operational in Phase 2D. VAT, withholding tax, PAYE, NSSF and
  -- other taxes stay disabled until a reviewed migration lifts this constraint.
  CHECK (NOT processing_enabled OR tax_type = 'corporate_income_tax'),
  -- Processing needs a registered or applicable status, evidence, a calculation rule and accounts.
  CHECK (NOT processing_enabled OR (registration_status IN ('registered','applicable') AND evidence_document_id IS NOT NULL
    AND calculation_rule_code IS NOT NULL AND expense_account_id IS NOT NULL AND liability_account_id IS NOT NULL)),
  -- Any statement about registration other than "pending verification" needs evidence.
  CHECK (registration_status = 'pending_verification' OR evidence_document_id IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX tax_obligation_one_approved_uq ON tax_obligation_versions (organization_id, code) WHERE status = 'approved';
--> statement-breakpoint
CREATE UNIQUE INDEX tax_obligation_one_proposal_uq ON tax_obligation_versions (organization_id, code) WHERE status = 'proposed';
--> statement-breakpoint
CREATE TRIGGER tax_obligation_versions_no_truncate BEFORE TRUNCATE ON tax_obligation_versions FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Deadline rules: [{event, label, anchor: period_end|year_start, monthsOffset, day: "last"|1..31, filing, payment}]
CREATE OR REPLACE FUNCTION tax_deadline_rules_valid(r jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE x jsonb;
BEGIN
  IF jsonb_typeof(r) <> 'array' OR jsonb_array_length(r) > 20 THEN RETURN false; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(r) LOOP
    IF coalesce(x->>'event', '') !~ '^[a-z][a-z_]{2,39}$' OR length(trim(coalesce(x->>'label', ''))) NOT BETWEEN 3 AND 120
       OR coalesce(x->>'anchor', '') NOT IN ('period_end','year_start') OR coalesce(x->>'monthsOffset', '') !~ '^-?\d{1,2}$'
       OR (x->>'day' <> 'last' AND coalesce(x->>'day', '') !~ '^([1-9]|[12]\d|3[01])$')
       OR jsonb_typeof(x->'filing') <> 'boolean' OR jsonb_typeof(x->'payment') <> 'boolean' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tax_obligation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a accounting_accounts;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'tax_history_immutable'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','decision_note']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','decision_note'])
       OR NOT ((OLD.status = 'proposed' AND NEW.status IN ('approved','rejected')) OR (OLD.status = 'approved' AND NEW.status = 'superseded')) THEN
      RAISE EXCEPTION 'tax_history_immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status <> 'proposed' THEN RAISE EXCEPTION 'tax_history_immutable'; END IF;
  IF NOT tax_deadline_rules_valid(NEW.deadline_rules) THEN RAISE EXCEPTION 'invalid_deadline_rules'; END IF;
  IF NEW.expense_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting_accounts WHERE organization_id = NEW.organization_id AND id = NEW.expense_account_id AND is_postable AND manual_posting_allowed
      AND account_type IN ('other_expense','operating_expense')) THEN RAISE EXCEPTION 'tax_account_invalid'; END IF;
  IF NEW.liability_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting_accounts WHERE organization_id = NEW.organization_id AND id = NEW.liability_account_id AND is_postable AND manual_posting_allowed
      AND account_type = 'liability') THEN RAISE EXCEPTION 'tax_account_invalid'; END IF;
  IF NEW.prepayment_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting_accounts WHERE organization_id = NEW.organization_id AND id = NEW.prepayment_account_id AND is_postable AND manual_posting_allowed
      AND account_type = 'asset' AND NOT is_contra) THEN RAISE EXCEPTION 'tax_account_invalid'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER tax_obligation_guard BEFORE INSERT OR UPDATE OR DELETE ON tax_obligation_versions FOR EACH ROW EXECUTE FUNCTION tax_obligation_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tax_obligation_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); o tax_obligation_versions; oid uuid; v integer; ev uuid; acct jsonb := coalesce(p->'accounts', '{}'::jsonb);
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO o FROM tax_obligation_versions WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF o.code IS DISTINCT FROM p->>'code' OR o.proposed_by_id <> staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', o.id, 'version', o.version, 'already', true);
  END IF;
  IF nullif(p->>'evidenceDocumentId', '') IS NOT NULL THEN ev := tax_document_required(org, p->>'evidenceDocumentId'); END IF;
  IF coalesce(p->>'effectiveFrom', '') !~ '^\d{4}-\d{2}-\d{2}$' OR (nullif(p->>'effectiveTo', '') IS NOT NULL AND p->>'effectiveTo' !~ '^\d{4}-\d{2}-\d{2}$') THEN RAISE EXCEPTION 'invalid_effective_date'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':tax_obligation:' || coalesce(p->>'code', ''), 0));
  IF EXISTS (SELECT 1 FROM tax_obligation_versions WHERE organization_id = org AND code = p->>'code' AND tax_type <> p->>'taxType') THEN RAISE EXCEPTION 'invalid_tax_obligation'; END IF;
  IF EXISTS (SELECT 1 FROM tax_obligation_versions WHERE organization_id = org AND code = p->>'code' AND status = 'proposed') THEN RAISE EXCEPTION 'tax_obligation_pending'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v FROM tax_obligation_versions WHERE organization_id = org AND code = p->>'code';
  BEGIN
    INSERT INTO tax_obligation_versions (organization_id, code, version, tax_type, name, registration_status, taxpayer_name, taxpayer_tin, effective_from, effective_to, legal_basis,
      period_basis, filing_frequency, deadline_rules, calculation_rule_code, expense_account_id, liability_account_id, prepayment_account_id, processing_enabled, evidence_document_id, note, proposed_by_id, idempotency_key)
    VALUES (org, p->>'code', v, p->>'taxType', trim(coalesce(p->>'name', '')), p->>'registrationStatus', trim(coalesce(p->>'taxpayerName', '')), nullif(regexp_replace(coalesce(p->>'taxpayerTin', ''), '\s', '', 'g'), ''),
      (p->>'effectiveFrom')::date, nullif(p->>'effectiveTo', '')::date, trim(coalesce(p->>'legalBasis', '')), p->>'periodBasis', p->>'filingFrequency', coalesce(p->'deadlineRules', '[]'::jsonb),
      nullif(p->>'calculationRuleCode', ''), nullif(acct->>'expense', '')::uuid, nullif(acct->>'liability', '')::uuid, nullif(acct->>'prepayment', '')::uuid,
      coalesce((p->>'processingEnabled')::boolean, false), ev, nullif(trim(coalesce(p->>'note', '')), ''), staff, key)
    RETURNING id INTO oid;
  EXCEPTION
    WHEN check_violation THEN
      IF coalesce((p->>'processingEnabled')::boolean, false) AND p->>'taxType' <> 'corporate_income_tax' THEN RAISE EXCEPTION 'tax_type_not_enabled_in_phase'; END IF;
      IF coalesce((p->>'processingEnabled')::boolean, false) THEN RAISE EXCEPTION 'tax_processing_prerequisites'; END IF;
      IF ev IS NULL AND p->>'registrationStatus' <> 'pending_verification' THEN RAISE EXCEPTION 'tax_evidence_required'; END IF;
      RAISE EXCEPTION 'invalid_tax_obligation';
    WHEN invalid_text_representation THEN RAISE EXCEPTION 'invalid_tax_obligation';
  END;
  PERFORM tax_event(org, 'tax_obligation', oid::text, actor, staff, 'proposed', p->>'note',
    jsonb_build_object('code', p->>'code', 'version', v, 'taxType', p->>'taxType', 'registrationStatus', p->>'registrationStatus', 'processingEnabled', coalesce((p->>'processingEnabled')::boolean, false)), key, correlation);
  RETURN jsonb_build_object('id', oid, 'version', v, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tax_obligation_decide(org text, actor text, oid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
#variable_conflict use_variable
DECLARE staff uuid := finance_staff(org, actor); o tax_obligation_versions; target text; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO o FROM tax_obligation_versions WHERE organization_id = org AND id = oid;
  IF NOT FOUND THEN RAISE EXCEPTION 'tax_obligation_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':tax_obligation:' || o.code, 0));
  IF tax_replay(org, key, 'tax_obligation', oid::text, decision) THEN RETURN jsonb_build_object('id', oid, 'already', true); END IF;
  SELECT * INTO o FROM tax_obligation_versions WHERE organization_id = org AND id = oid FOR UPDATE;
  IF o.status <> 'proposed' THEN RAISE EXCEPTION 'tax_obligation_unavailable'; END IF;
  IF o.proposed_by_id = staff THEN RAISE EXCEPTION 'tax_self_approval_denied'; END IF;
  IF decision = 'reject' AND length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
  IF decision = 'approve' AND o.processing_enabled THEN
    -- Processing needs an approved calculation rule that exists now.
    IF NOT EXISTS (SELECT 1 FROM tax_rule_versions WHERE organization_id = org AND rule_code = o.calculation_rule_code AND status = 'approved') THEN RAISE EXCEPTION 'tax_rule_not_approved'; END IF;
    IF NOT EXISTS (SELECT 1 FROM accounting_accounts WHERE organization_id = org AND id IN (o.expense_account_id, o.liability_account_id) AND status = 'active' HAVING count(*) = 2) THEN RAISE EXCEPTION 'tax_account_invalid'; END IF;
  END IF;
  IF decision = 'approve' THEN
    UPDATE tax_obligation_versions SET status = 'superseded' WHERE organization_id = org AND code = o.code AND status = 'approved';
  END IF;
  target := CASE WHEN decision = 'approve' THEN 'approved' ELSE 'rejected' END;
  UPDATE tax_obligation_versions SET status = target, decided_by_id = staff, decided_at = now(), decision_note = clean WHERE organization_id = org AND id = oid;
  PERFORM tax_event(org, 'tax_obligation', oid::text, actor, staff, decision, clean, jsonb_build_object('code', o.code, 'version', o.version, 'status', target, 'processingEnabled', o.processing_enabled), key, correlation);
  RETURN jsonb_build_object('id', oid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tax_obligation_current(org text, c text) RETURNS tax_obligation_versions LANGUAGE sql STABLE AS $$
  SELECT * FROM tax_obligation_versions WHERE organization_id = org AND code = c AND status = 'approved';
$$;
--> statement-breakpoint
-- An obligation is operational only when its current approved version enables processing.
CREATE OR REPLACE FUNCTION tax_obligation_operational(org text, c text) RETURNS tax_obligation_versions LANGUAGE plpgsql STABLE AS $$
DECLARE o tax_obligation_versions;
BEGIN
  o := tax_obligation_current(org, c);
  IF o.id IS NULL OR NOT o.processing_enabled THEN RAISE EXCEPTION 'tax_obligation_not_operational'; END IF;
  RETURN o;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Corporate income tax. Accounting profit (from the posted ledger) is kept separate from chargeable
-- income (after reviewed adjustments). Estimates, approved computations, provisions in the ledger,
-- filed returns, URA assessments and payments are separate records; none implies another.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE income_tax_computations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  obligation_code text NOT NULL,
  obligation_version_id uuid NOT NULL,
  fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2200),
  period_start date NOT NULL,
  period_end date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('provisional','final','amended')),
  rule_version_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','superseded')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  estimated_profit numeric(17,2),
  accounting_profit numeric(17,2),
  loss_brought_forward numeric(17,2) NOT NULL DEFAULT 0 CHECK (loss_brought_forward >= 0),
  loss_evidence_document_id uuid,
  figures jsonb,
  note text CHECK (note IS NULL OR length(note) <= 2000),
  prepared_by_id uuid NOT NULL,
  submitted_by_id uuid,
  submitted_at timestamptz,
  approved_by_id uuid,
  approved_at timestamptz,
  review_note text,
  supersedes_id uuid,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, obligation_version_id) REFERENCES tax_obligation_versions(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, rule_version_id) REFERENCES tax_rule_versions(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, loss_evidence_document_id) REFERENCES documents(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, supersedes_id) REFERENCES income_tax_computations(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, submitted_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, approved_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (period_end >= period_start),
  CHECK (status NOT IN ('approved','superseded') OR (approved_by_id IS NOT NULL AND figures IS NOT NULL AND accounting_profit IS NOT NULL)),
  CHECK (approved_by_id IS NULL OR (approved_by_id <> prepared_by_id AND approved_by_id <> submitted_by_id)),
  CHECK (kind <> 'provisional' OR estimated_profit IS NOT NULL OR status = 'draft'),
  CHECK (loss_brought_forward = 0 OR loss_evidence_document_id IS NOT NULL)
);
--> statement-breakpoint
-- One approved computation per obligation, year and kind (an amended one supersedes the final).
CREATE UNIQUE INDEX income_tax_one_approved_uq ON income_tax_computations (organization_id, obligation_code, fiscal_year, (kind = 'provisional')) WHERE status = 'approved';
--> statement-breakpoint
CREATE TRIGGER income_tax_computations_no_truncate BEFORE TRUNCATE ON income_tax_computations FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION income_tax_computation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'tax_history_immutable'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.approved_by_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_tax_transition'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.obligation_code, NEW.fiscal_year, NEW.kind, NEW.prepared_by_id, NEW.idempotency_key, NEW.created_at, NEW.supersedes_id)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.obligation_code, OLD.fiscal_year, OLD.kind, OLD.prepared_by_id, OLD.idempotency_key, OLD.created_at, OLD.supersedes_id) THEN
    RAISE EXCEPTION 'tax_history_immutable';
  END IF;
  IF OLD.status IN ('approved','superseded','rejected') AND NOT (OLD.status = 'approved' AND NEW.status = 'superseded'
     AND (to_jsonb(NEW) - ARRAY['status','updated_at']) = (to_jsonb(OLD) - ARRAY['status','updated_at'])) THEN
    RAISE EXCEPTION 'tax_history_immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status = 'draft' AND NEW.status = 'submitted') OR (OLD.status = 'submitted' AND NEW.status IN ('draft','approved','rejected'))
     OR (OLD.status = 'approved' AND NEW.status = 'superseded')) THEN
    RAISE EXCEPTION 'invalid_tax_transition';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER income_tax_computation_guard BEFORE INSERT OR UPDATE OR DELETE ON income_tax_computations FOR EACH ROW EXECUTE FUNCTION income_tax_computation_guard();
--> statement-breakpoint
CREATE TABLE income_tax_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  computation_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 300),
  kind text NOT NULL CHECK (kind IN ('non_deductible','add_back','depreciation_addback','other_increase','deduction','exempt_income','capital_allowance','other_decrease')),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 3 AND 300),
  amount numeric(17,2) NOT NULL CHECK (amount > 0),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ledger_depreciation','capital_allowance_schedule')),
  account_id uuid,
  evidence_document_id uuid,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, computation_id, line_number),
  FOREIGN KEY (organization_id, computation_id) REFERENCES income_tax_computations(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, evidence_document_id) REFERENCES documents(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE income_tax_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  computation_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 300),
  kind text NOT NULL CHECK (kind IN ('withholding_credit','foreign_tax_credit','other_credit')),
  certificate_reference text NOT NULL CHECK (length(trim(certificate_reference)) BETWEEN 1 AND 100),
  counterparty text CHECK (counterparty IS NULL OR length(counterparty) <= 200),
  amount numeric(17,2) NOT NULL CHECK (amount > 0),
  evidence_document_id uuid NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, computation_id, line_number),
  FOREIGN KEY (organization_id, computation_id) REFERENCES income_tax_computations(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, evidence_document_id) REFERENCES documents(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
-- Schedules change only while their computation is a draft.
CREATE OR REPLACE FUNCTION income_tax_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM income_tax_computations WHERE organization_id = coalesce(NEW.organization_id, OLD.organization_id) AND id = coalesce(NEW.computation_id, OLD.computation_id);
  IF st IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'tax_computation_locked'; END IF;
  RETURN coalesce(NEW, OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER income_tax_adjustments_guard BEFORE INSERT OR UPDATE OR DELETE ON income_tax_adjustments FOR EACH ROW EXECUTE FUNCTION income_tax_line_guard();
--> statement-breakpoint
CREATE TRIGGER income_tax_credits_guard BEFORE INSERT OR UPDATE OR DELETE ON income_tax_credits FOR EACH ROW EXECUTE FUNCTION income_tax_line_guard();
--> statement-breakpoint
CREATE TRIGGER income_tax_adjustments_no_truncate BEFORE TRUNCATE ON income_tax_adjustments FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER income_tax_credits_no_truncate BEFORE TRUNCATE ON income_tax_credits FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Profit before tax from POSTED journals: income less costs, excluding income-tax expense accounts.
CREATE OR REPLACE FUNCTION income_tax_accounting_profit(org text, s date, e date) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT coalesce(sum(CASE WHEN a.account_type IN ('income','other_income') THEN l.functional_credit - l.functional_debit ELSE l.functional_credit - l.functional_debit END), 0)
  FROM accounting_journal_lines l
  JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id AND j.status = 'posted'
  JOIN accounting_accounts a ON a.organization_id = l.organization_id AND a.id = l.account_id
  WHERE l.organization_id = org AND j.entry_date BETWEEN s AND e
    AND a.account_type IN ('income','other_income','cost_of_sales','operating_expense','other_expense')
    AND coalesce(a.reporting_class, '') <> 'income_tax_expense';
$$;
--> statement-breakpoint
-- The computation, recomputed from its inputs: snapshots once submitted/approved, live while a draft.
CREATE OR REPLACE FUNCTION income_tax_figures(org text, cid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE c income_tax_computations; r tax_rule_versions; o tax_obligation_versions; profit numeric; inc numeric; dec numeric; adjusted numeric; limit_rate numeric;
  loss_used numeric := 0; chargeable numeric; rate numeric; tax numeric; credits numeric; paid numeric; pending numeric; problems text[] := ARRAY[]::text[]; unposted integer; blocked integer; cf numeric;
BEGIN
  SELECT * INTO c FROM income_tax_computations WHERE organization_id = org AND id = cid;
  IF NOT FOUND THEN RAISE EXCEPTION 'tax_computation_unavailable'; END IF;
  IF c.status IN ('approved','superseded') AND c.figures IS NOT NULL THEN RETURN c.figures; END IF;
  SELECT * INTO r FROM tax_rule_versions WHERE organization_id = org AND id = c.rule_version_id;
  SELECT * INTO o FROM tax_obligation_versions WHERE organization_id = org AND id = c.obligation_version_id;
  profit := CASE WHEN c.kind = 'provisional' THEN c.estimated_profit WHEN c.status = 'draft' THEN income_tax_accounting_profit(org, c.period_start, c.period_end) ELSE c.accounting_profit END;
  SELECT coalesce(sum(amount) FILTER (WHERE kind IN ('non_deductible','add_back','depreciation_addback','other_increase')), 0),
         coalesce(sum(amount) FILTER (WHERE kind IN ('deduction','exempt_income','capital_allowance','other_decrease')), 0)
    INTO inc, dec FROM income_tax_adjustments WHERE organization_id = org AND computation_id = cid;
  adjusted := coalesce(profit, 0) + inc - dec;
  limit_rate := CASE WHEN r.parameters->>'lossOffsetLimit' IS NULL THEN 1 ELSE (r.parameters->>'lossOffsetLimit')::numeric END;
  IF adjusted > 0 THEN loss_used := least(round(adjusted * limit_rate, 2), c.loss_brought_forward); END IF;
  chargeable := greatest(adjusted - loss_used, 0);
  cf := c.loss_brought_forward - loss_used + CASE WHEN adjusted < 0 THEN -adjusted ELSE 0 END;
  rate := (r.parameters->>'rate')::numeric;
  tax := round(chargeable * rate, 2);
  SELECT coalesce(sum(amount), 0) INTO credits FROM income_tax_credits WHERE organization_id = org AND computation_id = cid;
  SELECT coalesce(sum(p.amount) FILTER (WHERE ledger_journal_effective(org, l.journal_id)), 0), coalesce(sum(p.amount) FILTER (WHERE NOT ledger_journal_effective(org, l.journal_id) AND ledger_journal_live(org, l.journal_id)), 0)
    INTO paid, pending FROM tax_payments p JOIN ledger_source_links l ON l.organization_id = p.organization_id AND l.purpose = 'tax_payment' AND l.source_id = p.id
    WHERE p.organization_id = org AND p.obligation_code = c.obligation_code AND p.fiscal_year = c.fiscal_year AND p.kind IN ('provisional_instalment','final_balance');
  SELECT count(DISTINCT j.id) INTO unposted FROM accounting_journals j JOIN accounting_journal_lines l ON l.organization_id = j.organization_id AND l.journal_id = j.id
    JOIN accounting_accounts a ON a.organization_id = l.organization_id AND a.id = l.account_id
    WHERE j.organization_id = org AND j.status IN ('draft','submitted','approved') AND j.entry_date BETWEEN c.period_start AND c.period_end AND a.account_type IN ('income','other_income','cost_of_sales','operating_expense','other_expense');
  SELECT count(*) INTO blocked FROM accounting_integration_events WHERE organization_id = org AND status IN ('blocked','failed','pending') AND effective_date BETWEEN c.period_start AND c.period_end;
  IF r.status NOT IN ('approved','superseded') OR r.effective_from > c.period_end OR (r.effective_to IS NOT NULL AND r.effective_to < c.period_end) THEN problems := array_append(problems, 'tax_rule_not_in_force'); END IF;
  IF o.status <> 'approved' OR NOT o.processing_enabled THEN problems := array_append(problems, 'tax_obligation_not_operational'); END IF;
  IF profit IS NULL THEN problems := array_append(problems, 'accounting_profit_unavailable'); END IF;
  IF c.kind <> 'provisional' AND unposted > 0 THEN problems := array_append(problems, 'unposted_journals_in_period'); END IF;
  IF c.kind <> 'provisional' AND blocked > 0 THEN problems := array_append(problems, 'unposted_source_events_in_period'); END IF;
  RETURN jsonb_build_object('fiscalYear', c.fiscal_year, 'periodStart', c.period_start, 'periodEnd', c.period_end, 'kind', c.kind,
    'ruleCode', r.rule_code, 'ruleVersion', r.version, 'rate', r.parameters->>'rate', 'profitBasis', CASE WHEN c.kind = 'provisional' THEN 'estimate' ELSE 'posted_ledger' END,
    'accountingProfit', profit::text, 'increases', inc::text, 'decreases', dec::text, 'adjustedProfit', adjusted::text, 'lossBroughtForward', c.loss_brought_forward::text,
    'lossUsed', loss_used::text, 'lossCarriedForward', cf::text, 'chargeableIncome', chargeable::text, 'taxCharge', tax::text, 'credits', credits::text,
    'instalmentsPaid', paid::text, 'paymentsPending', pending::text, 'netPayable', (tax - credits - paid)::text, 'unpostedJournals', unposted, 'unpostedSourceEvents', blocked,
    'problems', to_jsonb(problems), 'ready', cardinality(problems) = 0);
END $$;
--> statement-breakpoint
-- p: {key, obligationCode, fiscalYear, kind, estimatedProfit, note, supersedesId}
CREATE OR REPLACE FUNCTION income_tax_computation_create(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); c income_tax_computations; o tax_obligation_versions; r tax_rule_versions; cid uuid;
  fy integer; s date; e date; k text := p->>'kind'; prev income_tax_computations;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO c FROM income_tax_computations WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF c.prepared_by_id <> staff OR c.kind IS DISTINCT FROM k THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', c.id, 'already', true);
  END IF;
  o := tax_obligation_operational(org, p->>'obligationCode');
  IF o.tax_type <> 'corporate_income_tax' THEN RAISE EXCEPTION 'tax_obligation_not_operational'; END IF;
  IF k IS NULL OR k NOT IN ('provisional','final','amended') THEN RAISE EXCEPTION 'invalid_tax_computation'; END IF;
  IF coalesce(p->>'fiscalYear', '') !~ '^\d{4}$' THEN RAISE EXCEPTION 'invalid_tax_computation'; END IF;
  fy := (p->>'fiscalYear')::integer;
  -- The year comes from the approved accounting periods, never from a calendar assumption.
  SELECT min(start_date), max(end_date) INTO s, e FROM accounting_periods WHERE organization_id = org AND fiscal_year = fy;
  IF s IS NULL THEN RAISE EXCEPTION 'tax_year_periods_missing'; END IF;
  r := tax_rule_at(org, o.calculation_rule_code, e);
  IF r.id IS NULL OR r.rule_kind <> 'income_tax_rate' THEN RAISE EXCEPTION 'tax_rule_not_in_force'; END IF;
  IF k = 'provisional' AND coalesce(p->>'estimatedProfit', '') !~ '^-?\d{1,15}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'tax_estimate_required'; END IF;
  IF k = 'amended' THEN
    SELECT * INTO prev FROM income_tax_computations WHERE organization_id = org AND obligation_code = o.code AND fiscal_year = fy AND kind IN ('final','amended') AND status = 'approved';
    IF prev.id IS NULL THEN RAISE EXCEPTION 'tax_amendment_without_final'; END IF;
  END IF;
  INSERT INTO income_tax_computations (organization_id, obligation_code, obligation_version_id, fiscal_year, period_start, period_end, kind, rule_version_id, estimated_profit, note, prepared_by_id, supersedes_id, idempotency_key)
  VALUES (org, o.code, o.id, fy, s, e, k, r.id, CASE WHEN k = 'provisional' THEN (p->>'estimatedProfit')::numeric END, nullif(trim(coalesce(p->>'note', '')), ''), staff, prev.id, key) RETURNING id INTO cid;
  PERFORM tax_event(org, 'income_tax_computation', cid::text, actor, staff, 'created', p->>'note', jsonb_build_object('fiscalYear', fy, 'kind', k, 'rule', r.rule_code || ' v' || r.version), key, correlation);
  RETURN jsonb_build_object('id', cid, 'already', false);
END $$;
--> statement-breakpoint
-- Replace a draft's schedules. p: {key, version, estimatedProfit, lossBroughtForward, lossEvidenceDocumentId, adjustments:[{kind,description,amount,evidenceDocumentId}], credits:[{kind,certificateReference,counterparty,amount,evidenceDocumentId}]}
CREATE OR REPLACE FUNCTION income_tax_computation_save(org text, actor text, cid uuid, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); c income_tax_computations; x jsonb; n integer := 0; loss numeric; lev uuid; key text := nullif(p->>'key', '');
BEGIN
  SELECT * INTO c FROM income_tax_computations WHERE organization_id = org AND id = cid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tax_computation_unavailable'; END IF;
  IF tax_replay(org, key, 'income_tax_computation', cid::text, 'updated') THEN RETURN jsonb_build_object('id', cid, 'already', true); END IF;
  IF c.status <> 'draft' THEN RAISE EXCEPTION 'tax_computation_locked'; END IF;
  IF c.prepared_by_id <> staff THEN RAISE EXCEPTION 'not_preparer'; END IF;
  IF c.version IS DISTINCT FROM (p->>'version')::integer THEN RAISE EXCEPTION 'stale_tax_computation'; END IF;
  loss := coalesce(nullif(p->>'lossBroughtForward', ''), '0')::numeric;
  IF loss < 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF loss > 0 THEN lev := tax_document_required(org, p->>'lossEvidenceDocumentId'); END IF;
  DELETE FROM income_tax_adjustments WHERE organization_id = org AND computation_id = cid AND source = 'manual';
  DELETE FROM income_tax_credits WHERE organization_id = org AND computation_id = cid;
  SELECT coalesce(max(line_number), 0) INTO n FROM income_tax_adjustments WHERE organization_id = org AND computation_id = cid;
  FOR x IN SELECT value FROM jsonb_array_elements(coalesce(p->'adjustments', '[]'::jsonb)) LOOP
    n := n + 1;
    IF coalesce(x->>'kind', '') IN ('depreciation_addback','capital_allowance') THEN RAISE EXCEPTION 'tax_schedule_line_reserved'; END IF;
    INSERT INTO income_tax_adjustments (organization_id, computation_id, line_number, kind, description, amount, evidence_document_id)
    VALUES (org, cid, n, x->>'kind', trim(coalesce(x->>'description', '')), banking_money(x->>'amount'),
      CASE WHEN nullif(x->>'evidenceDocumentId', '') IS NULL THEN NULL ELSE tax_document_required(org, x->>'evidenceDocumentId') END);
  END LOOP;
  n := 0;
  FOR x IN SELECT value FROM jsonb_array_elements(coalesce(p->'credits', '[]'::jsonb)) LOOP
    n := n + 1;
    INSERT INTO income_tax_credits (organization_id, computation_id, line_number, kind, certificate_reference, counterparty, amount, evidence_document_id)
    VALUES (org, cid, n, x->>'kind', trim(coalesce(x->>'certificateReference', '')), nullif(trim(coalesce(x->>'counterparty', '')), ''), banking_money(x->>'amount'), tax_document_required(org, x->>'evidenceDocumentId'));
  END LOOP;
  UPDATE income_tax_computations SET loss_brought_forward = loss, loss_evidence_document_id = lev,
    estimated_profit = CASE WHEN kind = 'provisional' THEN coalesce(nullif(p->>'estimatedProfit', '')::numeric, estimated_profit) ELSE NULL END,
    version = version + 1, updated_at = now() WHERE organization_id = org AND id = cid;
  PERFORM tax_event(org, 'income_tax_computation', cid::text, actor, staff, 'updated', NULL, jsonb_build_object('adjustments', p->'adjustments', 'credits', p->'credits', 'lossBroughtForward', loss::text), key, correlation);
  RETURN jsonb_build_object('id', cid, 'version', c.version + 1, 'already', false);
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation THEN RAISE EXCEPTION 'invalid_tax_schedule';
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION income_tax_computation_command(org text, actor text, cid uuid, cmd text, expected integer, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); c income_tax_computations; f jsonb; target text; clean text := nullif(trim(coalesce(note, '')), ''); profit numeric;
BEGIN
  IF cmd NOT IN ('submit','return','approve','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO c FROM income_tax_computations WHERE organization_id = org AND id = cid;
  IF NOT FOUND THEN RAISE EXCEPTION 'tax_computation_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':income_tax:' || c.obligation_code || ':' || c.fiscal_year, 0));
  IF tax_replay(org, key, 'income_tax_computation', cid::text, cmd) THEN RETURN jsonb_build_object('id', cid, 'already', true); END IF;
  SELECT * INTO c FROM income_tax_computations WHERE organization_id = org AND id = cid FOR UPDATE;
  IF c.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_tax_computation'; END IF;
  IF cmd = 'submit' THEN
    IF c.status <> 'draft' THEN RAISE EXCEPTION 'invalid_tax_transition'; END IF;
    IF c.prepared_by_id <> staff THEN RAISE EXCEPTION 'not_preparer'; END IF;
    f := income_tax_figures(org, cid);
    IF NOT (f->>'ready')::boolean THEN RAISE EXCEPTION '%', f->'problems'->>0; END IF;
    profit := CASE WHEN c.kind = 'provisional' THEN c.estimated_profit ELSE income_tax_accounting_profit(org, c.period_start, c.period_end) END;
    UPDATE income_tax_computations SET status = 'submitted', accounting_profit = profit, submitted_by_id = staff, submitted_at = now(), version = version + 1, updated_at = now() WHERE organization_id = org AND id = cid;
    target := 'submitted';
  ELSIF cmd = 'return' THEN
    IF c.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_tax_transition'; END IF;
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
    UPDATE income_tax_computations SET status = 'draft', accounting_profit = NULL, submitted_by_id = NULL, submitted_at = NULL, review_note = clean, version = version + 1, updated_at = now() WHERE organization_id = org AND id = cid;
    target := 'draft';
  ELSE
    IF c.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_tax_transition'; END IF;
    IF staff IN (c.prepared_by_id, c.submitted_by_id) THEN RAISE EXCEPTION 'tax_self_approval_denied'; END IF;
    IF cmd = 'reject' THEN
      IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
      UPDATE income_tax_computations SET status = 'rejected', review_note = clean, version = version + 1, updated_at = now() WHERE organization_id = org AND id = cid;
      target := 'rejected';
    ELSE
      -- The ledger may have moved since submission: the snapshot must still agree.
      IF c.kind <> 'provisional' AND income_tax_accounting_profit(org, c.period_start, c.period_end) IS DISTINCT FROM c.accounting_profit THEN RAISE EXCEPTION 'tax_profit_changed'; END IF;
      f := income_tax_figures(org, cid);
      IF NOT (f->>'ready')::boolean THEN RAISE EXCEPTION '%', f->'problems'->>0; END IF;
      UPDATE income_tax_computations SET status = 'superseded', updated_at = now() WHERE organization_id = org AND obligation_code = c.obligation_code AND fiscal_year = c.fiscal_year
        AND status = 'approved' AND (kind = 'provisional') = (c.kind = 'provisional');
      UPDATE income_tax_computations SET status = 'approved', figures = f, approved_by_id = staff, approved_at = now(), review_note = clean, version = version + 1, updated_at = now() WHERE organization_id = org AND id = cid;
      target := 'approved';
    END IF;
  END IF;
  PERFORM tax_event(org, 'income_tax_computation', cid::text, actor, staff, cmd, clean, jsonb_build_object('from', c.status, 'to', target, 'figures', f), key, correlation);
  RETURN jsonb_build_object('id', cid, 'status', target, 'figures', f, 'already', false);
END $$;
--> statement-breakpoint
-- The tax charge already in the ledger for an obligation and year (posted, not reversed, provisions).
CREATE OR REPLACE FUNCTION income_tax_provided(org text, code text, fy integer) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT coalesce(sum(l.amount), 0) FROM ledger_source_links l JOIN income_tax_computations c ON c.organization_id = l.organization_id AND c.id = l.source_id
  WHERE l.organization_id = org AND l.purpose = 'tax_provision' AND c.obligation_code = code AND c.fiscal_year = fy AND ledger_journal_effective(org, l.journal_id);
$$;
--> statement-breakpoint
-- Prepare the provision journal for the difference between the approved tax charge and what is already provided.
CREATE OR REPLACE FUNCTION income_tax_provision_prepare(org text, actor text, cid uuid, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); c income_tax_computations; o tax_obligation_versions; charge numeric; delta numeric; ed date; lid uuid; existing uuid;
BEGIN
  IF key IS NULL OR length(key) > 150 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO c FROM income_tax_computations WHERE organization_id = org AND id = cid;
  IF NOT FOUND THEN RAISE EXCEPTION 'tax_computation_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':income_tax:' || c.obligation_code || ':' || c.fiscal_year, 0));
  SELECT l.id INTO existing FROM ledger_source_links l JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id
    WHERE l.organization_id = org AND j.idempotency_key = 'phase2d:' || key;
  IF existing IS NOT NULL THEN RETURN jsonb_build_object('id', existing, 'already', true); END IF;
  IF c.status <> 'approved' OR c.kind = 'provisional' THEN RAISE EXCEPTION 'tax_provision_needs_approved_final'; END IF;
  o := tax_obligation_operational(org, c.obligation_code);
  IF EXISTS (SELECT 1 FROM ledger_source_links l JOIN income_tax_computations x ON x.organization_id = l.organization_id AND x.id = l.source_id
      WHERE l.organization_id = org AND l.purpose = 'tax_provision' AND x.obligation_code = c.obligation_code AND x.fiscal_year = c.fiscal_year
        AND ledger_journal_live(org, l.journal_id) AND NOT ledger_journal_effective(org, l.journal_id)) THEN RAISE EXCEPTION 'tax_provision_pending'; END IF;
  charge := (c.figures->>'taxCharge')::numeric;
  delta := charge - income_tax_provided(org, c.obligation_code, c.fiscal_year);
  IF delta = 0 THEN RAISE EXCEPTION 'tax_provision_up_to_date'; END IF;
  ed := CASE WHEN nullif(p->>'entryDate', '') IS NULL THEN c.period_end ELSE banking_date(p->>'entryDate') END;
  lid := ledger_link_prepare(org, actor, staff, 'tax_provision', c.id, ed, 'Income tax provision ' || c.fiscal_year || ' (' || c.kind || ')', 'CIT-' || c.fiscal_year,
    CASE WHEN delta > 0 THEN jsonb_build_array(
        jsonb_build_object('accountId', o.expense_account_id, 'debit', delta::text, 'currency', 'UGX', 'description', 'Current tax expense'),
        jsonb_build_object('accountId', o.liability_account_id, 'credit', delta::text, 'currency', 'UGX', 'description', 'Income tax payable'))
      ELSE jsonb_build_array(
        jsonb_build_object('accountId', o.liability_account_id, 'debit', (-delta)::text, 'currency', 'UGX', 'description', 'Income tax over-provided'),
        jsonb_build_object('accountId', o.expense_account_id, 'credit', (-delta)::text, 'currency', 'UGX', 'description', 'Current tax expense adjustment')) END,
    delta, key, correlation);
  RETURN jsonb_build_object('id', lid, 'amount', delta::text, 'already', false);
END $$;
--> statement-breakpoint

-- Filings: a record that a return WAS filed (with acknowledgement evidence). Absence means not filed.
CREATE TABLE tax_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  obligation_code text NOT NULL,
  obligation_version_id uuid NOT NULL,
  fiscal_year integer NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('provisional_return','final_return','amended_return','other_return')),
  computation_id uuid,
  filed_on date NOT NULL,
  filing_reference text NOT NULL CHECK (length(trim(filing_reference)) BETWEEN 1 AND 100),
  acknowledgement_reference text CHECK (acknowledgement_reference IS NULL OR length(acknowledgement_reference) <= 100),
  evidence_document_id uuid NOT NULL,
  recorded_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, obligation_version_id) REFERENCES tax_obligation_versions(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, computation_id) REFERENCES income_tax_computations(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, evidence_document_id) REFERENCES documents(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, recorded_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX tax_filings_once_uq ON tax_filings (organization_id, obligation_code, fiscal_year, period_start, kind) WHERE kind IN ('provisional_return','final_return');
--> statement-breakpoint
CREATE TRIGGER tax_filings_immutable BEFORE UPDATE OR DELETE ON tax_filings FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER tax_filings_no_truncate BEFORE TRUNCATE ON tax_filings FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- URA assessments: append-only; a correction is a new row that supersedes an earlier one.
CREATE TABLE tax_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  obligation_code text NOT NULL,
  fiscal_year integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('self_assessment','original','additional','amended','objection_decision','penalty','interest')),
  assessment_reference text NOT NULL CHECK (length(trim(assessment_reference)) BETWEEN 1 AND 100),
  reference_normalized text GENERATED ALWAYS AS (upper(regexp_replace(assessment_reference, '[^A-Za-z0-9]', '', 'g'))) STORED,
  assessed_on date NOT NULL,
  amount numeric(17,2) NOT NULL CHECK (amount >= 0),
  supersedes_id uuid,
  evidence_document_id uuid NOT NULL,
  note text CHECK (note IS NULL OR length(note) <= 2000),
  recorded_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (organization_id, reference_normalized),
  FOREIGN KEY (organization_id, supersedes_id) REFERENCES tax_assessments(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, evidence_document_id) REFERENCES documents(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, recorded_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (kind NOT IN ('amended','objection_decision') OR supersedes_id IS NOT NULL)
);
--> statement-breakpoint
CREATE TRIGGER tax_assessments_immutable BEFORE UPDATE OR DELETE ON tax_assessments FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER tax_assessments_no_truncate BEFORE TRUNCATE ON tax_assessments FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Payments: what was actually paid, identified by its URA payment registration number (PRN).
CREATE TABLE tax_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  obligation_code text NOT NULL,
  fiscal_year integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('provisional_instalment','final_balance','assessment','penalty','interest')),
  amount numeric(17,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('UGX','USD')),
  paid_on date NOT NULL,
  prn text NOT NULL CHECK (length(trim(prn)) BETWEEN 4 AND 40),
  prn_normalized text GENERATED ALWAYS AS (upper(regexp_replace(prn, '[^A-Za-z0-9]', '', 'g'))) STORED,
  banking_account_id uuid NOT NULL,
  evidence_document_id uuid NOT NULL,
  recorded_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, banking_account_id, currency) REFERENCES banking_accounts(organization_id, id, currency) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, evidence_document_id) REFERENCES documents(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, recorded_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX tax_payments_prn_idx ON tax_payments (organization_id, prn_normalized);
--> statement-breakpoint
CREATE TRIGGER tax_payments_immutable BEFORE UPDATE OR DELETE ON tax_payments FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER tax_payments_no_truncate BEFORE TRUNCATE ON tax_payments FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- p: {key, obligationCode, fiscalYear, kind, periodStart, periodEnd, computationId, filedOn, filingReference, acknowledgementReference, evidenceDocumentId}
CREATE OR REPLACE FUNCTION tax_filing_record(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); f tax_filings; o tax_obligation_versions; fid uuid; s date; e date; fy integer; comp uuid;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO f FROM tax_filings WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', f.id, 'already', true); END IF;
  o := tax_obligation_current(org, p->>'obligationCode');
  IF o.id IS NULL OR o.registration_status NOT IN ('registered','applicable') THEN RAISE EXCEPTION 'tax_obligation_not_registered'; END IF;
  IF coalesce(p->>'fiscalYear', '') !~ '^\d{4}$' THEN RAISE EXCEPTION 'invalid_tax_filing'; END IF;
  fy := (p->>'fiscalYear')::integer;
  IF o.period_basis = 'accounting_year' THEN
    SELECT min(start_date), max(end_date) INTO s, e FROM accounting_periods WHERE organization_id = org AND fiscal_year = fy;
    IF s IS NULL THEN RAISE EXCEPTION 'tax_year_periods_missing'; END IF;
  ELSE s := banking_date(p->>'periodStart'); e := (p->>'periodEnd')::date;
  END IF;
  IF nullif(p->>'computationId', '') IS NOT NULL THEN
    SELECT id INTO comp FROM income_tax_computations WHERE organization_id = org AND id = (p->>'computationId')::uuid AND obligation_code = o.code AND fiscal_year = fy AND status = 'approved';
    IF comp IS NULL THEN RAISE EXCEPTION 'tax_filing_needs_approved_computation'; END IF;
  END IF;
  BEGIN
    INSERT INTO tax_filings (organization_id, obligation_code, obligation_version_id, fiscal_year, period_start, period_end, kind, computation_id, filed_on, filing_reference, acknowledgement_reference, evidence_document_id, recorded_by_id, idempotency_key)
    VALUES (org, o.code, o.id, fy, s, e, p->>'kind', comp, banking_date(p->>'filedOn'), trim(coalesce(p->>'filingReference', '')), nullif(trim(coalesce(p->>'acknowledgementReference', '')), ''),
      tax_document_required(org, p->>'evidenceDocumentId'), staff, key) RETURNING id INTO fid;
  EXCEPTION
    WHEN unique_violation THEN RAISE EXCEPTION 'tax_filing_exists';
    WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'invalid_tax_filing';
  END;
  PERFORM tax_event(org, 'tax_filing', fid::text, actor, staff, 'recorded', NULL, jsonb_build_object('obligation', o.code, 'fiscalYear', fy, 'kind', p->>'kind', 'reference', p->>'filingReference'), key, correlation);
  RETURN jsonb_build_object('id', fid, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tax_assessment_record(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); a tax_assessments; o tax_obligation_versions; aid uuid; sup uuid;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO a FROM tax_assessments WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', a.id, 'already', true); END IF;
  o := tax_obligation_current(org, p->>'obligationCode');
  IF o.id IS NULL THEN RAISE EXCEPTION 'tax_obligation_unavailable'; END IF;
  IF nullif(p->>'supersedesId', '') IS NOT NULL THEN
    SELECT id INTO sup FROM tax_assessments WHERE organization_id = org AND id = (p->>'supersedesId')::uuid AND obligation_code = o.code AND fiscal_year = (p->>'fiscalYear')::integer;
    IF sup IS NULL THEN RAISE EXCEPTION 'tax_assessment_unavailable'; END IF;
  END IF;
  BEGIN
    INSERT INTO tax_assessments (organization_id, obligation_code, fiscal_year, kind, assessment_reference, assessed_on, amount, supersedes_id, evidence_document_id, note, recorded_by_id, idempotency_key)
    VALUES (org, o.code, (p->>'fiscalYear')::integer, p->>'kind', trim(coalesce(p->>'assessmentReference', '')), banking_date(p->>'assessedOn'), banking_money(p->>'amount'), sup,
      tax_document_required(org, p->>'evidenceDocumentId'), nullif(trim(coalesce(p->>'note', '')), ''), staff, key) RETURNING id INTO aid;
  EXCEPTION
    WHEN unique_violation THEN RAISE EXCEPTION 'tax_assessment_exists';
    WHEN check_violation OR not_null_violation OR invalid_text_representation THEN RAISE EXCEPTION 'invalid_tax_assessment';
  END;
  PERFORM tax_event(org, 'tax_assessment', aid::text, actor, staff, 'recorded', p->>'note', jsonb_build_object('obligation', o.code, 'fiscalYear', p->>'fiscalYear', 'kind', p->>'kind', 'amount', p->>'amount', 'supersedes', sup), key, correlation);
  RETURN jsonb_build_object('id', aid, 'already', false);
END $$;
--> statement-breakpoint
-- Record a payment and prepare its journal (Dr tax liability or prepayment, Cr the paying bank's ledger).
CREATE OR REPLACE FUNCTION tax_payment_record(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); t tax_payments; o tax_obligation_versions; b banking_accounts; tid uuid; amt numeric; d date; debit_acct uuid; lid uuid;
BEGIN
  IF key IS NULL OR length(key) > 150 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO t FROM tax_payments WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', t.id, 'already', true); END IF;
  o := tax_obligation_operational(org, p->>'obligationCode');
  b := banking_account_for_cash(org, p->>'bankingAccountId');
  amt := banking_money(p->>'amount'); d := banking_date(p->>'paidOn');
  IF amt <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF coalesce(p->>'fiscalYear', '') !~ '^\d{4}$' THEN RAISE EXCEPTION 'invalid_tax_payment'; END IF;
  -- One payment per PRN while it is live, even when two people record it at the same moment.
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':tax_prn', 0));
  IF EXISTS (SELECT 1 FROM tax_payments x JOIN ledger_source_links l ON l.organization_id = x.organization_id AND l.purpose = 'tax_payment' AND l.source_id = x.id
      WHERE x.organization_id = org AND x.prn_normalized = upper(regexp_replace(coalesce(p->>'prn', ''), '[^A-Za-z0-9]', '', 'g')) AND ledger_journal_live(org, l.journal_id)) THEN
    RAISE EXCEPTION 'duplicate_tax_payment';
  END IF;
  BEGIN
    INSERT INTO tax_payments (organization_id, obligation_code, fiscal_year, kind, amount, currency, paid_on, prn, banking_account_id, evidence_document_id, recorded_by_id, idempotency_key)
    VALUES (org, o.code, (p->>'fiscalYear')::integer, p->>'kind', amt, b.currency, d, trim(coalesce(p->>'prn', '')), b.id, tax_document_required(org, p->>'evidenceDocumentId'), staff, key) RETURNING id INTO tid;
  EXCEPTION WHEN check_violation OR not_null_violation OR foreign_key_violation THEN RAISE EXCEPTION 'invalid_tax_payment';
  END;
  debit_acct := CASE WHEN p->>'kind' = 'provisional_instalment' AND o.prepayment_account_id IS NOT NULL THEN o.prepayment_account_id ELSE o.liability_account_id END;
  lid := ledger_link_prepare(org, actor, staff, 'tax_payment', tid, d, 'Tax payment ' || o.name || ' ' || (p->>'fiscalYear') || ' (' || (p->>'kind') || ')', 'PRN ' || trim(p->>'prn'),
    jsonb_build_array(
      jsonb_build_object('accountId', debit_acct, 'debit', amt::text, 'currency', b.currency, 'description', 'Tax paid, PRN ' || trim(p->>'prn')),
      jsonb_build_object('accountId', banking_ledger(org, b.id), 'credit', amt::text, 'currency', b.currency, 'description', 'Tax paid, PRN ' || trim(p->>'prn'))),
    amt, key, correlation);
  PERFORM tax_event(org, 'tax_payment', tid::text, actor, staff, 'recorded', NULL, jsonb_build_object('obligation', o.code, 'fiscalYear', p->>'fiscalYear', 'kind', p->>'kind', 'amount', amt::text, 'prn', p->>'prn', 'linkId', lid), key, correlation);
  RETURN jsonb_build_object('id', tid, 'linkId', lid, 'already', false);
END $$;
--> statement-breakpoint
-- The year's position. Unknown is never shown as zero: liability is "not determined" until a final
-- computation is approved or URA has assessed.
CREATE OR REPLACE FUNCTION income_tax_position(org text, code text, fy integer) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE est jsonb; fin jsonb; base_id uuid; assessed numeric; extras numeric; paid numeric; pending numeric; credits numeric; provided numeric; liability numeric; basis text; filed jsonb;
BEGIN
  SELECT figures INTO est FROM income_tax_computations WHERE organization_id = org AND obligation_code = code AND fiscal_year = fy AND kind = 'provisional' AND status = 'approved';
  SELECT figures INTO fin FROM income_tax_computations WHERE organization_id = org AND obligation_code = code AND fiscal_year = fy AND kind IN ('final','amended') AND status = 'approved';
  -- Latest base assessment that has not been superseded, plus later additions.
  SELECT a.id, a.amount INTO base_id, assessed FROM tax_assessments a WHERE a.organization_id = org AND a.obligation_code = code AND a.fiscal_year = fy
    AND a.kind IN ('self_assessment','original','amended','objection_decision') AND NOT EXISTS (SELECT 1 FROM tax_assessments s WHERE s.organization_id = org AND s.supersedes_id = a.id)
    ORDER BY a.assessed_on DESC, a.created_at DESC LIMIT 1;
  SELECT coalesce(sum(amount), 0) INTO extras FROM tax_assessments WHERE organization_id = org AND obligation_code = code AND fiscal_year = fy AND kind IN ('additional','penalty','interest')
    AND NOT EXISTS (SELECT 1 FROM tax_assessments s WHERE s.organization_id = org AND s.supersedes_id = tax_assessments.id);
  SELECT coalesce(sum(p.amount) FILTER (WHERE ledger_journal_effective(org, l.journal_id)), 0), coalesce(sum(p.amount) FILTER (WHERE ledger_journal_live(org, l.journal_id) AND NOT ledger_journal_effective(org, l.journal_id)), 0)
    INTO paid, pending FROM tax_payments p JOIN ledger_source_links l ON l.organization_id = p.organization_id AND l.purpose = 'tax_payment' AND l.source_id = p.id
    WHERE p.organization_id = org AND p.obligation_code = code AND p.fiscal_year = fy;
  credits := coalesce((fin->>'credits')::numeric, 0);
  provided := income_tax_provided(org, code, fy);
  IF base_id IS NOT NULL THEN liability := assessed + extras; basis := 'assessment';
  ELSIF fin IS NOT NULL THEN liability := (fin->>'taxCharge')::numeric + extras; basis := 'approved_computation';
  ELSE liability := NULL; basis := 'not_determined';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'filedOn', filed_on, 'reference', filing_reference, 'acknowledgement', acknowledgement_reference) ORDER BY filed_on), '[]'::jsonb) INTO filed
    FROM tax_filings WHERE organization_id = org AND obligation_code = code AND fiscal_year = fy;
  RETURN jsonb_build_object('fiscalYear', fy, 'estimate', est->>'taxCharge', 'computedTax', fin->>'taxCharge', 'assessed', CASE WHEN base_id IS NULL THEN NULL ELSE (assessed + extras)::text END,
    'liability', liability::text, 'basis', basis, 'credits', credits::text, 'provided', provided::text, 'paid', paid::text, 'paymentsPending', pending::text,
    'outstanding', CASE WHEN liability IS NULL THEN NULL ELSE greatest(liability - credits - paid, 0)::numeric(17,2)::text END,
    'overpaid', CASE WHEN liability IS NULL THEN NULL ELSE greatest(paid + credits - liability, 0)::numeric(17,2)::text END, 'filings', filed);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Fixed assets. Categories are approved accounting policies (useful life, residual value,
-- convention, accounts). Every financial effect is a manual journal approved by a second person.
-- Accounting depreciation is separate from tax capital allowances (computed only for income tax).
-- ---------------------------------------------------------------------------------------------

CREATE TABLE asset_category_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$'),
  version integer NOT NULL CHECK (version > 0),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  useful_life_months integer NOT NULL CHECK (useful_life_months BETWEEN 1 AND 1200),
  residual_percent numeric(9,6) NOT NULL CHECK (residual_percent >= 0 AND residual_percent < 1),
  depreciation_method text NOT NULL CHECK (depreciation_method IN ('straight_line')),
  period_convention text NOT NULL CHECK (period_convention IN ('daily_proration','full_month_from_capitalization','next_month_after_capitalization')),
  capitalization_threshold numeric(17,2) NOT NULL CHECK (capitalization_threshold >= 0),
  cost_account_id uuid NOT NULL,
  accumulated_account_id uuid NOT NULL,
  expense_account_id uuid NOT NULL,
  impairment_account_id uuid NOT NULL,
  gain_account_id uuid NOT NULL,
  loss_account_id uuid NOT NULL,
  tax_allowance_rule_code text,
  policy_basis text NOT NULL CHECK (length(trim(policy_basis)) BETWEEN 5 AND 1000),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','superseded')),
  proposed_by_id uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code, version),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, cost_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, accumulated_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, expense_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, impairment_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, gain_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, loss_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, proposed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'proposed') = (decided_by_id IS NULL)),
  CHECK (decided_by_id IS NULL OR decided_by_id <> proposed_by_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX asset_category_one_approved_uq ON asset_category_versions (organization_id, code) WHERE status = 'approved';
--> statement-breakpoint
CREATE TRIGGER asset_category_versions_no_truncate BEFORE TRUNCATE ON asset_category_versions FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION asset_account_ok(org text, aid uuid, types text[], contra boolean) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM accounting_accounts WHERE organization_id = org AND id = aid AND is_postable AND manual_posting_allowed AND account_type = ANY (types) AND is_contra = contra);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION asset_category_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'asset_history_immutable'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','decision_note']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','decision_note'])
       OR NOT ((OLD.status = 'proposed' AND NEW.status IN ('approved','rejected')) OR (OLD.status = 'approved' AND NEW.status = 'superseded')) THEN
      RAISE EXCEPTION 'asset_history_immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status <> 'proposed' THEN RAISE EXCEPTION 'asset_history_immutable'; END IF;
  IF NOT asset_account_ok(NEW.organization_id, NEW.cost_account_id, ARRAY['asset'], false) OR NOT asset_account_ok(NEW.organization_id, NEW.accumulated_account_id, ARRAY['asset'], true)
     OR NOT asset_account_ok(NEW.organization_id, NEW.expense_account_id, ARRAY['operating_expense','cost_of_sales','other_expense'], false)
     OR NOT asset_account_ok(NEW.organization_id, NEW.impairment_account_id, ARRAY['operating_expense','other_expense'], false)
     OR NOT asset_account_ok(NEW.organization_id, NEW.gain_account_id, ARRAY['other_income'], false)
     OR NOT asset_account_ok(NEW.organization_id, NEW.loss_account_id, ARRAY['other_expense','operating_expense'], false) THEN
    RAISE EXCEPTION 'asset_category_account_invalid';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER asset_category_guard BEFORE INSERT OR UPDATE OR DELETE ON asset_category_versions FOR EACH ROW EXECUTE FUNCTION asset_category_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION asset_category_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); c asset_category_versions; cid uuid; v integer; a jsonb := coalesce(p->'accounts', '{}'::jsonb);
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO c FROM asset_category_versions WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF c.code IS DISTINCT FROM upper(p->>'code') OR c.proposed_by_id <> staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', c.id, 'version', c.version, 'already', true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':asset_category:' || upper(coalesce(p->>'code', '')), 0));
  IF EXISTS (SELECT 1 FROM asset_category_versions WHERE organization_id = org AND code = upper(p->>'code') AND status = 'proposed') THEN RAISE EXCEPTION 'asset_category_pending'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v FROM asset_category_versions WHERE organization_id = org AND code = upper(p->>'code');
  BEGIN
    INSERT INTO asset_category_versions (organization_id, code, version, name, useful_life_months, residual_percent, depreciation_method, period_convention, capitalization_threshold,
      cost_account_id, accumulated_account_id, expense_account_id, impairment_account_id, gain_account_id, loss_account_id, tax_allowance_rule_code, policy_basis, proposed_by_id, idempotency_key)
    VALUES (org, upper(p->>'code'), v, trim(coalesce(p->>'name', '')), (p->>'usefulLifeMonths')::integer, tax_rate_value(coalesce(p->>'residualPercent', '0')), 'straight_line', p->>'periodConvention',
      banking_money(coalesce(p->>'capitalizationThreshold', '0')), (a->>'cost')::uuid, (a->>'accumulated')::uuid, (a->>'expense')::uuid, (a->>'impairment')::uuid, (a->>'gain')::uuid, (a->>'loss')::uuid,
      nullif(p->>'taxAllowanceRuleCode', ''), trim(coalesce(p->>'policyBasis', '')), staff, key) RETURNING id INTO cid;
  EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR foreign_key_violation THEN RAISE EXCEPTION 'invalid_asset_category';
  END;
  PERFORM tax_event(org, 'asset_category', cid::text, actor, staff, 'proposed', p->>'policyBasis', p - 'key', key, correlation);
  RETURN jsonb_build_object('id', cid, 'version', v, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION asset_category_decide(org text, actor text, cid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
#variable_conflict use_variable
DECLARE staff uuid := finance_staff(org, actor); c asset_category_versions; target text; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO c FROM asset_category_versions WHERE organization_id = org AND id = cid;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset_category_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':asset_category:' || c.code, 0));
  IF tax_replay(org, key, 'asset_category', cid::text, decision) THEN RETURN jsonb_build_object('id', cid, 'already', true); END IF;
  SELECT * INTO c FROM asset_category_versions WHERE organization_id = org AND id = cid FOR UPDATE;
  IF c.status <> 'proposed' THEN RAISE EXCEPTION 'asset_category_unavailable'; END IF;
  IF c.proposed_by_id = staff THEN RAISE EXCEPTION 'asset_self_approval_denied'; END IF;
  IF decision = 'reject' AND length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
  IF decision = 'approve' THEN UPDATE asset_category_versions SET status = 'superseded' WHERE organization_id = org AND code = c.code AND status = 'approved'; END IF;
  target := CASE WHEN decision = 'approve' THEN 'approved' ELSE 'rejected' END;
  UPDATE asset_category_versions SET status = target, decided_by_id = staff, decided_at = now(), decision_note = clean WHERE organization_id = org AND id = cid;
  PERFORM tax_event(org, 'asset_category', cid::text, actor, staff, decision, clean, jsonb_build_object('code', c.code, 'version', c.version, 'status', target), key, correlation);
  RETURN jsonb_build_object('id', cid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint
CREATE TABLE asset_counters (
  organization_id text PRIMARY KEY REFERENCES organizations(id),
  next_value integer NOT NULL CHECK (next_value > 0)
);
--> statement-breakpoint
CREATE TABLE fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  asset_number text NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  ownership text NOT NULL CHECK (ownership IN ('owned','hired')),
  category_version_id uuid,
  acquisition_date date NOT NULL,
  capitalization_date date,
  depreciation_start_date date,
  cost numeric(17,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  currency text NOT NULL CHECK (currency IN ('UGX','USD')),
  residual_value numeric(17,2) NOT NULL DEFAULT 0 CHECK (residual_value >= 0),
  useful_life_months integer CHECK (useful_life_months IS NULL OR useful_life_months BETWEEN 1 AND 1200),
  period_convention text CHECK (period_convention IS NULL OR period_convention IN ('daily_proration','full_month_from_capitalization','next_month_after_capitalization')),
  capitalization_source text CHECK (capitalization_source IS NULL OR capitalization_source IN ('expense_reclass','direct_credit','opening_balance')),
  credit_account_id uuid,
  opening_accumulated_depreciation numeric(17,2) NOT NULL DEFAULT 0 CHECK (opening_accumulated_depreciation >= 0),
  supplier_id uuid,
  expense_id uuid,
  source_document_id uuid,
  hire_reference text CHECK (hire_reference IS NULL OR length(hire_reference) <= 100),
  division text CHECK (division IS NULL OR division IN ('estates','architecture','painting','interiors','tech')),
  project_id uuid,
  custodian_id uuid,
  location text CHECK (location IS NULL OR length(location) <= 200),
  serial_number text CHECK (serial_number IS NULL OR length(serial_number) <= 100),
  tax_allowance_rule_code text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, asset_number),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, category_version_id) REFERENCES asset_category_versions(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, credit_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, supplier_id) REFERENCES suppliers(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, expense_id) REFERENCES expenses(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_document_id) REFERENCES documents(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, custodian_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  -- Hired equipment is registered for custody only: never capitalized or depreciated.
  CHECK (ownership = 'owned' OR (category_version_id IS NULL AND cost = 0 AND capitalization_source IS NULL AND capitalization_date IS NULL)),
  CHECK (ownership = 'hired' OR (category_version_id IS NOT NULL AND cost > 0 AND useful_life_months IS NOT NULL AND period_convention IS NOT NULL
    AND capitalization_source IS NOT NULL AND capitalization_date IS NOT NULL AND depreciation_start_date IS NOT NULL)),
  CHECK (ownership = 'hired' OR residual_value < cost),
  CHECK (capitalization_date IS NULL OR capitalization_date >= acquisition_date),
  CHECK (depreciation_start_date IS NULL OR depreciation_start_date >= capitalization_date),
  CHECK (capitalization_source IS DISTINCT FROM 'expense_reclass' OR expense_id IS NOT NULL),
  CHECK (capitalization_source IS NULL OR capitalization_source = 'opening_balance' OR credit_account_id IS NOT NULL),
  CHECK (capitalization_source IS NOT DISTINCT FROM 'opening_balance' OR opening_accumulated_depreciation = 0),
  CHECK (opening_accumulated_depreciation <= cost - residual_value OR ownership = 'hired')
);
--> statement-breakpoint
CREATE INDEX fixed_assets_expense_idx ON fixed_assets (organization_id, expense_id) WHERE expense_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER fixed_assets_no_truncate BEFORE TRUNCATE ON fixed_assets FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Capitalization state: the latest capitalization journal for the asset.
CREATE OR REPLACE FUNCTION fixed_asset_capitalized(org text, aid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM ledger_source_links WHERE organization_id = org AND purpose = 'asset_capitalization' AND source_id = aid AND ledger_journal_effective(org, journal_id));
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fixed_asset_capitalization_live(org text, aid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM ledger_source_links WHERE organization_id = org AND purpose = 'asset_capitalization' AND source_id = aid AND ledger_journal_live(org, journal_id));
$$;
--> statement-breakpoint
-- Financial fields lock once a capitalization journal is live; custody fields change only by transfer.
CREATE OR REPLACE FUNCTION fixed_asset_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'asset_history_immutable'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.asset_number, NEW.ownership, NEW.created_by_id, NEW.created_at, NEW.idempotency_key) IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.asset_number, OLD.ownership, OLD.created_by_id, OLD.created_at, OLD.idempotency_key) THEN RAISE EXCEPTION 'asset_history_immutable'; END IF;
  IF fixed_asset_capitalization_live(OLD.organization_id, OLD.id) AND
     (to_jsonb(NEW) - ARRAY['division','project_id','custodian_id','location','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['division','project_id','custodian_id','location','version','updated_at']) THEN
    RAISE EXCEPTION 'asset_capitalized_locked';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER fixed_asset_guard BEFORE UPDATE OR DELETE ON fixed_assets FOR EACH ROW EXECUTE FUNCTION fixed_asset_guard();
--> statement-breakpoint
-- p: {key, id?, version?, name, ownership, categoryCode, acquisitionDate, capitalizationDate, depreciationStartDate, cost, currency, residualValue, usefulLifeMonths,
--     capitalizationSource, creditAccountId, openingAccumulatedDepreciation, supplierId, expenseId, sourceDocumentId, hireReference, division, projectId, custodianId, location, serialNumber, taxAllowanceRuleCode}
CREATE OR REPLACE FUNCTION fixed_asset_save(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); a fixed_assets; cat asset_category_versions; aid uuid; num text; n integer; owned boolean := p->>'ownership' = 'owned';
  v_cost numeric; v_residual numeric; v_life integer; exp expenses; used numeric;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF coalesce(p->>'ownership', '') NOT IN ('owned','hired') THEN RAISE EXCEPTION 'invalid_fixed_asset'; END IF;
  IF owned THEN
    SELECT * INTO cat FROM asset_category_versions WHERE organization_id = org AND code = upper(coalesce(p->>'categoryCode', '')) AND status = 'approved';
    IF cat.id IS NULL THEN RAISE EXCEPTION 'asset_category_not_approved'; END IF;
    v_cost := banking_money(p->>'cost');
    -- Residual value and useful life default to the approved category policy; overrides are recorded.
    v_life := coalesce(nullif(p->>'usefulLifeMonths', '')::integer, cat.useful_life_months);
    v_residual := coalesce(nullif(p->>'residualValue', '')::numeric, round(v_cost * cat.residual_percent, 2));
    IF v_cost < cat.capitalization_threshold THEN RAISE EXCEPTION 'asset_below_capitalization_threshold'; END IF;
    IF nullif(p->>'expenseId', '') IS NOT NULL THEN
      -- Never duplicate a supplier invoice: assets linked to an expense cannot exceed its net amount.
      SELECT * INTO exp FROM expenses WHERE organization_id = org AND id = (p->>'expenseId')::uuid AND status IN ('approved','paid');
      IF exp.id IS NULL THEN RAISE EXCEPTION 'asset_expense_unavailable'; END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(org || ':asset_expense:' || exp.id, 0));
      SELECT coalesce(sum(f.cost), 0) INTO used FROM fixed_assets f WHERE f.organization_id = org AND f.expense_id = exp.id AND f.id IS DISTINCT FROM nullif(p->>'id', '')::uuid;
      IF used + v_cost > exp.net_amount THEN RAISE EXCEPTION 'asset_exceeds_expense'; END IF;
      IF exp.currency <> p->>'currency' THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
    END IF;
  END IF;
  IF nullif(p->>'id', '') IS NULL THEN
    SELECT * INTO a FROM fixed_assets WHERE organization_id = org AND idempotency_key = key;
    IF FOUND THEN RETURN jsonb_build_object('id', a.id, 'assetNumber', a.asset_number, 'already', true); END IF;
    INSERT INTO asset_counters (organization_id, next_value) VALUES (org, 2) ON CONFLICT (organization_id) DO UPDATE SET next_value = asset_counters.next_value + 1 RETURNING next_value - 1 INTO n;
    num := 'FA-' || lpad(n::text, 5, '0');
  ELSE
    SELECT * INTO a FROM fixed_assets WHERE organization_id = org AND id = (p->>'id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'asset_unavailable'; END IF;
    IF tax_replay(org, key, 'fixed_asset', a.id::text, 'updated') THEN RETURN jsonb_build_object('id', a.id, 'already', true); END IF;
    IF a.version IS DISTINCT FROM (p->>'version')::integer THEN RAISE EXCEPTION 'stale_asset'; END IF;
    IF a.ownership <> p->>'ownership' THEN RAISE EXCEPTION 'asset_history_immutable'; END IF;
  END IF;
  BEGIN
    IF a.id IS NULL THEN
      INSERT INTO fixed_assets (organization_id, asset_number, name, ownership, category_version_id, acquisition_date, capitalization_date, depreciation_start_date, cost, currency, residual_value,
        useful_life_months, period_convention, capitalization_source, credit_account_id, opening_accumulated_depreciation, supplier_id, expense_id, source_document_id, hire_reference,
        division, project_id, custodian_id, location, serial_number, tax_allowance_rule_code, created_by_id, idempotency_key)
      VALUES (org, num, trim(coalesce(p->>'name', '')), p->>'ownership', cat.id, banking_date(p->>'acquisitionDate'), CASE WHEN owned THEN banking_date(p->>'capitalizationDate') END,
        CASE WHEN owned THEN banking_date(coalesce(nullif(p->>'depreciationStartDate', ''), p->>'capitalizationDate')) END, coalesce(v_cost, 0), coalesce(nullif(p->>'currency', ''), 'UGX'),
        coalesce(v_residual, 0), v_life, CASE WHEN owned THEN cat.period_convention END, CASE WHEN owned THEN p->>'capitalizationSource' END, nullif(p->>'creditAccountId', '')::uuid,
        coalesce(nullif(p->>'openingAccumulatedDepreciation', '')::numeric, 0), nullif(p->>'supplierId', '')::uuid, nullif(p->>'expenseId', '')::uuid, nullif(p->>'sourceDocumentId', '')::uuid,
        nullif(trim(coalesce(p->>'hireReference', '')), ''), nullif(p->>'division', ''), nullif(p->>'projectId', '')::uuid, nullif(p->>'custodianId', '')::uuid,
        nullif(trim(coalesce(p->>'location', '')), ''), nullif(trim(coalesce(p->>'serialNumber', '')), ''), CASE WHEN owned THEN coalesce(nullif(p->>'taxAllowanceRuleCode', ''), cat.tax_allowance_rule_code) END, staff, key)
      RETURNING id INTO aid;
    ELSE
      UPDATE fixed_assets SET name = trim(coalesce(p->>'name', '')), category_version_id = cat.id, acquisition_date = banking_date(p->>'acquisitionDate'),
        capitalization_date = CASE WHEN owned THEN banking_date(p->>'capitalizationDate') END,
        depreciation_start_date = CASE WHEN owned THEN banking_date(coalesce(nullif(p->>'depreciationStartDate', ''), p->>'capitalizationDate')) END,
        cost = coalesce(v_cost, 0), currency = coalesce(nullif(p->>'currency', ''), 'UGX'), residual_value = coalesce(v_residual, 0), useful_life_months = v_life,
        period_convention = CASE WHEN owned THEN cat.period_convention END, capitalization_source = CASE WHEN owned THEN p->>'capitalizationSource' END,
        credit_account_id = nullif(p->>'creditAccountId', '')::uuid, opening_accumulated_depreciation = coalesce(nullif(p->>'openingAccumulatedDepreciation', '')::numeric, 0),
        supplier_id = nullif(p->>'supplierId', '')::uuid, expense_id = nullif(p->>'expenseId', '')::uuid, source_document_id = nullif(p->>'sourceDocumentId', '')::uuid,
        hire_reference = nullif(trim(coalesce(p->>'hireReference', '')), ''), serial_number = nullif(trim(coalesce(p->>'serialNumber', '')), ''),
        tax_allowance_rule_code = CASE WHEN owned THEN coalesce(nullif(p->>'taxAllowanceRuleCode', ''), cat.tax_allowance_rule_code) END, version = version + 1, updated_at = now()
      WHERE organization_id = org AND id = a.id;
      aid := a.id;
    END IF;
  EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR foreign_key_violation THEN RAISE EXCEPTION 'invalid_fixed_asset';
  END;
  PERFORM tax_event(org, 'fixed_asset', aid::text, actor, staff, CASE WHEN a.id IS NULL THEN 'registered' ELSE 'updated' END, NULL, p - 'key', key, correlation);
  RETURN jsonb_build_object('id', aid, 'assetNumber', coalesce(num, a.asset_number), 'already', false);
END $$;
--> statement-breakpoint
-- Accumulated depreciation and impairment in the ledger (effective journals) plus opening balance.
CREATE OR REPLACE FUNCTION fixed_asset_accumulated(org text, aid uuid) RETURNS numeric LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN (SELECT f.opening_accumulated_depreciation
    + coalesce((SELECT sum(d.amount) FROM asset_depreciation_lines d JOIN ledger_source_links l ON l.organization_id = d.organization_id AND l.purpose = 'asset_depreciation' AND l.source_id = d.run_id
        WHERE d.organization_id = org AND d.asset_id = aid AND ledger_journal_effective(org, l.journal_id)), 0)
    + coalesce((SELECT sum(i.amount) FROM asset_impairments i JOIN ledger_source_links l ON l.organization_id = i.organization_id AND l.purpose = 'asset_impairment' AND l.source_id = i.id
        WHERE i.organization_id = org AND i.asset_id = aid AND ledger_journal_effective(org, l.journal_id)), 0)
  FROM fixed_assets f WHERE f.organization_id = org AND f.id = aid);
END $$;
--> statement-breakpoint
-- Last date covered by effective depreciation (or the day before depreciation starts).
CREATE OR REPLACE FUNCTION fixed_asset_depreciated_through(org text, aid uuid) RETURNS date LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN (SELECT greatest(f.depreciation_start_date - 1, coalesce((SELECT max(r.period_end) FROM asset_depreciation_lines d JOIN asset_depreciation_runs r ON r.organization_id = d.organization_id AND r.id = d.run_id
      JOIN ledger_source_links l ON l.organization_id = r.organization_id AND l.purpose = 'asset_depreciation' AND l.source_id = r.id
      WHERE d.organization_id = org AND d.asset_id = aid AND ledger_journal_effective(org, l.journal_id)), f.depreciation_start_date - 1))
  FROM fixed_assets f WHERE f.organization_id = org AND f.id = aid);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fixed_asset_disposed(org text, aid uuid) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM asset_disposals x JOIN ledger_source_links l ON l.organization_id = x.organization_id AND l.purpose = 'asset_disposal' AND l.source_id = x.id
    WHERE x.organization_id = org AND x.asset_id = aid AND ledger_journal_live(org, l.journal_id));
END $$;
--> statement-breakpoint
-- Straight-line depreciation for one asset over [s, e], under its convention, capped at what remains.
-- monthly = (cost - residual) / useful life. Fractions are per calendar month; amounts round to cents.
CREATE OR REPLACE FUNCTION fixed_asset_depreciation_for(org text, aid uuid, s date, e date) RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE f fixed_assets; monthly numeric; remaining numeric; m date; ms date; me date; os date; oe date; frac numeric := 0; first_month date; amt numeric;
BEGIN
  SELECT * INTO f FROM fixed_assets WHERE organization_id = org AND id = aid;
  IF f.ownership <> 'owned' OR e < f.depreciation_start_date THEN RETURN 0; END IF;
  remaining := f.cost - f.residual_value - fixed_asset_accumulated(org, aid);
  IF remaining <= 0 THEN RETURN 0; END IF;
  monthly := (f.cost - f.residual_value) / f.useful_life_months;
  first_month := date_trunc('month', f.depreciation_start_date)::date;
  m := date_trunc('month', s)::date;
  WHILE m <= e LOOP
    ms := m; me := (m + interval '1 month' - interval '1 day')::date;
    -- Month-based conventions count an eligible month in full, even when the window starts at the
    -- depreciation start date inside that month; only daily proration counts days.
    os := CASE WHEN f.period_convention <> 'daily_proration' AND s <= f.depreciation_start_date THEN ms ELSE greatest(ms, s) END;
    oe := least(me, e);
    IF f.period_convention = 'daily_proration' THEN
      os := greatest(os, f.depreciation_start_date);
      IF oe >= os THEN frac := frac + (oe - os + 1)::numeric / (me - ms + 1); END IF;
    ELSIF f.period_convention = 'full_month_from_capitalization' THEN
      IF ms >= first_month AND oe >= os THEN frac := frac + (oe - os + 1)::numeric / (me - ms + 1); END IF;
    ELSE
      IF ms > first_month AND oe >= os THEN frac := frac + (oe - os + 1)::numeric / (me - ms + 1); END IF;
    END IF;
    m := (m + interval '1 month')::date;
  END LOOP;
  amt := round(monthly * frac, 2);
  RETURN least(amt, remaining);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fixed_asset_capitalize(org text, actor text, aid uuid, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); f fixed_assets; c asset_category_versions; lines jsonb; lid uuid; existing uuid; credit uuid;
BEGIN
  IF key IS NULL OR length(key) > 150 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO f FROM fixed_assets WHERE organization_id = org AND id = aid;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':ledger_link:asset_capitalization:' || aid, 0));
  SELECT l.id INTO existing FROM ledger_source_links l JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id WHERE l.organization_id = org AND j.idempotency_key = 'phase2d:' || key;
  IF existing IS NOT NULL THEN RETURN jsonb_build_object('id', existing, 'already', true); END IF;
  IF f.ownership <> 'owned' THEN RAISE EXCEPTION 'hired_asset_not_capitalized'; END IF;
  IF fixed_asset_capitalization_live(org, aid) THEN RAISE EXCEPTION 'asset_already_capitalized'; END IF;
  SELECT * INTO c FROM asset_category_versions WHERE organization_id = org AND id = f.category_version_id;
  IF c.status NOT IN ('approved','superseded') THEN RAISE EXCEPTION 'asset_category_not_approved'; END IF;
  credit := CASE WHEN f.capitalization_source = 'opening_balance' THEN (SELECT id FROM accounting_accounts WHERE organization_id = org AND code = '3900') ELSE f.credit_account_id END;
  IF credit IS NULL THEN RAISE EXCEPTION 'asset_credit_account_required'; END IF;
  lines := jsonb_build_array(jsonb_build_object('accountId', c.cost_account_id, 'debit', f.cost::text, 'currency', f.currency, 'description', f.asset_number || ' ' || f.name, 'division', f.division, 'projectId', f.project_id));
  IF f.opening_accumulated_depreciation > 0 THEN
    lines := lines || jsonb_build_array(jsonb_build_object('accountId', c.accumulated_account_id, 'credit', f.opening_accumulated_depreciation::text, 'currency', f.currency, 'description', 'Opening accumulated depreciation'),
      jsonb_build_object('accountId', credit, 'credit', (f.cost - f.opening_accumulated_depreciation)::text, 'currency', f.currency, 'description', 'Opening net book value'));
  ELSE
    lines := lines || jsonb_build_array(jsonb_build_object('accountId', credit, 'credit', f.cost::text, 'currency', f.currency,
      'description', CASE f.capitalization_source WHEN 'expense_reclass' THEN 'Reclassified from expense' WHEN 'opening_balance' THEN 'Opening balance' ELSE 'Capitalized' END));
  END IF;
  lid := ledger_link_prepare(org, actor, staff, 'asset_capitalization', aid, f.capitalization_date, 'Capitalize ' || f.asset_number || ' ' || f.name, f.asset_number, lines, f.cost, key, correlation);
  RETURN jsonb_build_object('id', lid, 'already', false);
END $$;
--> statement-breakpoint
CREATE TABLE asset_depreciation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  period_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total numeric(17,2) NOT NULL CHECK (total > 0),
  prepared_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, period_id) REFERENCES accounting_periods(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE asset_depreciation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  run_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  amount numeric(17,2) NOT NULL CHECK (amount > 0),
  accumulated_before numeric(17,2) NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, run_id, asset_id),
  FOREIGN KEY (organization_id, run_id) REFERENCES asset_depreciation_runs(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, asset_id) REFERENCES fixed_assets(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TRIGGER asset_depreciation_runs_immutable BEFORE UPDATE OR DELETE ON asset_depreciation_runs FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER asset_depreciation_lines_immutable BEFORE UPDATE OR DELETE ON asset_depreciation_lines FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER asset_depreciation_runs_no_truncate BEFORE TRUNCATE ON asset_depreciation_runs FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Preview depreciation for an accounting period (writes nothing).
CREATE OR REPLACE FUNCTION asset_depreciation_preview(org text, pid uuid) RETURNS TABLE (asset_id uuid, asset_number text, name text, category_code text, amount numeric, accumulated_before numeric, expense_account_id uuid, accumulated_account_id uuid, division text, project_id uuid, currency text) LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY SELECT f.id, f.asset_number, f.name, c.code, fixed_asset_depreciation_for(org, f.id, greatest(per.start_date, fixed_asset_depreciated_through(org, f.id) + 1), per.end_date),
    fixed_asset_accumulated(org, f.id), c.expense_account_id, c.accumulated_account_id, f.division, f.project_id, f.currency
  FROM accounting_periods per
  JOIN fixed_assets f ON f.organization_id = per.organization_id AND f.ownership = 'owned'
  JOIN asset_category_versions c ON c.organization_id = f.organization_id AND c.id = f.category_version_id
  WHERE per.organization_id = org AND per.id = pid AND fixed_asset_capitalized(org, f.id) AND NOT fixed_asset_disposed(org, f.id)
    AND fixed_asset_depreciated_through(org, f.id) < per.end_date AND f.capitalization_date <= per.end_date
    AND fixed_asset_depreciation_for(org, f.id, greatest(per.start_date, fixed_asset_depreciated_through(org, f.id) + 1), per.end_date) > 0
  ORDER BY f.asset_number;
END $$;
--> statement-breakpoint
-- One depreciation run per period at a time; the run catches up any months not yet depreciated.
CREATE OR REPLACE FUNCTION asset_depreciation_prepare(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); per accounting_periods; r asset_depreciation_runs; rid uuid; total numeric; lines jsonb; lid uuid;
BEGIN
  IF key IS NULL OR length(key) > 150 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO r FROM asset_depreciation_runs WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', r.id, 'already', true); END IF;
  IF NOT accounting_is_uuid(p->>'periodId') THEN RAISE EXCEPTION 'period_unavailable'; END IF;
  SELECT * INTO per FROM accounting_periods WHERE organization_id = org AND id = (p->>'periodId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'period_unavailable'; END IF;
  IF per.status <> 'open' THEN RAISE EXCEPTION 'period_closed'; END IF;
  IF per.end_date > finance_kampala_today() THEN RAISE EXCEPTION 'depreciation_period_not_ended'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':asset_depreciation', 0));
  IF EXISTS (SELECT 1 FROM asset_depreciation_runs x JOIN ledger_source_links l ON l.organization_id = x.organization_id AND l.purpose = 'asset_depreciation' AND l.source_id = x.id
      WHERE x.organization_id = org AND ledger_journal_live(org, l.journal_id) AND NOT ledger_journal_effective(org, l.journal_id)) THEN RAISE EXCEPTION 'depreciation_run_pending'; END IF;
  SELECT coalesce(sum(amount), 0) INTO total FROM asset_depreciation_preview(org, per.id);
  IF total <= 0 THEN RAISE EXCEPTION 'nothing_to_depreciate'; END IF;
  INSERT INTO asset_depreciation_runs (organization_id, period_id, period_start, period_end, total, prepared_by_id, idempotency_key) VALUES (org, per.id, per.start_date, per.end_date, total, staff, key) RETURNING id INTO rid;
  INSERT INTO asset_depreciation_lines (organization_id, run_id, asset_id, amount, accumulated_before) SELECT org, rid, x.asset_id, x.amount, x.accumulated_before FROM asset_depreciation_preview(org, per.id) x;
  SELECT jsonb_agg(l ORDER BY o) INTO lines FROM (
    SELECT 1 AS o, jsonb_build_object('accountId', expense_account_id, 'debit', sum(amount)::text, 'currency', currency, 'description', 'Depreciation ' || per.name, 'division', division, 'projectId', project_id) AS l
      FROM asset_depreciation_preview(org, per.id) GROUP BY expense_account_id, currency, division, project_id
    UNION ALL
    SELECT 2, jsonb_build_object('accountId', accumulated_account_id, 'debit', NULL, 'credit', sum(amount)::text, 'currency', currency, 'description', 'Accumulated depreciation ' || per.name)
      FROM asset_depreciation_preview(org, per.id) GROUP BY accumulated_account_id, currency) q;
  lid := ledger_link_prepare(org, actor, staff, 'asset_depreciation', rid, per.end_date, 'Depreciation ' || per.name, 'DEP-' || per.name, lines, total, key, correlation);
  PERFORM tax_event(org, 'depreciation_run', rid::text, actor, staff, 'prepared', NULL, jsonb_build_object('period', per.name, 'total', total::text, 'linkId', lid), key, correlation);
  RETURN jsonb_build_object('id', rid, 'linkId', lid, 'total', total::text, 'already', false);
END $$;
--> statement-breakpoint
CREATE TABLE asset_impairments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  asset_id uuid NOT NULL,
  impairment_date date NOT NULL,
  amount numeric(17,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 2000),
  evidence_document_id uuid NOT NULL,
  prepared_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, asset_id) REFERENCES fixed_assets(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, evidence_document_id) REFERENCES documents(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TRIGGER asset_impairments_immutable BEFORE UPDATE OR DELETE ON asset_impairments FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION asset_impairment_prepare(org text, actor text, aid uuid, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); f fixed_assets; c asset_category_versions; i asset_impairments; iid uuid; amt numeric; nbv numeric; d date; lid uuid;
BEGIN
  IF key IS NULL OR length(key) > 150 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO i FROM asset_impairments WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', i.id, 'already', true); END IF;
  SELECT * INTO f FROM fixed_assets WHERE organization_id = org AND id = aid;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':asset:' || aid, 0));
  IF NOT fixed_asset_capitalized(org, aid) OR fixed_asset_disposed(org, aid) THEN RAISE EXCEPTION 'asset_not_in_service'; END IF;
  SELECT * INTO c FROM asset_category_versions WHERE organization_id = org AND id = f.category_version_id;
  amt := banking_money(p->>'amount'); d := banking_date(p->>'impairmentDate');
  nbv := f.cost - fixed_asset_accumulated(org, aid);
  IF amt <= 0 OR amt > nbv - f.residual_value THEN RAISE EXCEPTION 'impairment_exceeds_carrying_amount'; END IF;
  IF d < fixed_asset_depreciated_through(org, aid) THEN RAISE EXCEPTION 'impairment_before_last_depreciation'; END IF;
  INSERT INTO asset_impairments (organization_id, asset_id, impairment_date, amount, reason, evidence_document_id, prepared_by_id, idempotency_key)
  VALUES (org, aid, d, amt, trim(coalesce(p->>'reason', '')), tax_document_required(org, p->>'evidenceDocumentId'), staff, key) RETURNING id INTO iid;
  lid := ledger_link_prepare(org, actor, staff, 'asset_impairment', iid, d, 'Impairment of ' || f.asset_number || ' ' || f.name, f.asset_number,
    jsonb_build_array(jsonb_build_object('accountId', c.impairment_account_id, 'debit', amt::text, 'currency', f.currency, 'description', left(p->>'reason', 300), 'division', f.division, 'projectId', f.project_id),
      jsonb_build_object('accountId', c.accumulated_account_id, 'credit', amt::text, 'currency', f.currency, 'description', 'Impairment ' || f.asset_number)), amt, key, correlation);
  PERFORM tax_event(org, 'asset_impairment', iid::text, actor, staff, 'prepared', p->>'reason', jsonb_build_object('assetId', aid, 'amount', amt::text, 'linkId', lid), key, correlation);
  RETURN jsonb_build_object('id', iid, 'linkId', lid, 'already', false);
EXCEPTION WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'invalid_impairment';
END $$;
--> statement-breakpoint
CREATE TABLE asset_disposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  asset_id uuid NOT NULL,
  disposal_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sale','scrap','write_off','donation','loss_or_theft')),
  proceeds numeric(17,2) NOT NULL DEFAULT 0 CHECK (proceeds >= 0),
  proceeds_account_id uuid,
  final_depreciation numeric(17,2) NOT NULL CHECK (final_depreciation >= 0),
  accumulated_before numeric(17,2) NOT NULL,
  net_book_value numeric(17,2) NOT NULL,
  gain_or_loss numeric(17,2) NOT NULL,
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 5 AND 2000),
  evidence_document_id uuid NOT NULL,
  prepared_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, asset_id) REFERENCES fixed_assets(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, proceeds_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, evidence_document_id) REFERENCES documents(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK ((proceeds > 0) = (proceeds_account_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TRIGGER asset_disposals_immutable BEFORE UPDATE OR DELETE ON asset_disposals FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- p: {key, disposalDate, kind, proceeds, proceedsBankingAccountId | proceedsAccountId, note, evidenceDocumentId}
CREATE OR REPLACE FUNCTION asset_disposal_prepare(org text, actor text, aid uuid, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); f fixed_assets; c asset_category_versions; x asset_disposals; did uuid; d date; thru date;
  partial numeric; acc numeric; nbv numeric; proceeds numeric; pacct uuid; gl numeric; lines jsonb; lid uuid;
BEGIN
  IF key IS NULL OR length(key) > 150 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO x FROM asset_disposals WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', x.id, 'already', true); END IF;
  SELECT * INTO f FROM fixed_assets WHERE organization_id = org AND id = aid;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':asset:' || aid, 0));
  IF NOT fixed_asset_capitalized(org, aid) THEN RAISE EXCEPTION 'asset_not_in_service'; END IF;
  IF fixed_asset_disposed(org, aid) THEN RAISE EXCEPTION 'asset_already_disposed'; END IF;
  SELECT * INTO c FROM asset_category_versions WHERE organization_id = org AND id = f.category_version_id;
  d := banking_date(p->>'disposalDate');
  IF d < f.capitalization_date THEN RAISE EXCEPTION 'invalid_disposal_date'; END IF;
  thru := fixed_asset_depreciated_through(org, aid);
  -- Depreciation already posted beyond the disposal date must be reversed first; full months before the
  -- disposal month must be depreciated by a normal run first. The final partial month is included here.
  IF thru > d THEN RAISE EXCEPTION 'disposal_before_last_depreciation'; END IF;
  IF thru < date_trunc('month', d)::date - 1 AND f.depreciation_start_date < date_trunc('month', d)::date THEN RAISE EXCEPTION 'depreciation_catch_up_required'; END IF;
  partial := fixed_asset_depreciation_for(org, aid, thru + 1, d);
  acc := fixed_asset_accumulated(org, aid);
  nbv := f.cost - acc - partial;
  proceeds := banking_money(coalesce(nullif(p->>'proceeds', ''), '0'));
  IF proceeds > 0 THEN
    IF nullif(p->>'proceedsBankingAccountId', '') IS NOT NULL THEN pacct := banking_ledger_required(org, (banking_account_for_cash(org, p->>'proceedsBankingAccountId')).id);
    ELSIF accounting_is_uuid(p->>'proceedsAccountId') AND EXISTS (SELECT 1 FROM accounting_accounts WHERE organization_id = org AND id = (p->>'proceedsAccountId')::uuid AND status = 'active' AND is_postable AND manual_posting_allowed AND account_type = 'asset' AND NOT is_contra)
      THEN pacct := (p->>'proceedsAccountId')::uuid;
    ELSE RAISE EXCEPTION 'disposal_proceeds_account_required';
    END IF;
  END IF;
  gl := proceeds - nbv;
  INSERT INTO asset_disposals (organization_id, asset_id, disposal_date, kind, proceeds, proceeds_account_id, final_depreciation, accumulated_before, net_book_value, gain_or_loss, note, evidence_document_id, prepared_by_id, idempotency_key)
  VALUES (org, aid, d, p->>'kind', proceeds, pacct, partial, acc, nbv, gl, trim(coalesce(p->>'note', '')), tax_document_required(org, p->>'evidenceDocumentId'), staff, key) RETURNING id INTO did;
  lines := jsonb_build_array(jsonb_build_object('accountId', c.cost_account_id, 'credit', f.cost::text, 'currency', f.currency, 'description', 'Dispose ' || f.asset_number || ' at cost'));
  IF acc > 0 THEN lines := lines || jsonb_build_object('accountId', c.accumulated_account_id, 'debit', acc::text, 'currency', f.currency, 'description', 'Accumulated depreciation released'); END IF;
  IF partial > 0 THEN lines := lines || jsonb_build_object('accountId', c.expense_account_id, 'debit', partial::text, 'currency', f.currency, 'description', 'Depreciation to disposal date', 'division', f.division, 'projectId', f.project_id); END IF;
  IF proceeds > 0 THEN lines := lines || jsonb_build_object('accountId', pacct, 'debit', proceeds::text, 'currency', f.currency, 'description', 'Disposal proceeds'); END IF;
  IF gl > 0 THEN lines := lines || jsonb_build_object('accountId', c.gain_account_id, 'credit', gl::text, 'currency', f.currency, 'description', 'Gain on disposal');
  ELSIF gl < 0 THEN lines := lines || jsonb_build_object('accountId', c.loss_account_id, 'debit', (-gl)::text, 'currency', f.currency, 'description', 'Loss on disposal'); END IF;
  lid := ledger_link_prepare(org, actor, staff, 'asset_disposal', did, d, 'Disposal of ' || f.asset_number || ' ' || f.name, f.asset_number, lines, f.cost, key, correlation);
  PERFORM tax_event(org, 'asset_disposal', did::text, actor, staff, 'prepared', p->>'note', jsonb_build_object('assetId', aid, 'proceeds', proceeds::text, 'netBookValue', nbv::text, 'gainOrLoss', gl::text, 'linkId', lid), key, correlation);
  RETURN jsonb_build_object('id', did, 'linkId', lid, 'netBookValue', nbv::text, 'gainOrLoss', gl::text, 'finalDepreciation', partial::text, 'already', false);
EXCEPTION WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'invalid_disposal';
END $$;
--> statement-breakpoint
CREATE TABLE asset_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  asset_id uuid NOT NULL,
  transfer_date date NOT NULL,
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 2000),
  recorded_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, asset_id) REFERENCES fixed_assets(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, recorded_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TRIGGER asset_transfers_immutable BEFORE UPDATE OR DELETE ON asset_transfers FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Custody, location, division and project changes. Non-financial: later depreciation uses the new dimensions.
CREATE OR REPLACE FUNCTION asset_transfer_record(org text, actor text, aid uuid, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); f fixed_assets; t asset_transfers; tid uuid; after jsonb;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO t FROM asset_transfers WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', t.id, 'already', true); END IF;
  SELECT * INTO f FROM fixed_assets WHERE organization_id = org AND id = aid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset_unavailable'; END IF;
  IF fixed_asset_disposed(org, aid) THEN RAISE EXCEPTION 'asset_already_disposed'; END IF;
  after := jsonb_build_object('custodianId', nullif(p->>'custodianId', ''), 'location', nullif(trim(coalesce(p->>'location', '')), ''), 'division', nullif(p->>'division', ''), 'projectId', nullif(p->>'projectId', ''));
  BEGIN
    UPDATE fixed_assets SET custodian_id = (after->>'custodianId')::uuid, location = after->>'location', division = after->>'division', project_id = (after->>'projectId')::uuid, version = version + 1, updated_at = now()
    WHERE organization_id = org AND id = aid;
    INSERT INTO asset_transfers (organization_id, asset_id, transfer_date, before, after, reason, recorded_by_id, idempotency_key)
    VALUES (org, aid, banking_date(p->>'transferDate'), jsonb_build_object('custodianId', f.custodian_id, 'location', f.location, 'division', f.division, 'projectId', f.project_id), after, trim(coalesce(p->>'reason', '')), staff, key)
    RETURNING id INTO tid;
  EXCEPTION WHEN check_violation OR foreign_key_violation OR invalid_text_representation THEN RAISE EXCEPTION 'invalid_asset_transfer';
  END;
  PERFORM tax_event(org, 'asset_transfer', tid::text, actor, staff, 'recorded', p->>'reason', jsonb_build_object('assetId', aid, 'after', after), key, correlation);
  RETURN jsonb_build_object('id', tid, 'already', false);
END $$;
--> statement-breakpoint
-- Reversal is only allowed when nothing later depends on the journal.
CREATE OR REPLACE FUNCTION ledger_link_reverse_check(org text, l ledger_source_links) RETURNS void LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF l.purpose = 'asset_capitalization' AND (EXISTS (SELECT 1 FROM ledger_source_links x WHERE x.organization_id = org AND x.purpose IN ('asset_impairment','asset_disposal')
      AND ledger_journal_live(org, x.journal_id) AND x.source_id IN (SELECT id FROM asset_impairments WHERE organization_id = org AND asset_id = l.source_id UNION SELECT id FROM asset_disposals WHERE organization_id = org AND asset_id = l.source_id))
     OR EXISTS (SELECT 1 FROM asset_depreciation_lines d JOIN ledger_source_links x ON x.organization_id = d.organization_id AND x.purpose = 'asset_depreciation' AND x.source_id = d.run_id
      WHERE d.organization_id = org AND d.asset_id = l.source_id AND ledger_journal_live(org, x.journal_id))) THEN
    RAISE EXCEPTION 'reversal_blocked_by_later_entries';
  END IF;
  IF l.purpose = 'asset_depreciation' AND EXISTS (SELECT 1 FROM asset_depreciation_lines d JOIN asset_depreciation_runs r ON r.organization_id = d.organization_id AND r.id = d.run_id
      JOIN ledger_source_links x ON x.organization_id = r.organization_id AND x.purpose = 'asset_depreciation' AND x.source_id = r.id AND x.id <> l.id
      WHERE d.organization_id = org AND ledger_journal_live(org, x.journal_id) AND r.period_end > (SELECT period_end FROM asset_depreciation_runs WHERE organization_id = org AND id = l.source_id)
        AND d.asset_id IN (SELECT asset_id FROM asset_depreciation_lines WHERE organization_id = org AND run_id = l.source_id)) THEN
    RAISE EXCEPTION 'reversal_blocked_by_later_entries';
  END IF;
  IF l.purpose = 'asset_depreciation' AND EXISTS (SELECT 1 FROM asset_disposals x JOIN ledger_source_links k ON k.organization_id = x.organization_id AND k.purpose = 'asset_disposal' AND k.source_id = x.id
      WHERE x.organization_id = org AND ledger_journal_live(org, k.journal_id) AND x.asset_id IN (SELECT asset_id FROM asset_depreciation_lines WHERE organization_id = org AND run_id = l.source_id)) THEN
    RAISE EXCEPTION 'reversal_blocked_by_later_entries';
  END IF;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Tax capital allowances: computed per asset for an income-tax year from APPROVED capital-allowance
-- rules. Never posted to the ledger; imported into a draft computation as reviewed schedule lines,
-- together with the add-back of accounting depreciation from the ledger.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE asset_tax_allowances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  computation_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  rule_version_id uuid NOT NULL,
  tax_value_before numeric(17,2) NOT NULL,
  amount numeric(17,2) NOT NULL CHECK (amount >= 0),
  UNIQUE (organization_id, computation_id, asset_id),
  FOREIGN KEY (organization_id, computation_id) REFERENCES income_tax_computations(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, asset_id) REFERENCES fixed_assets(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, rule_version_id) REFERENCES tax_rule_versions(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TRIGGER asset_tax_allowances_guard BEFORE INSERT OR UPDATE OR DELETE ON asset_tax_allowances FOR EACH ROW EXECUTE FUNCTION income_tax_line_guard();
--> statement-breakpoint
-- Replace a draft computation's schedule lines: ledger depreciation add-back and capital allowances.
CREATE OR REPLACE FUNCTION income_tax_import_schedules(org text, actor text, cid uuid, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); c income_tax_computations; dep numeric; total numeric := 0; n integer; f record; r tax_rule_versions; before numeric; amt numeric; missing jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO c FROM income_tax_computations WHERE organization_id = org AND id = cid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tax_computation_unavailable'; END IF;
  IF tax_replay(org, key, 'income_tax_computation', cid::text, 'schedules_imported') THEN RETURN jsonb_build_object('id', cid, 'already', true); END IF;
  IF c.status <> 'draft' THEN RAISE EXCEPTION 'tax_computation_locked'; END IF;
  IF c.prepared_by_id <> staff THEN RAISE EXCEPTION 'not_preparer'; END IF;
  DELETE FROM income_tax_adjustments WHERE organization_id = org AND computation_id = cid AND source <> 'manual';
  DELETE FROM asset_tax_allowances WHERE organization_id = org AND computation_id = cid;
  -- Accounting depreciation and impairment in the ledger for the year (all approved category expense accounts).
  SELECT coalesce(sum(l.functional_debit - l.functional_credit), 0) INTO dep FROM accounting_journal_lines l
    JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id AND j.status = 'posted'
    WHERE l.organization_id = org AND j.entry_date BETWEEN c.period_start AND c.period_end
      AND l.account_id IN (SELECT expense_account_id FROM asset_category_versions WHERE organization_id = org AND status IN ('approved','superseded')
                            UNION SELECT impairment_account_id FROM asset_category_versions WHERE organization_id = org AND status IN ('approved','superseded'));
  SELECT coalesce(max(line_number), 0) INTO n FROM income_tax_adjustments WHERE organization_id = org AND computation_id = cid;
  IF dep > 0 THEN
    n := n + 1;
    INSERT INTO income_tax_adjustments (organization_id, computation_id, line_number, kind, description, amount, source) VALUES (org, cid, n, 'depreciation_addback', 'Accounting depreciation and impairment added back (ledger)', dep, 'ledger_depreciation');
  END IF;
  FOR f IN SELECT * FROM fixed_assets WHERE organization_id = org AND ownership = 'owned' AND capitalization_date <= c.period_end AND fixed_asset_capitalized(org, id) LOOP
    r := tax_rule_at(org, f.tax_allowance_rule_code, c.period_end);
    IF f.tax_allowance_rule_code IS NULL OR r.id IS NULL OR r.rule_kind <> 'capital_allowance_class' THEN
      missing := missing || to_jsonb(f.asset_number); CONTINUE;
    END IF;
    -- Tax written-down value: cost less allowances in approved computations of earlier years.
    SELECT f.cost - coalesce(sum(t.amount), 0) INTO before FROM asset_tax_allowances t JOIN income_tax_computations x ON x.organization_id = t.organization_id AND x.id = t.computation_id
      WHERE t.organization_id = org AND t.asset_id = f.id AND x.status = 'approved' AND x.kind <> 'provisional' AND x.fiscal_year < c.fiscal_year;
    amt := CASE WHEN r.parameters->>'method' = 'straight_line' THEN least(round(f.cost * (r.parameters->>'rate')::numeric, 2), before) ELSE round(before * (r.parameters->>'rate')::numeric, 2) END;
    INSERT INTO asset_tax_allowances (organization_id, computation_id, asset_id, rule_version_id, tax_value_before, amount) VALUES (org, cid, f.id, r.id, before, greatest(amt, 0));
    total := total + greatest(amt, 0);
  END LOOP;
  IF total > 0 THEN
    n := n + 1;
    INSERT INTO income_tax_adjustments (organization_id, computation_id, line_number, kind, description, amount, source) VALUES (org, cid, n, 'capital_allowance', 'Capital allowances (asset schedule)', total, 'capital_allowance_schedule');
  END IF;
  UPDATE income_tax_computations SET version = version + 1, updated_at = now() WHERE organization_id = org AND id = cid;
  PERFORM tax_event(org, 'income_tax_computation', cid::text, actor, staff, 'schedules_imported', NULL, jsonb_build_object('depreciationAddBack', dep::text, 'capitalAllowances', total::text, 'assetsWithoutRule', missing), key, correlation);
  RETURN jsonb_build_object('id', cid, 'depreciationAddBack', dep::text, 'capitalAllowances', total::text, 'assetsWithoutRule', missing, 'already', false);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- VAT, EFRIS and withholding-tax readiness. The structures exist so that issued documents and
-- payments can later carry tax treatment, but every write is refused while the corresponding
-- obligation is not operational, and VAT and withholding tax cannot be made operational in this
-- phase (CHECK on tax_obligation_versions). Nothing here changes an invoice, payment or expense.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tax_type_operational(org text, t text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM tax_obligation_versions WHERE organization_id = org AND tax_type = t AND status = 'approved' AND processing_enabled);
$$;
--> statement-breakpoint
CREATE TABLE vat_document_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  invoice_id uuid,
  credit_note_id uuid,
  expense_id uuid,
  supply_type text NOT NULL CHECK (supply_type IN ('standard_rated','zero_rated','exempt','out_of_scope')),
  direction text NOT NULL CHECK (direction IN ('output','input')),
  net_amount numeric(17,2) NOT NULL,
  vat_amount numeric(17,2) NOT NULL,
  input_eligible boolean,
  rule_version_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, credit_note_id) REFERENCES credit_notes(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, expense_id) REFERENCES expenses(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, rule_version_id) REFERENCES tax_rule_versions(organization_id, id) ON DELETE RESTRICT,
  CHECK (num_nonnulls(invoice_id, credit_note_id, expense_id) = 1),
  CHECK ((direction = 'input') = (expense_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE efris_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  invoice_id uuid,
  credit_note_id uuid,
  submission_status text NOT NULL DEFAULT 'not_submitted' CHECK (submission_status IN ('not_submitted','queued','submitted','accepted','rejected')),
  fiscal_document_number text,
  verification_code text,
  qr_payload text,
  response jsonb,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, credit_note_id) REFERENCES credit_notes(organization_id, id) ON DELETE RESTRICT,
  CHECK (num_nonnulls(invoice_id, credit_note_id) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX efris_documents_invoice_uq ON efris_documents (organization_id, invoice_id) WHERE invoice_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX efris_documents_credit_note_uq ON efris_documents (organization_id, credit_note_id) WHERE credit_note_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE withholding_tax_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  direction text NOT NULL CHECK (direction IN ('withheld_by_calacot','withheld_from_calacot')),
  supplier_id uuid,
  client_id uuid,
  disbursement_id uuid,
  payment_id uuid,
  gross_amount numeric(17,2) NOT NULL CHECK (gross_amount > 0),
  amount numeric(17,2) NOT NULL CHECK (amount > 0),
  rule_version_id uuid NOT NULL,
  certificate_reference text,
  remitted_payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, supplier_id) REFERENCES suppliers(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, client_id) REFERENCES clients(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, rule_version_id) REFERENCES tax_rule_versions(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, remitted_payment_id) REFERENCES tax_payments(organization_id, id) ON DELETE RESTRICT,
  CHECK ((direction = 'withheld_by_calacot') = (supplier_id IS NOT NULL AND client_id IS NULL)),
  CHECK (amount <= gross_amount)
);
--> statement-breakpoint
-- Readiness guard: refuse every write until the tax is operational for the organization.
CREATE OR REPLACE FUNCTION tax_readiness_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t text := CASE TG_TABLE_NAME WHEN 'withholding_tax_records' THEN 'withholding_tax' ELSE 'vat' END;
BEGIN
  IF NOT tax_type_operational(coalesce(NEW.organization_id, OLD.organization_id), t) THEN
    RAISE EXCEPTION '%', CASE t WHEN 'vat' THEN 'vat_not_operational' ELSE 'withholding_tax_not_operational' END;
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER vat_document_treatments_readiness BEFORE INSERT OR UPDATE OR DELETE ON vat_document_treatments FOR EACH ROW EXECUTE FUNCTION tax_readiness_guard();
--> statement-breakpoint
CREATE TRIGGER efris_documents_readiness BEFORE INSERT OR UPDATE OR DELETE ON efris_documents FOR EACH ROW EXECUTE FUNCTION tax_readiness_guard();
--> statement-breakpoint
CREATE TRIGGER withholding_tax_records_readiness BEFORE INSERT OR UPDATE OR DELETE ON withholding_tax_records FOR EACH ROW EXECUTE FUNCTION tax_readiness_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Payroll foundation. Payroll profiles are explicit records (never inferred from the staff
-- directory); contractors are separate from employees and never enter payroll runs. Runs can only be
-- drafted and simulated: approval, payment and posting are impossible in this phase (CHECK).
-- Statutory deductions (PAYE, NSSF) are computed only from approved rules of an operational
-- obligation, which cannot exist yet, so simulations show them as "not configured".
-- ---------------------------------------------------------------------------------------------

CREATE TABLE payroll_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  staff_id uuid,
  person_name text NOT NULL CHECK (length(trim(person_name)) BETWEEN 2 AND 160),
  engagement_type text NOT NULL CHECK (engagement_type IN ('employee','contractor')),
  employee_number text NOT NULL CHECK (employee_number ~ '^[A-Za-z0-9-]{1,30}$'),
  start_date date NOT NULL,
  end_date date,
  tin text CHECK (tin IS NULL OR tin ~ '^[0-9]{6,15}$'),
  nssf_number text CHECK (nssf_number IS NULL OR length(nssf_number) <= 30),
  payment_method text NOT NULL CHECK (payment_method IN ('bank','mobile_money','cash')),
  payment_account_last4 text CHECK (payment_account_last4 IS NULL OR payment_account_last4 ~ '^[A-Za-z0-9]{2,4}$'),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','active','rejected','inactive')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  prepared_by_id uuid NOT NULL,
  approved_by_id uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, employee_number),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, staff_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, approved_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (status NOT IN ('active','inactive') OR approved_by_id IS NOT NULL),
  CHECK (approved_by_id IS NULL OR approved_by_id <> prepared_by_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX payroll_profiles_staff_uq ON payroll_profiles (organization_id, staff_id) WHERE staff_id IS NOT NULL AND status IN ('proposed','active');
--> statement-breakpoint
CREATE TABLE payroll_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_]{1,29}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  kind text NOT NULL CHECK (kind IN ('basic_salary','allowance','bonus','deduction','employer_contribution')),
  taxable boolean NOT NULL,
  statutory text CHECK (statutory IS NULL OR statutory IN ('paye','nssf_employee','nssf_employer')),
  expense_account_id uuid,
  liability_account_id uuid,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','retired')),
  proposed_by_id uuid NOT NULL,
  decided_by_id uuid,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, expense_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, liability_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, proposed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'proposed') = (decided_by_id IS NULL)),
  CHECK (decided_by_id IS NULL OR decided_by_id <> proposed_by_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX payroll_components_one_live_uq ON payroll_components (organization_id, code) WHERE status IN ('proposed','approved');
--> statement-breakpoint
CREATE TABLE payroll_salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  profile_id uuid NOT NULL,
  effective_from date NOT NULL,
  currency text NOT NULL CHECK (currency IN ('UGX','USD')),
  lines jsonb NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
  prepared_by_id uuid NOT NULL,
  approved_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, profile_id) REFERENCES payroll_profiles(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, approved_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 30),
  CHECK ((status = 'approved') = (approved_by_id IS NOT NULL) OR status = 'rejected'),
  CHECK (approved_by_id IS NULL OR approved_by_id <> prepared_by_id)
);
--> statement-breakpoint
CREATE TABLE payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  -- Phase 2D: simulation only. Approval, payment and posting need a reviewed migration.
  status text NOT NULL DEFAULT 'simulated' CHECK (status IN ('simulated')),
  totals jsonb NOT NULL,
  problems jsonb NOT NULL DEFAULT '[]'::jsonb,
  prepared_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (period_end >= period_start)
);
--> statement-breakpoint
CREATE TABLE payroll_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  run_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  structure_id uuid NOT NULL,
  -- Payslip artifact structure: earnings, deductions, employer contributions, statutory lines and net.
  payload jsonb NOT NULL,
  gross numeric(17,2) NOT NULL,
  net_before_statutory numeric(17,2) NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, run_id, profile_id),
  FOREIGN KEY (organization_id, run_id) REFERENCES payroll_runs(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, profile_id) REFERENCES payroll_profiles(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, structure_id) REFERENCES payroll_salary_structures(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
-- Totals are written once, in the creating transaction, after the payslips are computed.
CREATE OR REPLACE FUNCTION payroll_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.totals <> '{}'::jsonb OR (to_jsonb(NEW) - 'totals') IS DISTINCT FROM (to_jsonb(OLD) - 'totals') THEN RAISE EXCEPTION 'payroll_history_immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payroll_runs_guard BEFORE UPDATE OR DELETE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION payroll_run_guard();
--> statement-breakpoint
CREATE TRIGGER payroll_payslips_immutable BEFORE UPDATE OR DELETE ON payroll_payslips FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION payroll_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'payroll_history_immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payroll_profiles_guard BEFORE DELETE ON payroll_profiles FOR EACH ROW EXECUTE FUNCTION payroll_history_guard();
--> statement-breakpoint
CREATE TRIGGER payroll_components_guard BEFORE DELETE ON payroll_components FOR EACH ROW EXECUTE FUNCTION payroll_history_guard();
--> statement-breakpoint
CREATE TRIGGER payroll_structures_guard BEFORE DELETE ON payroll_salary_structures FOR EACH ROW EXECUTE FUNCTION payroll_history_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION payroll_profile_save(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); pr payroll_profiles; pid uuid;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO pr FROM payroll_profiles WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', pr.id, 'already', true); END IF;
  IF nullif(p->>'staffId', '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff_memberships WHERE organization_id = org AND id = (p->>'staffId')::uuid) THEN RAISE EXCEPTION 'staff_unavailable'; END IF;
  BEGIN
    INSERT INTO payroll_profiles (organization_id, staff_id, person_name, engagement_type, employee_number, start_date, end_date, tin, nssf_number, payment_method, payment_account_last4, prepared_by_id, idempotency_key)
    VALUES (org, nullif(p->>'staffId', '')::uuid, trim(coalesce(p->>'personName', '')), p->>'engagementType', upper(trim(coalesce(p->>'employeeNumber', ''))), (p->>'startDate')::date, nullif(p->>'endDate', '')::date,
      nullif(regexp_replace(coalesce(p->>'tin', ''), '\s', '', 'g'), ''), nullif(trim(coalesce(p->>'nssfNumber', '')), ''), p->>'paymentMethod', nullif(right(regexp_replace(coalesce(p->>'paymentAccount', ''), '[^A-Za-z0-9]', '', 'g'), 4), ''), staff, key)
    RETURNING id INTO pid;
  EXCEPTION
    WHEN unique_violation THEN RAISE EXCEPTION 'payroll_profile_exists';
    WHEN check_violation OR not_null_violation OR invalid_text_representation OR invalid_datetime_format THEN RAISE EXCEPTION 'invalid_payroll_profile';
  END;
  -- Only the last four characters of a payment account are ever stored.
  PERFORM tax_event(org, 'payroll_profile', pid::text, actor, staff, 'proposed', NULL, jsonb_build_object('engagementType', p->>'engagementType', 'employeeNumber', upper(p->>'employeeNumber')), key, correlation);
  RETURN jsonb_build_object('id', pid, 'already', false);
END $$;
--> statement-breakpoint
-- Generic two-person decision for payroll set-up records.
CREATE OR REPLACE FUNCTION payroll_decide(org text, actor text, etype text, rid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); preparer uuid; st text; target text; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF etype NOT IN ('payroll_profile','payroll_component','payroll_structure') OR decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  IF tax_replay(org, key, etype, rid::text, decision) THEN RETURN jsonb_build_object('id', rid, 'already', true); END IF;
  IF etype = 'payroll_profile' THEN SELECT prepared_by_id, status INTO preparer, st FROM payroll_profiles WHERE organization_id = org AND id = rid FOR UPDATE;
  ELSIF etype = 'payroll_component' THEN SELECT proposed_by_id, status INTO preparer, st FROM payroll_components WHERE organization_id = org AND id = rid FOR UPDATE;
  ELSE SELECT prepared_by_id, status INTO preparer, st FROM payroll_salary_structures WHERE organization_id = org AND id = rid FOR UPDATE;
  END IF;
  IF st IS DISTINCT FROM 'proposed' THEN RAISE EXCEPTION 'payroll_record_unavailable'; END IF;
  IF preparer = staff THEN RAISE EXCEPTION 'payroll_self_approval_denied'; END IF;
  IF decision = 'reject' AND length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
  IF etype = 'payroll_profile' THEN
    target := CASE WHEN decision = 'approve' THEN 'active' ELSE 'rejected' END;
    UPDATE payroll_profiles SET status = target, approved_by_id = CASE WHEN decision = 'approve' THEN staff END, approved_at = CASE WHEN decision = 'approve' THEN now() END, version = version + 1, updated_at = now() WHERE organization_id = org AND id = rid;
  ELSIF etype = 'payroll_component' THEN
    target := CASE WHEN decision = 'approve' THEN 'approved' ELSE 'rejected' END;
    UPDATE payroll_components SET status = target, decided_by_id = staff WHERE organization_id = org AND id = rid;
  ELSE
    target := CASE WHEN decision = 'approve' THEN 'approved' ELSE 'rejected' END;
    UPDATE payroll_salary_structures SET status = target, approved_by_id = CASE WHEN decision = 'approve' THEN staff END WHERE organization_id = org AND id = rid;
  END IF;
  PERFORM tax_event(org, etype, rid::text, actor, staff, decision, clean, jsonb_build_object('status', target), key, correlation);
  RETURN jsonb_build_object('id', rid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION payroll_component_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); c payroll_components; cid uuid;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO c FROM payroll_components WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', c.id, 'already', true); END IF;
  BEGIN
    INSERT INTO payroll_components (organization_id, code, name, kind, taxable, statutory, expense_account_id, liability_account_id, proposed_by_id, idempotency_key)
    VALUES (org, upper(p->>'code'), trim(coalesce(p->>'name', '')), p->>'kind', coalesce((p->>'taxable')::boolean, true), nullif(p->>'statutory', ''),
      nullif(p->>'expenseAccountId', '')::uuid, nullif(p->>'liabilityAccountId', '')::uuid, staff, key) RETURNING id INTO cid;
  EXCEPTION
    WHEN unique_violation THEN RAISE EXCEPTION 'payroll_component_exists';
    WHEN check_violation OR not_null_violation OR invalid_text_representation OR foreign_key_violation THEN RAISE EXCEPTION 'invalid_payroll_component';
  END;
  PERFORM tax_event(org, 'payroll_component', cid::text, actor, staff, 'proposed', NULL, p - 'key', key, correlation);
  RETURN jsonb_build_object('id', cid, 'already', false);
END $$;
--> statement-breakpoint
-- p: {key, profileId, effectiveFrom, currency, lines:[{componentCode, amount}]}
CREATE OR REPLACE FUNCTION payroll_structure_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); s payroll_salary_structures; sid uuid; pr payroll_profiles; x jsonb;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO s FROM payroll_salary_structures WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', s.id, 'already', true); END IF;
  IF NOT accounting_is_uuid(p->>'profileId') THEN RAISE EXCEPTION 'payroll_record_unavailable'; END IF;
  SELECT * INTO pr FROM payroll_profiles WHERE organization_id = org AND id = (p->>'profileId')::uuid;
  IF pr.id IS NULL OR pr.status <> 'active' THEN RAISE EXCEPTION 'payroll_record_unavailable'; END IF;
  IF pr.engagement_type <> 'employee' THEN RAISE EXCEPTION 'contractor_not_on_payroll'; END IF;
  IF jsonb_typeof(p->'lines') <> 'array' THEN RAISE EXCEPTION 'invalid_payroll_structure'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
    PERFORM banking_money(x->>'amount');
    IF NOT EXISTS (SELECT 1 FROM payroll_components WHERE organization_id = org AND code = upper(x->>'componentCode') AND status = 'approved' AND statutory IS NULL) THEN RAISE EXCEPTION 'payroll_component_not_approved'; END IF;
  END LOOP;
  BEGIN
    INSERT INTO payroll_salary_structures (organization_id, profile_id, effective_from, currency, lines, prepared_by_id, idempotency_key)
    VALUES (org, pr.id, (p->>'effectiveFrom')::date, p->>'currency', p->'lines', staff, key) RETURNING id INTO sid;
  EXCEPTION WHEN check_violation OR not_null_violation OR invalid_datetime_format THEN RAISE EXCEPTION 'invalid_payroll_structure';
  END;
  PERFORM tax_event(org, 'payroll_structure', sid::text, actor, staff, 'proposed', NULL, jsonb_build_object('profileId', pr.id, 'effectiveFrom', p->>'effectiveFrom'), key, correlation);
  RETURN jsonb_build_object('id', sid, 'already', false);
END $$;
--> statement-breakpoint
-- Simulate a payroll period: gross pay and non-statutory deductions from approved structures. Nothing is
-- approved, paid or posted. Statutory lines are omitted unless PAYE/NSSF are operational (impossible now).
CREATE OR REPLACE FUNCTION payroll_run_simulate(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); r payroll_runs; rid uuid; s date; e date; pr record; x jsonb; comp payroll_components;
  gross numeric; ded numeric; employer numeric; lines jsonb; tot_gross numeric := 0; tot_net numeric := 0; tot_employer numeric := 0; n integer := 0; problems jsonb := '[]'::jsonb;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO r FROM payroll_runs WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', r.id, 'already', true); END IF;
  BEGIN s := (p->>'periodStart')::date; e := (p->>'periodEnd')::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_payroll_period'; END;
  IF s IS NULL OR e IS NULL OR e < s OR e - s > 31 THEN RAISE EXCEPTION 'invalid_payroll_period'; END IF;
  IF NOT tax_type_operational(org, 'paye') THEN problems := problems || to_jsonb('paye_not_operational'::text); END IF;
  IF NOT tax_type_operational(org, 'nssf') THEN problems := problems || to_jsonb('nssf_not_operational'::text); END IF;
  INSERT INTO payroll_runs (organization_id, period_start, period_end, totals, problems, prepared_by_id, idempotency_key) VALUES (org, s, e, '{}'::jsonb, problems, staff, key) RETURNING id INTO rid;
  FOR pr IN SELECT DISTINCT ON (f.id) f.id AS profile_id, f.person_name, f.employee_number, st.id AS structure_id, st.lines, st.currency
      FROM payroll_profiles f JOIN payroll_salary_structures st ON st.organization_id = f.organization_id AND st.profile_id = f.id AND st.status = 'approved' AND st.effective_from <= e
      WHERE f.organization_id = org AND f.status = 'active' AND f.engagement_type = 'employee' AND f.start_date <= e AND (f.end_date IS NULL OR f.end_date >= s)
      ORDER BY f.id, st.effective_from DESC LOOP
    gross := 0; ded := 0; employer := 0; lines := '[]'::jsonb;
    FOR x IN SELECT value FROM jsonb_array_elements(pr.lines) LOOP
      SELECT * INTO comp FROM payroll_components WHERE organization_id = org AND code = upper(x->>'componentCode') AND status = 'approved';
      CONTINUE WHEN comp.id IS NULL;
      IF comp.kind IN ('basic_salary','allowance','bonus') THEN gross := gross + (x->>'amount')::numeric(17,2);
      ELSIF comp.kind = 'deduction' THEN ded := ded + (x->>'amount')::numeric(17,2);
      ELSE employer := employer + (x->>'amount')::numeric(17,2); END IF;
      lines := lines || jsonb_build_object('code', comp.code, 'name', comp.name, 'kind', comp.kind, 'taxable', comp.taxable, 'amount', ((x->>'amount')::numeric(17,2))::text);
    END LOOP;
    INSERT INTO payroll_payslips (organization_id, run_id, profile_id, structure_id, payload, gross, net_before_statutory)
    VALUES (org, rid, pr.profile_id, pr.structure_id, jsonb_build_object('employee', pr.person_name, 'employeeNumber', pr.employee_number, 'currency', pr.currency, 'periodStart', s, 'periodEnd', e,
      'lines', lines, 'statutory', jsonb_build_object('status', 'not_configured', 'note', 'PAYE and NSSF are not operational; no statutory deduction is computed.'),
      'gross', gross::text, 'deductions', ded::text, 'employerContributions', employer::text, 'netBeforeStatutory', (gross - ded)::text, 'simulation', true), gross, gross - ded);
    tot_gross := tot_gross + gross; tot_net := tot_net + gross - ded; tot_employer := tot_employer + employer; n := n + 1;
  END LOOP;
  UPDATE payroll_runs SET totals = jsonb_build_object('employees', n, 'gross', tot_gross::text, 'netBeforeStatutory', tot_net::text, 'employerContributions', tot_employer::text) WHERE organization_id = org AND id = rid;
  PERFORM tax_event(org, 'payroll_run', rid::text, actor, staff, 'simulated', NULL, jsonb_build_object('periodStart', s, 'periodEnd', e, 'employees', n, 'gross', tot_gross::text, 'netBeforeStatutory', tot_net::text, 'employer', tot_employer::text, 'problems', problems), key, correlation);
  RETURN jsonb_build_object('id', rid, 'employees', n, 'gross', tot_gross::text, 'netBeforeStatutory', tot_net::text, 'employerContributions', tot_employer::text, 'problems', problems, 'already', false);
END $$;
