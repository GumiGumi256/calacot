-- Phase 2A: accounting foundation and double-entry general ledger (additive only).
--
-- Nothing in this migration alters an existing table, row, constraint or function. Invoices,
-- payments, credit notes, refunds, expenses and disbursements keep working exactly as before;
-- nothing here reads from or writes to them.
--
-- Safety switches enforced by the database itself:
--   * Manual posting is impossible until an accounting policy (functional currency and
--     financial-year start) is proposed by one person and approved by a different person.
--   * Automatic posting from business records is impossible: the policy CHECK forces it off.
--     Lifting it needs a future, reviewed migration.
--   * Multi-currency posting is impossible for the same reason. Foreign-currency lines may be
--     drafted with an approved exchange rate, but cannot be posted.
--
-- Called through the Neon HTTP driver: each function call is one PostgreSQL transaction, so a
-- journal is either posted completely (lines, number, period) or not at all. Functions are
-- INVOKER. The application checks Clerk permissions; these functions and triggers enforce
-- record-level rules (balance, immutability, periods, segregation of duties, idempotency).

CREATE TABLE accounting_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  version integer NOT NULL CHECK (version > 0),
  functional_currency text NOT NULL CHECK (functional_currency IN ('UGX','USD')),
  fiscal_year_start_month integer NOT NULL CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  manual_posting_enabled boolean NOT NULL DEFAULT false,
  -- Phase 2A hard stops. A future migration must lift these after policy approval.
  multi_currency_posting_enabled boolean NOT NULL DEFAULT false CHECK (multi_currency_posting_enabled = false),
  automatic_posting_enabled boolean NOT NULL DEFAULT false CHECK (automatic_posting_enabled = false),
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
  -- Two-person rule: the approver is never the proposer.
  CHECK (status NOT IN ('approved','superseded') OR decided_by_id <> proposed_by_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX accounting_policy_one_proposal_uq ON accounting_policy_versions (organization_id) WHERE status = 'proposed';
--> statement-breakpoint
CREATE UNIQUE INDEX accounting_policy_one_approved_uq ON accounting_policy_versions (organization_id) WHERE status = 'approved';
--> statement-breakpoint
CREATE TABLE accounting_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  code text NOT NULL CHECK (code ~ '^[0-9]{3,8}(-[0-9A-Z]{1,6})?$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR length(description) <= 1000),
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','income','cost_of_sales','operating_expense','other_income','other_expense')),
  is_contra boolean NOT NULL DEFAULT false,
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  reporting_class text,
  parent_id uuid,
  is_postable boolean NOT NULL DEFAULT true,
  manual_posting_allowed boolean NOT NULL DEFAULT true,
  currency text CHECK (currency IS NULL OR currency IN ('UGX','USD')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','active','inactive')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  activated_by_id uuid,
  activated_at timestamptz,
  deactivated_by_id uuid,
  deactivated_at timestamptz,
  deactivation_reason text,
  idempotency_key text,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, parent_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, activated_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, deactivated_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  -- The normal balance follows the account type; contra accounts carry the opposite side.
  CHECK (normal_balance = CASE WHEN (account_type IN ('asset','cost_of_sales','operating_expense','other_expense')) <> is_contra THEN 'debit' ELSE 'credit' END),
  -- Reporting classification must belong to the account type. Header (non-postable) accounts may omit it.
  CHECK ((reporting_class IS NULL AND NOT is_postable) OR (account_type || ':' || coalesce(reporting_class, '')) IN (
    'asset:current_asset','asset:non_current_asset','liability:current_liability','liability:non_current_liability',
    'equity:equity','income:operating_revenue','cost_of_sales:cost_of_sales','operating_expense:operating_expense',
    'other_income:other_income','other_expense:other_expense','other_expense:finance_cost','other_expense:income_tax_expense')),
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK (status = 'proposed' OR (activated_by_id IS NOT NULL AND activated_at IS NOT NULL)),
  -- Chart approval is a second person's decision.
  CHECK (activated_by_id IS NULL OR activated_by_id <> created_by_id),
  CHECK (status <> 'inactive' OR (deactivated_by_id IS NOT NULL AND deactivated_at IS NOT NULL AND length(trim(coalesce(deactivation_reason, ''))) >= 5))
);
--> statement-breakpoint
CREATE INDEX accounting_accounts_parent_idx ON accounting_accounts (organization_id, parent_id);
--> statement-breakpoint
CREATE TABLE accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2200),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_by_id uuid,
  closed_at timestamptz,
  close_note text,
  reopened_by_id uuid,
  reopened_at timestamptz,
  reopen_reason text,
  idempotency_key text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, created_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, closed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, reopened_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (end_date >= start_date AND end_date - start_date <= 371),
  CHECK (status <> 'closed' OR (closed_by_id IS NOT NULL AND closed_at IS NOT NULL)),
  CHECK (reopened_at IS NULL OR (reopened_by_id IS NOT NULL AND length(trim(coalesce(reopen_reason, ''))) >= 5))
);
--> statement-breakpoint
CREATE INDEX accounting_periods_dates_idx ON accounting_periods (organization_id, start_date, end_date);
--> statement-breakpoint
-- Gapless journal numbering per organization, series and financial year (never MAX()+1).
CREATE TABLE accounting_counters (
  organization_id text NOT NULL REFERENCES organizations(id),
  series text NOT NULL CHECK (series IN ('JE')),
  fiscal_year integer NOT NULL,
  next_value integer NOT NULL DEFAULT 1 CHECK (next_value > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, series, fiscal_year)
);
--> statement-breakpoint
-- Exchange rates are only ever entered and approved by people. Nothing is fetched or invented.
CREATE TABLE accounting_exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  from_currency text NOT NULL CHECK (from_currency IN ('UGX','USD')),
  to_currency text NOT NULL CHECK (to_currency IN ('UGX','USD')),
  rate numeric(20,10) NOT NULL CHECK (rate > 0),
  rate_date date NOT NULL,
  source text NOT NULL CHECK (length(trim(source)) BETWEEN 3 AND 200),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
  entered_by_id uuid NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, entered_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (from_currency <> to_currency),
  CHECK (status = 'proposed' OR (decided_by_id IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (status <> 'approved' OR decided_by_id <> entered_by_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX accounting_exchange_rates_daily_uq ON accounting_exchange_rates (organization_id, from_currency, to_currency, rate_date) WHERE status = 'approved';
--> statement-breakpoint
CREATE TABLE accounting_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  number text,
  journal_type text NOT NULL DEFAULT 'manual' CHECK (journal_type IN ('manual','reversal','system')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','posted','rejected','discarded')),
  entry_date date NOT NULL,
  period_id uuid,
  fiscal_year integer,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 500),
  reference text CHECK (reference IS NULL OR length(reference) <= 100),
  functional_currency text CHECK (functional_currency IS NULL OR functional_currency IN ('UGX','USD')),
  total_debit numeric(17,2),
  total_credit numeric(17,2),
  -- Source-event identity for future automatic postings (Phase 2B+). Unused while automatic posting is off.
  source_type text,
  source_id text,
  source_event text,
  posting_rule_id uuid,
  reverses_journal_id uuid,
  reversal_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  prepared_by_id uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  submitted_by_id uuid,
  submitted_at timestamptz,
  approved_by_id uuid,
  approved_at timestamptz,
  approved_version integer,
  reviewed_by_id uuid,
  reviewed_at timestamptz,
  review_note text,
  posted_by_id uuid,
  posted_at timestamptz,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, number),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, period_id) REFERENCES accounting_periods(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, reverses_journal_id) REFERENCES accounting_journals(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, submitted_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, approved_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, reviewed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, posted_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (status = 'posted' OR (number IS NULL AND posted_at IS NULL AND posted_by_id IS NULL)),
  CHECK (status <> 'posted' OR (number IS NOT NULL AND period_id IS NOT NULL AND fiscal_year IS NOT NULL AND functional_currency IS NOT NULL
    AND posted_by_id IS NOT NULL AND posted_at IS NOT NULL AND total_debit = total_credit AND total_debit > 0)),
  -- Segregation of duties: a manual journal is approved by someone other than its preparer.
  CHECK (journal_type <> 'manual' OR status NOT IN ('approved','posted') OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL AND approved_version IS NOT NULL)),
  CHECK (approved_by_id IS NULL OR approved_by_id <> prepared_by_id),
  CHECK ((journal_type = 'reversal') = (reverses_journal_id IS NOT NULL)),
  CHECK (journal_type <> 'reversal' OR length(trim(coalesce(reversal_reason, ''))) >= 5),
  CHECK ((journal_type = 'system') = (source_type IS NOT NULL AND source_id IS NOT NULL AND source_event IS NOT NULL)),
  CHECK (reverses_journal_id IS NULL OR reverses_journal_id <> id)
);
--> statement-breakpoint
-- A journal can be reversed once. A source event can produce one journal.
CREATE UNIQUE INDEX accounting_journals_one_reversal_uq ON accounting_journals (organization_id, reverses_journal_id) WHERE reverses_journal_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX accounting_journals_source_event_uq ON accounting_journals (organization_id, source_type, source_id, source_event) WHERE source_type IS NOT NULL;
--> statement-breakpoint
CREATE INDEX accounting_journals_status_date_idx ON accounting_journals (organization_id, status, entry_date);
--> statement-breakpoint
CREATE TABLE accounting_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  journal_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 200),
  account_id uuid NOT NULL,
  description text CHECK (description IS NULL OR length(description) <= 300),
  -- Transaction currency amounts.
  currency text NOT NULL CHECK (currency IN ('UGX','USD')),
  debit numeric(17,2) NOT NULL DEFAULT 0,
  credit numeric(17,2) NOT NULL DEFAULT 0,
  -- Functional (reporting) currency amounts. Without an approved rate the line is assumed to be
  -- in the functional currency (rate 1); posting verifies that assumption against the policy.
  exchange_rate numeric(20,10) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  exchange_rate_id uuid,
  rate_date date,
  rate_source text,
  functional_debit numeric(17,2) NOT NULL DEFAULT 0,
  functional_credit numeric(17,2) NOT NULL DEFAULT 0,
  -- Analytical dimensions (never separate ledger accounts).
  division text CHECK (division IS NULL OR division IN ('estates','architecture','painting','interiors','tech')),
  project_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, journal_id, line_number),
  FOREIGN KEY (organization_id, journal_id) REFERENCES accounting_journals(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, exchange_rate_id) REFERENCES accounting_exchange_rates(organization_id, id) ON DELETE RESTRICT,
  -- Exactly one side per line, positive, and the functional amount on the same side.
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  CHECK ((functional_debit > 0 AND functional_credit = 0 AND debit > 0) OR (functional_credit > 0 AND functional_debit = 0 AND credit > 0)),
  CHECK (exchange_rate_id IS NOT NULL OR (exchange_rate = 1 AND functional_debit = debit AND functional_credit = credit AND rate_date IS NULL AND rate_source IS NULL)),
  CHECK (exchange_rate_id IS NULL OR (rate_date IS NOT NULL AND rate_source IS NOT NULL
    AND functional_debit = round(debit * exchange_rate, 2) AND functional_credit = round(credit * exchange_rate, 2)))
);
--> statement-breakpoint
CREATE INDEX accounting_journal_lines_account_idx ON accounting_journal_lines (organization_id, account_id, journal_id);
--> statement-breakpoint
CREATE INDEX accounting_journal_lines_journal_idx ON accounting_journal_lines (organization_id, journal_id, line_number);
--> statement-breakpoint
-- Versioned source-to-journal mapping rules (prepared, never executed in Phase 2A).
CREATE TABLE accounting_posting_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  source_type text NOT NULL CHECK (source_type IN ('invoice_issued','payment_confirmed','payment_allocated','credit_note_issued','refund_completed','expense_approved','disbursement_recorded','disbursement_voided','bank_transaction')),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','retired')),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 5 AND 1000),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object' AND jsonb_typeof(definition->'lines') = 'array'),
  effective_from date NOT NULL,
  proposed_by_id uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  retired_at timestamptz,
  idempotency_key text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, source_type, version),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, proposed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (status = 'proposed' OR (decided_by_id IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (status NOT IN ('approved','retired') OR decided_by_id <> proposed_by_id),
  CHECK (status <> 'retired' OR retired_at IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX accounting_posting_rules_one_approved_uq ON accounting_posting_rules (organization_id, source_type) WHERE status = 'approved';
--> statement-breakpoint
ALTER TABLE accounting_journals ADD CONSTRAINT accounting_journals_posting_rule_fk FOREIGN KEY (organization_id, posting_rule_id) REFERENCES accounting_posting_rules(organization_id, id) ON DELETE RESTRICT;
--> statement-breakpoint
-- Append-only history for every accounting command (UPDATE, DELETE and TRUNCATE blocked).
CREATE TABLE accounting_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  entity_type text NOT NULL CHECK (entity_type IN ('policy','account','chart','period','fiscal_year','journal','exchange_rate','posting_rule')),
  entity_id text NOT NULL,
  actor_clerk_user_id text NOT NULL,
  actor_staff_id uuid,
  action text NOT NULL,
  from_status text,
  to_status text,
  version integer,
  note text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, actor_staff_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX accounting_events_idempotency_uq ON accounting_events (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX accounting_events_entity_idx ON accounting_events (organization_id, entity_type, entity_id, created_at);
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Guards: invariants that hold for every writer, including direct SQL.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION accounting_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'accounting_history_immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER accounting_events_immutable BEFORE UPDATE OR DELETE ON accounting_events FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER accounting_events_no_truncate BEFORE TRUNCATE ON accounting_events FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER accounting_journals_no_truncate BEFORE TRUNCATE ON accounting_journals FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER accounting_journal_lines_no_truncate BEFORE TRUNCATE ON accounting_journal_lines FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER accounting_accounts_no_truncate BEFORE TRUNCATE ON accounting_accounts FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER accounting_periods_no_truncate BEFORE TRUNCATE ON accounting_periods FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER accounting_policy_no_truncate BEFORE TRUNCATE ON accounting_policy_versions FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER accounting_rates_no_truncate BEFORE TRUNCATE ON accounting_exchange_rates FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER accounting_rules_no_truncate BEFORE TRUNCATE ON accounting_posting_rules FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Proposals (policy, rates, posting rules) are decided once; decided content never changes.
CREATE OR REPLACE FUNCTION accounting_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'accounting_history_immutable'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'proposed' OR NEW.decided_by_id IS NOT NULL THEN RAISE EXCEPTION 'accounting_history_immutable'; END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','decision_note','retired_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','decision_note','retired_at']) THEN
    RAISE EXCEPTION 'accounting_history_immutable';
  END IF;
  IF OLD.status = 'proposed' AND NEW.status IN ('approved','rejected') THEN RETURN NEW; END IF;
  -- Superseding (policy) or retiring (rule) keeps the original decision.
  IF OLD.status = 'approved' AND NEW.status IN ('superseded','retired')
     AND (NEW.decided_by_id, NEW.decided_at) IS NOT DISTINCT FROM (OLD.decided_by_id, OLD.decided_at) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'accounting_history_immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER accounting_policy_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_policy_versions FOR EACH ROW EXECUTE FUNCTION accounting_decision_guard();
--> statement-breakpoint
CREATE TRIGGER accounting_rates_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_exchange_rates FOR EACH ROW EXECUTE FUNCTION accounting_decision_guard();
--> statement-breakpoint
CREATE TRIGGER accounting_rules_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_posting_rules FOR EACH ROW EXECUTE FUNCTION accounting_decision_guard();
--> statement-breakpoint
-- Effective policy: the single approved version, or a row of NULLs when none is approved.
CREATE OR REPLACE FUNCTION accounting_policy(org text) RETURNS accounting_policy_versions LANGUAGE sql STABLE AS $$
  SELECT * FROM accounting_policy_versions WHERE organization_id = org AND status = 'approved' ORDER BY version DESC LIMIT 1;
$$;
--> statement-breakpoint
-- Posted balance of an account per currency, in functional amounts (debit minus credit).
CREATE OR REPLACE FUNCTION accounting_account_has_balance(org text, aid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM accounting_journal_lines l
    JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id
    WHERE l.organization_id = org AND l.account_id = aid AND j.status = 'posted'
    GROUP BY l.currency HAVING sum(l.functional_debit) <> sum(l.functional_credit) OR sum(l.debit) <> sum(l.credit));
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE par accounting_accounts; cur uuid; depth integer := 0;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'account_delete_denied'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'proposed' OR NEW.activated_by_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_account_transition'; END IF;
  ELSE
    IF (NEW.id, NEW.organization_id, NEW.created_by_id, NEW.created_at, NEW.idempotency_key)
       IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.created_by_id, OLD.created_at, OLD.idempotency_key) THEN
      RAISE EXCEPTION 'account_structure_locked';
    END IF;
    -- Once approved, the identity and position of an account in the chart are fixed.
    IF OLD.status <> 'proposed' AND (NEW.code, NEW.account_type, NEW.is_contra, NEW.normal_balance, NEW.parent_id, NEW.is_postable)
       IS DISTINCT FROM (OLD.code, OLD.account_type, OLD.is_contra, OLD.normal_balance, OLD.parent_id, OLD.is_postable) THEN
      RAISE EXCEPTION 'account_structure_locked';
    END IF;
    IF NEW.currency IS DISTINCT FROM OLD.currency AND EXISTS (SELECT 1 FROM accounting_journal_lines WHERE organization_id = NEW.organization_id AND account_id = NEW.id) THEN
      RAISE EXCEPTION 'account_structure_locked';
    END IF;
    IF NEW.is_postable AND NOT OLD.is_postable AND EXISTS (SELECT 1 FROM accounting_accounts WHERE organization_id = NEW.organization_id AND parent_id = NEW.id) THEN
      RAISE EXCEPTION 'parent_account_invalid';
    END IF;
    IF NEW.status <> OLD.status THEN
      IF NOT ((OLD.status = 'proposed' AND NEW.status = 'active') OR (OLD.status = 'active' AND NEW.status = 'inactive') OR (OLD.status = 'inactive' AND NEW.status = 'active')) THEN
        RAISE EXCEPTION 'invalid_account_transition';
      END IF;
      IF NEW.status = 'active' AND NEW.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting_accounts WHERE organization_id = NEW.organization_id AND id = NEW.parent_id AND status = 'active') THEN
        RAISE EXCEPTION 'parent_account_inactive';
      END IF;
      IF NEW.status = 'inactive' THEN
        IF EXISTS (SELECT 1 FROM accounting_accounts WHERE organization_id = NEW.organization_id AND parent_id = NEW.id AND status <> 'inactive') THEN
          RAISE EXCEPTION 'account_has_active_children';
        END IF;
        IF accounting_account_has_balance(NEW.organization_id, NEW.id) THEN RAISE EXCEPTION 'account_has_balance'; END IF;
      END IF;
    END IF;
  END IF;
  IF NEW.parent_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id OR NEW.account_type IS DISTINCT FROM OLD.account_type) THEN
    -- Serialize hierarchy changes so two concurrent edits cannot create a cycle.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id || ':accounting_chart', 0));
    SELECT * INTO par FROM accounting_accounts WHERE organization_id = NEW.organization_id AND id = NEW.parent_id;
    IF NOT FOUND OR par.account_type <> NEW.account_type OR par.is_postable OR par.status = 'inactive' THEN
      RAISE EXCEPTION 'parent_account_invalid';
    END IF;
    cur := par.parent_id;
    WHILE cur IS NOT NULL LOOP
      depth := depth + 1;
      IF cur = NEW.id OR depth > 6 THEN RAISE EXCEPTION 'parent_account_invalid'; END IF;
      SELECT parent_id INTO cur FROM accounting_accounts WHERE organization_id = NEW.organization_id AND id = cur;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounting_accounts_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_accounts FOR EACH ROW EXECUTE FUNCTION accounting_account_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_period_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'period_delete_denied'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' THEN RAISE EXCEPTION 'invalid_period_transition'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id || ':accounting_periods', 0));
    IF EXISTS (SELECT 1 FROM accounting_periods WHERE organization_id = NEW.organization_id AND start_date <= NEW.end_date AND end_date >= NEW.start_date) THEN
      RAISE EXCEPTION 'period_overlap';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.fiscal_year, NEW.name, NEW.start_date, NEW.end_date, NEW.created_by_id, NEW.created_at, NEW.idempotency_key)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.fiscal_year, OLD.name, OLD.start_date, OLD.end_date, OLD.created_by_id, OLD.created_at, OLD.idempotency_key) THEN
    RAISE EXCEPTION 'period_dates_locked';
  END IF;
  IF NEW.status = 'closed' AND OLD.status = 'open' THEN
    -- Journals awaiting approval or posting would otherwise be stranded in a closed period.
    IF EXISTS (SELECT 1 FROM accounting_journals WHERE organization_id = NEW.organization_id AND status IN ('submitted','approved') AND entry_date BETWEEN NEW.start_date AND NEW.end_date) THEN
      RAISE EXCEPTION 'period_has_pending_journals';
    END IF;
  ELSIF NEW.status <> OLD.status AND NOT (OLD.status = 'closed' AND NEW.status = 'open') THEN
    RAISE EXCEPTION 'invalid_period_transition';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounting_periods_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_periods FOR EACH ROW EXECUTE FUNCTION accounting_period_guard();
