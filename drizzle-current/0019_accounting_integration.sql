-- Phase 2B: automated accounting integration (source-to-ledger). Additive, and inert on migration.
--
-- What this adds:
--   * accounting_integration_settings: the staged rollout switch (disabled -> isolated_test ->
--     shadow), proposed by one person and approved by another. 'active' (real production posting)
--     is refused by a CHECK constraint; lifting it needs a reviewed migration after accountant
--     sign-off. With no approved settings the stage is 'disabled' and nothing is captured.
--   * accounting_event_mappings: versioned, two-person-approved mappings from business events to
--     ledger accounts. No mapping is created by this migration; nothing is assumed.
--   * accounting_integration_events: a durable transactional outbox. AFTER triggers on invoices,
--     credit notes, payments, allocations, refunds, expenses and disbursements enqueue one event per
--     authoritative change, in the same transaction as the change, with a stable unique key.
--   * accounting_integration_process(): a worker that claims events with FOR UPDATE SKIP LOCKED and
--     posts each one as a 'system' journal (or a reversal), or records why it cannot.
--   * accounting_integration_reconciliation(): operational records vs ledger, by currency and date.
--
-- Safety:
--   * Posting a system journal needs ALL of: stage 'isolated_test', a database explicitly marked as
--     a test database (calacot.accounting_test_database = 'on', a database-level setting that is
--     never set in production), and the transaction-local flag set only inside the worker.
--   * Shadow stage computes the journal it WOULD post into accounting_shadow_lines and never
--     touches the general ledger.
--   * Every Phase 2A control still applies at posting: balance, periods, active accounts,
--     functional currency only (multi-currency stays off), immutability and numbering.
--   * Capture never blocks a business transaction: a capture error is recorded in
--     accounting_integration_capture_failures (visible in the workspace) and recovered by backfill.
--
-- Changes to Phase 2A objects (reviewed, behaviour-preserving for manual journals):
--   accounting_journal_insert_guard / accounting_journal_guard (system journals and reversals of
--   system journals use the integration gate instead of the hard 'automatic_posting_disabled'),
--   and the accounting_events entity_type CHECK (three new entity types).

