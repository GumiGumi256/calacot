-- Phase 2F: staging-only historical migration (additive only).
--
-- Opening balances and subledger schedules from whatever source Calacot actually holds (accounting
-- software export, spreadsheet or an accountant's schedule) are loaded into STAGING tables, mapped,
-- reconciled and approved by two people. Nothing here writes to the general ledger: there is no
-- function that posts a staged batch. Turning an approved batch into an opening journal is a separate,
-- reviewed activation step (docs/CALACOT_ACCOUNTING_MIGRATION_PLAN.md).
--
-- No existing table, constraint, trigger or function is altered.

CREATE TABLE migration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  batch_id uuid NOT NULL,
  actor_clerk_user_id text NOT NULL,
  actor_staff_id uuid,
  action text NOT NULL,
  note text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, actor_staff_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX migration_events_idempotency_uq ON migration_events (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER migration_events_immutable BEFORE UPDATE OR DELETE ON migration_events FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER migration_events_no_truncate BEFORE TRUNCATE ON migration_events FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION migration_event(org text, bid uuid, actor text, staff uuid, act text, note text, changes jsonb, key text, correlation text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO migration_events (organization_id, batch_id, actor_clerk_user_id, actor_staff_id, action, note, changes, idempotency_key, correlation_id)
  VALUES (org, bid, actor, staff, act, nullif(trim(coalesce(note, '')), ''), coalesce(changes, '{}'::jsonb), key, correlation);
  INSERT INTO audit_logs (organization_id, actor_clerk_user_id, actor_type, action, entity_type, entity_id, changes, request_id)
  VALUES (org, actor, 'staff', 'migration.' || act, 'migration_batch', bid::text, coalesce(changes, '{}'::jsonb), correlation);
$$;
--> statement-breakpoint

CREATE TABLE migration_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  source_system text NOT NULL CHECK (source_system IN ('accounting_software','spreadsheet','accountant_schedule','audited_statements','other')),
  source_description text NOT NULL CHECK (length(trim(source_description)) BETWEEN 5 AND 500),
  cutoff_date date NOT NULL,
  evidence_reference text NOT NULL CHECK (length(trim(evidence_reference)) BETWEEN 3 AND 300),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','superseded')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  rows_sha256 text,
  validation jsonb,
  prepared_by_id uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  submitted_by_id uuid,
  submitted_at timestamptz,
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, submitted_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (decided_by_id IS NULL OR (decided_by_id <> prepared_by_id AND decided_by_id IS DISTINCT FROM submitted_by_id)),
  CHECK (status NOT IN ('submitted','approved') OR (rows_sha256 IS NOT NULL AND validation IS NOT NULL AND submitted_by_id IS NOT NULL)),
  CHECK (status NOT IN ('approved','rejected') OR decided_by_id IS NOT NULL)
);
--> statement-breakpoint
-- One approved opening-balance batch per organization at a time.
CREATE UNIQUE INDEX migration_batches_one_approved_uq ON migration_batches (organization_id) WHERE status = 'approved';
--> statement-breakpoint
CREATE TRIGGER migration_batches_no_truncate BEFORE TRUNCATE ON migration_batches FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION migration_batch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'migration_history_immutable'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'invalid_migration_transition'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.prepared_by_id, NEW.prepared_at, NEW.idempotency_key) IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.prepared_by_id, OLD.prepared_at, OLD.idempotency_key)
     OR OLD.status IN ('approved','rejected','superseded') AND NOT (OLD.status = 'approved' AND NEW.status = 'superseded'
       AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status'))
     OR OLD.status = 'submitted' AND NEW.status NOT IN ('draft','approved','rejected')
     OR OLD.status = 'draft' AND NEW.status NOT IN ('draft','submitted')
     -- Batch details change only while it is a draft.
     OR OLD.status <> 'draft' AND (NEW.source_system, NEW.source_description, NEW.cutoff_date, NEW.evidence_reference)
        IS DISTINCT FROM (OLD.source_system, OLD.source_description, OLD.cutoff_date, OLD.evidence_reference) THEN
    RAISE EXCEPTION 'invalid_migration_transition';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER migration_batches_guard BEFORE INSERT OR UPDATE OR DELETE ON migration_batches FOR EACH ROW EXECUTE FUNCTION migration_batch_guard();
--> statement-breakpoint

CREATE TABLE migration_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  batch_id uuid NOT NULL,
  row_kind text NOT NULL CHECK (row_kind IN ('trial_balance','receivable','customer_advance','payable','supplier_advance','bank_balance','fixed_asset','tax_balance')),
  -- The identifier in the source records (account number, invoice number, asset tag...), kept as is.
  source_ref text NOT NULL CHECK (length(source_ref) BETWEEN 1 AND 200),
  source_account text CHECK (source_account IS NULL OR length(source_account) <= 200),
  account_id uuid,
  counterparty text CHECK (counterparty IS NULL OR length(counterparty) <= 200),
  document_number text CHECK (document_number IS NULL OR length(document_number) <= 100),
  document_date date,
  currency text NOT NULL CHECK (currency IN ('UGX','USD')),
  -- Trial balance: signed, debit positive. Schedules: the outstanding amount, positive.
  amount numeric(17,2) NOT NULL,
  -- Fixed assets: {"cost": "...", "accumulated": "...", "acquired": "YYYY-MM-DD"}.
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  UNIQUE (organization_id, batch_id, row_kind, source_ref),
  FOREIGN KEY (organization_id, batch_id) REFERENCES migration_batches(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  CHECK (row_kind = 'trial_balance' OR amount >= 0),
  CHECK (row_kind NOT IN ('trial_balance','bank_balance','tax_balance') OR account_id IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX migration_rows_batch_idx ON migration_rows (organization_id, batch_id, row_kind);
--> statement-breakpoint
CREATE TRIGGER migration_rows_no_truncate BEFORE TRUNCATE ON migration_rows FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Rows change only while their batch is a draft, and only inside migration_rows_replace.
CREATE OR REPLACE FUNCTION migration_rows_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM migration_batches WHERE organization_id = coalesce(NEW.organization_id, OLD.organization_id) AND id = coalesce(NEW.batch_id, OLD.batch_id);
  IF st IS DISTINCT FROM 'draft' OR coalesce(current_setting('calacot.migration_rows', true), '') <> 'on' THEN RAISE EXCEPTION 'migration_rows_locked'; END IF;
  RETURN coalesce(NEW, OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER migration_rows_guard BEFORE INSERT OR UPDATE OR DELETE ON migration_rows FOR EACH ROW EXECUTE FUNCTION migration_rows_guard();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION migration_batch_create(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); b migration_batches; bid uuid;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO b FROM migration_batches WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', b.id, 'already', true); END IF;
  IF coalesce(p->>'cutoffDate', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_migration_batch'; END IF;
  INSERT INTO migration_batches (organization_id, source_system, source_description, cutoff_date, evidence_reference, prepared_by_id, idempotency_key)
  VALUES (org, p->>'sourceSystem', trim(coalesce(p->>'sourceDescription', '')), (p->>'cutoffDate')::date, trim(coalesce(p->>'evidenceReference', '')), staff, key) RETURNING id INTO bid;
  PERFORM migration_event(org, bid, actor, staff, 'created', NULL, jsonb_build_object('source', p->>'sourceSystem', 'cutoff', p->>'cutoffDate'), key, correlation);
  RETURN jsonb_build_object('id', bid, 'already', false);
EXCEPTION WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'invalid_migration_batch';
END $$;
--> statement-breakpoint
-- Replaces all rows of a draft batch (the loader is re-run until the batch validates).
CREATE OR REPLACE FUNCTION migration_rows_replace(org text, actor text, bid uuid, expected integer, rows jsonb, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); b migration_batches; x jsonb; n integer := 0; aid uuid; amt text;
BEGIN
  SELECT * INTO b FROM migration_batches WHERE organization_id = org AND id = bid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration_batch_unavailable'; END IF;
  IF key IS NOT NULL AND EXISTS (SELECT 1 FROM migration_events WHERE organization_id = org AND idempotency_key = key) THEN RETURN jsonb_build_object('id', bid, 'version', b.version, 'already', true); END IF;
  IF b.status <> 'draft' THEN RAISE EXCEPTION 'migration_rows_locked'; END IF;
  IF b.prepared_by_id <> staff THEN RAISE EXCEPTION 'not_preparer'; END IF;
  IF b.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_migration_batch'; END IF;
  IF jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_array_length(rows) > 20000 THEN RAISE EXCEPTION 'invalid_migration_rows'; END IF;
  PERFORM set_config('calacot.migration_rows', 'on', true);
  DELETE FROM migration_rows WHERE organization_id = org AND batch_id = bid;
  FOR x IN SELECT value FROM jsonb_array_elements(rows) LOOP
    n := n + 1;
    amt := x->>'amount';
    IF amt IS NULL OR amt !~ '^-?\d{1,15}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'invalid_migration_rows' USING DETAIL = 'row ' || n; END IF;
    aid := NULL;
    IF nullif(x->>'accountCode', '') IS NOT NULL THEN
      SELECT id INTO aid FROM accounting_accounts WHERE organization_id = org AND code = x->>'accountCode';
      IF aid IS NULL THEN RAISE EXCEPTION 'migration_account_unknown' USING DETAIL = 'row ' || n || ': ' || (x->>'accountCode'); END IF;
    END IF;
    INSERT INTO migration_rows (organization_id, batch_id, row_kind, source_ref, source_account, account_id, counterparty, document_number, document_date, currency, amount, details)
    VALUES (org, bid, x->>'kind', x->>'sourceRef', nullif(x->>'sourceAccount', ''), aid, nullif(x->>'counterparty', ''), nullif(x->>'documentNumber', ''),
      CASE WHEN coalesce(x->>'documentDate', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (x->>'documentDate')::date END, x->>'currency', amt::numeric, coalesce(x->'details', '{}'::jsonb));
  END LOOP;
  PERFORM set_config('calacot.migration_rows', 'off', true);
  UPDATE migration_batches SET version = version + 1 WHERE organization_id = org AND id = bid;
  PERFORM migration_event(org, bid, actor, staff, 'rows_loaded', NULL, jsonb_build_object('rows', n), key, correlation);
  RETURN jsonb_build_object('id', bid, 'rows', n, 'version', b.version + 1, 'already', false);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'migration_duplicate_source_ref';
  WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'invalid_migration_rows';
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION migration_rows_sha256(org text, bid uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(coalesce(string_agg(concat_ws('|', row_kind, source_ref, account_id, currency, amount::text, document_number, details::text), E'\n' ORDER BY row_kind, source_ref), ''), 'UTF8')), 'hex')
  FROM migration_rows WHERE organization_id = org AND batch_id = bid;
$$;
--> statement-breakpoint
-- Reconciles the staged trial balance with its own subledger schedules and with what the Calacot
-- system already holds, so nothing is counted twice. Every difference is shown; none is adjusted.
CREATE OR REPLACE FUNCTION migration_batch_validate(org text, bid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE b migration_batches; cls fs_classification_versions := fs_classification_current(org); cur text := (accounting_policy(org)).functional_currency;
  res jsonb := '[]'::jsonb; n integer; d jsonb; tb numeric; sched numeric; ready boolean := true; x jsonb; final jsonb := '[]'::jsonb;
  ctl_recv text := coalesce(accounting_integration_control_account(org, 'receivables'), '1200');
  ctl_pay text := coalesce(accounting_integration_control_account(org, 'payables'), '2110');
BEGIN
  SELECT * INTO b FROM migration_batches WHERE organization_id = org AND id = bid;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration_batch_unavailable'; END IF;

  SELECT count(*) INTO n FROM migration_rows WHERE organization_id = org AND batch_id = bid AND row_kind = 'trial_balance';
  res := res || fs_check('tb_present', 'An opening trial balance is loaded', n > 0, n, NULL, false);
  SELECT coalesce(sum(amount), 0) INTO tb FROM migration_rows WHERE organization_id = org AND batch_id = bid AND row_kind = 'trial_balance';
  res := res || fs_check('tb_balanced', 'Opening trial balance debits equal credits', tb = 0, tb, NULL, false);

  SELECT count(*), coalesce(jsonb_agg(DISTINCT r.currency), '[]'::jsonb) INTO n, d FROM migration_rows r WHERE r.organization_id = org AND r.batch_id = bid AND r.currency IS DISTINCT FROM cur;
  res := res || fs_check('functional_currency', 'All balances are in the approved functional currency (no conversion is performed)', cur IS NOT NULL AND n = 0, n, d, false);

  SELECT count(*), coalesce(jsonb_agg(DISTINCT a.code), '[]'::jsonb) INTO n, d FROM migration_rows r JOIN accounting_accounts a ON a.organization_id = r.organization_id AND a.id = r.account_id
    WHERE r.organization_id = org AND r.batch_id = bid AND (NOT a.is_postable OR a.status <> 'active');
  res := res || fs_check('accounts_postable', 'Every mapped account is an approved, active, postable account', n = 0, n, d, false);

  SELECT count(*), coalesce(jsonb_agg(DISTINCT a.code), '[]'::jsonb) INTO n, d FROM migration_rows r JOIN accounting_accounts a ON a.organization_id = r.organization_id AND a.id = r.account_id
    WHERE r.organization_id = org AND r.batch_id = bid AND r.row_kind = 'trial_balance' AND (cls.id IS NULL OR NOT (cls.mappings ? a.id::text));
  res := res || fs_check('accounts_classified', 'Every opening account is classified for the statements', cls.id IS NOT NULL AND n = 0, n, d, false);

  -- Nothing may already be in the ledger on or before the cutoff: opening balances would duplicate it.
  SELECT count(*) INTO n FROM accounting_journals WHERE organization_id = org AND status IN ('submitted','approved','posted') AND entry_date <= b.cutoff_date;
  res := res || fs_check('ledger_empty_to_cutoff', 'No journal is dated on or before the cutoff', n = 0, n, NULL, false);
  SELECT count(*) INTO n FROM accounting_periods WHERE organization_id = org AND start_date = b.cutoff_date + 1;
  res := res || fs_check('cutoff_boundary', 'The cutoff is the day before an accounting period starts', n = 1, n, NULL, false);

  -- Subledger schedules agree with their trial-balance control accounts.
  SELECT coalesce(sum(r.amount), 0) INTO tb FROM migration_rows r JOIN accounting_accounts a ON a.organization_id = r.organization_id AND a.id = r.account_id
    WHERE r.organization_id = org AND r.batch_id = bid AND r.row_kind = 'trial_balance' AND a.code = ctl_recv;
  SELECT coalesce(sum(amount), 0) INTO sched FROM migration_rows WHERE organization_id = org AND batch_id = bid AND row_kind = 'receivable';
  res := res || fs_check('receivables', 'Open customer invoices agree with the receivables control account (' || ctl_recv || ')', tb = sched, tb - sched,
    jsonb_build_array(jsonb_build_object('trialBalance', tb::text, 'schedule', sched::text)), false);
  SELECT coalesce(-sum(r.amount), 0) INTO tb FROM migration_rows r JOIN accounting_accounts a ON a.organization_id = r.organization_id AND a.id = r.account_id
    WHERE r.organization_id = org AND r.batch_id = bid AND r.row_kind = 'trial_balance' AND a.code = ctl_pay;
  SELECT coalesce(sum(amount), 0) INTO sched FROM migration_rows WHERE organization_id = org AND batch_id = bid AND row_kind = 'payable';
  res := res || fs_check('payables', 'Unpaid supplier balances agree with the payables control account (' || ctl_pay || ')', tb = sched, tb - sched,
    jsonb_build_array(jsonb_build_object('trialBalance', tb::text, 'schedule', sched::text)), false);
  SELECT coalesce(-sum(r.amount), 0) INTO tb FROM migration_rows r WHERE r.organization_id = org AND r.batch_id = bid AND r.row_kind = 'trial_balance'
    AND cls.mappings->r.account_id::text->>'line' = 'customer_advances';
  SELECT coalesce(sum(amount), 0) INTO sched FROM migration_rows WHERE organization_id = org AND batch_id = bid AND row_kind = 'customer_advance';
  res := res || fs_check('customer_advances', 'Customer deposits and advances agree with their liability accounts', tb = sched, tb - sched,
    jsonb_build_array(jsonb_build_object('trialBalance', tb::text, 'schedule', sched::text)), false);
  SELECT coalesce(sum(amount), 0) INTO sched FROM migration_rows WHERE organization_id = org AND batch_id = bid AND row_kind = 'supplier_advance';
  SELECT coalesce(sum(r.amount), 0) INTO tb FROM migration_rows r WHERE r.organization_id = org AND r.batch_id = bid AND r.row_kind = 'trial_balance'
    AND cls.mappings->r.account_id::text->>'line' = 'advances_prepayments';
  res := res || fs_check('supplier_advances', 'Supplier advances do not exceed advances and prepayments', sched <= tb, tb - sched,
    jsonb_build_array(jsonb_build_object('trialBalance', tb::text, 'schedule', sched::text)), false);

  -- Bank and tax balances: per account, the schedule (statement or tax evidence) equals the trial balance.
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('account', a.code, 'trialBalance', t.v::text, 'schedule', s.v::text)), '[]'::jsonb) INTO n, d
  FROM (SELECT account_id, sum(amount) AS v FROM migration_rows WHERE organization_id = org AND batch_id = bid AND row_kind = 'bank_balance' GROUP BY account_id) s
  LEFT JOIN (SELECT account_id, sum(amount) AS v FROM migration_rows WHERE organization_id = org AND batch_id = bid AND row_kind = 'trial_balance' GROUP BY account_id) t ON t.account_id = s.account_id
  JOIN accounting_accounts a ON a.organization_id = org AND a.id = s.account_id
  WHERE coalesce(t.v, 0) <> s.v;
  res := res || fs_check('bank_balances', 'Bank and cash balances agree with statements or counts at the cutoff', n = 0, n, d, false);
  SELECT count(*) INTO n FROM migration_rows r WHERE r.organization_id = org AND r.batch_id = bid AND r.row_kind = 'trial_balance' AND r.amount <> 0
    AND cls.mappings->r.account_id::text->>'line' = 'cash_and_bank'
    AND NOT EXISTS (SELECT 1 FROM migration_rows s WHERE s.organization_id = org AND s.batch_id = bid AND s.row_kind = 'bank_balance' AND s.account_id = r.account_id);
  res := res || fs_check('bank_evidence', 'Every cash or bank balance has a statement or count at the cutoff', n = 0, n, NULL, false);
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('account', a.code, 'trialBalance', (-coalesce(t.v, 0))::text, 'schedule', s.v::text)), '[]'::jsonb) INTO n, d
  FROM (SELECT account_id, sum(amount) AS v FROM migration_rows WHERE organization_id = org AND batch_id = bid AND row_kind = 'tax_balance' GROUP BY account_id) s
  LEFT JOIN (SELECT account_id, sum(amount) AS v FROM migration_rows WHERE organization_id = org AND batch_id = bid AND row_kind = 'trial_balance' GROUP BY account_id) t ON t.account_id = s.account_id
  JOIN accounting_accounts a ON a.organization_id = org AND a.id = s.account_id
  WHERE abs(coalesce(t.v, 0)) <> s.v;
  res := res || fs_check('tax_balances', 'Tax liabilities and prepayments agree with tax evidence', n = 0, n, d, false);

  -- Fixed assets: register cost and accumulated depreciation agree with the trial balance.
  SELECT coalesce(sum((details->>'cost')::numeric), 0), coalesce(sum(amount), 0) INTO sched, tb FROM migration_rows WHERE organization_id = org AND batch_id = bid AND row_kind = 'fixed_asset';
  SELECT jsonb_build_object('registerCost', sched::text,
      'trialBalanceCost', coalesce((SELECT sum(r.amount) FROM migration_rows r WHERE r.organization_id = org AND r.batch_id = bid AND r.row_kind = 'trial_balance' AND cls.mappings->r.account_id::text->>'line' = 'ppe_cost'), 0)::text,
      'registerNet', tb::text,
      'trialBalanceNet', coalesce((SELECT sum(r.amount) FROM migration_rows r WHERE r.organization_id = org AND r.batch_id = bid AND r.row_kind = 'trial_balance' AND cls.mappings->r.account_id::text->>'line' IN ('ppe_cost','accumulated_depreciation')), 0)::text)
    INTO d;
  res := res || fs_check('fixed_assets', 'The opening asset register agrees with cost and accumulated depreciation', d->>'registerCost' = d->>'trialBalanceCost' AND d->>'registerNet' = d->>'trialBalanceNet', 0, jsonb_build_array(d), false);

  -- No double counting with records already in Calacot.
  SELECT count(*), coalesce(jsonb_agg(r.document_number), '[]'::jsonb) INTO n, d FROM migration_rows r JOIN invoices i ON i.organization_id = r.organization_id AND i.number = r.document_number
    WHERE r.organization_id = org AND r.batch_id = bid AND r.row_kind = 'receivable' AND i.status <> 'draft' AND accounting_kampala_date(i.issued_at) > b.cutoff_date;
  res := res || fs_check('receivables_after_cutoff', 'No opening receivable is a Calacot invoice issued after the cutoff', n = 0, n, d, false);
  SELECT count(*), coalesce(jsonb_agg(DISTINCT ev.event_type), '[]'::jsonb) INTO n, d FROM accounting_integration_events ev
    WHERE ev.organization_id = org AND ev.effective_date <= b.cutoff_date AND ev.status IN ('pending','posted','shadowed','blocked','failed');
  res := res || fs_check('source_events_before_cutoff', 'Source transactions dated on or before the cutoff are excluded from automatic posting (their effect is in the opening balances)', n = 0, n, d, false);
  SELECT count(*), coalesce(jsonb_agg(source_ref), '[]'::jsonb) INTO n, d FROM (SELECT DISTINCT r.source_ref FROM migration_rows r JOIN migration_batches o ON o.organization_id = r.organization_id AND o.id = r.batch_id
      WHERE r.organization_id = org AND o.id <> bid AND o.status = 'approved'
        AND EXISTS (SELECT 1 FROM migration_rows m WHERE m.organization_id = org AND m.batch_id = bid AND m.row_kind = r.row_kind AND m.source_ref = r.source_ref)) z;
  res := res || fs_check('approved_overlap', 'Information only: source records also present in the currently approved batch (this batch would supersede it)', NULL, n, d, true);

  -- Balances parked in opening balance equity need an accountant's explanation; shown, never hidden.
  SELECT coalesce(sum(r.amount), 0) INTO tb FROM migration_rows r WHERE r.organization_id = org AND r.batch_id = bid AND r.row_kind = 'trial_balance'
    AND cls.mappings->r.account_id::text->>'line' = 'opening_balance_equity';
  res := res || fs_check('opening_balance_equity', 'Information only: amount in opening balance equity (must be explained and cleared)', NULL, tb, NULL, true);

  FOR x IN SELECT value FROM jsonb_array_elements(res) LOOP
    IF x->>'status' = 'fail' THEN ready := false; END IF;
    final := final || x;
  END LOOP;
  RETURN jsonb_build_object('batchId', bid, 'cutoff', b.cutoff_date, 'checks', final, 'ready', ready, 'rowsSha256', migration_rows_sha256(org, bid),
    'rows', (SELECT coalesce(jsonb_object_agg(k, c), '{}'::jsonb) FROM (SELECT row_kind AS k, count(*) AS c FROM migration_rows WHERE organization_id = org AND batch_id = bid GROUP BY row_kind) q));
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION migration_batch_command(org text, actor text, bid uuid, cmd text, expected integer, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); b migration_batches; v jsonb; clean text := nullif(trim(coalesce(note, '')), ''); target text;
BEGIN
  IF cmd NOT IN ('submit','withdraw','approve','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':migration', 0));
  SELECT * INTO b FROM migration_batches WHERE organization_id = org AND id = bid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration_batch_unavailable'; END IF;
  IF key IS NOT NULL AND EXISTS (SELECT 1 FROM migration_events WHERE organization_id = org AND idempotency_key = key) THEN RETURN jsonb_build_object('id', bid, 'status', b.status, 'already', true); END IF;
  IF b.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_migration_batch'; END IF;
  IF cmd = 'submit' THEN
    IF b.status <> 'draft' THEN RAISE EXCEPTION 'invalid_migration_transition'; END IF;
    v := migration_batch_validate(org, bid);
    IF NOT (v->>'ready')::boolean THEN RAISE EXCEPTION 'migration_validation_failed'; END IF;
    UPDATE migration_batches SET status = 'submitted', submitted_by_id = staff, submitted_at = now(), validation = v, rows_sha256 = v->>'rowsSha256', version = version + 1 WHERE organization_id = org AND id = bid;
    target := 'submitted';
  ELSIF cmd = 'withdraw' THEN
    IF b.status <> 'submitted' OR b.prepared_by_id <> staff THEN RAISE EXCEPTION 'invalid_migration_transition'; END IF;
    UPDATE migration_batches SET status = 'draft', submitted_by_id = NULL, submitted_at = NULL, validation = NULL, rows_sha256 = NULL, version = version + 1 WHERE organization_id = org AND id = bid;
    target := 'draft';
  ELSE
    IF b.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_migration_transition'; END IF;
    IF staff = b.prepared_by_id OR staff = b.submitted_by_id THEN RAISE EXCEPTION 'migration_self_approval_denied'; END IF;
    IF cmd = 'reject' THEN
      IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
      UPDATE migration_batches SET status = 'rejected', decided_by_id = staff, decided_at = now(), decision_note = clean, version = version + 1 WHERE organization_id = org AND id = bid;
      target := 'rejected';
    ELSE
      -- Re-validate: the ledger, the chart or the operational records may have moved since submission.
      v := migration_batch_validate(org, bid);
      IF NOT (v->>'ready')::boolean THEN RAISE EXCEPTION 'migration_validation_failed'; END IF;
      IF v->>'rowsSha256' <> b.rows_sha256 THEN RAISE EXCEPTION 'migration_rows_changed'; END IF;
      UPDATE migration_batches SET status = 'superseded' WHERE organization_id = org AND status = 'approved';
      UPDATE migration_batches SET status = 'approved', decided_by_id = staff, decided_at = now(), decision_note = clean, validation = v, version = version + 1 WHERE organization_id = org AND id = bid;
      target := 'approved';
    END IF;
  END IF;
  PERFORM migration_event(org, bid, actor, staff, cmd, clean, jsonb_build_object('status', target), key, correlation);
  RETURN jsonb_build_object('id', bid, 'status', target, 'already', false);
END $$;