--> statement-breakpoint
-- Lines can only be written while their journal is a draft. FOR SHARE waits for (and then
-- sees the result of) any concurrent posting, so a line can never join a posted journal.
CREATE OR REPLACE FUNCTION accounting_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j accounting_journals; a accounting_accounts; r accounting_exchange_rates; pdiv text; org text := coalesce(NEW.organization_id, OLD.organization_id);
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.organization_id, NEW.journal_id) IS DISTINCT FROM (OLD.organization_id, OLD.journal_id) THEN
    RAISE EXCEPTION 'journal_lines_locked';
  END IF;
  SELECT * INTO j FROM accounting_journals WHERE organization_id = org AND id = coalesce(NEW.journal_id, OLD.journal_id) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'journal_unavailable'; END IF;
  IF j.status <> 'draft' THEN RAISE EXCEPTION 'journal_lines_locked'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  SELECT * INTO a FROM accounting_accounts WHERE organization_id = org AND id = NEW.account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_unavailable'; END IF;
  IF NOT a.is_postable THEN RAISE EXCEPTION 'account_not_postable'; END IF;
  IF a.status = 'inactive' THEN RAISE EXCEPTION 'account_not_active'; END IF;
  IF j.journal_type = 'manual' AND NOT a.manual_posting_allowed THEN RAISE EXCEPTION 'account_manual_posting_denied'; END IF;
  IF a.currency IS NOT NULL AND a.currency <> NEW.currency THEN RAISE EXCEPTION 'account_currency_mismatch'; END IF;
  IF NEW.exchange_rate_id IS NOT NULL THEN
    SELECT * INTO r FROM accounting_exchange_rates WHERE organization_id = org AND id = NEW.exchange_rate_id;
    IF NOT FOUND OR r.status <> 'approved' OR r.from_currency <> NEW.currency OR r.rate <> NEW.exchange_rate
       OR r.rate_date IS DISTINCT FROM NEW.rate_date OR r.source IS DISTINCT FROM NEW.rate_source THEN
      RAISE EXCEPTION 'exchange_rate_unavailable';
    END IF;
  END IF;
  IF NEW.project_id IS NOT NULL THEN
    SELECT division INTO pdiv FROM projects WHERE organization_id = org AND id = NEW.project_id;
    IF NEW.division IS NULL THEN NEW.division := pdiv;
    ELSIF NEW.division <> pdiv THEN RAISE EXCEPTION 'project_division_mismatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounting_journal_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON accounting_journal_lines FOR EACH ROW EXECUTE FUNCTION accounting_line_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_journal_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'draft' OR NEW.number IS NOT NULL OR NEW.approved_by_id IS NOT NULL OR NEW.submitted_by_id IS NOT NULL OR NEW.period_id IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_journal_transition';
  END IF;
  IF NEW.journal_type = 'system' AND NOT coalesce((accounting_policy(NEW.organization_id)).automatic_posting_enabled, false) THEN
    RAISE EXCEPTION 'automatic_posting_disabled';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounting_journals_insert_guard BEFORE INSERT ON accounting_journals FOR EACH ROW EXECUTE FUNCTION accounting_journal_insert_guard();