ALTER TABLE accounting_events DROP CONSTRAINT accounting_events_entity_type_check;
--> statement-breakpoint
ALTER TABLE accounting_events ADD CONSTRAINT accounting_events_entity_type_check CHECK (entity_type IN (
  'policy','account','chart','period','fiscal_year','journal','exchange_rate','posting_rule','integration_setting','event_mapping','integration_event'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Rollout stage
-- ---------------------------------------------------------------------------------------------

CREATE TABLE accounting_integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  version integer NOT NULL CHECK (version > 0),
  stage text NOT NULL CHECK (stage IN ('disabled','isolated_test','shadow','active')),
  -- Phase 2B hard stop: real production posting is not available in this phase.
  CONSTRAINT accounting_integration_no_activation CHECK (stage <> 'active'),
  -- Ledger accounts that the reconciliation compares with the operational sub-ledgers.
  control_accounts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(control_accounts) = 'object'),
  status text NOT NULL CHECK (status IN ('proposed','approved','rejected','superseded')),
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 5 AND 2000),
  proposed_by_id uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR length(decision_note) <= 2000),
  idempotency_key text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, version),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, proposed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (status = 'proposed' OR (decided_by_id IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (status NOT IN ('approved','superseded') OR decided_by_id <> proposed_by_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX accounting_integration_settings_one_proposal_uq ON accounting_integration_settings (organization_id) WHERE status = 'proposed';
--> statement-breakpoint
CREATE UNIQUE INDEX accounting_integration_settings_one_approved_uq ON accounting_integration_settings (organization_id) WHERE status = 'approved';
--> statement-breakpoint
CREATE TRIGGER accounting_integration_settings_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_integration_settings FOR EACH ROW EXECUTE FUNCTION accounting_decision_guard();
--> statement-breakpoint
CREATE TRIGGER accounting_integration_settings_no_truncate BEFORE TRUNCATE ON accounting_integration_settings FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_integration_stage(org text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT stage FROM accounting_integration_settings WHERE organization_id = org AND status = 'approved' LIMIT 1), 'disabled');
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_integration_control_account(org text, k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(control_accounts->>k, '') FROM accounting_integration_settings WHERE organization_id = org AND status = 'approved' LIMIT 1;
$$;
--> statement-breakpoint
-- A database is a test database only if its owner marked it (ALTER DATABASE ... SET
-- calacot.accounting_test_database = 'on'). Production databases never carry this setting.
CREATE OR REPLACE FUNCTION accounting_integration_test_database() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('calacot.accounting_test_database', true), '') = 'on';
$$;
--> statement-breakpoint
-- True only inside the integration worker, on a test database, in the isolated-test stage.
CREATE OR REPLACE FUNCTION accounting_integration_posting_allowed(org text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT accounting_integration_stage(org) = 'isolated_test' AND accounting_integration_test_database()
    AND coalesce(current_setting('calacot.accounting_integration', true), '') = 'on';
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Event catalogue (the single source of truth for event types, amounts and mapping conditions)
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION accounting_event_catalog()
RETURNS TABLE (event_type text, stage text, requires_mapping boolean, amount_keys text[], condition_keys text[], reverses text, taxable boolean)
LANGUAGE sql IMMUTABLE AS $$
  VALUES
    ('invoice_issued',          'recognition', true,  ARRAY['total','net','tax'], ARRAY['currency','division','billingKind','taxTreatment'], NULL::text, true),
    ('invoice_voided',          'correction',  false, ARRAY[]::text[],           ARRAY[]::text[], 'invoice_issued', false),
    ('credit_note_issued',      'recognition', true,  ARRAY['total','net','tax'], ARRAY['currency','division','billingKind','taxTreatment'], NULL, true),
    ('credit_note_voided',      'correction',  false, ARRAY[]::text[],           ARRAY[]::text[], 'credit_note_issued', false),
    ('payment_confirmed',       'cash',        true,  ARRAY['amount'],           ARRAY['currency','method'], NULL, false),
    ('payment_allocated',       'settlement',  true,  ARRAY['amount'],           ARRAY['currency','division','billingKind'], NULL, false),
    ('refund_completed',        'cash',        true,  ARRAY['amount'],           ARRAY['currency'], NULL, false),
    ('allocation_reversed',     'settlement',  true,  ARRAY['amount'],           ARRAY['currency','division','billingKind'], NULL, false),
    ('expense_approved',        'approval',    false, ARRAY['total','net','tax'], ARRAY['currency','division','category','taxTreatment','supplierLinked'], NULL, true),
    ('disbursement_recorded',   'cash',        true,  ARRAY['amount'],           ARRAY['currency','division','category','method','financeAccountId','expenseRecognized','taxTreatment'], NULL, true),
    ('disbursement_voided',     'correction',  false, ARRAY[]::text[],           ARRAY[]::text[], 'disbursement_recorded', false),
    ('disbursement_reconciled', 'evidence',    false, ARRAY['amount'],           ARRAY['currency','method','financeAccountId'], NULL, false)
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Mappings
-- ---------------------------------------------------------------------------------------------

CREATE TABLE accounting_event_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  event_type text NOT NULL CHECK (event_type IN ('invoice_issued','credit_note_issued','payment_confirmed','payment_allocated','refund_completed','allocation_reversed','expense_approved','disbursement_recorded','disbursement_reconciled')),
  version integer NOT NULL CHECK (version > 0),
  schema_version text NOT NULL DEFAULT 'calacot.mapping/v1' CHECK (schema_version = 'calacot.mapping/v1'),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','retired')),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 5 AND 1000),
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(conditions) = 'object'),
  treatment text NOT NULL CHECK (treatment IN ('journal','no_entry')),
  definition jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(definition) = 'object'),
  priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 1000),
  -- The accounting policy version this mapping was designed for (NULL: any approved policy).
  policy_version integer CHECK (policy_version IS NULL OR policy_version > 0),
  effective_from date NOT NULL,
  proposed_by_id uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  retired_at timestamptz,
  idempotency_key text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_type, version),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, proposed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (status = 'proposed' OR (decided_by_id IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (status NOT IN ('approved','retired') OR decided_by_id <> proposed_by_id),
  CHECK (status <> 'retired' OR retired_at IS NOT NULL),
  CHECK (treatment = 'no_entry' OR jsonb_typeof(definition->'lines') = 'array')
);
--> statement-breakpoint
-- Two approved mappings can never have identical conditions and priority (that would be ambiguous).
CREATE UNIQUE INDEX accounting_event_mappings_approved_uq ON accounting_event_mappings (organization_id, event_type, conditions, priority) WHERE status = 'approved';
--> statement-breakpoint
CREATE TRIGGER accounting_event_mappings_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_event_mappings FOR EACH ROW EXECUTE FUNCTION accounting_decision_guard();
--> statement-breakpoint
CREATE TRIGGER accounting_event_mappings_no_truncate BEFORE TRUNCATE ON accounting_event_mappings FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Structural validation of a mapping. Raises a message code; returns nothing.
CREATE OR REPLACE FUNCTION accounting_mapping_validate(etype text, conds jsonb, tmt text, def jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cat record; k text; v jsonb; l jsonb; n integer := 0; dr boolean := false; cr boolean := false; acc jsonb;
BEGIN
  SELECT * INTO cat FROM accounting_event_catalog() c WHERE c.event_type = etype;
  IF NOT FOUND OR cat.reverses IS NOT NULL THEN RAISE EXCEPTION 'invalid_mapping_event'; END IF;
  IF jsonb_typeof(conds) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_mapping_conditions'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(conds) LOOP
    IF NOT (k = ANY (cat.condition_keys)) OR jsonb_typeof(v) <> 'string' OR length(v #>> '{}') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_mapping_conditions'; END IF;
    IF k = 'currency' AND v #>> '{}' NOT IN ('UGX','USD') THEN RAISE EXCEPTION 'invalid_mapping_conditions'; END IF;
    IF k = 'taxTreatment' AND v #>> '{}' NOT IN ('none','taxed') THEN RAISE EXCEPTION 'invalid_mapping_conditions'; END IF;
    IF k IN ('expenseRecognized','supplierLinked') AND v #>> '{}' NOT IN ('yes','no') THEN RAISE EXCEPTION 'invalid_mapping_conditions'; END IF;
    IF k = 'billingKind' AND v #>> '{}' NOT IN ('standard','deposit','milestone') THEN RAISE EXCEPTION 'invalid_mapping_conditions'; END IF;
    IF k = 'division' AND v #>> '{}' NOT IN ('estates','architecture','painting','interiors','tech') THEN RAISE EXCEPTION 'invalid_mapping_conditions'; END IF;
    IF k = 'method' AND v #>> '{}' NOT IN ('mobile_money','bank_transfer','cash','cheque','other') THEN RAISE EXCEPTION 'invalid_mapping_conditions'; END IF;
    IF k = 'financeAccountId' AND NOT accounting_is_uuid(v #>> '{}') THEN RAISE EXCEPTION 'invalid_mapping_conditions'; END IF;
  END LOOP;
  IF tmt = 'no_entry' THEN
    IF def <> '{}'::jsonb THEN RAISE EXCEPTION 'invalid_mapping_definition'; END IF;
    RETURN;
  END IF;
  IF tmt IS DISTINCT FROM 'journal' OR jsonb_typeof(def->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(def->'lines') NOT BETWEEN 2 AND 20 THEN RAISE EXCEPTION 'invalid_mapping_definition'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(def) x WHERE x <> 'lines') > 0 THEN RAISE EXCEPTION 'invalid_mapping_definition'; END IF;
  FOR l IN SELECT value FROM jsonb_array_elements(def->'lines') LOOP
    n := n + 1;
    IF jsonb_typeof(l) <> 'object' OR coalesce(l->>'side', '') NOT IN ('debit','credit') OR NOT (coalesce(l->>'amount', '') = ANY (cat.amount_keys)) THEN RAISE EXCEPTION 'invalid_mapping_definition'; END IF;
    IF length(coalesce(l->>'memo', '')) > 200 THEN RAISE EXCEPTION 'invalid_mapping_definition'; END IF;
    acc := l->'account';
    IF jsonb_typeof(acc) <> 'object' THEN RAISE EXCEPTION 'invalid_mapping_definition'; END IF;
    IF acc ? 'code' THEN
      IF coalesce(acc->>'code', '') !~ '^[0-9]{3,8}(-[0-9A-Z]{1,6})?$' THEN RAISE EXCEPTION 'invalid_mapping_definition'; END IF;
    ELSIF jsonb_typeof(acc->'byDivision') = 'object' THEN
      IF EXISTS (SELECT 1 FROM jsonb_each_text(acc->'byDivision') d WHERE d.key NOT IN ('estates','architecture','painting','interiors','tech') OR d.value !~ '^[0-9]{3,8}(-[0-9A-Z]{1,6})?$')
         OR (acc ? 'fallback' AND coalesce(acc->>'fallback', '') !~ '^[0-9]{3,8}(-[0-9A-Z]{1,6})?$') THEN
        RAISE EXCEPTION 'invalid_mapping_definition';
      END IF;
    ELSE RAISE EXCEPTION 'invalid_mapping_definition'; END IF;
    IF l->>'side' = 'debit' THEN dr := true; ELSE cr := true; END IF;
  END LOOP;
  IF NOT (dr AND cr) THEN RAISE EXCEPTION 'invalid_mapping_definition'; END IF;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------------------------

CREATE TABLE accounting_integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  event_type text NOT NULL CHECK (event_type IN ('invoice_issued','invoice_voided','credit_note_issued','credit_note_voided','payment_confirmed','payment_allocated',
    'refund_completed','allocation_reversed','expense_approved','disbursement_recorded','disbursement_voided','disbursement_reconciled')),
  -- Stable identity: one event per authoritative change of one source record.
  event_key text NOT NULL,
  source_table text NOT NULL CHECK (source_table IN ('invoices','credit_notes','payments','payment_allocations','payment_refunds','payment_allocation_reversals','expenses','expense_disbursements')),
  source_id uuid NOT NULL,
  schema_version text NOT NULL DEFAULT 'calacot.event/v1' CHECK (schema_version = 'calacot.event/v1'),
  occurred_at timestamptz NOT NULL,
  -- Accounting-effective date derived from the source (never changed). posting_date is set only by
  -- an authorized, recorded resolution and may only move the entry forward, never backdate it.
  effective_date date NOT NULL,
  posting_date date,
  currency text NOT NULL CHECK (currency IN ('UGX','USD')),
  amount numeric(17,2) NOT NULL CHECK (amount >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  depends_on text[] NOT NULL DEFAULT '{}',
  captured_by text NOT NULL CHECK (captured_by IN ('trigger','backfill')),
  capture_stage text NOT NULL CHECK (capture_stage IN ('isolated_test','shadow','active')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','posted','no_effect','shadowed','blocked','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code text,
  last_error_detail text,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  mapping_id uuid,
  mapping_version integer,
  policy_version integer,
  journal_id uuid,
  resolution_note text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_key),
  UNIQUE (organization_id, journal_id),
  FOREIGN KEY (organization_id, journal_id) REFERENCES accounting_journals(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, mapping_id) REFERENCES accounting_event_mappings(organization_id, id) ON DELETE RESTRICT,
  CHECK (event_key = event_type || ':' || source_id::text),
  CHECK (posting_date IS NULL OR posting_date >= effective_date),
  CHECK ((status = 'posted') = (journal_id IS NOT NULL)),
  CHECK (status NOT IN ('blocked','failed') OR last_error_code IS NOT NULL),
  CHECK (status NOT IN ('posted','no_effect','shadowed') OR processed_at IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX accounting_integration_events_queue_idx ON accounting_integration_events (organization_id, status, effective_date, seq);
--> statement-breakpoint
CREATE INDEX accounting_integration_events_source_idx ON accounting_integration_events (organization_id, source_table, source_id);
--> statement-breakpoint
CREATE INDEX accounting_integration_events_depends_idx ON accounting_integration_events USING gin (depends_on);
--> statement-breakpoint
-- Event identity and content never change; posted and no-effect outcomes are final; events are
-- never deleted (a failure is retried or resolved, never discarded).
CREATE OR REPLACE FUNCTION accounting_integration_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'integration_event_immutable'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.attempts <> 0 OR NEW.journal_id IS NOT NULL OR NEW.posting_date IS NOT NULL THEN RAISE EXCEPTION 'integration_event_immutable'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.seq, NEW.event_type, NEW.event_key, NEW.source_table, NEW.source_id, NEW.schema_version, NEW.occurred_at, NEW.effective_date,
      NEW.currency, NEW.amount, NEW.payload, NEW.depends_on, NEW.captured_by, NEW.capture_stage, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.seq, OLD.event_type, OLD.event_key, OLD.source_table, OLD.source_id, OLD.schema_version, OLD.occurred_at, OLD.effective_date,
      OLD.currency, OLD.amount, OLD.payload, OLD.depends_on, OLD.captured_by, OLD.capture_stage, OLD.created_at) THEN
    RAISE EXCEPTION 'integration_event_immutable';
  END IF;
  IF OLD.status IN ('posted','no_effect') THEN RAISE EXCEPTION 'integration_event_final'; END IF;
  IF NEW.attempts < OLD.attempts THEN RAISE EXCEPTION 'integration_event_immutable'; END IF;
  IF coalesce(current_setting('calacot.accounting_integration', true), '') <> 'on' THEN RAISE EXCEPTION 'integration_event_immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounting_integration_events_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_integration_events FOR EACH ROW EXECUTE FUNCTION accounting_integration_event_guard();
--> statement-breakpoint
CREATE TRIGGER accounting_integration_events_no_truncate BEFORE TRUNCATE ON accounting_integration_events FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Append-only processing history: every capture, attempt and resolution.
CREATE TABLE accounting_integration_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  event_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('captured','process','retry','redate','replay')),
  attempt integer NOT NULL DEFAULT 0,
  from_status text,
  to_status text,
  error_code text,
  error_detail text,
  journal_id uuid,
  mapping_id uuid,
  note text,
  actor_clerk_user_id text,
  actor_staff_id uuid,
  worker text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, event_id) REFERENCES accounting_integration_events(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, actor_staff_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX accounting_integration_attempts_event_idx ON accounting_integration_attempts (organization_id, event_id, created_at);
--> statement-breakpoint
CREATE TRIGGER accounting_integration_attempts_immutable BEFORE UPDATE OR DELETE ON accounting_integration_attempts FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER accounting_integration_attempts_no_truncate BEFORE TRUNCATE ON accounting_integration_attempts FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- A capture that failed is recorded here instead of failing the business transaction.
CREATE TABLE accounting_integration_capture_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  event_type text NOT NULL,
  source_id uuid NOT NULL,
  error_code text NOT NULL,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
--> statement-breakpoint
CREATE INDEX accounting_integration_capture_failures_idx ON accounting_integration_capture_failures (organization_id, resolved_at, created_at);
--> statement-breakpoint
-- The journal a shadow run WOULD post. Never part of the general ledger.
CREATE TABLE accounting_shadow_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  event_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 20),
  account_id uuid NOT NULL,
  account_code text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('UGX','USD')),
  debit numeric(17,2) NOT NULL DEFAULT 0,
  credit numeric(17,2) NOT NULL DEFAULT 0,
  entry_date date NOT NULL,
  reversal boolean NOT NULL DEFAULT false,
  division text,
  project_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, event_id, line_number),
  FOREIGN KEY (organization_id, event_id) REFERENCES accounting_integration_events(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_shadow_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('calacot.accounting_integration', true), '') <> 'on' THEN RAISE EXCEPTION 'integration_event_immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounting_shadow_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_shadow_lines FOR EACH ROW EXECUTE FUNCTION accounting_shadow_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Capture: build an event from the CURRENT state of its source record (same transaction).
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION accounting_kampala_date(ts timestamptz) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (ts AT TIME ZONE 'Africa/Kampala')::date;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_billing_kind(schedule uuid, purpose text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN schedule IS NULL THEN 'standard' WHEN coalesce(purpose, '') = 'initial' THEN 'deposit' ELSE 'milestone' END;
$$;
--> statement-breakpoint
-- Returns true when a new event row was created (false when it already existed).
CREATE OR REPLACE FUNCTION accounting_capture(org text, etype text, sid uuid, by_whom text, mode text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE src text; occ timestamptz; eff date; paid date; cur text; amt numeric; pl jsonb; deps text[] := '{}'; r record; inserted uuid;
BEGIN
  IF etype IN ('invoice_issued','invoice_voided') THEN
    src := 'invoices';
    SELECT i.*, p.division AS project_division INTO r FROM invoices i LEFT JOIN projects p ON p.organization_id = i.organization_id AND p.id = i.project_id WHERE i.organization_id = org AND i.id = sid;
    IF NOT FOUND OR (etype = 'invoice_issued' AND r.status NOT IN ('issued','void')) OR (etype = 'invoice_voided' AND r.status <> 'void') THEN RAISE EXCEPTION 'source_unavailable'; END IF;
    occ := CASE WHEN etype = 'invoice_issued' THEN r.issued_at ELSE r.voided_at END;
    cur := r.currency; amt := r.total;
    pl := jsonb_build_object('number', r.number, 'clientId', r.client_id, 'projectId', r.project_id, 'division', r.project_division,
      'billingKind', accounting_billing_kind(r.billing_schedule_id, r.billing_purpose), 'billingPurpose', r.billing_purpose,
      'subtotal', r.subtotal::text, 'discount', r.discount_amount::text, 'net', (r.subtotal - r.discount_amount)::text, 'tax', r.tax_amount::text, 'total', r.total::text,
      'taxTreatment', CASE WHEN r.tax_amount > 0 THEN 'taxed' ELSE 'none' END, 'issuedAt', r.issued_at);
    IF etype = 'invoice_voided' THEN pl := pl || jsonb_build_object('voidReason', r.void_reason); deps := ARRAY['invoice_issued:' || sid]; END IF;
  ELSIF etype IN ('credit_note_issued','credit_note_voided') THEN
    src := 'credit_notes';
    SELECT c.*, p.division AS project_division, i.number AS invoice_number, accounting_billing_kind(i.billing_schedule_id, i.billing_purpose) AS billing_kind INTO r
      FROM credit_notes c JOIN invoices i ON i.organization_id = c.organization_id AND i.id = c.invoice_id
      LEFT JOIN projects p ON p.organization_id = i.organization_id AND p.id = i.project_id WHERE c.organization_id = org AND c.id = sid;
    IF NOT FOUND OR (etype = 'credit_note_issued' AND r.status NOT IN ('issued','void')) OR (etype = 'credit_note_voided' AND r.status <> 'void') THEN RAISE EXCEPTION 'source_unavailable'; END IF;
    occ := CASE WHEN etype = 'credit_note_issued' THEN r.issued_at ELSE r.voided_at END;
    cur := r.currency; amt := r.total;
    pl := jsonb_build_object('number', r.number, 'invoiceId', r.invoice_id, 'invoiceNumber', r.invoice_number, 'clientId', r.client_id, 'division', r.project_division, 'billingKind', r.billing_kind,
      'subtotal', r.subtotal::text, 'discount', r.discount_amount::text, 'net', (r.subtotal - r.discount_amount)::text, 'tax', r.tax_amount::text, 'total', r.total::text,
      'taxTreatment', CASE WHEN r.tax_amount > 0 THEN 'taxed' ELSE 'none' END, 'reason', r.reason);
    deps := CASE WHEN etype = 'credit_note_issued' THEN ARRAY['invoice_issued:' || r.invoice_id] ELSE ARRAY['credit_note_issued:' || sid] END;
  ELSIF etype = 'payment_confirmed' THEN
    src := 'payments';
    SELECT * INTO r FROM payments WHERE organization_id = org AND id = sid;
    IF NOT FOUND OR r.status <> 'confirmed' THEN RAISE EXCEPTION 'source_unavailable'; END IF;
    -- Cash receipt is dated when the customer paid (received_at); staff confirmation is evidence,
    -- not proof of bank settlement.
    occ := r.received_at; cur := r.currency; amt := r.amount;
    pl := jsonb_build_object('receiptNumber', r.receipt_number, 'clientId', r.client_id, 'method', r.method, 'reference', r.reference, 'provider', r.provider,
      'receivedAt', r.received_at, 'confirmedAt', r.confirmed_at, 'amount', r.amount::text);
  ELSIF etype = 'payment_allocated' THEN
    src := 'payment_allocations';
    SELECT a.*, i.number AS invoice_number, p.division AS project_division, accounting_billing_kind(i.billing_schedule_id, i.billing_purpose) AS billing_kind, pay.receipt_number INTO r
      FROM payment_allocations a JOIN invoices i ON i.organization_id = a.organization_id AND i.id = a.invoice_id
      JOIN payments pay ON pay.organization_id = a.organization_id AND pay.id = a.payment_id
      LEFT JOIN projects p ON p.organization_id = i.organization_id AND p.id = i.project_id WHERE a.organization_id = org AND a.id = sid;
    IF NOT FOUND THEN RAISE EXCEPTION 'source_unavailable'; END IF;
    occ := r.created_at; cur := r.currency; amt := r.amount;
    pl := jsonb_build_object('paymentId', r.payment_id, 'invoiceId', r.invoice_id, 'invoiceNumber', r.invoice_number, 'receiptNumber', r.receipt_number, 'clientId', r.client_id,
      'division', r.project_division, 'billingKind', r.billing_kind, 'amount', r.amount::text);
    deps := ARRAY['payment_confirmed:' || r.payment_id, 'invoice_issued:' || r.invoice_id];
  ELSIF etype = 'refund_completed' THEN
    src := 'payment_refunds';
    SELECT * INTO r FROM payment_refunds WHERE organization_id = org AND id = sid;
    IF NOT FOUND OR r.status <> 'completed' THEN RAISE EXCEPTION 'source_unavailable'; END IF;
    occ := r.completed_at; cur := r.currency; amt := r.amount;
    pl := jsonb_build_object('paymentId', r.payment_id, 'creditNoteId', r.credit_note_id, 'clientId', r.client_id, 'reason', r.reason, 'reference', r.reference, 'amount', r.amount::text);
    deps := ARRAY['payment_confirmed:' || r.payment_id];
  ELSIF etype = 'allocation_reversed' THEN
    src := 'payment_allocation_reversals';
    SELECT x.*, f.status AS refund_status, f.completed_at, a.invoice_id, a.currency, p.division AS project_division, accounting_billing_kind(i.billing_schedule_id, i.billing_purpose) AS billing_kind INTO r
      FROM payment_allocation_reversals x JOIN payment_refunds f ON f.organization_id = x.organization_id AND f.id = x.refund_id
      JOIN payment_allocations a ON a.organization_id = x.organization_id AND a.id = x.allocation_id
      JOIN invoices i ON i.organization_id = a.organization_id AND i.id = a.invoice_id
      LEFT JOIN projects p ON p.organization_id = i.organization_id AND p.id = i.project_id WHERE x.organization_id = org AND x.id = sid;
    -- A reversal only affects balances once its refund is completed (as in the sales ledger).
    IF NOT FOUND OR r.refund_status <> 'completed' THEN RAISE EXCEPTION 'source_unavailable'; END IF;
    occ := greatest(r.completed_at, r.created_at); cur := r.currency; amt := r.amount;
    pl := jsonb_build_object('allocationId', r.allocation_id, 'refundId', r.refund_id, 'paymentId', r.payment_id, 'invoiceId', r.invoice_id, 'division', r.project_division, 'billingKind', r.billing_kind, 'amount', r.amount::text);
    deps := ARRAY['payment_allocated:' || r.allocation_id];
  ELSIF etype = 'expense_approved' THEN
    src := 'expenses';
    SELECT * INTO r FROM expenses WHERE organization_id = org AND id = sid;
    IF NOT FOUND OR r.status NOT IN ('approved','paid') OR r.approved_at IS NULL THEN RAISE EXCEPTION 'source_unavailable'; END IF;
    occ := r.approved_at; cur := r.currency; amt := r.total;
    pl := jsonb_build_object('division', r.division, 'category', lower(trim(r.category)), 'projectId', r.project_id, 'supplierId', r.supplier_id,
      'supplierLinked', CASE WHEN r.supplier_id IS NULL THEN 'no' ELSE 'yes' END, 'supplierInvoiceReference', r.supplier_invoice_reference,
      'net', r.net_amount::text, 'tax', r.tax_amount::text, 'total', r.total::text, 'taxTreatment', CASE WHEN r.tax_amount > 0 THEN 'taxed' ELSE 'none' END,
      'description', left(r.description, 200), 'incurredAt', r.incurred_at);
  ELSIF etype IN ('disbursement_recorded','disbursement_voided','disbursement_reconciled') THEN
    src := 'expense_disbursements';
    SELECT d.*, e.division, e.category, e.project_id, e.supplier_id, e.tax_amount AS expense_tax INTO r
      FROM expense_disbursements d JOIN expenses e ON e.organization_id = d.organization_id AND e.id = d.expense_id WHERE d.organization_id = org AND d.id = sid;
    IF NOT FOUND OR (etype = 'disbursement_voided' AND r.status <> 'void') OR (etype = 'disbursement_reconciled' AND r.reconciled_at IS NULL) THEN RAISE EXCEPTION 'source_unavailable'; END IF;
    cur := r.currency; amt := r.amount;
    occ := CASE etype WHEN 'disbursement_recorded' THEN r.created_at WHEN 'disbursement_voided' THEN r.voided_at ELSE r.reconciled_at END;
    pl := jsonb_build_object('expenseId', r.expense_id, 'method', r.method, 'financeAccountId', r.source_account_id, 'reference', r.reference, 'paidOn', r.paid_on,
      'division', r.division, 'category', lower(trim(r.category)), 'projectId', r.project_id, 'supplierId', r.supplier_id,
      'taxTreatment', CASE WHEN r.expense_tax > 0 THEN 'taxed' ELSE 'none' END, 'amount', r.amount::text);
    IF etype = 'disbursement_recorded' THEN deps := ARRAY['expense_approved:' || r.expense_id]; paid := r.paid_on;
    ELSE deps := ARRAY['disbursement_recorded:' || sid]; END IF;
    IF etype = 'disbursement_voided' THEN pl := pl || jsonb_build_object('voidReason', r.void_reason); END IF;
    IF etype = 'disbursement_reconciled' THEN pl := pl || jsonb_build_object('reconciliationReference', r.reconciliation_reference); END IF;
  ELSE
    RAISE EXCEPTION 'invalid_event_type';
  END IF;
  -- A disbursement is dated when the money was paid; everything else when it happened (Kampala).
  eff := coalesce(paid, accounting_kampala_date(occ));
  INSERT INTO accounting_integration_events (organization_id, event_type, event_key, source_table, source_id, occurred_at, effective_date, currency, amount, payload, depends_on, captured_by, capture_stage)
  VALUES (org, etype, etype || ':' || sid, src, sid, occ, eff, cur, amt, pl, deps, by_whom, mode)
  ON CONFLICT (organization_id, event_key) DO NOTHING RETURNING id INTO inserted;
  IF inserted IS NOT NULL THEN
    INSERT INTO accounting_integration_attempts (organization_id, event_id, action, to_status, note, worker)
    VALUES (org, inserted, 'captured', 'pending', by_whom, NULL);
  END IF;
  RETURN inserted IS NOT NULL;
END $$;
--> statement-breakpoint
-- Called by the AFTER triggers. Never fails the business transaction: an error is recorded as a
-- capture failure (shown in the exception workspace and recovered by backfill).
CREATE OR REPLACE FUNCTION accounting_capture_safely(org text, etype text, sid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE st text := accounting_integration_stage(org); msg text;
BEGIN
  IF st = 'disabled' THEN RETURN; END IF;
  BEGIN
    PERFORM accounting_capture(org, etype, sid, 'trigger', st);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    INSERT INTO accounting_integration_capture_failures (organization_id, event_type, source_id, error_code, error_detail)
    VALUES (org, etype, sid, left(msg, 100), left(msg, 1000));
  END;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_capture_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE x record;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    IF NEW.status = 'issued' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'issued') THEN PERFORM accounting_capture_safely(NEW.organization_id, 'invoice_issued', NEW.id); END IF;
    IF TG_OP = 'UPDATE' AND NEW.status = 'void' AND OLD.status = 'issued' THEN PERFORM accounting_capture_safely(NEW.organization_id, 'invoice_voided', NEW.id); END IF;
  ELSIF TG_TABLE_NAME = 'credit_notes' THEN
    IF NEW.status = 'issued' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'issued') THEN PERFORM accounting_capture_safely(NEW.organization_id, 'credit_note_issued', NEW.id); END IF;
    IF TG_OP = 'UPDATE' AND NEW.status = 'void' AND OLD.status = 'issued' THEN PERFORM accounting_capture_safely(NEW.organization_id, 'credit_note_voided', NEW.id); END IF;
  ELSIF TG_TABLE_NAME = 'payments' THEN
    IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN PERFORM accounting_capture_safely(NEW.organization_id, 'payment_confirmed', NEW.id); END IF;
  ELSIF TG_TABLE_NAME = 'payment_allocations' THEN
    PERFORM accounting_capture_safely(NEW.organization_id, 'payment_allocated', NEW.id);
  ELSIF TG_TABLE_NAME = 'payment_refunds' THEN
    IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
      PERFORM accounting_capture_safely(NEW.organization_id, 'refund_completed', NEW.id);
      FOR x IN SELECT id FROM payment_allocation_reversals WHERE organization_id = NEW.organization_id AND refund_id = NEW.id LOOP
        PERFORM accounting_capture_safely(NEW.organization_id, 'allocation_reversed', x.id);
      END LOOP;
    END IF;
  ELSIF TG_TABLE_NAME = 'payment_allocation_reversals' THEN
    IF EXISTS (SELECT 1 FROM payment_refunds WHERE organization_id = NEW.organization_id AND id = NEW.refund_id AND status = 'completed') THEN
      PERFORM accounting_capture_safely(NEW.organization_id, 'allocation_reversed', NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'expenses' THEN
    -- Approval is captured so the accountant's recognition policy can act on it; with no approved
    -- recognition mapping it has no accounting effect.
    IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status = 'submitted' THEN PERFORM accounting_capture_safely(NEW.organization_id, 'expense_approved', NEW.id); END IF;
  ELSIF TG_TABLE_NAME = 'expense_disbursements' THEN
    IF TG_OP = 'INSERT' THEN PERFORM accounting_capture_safely(NEW.organization_id, 'disbursement_recorded', NEW.id);
    ELSE
      IF NEW.status = 'void' AND OLD.status = 'recorded' THEN PERFORM accounting_capture_safely(NEW.organization_id, 'disbursement_voided', NEW.id); END IF;
      IF NEW.reconciled_at IS NOT NULL AND OLD.reconciled_at IS NULL THEN PERFORM accounting_capture_safely(NEW.organization_id, 'disbursement_reconciled', NEW.id); END IF;
    END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounting_capture_invoices AFTER INSERT OR UPDATE OF status ON invoices FOR EACH ROW EXECUTE FUNCTION accounting_capture_trigger();
--> statement-breakpoint
CREATE TRIGGER accounting_capture_credit_notes AFTER INSERT OR UPDATE OF status ON credit_notes FOR EACH ROW EXECUTE FUNCTION accounting_capture_trigger();
--> statement-breakpoint
CREATE TRIGGER accounting_capture_payments AFTER INSERT OR UPDATE OF status ON payments FOR EACH ROW EXECUTE FUNCTION accounting_capture_trigger();
--> statement-breakpoint
CREATE TRIGGER accounting_capture_payment_allocations AFTER INSERT ON payment_allocations FOR EACH ROW EXECUTE FUNCTION accounting_capture_trigger();
--> statement-breakpoint
CREATE TRIGGER accounting_capture_payment_refunds AFTER INSERT OR UPDATE OF status ON payment_refunds FOR EACH ROW EXECUTE FUNCTION accounting_capture_trigger();
--> statement-breakpoint
CREATE TRIGGER accounting_capture_allocation_reversals AFTER INSERT ON payment_allocation_reversals FOR EACH ROW EXECUTE FUNCTION accounting_capture_trigger();
--> statement-breakpoint
CREATE TRIGGER accounting_capture_expenses AFTER UPDATE OF status ON expenses FOR EACH ROW EXECUTE FUNCTION accounting_capture_trigger();
--> statement-breakpoint
CREATE TRIGGER accounting_capture_disbursements AFTER INSERT OR UPDATE OF status, reconciled_at ON expense_disbursements FOR EACH ROW EXECUTE FUNCTION accounting_capture_trigger();
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Phase 2A guards, updated: system journals and their reversals pass only through the integration
-- gate. Manual journal rules are unchanged.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION accounting_journal_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'draft' OR NEW.number IS NOT NULL OR NEW.approved_by_id IS NOT NULL OR NEW.submitted_by_id IS NOT NULL OR NEW.period_id IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_journal_transition';
  END IF;
  IF NEW.journal_type = 'system' AND NOT accounting_integration_posting_allowed(NEW.organization_id) THEN
    RAISE EXCEPTION 'automatic_posting_disabled';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_journal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pol accounting_policy_versions; per accounting_periods; n integer; cnt integer; dr numeric; cr numeric; currencies integer; orig_type text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '%', CASE WHEN OLD.status = 'posted' THEN 'posted_journal_immutable' ELSE 'journal_delete_denied' END;
  END IF;
  IF OLD.status = 'posted' THEN RAISE EXCEPTION 'posted_journal_immutable'; END IF;
  IF OLD.status IN ('rejected','discarded') THEN RAISE EXCEPTION 'invalid_journal_transition'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.journal_type, NEW.prepared_by_id, NEW.prepared_at, NEW.idempotency_key, NEW.reverses_journal_id, NEW.reversal_reason, NEW.source_type, NEW.source_id, NEW.source_event, NEW.posting_rule_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.journal_type, OLD.prepared_by_id, OLD.prepared_at, OLD.idempotency_key, OLD.reverses_journal_id, OLD.reversal_reason, OLD.source_type, OLD.source_id, OLD.source_event, OLD.posting_rule_id, OLD.created_at) THEN
    RAISE EXCEPTION 'journal_identity_immutable';
  END IF;
  IF NOT (OLD.status = 'draft' AND NEW.status = 'draft')
     AND (NEW.entry_date, NEW.description, NEW.reference) IS DISTINCT FROM (OLD.entry_date, OLD.description, OLD.reference) THEN
    RAISE EXCEPTION 'journal_not_editable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'draft' AND NEW.status IN ('submitted','discarded') AND OLD.journal_type = 'manual')
    OR (OLD.status = 'submitted' AND NEW.status IN ('draft','approved','rejected'))
    OR (OLD.status = 'approved' AND NEW.status IN ('draft','posted'))
    OR (OLD.status = 'draft' AND NEW.status = 'posted' AND OLD.journal_type IN ('reversal','system'))) THEN
    RAISE EXCEPTION 'invalid_journal_transition';
  END IF;
  IF NEW.status <> 'posted' THEN
    IF NEW.period_id IS NOT NULL OR NEW.number IS NOT NULL THEN RAISE EXCEPTION 'invalid_journal_transition'; END IF;
    RETURN NEW;
  END IF;

  -- Transition to posted.
  pol := accounting_policy(OLD.organization_id);
  IF pol.id IS NULL THEN RAISE EXCEPTION 'accounting_policy_required'; END IF;
  IF OLD.journal_type = 'reversal' THEN
    SELECT journal_type INTO orig_type FROM accounting_journals WHERE organization_id = OLD.organization_id AND id = OLD.reverses_journal_id;
  END IF;
  IF OLD.journal_type = 'system' OR orig_type = 'system' THEN
    -- Automatic entries and their corrections come only from the integration worker, in the
    -- isolated-test stage, on a test database, for a captured source event.
    IF NOT accounting_integration_posting_allowed(OLD.organization_id) THEN
      RAISE EXCEPTION '%', CASE WHEN OLD.journal_type = 'system' THEN 'automatic_posting_disabled' ELSE 'system_journal_reversal_denied' END;
    END IF;
    IF OLD.journal_type = 'system' AND NOT EXISTS (SELECT 1 FROM accounting_integration_events WHERE organization_id = OLD.organization_id AND event_key = OLD.source_event
       AND event_type = OLD.source_type AND source_id::text = OLD.source_id AND status <> 'posted') THEN
      RAISE EXCEPTION 'source_event_required';
    END IF;
  ELSE
    IF OLD.journal_type = 'manual' THEN
      IF OLD.approved_version IS DISTINCT FROM OLD.version OR NEW.approved_by_id IS DISTINCT FROM OLD.approved_by_id THEN RAISE EXCEPTION 'stale_approval'; END IF;
      IF NOT EXISTS (SELECT 1 FROM staff_memberships WHERE organization_id = OLD.organization_id AND id = OLD.approved_by_id AND status = 'active') THEN
        RAISE EXCEPTION 'stale_approval';
      END IF;
    END IF;
    IF NOT pol.manual_posting_enabled THEN RAISE EXCEPTION 'posting_disabled'; END IF;
  END IF;
  SELECT * INTO per FROM accounting_periods WHERE organization_id = OLD.organization_id AND OLD.entry_date BETWEEN start_date AND end_date FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'period_missing'; END IF;
  IF per.status <> 'open' THEN RAISE EXCEPTION 'period_closed'; END IF;
  SELECT count(*), coalesce(sum(l.functional_debit), 0), coalesce(sum(l.functional_credit), 0), count(DISTINCT l.currency)
    INTO cnt, dr, cr, currencies
    FROM accounting_journal_lines l WHERE l.organization_id = OLD.organization_id AND l.journal_id = OLD.id;
  IF cnt < 2 THEN RAISE EXCEPTION 'journal_lines_required'; END IF;
  IF dr <> cr OR dr <= 0 THEN RAISE EXCEPTION 'journal_unbalanced'; END IF;
  IF EXISTS (SELECT 1 FROM accounting_journal_lines WHERE organization_id = OLD.organization_id AND journal_id = OLD.id GROUP BY currency HAVING sum(debit) <> sum(credit)) THEN
    RAISE EXCEPTION 'journal_unbalanced';
  END IF;
  IF EXISTS (SELECT 1 FROM accounting_journal_lines WHERE organization_id = OLD.organization_id AND journal_id = OLD.id AND (currency <> pol.functional_currency OR exchange_rate_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'multi_currency_posting_disabled';
  END IF;
  PERFORM 1 FROM accounting_accounts a
    WHERE a.organization_id = OLD.organization_id AND a.id IN (SELECT account_id FROM accounting_journal_lines WHERE organization_id = OLD.organization_id AND journal_id = OLD.id)
    ORDER BY a.id FOR SHARE;
  IF EXISTS (SELECT 1 FROM accounting_journal_lines l JOIN accounting_accounts a ON a.organization_id = l.organization_id AND a.id = l.account_id
             WHERE l.organization_id = OLD.organization_id AND l.journal_id = OLD.id AND (a.status <> 'active' OR NOT a.is_postable)) THEN
    RAISE EXCEPTION 'account_not_active';
  END IF;
  IF OLD.journal_type = 'reversal' THEN
    IF NOT EXISTS (SELECT 1 FROM accounting_journals WHERE organization_id = OLD.organization_id AND id = OLD.reverses_journal_id AND status = 'posted' AND journal_type <> 'reversal' AND entry_date <= OLD.entry_date)
       OR EXISTS (
         (SELECT account_id, currency, division, project_id, debit, credit, functional_debit, functional_credit FROM accounting_journal_lines WHERE organization_id = OLD.organization_id AND journal_id = OLD.id
          EXCEPT ALL
          SELECT account_id, currency, division, project_id, credit, debit, functional_credit, functional_debit FROM accounting_journal_lines WHERE organization_id = OLD.organization_id AND journal_id = OLD.reverses_journal_id)
         UNION ALL
         (SELECT account_id, currency, division, project_id, credit, debit, functional_credit, functional_debit FROM accounting_journal_lines WHERE organization_id = OLD.organization_id AND journal_id = OLD.reverses_journal_id
          EXCEPT ALL
          SELECT account_id, currency, division, project_id, debit, credit, functional_debit, functional_credit FROM accounting_journal_lines WHERE organization_id = OLD.organization_id AND journal_id = OLD.id)) THEN
      RAISE EXCEPTION 'invalid_reversal';
    END IF;
  END IF;
  INSERT INTO accounting_counters (organization_id, series, fiscal_year, next_value) VALUES (OLD.organization_id, 'JE', per.fiscal_year, 2)
  ON CONFLICT (organization_id, series, fiscal_year) DO UPDATE SET next_value = accounting_counters.next_value + 1, updated_at = now()
  RETURNING next_value - 1 INTO n;
  NEW.number := 'JE-' || per.fiscal_year || '-' || lpad(n::text, 6, '0');
  NEW.period_id := per.id;
  NEW.fiscal_year := per.fiscal_year;
  NEW.functional_currency := pol.functional_currency;
  NEW.total_debit := dr;
  NEW.total_credit := cr;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Processing
-- ---------------------------------------------------------------------------------------------

-- Codes that mean "needs attention" (blocked). Anything else is an unexpected failure.
CREATE OR REPLACE FUNCTION accounting_integration_blocking_codes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['mapping_missing','mapping_ambiguous','mapping_account_missing','mapping_unbalanced','tax_treatment_unapproved','fx_policy_unapproved',
    'accounting_policy_required','period_missing','period_closed','account_not_active','account_not_postable','account_currency_mismatch',
    'dependency_pending','dependency_blocked','dependency_missing','reversal_date_before_original','journal_unbalanced','journal_lines_required',
    'multi_currency_posting_disabled','automatic_posting_disabled','isolated_test_requires_test_database','source_unavailable','original_not_posted',
    'integration_disabled','project_division_mismatch'];
$$;
--> statement-breakpoint
-- Applies one event. Returns {status, journalId?, mappingId?, mappingVersion?, policyVersion?}.
-- Raises a blocking code when the event cannot be applied safely; never guesses an account.
CREATE OR REPLACE FUNCTION accounting_integration_apply(org text, actor text, staff uuid, ev accounting_integration_events, st text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  cat record; pol accounting_policy_versions; dep text; dst text; facts jsonb; m accounting_event_mappings; best_spec integer; ties integer;
  pdate date := coalesce(ev.posting_date, ev.effective_date); per accounting_periods; l jsonb; acc jsonb; acode text; aid uuid; amt numeric;
  n integer := 0; dr numeric := 0; cr numeric := 0; lines jsonb := '[]'::jsonb; jid uuid; orig accounting_integration_events; rev jsonb; recognized text := NULL;
  tax numeric; descr text; x jsonb; a accounting_accounts;
BEGIN
  SELECT * INTO cat FROM accounting_event_catalog() c WHERE c.event_type = ev.event_type;
  -- 1. Dependencies: earlier events for the same records must be resolved first.
  FOREACH dep IN ARRAY ev.depends_on LOOP
    SELECT status INTO dst FROM accounting_integration_events WHERE organization_id = org AND event_key = dep;
    IF NOT FOUND THEN RAISE EXCEPTION 'dependency_missing'; END IF;
    IF dst = 'pending' OR (dst = 'shadowed' AND st <> 'shadow') THEN RAISE EXCEPTION 'dependency_pending'; END IF;
    IF dst IN ('blocked','failed') THEN RAISE EXCEPTION 'dependency_blocked'; END IF;
    IF ev.event_type = 'disbursement_recorded' AND dep LIKE 'expense_approved:%' THEN recognized := CASE WHEN dst IN ('posted','shadowed') THEN 'yes' ELSE 'no' END; END IF;
  END LOOP;
  -- 2. Policy and currency. Nothing is converted: only functional-currency events can post.
  pol := accounting_policy(org);
  IF pol.id IS NULL THEN RAISE EXCEPTION 'accounting_policy_required'; END IF;
  IF ev.currency <> pol.functional_currency THEN RAISE EXCEPTION 'fx_policy_unapproved'; END IF;
  -- 3. Period: never backdate into a closed period, never invent one.
  SELECT * INTO per FROM accounting_periods WHERE organization_id = org AND pdate BETWEEN start_date AND end_date;
  IF NOT FOUND THEN RAISE EXCEPTION 'period_missing'; END IF;
  IF per.status <> 'open' THEN RAISE EXCEPTION 'period_closed'; END IF;

  -- 4a. Corrections reverse the original entry exactly (never an edit, never a new guess).
  IF cat.reverses IS NOT NULL THEN
    SELECT * INTO orig FROM accounting_integration_events WHERE organization_id = org AND event_key = ev.depends_on[1];
    IF orig.status = 'no_effect' THEN RETURN jsonb_build_object('status', 'no_effect', 'reason', 'original_had_no_effect'); END IF;
    IF st = 'shadow' THEN
      IF orig.status <> 'shadowed' THEN RAISE EXCEPTION 'original_not_posted'; END IF;
      DELETE FROM accounting_shadow_lines WHERE organization_id = org AND event_id = ev.id;
      INSERT INTO accounting_shadow_lines (organization_id, event_id, line_number, account_id, account_code, currency, debit, credit, entry_date, reversal, division, project_id)
      SELECT org, ev.id, line_number, account_id, account_code, currency, credit, debit, pdate, true, division, project_id FROM accounting_shadow_lines WHERE organization_id = org AND event_id = orig.id;
      RETURN jsonb_build_object('status', 'shadowed', 'policyVersion', pol.version);
    END IF;
    IF orig.status <> 'posted' THEN RAISE EXCEPTION 'original_not_posted'; END IF;
    IF NOT accounting_integration_posting_allowed(org) THEN RAISE EXCEPTION 'isolated_test_requires_test_database'; END IF;
    rev := accounting_journal_reverse(org, actor, orig.journal_id, jsonb_build_object('key', 'integration:' || ev.event_key, 'entryDate', pdate,
      'reason', left('Source correction ' || ev.event_type || ' ' || coalesce(ev.payload->>'number', ev.source_id::text), 300)), correlation);
    RETURN jsonb_build_object('status', 'posted', 'journalId', rev->>'id', 'policyVersion', pol.version);
  END IF;

  -- 4b. Mapping resolution: the most specific approved mapping whose conditions all match.
  facts := ev.payload || jsonb_build_object('currency', ev.currency);
  IF recognized IS NOT NULL THEN facts := facts || jsonb_build_object('expenseRecognized', recognized); END IF;
  SELECT max(c.spec) INTO best_spec FROM (
    SELECT (SELECT count(*) FROM jsonb_object_keys(mm.conditions))::integer AS spec FROM accounting_event_mappings mm
    WHERE mm.organization_id = org AND mm.event_type = ev.event_type AND mm.status = 'approved' AND mm.effective_from <= pdate
      AND (mm.policy_version IS NULL OR mm.policy_version = pol.version) AND facts @> mm.conditions) c;
  IF best_spec IS NULL THEN
    IF cat.requires_mapping THEN RAISE EXCEPTION 'mapping_missing'; END IF;
    -- Approval and evidence events have no accounting effect unless a policy says otherwise.
    RETURN jsonb_build_object('status', 'no_effect', 'reason', 'no_recognition_policy', 'policyVersion', pol.version);
  END IF;
  SELECT * INTO m FROM accounting_event_mappings mm
  WHERE mm.organization_id = org AND mm.event_type = ev.event_type AND mm.status = 'approved' AND mm.effective_from <= pdate
    AND (mm.policy_version IS NULL OR mm.policy_version = pol.version) AND facts @> mm.conditions
    AND (SELECT count(*) FROM jsonb_object_keys(mm.conditions)) = best_spec
  ORDER BY mm.priority DESC LIMIT 1;
  SELECT count(*) INTO ties FROM accounting_event_mappings mm
  WHERE mm.organization_id = org AND mm.event_type = ev.event_type AND mm.status = 'approved' AND mm.effective_from <= pdate
    AND (mm.policy_version IS NULL OR mm.policy_version = pol.version) AND facts @> mm.conditions
    AND (SELECT count(*) FROM jsonb_object_keys(mm.conditions)) = best_spec AND mm.priority = m.priority;
  IF ties > 1 THEN RAISE EXCEPTION 'mapping_ambiguous'; END IF;
  -- Taxed documents need a mapping the accountant approved specifically for taxed items.
  IF cat.taxable AND facts->>'taxTreatment' = 'taxed' AND NOT (m.conditions ? 'taxTreatment') THEN RAISE EXCEPTION 'tax_treatment_unapproved'; END IF;
  IF m.treatment = 'no_entry' THEN
    RETURN jsonb_build_object('status', 'no_effect', 'reason', 'mapping_no_entry', 'mappingId', m.id, 'mappingVersion', m.version, 'policyVersion', pol.version);
  END IF;

  -- 5. Build the lines.
  FOR l IN SELECT value FROM jsonb_array_elements(m.definition->'lines') LOOP
    amt := CASE WHEN l->>'amount' = 'amount' THEN ev.amount ELSE (ev.payload->>(l->>'amount'))::numeric END;
    IF amt IS NULL OR amt < 0 THEN RAISE EXCEPTION 'mapping_unbalanced'; END IF;
    CONTINUE WHEN amt = 0;
    acc := l->'account';
    acode := CASE WHEN acc ? 'code' THEN acc->>'code' ELSE coalesce(acc->'byDivision'->>(ev.payload->>'division'), acc->>'fallback') END;
    IF acode IS NULL THEN RAISE EXCEPTION 'mapping_account_missing'; END IF;
    SELECT * INTO a FROM accounting_accounts WHERE organization_id = org AND accounting_accounts.code = acode;
    IF NOT FOUND THEN RAISE EXCEPTION 'mapping_account_missing'; END IF;
    IF a.status <> 'active' THEN RAISE EXCEPTION 'account_not_active'; END IF;
    IF NOT a.is_postable THEN RAISE EXCEPTION 'account_not_postable'; END IF;
    IF a.currency IS NOT NULL AND a.currency <> ev.currency THEN RAISE EXCEPTION 'account_currency_mismatch'; END IF;
    n := n + 1;
    lines := lines || jsonb_build_object('n', n, 'accountId', a.id, 'code', a.code, 'side', l->>'side', 'amount', amt::text, 'memo', l->>'memo');
    IF l->>'side' = 'debit' THEN dr := dr + amt; ELSE cr := cr + amt; END IF;
  END LOOP;
  IF n < 2 OR dr <> cr OR dr <= 0 THEN RAISE EXCEPTION 'mapping_unbalanced'; END IF;
  descr := left(initcap(replace(ev.event_type, '_', ' ')) || ' ' || coalesce(ev.payload->>'number', ev.payload->>'receiptNumber', ev.payload->>'invoiceNumber', ev.source_id::text), 500);

  IF st = 'shadow' THEN
    DELETE FROM accounting_shadow_lines WHERE organization_id = org AND event_id = ev.id;
    FOR x IN SELECT value FROM jsonb_array_elements(lines) LOOP
      INSERT INTO accounting_shadow_lines (organization_id, event_id, line_number, account_id, account_code, currency, debit, credit, entry_date, division, project_id)
      VALUES (org, ev.id, (x->>'n')::integer, (x->>'accountId')::uuid, x->>'code', ev.currency,
        CASE WHEN x->>'side' = 'debit' THEN (x->>'amount')::numeric ELSE 0 END, CASE WHEN x->>'side' = 'credit' THEN (x->>'amount')::numeric ELSE 0 END,
        pdate, ev.payload->>'division', nullif(ev.payload->>'projectId', '')::uuid);
    END LOOP;
    RETURN jsonb_build_object('status', 'shadowed', 'mappingId', m.id, 'mappingVersion', m.version, 'policyVersion', pol.version);
  END IF;

  -- 6. Post a system journal. The Phase 2A posting gate re-checks everything.
  IF NOT accounting_integration_posting_allowed(org) THEN RAISE EXCEPTION 'isolated_test_requires_test_database'; END IF;
  INSERT INTO accounting_journals (organization_id, journal_type, status, entry_date, description, reference, source_type, source_id, source_event, prepared_by_id, idempotency_key)
  VALUES (org, 'system', 'draft', pdate, descr, left(coalesce(ev.payload->>'number', ev.payload->>'receiptNumber', ev.payload->>'invoiceNumber'), 100),
    ev.event_type, ev.source_id::text, ev.event_key, staff, 'integration:' || ev.event_key) RETURNING id INTO jid;
  FOR x IN SELECT value FROM jsonb_array_elements(lines) LOOP
    INSERT INTO accounting_journal_lines (organization_id, journal_id, line_number, account_id, description, currency, debit, credit, functional_debit, functional_credit, division, project_id)
    VALUES (org, jid, (x->>'n')::integer, (x->>'accountId')::uuid, nullif(x->>'memo', ''), ev.currency,
      CASE WHEN x->>'side' = 'debit' THEN (x->>'amount')::numeric ELSE 0 END, CASE WHEN x->>'side' = 'credit' THEN (x->>'amount')::numeric ELSE 0 END,
      CASE WHEN x->>'side' = 'debit' THEN (x->>'amount')::numeric ELSE 0 END, CASE WHEN x->>'side' = 'credit' THEN (x->>'amount')::numeric ELSE 0 END,
      ev.payload->>'division',
      -- The project dimension is kept only when it agrees with the source division.
      (SELECT p.id FROM projects p WHERE p.organization_id = org AND p.id = nullif(ev.payload->>'projectId', '')::uuid AND p.division = coalesce(ev.payload->>'division', p.division)));
  END LOOP;
  UPDATE accounting_journals SET status = 'posted', posted_by_id = staff, posted_at = now(), version = version + 1, updated_at = now() WHERE organization_id = org AND id = jid;
  PERFORM accounting_event(org, 'journal', jid::text, actor, staff, 'posted', NULL, 'posted', 2, NULL,
    jsonb_build_object('source', ev.event_key, 'mappingId', m.id, 'mappingVersion', m.version, 'policyVersion', pol.version), NULL, correlation);
  RETURN jsonb_build_object('status', 'posted', 'journalId', jid, 'mappingId', m.id, 'mappingVersion', m.version, 'policyVersion', pol.version);
END $$;
--> statement-breakpoint
-- The worker. One call is one transaction. Overlapping workers claim disjoint events (SKIP
-- LOCKED); a crash before commit leaves the events pending with no journal; the unique source
-- identity on journals makes a second posting of the same event impossible.
CREATE OR REPLACE FUNCTION accounting_integration_process(org text, actor text, max_events integer, worker text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); st text := accounting_integration_stage(org); ev accounting_integration_events; outcome jsonb; msg text; sstate text;
  code text; target text; counts jsonb := '{}'::jsonb; jid uuid; claimed integer := 0; retry_at timestamptz;
BEGIN
  IF st = 'disabled' THEN RAISE EXCEPTION 'integration_disabled'; END IF;
  IF st = 'isolated_test' AND NOT accounting_integration_test_database() THEN RAISE EXCEPTION 'isolated_test_requires_test_database'; END IF;
  IF max_events IS NULL OR max_events NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_batch_size'; END IF;
  PERFORM set_config('calacot.accounting_integration', 'on', true);
  FOR ev IN SELECT * FROM accounting_integration_events
            WHERE organization_id = org AND (status = 'pending' OR (status IN ('blocked','failed') AND next_attempt_at IS NOT NULL AND next_attempt_at <= now()))
            ORDER BY coalesce(posting_date, effective_date), seq LIMIT max_events FOR UPDATE SKIP LOCKED LOOP
    claimed := claimed + 1;
    outcome := NULL; code := NULL; msg := NULL; jid := NULL; retry_at := NULL;
    BEGIN
      outcome := accounting_integration_apply(org, actor, staff, ev, st, correlation);
      target := outcome->>'status';
      jid := nullif(outcome->>'journalId', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT, sstate = RETURNED_SQLSTATE;
      IF sstate = 'P0001' AND msg = ANY (accounting_integration_blocking_codes()) THEN
        code := msg; target := 'blocked';
        -- Waiting on an earlier event resolves itself: retry on the next run.
        IF code = 'dependency_pending' THEN retry_at := now(); END IF;
      ELSE
        code := CASE WHEN sstate = 'P0001' THEN left(msg, 100) ELSE 'unexpected_error' END; target := 'failed';
        -- Unexpected failures are retried with backoff (1, 2, 4, 8 minutes), then need a person.
        IF ev.attempts + 1 < 5 THEN retry_at := now() + make_interval(mins => power(2, ev.attempts)::integer); END IF;
      END IF;
    END;
    UPDATE accounting_integration_events SET status = target, attempts = attempts + 1, last_attempt_at = now(), next_attempt_at = retry_at,
      last_error_code = code, last_error_detail = CASE WHEN target = 'failed' THEN left(msg, 1000) ELSE NULL END,
      journal_id = jid, mapping_id = nullif(outcome->>'mappingId', '')::uuid, mapping_version = nullif(outcome->>'mappingVersion', '')::integer,
      policy_version = coalesce(nullif(outcome->>'policyVersion', '')::integer, policy_version),
      processed_at = CASE WHEN target IN ('posted','no_effect','shadowed') THEN now() ELSE processed_at END,
      resolution_note = CASE WHEN target = 'no_effect' THEN outcome->>'reason' ELSE resolution_note END, updated_at = now()
    WHERE organization_id = org AND id = ev.id;
    INSERT INTO accounting_integration_attempts (organization_id, event_id, action, attempt, from_status, to_status, error_code, error_detail, journal_id, mapping_id, actor_clerk_user_id, actor_staff_id, worker, correlation_id)
    VALUES (org, ev.id, 'process', ev.attempts + 1, ev.status, target, code, CASE WHEN target = 'failed' THEN left(msg, 1000) ELSE NULL END, jid, nullif(outcome->>'mappingId', '')::uuid, actor, staff, worker, correlation);
    -- Events that were waiting on this one become retryable now.
    IF target IN ('posted','no_effect','shadowed') THEN
      UPDATE accounting_integration_events SET next_attempt_at = now(), updated_at = now()
      WHERE organization_id = org AND status = 'blocked' AND last_error_code IN ('dependency_blocked','dependency_pending') AND depends_on @> ARRAY[ev.event_key];
    END IF;
    counts := jsonb_set(counts, ARRAY[target], to_jsonb(coalesce((counts->>target)::integer, 0) + 1));
  END LOOP;
  PERFORM set_config('calacot.accounting_integration', '', true);
  RETURN jsonb_build_object('stage', st, 'claimed', claimed, 'outcomes', counts);
END $$;
--> statement-breakpoint
-- Authorized resolutions. 'retry' re-queues a blocked or failed event (after its cause is fixed);
-- 'redate' moves an event blocked by a closed or missing period FORWARD into an open period, with
-- a recorded reason. Nothing is ever discarded.
CREATE OR REPLACE FUNCTION accounting_integration_event_command(org text, actor text, eid uuid, cmd text, p jsonb, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); ev accounting_integration_events; reason text := trim(coalesce(p->>'reason', '')); d date; per accounting_periods;
BEGIN
  IF cmd NOT IN ('retry','redate') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO ev FROM accounting_integration_events WHERE organization_id = org AND id = eid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'integration_event_unavailable'; END IF;
  IF accounting_replay(org, key, 'integration_event', eid::text, cmd) THEN RETURN jsonb_build_object('id', eid, 'status', ev.status, 'already', true); END IF;
  IF ev.status NOT IN ('blocked','failed') THEN RAISE EXCEPTION 'integration_event_not_blocked'; END IF;
  IF length(reason) > 500 THEN RAISE EXCEPTION 'note_too_long'; END IF;
  PERFORM set_config('calacot.accounting_integration', 'on', true);
  IF cmd = 'redate' THEN
    IF ev.last_error_code NOT IN ('period_closed','period_missing','reversal_date_before_original') THEN RAISE EXCEPTION 'redate_not_applicable'; END IF;
    IF length(reason) < 5 THEN RAISE EXCEPTION 'redate_reason_required'; END IF;
    IF coalesce(p->>'postingDate', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_entry_date'; END IF;
    d := (p->>'postingDate')::date;
    IF d < ev.effective_date THEN RAISE EXCEPTION 'backdating_denied'; END IF;
    SELECT * INTO per FROM accounting_periods WHERE organization_id = org AND d BETWEEN start_date AND end_date;
    IF NOT FOUND OR per.status <> 'open' THEN RAISE EXCEPTION 'period_closed'; END IF;
    UPDATE accounting_integration_events SET posting_date = d, status = 'pending', next_attempt_at = NULL, resolution_note = reason, updated_at = now() WHERE organization_id = org AND id = eid;
  ELSE
    UPDATE accounting_integration_events SET status = 'pending', next_attempt_at = NULL, updated_at = now() WHERE organization_id = org AND id = eid;
  END IF;
  INSERT INTO accounting_integration_attempts (organization_id, event_id, action, attempt, from_status, to_status, error_code, note, actor_clerk_user_id, actor_staff_id, correlation_id)
  VALUES (org, eid, cmd, ev.attempts, ev.status, 'pending', ev.last_error_code, nullif(reason, '') || CASE WHEN cmd = 'redate' THEN ' (posting date ' || d || ')' ELSE '' END, actor, staff, correlation);
  PERFORM accounting_event(org, 'integration_event', eid::text, actor, staff, cmd, ev.status, 'pending', NULL, nullif(reason, ''),
    jsonb_build_object('eventKey', ev.event_key, 'errorCode', ev.last_error_code, 'postingDate', d), key, correlation);
  PERFORM set_config('calacot.accounting_integration', '', true);
  RETURN jsonb_build_object('id', eid, 'status', 'pending', 'already', false);
END $$;
--> statement-breakpoint
-- Enqueues events for existing records (approved historical data, or recovery after a capture
-- failure). Idempotent: each event key is created at most once.
CREATE OR REPLACE FUNCTION accounting_integration_backfill(org text, actor text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); st text := accounting_integration_stage(org); x record; created integer := 0; mode text;
BEGIN
  IF st = 'disabled' THEN RAISE EXCEPTION 'integration_disabled'; END IF;
  IF accounting_replay(org, key, 'integration_setting', org, 'backfill') THEN RETURN jsonb_build_object('created', 0, 'already', true); END IF;
  mode := st;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':accounting_backfill', 0));
  FOR x IN
    SELECT 1 AS o, 'invoice_issued' AS t, id, issued_at AS at FROM invoices WHERE organization_id = org AND status IN ('issued','void')
    UNION ALL SELECT 2, 'invoice_voided', id, voided_at FROM invoices WHERE organization_id = org AND status = 'void' AND issued_at IS NOT NULL
    UNION ALL SELECT 1, 'credit_note_issued', id, issued_at FROM credit_notes WHERE organization_id = org AND status IN ('issued','void')
    UNION ALL SELECT 2, 'credit_note_voided', id, voided_at FROM credit_notes WHERE organization_id = org AND status = 'void' AND issued_at IS NOT NULL
    UNION ALL SELECT 1, 'payment_confirmed', id, confirmed_at FROM payments WHERE organization_id = org AND status = 'confirmed'
    UNION ALL SELECT 2, 'payment_allocated', id, created_at FROM payment_allocations WHERE organization_id = org
    UNION ALL SELECT 3, 'refund_completed', id, completed_at FROM payment_refunds WHERE organization_id = org AND status = 'completed'
    UNION ALL SELECT 3, 'allocation_reversed', r.id, r.created_at FROM payment_allocation_reversals r JOIN payment_refunds f ON f.organization_id = r.organization_id AND f.id = r.refund_id WHERE r.organization_id = org AND f.status = 'completed'
    UNION ALL SELECT 1, 'expense_approved', id, approved_at FROM expenses WHERE organization_id = org AND status IN ('approved','paid') AND approved_at IS NOT NULL
    UNION ALL SELECT 2, 'disbursement_recorded', id, created_at FROM expense_disbursements WHERE organization_id = org
    UNION ALL SELECT 3, 'disbursement_voided', id, voided_at FROM expense_disbursements WHERE organization_id = org AND status = 'void'
    UNION ALL SELECT 3, 'disbursement_reconciled', id, reconciled_at FROM expense_disbursements WHERE organization_id = org AND reconciled_at IS NOT NULL
    ORDER BY 4, 1
  LOOP
    IF accounting_capture(org, x.t, x.id, 'backfill', mode) THEN created := created + 1; END IF;
  END LOOP;
  UPDATE accounting_integration_capture_failures SET resolved_at = now() WHERE organization_id = org AND resolved_at IS NULL;
  PERFORM accounting_event(org, 'integration_setting', org, actor, staff, 'backfill', NULL, st, NULL, NULL, jsonb_build_object('created', created), key, correlation);
  RETURN jsonb_build_object('created', created, 'already', false);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Settings and mapping commands (two-person rule, append-only history)
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION accounting_integration_validate_controls(org text, c jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE k text; v text;
BEGIN
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_control_accounts'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each_text(c) LOOP
    IF k NOT IN ('receivables','unallocatedReceipts','payables','outputTax') OR v !~ '^[0-9]{3,8}(-[0-9A-Z]{1,6})?$' THEN RAISE EXCEPTION 'invalid_control_accounts'; END IF;
    IF NOT EXISTS (SELECT 1 FROM accounting_accounts WHERE organization_id = org AND code = v AND is_postable) THEN RAISE EXCEPTION 'invalid_control_accounts'; END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_integration_settings_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); existing accounting_integration_settings; v integer; sid uuid; clean text := trim(coalesce(p->>'note', ''));
  controls jsonb := coalesce(p->'controlAccounts', '{}'::jsonb);
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':accounting_integration_settings', 0));
  SELECT * INTO existing FROM accounting_integration_settings WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF existing.proposed_by_id <> staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', existing.id, 'version', existing.version, 'already', true);
  END IF;
  IF coalesce(p->>'stage', '') = 'active' THEN RAISE EXCEPTION 'production_activation_unavailable'; END IF;
  IF coalesce(p->>'stage', '') NOT IN ('disabled','isolated_test','shadow') THEN RAISE EXCEPTION 'invalid_integration_stage'; END IF;
  IF p->>'stage' = 'isolated_test' AND NOT accounting_integration_test_database() THEN RAISE EXCEPTION 'isolated_test_requires_test_database'; END IF;
  IF length(clean) < 5 OR length(clean) > 2000 THEN RAISE EXCEPTION 'accounting_note_required'; END IF;
  PERFORM accounting_integration_validate_controls(org, controls);
  IF EXISTS (SELECT 1 FROM accounting_integration_settings WHERE organization_id = org AND status = 'proposed') THEN RAISE EXCEPTION 'integration_proposal_pending'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v FROM accounting_integration_settings WHERE organization_id = org;
  INSERT INTO accounting_integration_settings (organization_id, version, stage, control_accounts, status, note, proposed_by_id, idempotency_key)
  VALUES (org, v, p->>'stage', controls, 'proposed', clean, staff, key) RETURNING id INTO sid;
  PERFORM accounting_event(org, 'integration_setting', sid::text, actor, staff, 'proposed', NULL, 'proposed', v, clean, jsonb_build_object('stage', p->>'stage', 'controlAccounts', controls), NULL, correlation);
  RETURN jsonb_build_object('id', sid, 'version', v, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_integration_settings_decide(org text, actor text, sid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); pr accounting_integration_settings; cur text; target text; clean text := nullif(trim(coalesce(note, '')), ''); replayed integer := 0;
BEGIN
  IF decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':accounting_integration_settings', 0));
  SELECT * INTO pr FROM accounting_integration_settings WHERE organization_id = org AND id = sid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'integration_proposal_unavailable'; END IF;
  IF accounting_replay(org, key, 'integration_setting', sid::text, decision) THEN RETURN jsonb_build_object('id', sid, 'status', pr.status, 'already', true); END IF;
  IF pr.status <> 'proposed' THEN RAISE EXCEPTION 'integration_proposal_unavailable'; END IF;
  IF length(coalesce(clean, '')) > 2000 THEN RAISE EXCEPTION 'note_too_long'; END IF;
  IF decision = 'approve' THEN
    IF pr.proposed_by_id = staff THEN RAISE EXCEPTION 'accounting_self_approval_denied'; END IF;
    IF pr.stage = 'isolated_test' AND NOT accounting_integration_test_database() THEN RAISE EXCEPTION 'isolated_test_requires_test_database'; END IF;
    PERFORM accounting_integration_validate_controls(org, pr.control_accounts);
    cur := accounting_integration_stage(org);
    UPDATE accounting_integration_settings SET status = 'superseded' WHERE organization_id = org AND status = 'approved';
    -- Leaving shadow mode: shadow results are previews only, so those events are re-queued for the
    -- new stage (their shadow lines are discarded; the ledger was never touched).
    IF cur = 'shadow' AND pr.stage <> 'shadow' THEN
      PERFORM set_config('calacot.accounting_integration', 'on', true);
      DELETE FROM accounting_shadow_lines WHERE organization_id = org;
      WITH r AS (
        UPDATE accounting_integration_events SET status = 'pending', processed_at = NULL, mapping_id = NULL, mapping_version = NULL, next_attempt_at = NULL, updated_at = now()
        WHERE organization_id = org AND status = 'shadowed' RETURNING id, attempts)
      INSERT INTO accounting_integration_attempts (organization_id, event_id, action, attempt, from_status, to_status, note, actor_clerk_user_id, actor_staff_id, correlation_id)
      SELECT org, r.id, 'replay', r.attempts, 'shadowed', 'pending', 'Stage changed from shadow to ' || pr.stage, actor, staff, correlation FROM r;
      GET DIAGNOSTICS replayed = ROW_COUNT;
      PERFORM set_config('calacot.accounting_integration', '', true);
    END IF;
    target := 'approved';
  ELSE
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
    target := 'rejected';
  END IF;
  UPDATE accounting_integration_settings SET status = target, decided_by_id = staff, decided_at = now(), decision_note = clean WHERE organization_id = org AND id = sid;
  PERFORM accounting_event(org, 'integration_setting', sid::text, actor, staff, decision, 'proposed', target, pr.version, clean, jsonb_build_object('stage', pr.stage, 'replayed', replayed), key, correlation);
  RETURN jsonb_build_object('id', sid, 'status', target, 'replayed', replayed, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_mapping_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); x accounting_event_mappings; v integer; mid uuid;
  conds jsonb := coalesce(p->'conditions', '{}'::jsonb); def jsonb := coalesce(p->'definition', '{}'::jsonb); tmt text := coalesce(p->>'treatment', 'journal');
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO x FROM accounting_event_mappings WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF x.proposed_by_id <> staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', x.id, 'version', x.version, 'already', true);
  END IF;
  PERFORM accounting_mapping_validate(p->>'eventType', conds, tmt, def);
  IF coalesce(p->>'effectiveFrom', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_mapping_definition'; END IF;
  IF coalesce(p->>'priority', '0') !~ '^\d{1,4}$' OR (p->>'priority')::integer > 1000 THEN RAISE EXCEPTION 'invalid_mapping_definition'; END IF;
  IF nullif(p->>'policyVersion', '') IS NOT NULL AND (p->>'policyVersion') !~ '^\d{1,6}$' THEN RAISE EXCEPTION 'invalid_mapping_definition'; END IF;
  IF length(trim(coalesce(p->>'description', ''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'accounting_note_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':accounting_mapping:' || (p->>'eventType'), 0));
  SELECT coalesce(max(version), 0) + 1 INTO v FROM accounting_event_mappings WHERE organization_id = org AND event_type = p->>'eventType';
  INSERT INTO accounting_event_mappings (organization_id, event_type, version, description, conditions, treatment, definition, priority, policy_version, effective_from, proposed_by_id, idempotency_key)
  VALUES (org, p->>'eventType', v, trim(p->>'description'), conds, tmt, def, coalesce(nullif(p->>'priority', ''), '0')::integer, nullif(p->>'policyVersion', '')::integer,
    (p->>'effectiveFrom')::date, staff, key) RETURNING id INTO mid;
  PERFORM accounting_event(org, 'event_mapping', mid::text, actor, staff, 'proposed', NULL, 'proposed', v, trim(p->>'description'),
    jsonb_build_object('eventType', p->>'eventType', 'conditions', conds, 'treatment', tmt, 'definition', def), NULL, correlation);
  RETURN jsonb_build_object('id', mid, 'version', v, 'already', false);
END $$;
--> statement-breakpoint
-- Approval is a second person's decision and checks every named account is active and postable.
-- Approving a mapping with the same conditions and priority as an approved one retires the old one.
CREATE OR REPLACE FUNCTION accounting_mapping_decide(org text, actor text, mid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); x accounting_event_mappings; target text; clean text := nullif(trim(coalesce(note, '')), ''); rcode text;
BEGIN
  IF decision NOT IN ('approve','reject','retire') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':accounting_mapping_decide', 0));
  SELECT * INTO x FROM accounting_event_mappings WHERE organization_id = org AND id = mid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'mapping_unavailable'; END IF;
  IF accounting_replay(org, key, 'event_mapping', mid::text, decision) THEN RETURN jsonb_build_object('id', mid, 'status', x.status, 'already', true); END IF;
  IF (decision IN ('approve','reject') AND x.status <> 'proposed') OR (decision = 'retire' AND x.status <> 'approved') THEN RAISE EXCEPTION 'mapping_unavailable'; END IF;
  IF decision IN ('reject','retire') AND length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
  IF decision = 'approve' THEN
    IF x.proposed_by_id = staff THEN RAISE EXCEPTION 'accounting_self_approval_denied'; END IF;
    IF (accounting_policy(org)).id IS NULL THEN RAISE EXCEPTION 'accounting_policy_required'; END IF;
    PERFORM accounting_mapping_validate(x.event_type, x.conditions, x.treatment, x.definition);
    FOR rcode IN SELECT DISTINCT c.v FROM jsonb_array_elements(coalesce(x.definition->'lines', '[]'::jsonb)) AS l(item),
                LATERAL (SELECT l.item->'account'->>'code' AS v UNION ALL SELECT l.item->'account'->>'fallback' UNION ALL SELECT e.value FROM jsonb_each_text(coalesce(l.item->'account'->'byDivision', '{}'::jsonb)) AS e) AS c
                WHERE c.v IS NOT NULL LOOP
      IF NOT EXISTS (SELECT 1 FROM accounting_accounts aa WHERE aa.organization_id = org AND aa.code = rcode AND aa.status = 'active' AND aa.is_postable) THEN
        RAISE EXCEPTION 'posting_rule_invalid_account';
      END IF;
    END LOOP;
    UPDATE accounting_event_mappings SET status = 'retired', retired_at = now()
    WHERE organization_id = org AND event_type = x.event_type AND status = 'approved' AND conditions = x.conditions AND priority = x.priority;
    UPDATE accounting_event_mappings SET status = 'approved', decided_by_id = staff, decided_at = now(), decision_note = clean WHERE organization_id = org AND id = mid;
    target := 'approved';
  ELSIF decision = 'reject' THEN
    UPDATE accounting_event_mappings SET status = 'rejected', decided_by_id = staff, decided_at = now(), decision_note = clean WHERE organization_id = org AND id = mid;
    target := 'rejected';
  ELSE
    UPDATE accounting_event_mappings SET status = 'retired', retired_at = now() WHERE organization_id = org AND id = mid;
    target := 'retired';
  END IF;
  PERFORM accounting_event(org, 'event_mapping', mid::text, actor, staff, decision, x.status, target, x.version, clean, jsonb_build_object('eventType', x.event_type), key, correlation);
  RETURN jsonb_build_object('id', mid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Reconciliation: operational sub-ledgers vs the ledger (or the shadow ledger), per currency, as at
-- a date. Differences are reported, never balanced away. 'unposted' is the part of a difference
-- explained by events that are captured but not (yet) posted by that date.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION accounting_integration_reconciliation(org text, as_of date, mode text)
RETURNS TABLE (check_key text, currency text, account_code text, operational numeric, ledger numeric, unposted numeric, difference numeric, status text)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
DECLARE pol accounting_policy_versions := accounting_policy(org); c text; k text; ctl text; op numeric; led numeric; unp numeric; sgn integer;
BEGIN
  IF mode NOT IN ('ledger','shadow') THEN RAISE EXCEPTION 'invalid_reconciliation_mode'; END IF;
  FOREACH c IN ARRAY ARRAY['UGX','USD'] LOOP
    FOREACH k IN ARRAY ARRAY['receivables','unallocatedReceipts','payables','outputTax','disbursements','refunds'] LOOP
      ctl := CASE WHEN k IN ('disbursements','refunds') THEN NULL ELSE accounting_integration_control_account(org, k) END;
      CONTINUE WHEN k IN ('receivables','unallocatedReceipts','payables','outputTax') AND ctl IS NULL;
      -- Operational balance, from the business records as at the date (Kampala dates, the same date
      -- basis as the captured events).
      op := CASE k
        WHEN 'receivables' THEN
          coalesce((SELECT sum(total) FROM invoices WHERE organization_id = org AND invoices.currency = c AND status IN ('issued','void') AND accounting_kampala_date(issued_at) <= as_of
            AND NOT (status = 'void' AND accounting_kampala_date(voided_at) <= as_of)), 0)
          - coalesce((SELECT sum(total) FROM credit_notes WHERE organization_id = org AND credit_notes.currency = c AND status IN ('issued','void') AND accounting_kampala_date(issued_at) <= as_of
            AND NOT (status = 'void' AND accounting_kampala_date(voided_at) <= as_of)), 0)
          - coalesce((SELECT sum(a.amount) FROM payment_allocations a JOIN payments p ON p.organization_id = a.organization_id AND p.id = a.payment_id
            WHERE a.organization_id = org AND a.currency = c AND p.status = 'confirmed' AND accounting_kampala_date(a.created_at) <= as_of), 0)
          + coalesce((SELECT sum(r.amount) FROM payment_allocation_reversals r JOIN payment_refunds f ON f.organization_id = r.organization_id AND f.id = r.refund_id
            WHERE r.organization_id = org AND f.currency = c AND f.status = 'completed' AND accounting_kampala_date(greatest(f.completed_at, r.created_at)) <= as_of), 0)
        WHEN 'unallocatedReceipts' THEN
          coalesce((SELECT sum(amount) FROM payments WHERE organization_id = org AND payments.currency = c AND status = 'confirmed' AND accounting_kampala_date(received_at) <= as_of), 0)
          - coalesce((SELECT sum(a.amount) FROM payment_allocations a JOIN payments p ON p.organization_id = a.organization_id AND p.id = a.payment_id
            WHERE a.organization_id = org AND a.currency = c AND p.status = 'confirmed' AND accounting_kampala_date(a.created_at) <= as_of), 0)
          - coalesce((SELECT sum(amount) FROM payment_refunds WHERE organization_id = org AND payment_refunds.currency = c AND status = 'completed' AND accounting_kampala_date(completed_at) <= as_of), 0)
          + coalesce((SELECT sum(r.amount) FROM payment_allocation_reversals r JOIN payment_refunds f ON f.organization_id = r.organization_id AND f.id = r.refund_id
            WHERE r.organization_id = org AND f.currency = c AND f.status = 'completed' AND accounting_kampala_date(greatest(f.completed_at, r.created_at)) <= as_of), 0)
        WHEN 'payables' THEN
          -- Only liabilities the approved policy actually recognized (approval events that produced an entry).
          coalesce((SELECT sum(e.total) FROM expenses e JOIN accounting_integration_events ev ON ev.organization_id = e.organization_id AND ev.event_key = 'expense_approved:' || e.id
            WHERE e.organization_id = org AND e.currency = c AND ev.status = CASE WHEN mode = 'shadow' THEN 'shadowed' ELSE 'posted' END AND ev.effective_date <= as_of), 0)
          - coalesce((SELECT sum(d.amount) FROM expense_disbursements d JOIN accounting_integration_events ev ON ev.organization_id = d.organization_id AND ev.event_key = 'expense_approved:' || d.expense_id
            WHERE d.organization_id = org AND d.currency = c AND ev.status = CASE WHEN mode = 'shadow' THEN 'shadowed' ELSE 'posted' END AND d.paid_on <= as_of
              AND NOT (d.status = 'void' AND accounting_kampala_date(d.voided_at) <= as_of)), 0)
        WHEN 'outputTax' THEN
          coalesce((SELECT sum(tax_amount) FROM invoices WHERE organization_id = org AND invoices.currency = c AND status IN ('issued','void') AND accounting_kampala_date(issued_at) <= as_of
            AND NOT (status = 'void' AND accounting_kampala_date(voided_at) <= as_of)), 0)
          - coalesce((SELECT sum(tax_amount) FROM credit_notes WHERE organization_id = org AND credit_notes.currency = c AND status IN ('issued','void') AND accounting_kampala_date(issued_at) <= as_of
            AND NOT (status = 'void' AND accounting_kampala_date(voided_at) <= as_of)), 0)
        WHEN 'disbursements' THEN
          coalesce((SELECT sum(amount) FROM expense_disbursements WHERE organization_id = org AND expense_disbursements.currency = c AND paid_on <= as_of
            AND NOT (status = 'void' AND accounting_kampala_date(voided_at) <= as_of)), 0)
        ELSE
          coalesce((SELECT sum(amount) FROM payment_refunds WHERE organization_id = org AND payment_refunds.currency = c AND status = 'completed' AND accounting_kampala_date(completed_at) <= as_of), 0)
      END;
      -- Ledger side. Account checks use the control account balance (asset: debit - credit;
      -- liability: credit - debit). Traced checks sum the entries made for those source events.
      sgn := CASE WHEN k = 'receivables' THEN 1 ELSE -1 END;
      IF ctl IS NOT NULL THEN
        IF mode = 'ledger' THEN
          led := CASE WHEN c = pol.functional_currency THEN coalesce((SELECT sum(l.functional_debit - l.functional_credit) FROM accounting_journal_lines l
            JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id JOIN accounting_accounts a ON a.organization_id = l.organization_id AND a.id = l.account_id
            WHERE l.organization_id = org AND j.status = 'posted' AND j.entry_date <= as_of AND a.code = ctl AND l.currency = c), 0) * sgn ELSE 0 END;
        ELSE
          led := coalesce((SELECT sum(s.debit - s.credit) FROM accounting_shadow_lines s WHERE s.organization_id = org AND s.account_code = ctl AND s.currency = c AND s.entry_date <= as_of), 0) * sgn;
        END IF;
      ELSE
        led := coalesce((SELECT sum(CASE WHEN ev.event_type IN ('disbursement_voided') THEN -ev.amount ELSE ev.amount END) FROM accounting_integration_events ev
          LEFT JOIN accounting_journals j ON j.organization_id = ev.organization_id AND j.id = ev.journal_id
          WHERE ev.organization_id = org AND ev.currency = c AND ev.event_type = ANY (CASE WHEN k = 'disbursements' THEN ARRAY['disbursement_recorded','disbursement_voided'] ELSE ARRAY['refund_completed'] END)
            AND ((mode = 'ledger' AND ev.status = 'posted' AND j.entry_date <= as_of) OR (mode = 'shadow' AND ev.status = 'shadowed' AND coalesce(ev.posting_date, ev.effective_date) <= as_of))), 0);
      END IF;
      -- Captured events that should affect this balance but are not reflected by the date.
      unp := coalesce((SELECT sum(ev.amount * CASE
          WHEN k = 'receivables' THEN CASE ev.event_type WHEN 'invoice_issued' THEN 1 WHEN 'credit_note_voided' THEN 1 WHEN 'allocation_reversed' THEN 1
            WHEN 'invoice_voided' THEN -1 WHEN 'credit_note_issued' THEN -1 WHEN 'payment_allocated' THEN -1 ELSE 0 END
          WHEN k = 'unallocatedReceipts' THEN CASE ev.event_type WHEN 'payment_confirmed' THEN 1 WHEN 'allocation_reversed' THEN 1 WHEN 'payment_allocated' THEN -1 WHEN 'refund_completed' THEN -1 ELSE 0 END
          WHEN k = 'outputTax' THEN 0
          WHEN k = 'payables' THEN 0
          WHEN k = 'disbursements' THEN CASE ev.event_type WHEN 'disbursement_recorded' THEN 1 WHEN 'disbursement_voided' THEN -1 ELSE 0 END
          ELSE CASE ev.event_type WHEN 'refund_completed' THEN 1 ELSE 0 END END)
        FROM accounting_integration_events ev
        LEFT JOIN accounting_journals j ON j.organization_id = ev.organization_id AND j.id = ev.journal_id
        WHERE ev.organization_id = org AND ev.currency = c AND ev.effective_date <= as_of AND ev.status <> 'no_effect'
          AND NOT ((mode = 'ledger' AND ev.status = 'posted' AND j.entry_date <= as_of) OR (mode = 'shadow' AND ev.status = 'shadowed' AND coalesce(ev.posting_date, ev.effective_date) <= as_of))), 0);
      IF k = 'outputTax' THEN
        unp := coalesce((SELECT sum((ev.payload->>'tax')::numeric * CASE ev.event_type WHEN 'invoice_issued' THEN 1 WHEN 'credit_note_voided' THEN 1 ELSE -1 END)
          FROM accounting_integration_events ev LEFT JOIN accounting_journals j ON j.organization_id = ev.organization_id AND j.id = ev.journal_id
          WHERE ev.organization_id = org AND ev.currency = c AND ev.effective_date <= as_of AND ev.status <> 'no_effect'
            AND ev.event_type IN ('invoice_issued','invoice_voided','credit_note_issued','credit_note_voided') AND (ev.payload->>'tax') IS NOT NULL
            AND NOT ((mode = 'ledger' AND ev.status = 'posted' AND j.entry_date <= as_of) OR (mode = 'shadow' AND ev.status = 'shadowed' AND coalesce(ev.posting_date, ev.effective_date) <= as_of))), 0);
      END IF;
      CONTINUE WHEN op = 0 AND led = 0 AND unp = 0;
      check_key := k; currency := c; account_code := ctl; operational := op; ledger := led; unposted := unp; difference := op - led;
      status := CASE WHEN op = led THEN 'matched' WHEN op - led = unp THEN 'explained' ELSE 'unexplained' END;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END $$;