--> statement-breakpoint
-- The posting gate. Every rule that makes a ledger entry valid is checked here, at the moment a
-- journal becomes posted, whoever issues the UPDATE. The journal number is assigned here too, so
-- a failed posting rolls back its number and numbering stays gapless.
CREATE OR REPLACE FUNCTION accounting_journal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pol accounting_policy_versions; per accounting_periods; n integer; cnt integer; dr numeric; cr numeric; currencies integer;
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
  -- Content changes only while a draft stays a draft. Anything later invalidates review.
  IF NOT (OLD.status = 'draft' AND NEW.status = 'draft')
     AND (NEW.entry_date, NEW.description, NEW.reference) IS DISTINCT FROM (OLD.entry_date, OLD.description, OLD.reference) THEN
    RAISE EXCEPTION 'journal_not_editable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'draft' AND NEW.status IN ('submitted','discarded'))
    OR (OLD.status = 'submitted' AND NEW.status IN ('draft','approved','rejected'))
    OR (OLD.status = 'approved' AND NEW.status IN ('draft','posted'))
    OR (OLD.status = 'draft' AND NEW.status = 'posted' AND OLD.journal_type = 'reversal')) THEN
    RAISE EXCEPTION 'invalid_journal_transition';
  END IF;
  IF NEW.status <> 'posted' THEN
    IF NEW.period_id IS NOT NULL OR NEW.number IS NOT NULL THEN RAISE EXCEPTION 'invalid_journal_transition'; END IF;
    RETURN NEW;
  END IF;

  -- Transition to posted.
  IF OLD.journal_type = 'system' THEN RAISE EXCEPTION 'automatic_posting_disabled'; END IF;
  IF OLD.journal_type = 'manual' THEN
    IF OLD.approved_version IS DISTINCT FROM OLD.version OR NEW.approved_by_id IS DISTINCT FROM OLD.approved_by_id THEN RAISE EXCEPTION 'stale_approval'; END IF;
    IF NOT EXISTS (SELECT 1 FROM staff_memberships WHERE organization_id = OLD.organization_id AND id = OLD.approved_by_id AND status = 'active') THEN
      RAISE EXCEPTION 'stale_approval';
    END IF;
  END IF;
  pol := accounting_policy(OLD.organization_id);
  IF pol.id IS NULL THEN RAISE EXCEPTION 'accounting_policy_required'; END IF;
  IF NOT pol.manual_posting_enabled THEN RAISE EXCEPTION 'posting_disabled'; END IF;
  -- FOR SHARE: a concurrent close waits for this posting; a posting after a close sees it.
  SELECT * INTO per FROM accounting_periods WHERE organization_id = OLD.organization_id AND OLD.entry_date BETWEEN start_date AND end_date FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'period_missing'; END IF;
  IF per.status <> 'open' THEN RAISE EXCEPTION 'period_closed'; END IF;
  SELECT count(*), coalesce(sum(l.functional_debit), 0), coalesce(sum(l.functional_credit), 0), count(DISTINCT l.currency)
    INTO cnt, dr, cr, currencies
    FROM accounting_journal_lines l WHERE l.organization_id = OLD.organization_id AND l.journal_id = OLD.id;
  IF cnt < 2 THEN RAISE EXCEPTION 'journal_lines_required'; END IF;
  IF dr <> cr OR dr <= 0 THEN RAISE EXCEPTION 'journal_unbalanced'; END IF;
  -- Never combine currencies without explicit conversion: every currency balances on its own.
  IF EXISTS (SELECT 1 FROM accounting_journal_lines WHERE organization_id = OLD.organization_id AND journal_id = OLD.id GROUP BY currency HAVING sum(debit) <> sum(credit)) THEN
    RAISE EXCEPTION 'journal_unbalanced';
  END IF;
  IF EXISTS (SELECT 1 FROM accounting_journal_lines WHERE organization_id = OLD.organization_id AND journal_id = OLD.id AND (currency <> pol.functional_currency OR exchange_rate_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'multi_currency_posting_disabled';
  END IF;
  -- FOR SHARE on every account used: a concurrent deactivation waits for this posting (and then
  -- sees the new balance), or this posting waits for the deactivation (and then sees it inactive).
  PERFORM 1 FROM accounting_accounts a
    WHERE a.organization_id = OLD.organization_id AND a.id IN (SELECT account_id FROM accounting_journal_lines WHERE organization_id = OLD.organization_id AND journal_id = OLD.id)
    ORDER BY a.id FOR SHARE;
  IF EXISTS (SELECT 1 FROM accounting_journal_lines l JOIN accounting_accounts a ON a.organization_id = l.organization_id AND a.id = l.account_id
             WHERE l.organization_id = OLD.organization_id AND l.journal_id = OLD.id AND (a.status <> 'active' OR NOT a.is_postable)) THEN
    RAISE EXCEPTION 'account_not_active';
  END IF;
  IF OLD.journal_type = 'reversal' THEN
    -- A reversal mirrors exactly one posted journal: same accounts, dimensions and amounts, sides swapped.
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
CREATE TRIGGER accounting_journals_guard BEFORE UPDATE OR DELETE ON accounting_journals FOR EACH ROW EXECUTE FUNCTION accounting_journal_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Commands. Each takes the organization and actor from the verified application context.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION accounting_event(org text, etype text, eid text, actor text, staff uuid, act text, from_s text, to_s text, ver integer, note text, changes jsonb, key text, correlation text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO accounting_events (organization_id, entity_type, entity_id, actor_clerk_user_id, actor_staff_id, action, from_status, to_status, version, note, changes, idempotency_key, correlation_id)
  VALUES (org, etype, eid, actor, staff, act, from_s, to_s, ver, note, coalesce(changes, '{}'::jsonb), key, correlation);
  INSERT INTO audit_logs (organization_id, actor_clerk_user_id, actor_type, action, entity_type, entity_id, changes, request_id)
  VALUES (org, actor, 'staff', 'accounting.' || etype || '.' || act, 'accounting_' || etype, eid, jsonb_build_object('from', from_s, 'to', to_s, 'version', ver), correlation);
$$;
--> statement-breakpoint
-- True when this idempotency key already completed the same command on the same record.
CREATE OR REPLACE FUNCTION accounting_replay(org text, key text, etype text, eid text, act text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE ev accounting_events;
BEGIN
  IF nullif(key, '') IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO ev FROM accounting_events WHERE organization_id = org AND idempotency_key = key;
  IF NOT FOUND THEN RETURN false; END IF;
  IF ev.entity_type <> etype OR ev.entity_id <> eid OR ev.action <> act THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN true;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_is_uuid(v text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(v, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_policy_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); existing accounting_policy_versions; v integer; pid uuid; clean text := trim(coalesce(p->>'note', ''));
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':accounting_policy', 0));
  SELECT * INTO existing FROM accounting_policy_versions WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF existing.proposed_by_id <> staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', existing.id, 'version', existing.version, 'already', true);
  END IF;
  IF coalesce(p->>'functionalCurrency', '') NOT IN ('UGX','USD') THEN RAISE EXCEPTION 'invalid_accounting_policy'; END IF;
  IF coalesce(p->>'fiscalYearStartMonth', '') !~ '^(1[0-2]|[1-9])$' THEN RAISE EXCEPTION 'invalid_accounting_policy'; END IF;
  IF coalesce(p->>'manualPostingEnabled', '') NOT IN ('true','false') THEN RAISE EXCEPTION 'invalid_accounting_policy'; END IF;
  IF length(clean) < 5 OR length(clean) > 2000 THEN RAISE EXCEPTION 'accounting_note_required'; END IF;
  IF EXISTS (SELECT 1 FROM accounting_policy_versions WHERE organization_id = org AND status = 'proposed') THEN RAISE EXCEPTION 'accounting_policy_proposal_pending'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v FROM accounting_policy_versions WHERE organization_id = org;
  INSERT INTO accounting_policy_versions (organization_id, version, functional_currency, fiscal_year_start_month, manual_posting_enabled, status, note, proposed_by_id, idempotency_key)
  VALUES (org, v, p->>'functionalCurrency', (p->>'fiscalYearStartMonth')::integer, (p->>'manualPostingEnabled')::boolean, 'proposed', clean, staff, key) RETURNING id INTO pid;
  PERFORM accounting_event(org, 'policy', pid::text, actor, staff, 'proposed', NULL, 'proposed', v, clean,
    jsonb_build_object('functionalCurrency', p->>'functionalCurrency', 'fiscalYearStartMonth', (p->>'fiscalYearStartMonth')::integer, 'manualPostingEnabled', (p->>'manualPostingEnabled')::boolean), NULL, correlation);
  RETURN jsonb_build_object('id', pid, 'version', v, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_policy_decide(org text, actor text, pid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); pr accounting_policy_versions; cur accounting_policy_versions; target text; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':accounting_policy', 0));
  SELECT * INTO pr FROM accounting_policy_versions WHERE organization_id = org AND id = pid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'accounting_policy_proposal_unavailable'; END IF;
  IF accounting_replay(org, key, 'policy', pid::text, decision) THEN RETURN jsonb_build_object('id', pid, 'status', pr.status, 'already', true); END IF;
  IF pr.status <> 'proposed' THEN RAISE EXCEPTION 'accounting_policy_proposal_unavailable'; END IF;
  IF length(coalesce(clean, '')) > 2000 THEN RAISE EXCEPTION 'note_too_long'; END IF;
  IF decision = 'approve' THEN
    IF pr.proposed_by_id = staff THEN RAISE EXCEPTION 'accounting_self_approval_denied'; END IF;
    cur := accounting_policy(org);
    IF cur.id IS NOT NULL THEN
      -- Restating history in another currency or year shape is a migration, not a setting change.
      IF cur.functional_currency <> pr.functional_currency AND EXISTS (SELECT 1 FROM accounting_journals WHERE organization_id = org AND status = 'posted') THEN
        RAISE EXCEPTION 'functional_currency_locked';
      END IF;
      IF cur.fiscal_year_start_month <> pr.fiscal_year_start_month AND EXISTS (SELECT 1 FROM accounting_periods WHERE organization_id = org) THEN
        RAISE EXCEPTION 'fiscal_year_locked';
      END IF;
      UPDATE accounting_policy_versions SET status = 'superseded' WHERE organization_id = org AND id = cur.id;
    END IF;
    target := 'approved';
  ELSE
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
    target := 'rejected';
  END IF;
  UPDATE accounting_policy_versions SET status = target, decided_by_id = staff, decided_at = now(), decision_note = clean WHERE organization_id = org AND id = pid;
  PERFORM accounting_event(org, 'policy', pid::text, actor, staff, decision, 'proposed', target, pr.version, clean, '{}'::jsonb, key, correlation);
  RETURN jsonb_build_object('id', pid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint
-- Validates and inserts one proposed account. Raises a message code on invalid input.
CREATE OR REPLACE FUNCTION accounting_account_insert(org text, staff uuid, p jsonb, key text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE acode text := upper(trim(coalesce(p->>'code', ''))); nm text := trim(coalesce(p->>'name', '')); typ text := coalesce(p->>'accountType', '');
  contra boolean; postable boolean; manual boolean; cls text := nullif(p->>'reportingClass', ''); cur text := nullif(p->>'currency', ''); par uuid; aid uuid;
BEGIN
  IF acode !~ '^[0-9]{3,8}(-[0-9A-Z]{1,6})?$' THEN RAISE EXCEPTION 'invalid_account_code'; END IF;
  IF length(nm) NOT BETWEEN 1 AND 120 OR length(coalesce(p->>'description', '')) > 1000 THEN RAISE EXCEPTION 'invalid_account'; END IF;
  IF typ NOT IN ('asset','liability','equity','income','cost_of_sales','operating_expense','other_income','other_expense') THEN RAISE EXCEPTION 'invalid_account_type'; END IF;
  IF coalesce(p->>'isContra', 'false') NOT IN ('true','false') OR coalesce(p->>'isPostable', 'true') NOT IN ('true','false') OR coalesce(p->>'manualPostingAllowed', 'true') NOT IN ('true','false') THEN
    RAISE EXCEPTION 'invalid_account';
  END IF;
  contra := coalesce(p->>'isContra', 'false')::boolean; postable := coalesce(p->>'isPostable', 'true')::boolean; manual := coalesce(p->>'manualPostingAllowed', 'true')::boolean;
  IF NOT ((cls IS NULL AND NOT postable) OR (typ || ':' || coalesce(cls, '')) IN (
    'asset:current_asset','asset:non_current_asset','liability:current_liability','liability:non_current_liability',
    'equity:equity','income:operating_revenue','cost_of_sales:cost_of_sales','operating_expense:operating_expense',
    'other_income:other_income','other_expense:other_expense','other_expense:finance_cost','other_expense:income_tax_expense')) THEN
    RAISE EXCEPTION 'invalid_reporting_class';
  END IF;
  IF cur IS NOT NULL AND cur NOT IN ('UGX','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  IF nullif(p->>'parentId', '') IS NOT NULL THEN
    IF NOT accounting_is_uuid(p->>'parentId') THEN RAISE EXCEPTION 'parent_account_invalid'; END IF;
    SELECT id INTO par FROM accounting_accounts WHERE organization_id = org AND id = (p->>'parentId')::uuid;
    IF par IS NULL THEN RAISE EXCEPTION 'parent_account_invalid'; END IF;
  ELSIF nullif(p->>'parentCode', '') IS NOT NULL THEN
    SELECT id INTO par FROM accounting_accounts WHERE organization_id = org AND code = upper(trim(p->>'parentCode'));
    IF par IS NULL THEN RAISE EXCEPTION 'parent_account_invalid'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM accounting_accounts aa WHERE aa.organization_id = org AND aa.code = acode) THEN RAISE EXCEPTION 'account_code_exists'; END IF;
  INSERT INTO accounting_accounts (organization_id, code, name, description, account_type, is_contra, normal_balance, reporting_class, parent_id, is_postable, manual_posting_allowed, currency, status, created_by_id, idempotency_key)
  VALUES (org, acode, nm, nullif(trim(coalesce(p->>'description', '')), ''), typ, contra,
    CASE WHEN (typ IN ('asset','cost_of_sales','operating_expense','other_expense')) <> contra THEN 'debit' ELSE 'credit' END,
    cls, par, postable, manual, cur, 'proposed', staff, key)
  RETURNING id INTO aid;
  RETURN aid;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'account_code_exists';
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_account_save(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); a accounting_accounts; aid uuid; nm text := trim(coalesce(p->>'name', ''));
  cls text := nullif(p->>'reportingClass', ''); cur text := nullif(p->>'currency', ''); par uuid; contra boolean; postable boolean; acode text; typ text;
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF nullif(p->>'id', '') IS NULL THEN
    SELECT * INTO a FROM accounting_accounts WHERE organization_id = org AND idempotency_key = key;
    IF FOUND THEN
      IF a.created_by_id <> staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
      RETURN jsonb_build_object('id', a.id, 'version', a.version, 'already', true);
    END IF;
    aid := accounting_account_insert(org, staff, p, key);
    SELECT * INTO a FROM accounting_accounts WHERE organization_id = org AND id = aid;
    PERFORM accounting_event(org, 'account', aid::text, actor, staff, 'created', NULL, 'proposed', 1, NULL,
      jsonb_build_object('code', a.code, 'name', a.name, 'accountType', a.account_type, 'parentId', a.parent_id), key, correlation);
    RETURN jsonb_build_object('id', aid, 'version', 1, 'already', false);
  END IF;
  IF NOT accounting_is_uuid(p->>'id') THEN RAISE EXCEPTION 'account_unavailable'; END IF;
  SELECT * INTO a FROM accounting_accounts WHERE organization_id = org AND id = (p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_unavailable'; END IF;
  IF accounting_replay(org, key, 'account', a.id::text, 'updated') THEN RETURN jsonb_build_object('id', a.id, 'version', a.version, 'already', true); END IF;
  IF a.version IS DISTINCT FROM (p->>'version')::integer THEN RAISE EXCEPTION 'stale_account'; END IF;
  IF length(nm) NOT BETWEEN 1 AND 120 OR length(coalesce(p->>'description', '')) > 1000 THEN RAISE EXCEPTION 'invalid_account'; END IF;
  IF cur IS NOT NULL AND cur NOT IN ('UGX','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  IF coalesce(p->>'manualPostingAllowed', 'true') NOT IN ('true','false') THEN RAISE EXCEPTION 'invalid_account'; END IF;
  IF a.status = 'proposed' THEN
    -- Proposed accounts may be restructured freely before approval.
    acode := upper(trim(coalesce(p->>'code', '')));
    typ := coalesce(p->>'accountType', '');
    IF acode !~ '^[0-9]{3,8}(-[0-9A-Z]{1,6})?$' THEN RAISE EXCEPTION 'invalid_account_code'; END IF;
    IF typ NOT IN ('asset','liability','equity','income','cost_of_sales','operating_expense','other_income','other_expense') THEN RAISE EXCEPTION 'invalid_account_type'; END IF;
    IF coalesce(p->>'isContra', 'false') NOT IN ('true','false') OR coalesce(p->>'isPostable', 'true') NOT IN ('true','false') THEN RAISE EXCEPTION 'invalid_account'; END IF;
    contra := coalesce(p->>'isContra', 'false')::boolean; postable := coalesce(p->>'isPostable', 'true')::boolean;
    IF nullif(p->>'parentId', '') IS NOT NULL THEN
      IF NOT accounting_is_uuid(p->>'parentId') THEN RAISE EXCEPTION 'parent_account_invalid'; END IF;
      SELECT aa.id INTO par FROM accounting_accounts aa WHERE aa.organization_id = org AND aa.id = (p->>'parentId')::uuid;
      IF par IS NULL THEN RAISE EXCEPTION 'parent_account_invalid'; END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM accounting_accounts aa WHERE aa.organization_id = org AND aa.code = acode AND aa.id <> a.id) THEN RAISE EXCEPTION 'account_code_exists'; END IF;
  ELSE
    -- After approval the code, type and position are fixed; only descriptive fields may change.
    IF (nullif(p->>'code', '') IS NOT NULL AND upper(trim(p->>'code')) <> a.code) OR (nullif(p->>'accountType', '') IS NOT NULL AND p->>'accountType' <> a.account_type) THEN
      RAISE EXCEPTION 'account_structure_locked';
    END IF;
    acode := a.code; typ := a.account_type; contra := a.is_contra; postable := a.is_postable; par := a.parent_id;
  END IF;
  BEGIN
    UPDATE accounting_accounts SET code = acode, account_type = typ, is_contra = contra,
      normal_balance = CASE WHEN (typ IN ('asset','cost_of_sales','operating_expense','other_expense')) <> contra THEN 'debit' ELSE 'credit' END,
      parent_id = par, is_postable = postable, name = nm, description = nullif(trim(coalesce(p->>'description', '')), ''), reporting_class = cls,
      manual_posting_allowed = coalesce(p->>'manualPostingAllowed', 'true')::boolean, currency = cur, version = version + 1, updated_at = now()
    WHERE organization_id = org AND id = a.id;
  EXCEPTION
    WHEN check_violation THEN RAISE EXCEPTION 'invalid_reporting_class';
    WHEN unique_violation THEN RAISE EXCEPTION 'account_code_exists';
  END;
  PERFORM accounting_event(org, 'account', a.id::text, actor, staff, 'updated', a.status, a.status, a.version + 1, NULL,
    jsonb_build_object('before', jsonb_build_object('code', a.code, 'name', a.name, 'accountType', a.account_type, 'reportingClass', a.reporting_class, 'manualPostingAllowed', a.manual_posting_allowed, 'currency', a.currency),
                       'after', jsonb_build_object('code', acode, 'name', nm, 'accountType', typ, 'reportingClass', cls, 'manualPostingAllowed', coalesce(p->>'manualPostingAllowed', 'true')::boolean, 'currency', cur)), key, correlation);
  RETURN jsonb_build_object('id', a.id, 'version', a.version + 1, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_account_command(org text, actor text, aid uuid, cmd text, expected integer, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); a accounting_accounts; target text; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF cmd NOT IN ('activate','deactivate','reactivate') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO a FROM accounting_accounts WHERE organization_id = org AND id = aid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_unavailable'; END IF;
  IF accounting_replay(org, key, 'account', aid::text, cmd) THEN RETURN jsonb_build_object('id', aid, 'status', a.status, 'already', true); END IF;
  IF a.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_account'; END IF;
  IF length(coalesce(clean, '')) > 2000 THEN RAISE EXCEPTION 'note_too_long'; END IF;
  IF cmd = 'activate' THEN
    IF a.status <> 'proposed' THEN RAISE EXCEPTION 'invalid_account_transition'; END IF;
    IF a.created_by_id = staff THEN RAISE EXCEPTION 'accounting_self_approval_denied'; END IF;
    UPDATE accounting_accounts SET status = 'active', activated_by_id = staff, activated_at = now(), version = version + 1, updated_at = now() WHERE organization_id = org AND id = aid;
    target := 'active';
  ELSIF cmd = 'deactivate' THEN
    IF a.status <> 'active' THEN RAISE EXCEPTION 'invalid_account_transition'; END IF;
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'deactivation_reason_required'; END IF;
    IF EXISTS (SELECT 1 FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id
               WHERE l.organization_id = org AND l.account_id = aid AND j.status IN ('submitted','approved')) THEN
      RAISE EXCEPTION 'account_in_pending_journals';
    END IF;
    UPDATE accounting_accounts SET status = 'inactive', deactivated_by_id = staff, deactivated_at = now(), deactivation_reason = clean, version = version + 1, updated_at = now() WHERE organization_id = org AND id = aid;
    target := 'inactive';
  ELSE
    IF a.status <> 'inactive' THEN RAISE EXCEPTION 'invalid_account_transition'; END IF;
    UPDATE accounting_accounts SET status = 'active', version = version + 1, updated_at = now() WHERE organization_id = org AND id = aid;
    target := 'active';
  END IF;
  PERFORM accounting_event(org, 'account', aid::text, actor, staff, cmd, a.status, target, a.version + 1, clean, jsonb_build_object('code', a.code), key, correlation);
  RETURN jsonb_build_object('id', aid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint
-- Loads a proposed chart (accounts in parent-first order). Existing codes are left untouched.
CREATE OR REPLACE FUNCTION accounting_chart_seed(org text, actor text, accounts jsonb, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); x jsonb; inserted integer := 0; skipped integer := 0;
BEGIN
  IF accounting_replay(org, key, 'chart', org, 'seeded') THEN RETURN jsonb_build_object('inserted', 0, 'skipped', 0, 'already', true); END IF;
  IF jsonb_typeof(accounts) <> 'array' OR jsonb_array_length(accounts) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_account'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':accounting_chart', 0));
  FOR x IN SELECT value FROM jsonb_array_elements(accounts) LOOP
    IF EXISTS (SELECT 1 FROM accounting_accounts WHERE organization_id = org AND code = upper(trim(coalesce(x->>'code', '')))) THEN
      skipped := skipped + 1;
    ELSE
      PERFORM accounting_account_insert(org, staff, x, NULL);
      inserted := inserted + 1;
    END IF;
  END LOOP;
  PERFORM accounting_event(org, 'chart', org, actor, staff, 'seeded', NULL, 'proposed', NULL, NULL, jsonb_build_object('inserted', inserted, 'skipped', skipped), key, correlation);
  RETURN jsonb_build_object('inserted', inserted, 'skipped', skipped, 'already', false);
END $$;
--> statement-breakpoint
-- Approves every proposed account that the approver did not create, parents before children.
CREATE OR REPLACE FUNCTION accounting_chart_approve(org text, actor text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); a accounting_accounts; total integer := 0; changed integer; own integer;
BEGIN
  IF accounting_replay(org, key, 'chart', org, 'approved') THEN RETURN jsonb_build_object('activated', 0, 'already', true); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':accounting_chart', 0));
  LOOP
    changed := 0;
    FOR a IN SELECT * FROM accounting_accounts c WHERE c.organization_id = org AND c.status = 'proposed' AND c.created_by_id <> staff
             AND (c.parent_id IS NULL OR EXISTS (SELECT 1 FROM accounting_accounts p WHERE p.organization_id = org AND p.id = c.parent_id AND p.status = 'active'))
             ORDER BY c.code FOR UPDATE LOOP
      UPDATE accounting_accounts SET status = 'active', activated_by_id = staff, activated_at = now(), version = version + 1, updated_at = now() WHERE organization_id = org AND id = a.id;
      PERFORM accounting_event(org, 'account', a.id::text, actor, staff, 'activate', 'proposed', 'active', a.version + 1, 'Approved with the chart', jsonb_build_object('code', a.code), NULL, correlation);
      changed := changed + 1;
    END LOOP;
    total := total + changed;
    EXIT WHEN changed = 0;
  END LOOP;
  SELECT count(*) INTO own FROM accounting_accounts WHERE organization_id = org AND status = 'proposed';
  PERFORM accounting_event(org, 'chart', org, actor, staff, 'approved', 'proposed', 'active', NULL, NULL, jsonb_build_object('activated', total, 'stillProposed', own), key, correlation);
  RETURN jsonb_build_object('activated', total, 'stillProposed', own, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_period_create(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); per accounting_periods; pid uuid; s date; e date; nm text := trim(coalesce(p->>'name', ''));
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO per FROM accounting_periods WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', per.id, 'already', true); END IF;
  IF (accounting_policy(org)).id IS NULL THEN RAISE EXCEPTION 'accounting_policy_required'; END IF;
  IF coalesce(p->>'startDate', '') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(p->>'endDate', '') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(p->>'fiscalYear', '') !~ '^\d{4}$' THEN RAISE EXCEPTION 'invalid_period'; END IF;
  s := (p->>'startDate')::date; e := (p->>'endDate')::date;
  IF e < s OR e - s > 371 OR length(nm) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'invalid_period'; END IF;
  IF EXISTS (SELECT 1 FROM accounting_periods WHERE organization_id = org AND name = nm) THEN RAISE EXCEPTION 'period_overlap'; END IF;
  INSERT INTO accounting_periods (organization_id, fiscal_year, name, start_date, end_date, created_by_id, idempotency_key)
  VALUES (org, (p->>'fiscalYear')::integer, nm, s, e, staff, key) RETURNING id INTO pid;
  PERFORM accounting_event(org, 'period', pid::text, actor, staff, 'created', NULL, 'open', 1, NULL, jsonb_build_object('name', nm, 'startDate', s, 'endDate', e), NULL, correlation);
  RETURN jsonb_build_object('id', pid, 'already', false);
END $$;
--> statement-breakpoint
-- Twelve monthly periods for one financial year, starting in the policy's approved month.
CREATE OR REPLACE FUNCTION accounting_period_generate_year(org text, actor text, fy integer, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); pol accounting_policy_versions := accounting_policy(org); s date; e date; i integer; created integer := 0; pid uuid; nm text;
BEGIN
  IF accounting_replay(org, key, 'fiscal_year', fy::text, 'generated') THEN RETURN jsonb_build_object('created', 0, 'already', true); END IF;
  IF pol.id IS NULL THEN RAISE EXCEPTION 'accounting_policy_required'; END IF;
  IF fy NOT BETWEEN 2000 AND 2200 THEN RAISE EXCEPTION 'invalid_period'; END IF;
  FOR i IN 0..11 LOOP
    s := (make_date(fy, pol.fiscal_year_start_month, 1) + make_interval(months => i))::date;
    e := (s + interval '1 month' - interval '1 day')::date;
    nm := 'FY' || fy || ' P' || lpad((i + 1)::text, 2, '0') || ' ' || to_char(s, 'Mon YYYY');
    INSERT INTO accounting_periods (organization_id, fiscal_year, name, start_date, end_date, created_by_id, idempotency_key)
    VALUES (org, fy, nm, s, e, staff, key || ':' || i) RETURNING id INTO pid;
    PERFORM accounting_event(org, 'period', pid::text, actor, staff, 'created', NULL, 'open', 1, NULL, jsonb_build_object('name', nm, 'startDate', s, 'endDate', e), NULL, correlation);
    created := created + 1;
  END LOOP;
  PERFORM accounting_event(org, 'fiscal_year', fy::text, actor, staff, 'generated', NULL, 'open', NULL, NULL,
    jsonb_build_object('startMonth', pol.fiscal_year_start_month, 'policyVersion', pol.version, 'periods', created), key, correlation);
  RETURN jsonb_build_object('created', created, 'already', false);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'period_overlap';
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_period_command(org text, actor text, pid uuid, cmd text, expected integer, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); per accounting_periods; target text; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF cmd NOT IN ('close','reopen') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO per FROM accounting_periods WHERE organization_id = org AND id = pid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'period_unavailable'; END IF;
  IF accounting_replay(org, key, 'period', pid::text, cmd) THEN RETURN jsonb_build_object('id', pid, 'status', per.status, 'already', true); END IF;
  IF per.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_period'; END IF;
  IF length(coalesce(clean, '')) > 2000 THEN RAISE EXCEPTION 'note_too_long'; END IF;
  IF cmd = 'close' THEN
    IF per.status <> 'open' THEN RAISE EXCEPTION 'invalid_period_transition'; END IF;
    UPDATE accounting_periods SET status = 'closed', closed_by_id = staff, closed_at = now(), close_note = clean, version = version + 1 WHERE organization_id = org AND id = pid;
    target := 'closed';
  ELSE
    IF per.status <> 'closed' THEN RAISE EXCEPTION 'invalid_period_transition'; END IF;
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'reopen_reason_required'; END IF;
    UPDATE accounting_periods SET status = 'open', reopened_by_id = staff, reopened_at = now(), reopen_reason = clean, version = version + 1 WHERE organization_id = org AND id = pid;
    target := 'open';
  END IF;
  PERFORM accounting_event(org, 'period', pid::text, actor, staff, cmd, per.status, target, per.version + 1, clean, jsonb_build_object('name', per.name), key, correlation);
  RETURN jsonb_build_object('id', pid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint
-- Replaces a draft's lines. Amounts are decimal strings; nothing is converted without an approved rate.
CREATE OR REPLACE FUNCTION accounting_journal_write_lines(org text, jid uuid, lines jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE x jsonb; n integer := 0; d numeric; c numeric; cur text; div text; proj uuid; r accounting_exchange_rates; rid uuid; rate numeric; rdate date; rsrc text;
BEGIN
  IF jsonb_typeof(lines) IS DISTINCT FROM 'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'journal_lines_required'; END IF;
  DELETE FROM accounting_journal_lines WHERE organization_id = org AND journal_id = jid;
  FOR x IN SELECT value FROM jsonb_array_elements(lines) LOOP
    n := n + 1;
    IF coalesce(nullif(x->>'debit', ''), '0') !~ '^\d{1,15}(\.\d{1,2})?$' OR coalesce(nullif(x->>'credit', ''), '0') !~ '^\d{1,15}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'invalid_journal_line'; END IF;
    d := coalesce(nullif(x->>'debit', ''), '0')::numeric; c := coalesce(nullif(x->>'credit', ''), '0')::numeric;
    IF NOT ((d > 0 AND c = 0) OR (c > 0 AND d = 0)) THEN RAISE EXCEPTION 'invalid_journal_line'; END IF;
    cur := x->>'currency';
    IF cur IS NULL OR cur NOT IN ('UGX','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
    IF length(coalesce(x->>'description', '')) > 300 THEN RAISE EXCEPTION 'invalid_journal_line'; END IF;
    IF NOT accounting_is_uuid(x->>'accountId') OR NOT EXISTS (SELECT 1 FROM accounting_accounts WHERE organization_id = org AND id = (x->>'accountId')::uuid) THEN
      RAISE EXCEPTION 'account_unavailable';
    END IF;
    div := nullif(x->>'division', '');
    IF div IS NOT NULL AND div NOT IN ('estates','architecture','painting','interiors','tech') THEN RAISE EXCEPTION 'invalid_division'; END IF;
    proj := NULL;
    IF nullif(x->>'projectId', '') IS NOT NULL THEN
      IF NOT accounting_is_uuid(x->>'projectId') THEN RAISE EXCEPTION 'project_unavailable'; END IF;
      SELECT id INTO proj FROM projects WHERE organization_id = org AND id = (x->>'projectId')::uuid AND archived_at IS NULL;
      IF proj IS NULL THEN RAISE EXCEPTION 'project_unavailable'; END IF;
    END IF;
    rid := NULL; rate := 1; rdate := NULL; rsrc := NULL;
    IF nullif(x->>'exchangeRateId', '') IS NOT NULL THEN
      IF NOT accounting_is_uuid(x->>'exchangeRateId') THEN RAISE EXCEPTION 'exchange_rate_unavailable'; END IF;
      SELECT * INTO r FROM accounting_exchange_rates WHERE organization_id = org AND id = (x->>'exchangeRateId')::uuid AND status = 'approved';
      IF NOT FOUND OR r.from_currency <> cur THEN RAISE EXCEPTION 'exchange_rate_unavailable'; END IF;
      rid := r.id; rate := r.rate; rdate := r.rate_date; rsrc := r.source;
      IF round(d * rate, 2) + round(c * rate, 2) <= 0 THEN RAISE EXCEPTION 'invalid_journal_line'; END IF;
    END IF;
    INSERT INTO accounting_journal_lines (organization_id, journal_id, line_number, account_id, description, currency, debit, credit, exchange_rate, exchange_rate_id, rate_date, rate_source, functional_debit, functional_credit, division, project_id)
    VALUES (org, jid, n, (x->>'accountId')::uuid, nullif(trim(coalesce(x->>'description', '')), ''), cur, d, c, rate, rid, rdate, rsrc, round(d * rate, 2), round(c * rate, 2), div, proj);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_journal_totals(org text, jid uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('lines', count(*), 'debit', coalesce(sum(functional_debit), 0)::text, 'credit', coalesce(sum(functional_credit), 0)::text,
    'currencies', coalesce(jsonb_agg(DISTINCT currency), '[]'::jsonb))
  FROM accounting_journal_lines WHERE organization_id = org AND journal_id = jid;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_journal_save(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); j accounting_journals; jid uuid; ed date; before jsonb;
  descr text := nullif(trim(coalesce(p->>'description', '')), ''); ref text := nullif(trim(coalesce(p->>'reference', '')), '');
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF coalesce(p->>'entryDate', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_entry_date'; END IF;
  ed := (p->>'entryDate')::date;
  IF descr IS NULL OR length(descr) > 500 THEN RAISE EXCEPTION 'journal_description_required'; END IF;
  IF length(coalesce(ref, '')) > 100 THEN RAISE EXCEPTION 'invalid_reference'; END IF;
  IF nullif(p->>'id', '') IS NULL THEN
    SELECT * INTO j FROM accounting_journals WHERE organization_id = org AND idempotency_key = key;
    IF NOT FOUND THEN
      INSERT INTO accounting_journals (organization_id, journal_type, status, entry_date, description, reference, prepared_by_id, idempotency_key)
      VALUES (org, 'manual', 'draft', ed, descr, ref, staff, key)
      ON CONFLICT (organization_id, idempotency_key) DO NOTHING RETURNING id INTO jid;
      IF jid IS NULL THEN SELECT * INTO j FROM accounting_journals WHERE organization_id = org AND idempotency_key = key; END IF;
    END IF;
    IF jid IS NULL THEN
      IF j.prepared_by_id <> staff OR j.reverses_journal_id IS NOT NULL THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
      RETURN jsonb_build_object('id', j.id, 'version', j.version, 'already', true);
    END IF;
    PERFORM accounting_journal_write_lines(org, jid, p->'lines');
    PERFORM accounting_event(org, 'journal', jid::text, actor, staff, 'created', NULL, 'draft', 1, NULL, accounting_journal_totals(org, jid), key, correlation);
    RETURN jsonb_build_object('id', jid, 'version', 1, 'already', false);
  END IF;
  IF NOT accounting_is_uuid(p->>'id') THEN RAISE EXCEPTION 'journal_unavailable'; END IF;
  SELECT * INTO j FROM accounting_journals WHERE organization_id = org AND id = (p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'journal_unavailable'; END IF;
  IF accounting_replay(org, key, 'journal', j.id::text, 'updated') THEN RETURN jsonb_build_object('id', j.id, 'version', j.version, 'already', true); END IF;
  IF j.journal_type <> 'manual' OR j.status <> 'draft' THEN RAISE EXCEPTION 'journal_not_editable'; END IF;
  IF j.prepared_by_id <> staff THEN RAISE EXCEPTION 'not_preparer'; END IF;
  IF j.version IS DISTINCT FROM (p->>'version')::integer THEN RAISE EXCEPTION 'stale_journal'; END IF;
  before := accounting_journal_totals(org, j.id) || jsonb_build_object('entryDate', j.entry_date, 'description', j.description);
  UPDATE accounting_journals SET entry_date = ed, description = descr, reference = ref, version = version + 1, updated_at = now() WHERE organization_id = org AND id = j.id;
  PERFORM accounting_journal_write_lines(org, j.id, p->'lines');
  PERFORM accounting_event(org, 'journal', j.id::text, actor, staff, 'updated', 'draft', 'draft', j.version + 1, NULL,
    jsonb_build_object('before', before, 'after', accounting_journal_totals(org, j.id) || jsonb_build_object('entryDate', ed, 'description', descr)), key, correlation);
  RETURN jsonb_build_object('id', j.id, 'version', j.version + 1, 'already', false);
END $$;
--> statement-breakpoint
-- Early, friendly balance check used before submission and approval. Posting re-checks everything.
CREATE OR REPLACE FUNCTION accounting_journal_check_balance(org text, jid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cnt integer; dr numeric; cr numeric;
BEGIN
  SELECT count(*), coalesce(sum(functional_debit), 0), coalesce(sum(functional_credit), 0) INTO cnt, dr, cr FROM accounting_journal_lines WHERE organization_id = org AND journal_id = jid;
  IF cnt < 2 THEN RAISE EXCEPTION 'journal_lines_required'; END IF;
  IF dr <> cr OR dr <= 0 OR EXISTS (SELECT 1 FROM accounting_journal_lines WHERE organization_id = org AND journal_id = jid GROUP BY currency HAVING sum(debit) <> sum(credit)) THEN
    RAISE EXCEPTION 'journal_unbalanced';
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_journal_command(org text, actor text, jid uuid, cmd text, expected integer, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); j accounting_journals; target text; clean text := nullif(trim(coalesce(note, '')), ''); per_status text;
BEGIN
  IF cmd NOT IN ('submit','withdraw','discard','approve','return','reject','post') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO j FROM accounting_journals WHERE organization_id = org AND id = jid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'journal_unavailable'; END IF;
  IF accounting_replay(org, key, 'journal', jid::text, cmd) THEN RETURN jsonb_build_object('id', jid, 'status', j.status, 'number', j.number, 'already', true); END IF;
  IF j.journal_type <> 'manual' THEN RAISE EXCEPTION 'invalid_journal_transition'; END IF;
  IF cmd = 'post' AND j.status = 'posted' THEN RAISE EXCEPTION 'journal_already_posted'; END IF;
  IF j.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_journal'; END IF;
  IF length(coalesce(clean, '')) > 2000 THEN RAISE EXCEPTION 'note_too_long'; END IF;
  IF cmd IN ('submit','withdraw','discard') THEN
    IF j.prepared_by_id <> staff THEN RAISE EXCEPTION 'not_preparer'; END IF;
    IF (cmd IN ('submit','discard') AND j.status <> 'draft') OR (cmd = 'withdraw' AND j.status <> 'submitted') THEN RAISE EXCEPTION 'invalid_journal_transition'; END IF;
    IF cmd = 'submit' THEN
      PERFORM accounting_journal_check_balance(org, jid);
      SELECT status INTO per_status FROM accounting_periods WHERE organization_id = org AND j.entry_date BETWEEN start_date AND end_date;
      IF per_status = 'closed' THEN RAISE EXCEPTION 'period_closed'; END IF;
    END IF;
    target := CASE cmd WHEN 'submit' THEN 'submitted' WHEN 'withdraw' THEN 'draft' ELSE 'discarded' END;
    UPDATE accounting_journals SET status = target,
      submitted_by_id = CASE WHEN cmd = 'submit' THEN staff ELSE submitted_by_id END,
      submitted_at = CASE WHEN cmd = 'submit' THEN now() ELSE submitted_at END,
      version = version + 1, updated_at = now()
    WHERE organization_id = org AND id = jid;
  ELSIF cmd IN ('approve','return','reject') THEN
    IF j.prepared_by_id = staff THEN RAISE EXCEPTION 'accounting_self_approval_denied'; END IF;
    IF (cmd IN ('approve','reject') AND j.status <> 'submitted') OR (cmd = 'return' AND j.status NOT IN ('submitted','approved')) THEN RAISE EXCEPTION 'invalid_journal_transition'; END IF;
    IF cmd IN ('return','reject') AND length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
    IF cmd = 'approve' THEN PERFORM accounting_journal_check_balance(org, jid); END IF;
    target := CASE cmd WHEN 'approve' THEN 'approved' WHEN 'return' THEN 'draft' ELSE 'rejected' END;
    UPDATE accounting_journals SET status = target,
      approved_by_id = CASE WHEN cmd = 'approve' THEN staff ELSE NULL END,
      approved_at = CASE WHEN cmd = 'approve' THEN now() ELSE NULL END,
      approved_version = CASE WHEN cmd = 'approve' THEN j.version + 1 ELSE NULL END,
      reviewed_by_id = staff, reviewed_at = now(), review_note = clean,
      version = version + 1, updated_at = now()
    WHERE organization_id = org AND id = jid;
  ELSE
    IF j.status <> 'approved' THEN RAISE EXCEPTION 'invalid_journal_transition'; END IF;
    -- The posting gate (accounting_journal_guard) validates, numbers and dates the entry.
    UPDATE accounting_journals SET status = 'posted', posted_by_id = staff, posted_at = now(), version = version + 1, updated_at = now() WHERE organization_id = org AND id = jid;
    target := 'posted';
  END IF;
  SELECT * INTO j FROM accounting_journals WHERE organization_id = org AND id = jid;
  PERFORM accounting_event(org, 'journal', jid::text, actor, staff, cmd, CASE WHEN cmd = 'withdraw' THEN 'submitted' WHEN cmd = 'post' THEN 'approved' WHEN cmd IN ('submit','discard') THEN 'draft' ELSE NULL END,
    target, j.version, clean, jsonb_build_object('number', j.number, 'totalDebit', j.total_debit, 'totalCredit', j.total_credit), key, correlation);
  RETURN jsonb_build_object('id', jid, 'status', target, 'number', j.number, 'version', j.version, 'already', false);
END $$;
--> statement-breakpoint
-- Reverses a posted journal with a new posted journal. The original is never changed or deleted.
CREATE OR REPLACE FUNCTION accounting_journal_reverse(org text, actor text, jid uuid, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); o accounting_journals; r accounting_journals; rid uuid; ed date; reason text := trim(coalesce(p->>'reason', ''));
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO o FROM accounting_journals WHERE organization_id = org AND id = jid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'journal_unavailable'; END IF;
  SELECT * INTO r FROM accounting_journals WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF r.reverses_journal_id IS DISTINCT FROM jid THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', r.id, 'number', r.number, 'already', true);
  END IF;
  IF o.status <> 'posted' THEN RAISE EXCEPTION 'journal_not_posted'; END IF;
  IF o.journal_type = 'reversal' THEN RAISE EXCEPTION 'reversal_of_reversal_denied'; END IF;
  IF EXISTS (SELECT 1 FROM accounting_journals WHERE organization_id = org AND reverses_journal_id = jid) THEN RAISE EXCEPTION 'journal_already_reversed'; END IF;
  IF length(reason) < 5 OR length(reason) > 300 THEN RAISE EXCEPTION 'reversal_reason_required'; END IF;
  IF nullif(p->>'entryDate', '') IS NULL THEN ed := finance_kampala_today();
  ELSIF p->>'entryDate' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_entry_date';
  ELSE ed := (p->>'entryDate')::date; END IF;
  IF ed < o.entry_date THEN RAISE EXCEPTION 'reversal_date_before_original'; END IF;
  INSERT INTO accounting_journals (organization_id, journal_type, status, entry_date, description, reference, reverses_journal_id, reversal_reason, prepared_by_id, idempotency_key)
  VALUES (org, 'reversal', 'draft', ed, left('Reversal of ' || o.number || ': ' || reason, 500), o.number, o.id, reason, staff, key) RETURNING id INTO rid;
  INSERT INTO accounting_journal_lines (organization_id, journal_id, line_number, account_id, description, currency, debit, credit, exchange_rate, exchange_rate_id, rate_date, rate_source, functional_debit, functional_credit, division, project_id)
  SELECT org, rid, line_number, account_id, description, currency, credit, debit, exchange_rate, exchange_rate_id, rate_date, rate_source, functional_credit, functional_debit, division, project_id
  FROM accounting_journal_lines WHERE organization_id = org AND journal_id = jid ORDER BY line_number;
  UPDATE accounting_journals SET status = 'posted', posted_by_id = staff, posted_at = now(), version = version + 1, updated_at = now() WHERE organization_id = org AND id = rid;
  SELECT * INTO r FROM accounting_journals WHERE organization_id = org AND id = rid;
  PERFORM accounting_event(org, 'journal', jid::text, actor, staff, 'reversed', 'posted', 'posted', o.version, reason, jsonb_build_object('reversalId', rid, 'reversalNumber', r.number, 'entryDate', ed), key, correlation);
  PERFORM accounting_event(org, 'journal', rid::text, actor, staff, 'posted', NULL, 'posted', r.version, reason, jsonb_build_object('number', r.number, 'reverses', o.number, 'totalDebit', r.total_debit), NULL, correlation);
  RETURN jsonb_build_object('id', rid, 'number', r.number, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_rate_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); x accounting_exchange_rates; rid uuid;
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO x FROM accounting_exchange_rates WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', x.id, 'already', true); END IF;
  IF coalesce(p->>'fromCurrency', '') NOT IN ('UGX','USD') OR coalesce(p->>'toCurrency', '') NOT IN ('UGX','USD') OR p->>'fromCurrency' = p->>'toCurrency' THEN RAISE EXCEPTION 'invalid_exchange_rate'; END IF;
  IF coalesce(p->>'rate', '') !~ '^\d{1,10}(\.\d{1,10})?$' OR (p->>'rate')::numeric <= 0 THEN RAISE EXCEPTION 'invalid_exchange_rate'; END IF;
  IF coalesce(p->>'rateDate', '') !~ '^\d{4}-\d{2}-\d{2}$' OR (p->>'rateDate')::date > finance_kampala_today() THEN RAISE EXCEPTION 'invalid_exchange_rate'; END IF;
  IF length(trim(coalesce(p->>'source', ''))) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'invalid_exchange_rate'; END IF;
  INSERT INTO accounting_exchange_rates (organization_id, from_currency, to_currency, rate, rate_date, source, entered_by_id, idempotency_key)
  VALUES (org, p->>'fromCurrency', p->>'toCurrency', (p->>'rate')::numeric, (p->>'rateDate')::date, trim(p->>'source'), staff, key) RETURNING id INTO rid;
  PERFORM accounting_event(org, 'exchange_rate', rid::text, actor, staff, 'proposed', NULL, 'proposed', NULL, NULL,
    jsonb_build_object('pair', (p->>'fromCurrency') || '/' || (p->>'toCurrency'), 'rate', p->>'rate', 'rateDate', p->>'rateDate', 'source', trim(p->>'source')), NULL, correlation);
  RETURN jsonb_build_object('id', rid, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_rate_decide(org text, actor text, rid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); x accounting_exchange_rates; target text; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO x FROM accounting_exchange_rates WHERE organization_id = org AND id = rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exchange_rate_unavailable'; END IF;
  IF accounting_replay(org, key, 'exchange_rate', rid::text, decision) THEN RETURN jsonb_build_object('id', rid, 'status', x.status, 'already', true); END IF;
  IF x.status <> 'proposed' THEN RAISE EXCEPTION 'exchange_rate_unavailable'; END IF;
  IF decision = 'approve' AND x.entered_by_id = staff THEN RAISE EXCEPTION 'accounting_self_approval_denied'; END IF;
  IF decision = 'reject' AND length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
  target := CASE decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
  BEGIN
    UPDATE accounting_exchange_rates SET status = target, decided_by_id = staff, decided_at = now(), decision_note = clean WHERE organization_id = org AND id = rid;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'exchange_rate_exists';
  END;
  PERFORM accounting_event(org, 'exchange_rate', rid::text, actor, staff, decision, 'proposed', target, NULL, clean, '{}'::jsonb, key, correlation);
  RETURN jsonb_build_object('id', rid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION accounting_rule_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); x accounting_posting_rules; v integer; rid uuid;
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO x FROM accounting_posting_rules WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', x.id, 'version', x.version, 'already', true); END IF;
  IF jsonb_typeof(p->'definition') IS DISTINCT FROM 'object' OR jsonb_typeof(p->'definition'->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'definition'->'lines') < 2 THEN RAISE EXCEPTION 'invalid_posting_rule'; END IF;
  IF coalesce(p->>'effectiveFrom', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_posting_rule'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':accounting_rule:' || coalesce(p->>'sourceType', ''), 0));
  SELECT coalesce(max(version), 0) + 1 INTO v FROM accounting_posting_rules WHERE organization_id = org AND source_type = p->>'sourceType';
  BEGIN
    INSERT INTO accounting_posting_rules (organization_id, source_type, version, description, definition, effective_from, proposed_by_id, idempotency_key)
    VALUES (org, p->>'sourceType', v, trim(coalesce(p->>'description', '')), p->'definition', (p->>'effectiveFrom')::date, staff, key) RETURNING id INTO rid;
  EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'invalid_posting_rule';
  END;
  PERFORM accounting_event(org, 'posting_rule', rid::text, actor, staff, 'proposed', NULL, 'proposed', v, NULL, jsonb_build_object('sourceType', p->>'sourceType'), NULL, correlation);
  RETURN jsonb_build_object('id', rid, 'version', v, 'already', false);
END $$;
--> statement-breakpoint
-- Approving a rule records an accountant's decision. It does not post anything: automatic
-- posting is disabled by the policy CHECK constraint in this phase.
CREATE OR REPLACE FUNCTION accounting_rule_decide(org text, actor text, rid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); x accounting_posting_rules; target text; clean text := nullif(trim(coalesce(note, '')), ''); rcode text;
BEGIN
  IF decision NOT IN ('approve','reject','retire') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO x FROM accounting_posting_rules WHERE organization_id = org AND id = rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'posting_rule_unavailable'; END IF;
  IF accounting_replay(org, key, 'posting_rule', rid::text, decision) THEN RETURN jsonb_build_object('id', rid, 'status', x.status, 'already', true); END IF;
  IF (decision IN ('approve','reject') AND x.status <> 'proposed') OR (decision = 'retire' AND x.status <> 'approved') THEN RAISE EXCEPTION 'posting_rule_unavailable'; END IF;
  IF decision = 'approve' THEN
    IF x.proposed_by_id = staff THEN RAISE EXCEPTION 'accounting_self_approval_denied'; END IF;
    -- Every fixed account code named by the rule must be an active, postable account.
    FOR rcode IN SELECT DISTINCT c.v FROM jsonb_array_elements(x.definition->'lines') AS l(item),
                LATERAL (SELECT l.item->'account'->>'code' AS v UNION ALL SELECT e.value FROM jsonb_each_text(coalesce(l.item->'account'->'byDivision', '{}'::jsonb)) AS e) AS c
                WHERE c.v IS NOT NULL LOOP
      IF NOT EXISTS (SELECT 1 FROM accounting_accounts aa WHERE aa.organization_id = org AND aa.code = rcode AND aa.status = 'active' AND aa.is_postable) THEN
        RAISE EXCEPTION 'posting_rule_invalid_account';
      END IF;
    END LOOP;
    UPDATE accounting_posting_rules SET status = 'retired', retired_at = now() WHERE organization_id = org AND source_type = x.source_type AND status = 'approved';
  END IF;
  IF decision = 'reject' AND length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
  target := CASE decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'retired' END;
  IF decision = 'retire' THEN
    UPDATE accounting_posting_rules SET status = 'retired', retired_at = now() WHERE organization_id = org AND id = rid;
  ELSE
    UPDATE accounting_posting_rules SET status = target, decided_by_id = staff, decided_at = now(), decision_note = clean WHERE organization_id = org AND id = rid;
  END IF;
  PERFORM accounting_event(org, 'posting_rule', rid::text, actor, staff, decision, x.status, target, x.version, clean, jsonb_build_object('sourceType', x.source_type), key, correlation);
  RETURN jsonb_build_object('id', rid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint
-- Trial balance from posted journals only, in functional currency, as at a date.
CREATE OR REPLACE FUNCTION accounting_trial_balance(org text, as_of date)
RETURNS TABLE (account_id uuid, code text, name text, account_type text, normal_balance text, currency text, debit numeric, credit numeric, balance_debit numeric, balance_credit numeric)
LANGUAGE sql STABLE AS $$
  SELECT a.id, a.code, a.name, a.account_type, a.normal_balance, j.functional_currency,
    sum(l.functional_debit), sum(l.functional_credit),
    greatest(sum(l.functional_debit) - sum(l.functional_credit), 0), greatest(sum(l.functional_credit) - sum(l.functional_debit), 0)
  FROM accounting_journal_lines l
  JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id
  JOIN accounting_accounts a ON a.organization_id = l.organization_id AND a.id = l.account_id
  WHERE l.organization_id = org AND j.status = 'posted' AND j.entry_date <= as_of
  GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance, j.functional_currency
  ORDER BY a.code, j.functional_currency;
$$;
