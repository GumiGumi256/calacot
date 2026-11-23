-- Phase 2C: banking, cash management and bank reconciliation (additive only).
--
-- Nothing here alters an existing table, row, constraint or function. Invoices, payments, payment
-- allocations, expenses, disbursements and the Phase 2A/2B ledger keep working exactly as before.
--
-- Principles enforced by the database itself:
--   * There is one general ledger. Book balances are read only from POSTED accounting journal lines.
--     Cash operations and bank adjustments create ordinary MANUAL journals through the Phase 2A
--     functions, so balance, periods, immutability and two-person approval apply unchanged.
--   * Importing a statement never creates a journal. Statement rows are immutable source records.
--   * A match never changes the ledger. Matched amounts can never exceed what is available on a
--     statement line or a ledger line (row-locked, serialized per account, checked by triggers).
--   * A reconciliation can only be finalized by a second person when the balance equation holds
--     with no unmatched statement items and no unresolved duplicate reviews. Finalized figures are
--     kept forever in an append-only snapshot; reopening is audited.
--
-- Called through the Neon HTTP driver: each function call is one PostgreSQL transaction. Functions
-- are INVOKER. The application checks Clerk permissions; these functions and triggers enforce
-- record-level rules (ownership, segregation of duties, idempotency, availability, periods).

-- ---------------------------------------------------------------------------------------------
-- History and helpers
-- ---------------------------------------------------------------------------------------------

CREATE TABLE banking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  entity_type text NOT NULL CHECK (entity_type IN ('banking_account','bank_mapping','category_account','statement_import','statement_line','match','reconciliation','cash_transaction','cash_count','evidence')),
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
CREATE UNIQUE INDEX banking_events_idempotency_uq ON banking_events (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX banking_events_entity_idx ON banking_events (organization_id, entity_type, entity_id, created_at);
--> statement-breakpoint
CREATE TRIGGER banking_events_immutable BEFORE UPDATE OR DELETE ON banking_events FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER banking_events_no_truncate BEFORE TRUNCATE ON banking_events FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION banking_event(org text, etype text, eid text, actor text, staff uuid, act text, note text, changes jsonb, key text, correlation text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO banking_events (organization_id, entity_type, entity_id, actor_clerk_user_id, actor_staff_id, action, note, changes, idempotency_key, correlation_id)
  VALUES (org, etype, eid, actor, staff, act, nullif(trim(coalesce(note, '')), ''), coalesce(changes, '{}'::jsonb), key, correlation);
  INSERT INTO audit_logs (organization_id, actor_clerk_user_id, actor_type, action, entity_type, entity_id, changes, request_id)
  VALUES (org, actor, 'staff', 'banking.' || etype || '.' || act, etype, eid, coalesce(changes, '{}'::jsonb), correlation);
$$;
--> statement-breakpoint
-- True when this idempotency key already completed the same command on the same record.
CREATE OR REPLACE FUNCTION banking_replay(org text, key text, etype text, eid text, act text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE ev banking_events;
BEGIN
  IF key IS NULL OR length(key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO ev FROM banking_events WHERE organization_id = org AND idempotency_key = key;
  IF NOT FOUND THEN RETURN false; END IF;
  IF ev.entity_type <> etype OR ev.entity_id <> eid OR ev.action <> act THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN true;
END $$;
--> statement-breakpoint
-- Decimal money from untrusted text: at most 15 integer digits and 2 decimals, never a float.
CREATE OR REPLACE FUNCTION banking_money(v text, allow_negative boolean DEFAULT false) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF coalesce(v, '') !~ (CASE WHEN allow_negative THEN '^-?\d{1,15}(\.\d{1,2})?$' ELSE '^\d{1,15}(\.\d{1,2})?$' END) THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  RETURN v::numeric;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION banking_date(v text) RETURNS date LANGUAGE plpgsql STABLE AS $$
DECLARE d date;
BEGIN
  IF coalesce(v, '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_banking_date'; END IF;
  BEGIN d := v::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_banking_date'; END;
  IF to_char(d, 'YYYY-MM-DD') <> v THEN RAISE EXCEPTION 'invalid_banking_date'; END IF;
  IF d > finance_kampala_today() THEN RAISE EXCEPTION 'future_banking_date'; END IF;
  RETURN d;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION banking_norm(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(regexp_replace(coalesce(v, ''), '[^A-Za-z0-9]', '', 'g'));
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Banking accounts: the operational register of company money accounts.
-- Bank and mobile-money accounts wrap a VERIFIED Phase 1D finance account (one each, never twice).
-- Cash, petty cash and clearing accounts have no external identifier and are unique by label.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE banking_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  kind text NOT NULL CHECK (kind IN ('bank','mobile_money','cash','petty_cash','clearing')),
  finance_account_id uuid,
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  label_normalized text GENERATED ALWAYS AS (upper(regexp_replace(label, '[^A-Za-z0-9]', '', 'g'))) STORED,
  currency text NOT NULL CHECK (currency IN ('UGX','USD')),
  custodian_id uuid,
  float_amount numeric(17,2) CHECK (float_amount IS NULL OR float_amount > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, id, currency),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (organization_id, finance_account_id),
  FOREIGN KEY (organization_id, finance_account_id) REFERENCES finance_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, custodian_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK ((kind IN ('bank','mobile_money')) = (finance_account_id IS NOT NULL)),
  CHECK (kind NOT IN ('cash','petty_cash') OR custodian_id IS NOT NULL),
  CHECK (float_amount IS NULL OR kind = 'petty_cash'),
  CHECK (label_normalized <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX banking_accounts_label_uq ON banking_accounts (organization_id, kind, currency, label_normalized) WHERE finance_account_id IS NULL;
--> statement-breakpoint
CREATE TRIGGER banking_accounts_no_truncate BEFORE TRUNCATE ON banking_accounts FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION banking_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f finance_accounts;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'banking_history_immutable'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id, NEW.organization_id, NEW.kind, NEW.finance_account_id, NEW.currency, NEW.created_by_id, NEW.created_at, NEW.idempotency_key)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.kind, OLD.finance_account_id, OLD.currency, OLD.created_by_id, OLD.created_at, OLD.idempotency_key) THEN
    RAISE EXCEPTION 'banking_account_identity_immutable';
  END IF;
  IF NEW.finance_account_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.status = 'active') THEN
    SELECT * INTO f FROM finance_accounts WHERE organization_id = NEW.organization_id AND id = NEW.finance_account_id;
    IF NOT FOUND OR f.status <> 'active' OR f.currency <> NEW.currency
       OR f.method <> (CASE NEW.kind WHEN 'bank' THEN 'bank_transfer' WHEN 'mobile_money' THEN 'mobile_money' END) THEN
      RAISE EXCEPTION 'finance_account_unavailable';
    END IF;
  END IF;
  IF NEW.custodian_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.custodian_id IS DISTINCT FROM OLD.custodian_id)
     AND NOT EXISTS (SELECT 1 FROM staff_memberships WHERE organization_id = NEW.organization_id AND id = NEW.custodian_id AND status = 'active') THEN
    RAISE EXCEPTION 'custodian_unavailable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER banking_accounts_guard BEFORE INSERT OR UPDATE OR DELETE ON banking_accounts FOR EACH ROW EXECUTE FUNCTION banking_account_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION banking_account_register(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); b banking_accounts; f finance_accounts; bid uuid;
  k text := p->>'kind'; lbl text := nullif(trim(coalesce(p->>'label', '')), ''); cur text := p->>'currency'; cust uuid; flt numeric;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO b FROM banking_accounts WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF b.kind IS DISTINCT FROM k OR b.created_by_id <> staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', b.id, 'already', true);
  END IF;
  IF k IS NULL OR k NOT IN ('bank','mobile_money','cash','petty_cash','clearing') THEN RAISE EXCEPTION 'invalid_banking_kind'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':banking_account', 0));
  IF k IN ('bank','mobile_money') THEN
    IF NOT accounting_is_uuid(p->>'financeAccountId') THEN RAISE EXCEPTION 'finance_account_unavailable'; END IF;
    SELECT * INTO f FROM finance_accounts WHERE organization_id = org AND id = (p->>'financeAccountId')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'finance_account_unavailable'; END IF;
    IF EXISTS (SELECT 1 FROM banking_accounts WHERE organization_id = org AND finance_account_id = f.id) THEN RAISE EXCEPTION 'banking_account_exists'; END IF;
    cur := f.currency; lbl := coalesce(lbl, f.label);
  ELSE
    IF nullif(p->>'financeAccountId', '') IS NOT NULL THEN RAISE EXCEPTION 'finance_account_not_applicable'; END IF;
    IF cur IS NULL OR cur NOT IN ('UGX','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
    IF lbl IS NULL THEN RAISE EXCEPTION 'banking_label_required'; END IF;
    IF EXISTS (SELECT 1 FROM banking_accounts WHERE organization_id = org AND kind = k AND currency = cur AND finance_account_id IS NULL AND label_normalized = banking_norm(lbl)) THEN
      RAISE EXCEPTION 'banking_account_exists';
    END IF;
  END IF;
  IF k IN ('cash','petty_cash') THEN
    IF NOT accounting_is_uuid(p->>'custodianId') THEN RAISE EXCEPTION 'custodian_unavailable'; END IF;
    cust := (p->>'custodianId')::uuid;
  ELSIF nullif(p->>'custodianId', '') IS NOT NULL THEN RAISE EXCEPTION 'custodian_not_applicable';
  END IF;
  IF nullif(p->>'floatAmount', '') IS NOT NULL THEN
    IF k <> 'petty_cash' THEN RAISE EXCEPTION 'float_not_applicable'; END IF;
    flt := banking_money(p->>'floatAmount');
    IF flt <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  END IF;
  INSERT INTO banking_accounts (organization_id, kind, finance_account_id, label, currency, custodian_id, float_amount, created_by_id, idempotency_key)
  VALUES (org, k, f.id, lbl, cur, cust, flt, staff, key) RETURNING id INTO bid;
  PERFORM banking_event(org, 'banking_account', bid::text, actor, staff, 'registered', NULL,
    jsonb_build_object('kind', k, 'currency', cur, 'label', lbl, 'financeAccountId', f.id, 'custodianId', cust, 'floatAmount', flt), key, correlation);
  RETURN jsonb_build_object('id', bid, 'already', false);
END $$;
--> statement-breakpoint
-- update (custodian, petty cash float), deactivate, reactivate.
CREATE OR REPLACE FUNCTION banking_account_command(org text, actor text, bid uuid, cmd text, expected integer, p jsonb, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); b banking_accounts; note text := trim(coalesce(p->>'note', ''));
BEGIN
  IF cmd NOT IN ('update','deactivate','reactivate') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO b FROM banking_accounts WHERE organization_id = org AND id = bid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'banking_account_unavailable'; END IF;
  IF banking_replay(org, key, 'banking_account', bid::text, cmd) THEN RETURN jsonb_build_object('id', bid, 'already', true); END IF;
  IF b.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_banking_account'; END IF;
  IF length(note) < 5 OR length(note) > 2000 THEN RAISE EXCEPTION 'banking_note_required'; END IF;
  IF cmd = 'deactivate' THEN
    IF b.status <> 'active' THEN RAISE EXCEPTION 'invalid_banking_transition'; END IF;
    UPDATE banking_accounts SET status = 'inactive', version = version + 1, updated_at = now() WHERE organization_id = org AND id = bid;
  ELSIF cmd = 'reactivate' THEN
    IF b.status <> 'inactive' THEN RAISE EXCEPTION 'invalid_banking_transition'; END IF;
    UPDATE banking_accounts SET status = 'active', version = version + 1, updated_at = now() WHERE organization_id = org AND id = bid;
  ELSE
    IF b.kind IN ('cash','petty_cash') AND NOT accounting_is_uuid(p->>'custodianId') THEN RAISE EXCEPTION 'custodian_unavailable'; END IF;
    IF b.kind <> 'petty_cash' AND nullif(p->>'floatAmount', '') IS NOT NULL THEN RAISE EXCEPTION 'float_not_applicable'; END IF;
    UPDATE banking_accounts SET
      custodian_id = CASE WHEN b.kind IN ('cash','petty_cash') THEN (p->>'custodianId')::uuid ELSE NULL END,
      float_amount = CASE WHEN nullif(p->>'floatAmount', '') IS NULL THEN NULL ELSE banking_money(p->>'floatAmount') END,
      version = version + 1, updated_at = now()
    WHERE organization_id = org AND id = bid;
  END IF;
  PERFORM banking_event(org, 'banking_account', bid::text, actor, staff, cmd, note,
    jsonb_build_object('before', jsonb_build_object('status', b.status, 'custodianId', b.custodian_id, 'floatAmount', b.float_amount),
      'after', (SELECT jsonb_build_object('status', status, 'custodianId', custodian_id, 'floatAmount', float_amount) FROM banking_accounts WHERE organization_id = org AND id = bid)), key, correlation);
  RETURN jsonb_build_object('id', bid, 'already', false);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Ledger mappings: which general-ledger account represents each banking account.
-- Proposed by one person, decided by another. One approved mapping per banking account and per
-- ledger account. History is kept; a mapping is only ever retired, never edited or deleted.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE bank_account_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  banking_account_id uuid NOT NULL,
  ledger_account_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','retired')),
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 5 AND 2000),
  proposed_by_id uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  decision_key text CHECK (decision_key IS NULL OR length(decision_key) BETWEEN 1 AND 200),
  retired_by_id uuid,
  retired_at timestamptz,
  retire_reason text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (organization_id, decision_key),
  FOREIGN KEY (organization_id, banking_account_id) REFERENCES banking_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, ledger_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, proposed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, retired_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'proposed' AND decided_by_id IS NULL AND decided_at IS NULL AND decision_key IS NULL) OR (status <> 'proposed' AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND decision_key IS NOT NULL)),
  CHECK (decided_by_id IS NULL OR decided_by_id <> proposed_by_id),
  CHECK ((status = 'retired') = (retired_by_id IS NOT NULL AND retired_at IS NOT NULL AND length(trim(coalesce(retire_reason, ''))) >= 5))
);
--> statement-breakpoint
CREATE UNIQUE INDEX bank_mapping_approved_account_uq ON bank_account_mappings (organization_id, banking_account_id) WHERE status = 'approved';
--> statement-breakpoint
CREATE UNIQUE INDEX bank_mapping_approved_ledger_uq ON bank_account_mappings (organization_id, ledger_account_id) WHERE status = 'approved';
--> statement-breakpoint
CREATE TRIGGER bank_mapping_no_truncate BEFORE TRUNCATE ON bank_account_mappings FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- A banking ledger account must be an active, postable, non-contra asset that accepts manual
-- journals (cash operations post through the manual workflow) and matches the account currency.
CREATE OR REPLACE FUNCTION banking_ledger_eligible(org text, aid uuid, cur text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM accounting_accounts WHERE organization_id = org AND id = aid AND status = 'active' AND is_postable
    AND account_type = 'asset' AND NOT is_contra AND manual_posting_allowed AND (currency IS NULL OR currency = cur));
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bank_mapping_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b banking_accounts;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'banking_history_immutable'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'proposed' OR NEW.decided_by_id IS NOT NULL OR NEW.retired_by_id IS NOT NULL THEN RAISE EXCEPTION 'banking_history_immutable'; END IF;
  ELSE
    IF (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','decision_note','decision_key','retired_by_id','retired_at','retire_reason'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','decision_note','decision_key','retired_by_id','retired_at','retire_reason']) THEN
      RAISE EXCEPTION 'banking_history_immutable';
    END IF;
    IF NOT ((OLD.status = 'proposed' AND NEW.status IN ('approved','rejected'))
         OR (OLD.status = 'approved' AND NEW.status = 'retired' AND (NEW.decided_by_id, NEW.decided_at, NEW.decision_note, NEW.decision_key) IS NOT DISTINCT FROM (OLD.decided_by_id, OLD.decided_at, OLD.decision_note, OLD.decision_key))) THEN
      RAISE EXCEPTION 'banking_history_immutable';
    END IF;
  END IF;
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') THEN
    SELECT * INTO b FROM banking_accounts WHERE organization_id = NEW.organization_id AND id = NEW.banking_account_id FOR SHARE;
    PERFORM 1 FROM accounting_accounts WHERE organization_id = NEW.organization_id AND id = NEW.ledger_account_id FOR SHARE;
    IF b.id IS NULL OR b.status <> 'active' OR NOT banking_ledger_eligible(NEW.organization_id, NEW.ledger_account_id, b.currency) THEN
      RAISE EXCEPTION 'bank_mapping_invalid_account';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER bank_mapping_guard BEFORE INSERT OR UPDATE OR DELETE ON bank_account_mappings FOR EACH ROW EXECUTE FUNCTION bank_mapping_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bank_mapping_propose(org text, actor text, bid uuid, aid uuid, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); m bank_account_mappings; mid uuid; b banking_accounts;
BEGIN
  IF key IS NULL OR length(key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF length(trim(coalesce(note, ''))) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'banking_note_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':bank_mapping', 0));
  SELECT * INTO m FROM bank_account_mappings WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF (m.banking_account_id, m.ledger_account_id, m.proposed_by_id, m.note) IS DISTINCT FROM (bid, aid, staff, trim(note)) THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', m.id, 'already', true);
  END IF;
  SELECT * INTO b FROM banking_accounts WHERE organization_id = org AND id = bid AND status = 'active';
  IF NOT FOUND OR NOT banking_ledger_eligible(org, aid, b.currency) THEN RAISE EXCEPTION 'bank_mapping_invalid_account'; END IF;
  IF EXISTS (SELECT 1 FROM bank_account_mappings WHERE organization_id = org AND banking_account_id = bid AND status = 'proposed') THEN RAISE EXCEPTION 'bank_mapping_pending'; END IF;
  INSERT INTO bank_account_mappings (organization_id, banking_account_id, ledger_account_id, note, proposed_by_id, idempotency_key)
  VALUES (org, bid, aid, trim(note), staff, key) RETURNING id INTO mid;
  PERFORM banking_event(org, 'bank_mapping', mid::text, actor, staff, 'proposed', trim(note), jsonb_build_object('bankingAccountId', bid, 'ledgerAccountId', aid), key, correlation);
  RETURN jsonb_build_object('id', mid, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bank_mapping_decide(org text, actor text, mid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
#variable_conflict use_variable
DECLARE staff uuid := finance_staff(org, actor); m bank_account_mappings; target text; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF decision NOT IN ('approve','reject','retire') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  IF key IS NULL OR length(key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':bank_mapping', 0));
  IF banking_replay(org, key, 'bank_mapping', mid::text, decision) THEN
    SELECT * INTO m FROM bank_account_mappings WHERE organization_id = org AND id = mid;
    RETURN jsonb_build_object('id', mid, 'status', m.status, 'already', true);
  END IF;
  SELECT * INTO m FROM bank_account_mappings WHERE organization_id = org AND id = mid FOR UPDATE;
  IF NOT FOUND OR (decision IN ('approve','reject') AND m.status <> 'proposed') OR (decision = 'retire' AND m.status <> 'approved') THEN RAISE EXCEPTION 'bank_mapping_unavailable'; END IF;
  IF m.proposed_by_id = staff AND decision <> 'retire' THEN RAISE EXCEPTION 'accounting_self_approval_denied'; END IF;
  IF decision IN ('reject','retire') AND length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
  IF length(coalesce(clean, '')) > 2000 THEN RAISE EXCEPTION 'note_too_long'; END IF;
  IF decision = 'retire' THEN
    -- Retiring would orphan matches or an unfinished reconciliation that rely on this ledger account.
    IF EXISTS (SELECT 1 FROM bank_reconciliations WHERE organization_id = org AND banking_account_id = m.banking_account_id AND status <> 'finalized')
       OR EXISTS (SELECT 1 FROM bank_match_groups WHERE organization_id = org AND banking_account_id = m.banking_account_id AND status = 'active') THEN
      RAISE EXCEPTION 'bank_mapping_in_use';
    END IF;
    UPDATE bank_account_mappings SET status = 'retired', retired_by_id = staff, retired_at = now(), retire_reason = clean WHERE organization_id = org AND id = mid;
    target := 'retired';
  ELSE
    target := CASE WHEN decision = 'approve' THEN 'approved' ELSE 'rejected' END;
    UPDATE bank_account_mappings SET status = target, decided_by_id = staff, decided_at = now(), decision_note = clean, decision_key = key WHERE organization_id = org AND id = mid;
  END IF;
  PERFORM banking_event(org, 'bank_mapping', mid::text, actor, staff, decision, clean, jsonb_build_object('status', target, 'bankingAccountId', m.banking_account_id, 'ledgerAccountId', m.ledger_account_id), key, correlation);
  RETURN jsonb_build_object('id', mid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint
-- The approved ledger account of a banking account, or NULL.
CREATE OR REPLACE FUNCTION banking_ledger(org text, bid uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT ledger_account_id FROM bank_account_mappings WHERE organization_id = org AND banking_account_id = bid AND status = 'approved';
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION banking_ledger_required(org text, bid uuid) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE aid uuid := banking_ledger(org, bid);
BEGIN
  IF aid IS NULL THEN RAISE EXCEPTION 'banking_mapping_required'; END IF;
  RETURN aid;
END $$;
--> statement-breakpoint
-- Posted book balance (debit minus credit) of a banking account's ledger account in its currency.
CREATE OR REPLACE FUNCTION banking_book_balance(org text, bid uuid, as_of date) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT coalesce(sum(l.debit - l.credit), 0)
  FROM banking_accounts b
  JOIN accounting_journal_lines l ON l.organization_id = b.organization_id AND l.account_id = banking_ledger(b.organization_id, b.id) AND l.currency = b.currency
  JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id AND j.status = 'posted'
  WHERE b.organization_id = org AND b.id = bid AND (as_of IS NULL OR j.entry_date <= as_of);
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Category accounts: the approved ledger account for each kind of bank or cash adjustment.
-- Without an approved category account, no adjustment of that kind can be prepared.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE banking_category_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  category text NOT NULL CHECK (category IN ('bank_fee','interest_income','interest_expense','cash_shortage','cash_overage','staff_advances')),
  ledger_account_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','retired')),
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 5 AND 2000),
  proposed_by_id uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, ledger_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, proposed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'proposed') = (decided_by_id IS NULL AND decided_at IS NULL)),
  CHECK (decided_by_id IS NULL OR decided_by_id <> proposed_by_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX banking_category_approved_uq ON banking_category_accounts (organization_id, category) WHERE status = 'approved';
--> statement-breakpoint
CREATE TRIGGER banking_category_no_truncate BEFORE TRUNCATE ON banking_category_accounts FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- The account type each category must use. Staff advances are an asset, never an expense.
CREATE OR REPLACE FUNCTION banking_category_eligible(org text, cat text, aid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM accounting_accounts a WHERE a.organization_id = org AND a.id = aid AND a.status = 'active' AND a.is_postable AND a.manual_posting_allowed
    AND NOT EXISTS (SELECT 1 FROM bank_account_mappings m WHERE m.organization_id = org AND m.ledger_account_id = a.id AND m.status = 'approved')
    AND CASE cat
      WHEN 'bank_fee' THEN a.account_type IN ('operating_expense','other_expense')
      WHEN 'interest_expense' THEN a.account_type IN ('operating_expense','other_expense')
      WHEN 'cash_shortage' THEN a.account_type IN ('operating_expense','other_expense')
      WHEN 'interest_income' THEN a.account_type IN ('other_income','income')
      WHEN 'cash_overage' THEN a.account_type IN ('other_income','income')
      WHEN 'staff_advances' THEN a.account_type = 'asset' AND NOT a.is_contra
      ELSE false END);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION banking_category_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'banking_history_immutable'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'proposed' THEN RAISE EXCEPTION 'banking_history_immutable'; END IF;
  ELSE
    IF (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','decision_note']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','decision_note'])
       OR NOT ((OLD.status = 'proposed' AND NEW.status IN ('approved','rejected')) OR (OLD.status = 'approved' AND NEW.status = 'retired')) THEN
      RAISE EXCEPTION 'banking_history_immutable';
    END IF;
  END IF;
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') AND NOT banking_category_eligible(NEW.organization_id, NEW.category, NEW.ledger_account_id) THEN
    RAISE EXCEPTION 'banking_category_invalid_account';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER banking_category_guard BEFORE INSERT OR UPDATE OR DELETE ON banking_category_accounts FOR EACH ROW EXECUTE FUNCTION banking_category_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION banking_category_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); c banking_category_accounts; cid uuid; cat text := p->>'category';
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO c FROM banking_category_accounts WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF c.category IS DISTINCT FROM cat OR c.proposed_by_id <> staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', c.id, 'already', true);
  END IF;
  IF length(trim(coalesce(p->>'note', ''))) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'banking_note_required'; END IF;
  IF NOT accounting_is_uuid(p->>'ledgerAccountId') OR NOT banking_category_eligible(org, cat, (p->>'ledgerAccountId')::uuid) THEN RAISE EXCEPTION 'banking_category_invalid_account'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':banking_category', 0));
  IF EXISTS (SELECT 1 FROM banking_category_accounts WHERE organization_id = org AND category = cat AND status = 'proposed') THEN RAISE EXCEPTION 'banking_category_pending'; END IF;
  INSERT INTO banking_category_accounts (organization_id, category, ledger_account_id, note, proposed_by_id, idempotency_key)
  VALUES (org, cat, (p->>'ledgerAccountId')::uuid, trim(p->>'note'), staff, key) RETURNING id INTO cid;
  PERFORM banking_event(org, 'category_account', cid::text, actor, staff, 'proposed', trim(p->>'note'), jsonb_build_object('category', cat, 'ledgerAccountId', p->>'ledgerAccountId'), key, correlation);
  RETURN jsonb_build_object('id', cid, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION banking_category_decide(org text, actor text, cid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
#variable_conflict use_variable
DECLARE staff uuid := finance_staff(org, actor); c banking_category_accounts; target text; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF decision NOT IN ('approve','reject','retire') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':banking_category', 0));
  IF banking_replay(org, key, 'category_account', cid::text, decision) THEN RETURN jsonb_build_object('id', cid, 'already', true); END IF;
  SELECT * INTO c FROM banking_category_accounts WHERE organization_id = org AND id = cid FOR UPDATE;
  IF NOT FOUND OR (decision IN ('approve','reject') AND c.status <> 'proposed') OR (decision = 'retire' AND c.status <> 'approved') THEN RAISE EXCEPTION 'banking_category_unavailable'; END IF;
  IF c.proposed_by_id = staff AND decision <> 'retire' THEN RAISE EXCEPTION 'accounting_self_approval_denied'; END IF;
  IF decision IN ('reject','retire') AND length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
  target := CASE decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'retired' END;
  UPDATE banking_category_accounts SET status = target,
    decided_by_id = CASE WHEN decision = 'retire' THEN decided_by_id ELSE staff END,
    decided_at = CASE WHEN decision = 'retire' THEN decided_at ELSE now() END,
    decision_note = CASE WHEN decision = 'retire' THEN decision_note ELSE clean END
  WHERE organization_id = org AND id = cid;
  PERFORM banking_event(org, 'category_account', cid::text, actor, staff, decision, clean, jsonb_build_object('status', target, 'category', c.category), key, correlation);
  RETURN jsonb_build_object('id', cid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION banking_category_ledger(org text, cat text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE aid uuid;
BEGIN
  SELECT ledger_account_id INTO aid FROM banking_category_accounts WHERE organization_id = org AND category = cat AND status = 'approved';
  IF aid IS NULL THEN RAISE EXCEPTION 'banking_category_required'; END IF;
  RETURN aid;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Statement imports. The original file is kept in private storage (storage_key, SHA-256). A file
-- can be imported once per account. Rows are immutable; only their duplicate review can change.
-- Importing NEVER creates a journal.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE bank_statement_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  banking_account_id uuid NOT NULL,
  currency text NOT NULL,
  source_format text NOT NULL CHECK (source_format IN ('csv')),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  file_size integer NOT NULL CHECK (file_size BETWEEN 1 AND 2097152),
  storage_key text NOT NULL CHECK (length(storage_key) BETWEEN 1 AND 300),
  column_mapping jsonb NOT NULL,
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 10000),
  imported_count integer,
  duplicate_count integer,
  review_count integer,
  first_date date,
  last_date date,
  derived_opening_balance numeric(17,2),
  derived_closing_balance numeric(17,2),
  imported_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, id, banking_account_id),
  UNIQUE (organization_id, banking_account_id, file_sha256),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, banking_account_id, currency) REFERENCES banking_accounts(organization_id, id, currency) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, imported_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TRIGGER bank_statement_imports_no_truncate BEFORE TRUNCATE ON bank_statement_imports FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Totals are written once, in the creating transaction, after the rows are classified.
CREATE OR REPLACE FUNCTION bank_statement_import_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'banking_history_immutable'; END IF;
  IF OLD.imported_count IS NOT NULL
     OR (to_jsonb(NEW) - ARRAY['imported_count','duplicate_count','review_count','first_date','last_date','derived_opening_balance','derived_closing_balance'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['imported_count','duplicate_count','review_count','first_date','last_date','derived_opening_balance','derived_closing_balance']) THEN
    RAISE EXCEPTION 'banking_history_immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER bank_statement_imports_guard BEFORE UPDATE OR DELETE ON bank_statement_imports FOR EACH ROW EXECUTE FUNCTION bank_statement_import_guard();
--> statement-breakpoint
CREATE TABLE bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  import_id uuid NOT NULL,
  banking_account_id uuid NOT NULL,
  currency text NOT NULL,
  source_row integer NOT NULL CHECK (source_row BETWEEN 2 AND 10001),
  txn_date date NOT NULL,
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  reference text CHECK (reference IS NULL OR length(reference) <= 200),
  amount numeric(17,2) NOT NULL CHECK (amount <> 0),
  running_balance numeric(17,2),
  occurrence integer NOT NULL CHECK (occurrence >= 1),
  dedupe_key text NOT NULL CHECK (dedupe_key ~ '^[0-9a-f]{64}$'),
  review_status text NOT NULL CHECK (review_status IN ('active','needs_review','duplicate')),
  review_reason text CHECK (review_reason IS NULL OR review_reason IN ('exact_duplicate','possible_duplicate','in_finalized_period')),
  duplicate_of_id uuid,
  reviewed_by_id uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, id, banking_account_id),
  UNIQUE (organization_id, import_id, source_row),
  FOREIGN KEY (organization_id, import_id, banking_account_id) REFERENCES bank_statement_imports(organization_id, id, banking_account_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, banking_account_id, currency) REFERENCES banking_accounts(organization_id, id, currency) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, duplicate_of_id, banking_account_id) REFERENCES bank_statement_lines(organization_id, id, banking_account_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, reviewed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK ((review_status = 'needs_review') = (coalesce(review_reason IN ('possible_duplicate','in_finalized_period'), false) AND reviewed_by_id IS NULL)),
  CHECK (review_status <> 'duplicate' OR duplicate_of_id IS NOT NULL),
  CHECK (reviewed_by_id IS NULL OR (reviewed_at IS NOT NULL AND length(trim(coalesce(review_note, ''))) >= 5))
);
--> statement-breakpoint
-- The same statement transaction (account, date, amount, normalized text, occurrence) can be live
-- only once, even under concurrent overlapping imports.
CREATE UNIQUE INDEX bank_statement_lines_live_uq ON bank_statement_lines (organization_id, banking_account_id, dedupe_key) WHERE review_status IN ('active','needs_review');
--> statement-breakpoint
CREATE INDEX bank_statement_lines_account_date_idx ON bank_statement_lines (organization_id, banking_account_id, txn_date, amount);
--> statement-breakpoint
CREATE TRIGGER bank_statement_lines_no_truncate BEFORE TRUNCATE ON bank_statement_lines FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bank_statement_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'banking_history_immutable'; END IF;
  IF (to_jsonb(NEW) - ARRAY['review_status','duplicate_of_id','reviewed_by_id','reviewed_at','review_note'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['review_status','duplicate_of_id','reviewed_by_id','reviewed_at','review_note'])
     OR OLD.review_status <> 'needs_review' OR NEW.review_status NOT IN ('active','duplicate') OR NEW.reviewed_by_id IS NULL THEN
    RAISE EXCEPTION 'banking_history_immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER bank_statement_lines_guard BEFORE UPDATE OR DELETE ON bank_statement_lines FOR EACH ROW EXECUTE FUNCTION bank_statement_line_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION banking_line_key(bid uuid, d date, amt numeric, descr text, ref text, occ integer) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws('|', bid::text, d::text, trim(to_char(amt, 'FM999999999999990.00')), upper(regexp_replace(trim(descr), '\s+', ' ', 'g')), banking_norm(ref), occ::text), 'UTF8')), 'hex');
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Reconciliation periods (defined before matching: matches are locked by finalized periods).
-- One unfinished period per account; periods are contiguous and carry the statement balance
-- forward. Figures are recomputed from source data; finalized figures are snapshotted forever.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE bank_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  banking_account_id uuid NOT NULL,
  currency text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  opening_statement_balance numeric(17,2) NOT NULL,
  closing_statement_balance numeric(17,2) NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','finalized')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  prepared_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_by_id uuid,
  submitted_at timestamptz,
  finalized_by_id uuid,
  finalized_at timestamptz,
  review_note text,
  reopened_by_id uuid,
  reopened_at timestamptz,
  reopen_reason text,
  reopen_count integer NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, banking_account_id, period_start),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, banking_account_id, currency) REFERENCES banking_accounts(organization_id, id, currency) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, submitted_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, finalized_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, reopened_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (period_end >= period_start AND period_end - period_start <= 366),
  CHECK (status = 'in_progress' OR (submitted_by_id IS NOT NULL AND submitted_at IS NOT NULL)),
  CHECK ((status = 'finalized') = (finalized_by_id IS NOT NULL AND finalized_at IS NOT NULL)),
  -- Segregation of duties: the person who finalizes neither prepared nor submitted the period.
  CHECK (finalized_by_id IS NULL OR (finalized_by_id <> submitted_by_id AND finalized_by_id <> prepared_by_id)),
  CHECK (reopened_at IS NULL OR (reopened_by_id IS NOT NULL AND length(trim(coalesce(reopen_reason, ''))) >= 5))
);
--> statement-breakpoint
CREATE UNIQUE INDEX bank_reconciliations_one_open_uq ON bank_reconciliations (organization_id, banking_account_id) WHERE status <> 'finalized';
--> statement-breakpoint
CREATE TRIGGER bank_reconciliations_no_truncate BEFORE TRUNCATE ON bank_reconciliations FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bank_reconciliation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'banking_history_immutable'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'in_progress' OR NEW.submitted_by_id IS NOT NULL OR NEW.finalized_by_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_reconciliation_transition'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.banking_account_id, NEW.currency, NEW.period_start, NEW.opening_statement_balance, NEW.prepared_by_id, NEW.created_at, NEW.idempotency_key)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.banking_account_id, OLD.currency, OLD.period_start, OLD.opening_statement_balance, OLD.prepared_by_id, OLD.created_at, OLD.idempotency_key) THEN
    RAISE EXCEPTION 'banking_history_immutable';
  END IF;
  IF (NEW.period_end, NEW.closing_statement_balance) IS DISTINCT FROM (OLD.period_end, OLD.closing_statement_balance) AND NOT (OLD.status = 'in_progress' AND NEW.status = 'in_progress') THEN
    RAISE EXCEPTION 'reconciliation_locked';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'in_progress' AND NEW.status = 'submitted')
    OR (OLD.status = 'submitted' AND NEW.status IN ('in_progress','finalized'))
    OR (OLD.status = 'finalized' AND NEW.status = 'in_progress' AND NEW.reopen_count = OLD.reopen_count + 1)) THEN
    RAISE EXCEPTION 'invalid_reconciliation_transition';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER bank_reconciliations_guard BEFORE INSERT OR UPDATE OR DELETE ON bank_reconciliations FOR EACH ROW EXECUTE FUNCTION bank_reconciliation_guard();
--> statement-breakpoint
-- Every finalization, kept forever (a reopened period keeps its earlier finalized figures).
CREATE TABLE bank_reconciliation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  reconciliation_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 1),
  figures jsonb NOT NULL,
  prepared_by_id uuid NOT NULL,
  submitted_by_id uuid NOT NULL,
  finalized_by_id uuid NOT NULL,
  finalized_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, reconciliation_id, sequence),
  FOREIGN KEY (organization_id, reconciliation_id) REFERENCES bank_reconciliations(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, finalized_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TRIGGER bank_reconciliation_snapshots_immutable BEFORE UPDATE OR DELETE ON bank_reconciliation_snapshots FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER bank_reconciliation_snapshots_no_truncate BEFORE TRUNCATE ON bank_reconciliation_snapshots FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- The latest finalized reconciliation end date for an account (statement and match lock), or NULL.
CREATE OR REPLACE FUNCTION banking_locked_until(org text, bid uuid) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT max(period_end) FROM bank_reconciliations WHERE organization_id = org AND banking_account_id = bid AND status = 'finalized';
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Matching. A match group links statement lines and posted ledger lines (on the account's mapped
-- ledger account) with explicit amounts. Items are immutable; a group is only ever cancelled.
--   match            statement items = ledger items (one-to-one, one-to-many, many-to-one, partial)
--   statement_offset statement items that cancel out (a bank reversal and its original)
--   ledger_offset    ledger items that cancel out (a journal and its reversal)
--   opening_balance  ledger lines before the first period that make up its opening statement balance
--   adjustment       a statement line and the posted bank adjustment journal prepared for it
-- An item's amount can never exceed what remains available on its source line.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE bank_match_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  banking_account_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('match','statement_offset','ledger_offset','opening_balance','adjustment')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  effective_date date NOT NULL,
  partial boolean NOT NULL DEFAULT false,
  note text CHECK (note IS NULL OR length(note) <= 2000),
  created_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by_id uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, id, banking_account_id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, banking_account_id) REFERENCES banking_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, cancelled_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'cancelled') = (cancelled_by_id IS NOT NULL AND cancelled_at IS NOT NULL AND length(trim(coalesce(cancel_reason, ''))) >= 5)),
  CHECK (NOT partial OR length(trim(coalesce(note, ''))) >= 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX bank_match_one_opening_uq ON bank_match_groups (organization_id, banking_account_id) WHERE kind = 'opening_balance' AND status = 'active';
--> statement-breakpoint
CREATE INDEX bank_match_groups_account_idx ON bank_match_groups (organization_id, banking_account_id, status, effective_date);
--> statement-breakpoint
CREATE TRIGGER bank_match_groups_no_truncate BEFORE TRUNCATE ON bank_match_groups FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bank_match_group_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE locked date;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'banking_history_immutable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id || ':bank_match:' || NEW.banking_account_id, 0));
  locked := banking_locked_until(NEW.organization_id, NEW.banking_account_id);
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active' THEN RAISE EXCEPTION 'banking_history_immutable'; END IF;
  ELSE
    IF (to_jsonb(NEW) - ARRAY['status','cancelled_by_id','cancelled_at','cancel_reason']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','cancelled_by_id','cancelled_at','cancel_reason'])
       OR NOT (OLD.status = 'active' AND NEW.status = 'cancelled') THEN
      RAISE EXCEPTION 'banking_history_immutable';
    END IF;
  END IF;
  -- Matches that a finalized reconciliation relied on (or would rely on) are locked.
  IF locked IS NOT NULL AND NEW.effective_date <= locked THEN RAISE EXCEPTION 'match_in_finalized_period'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER bank_match_groups_guard BEFORE INSERT OR UPDATE OR DELETE ON bank_match_groups FOR EACH ROW EXECUTE FUNCTION bank_match_group_guard();
--> statement-breakpoint
CREATE TABLE bank_match_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL,
  banking_account_id uuid NOT NULL,
  statement_line_id uuid,
  journal_line_id uuid,
  amount numeric(17,2) NOT NULL CHECK (amount <> 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (group_id, statement_line_id),
  UNIQUE (group_id, journal_line_id),
  FOREIGN KEY (organization_id, group_id, banking_account_id) REFERENCES bank_match_groups(organization_id, id, banking_account_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, statement_line_id, banking_account_id) REFERENCES bank_statement_lines(organization_id, id, banking_account_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, journal_line_id) REFERENCES accounting_journal_lines(organization_id, id) ON DELETE RESTRICT,
  CHECK (num_nonnulls(statement_line_id, journal_line_id) = 1)
);
--> statement-breakpoint
CREATE INDEX bank_match_items_statement_idx ON bank_match_items (organization_id, statement_line_id) WHERE statement_line_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX bank_match_items_journal_idx ON bank_match_items (organization_id, journal_line_id) WHERE journal_line_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER bank_match_items_no_truncate BEFORE TRUNCATE ON bank_match_items FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Signed amount and date of a reconcilable ledger line: POSTED, on the account's approved ledger
-- account, in the account currency. Debits (money in) are positive. NULL when not reconcilable.
CREATE OR REPLACE FUNCTION banking_ledger_line(org text, bid uuid, lid uuid, OUT amount numeric, OUT entry_date date) LANGUAGE sql STABLE AS $$
  SELECT l.debit - l.credit, j.entry_date
  FROM accounting_journal_lines l
  JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id AND j.status = 'posted'
  JOIN banking_accounts b ON b.organization_id = l.organization_id AND b.id = bid AND b.currency = l.currency
  WHERE l.organization_id = org AND l.id = lid AND l.account_id = banking_ledger(org, bid);
$$;
--> statement-breakpoint
-- Availability: the sum of active items on a source line never exceeds the line, same sign.
CREATE OR REPLACE FUNCTION bank_match_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g bank_match_groups; total numeric; used numeric; st text;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'banking_history_immutable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id || ':bank_match:' || NEW.banking_account_id, 0));
  SELECT * INTO g FROM bank_match_groups WHERE organization_id = NEW.organization_id AND id = NEW.group_id;
  IF NOT FOUND OR g.status <> 'active' THEN RAISE EXCEPTION 'match_unavailable'; END IF;
  IF NEW.statement_line_id IS NOT NULL THEN
    SELECT amount, review_status INTO total, st FROM bank_statement_lines WHERE organization_id = NEW.organization_id AND id = NEW.statement_line_id AND banking_account_id = NEW.banking_account_id;
    IF total IS NULL OR st <> 'active' THEN RAISE EXCEPTION 'statement_line_unavailable'; END IF;
    SELECT coalesce(sum(i.amount), 0) INTO used FROM bank_match_items i JOIN bank_match_groups x ON x.organization_id = i.organization_id AND x.id = i.group_id AND x.status = 'active'
      WHERE i.organization_id = NEW.organization_id AND i.statement_line_id = NEW.statement_line_id;
  ELSE
    SELECT (banking_ledger_line(NEW.organization_id, NEW.banking_account_id, NEW.journal_line_id)).amount INTO total;
    IF total IS NULL THEN RAISE EXCEPTION 'ledger_line_unavailable'; END IF;
    SELECT coalesce(sum(i.amount), 0) INTO used FROM bank_match_items i JOIN bank_match_groups x ON x.organization_id = i.organization_id AND x.id = i.group_id AND x.status = 'active'
      WHERE i.organization_id = NEW.organization_id AND i.journal_line_id = NEW.journal_line_id;
  END IF;
  IF sign(NEW.amount) <> sign(total) THEN RAISE EXCEPTION 'match_sign_mismatch'; END IF;
  IF abs(used + NEW.amount) > abs(total) THEN RAISE EXCEPTION 'match_exceeds_available'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER bank_match_items_guard BEFORE INSERT OR UPDATE OR DELETE ON bank_match_items FOR EACH ROW EXECUTE FUNCTION bank_match_item_guard();
--> statement-breakpoint
-- Structural rules for a group, checked at commit for every writer (including direct SQL).
CREATE OR REPLACE FUNCTION bank_match_group_check(org text, gid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE g bank_match_groups; sc integer; ss numeric; lc integer; ls numeric; eff date; first_r bank_reconciliations; early integer;
BEGIN
  SELECT * INTO g FROM bank_match_groups WHERE organization_id = org AND id = gid;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*) FILTER (WHERE i.statement_line_id IS NOT NULL), coalesce(sum(i.amount) FILTER (WHERE i.statement_line_id IS NOT NULL), 0),
         count(*) FILTER (WHERE i.journal_line_id IS NOT NULL), coalesce(sum(i.amount) FILTER (WHERE i.journal_line_id IS NOT NULL), 0),
         greatest(max(s.txn_date), max(j.entry_date))
    INTO sc, ss, lc, ls, eff
    FROM bank_match_items i
    LEFT JOIN bank_statement_lines s ON s.organization_id = i.organization_id AND s.id = i.statement_line_id
    LEFT JOIN accounting_journal_lines l ON l.organization_id = i.organization_id AND l.id = i.journal_line_id
    LEFT JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id
    WHERE i.organization_id = org AND i.group_id = gid;
  IF g.kind IN ('match','adjustment') AND NOT (sc >= 1 AND lc >= 1 AND ss = ls) THEN RAISE EXCEPTION 'match_unbalanced'; END IF;
  IF g.kind = 'statement_offset' AND NOT (sc >= 2 AND lc = 0 AND ss = 0) THEN RAISE EXCEPTION 'match_unbalanced'; END IF;
  IF g.kind = 'ledger_offset' AND NOT (lc >= 2 AND sc = 0 AND ls = 0) THEN RAISE EXCEPTION 'match_unbalanced'; END IF;
  IF g.kind = 'opening_balance' THEN
    SELECT * INTO first_r FROM bank_reconciliations WHERE organization_id = org AND banking_account_id = g.banking_account_id ORDER BY period_start LIMIT 1;
    IF first_r.id IS NULL THEN RAISE EXCEPTION 'reconciliation_required_for_opening'; END IF;
    SELECT count(*) INTO early FROM bank_match_items i JOIN accounting_journal_lines l ON l.organization_id = i.organization_id AND l.id = i.journal_line_id
      JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id
      WHERE i.organization_id = org AND i.group_id = gid AND j.entry_date >= first_r.period_start;
    IF NOT (lc >= 1 AND sc = 0 AND early = 0 AND ls = first_r.opening_statement_balance) THEN RAISE EXCEPTION 'opening_match_invalid'; END IF;
    eff := first_r.period_start - 1;
  END IF;
  IF g.effective_date IS DISTINCT FROM eff THEN RAISE EXCEPTION 'match_effective_date_invalid'; END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bank_match_group_checked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM bank_match_group_check(NEW.organization_id, NEW.id);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bank_match_item_checked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM bank_match_group_check(NEW.organization_id, NEW.group_id);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER bank_match_groups_checked AFTER INSERT ON bank_match_groups DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bank_match_group_checked();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER bank_match_items_checked AFTER INSERT ON bank_match_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bank_match_item_checked();
--> statement-breakpoint
-- Matched amount of a source line through active groups effective on or before as_of (NULL: all).
CREATE OR REPLACE FUNCTION banking_matched(org text, sid uuid, jlid uuid, as_of date) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT coalesce(sum(i.amount), 0) FROM bank_match_items i
  JOIN bank_match_groups g ON g.organization_id = i.organization_id AND g.id = i.group_id AND g.status = 'active' AND (as_of IS NULL OR g.effective_date <= as_of)
  WHERE i.organization_id = org AND ((sid IS NOT NULL AND i.statement_line_id = sid) OR (jlid IS NOT NULL AND i.journal_line_id = jlid));
$$;
--> statement-breakpoint
-- Internal: inserts a validated group with its items. Items: [{statementLineId|journalLineId, amount}].
CREATE OR REPLACE FUNCTION banking_match_insert(org text, staff uuid, bid uuid, k text, items jsonb, note text, key text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE x jsonb; gid uuid; eff date; d date; amt numeric; src numeric; used numeric; partial boolean := false; first_r bank_reconciliations; sid uuid; jid uuid; residuals jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(items) IS DISTINCT FROM 'array' OR jsonb_array_length(items) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'match_items_required'; END IF;
  -- Validate items and derive the effective date before writing anything.
  FOR x IN SELECT value FROM jsonb_array_elements(items) LOOP
    sid := NULL; jid := NULL;
    amt := banking_money(x->>'amount', true);
    IF amt = 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
    IF accounting_is_uuid(x->>'statementLineId') AND nullif(x->>'journalLineId', '') IS NULL THEN
      sid := (x->>'statementLineId')::uuid;
      SELECT txn_date, amount INTO d, src FROM bank_statement_lines WHERE organization_id = org AND id = sid AND banking_account_id = bid AND review_status = 'active';
      IF d IS NULL THEN RAISE EXCEPTION 'statement_line_unavailable'; END IF;
    ELSIF accounting_is_uuid(x->>'journalLineId') AND nullif(x->>'statementLineId', '') IS NULL THEN
      jid := (x->>'journalLineId')::uuid;
      SELECT r.amount, r.entry_date INTO src, d FROM banking_ledger_line(org, bid, jid) r;
      IF src IS NULL THEN RAISE EXCEPTION 'ledger_line_unavailable'; END IF;
    ELSE RAISE EXCEPTION 'match_items_required';
    END IF;
    IF sign(amt) <> sign(src) THEN RAISE EXCEPTION 'match_sign_mismatch'; END IF;
    used := banking_matched(org, sid, jid, NULL);
    IF abs(used + amt) > abs(src) THEN RAISE EXCEPTION 'match_exceeds_available'; END IF;
    IF abs(used + amt) < abs(src) THEN partial := true; END IF;
    residuals := residuals || jsonb_build_object('statementLineId', sid, 'journalLineId', jid, 'residual', (src - used - amt)::text);
    eff := greatest(eff, d);
  END LOOP;
  IF k = 'opening_balance' THEN
    SELECT * INTO first_r FROM bank_reconciliations WHERE organization_id = org AND banking_account_id = bid ORDER BY period_start LIMIT 1;
    IF first_r.id IS NULL THEN RAISE EXCEPTION 'reconciliation_required_for_opening'; END IF;
    eff := first_r.period_start - 1;
  END IF;
  IF (partial OR k IN ('statement_offset','ledger_offset','opening_balance')) AND length(trim(coalesce(note, ''))) < 5 THEN RAISE EXCEPTION 'match_note_required'; END IF;
  INSERT INTO bank_match_groups (organization_id, banking_account_id, kind, effective_date, partial, note, created_by_id, idempotency_key)
  VALUES (org, bid, k, eff, partial, nullif(trim(coalesce(note, '')), ''), staff, key) RETURNING id INTO gid;
  INSERT INTO bank_match_items (organization_id, group_id, banking_account_id, statement_line_id, journal_line_id, amount)
  SELECT org, gid, bid, nullif(value->>'statementLineId', '')::uuid, nullif(value->>'journalLineId', '')::uuid, (value->>'amount')::numeric FROM jsonb_array_elements(items);
  -- Same rules as the commit-time constraint trigger, raised now with a friendly code.
  PERFORM bank_match_group_check(org, gid);
  RETURN jsonb_build_object('id', gid, 'effectiveDate', eff, 'partial', partial, 'residuals', residuals);
END $$;
--> statement-breakpoint
-- p: {key, bankingAccountId, kind, note, items}
CREATE OR REPLACE FUNCTION bank_match_create(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); g bank_match_groups; b banking_accounts; r jsonb; k text := p->>'kind';
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF NOT accounting_is_uuid(p->>'bankingAccountId') THEN RAISE EXCEPTION 'banking_account_unavailable'; END IF;
  SELECT * INTO g FROM bank_match_groups WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF g.banking_account_id <> (p->>'bankingAccountId')::uuid OR g.kind IS DISTINCT FROM k OR g.created_by_id <> staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', g.id, 'already', true, 'partial', g.partial);
  END IF;
  IF k IS NULL OR k NOT IN ('match','statement_offset','ledger_offset','opening_balance') THEN RAISE EXCEPTION 'invalid_match_kind'; END IF;
  SELECT * INTO b FROM banking_accounts WHERE organization_id = org AND id = (p->>'bankingAccountId')::uuid FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'banking_account_unavailable'; END IF;
  PERFORM banking_ledger_required(org, b.id);
  -- One matcher at a time per account: availability is checked and consumed atomically.
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':bank_match:' || b.id, 0));
  r := banking_match_insert(org, staff, b.id, k, p->'items', p->>'note', key);
  PERFORM banking_event(org, 'match', r->>'id', actor, staff, 'created', p->>'note', jsonb_build_object('kind', k, 'bankingAccountId', b.id, 'items', p->'items', 'partial', r->'partial'), key, correlation);
  RETURN r || jsonb_build_object('already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bank_match_cancel(org text, actor text, gid uuid, reason text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); g bank_match_groups; clean text := trim(coalesce(reason, ''));
BEGIN
  SELECT * INTO g FROM bank_match_groups WHERE organization_id = org AND id = gid;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':bank_match:' || g.banking_account_id, 0));
  IF banking_replay(org, key, 'match', gid::text, 'cancelled') THEN RETURN jsonb_build_object('id', gid, 'already', true); END IF;
  SELECT * INTO g FROM bank_match_groups WHERE organization_id = org AND id = gid FOR UPDATE;
  IF g.status <> 'active' THEN RAISE EXCEPTION 'match_unavailable'; END IF;
  IF length(clean) < 5 OR length(clean) > 2000 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
  UPDATE bank_match_groups SET status = 'cancelled', cancelled_by_id = staff, cancelled_at = now(), cancel_reason = clean WHERE organization_id = org AND id = gid;
  PERFORM banking_event(org, 'match', gid::text, actor, staff, 'cancelled', clean, jsonb_build_object('kind', g.kind), key, correlation);
  RETURN jsonb_build_object('id', gid, 'already', false);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Statement import and duplicate review commands.
-- ---------------------------------------------------------------------------------------------

-- p: {key, bankingAccountId, currency, fileName, fileSha256, fileSize, storageKey, sourceFormat, columnMapping, rows:[{row,date,description,reference,amount,balance}]}
CREATE OR REPLACE FUNCTION bank_statement_import(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); b banking_accounts; imp bank_statement_imports; iid uuid;
  x jsonb; n integer := 0; d date; amt numeric; bal numeric; descr text; ref text; occ integer; k text; dup_id uuid; st text; reason text;
  locked date; seen jsonb := '{}'::jsonb; sig text; imported integer := 0; duplicates integer := 0; reviews integer := 0; srow integer; prev_row integer := 0;
  asc_ok boolean := true; desc_ok boolean := true; all_bal boolean := true; prev_bal numeric; prev_amt numeric; first_amt numeric; first_bal numeric; last_amt numeric; last_bal numeric;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF NOT accounting_is_uuid(p->>'bankingAccountId') THEN RAISE EXCEPTION 'banking_account_unavailable'; END IF;
  -- Serialize imports per account: overlapping concurrent imports classify against each other.
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':bank_statement:' || (p->>'bankingAccountId'), 0));
  SELECT * INTO imp FROM bank_statement_imports WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF imp.banking_account_id <> (p->>'bankingAccountId')::uuid OR imp.file_sha256 IS DISTINCT FROM p->>'fileSha256' THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', imp.id, 'already', true, 'imported', imp.imported_count, 'duplicates', imp.duplicate_count, 'review', imp.review_count);
  END IF;
  SELECT * INTO b FROM banking_accounts WHERE organization_id = org AND id = (p->>'bankingAccountId')::uuid FOR SHARE;
  IF NOT FOUND OR b.status <> 'active' THEN RAISE EXCEPTION 'banking_account_unavailable'; END IF;
  IF b.kind NOT IN ('bank','mobile_money') THEN RAISE EXCEPTION 'statement_not_applicable'; END IF;
  PERFORM banking_ledger_required(org, b.id);
  IF p->>'currency' IS DISTINCT FROM b.currency THEN RAISE EXCEPTION 'statement_currency_mismatch'; END IF;
  IF coalesce(p->>'fileSha256', '') !~ '^[0-9a-f]{64}$' OR coalesce(p->>'storageKey', '') = '' OR coalesce(p->>'fileSize', '') !~ '^\d{1,8}$' THEN RAISE EXCEPTION 'statement_file_invalid'; END IF;
  SELECT * INTO imp FROM bank_statement_imports WHERE organization_id = org AND banking_account_id = b.id AND file_sha256 = p->>'fileSha256';
  IF FOUND THEN
    RETURN jsonb_build_object('id', imp.id, 'already', true, 'sameFile', true, 'imported', imp.imported_count, 'duplicates', imp.duplicate_count, 'review', imp.review_count);
  END IF;
  IF jsonb_typeof(p->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'rows') NOT BETWEEN 1 AND 10000 OR jsonb_typeof(p->'columnMapping') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'statement_rows_invalid';
  END IF;
  INSERT INTO bank_statement_imports (organization_id, banking_account_id, currency, source_format, file_name, file_sha256, file_size, storage_key, column_mapping, row_count, imported_by_id, idempotency_key)
  VALUES (org, b.id, b.currency, coalesce(p->>'sourceFormat', 'csv'), left(coalesce(nullif(trim(p->>'fileName'), ''), 'statement.csv'), 200), p->>'fileSha256',
    (p->>'fileSize')::integer, p->>'storageKey', p->'columnMapping', jsonb_array_length(p->'rows'), staff, key)
  RETURNING id INTO iid;
  locked := banking_locked_until(org, b.id);
  FOR x IN SELECT value FROM jsonb_array_elements(p->'rows') LOOP
    n := n + 1;
    IF coalesce(x->>'row', '') !~ '^\d{1,5}$' THEN RAISE EXCEPTION 'statement_rows_invalid'; END IF;
    srow := (x->>'row')::integer;
    IF srow <= prev_row OR srow < 2 THEN RAISE EXCEPTION 'statement_rows_invalid'; END IF;
    prev_row := srow;
    d := banking_date(x->>'date');
    descr := trim(regexp_replace(coalesce(x->>'description', ''), '[[:cntrl:]]', ' ', 'g'));
    IF descr = '' OR length(descr) > 500 THEN RAISE EXCEPTION 'statement_rows_invalid'; END IF;
    ref := nullif(trim(regexp_replace(coalesce(x->>'reference', ''), '[[:cntrl:]]', ' ', 'g')), '');
    IF length(coalesce(ref, '')) > 200 THEN RAISE EXCEPTION 'statement_rows_invalid'; END IF;
    amt := banking_money(x->>'amount', true);
    IF amt = 0 THEN RAISE EXCEPTION 'statement_rows_invalid'; END IF;
    bal := CASE WHEN nullif(x->>'balance', '') IS NULL THEN NULL ELSE banking_money(x->>'balance', true) END;
    -- Running-balance consistency in both possible file orders (oldest first or newest first).
    IF bal IS NULL THEN all_bal := false; END IF;
    IF n = 1 THEN first_amt := amt; first_bal := bal;
    ELSIF all_bal THEN
      IF bal IS DISTINCT FROM prev_bal + amt THEN asc_ok := false; END IF;
      IF prev_bal IS DISTINCT FROM bal + prev_amt THEN desc_ok := false; END IF;
    END IF;
    prev_bal := bal; prev_amt := amt; last_amt := amt; last_bal := bal;
    -- Identical rows inside one file are distinct, numbered transactions.
    sig := concat_ws('|', d::text, amt::text, upper(regexp_replace(descr, '\s+', ' ', 'g')), banking_norm(ref));
    occ := coalesce((seen->>sig)::integer, 0) + 1;
    seen := seen || jsonb_build_object(sig, occ);
    k := banking_line_key(b.id, d, amt, descr, ref, occ);
    st := 'active'; reason := NULL; dup_id := NULL;
    SELECT id INTO dup_id FROM bank_statement_lines WHERE organization_id = org AND banking_account_id = b.id AND dedupe_key = k AND review_status IN ('active','needs_review');
    IF dup_id IS NOT NULL THEN
      st := 'duplicate'; reason := 'exact_duplicate';
    ELSIF locked IS NOT NULL AND d <= locked THEN
      st := 'needs_review'; reason := 'in_finalized_period';
    ELSE
      SELECT id INTO dup_id FROM bank_statement_lines WHERE organization_id = org AND banking_account_id = b.id AND txn_date = d AND amount = amt
        AND review_status IN ('active','needs_review') AND import_id <> iid ORDER BY created_at, id LIMIT 1;
      IF dup_id IS NOT NULL THEN st := 'needs_review'; reason := 'possible_duplicate'; END IF;
    END IF;
    INSERT INTO bank_statement_lines (organization_id, import_id, banking_account_id, currency, source_row, txn_date, description, reference, amount, running_balance, occurrence, dedupe_key, review_status, review_reason, duplicate_of_id)
    VALUES (org, iid, b.id, b.currency, srow, d, descr, ref, amt, bal, occ, k, st, reason, dup_id);
    IF st = 'active' THEN imported := imported + 1; ELSIF st = 'duplicate' THEN duplicates := duplicates + 1; ELSE reviews := reviews + 1; END IF;
  END LOOP;
  UPDATE bank_statement_imports SET imported_count = imported, duplicate_count = duplicates, review_count = reviews,
    first_date = (SELECT min(txn_date) FROM bank_statement_lines WHERE organization_id = org AND import_id = iid),
    last_date = (SELECT max(txn_date) FROM bank_statement_lines WHERE organization_id = org AND import_id = iid),
    derived_opening_balance = CASE WHEN all_bal AND (n = 1 OR (asc_ok AND NOT desc_ok)) THEN first_bal - first_amt WHEN all_bal AND desc_ok AND NOT asc_ok THEN last_bal - last_amt END,
    derived_closing_balance = CASE WHEN all_bal AND (n = 1 OR (asc_ok AND NOT desc_ok)) THEN last_bal WHEN all_bal AND desc_ok AND NOT asc_ok THEN first_bal END
  WHERE organization_id = org AND id = iid;
  PERFORM banking_event(org, 'statement_import', iid::text, actor, staff, 'imported', NULL,
    jsonb_build_object('bankingAccountId', b.id, 'fileSha256', p->>'fileSha256', 'rows', n, 'imported', imported, 'duplicates', duplicates, 'review', reviews), key, correlation);
  RETURN jsonb_build_object('id', iid, 'already', false, 'imported', imported, 'duplicates', duplicates, 'review', reviews);
END $$;
--> statement-breakpoint
-- Resolve a row that needs review: accept it as a genuine transaction, or confirm it is a duplicate.
CREATE OR REPLACE FUNCTION bank_statement_line_review(org text, actor text, lid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); l bank_statement_lines; clean text := trim(coalesce(note, '')); target text; locked date; twin uuid;
BEGIN
  IF decision NOT IN ('accept','duplicate') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO l FROM bank_statement_lines WHERE organization_id = org AND id = lid;
  IF NOT FOUND THEN RAISE EXCEPTION 'statement_line_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':bank_match:' || l.banking_account_id, 0));
  IF banking_replay(org, key, 'statement_line', lid::text, decision) THEN RETURN jsonb_build_object('id', lid, 'already', true); END IF;
  SELECT * INTO l FROM bank_statement_lines WHERE organization_id = org AND id = lid FOR UPDATE;
  IF l.review_status <> 'needs_review' THEN RAISE EXCEPTION 'statement_line_not_in_review'; END IF;
  IF length(clean) < 5 OR length(clean) > 2000 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
  locked := banking_locked_until(org, l.banking_account_id);
  IF decision = 'accept' AND locked IS NOT NULL AND l.txn_date <= locked THEN RAISE EXCEPTION 'statement_line_in_finalized_period'; END IF;
  twin := l.duplicate_of_id;
  IF decision = 'duplicate' AND twin IS NULL THEN
    -- A row flagged only because of a finalized period: its twin must be a live row of that day and amount.
    SELECT id INTO twin FROM bank_statement_lines WHERE organization_id = org AND banking_account_id = l.banking_account_id AND id <> l.id
      AND txn_date = l.txn_date AND amount = l.amount AND review_status = 'active' ORDER BY created_at, id LIMIT 1;
    IF twin IS NULL THEN RAISE EXCEPTION 'duplicate_original_missing'; END IF;
  END IF;
  target := CASE WHEN decision = 'accept' THEN 'active' ELSE 'duplicate' END;
  UPDATE bank_statement_lines SET review_status = target, duplicate_of_id = CASE WHEN target = 'duplicate' THEN twin ELSE duplicate_of_id END,
    reviewed_by_id = staff, reviewed_at = now(), review_note = clean
  WHERE organization_id = org AND id = lid;
  PERFORM banking_event(org, 'statement_line', lid::text, actor, staff, decision, clean, jsonb_build_object('reason', l.review_reason, 'duplicateOf', twin), key, correlation);
  RETURN jsonb_build_object('id', lid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Reconciliation figures and commands.
--
--   statement check   = opening statement + statement movement in the period - closing statement   (must be 0)
--   outstanding       = posted ledger lines dated <= period end, not matched as at period end
--                       (deposits in transit = positive residuals; outstanding payments = negative)
--   unmatched bank    = statement lines dated from the first period start to period end, not matched
--   difference        = closing statement + deposits in transit - outstanding payments
--                       - unmatched statement net - closing book                                    (must be 0)
-- A match counts "as at" a date only when every item in it is dated on or before that date.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION bank_reconciliation_figures(org text, rid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE r bank_reconciliations; led uuid; first_start date; movement numeric; closing_book numeric; opening_book numeric; od numeric; op numeric;
  od_n integer; op_n integer; un_n integer; un_net numeric; review_n integer; pending_n integer; stmt_check numeric; diff numeric; problems text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO r FROM bank_reconciliations WHERE organization_id = org AND id = rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation_unavailable'; END IF;
  led := banking_ledger(org, r.banking_account_id);
  SELECT min(period_start) INTO first_start FROM bank_reconciliations WHERE organization_id = org AND banking_account_id = r.banking_account_id;
  SELECT coalesce(sum(amount), 0) INTO movement FROM bank_statement_lines
    WHERE organization_id = org AND banking_account_id = r.banking_account_id AND review_status = 'active' AND txn_date BETWEEN r.period_start AND r.period_end;
  closing_book := banking_book_balance(org, r.banking_account_id, r.period_end);
  opening_book := banking_book_balance(org, r.banking_account_id, r.period_start - 1);
  WITH lines AS (
    SELECT l.id, l.debit - l.credit AS amt FROM accounting_journal_lines l
    JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id AND j.status = 'posted'
    WHERE l.organization_id = org AND l.account_id = led AND l.currency = r.currency AND j.entry_date <= r.period_end
  ), res AS (SELECT amt - banking_matched(org, NULL, id, r.period_end) AS v FROM lines)
  SELECT coalesce(sum(v) FILTER (WHERE v > 0), 0), coalesce(-sum(v) FILTER (WHERE v < 0), 0), count(*) FILTER (WHERE v > 0), count(*) FILTER (WHERE v < 0)
    INTO od, op, od_n, op_n FROM res;
  WITH res AS (
    SELECT amount - banking_matched(org, id, NULL, r.period_end) AS v FROM bank_statement_lines
    WHERE organization_id = org AND banking_account_id = r.banking_account_id AND review_status = 'active' AND txn_date BETWEEN first_start AND r.period_end
  ) SELECT count(*) FILTER (WHERE v <> 0), coalesce(sum(v), 0) INTO un_n, un_net FROM res;
  SELECT count(*) INTO review_n FROM bank_statement_lines
    WHERE organization_id = org AND banking_account_id = r.banking_account_id AND review_status = 'needs_review' AND txn_date BETWEEN first_start AND r.period_end;
  SELECT count(DISTINCT j.id) INTO pending_n FROM accounting_journals j JOIN accounting_journal_lines l ON l.organization_id = j.organization_id AND l.journal_id = j.id
    WHERE j.organization_id = org AND l.account_id = led AND j.status IN ('draft','submitted','approved') AND j.entry_date <= r.period_end;
  stmt_check := r.opening_statement_balance + movement - r.closing_statement_balance;
  diff := r.closing_statement_balance + od - op - un_net - closing_book;
  IF led IS NULL THEN problems := array_append(problems, 'banking_mapping_required'); END IF;
  IF stmt_check <> 0 THEN problems := array_append(problems, 'statement_balance_mismatch'); END IF;
  IF review_n > 0 THEN problems := array_append(problems, 'statement_review_pending'); END IF;
  IF un_n > 0 THEN problems := array_append(problems, 'unmatched_statement_items'); END IF;
  IF diff <> 0 THEN problems := array_append(problems, 'reconciliation_difference'); END IF;
  RETURN jsonb_build_object(
    'currency', r.currency, 'periodStart', r.period_start, 'periodEnd', r.period_end, 'firstPeriodStart', first_start,
    'openingStatement', r.opening_statement_balance::text, 'closingStatement', r.closing_statement_balance::text, 'statementMovement', movement::text,
    'statementCheck', stmt_check::text, 'openingBook', opening_book::text, 'closingBook', closing_book::text,
    'depositsInTransit', od::text, 'depositsInTransitCount', od_n, 'outstandingPayments', op::text, 'outstandingPaymentsCount', op_n,
    'unmatchedStatementCount', un_n, 'unmatchedStatementNet', un_net::text, 'reviewPending', review_n, 'pendingJournals', pending_n,
    'adjustedStatement', (r.closing_statement_balance + od - op - un_net)::text, 'difference', diff::text,
    'problems', to_jsonb(problems), 'balanced', cardinality(problems) = 0);
END $$;
--> statement-breakpoint
-- p: {key, bankingAccountId, periodStart, periodEnd, openingStatementBalance, closingStatementBalance}
CREATE OR REPLACE FUNCTION bank_reconciliation_create(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); r bank_reconciliations; prev bank_reconciliations; b banking_accounts; rid uuid;
  s date; e date; ob numeric; cb numeric;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO r FROM bank_reconciliations WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF r.banking_account_id::text IS DISTINCT FROM p->>'bankingAccountId' OR r.prepared_by_id <> staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', r.id, 'already', true);
  END IF;
  IF NOT accounting_is_uuid(p->>'bankingAccountId') THEN RAISE EXCEPTION 'banking_account_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':bank_match:' || (p->>'bankingAccountId'), 0));
  SELECT * INTO b FROM banking_accounts WHERE organization_id = org AND id = (p->>'bankingAccountId')::uuid AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'banking_account_unavailable'; END IF;
  PERFORM banking_ledger_required(org, b.id);
  s := banking_date(p->>'periodStart'); e := banking_date(p->>'periodEnd');
  IF e < s OR e - s > 366 THEN RAISE EXCEPTION 'invalid_reconciliation_period'; END IF;
  ob := banking_money(p->>'openingStatementBalance', true); cb := banking_money(p->>'closingStatementBalance', true);
  SELECT * INTO prev FROM bank_reconciliations WHERE organization_id = org AND banking_account_id = b.id ORDER BY period_start DESC LIMIT 1;
  IF prev.id IS NOT NULL THEN
    IF prev.status <> 'finalized' THEN RAISE EXCEPTION 'previous_reconciliation_open'; END IF;
    IF s <> prev.period_end + 1 THEN RAISE EXCEPTION 'reconciliation_not_contiguous'; END IF;
    IF ob <> prev.closing_statement_balance THEN RAISE EXCEPTION 'opening_balance_mismatch'; END IF;
  END IF;
  INSERT INTO bank_reconciliations (organization_id, banking_account_id, currency, period_start, period_end, opening_statement_balance, closing_statement_balance, prepared_by_id, idempotency_key)
  VALUES (org, b.id, b.currency, s, e, ob, cb, staff, key) RETURNING id INTO rid;
  PERFORM banking_event(org, 'reconciliation', rid::text, actor, staff, 'created', NULL,
    jsonb_build_object('bankingAccountId', b.id, 'periodStart', s, 'periodEnd', e, 'openingStatement', ob, 'closingStatement', cb), key, correlation);
  RETURN jsonb_build_object('id', rid, 'already', false);
END $$;
--> statement-breakpoint
-- While in progress: correct the period end or the closing statement balance.
CREATE OR REPLACE FUNCTION bank_reconciliation_update(org text, actor text, rid uuid, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); r bank_reconciliations; e date; cb numeric; key text := nullif(p->>'key', '');
BEGIN
  SELECT * INTO r FROM bank_reconciliations WHERE organization_id = org AND id = rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':bank_match:' || r.banking_account_id, 0));
  IF banking_replay(org, key, 'reconciliation', rid::text, 'updated') THEN RETURN jsonb_build_object('id', rid, 'already', true); END IF;
  SELECT * INTO r FROM bank_reconciliations WHERE organization_id = org AND id = rid FOR UPDATE;
  IF r.status <> 'in_progress' THEN RAISE EXCEPTION 'reconciliation_locked'; END IF;
  IF r.version IS DISTINCT FROM (p->>'version')::integer THEN RAISE EXCEPTION 'stale_reconciliation'; END IF;
  e := banking_date(p->>'periodEnd'); cb := banking_money(p->>'closingStatementBalance', true);
  IF e < r.period_start OR e - r.period_start > 366 THEN RAISE EXCEPTION 'invalid_reconciliation_period'; END IF;
  UPDATE bank_reconciliations SET period_end = e, closing_statement_balance = cb, version = version + 1, updated_at = now() WHERE organization_id = org AND id = rid;
  PERFORM banking_event(org, 'reconciliation', rid::text, actor, staff, 'updated', NULL,
    jsonb_build_object('before', jsonb_build_object('periodEnd', r.period_end, 'closingStatement', r.closing_statement_balance), 'after', jsonb_build_object('periodEnd', e, 'closingStatement', cb)), key, correlation);
  RETURN jsonb_build_object('id', rid, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bank_reconciliation_command(org text, actor text, rid uuid, cmd text, expected integer, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); r bank_reconciliations; f jsonb; clean text := nullif(trim(coalesce(note, '')), ''); target text; seq integer;
BEGIN
  IF cmd NOT IN ('submit','return','finalize','reopen') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO r FROM bank_reconciliations WHERE organization_id = org AND id = rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation_unavailable'; END IF;
  -- Freeze matching on the account while the figures are evaluated and the status changes.
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':bank_match:' || r.banking_account_id, 0));
  IF banking_replay(org, key, 'reconciliation', rid::text, cmd) THEN
    SELECT * INTO r FROM bank_reconciliations WHERE organization_id = org AND id = rid;
    RETURN jsonb_build_object('id', rid, 'status', r.status, 'already', true);
  END IF;
  SELECT * INTO r FROM bank_reconciliations WHERE organization_id = org AND id = rid FOR UPDATE;
  IF r.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_reconciliation'; END IF;
  IF length(coalesce(clean, '')) > 2000 THEN RAISE EXCEPTION 'note_too_long'; END IF;
  f := bank_reconciliation_figures(org, rid);
  IF cmd = 'submit' THEN
    IF r.status <> 'in_progress' THEN RAISE EXCEPTION 'invalid_reconciliation_transition'; END IF;
    IF NOT (f->>'balanced')::boolean THEN RAISE EXCEPTION '%', f->'problems'->>0; END IF;
    UPDATE bank_reconciliations SET status = 'submitted', submitted_by_id = staff, submitted_at = now(), review_note = NULL, version = version + 1, updated_at = now() WHERE organization_id = org AND id = rid;
    target := 'submitted';
  ELSIF cmd = 'return' THEN
    IF r.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_reconciliation_transition'; END IF;
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
    UPDATE bank_reconciliations SET status = 'in_progress', submitted_by_id = NULL, submitted_at = NULL, review_note = clean, version = version + 1, updated_at = now() WHERE organization_id = org AND id = rid;
    target := 'in_progress';
  ELSIF cmd = 'finalize' THEN
    IF r.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_reconciliation_transition'; END IF;
    IF staff IN (r.submitted_by_id, r.prepared_by_id) THEN RAISE EXCEPTION 'reconciliation_self_approval_denied'; END IF;
    -- Re-evaluated now: anything that changed since submission must still reconcile.
    IF NOT (f->>'balanced')::boolean THEN RAISE EXCEPTION '%', f->'problems'->>0; END IF;
    UPDATE bank_reconciliations SET status = 'finalized', finalized_by_id = staff, finalized_at = now(), review_note = clean, version = version + 1, updated_at = now() WHERE organization_id = org AND id = rid;
    SELECT coalesce(max(sequence), 0) + 1 INTO seq FROM bank_reconciliation_snapshots WHERE organization_id = org AND reconciliation_id = rid;
    INSERT INTO bank_reconciliation_snapshots (organization_id, reconciliation_id, sequence, figures, prepared_by_id, submitted_by_id, finalized_by_id)
    VALUES (org, rid, seq, f, r.prepared_by_id, r.submitted_by_id, staff);
    target := 'finalized';
  ELSE
    IF r.status <> 'finalized' THEN RAISE EXCEPTION 'invalid_reconciliation_transition'; END IF;
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'reopen_reason_required'; END IF;
    IF EXISTS (SELECT 1 FROM bank_reconciliations WHERE organization_id = org AND banking_account_id = r.banking_account_id AND period_start > r.period_start) THEN
      RAISE EXCEPTION 'later_reconciliation_exists';
    END IF;
    UPDATE bank_reconciliations SET status = 'in_progress', submitted_by_id = NULL, submitted_at = NULL, finalized_by_id = NULL, finalized_at = NULL,
      reopened_by_id = staff, reopened_at = now(), reopen_reason = clean, reopen_count = reopen_count + 1, version = version + 1, updated_at = now()
    WHERE organization_id = org AND id = rid;
    target := 'in_progress';
  END IF;
  PERFORM banking_event(org, 'reconciliation', rid::text, actor, staff, cmd, clean, jsonb_build_object('from', r.status, 'to', target, 'figures', f), key, correlation);
  RETURN jsonb_build_object('id', rid, 'status', target, 'figures', f, 'already', false);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Cash management. Every cash operation prepares ONE manual journal through the Phase 2A functions
-- and submits it. A different person approves and posts it (cash_transaction_decide), so the
-- posting gate applies: balance, open period, active accounts, manual posting enabled.
--   receipt / payment    money in or out of a company account against a non-bank ledger account
--   transfer             between two approved company accounts (one journal: no revenue, no expense)
--   advance              cash to an employee: staff advances (an asset), never an expense
--   accountability       the employee accounts for an advance with receipts and/or returned cash
--   count_adjustment     shortage or overage found by a cash count (evidence required)
--   bank_adjustment      bank fee or interest found on a statement, linked to its statement line
-- ---------------------------------------------------------------------------------------------

CREATE TABLE banking_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text NOT NULL CHECK (length(storage_key) BETWEEN 1 AND 300),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  uploaded_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (organization_id, storage_key),
  FOREIGN KEY (organization_id, uploaded_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TRIGGER banking_evidence_immutable BEFORE UPDATE OR DELETE ON banking_evidence FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER banking_evidence_no_truncate BEFORE TRUNCATE ON banking_evidence FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION banking_evidence_record(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); e banking_evidence; eid uuid;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO e FROM banking_evidence WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF e.sha256 IS DISTINCT FROM p->>'sha256' OR e.uploaded_by_id <> staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', e.id, 'already', true);
  END IF;
  BEGIN
    INSERT INTO banking_evidence (organization_id, sha256, storage_key, file_name, mime_type, size_bytes, uploaded_by_id, idempotency_key)
    VALUES (org, p->>'sha256', p->>'storageKey', left(coalesce(nullif(trim(p->>'fileName'), ''), 'evidence'), 200), p->>'mimeType', (p->>'sizeBytes')::integer, staff, key)
    RETURNING id INTO eid;
  EXCEPTION WHEN check_violation OR invalid_text_representation THEN RAISE EXCEPTION 'invalid_document_type';
  END;
  PERFORM banking_event(org, 'evidence', eid::text, actor, staff, 'uploaded', NULL, jsonb_build_object('sha256', p->>'sha256', 'mimeType', p->>'mimeType', 'sizeBytes', p->>'sizeBytes'), key, correlation);
  RETURN jsonb_build_object('id', eid, 'already', false);
END $$;
--> statement-breakpoint
CREATE TABLE cash_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  banking_account_id uuid NOT NULL,
  currency text NOT NULL,
  count_date date NOT NULL,
  counted_amount numeric(17,2) NOT NULL CHECK (counted_amount >= 0),
  book_balance numeric(17,2) NOT NULL,
  difference numeric(17,2) GENERATED ALWAYS AS (counted_amount - book_balance) STORED,
  pending_journals integer NOT NULL DEFAULT 0,
  denominations jsonb,
  note text CHECK (note IS NULL OR length(note) <= 2000),
  counted_by_id uuid NOT NULL,
  witness_id uuid,
  evidence_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, id, banking_account_id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, banking_account_id, currency) REFERENCES banking_accounts(organization_id, id, currency) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, counted_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, witness_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, evidence_id) REFERENCES banking_evidence(organization_id, id) ON DELETE RESTRICT,
  CHECK (witness_id IS NULL OR witness_id <> counted_by_id)
);
--> statement-breakpoint
CREATE TRIGGER cash_counts_immutable BEFORE UPDATE OR DELETE ON cash_counts FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER cash_counts_no_truncate BEFORE TRUNCATE ON cash_counts FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TABLE cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  kind text NOT NULL CHECK (kind IN ('receipt','payment','transfer','advance','accountability','count_adjustment','bank_adjustment')),
  banking_account_id uuid,
  counter_banking_account_id uuid,
  currency text NOT NULL CHECK (currency IN ('UGX','USD')),
  amount numeric(17,2) NOT NULL CHECK (amount > 0),
  txn_date date NOT NULL,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 500),
  reference text CHECK (reference IS NULL OR length(reference) <= 100),
  reference_normalized text GENERATED ALWAYS AS (upper(regexp_replace(coalesce(reference, ''), '[^A-Za-z0-9]', '', 'g'))) STORED,
  counter_account_id uuid,
  category text CHECK (category IS NULL OR category IN ('bank_fee','interest_income','interest_expense','cash_shortage','cash_overage','staff_advances')),
  staff_id uuid,
  advance_id uuid,
  statement_line_id uuid,
  cash_count_id uuid,
  evidence_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  journal_id uuid NOT NULL,
  prepared_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (organization_id, journal_id),
  FOREIGN KEY (organization_id, banking_account_id, currency) REFERENCES banking_accounts(organization_id, id, currency) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, counter_banking_account_id, currency) REFERENCES banking_accounts(organization_id, id, currency) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, counter_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, staff_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, advance_id) REFERENCES cash_transactions(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, statement_line_id, banking_account_id) REFERENCES bank_statement_lines(organization_id, id, banking_account_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, cash_count_id, banking_account_id) REFERENCES cash_counts(organization_id, id, banking_account_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, evidence_id) REFERENCES banking_evidence(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, journal_id) REFERENCES accounting_journals(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK ((kind = 'transfer') = (counter_banking_account_id IS NOT NULL)),
  CHECK (counter_banking_account_id IS NULL OR counter_banking_account_id <> banking_account_id),
  CHECK (kind <> 'transfer' OR reference_normalized <> ''),
  CHECK ((kind IN ('receipt','payment')) = (counter_account_id IS NOT NULL)),
  CHECK ((kind IN ('advance','accountability')) = (staff_id IS NOT NULL)),
  CHECK ((kind = 'accountability') = (advance_id IS NOT NULL)),
  CHECK ((kind = 'bank_adjustment') = (statement_line_id IS NOT NULL)),
  CHECK ((kind = 'count_adjustment') = (cash_count_id IS NOT NULL)),
  CHECK ((kind IN ('bank_adjustment','count_adjustment')) = (category IS NOT NULL) OR kind = 'advance'),
  CHECK (kind NOT IN ('accountability','count_adjustment') OR evidence_id IS NOT NULL),
  CHECK (kind = 'accountability' OR banking_account_id IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX cash_transactions_kind_idx ON cash_transactions (organization_id, kind, txn_date);
--> statement-breakpoint
CREATE INDEX cash_transactions_advance_idx ON cash_transactions (organization_id, advance_id) WHERE advance_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER cash_transactions_immutable BEFORE UPDATE OR DELETE ON cash_transactions FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER cash_transactions_no_truncate BEFORE TRUNCATE ON cash_transactions FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- A cash transaction is live unless its journal was rejected or discarded.
CREATE OR REPLACE FUNCTION cash_transaction_live(org text, jid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM accounting_journals WHERE organization_id = org AND id = jid AND status NOT IN ('rejected','discarded'));
$$;
--> statement-breakpoint
-- Outstanding amount of an advance: posted advance minus every live accountability against it.
CREATE OR REPLACE FUNCTION cash_advance_outstanding(org text, aid uuid) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT a.amount - coalesce((SELECT sum(t.amount) FROM cash_transactions t WHERE t.organization_id = org AND t.advance_id = a.id AND t.kind = 'accountability' AND cash_transaction_live(org, t.journal_id)), 0)
  FROM cash_transactions a WHERE a.organization_id = org AND a.id = aid AND a.kind = 'advance';
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION banking_account_for_cash(org text, v text) RETURNS banking_accounts LANGUAGE plpgsql STABLE AS $$
DECLARE b banking_accounts;
BEGIN
  IF NOT accounting_is_uuid(v) THEN RAISE EXCEPTION 'banking_account_unavailable'; END IF;
  SELECT * INTO b FROM banking_accounts WHERE organization_id = org AND id = v::uuid AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'banking_account_unavailable'; END IF;
  PERFORM banking_ledger_required(org, b.id);
  RETURN b;
END $$;
--> statement-breakpoint
-- p: {key, kind, date, amount, description, reference, bankingAccountId, toAccountId, counterAccountId, division, projectId,
--     staffId, advanceId, expenses:[{accountId, amount, description}], cashReturned, cashCountId, statementLineId, category, evidenceId}
CREATE OR REPLACE FUNCTION cash_transaction_create(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); k text := p->>'kind'; t cash_transactions;
  a banking_accounts; c banking_accounts; la uuid; lc uuid; amt numeric; d date; descr text := nullif(trim(coalesce(p->>'description', '')), ''); ref text := nullif(trim(coalesce(p->>'reference', '')), '');
  lines jsonb; jid uuid; tid uuid; ctr accounting_accounts; cat text; cat_acct uuid; sl bank_statement_lines; cc cash_counts; adv cash_transactions;
  ev uuid; who uuid; ret numeric := 0; x jsonb; xa accounting_accounts; xamt numeric; exp_total numeric := 0; exp_lines jsonb := '[]'::jsonb; det jsonb := '{}'::jsonb;
  cur text; div text := nullif(p->>'division', ''); proj text := nullif(p->>'projectId', ''); label text; pending numeric;
BEGIN
  IF key IS NULL OR length(key) > 190 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO t FROM cash_transactions WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF t.kind IS DISTINCT FROM k OR t.prepared_by_id <> staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', t.id, 'journalId', t.journal_id, 'already', true);
  END IF;
  IF k IS NULL OR k NOT IN ('receipt','payment','transfer','advance','accountability','count_adjustment','bank_adjustment') THEN RAISE EXCEPTION 'invalid_cash_kind'; END IF;
  IF length(coalesce(descr, '')) > 500 OR length(coalesce(ref, '')) > 100 THEN RAISE EXCEPTION 'invalid_reference'; END IF;
  IF nullif(p->>'evidenceId', '') IS NOT NULL THEN
    IF NOT accounting_is_uuid(p->>'evidenceId') THEN RAISE EXCEPTION 'banking_evidence_unavailable'; END IF;
    SELECT id INTO ev FROM banking_evidence WHERE organization_id = org AND id = (p->>'evidenceId')::uuid;
    IF ev IS NULL THEN RAISE EXCEPTION 'banking_evidence_unavailable'; END IF;
  END IF;

  IF k IN ('receipt','payment','transfer','advance') THEN
    a := banking_account_for_cash(org, p->>'bankingAccountId'); la := banking_ledger(org, a.id); cur := a.currency;
    d := banking_date(p->>'date'); amt := banking_money(p->>'amount');
    IF amt <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
    IF descr IS NULL THEN RAISE EXCEPTION 'cash_description_required'; END IF;
  END IF;

  IF k IN ('receipt','payment') THEN
    IF NOT accounting_is_uuid(p->>'counterAccountId') THEN RAISE EXCEPTION 'account_unavailable'; END IF;
    SELECT * INTO ctr FROM accounting_accounts WHERE organization_id = org AND id = (p->>'counterAccountId')::uuid AND status = 'active' AND is_postable;
    IF NOT FOUND THEN RAISE EXCEPTION 'account_unavailable'; END IF;
    IF NOT ctr.manual_posting_allowed THEN RAISE EXCEPTION 'account_manual_posting_denied'; END IF;
    IF ctr.currency IS NOT NULL AND ctr.currency <> cur THEN RAISE EXCEPTION 'account_currency_mismatch'; END IF;
    -- Money moving between company accounts is a transfer, never income or expense.
    IF EXISTS (SELECT 1 FROM bank_account_mappings WHERE organization_id = org AND ledger_account_id = ctr.id AND status = 'approved') THEN RAISE EXCEPTION 'use_transfer_for_company_accounts'; END IF;
    IF EXISTS (SELECT 1 FROM banking_category_accounts WHERE organization_id = org AND category = 'staff_advances' AND status = 'approved' AND ledger_account_id = ctr.id) THEN RAISE EXCEPTION 'use_advance_workflow'; END IF;
    lines := CASE WHEN k = 'receipt' THEN jsonb_build_array(
        jsonb_build_object('accountId', la, 'debit', amt::text, 'currency', cur, 'description', descr),
        jsonb_build_object('accountId', ctr.id, 'credit', amt::text, 'currency', cur, 'description', descr, 'division', div, 'projectId', proj))
      ELSE jsonb_build_array(
        jsonb_build_object('accountId', ctr.id, 'debit', amt::text, 'currency', cur, 'description', descr, 'division', div, 'projectId', proj),
        jsonb_build_object('accountId', la, 'credit', amt::text, 'currency', cur, 'description', descr)) END;
    label := CASE WHEN k = 'receipt' THEN 'Cash receipt' ELSE 'Cash payment' END;

  ELSIF k = 'transfer' THEN
    c := banking_account_for_cash(org, p->>'toAccountId'); lc := banking_ledger(org, c.id);
    IF c.id = a.id THEN RAISE EXCEPTION 'transfer_same_account'; END IF;
    IF c.currency <> a.currency THEN RAISE EXCEPTION 'transfer_currency_mismatch'; END IF;
    IF banking_norm(ref) = '' THEN RAISE EXCEPTION 'transfer_reference_required'; END IF;
    -- One record per transfer: the same movement cannot be entered again from either side.
    PERFORM pg_advisory_xact_lock(hashtextextended(org || ':cash_transfer', 0));
    IF EXISTS (SELECT 1 FROM cash_transactions t2 WHERE t2.organization_id = org AND t2.kind = 'transfer' AND t2.amount = amt AND t2.txn_date = d
        AND t2.reference_normalized = banking_norm(ref) AND least(t2.banking_account_id, t2.counter_banking_account_id) = least(a.id, c.id)
        AND greatest(t2.banking_account_id, t2.counter_banking_account_id) = greatest(a.id, c.id) AND cash_transaction_live(org, t2.journal_id)) THEN
      RAISE EXCEPTION 'duplicate_transfer';
    END IF;
    IF c.kind = 'petty_cash' AND c.float_amount IS NOT NULL THEN
      SELECT coalesce(sum(t2.amount), 0) INTO pending FROM cash_transactions t2 JOIN accounting_journals j ON j.organization_id = t2.organization_id AND j.id = t2.journal_id
        WHERE t2.organization_id = org AND t2.kind = 'transfer' AND t2.counter_banking_account_id = c.id AND j.status IN ('submitted','approved');
      IF banking_book_balance(org, c.id, NULL) + pending + amt > c.float_amount THEN RAISE EXCEPTION 'petty_cash_float_exceeded'; END IF;
    END IF;
    lines := jsonb_build_array(
      jsonb_build_object('accountId', lc, 'debit', amt::text, 'currency', cur, 'description', descr),
      jsonb_build_object('accountId', la, 'credit', amt::text, 'currency', cur, 'description', descr));
    label := CASE WHEN c.kind = 'petty_cash' THEN 'Petty cash replenishment' ELSE 'Transfer' END;

  ELSIF k = 'advance' THEN
    IF NOT accounting_is_uuid(p->>'staffId') THEN RAISE EXCEPTION 'staff_unavailable'; END IF;
    SELECT id INTO who FROM staff_memberships WHERE organization_id = org AND id = (p->>'staffId')::uuid AND status = 'active';
    IF who IS NULL THEN RAISE EXCEPTION 'staff_unavailable'; END IF;
    cat := 'staff_advances'; cat_acct := banking_category_ledger(org, cat);
    lines := jsonb_build_array(
      jsonb_build_object('accountId', cat_acct, 'debit', amt::text, 'currency', cur, 'description', descr),
      jsonb_build_object('accountId', la, 'credit', amt::text, 'currency', cur, 'description', descr));
    label := 'Staff advance';

  ELSIF k = 'accountability' THEN
    IF NOT accounting_is_uuid(p->>'advanceId') THEN RAISE EXCEPTION 'advance_unavailable'; END IF;
    SELECT * INTO adv FROM cash_transactions WHERE organization_id = org AND id = (p->>'advanceId')::uuid AND kind = 'advance' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'advance_unavailable'; END IF;
    IF NOT EXISTS (SELECT 1 FROM accounting_journals WHERE organization_id = org AND id = adv.journal_id AND status = 'posted') THEN RAISE EXCEPTION 'advance_not_posted'; END IF;
    who := adv.staff_id; cur := adv.currency; d := banking_date(p->>'date');
    IF ev IS NULL THEN RAISE EXCEPTION 'cash_evidence_required'; END IF;
    cat_acct := banking_category_ledger(org, 'staff_advances');
    IF jsonb_typeof(coalesce(p->'expenses', '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p->'expenses', '[]'::jsonb)) > 20 THEN RAISE EXCEPTION 'invalid_journal_line'; END IF;
    FOR x IN SELECT value FROM jsonb_array_elements(coalesce(p->'expenses', '[]'::jsonb)) LOOP
      IF NOT accounting_is_uuid(x->>'accountId') THEN RAISE EXCEPTION 'accountability_account_invalid'; END IF;
      SELECT * INTO xa FROM accounting_accounts WHERE organization_id = org AND id = (x->>'accountId')::uuid AND status = 'active' AND is_postable AND manual_posting_allowed
        AND account_type IN ('cost_of_sales','operating_expense','other_expense') AND (currency IS NULL OR currency = cur);
      IF NOT FOUND THEN RAISE EXCEPTION 'accountability_account_invalid'; END IF;
      xamt := banking_money(x->>'amount');
      IF xamt <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
      exp_total := exp_total + xamt;
      exp_lines := exp_lines || jsonb_build_object('accountId', xa.id, 'debit', xamt::text, 'currency', cur, 'description', left(coalesce(nullif(trim(x->>'description'), ''), descr, 'Advance accountability'), 300), 'division', nullif(x->>'division', ''), 'projectId', nullif(x->>'projectId', ''));
    END LOOP;
    IF nullif(p->>'cashReturned', '') IS NOT NULL THEN ret := banking_money(p->>'cashReturned'); END IF;
    IF ret > 0 THEN
      a := banking_account_for_cash(org, p->>'bankingAccountId'); la := banking_ledger(org, a.id);
      IF a.currency <> cur THEN RAISE EXCEPTION 'transfer_currency_mismatch'; END IF;
      exp_lines := exp_lines || jsonb_build_object('accountId', la, 'debit', ret::text, 'currency', cur, 'description', 'Unspent advance returned');
    END IF;
    amt := exp_total + ret;
    IF amt <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
    IF amt > cash_advance_outstanding(org, adv.id) THEN RAISE EXCEPTION 'accountability_exceeds_advance'; END IF;
    descr := coalesce(descr, 'Accountability for advance ' || coalesce(adv.reference, adv.description));
    lines := exp_lines || jsonb_build_array(jsonb_build_object('accountId', cat_acct, 'credit', amt::text, 'currency', cur, 'description', descr));
    det := jsonb_build_object('expenses', coalesce(p->'expenses', '[]'::jsonb), 'cashReturned', ret::text);
    label := 'Advance accountability';

  ELSIF k = 'count_adjustment' THEN
    IF NOT accounting_is_uuid(p->>'cashCountId') THEN RAISE EXCEPTION 'cash_count_unavailable'; END IF;
    SELECT * INTO cc FROM cash_counts WHERE organization_id = org AND id = (p->>'cashCountId')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'cash_count_unavailable'; END IF;
    IF cc.difference = 0 THEN RAISE EXCEPTION 'cash_count_balanced'; END IF;
    IF EXISTS (SELECT 1 FROM cash_transactions WHERE organization_id = org AND cash_count_id = cc.id AND cash_transaction_live(org, journal_id)) THEN RAISE EXCEPTION 'cash_count_adjusted'; END IF;
    IF ev IS NULL THEN RAISE EXCEPTION 'cash_evidence_required'; END IF;
    a := banking_account_for_cash(org, cc.banking_account_id::text); la := banking_ledger(org, a.id); cur := a.currency;
    d := cc.count_date; amt := abs(cc.difference);
    IF descr IS NULL OR length(descr) < 5 THEN RAISE EXCEPTION 'cash_explanation_required'; END IF;
    cat := CASE WHEN cc.difference < 0 THEN 'cash_shortage' ELSE 'cash_overage' END; cat_acct := banking_category_ledger(org, cat);
    lines := CASE WHEN cc.difference < 0 THEN jsonb_build_array(
        jsonb_build_object('accountId', cat_acct, 'debit', amt::text, 'currency', cur, 'description', descr),
        jsonb_build_object('accountId', la, 'credit', amt::text, 'currency', cur, 'description', descr))
      ELSE jsonb_build_array(
        jsonb_build_object('accountId', la, 'debit', amt::text, 'currency', cur, 'description', descr),
        jsonb_build_object('accountId', cat_acct, 'credit', amt::text, 'currency', cur, 'description', descr)) END;
    label := CASE WHEN cc.difference < 0 THEN 'Cash shortage' ELSE 'Cash overage' END;

  ELSE -- bank_adjustment
    IF NOT accounting_is_uuid(p->>'statementLineId') THEN RAISE EXCEPTION 'statement_line_unavailable'; END IF;
    SELECT * INTO sl FROM bank_statement_lines WHERE organization_id = org AND id = (p->>'statementLineId')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'statement_line_unavailable'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(org || ':bank_match:' || sl.banking_account_id, 0));
    SELECT * INTO sl FROM bank_statement_lines WHERE organization_id = org AND id = sl.id FOR UPDATE;
    IF sl.review_status <> 'active' THEN RAISE EXCEPTION 'statement_line_unavailable'; END IF;
    IF banking_matched(org, sl.id, NULL, NULL) <> 0 THEN RAISE EXCEPTION 'statement_line_matched'; END IF;
    IF EXISTS (SELECT 1 FROM cash_transactions WHERE organization_id = org AND statement_line_id = sl.id AND cash_transaction_live(org, journal_id)) THEN RAISE EXCEPTION 'statement_line_adjusted'; END IF;
    cat := p->>'category';
    IF cat IS NULL OR cat NOT IN ('bank_fee','interest_income','interest_expense') THEN RAISE EXCEPTION 'invalid_adjustment_category'; END IF;
    IF (cat = 'interest_income') <> (sl.amount > 0) THEN RAISE EXCEPTION 'adjustment_direction_mismatch'; END IF;
    a := banking_account_for_cash(org, sl.banking_account_id::text); la := banking_ledger(org, a.id); cur := a.currency;
    cat_acct := banking_category_ledger(org, cat);
    d := sl.txn_date; amt := abs(sl.amount);
    descr := left(coalesce(descr, sl.description), 500); ref := left(coalesce(ref, sl.reference), 100);
    lines := CASE WHEN sl.amount < 0 THEN jsonb_build_array(
        jsonb_build_object('accountId', cat_acct, 'debit', amt::text, 'currency', cur, 'description', left(descr, 300)),
        jsonb_build_object('accountId', la, 'credit', amt::text, 'currency', cur, 'description', left(descr, 300)))
      ELSE jsonb_build_array(
        jsonb_build_object('accountId', la, 'debit', amt::text, 'currency', cur, 'description', left(descr, 300)),
        jsonb_build_object('accountId', cat_acct, 'credit', amt::text, 'currency', cur, 'description', left(descr, 300))) END;
    label := CASE cat WHEN 'bank_fee' THEN 'Bank charge' WHEN 'interest_income' THEN 'Interest received' ELSE 'Interest charged' END;
  END IF;

  INSERT INTO accounting_journals (organization_id, journal_type, status, entry_date, description, reference, prepared_by_id, idempotency_key)
  VALUES (org, 'manual', 'draft', d, left(label || ': ' || descr, 500), ref, staff, 'banking:' || key) RETURNING id INTO jid;
  PERFORM accounting_journal_write_lines(org, jid, lines);
  PERFORM accounting_event(org, 'journal', jid::text, actor, staff, 'created', NULL, 'draft', 1, NULL, accounting_journal_totals(org, jid) || jsonb_build_object('source', 'banking', 'kind', k), NULL, correlation);
  INSERT INTO cash_transactions (organization_id, kind, banking_account_id, counter_banking_account_id, currency, amount, txn_date, description, reference, counter_account_id, category,
    staff_id, advance_id, statement_line_id, cash_count_id, evidence_id, details, journal_id, prepared_by_id, idempotency_key)
  VALUES (org, k, a.id, c.id, cur, amt, d, descr, ref, ctr.id, CASE WHEN k = 'advance' THEN 'staff_advances' WHEN k IN ('bank_adjustment','count_adjustment') THEN cat END,
    who, adv.id, sl.id, cc.id, ev, det, jid, staff, key) RETURNING id INTO tid;
  PERFORM accounting_journal_command(org, actor, jid, 'submit', 1, NULL, 'banking-submit:' || key, correlation);
  PERFORM banking_event(org, 'cash_transaction', tid::text, actor, staff, 'prepared', descr,
    jsonb_build_object('kind', k, 'amount', amt::text, 'currency', cur, 'journalId', jid, 'bankingAccountId', a.id, 'toAccountId', c.id), key, correlation);
  RETURN jsonb_build_object('id', tid, 'journalId', jid, 'already', false);
END $$;
--> statement-breakpoint
-- approve: a different person approves and posts the journal in one transaction (a bank adjustment
-- is then matched to its statement line). reject: a reviewer refuses it. cancel: the preparer
-- withdraws and discards it.
CREATE OR REPLACE FUNCTION cash_transaction_decide(org text, actor text, tid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); t cash_transactions; j accounting_journals; r jsonb; jl uuid; sl bank_statement_lines; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF decision NOT IN ('approve','reject','cancel') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  IF key IS NULL OR length(key) > 180 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO t FROM cash_transactions WHERE organization_id = org AND id = tid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cash_transaction_unavailable'; END IF;
  IF banking_replay(org, key, 'cash_transaction', tid::text, decision) THEN
    SELECT * INTO j FROM accounting_journals WHERE organization_id = org AND id = t.journal_id;
    RETURN jsonb_build_object('id', tid, 'status', j.status, 'number', j.number, 'already', true);
  END IF;
  SELECT * INTO j FROM accounting_journals WHERE organization_id = org AND id = t.journal_id;
  IF j.status <> 'submitted' THEN RAISE EXCEPTION 'cash_transaction_not_pending'; END IF;
  IF decision = 'approve' THEN
    r := accounting_journal_command(org, actor, j.id, 'approve', j.version, clean, key || ':approve', correlation);
    r := accounting_journal_command(org, actor, j.id, 'post', (r->>'version')::integer, NULL, key || ':post', correlation);
    IF t.kind = 'bank_adjustment' THEN
      SELECT * INTO sl FROM bank_statement_lines WHERE organization_id = org AND id = t.statement_line_id;
      SELECT id INTO jl FROM accounting_journal_lines WHERE organization_id = org AND journal_id = j.id AND account_id = banking_ledger(org, t.banking_account_id) ORDER BY line_number LIMIT 1;
      PERFORM banking_match_insert(org, staff, t.banking_account_id, 'adjustment',
        jsonb_build_array(jsonb_build_object('statementLineId', sl.id, 'amount', sl.amount::text), jsonb_build_object('journalLineId', jl, 'amount', sl.amount::text)),
        'Bank adjustment ' || (r->>'number'), 'banking-adjustment:' || t.id);
    END IF;
  ELSIF decision = 'reject' THEN
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
    r := accounting_journal_command(org, actor, j.id, 'reject', j.version, clean, key || ':reject', correlation);
  ELSE
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
    r := accounting_journal_command(org, actor, j.id, 'withdraw', j.version, clean, key || ':withdraw', correlation);
    r := accounting_journal_command(org, actor, j.id, 'discard', (r->>'version')::integer, clean, key || ':discard', correlation);
  END IF;
  PERFORM banking_event(org, 'cash_transaction', tid::text, actor, staff, decision, clean, jsonb_build_object('journalId', j.id, 'status', r->>'status', 'number', r->>'number'), key, correlation);
  RETURN jsonb_build_object('id', tid, 'status', r->>'status', 'number', r->>'number', 'already', false);
END $$;
--> statement-breakpoint
-- p: {key, bankingAccountId, countDate, countedAmount, denominations, note, witnessId, evidenceId}
CREATE OR REPLACE FUNCTION cash_count_record(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); cc cash_counts; b banking_accounts; d date; counted numeric; book numeric; wid uuid; ev uuid; cid uuid; pend integer;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO cc FROM cash_counts WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF cc.counted_by_id <> staff OR cc.banking_account_id::text IS DISTINCT FROM p->>'bankingAccountId' THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', cc.id, 'difference', cc.difference::text, 'bookBalance', cc.book_balance::text, 'already', true);
  END IF;
  b := banking_account_for_cash(org, p->>'bankingAccountId');
  IF b.kind NOT IN ('cash','petty_cash') THEN RAISE EXCEPTION 'cash_count_not_applicable'; END IF;
  d := banking_date(p->>'countDate'); counted := banking_money(p->>'countedAmount');
  IF nullif(p->>'witnessId', '') IS NOT NULL THEN
    IF NOT accounting_is_uuid(p->>'witnessId') THEN RAISE EXCEPTION 'staff_unavailable'; END IF;
    SELECT id INTO wid FROM staff_memberships WHERE organization_id = org AND id = (p->>'witnessId')::uuid AND status = 'active';
    IF wid IS NULL THEN RAISE EXCEPTION 'staff_unavailable'; END IF;
    IF wid = staff THEN RAISE EXCEPTION 'witness_must_differ'; END IF;
  END IF;
  IF nullif(p->>'evidenceId', '') IS NOT NULL THEN
    IF NOT accounting_is_uuid(p->>'evidenceId') THEN RAISE EXCEPTION 'banking_evidence_unavailable'; END IF;
    SELECT id INTO ev FROM banking_evidence WHERE organization_id = org AND id = (p->>'evidenceId')::uuid;
    IF ev IS NULL THEN RAISE EXCEPTION 'banking_evidence_unavailable'; END IF;
  END IF;
  IF p->'denominations' IS NOT NULL AND jsonb_typeof(p->'denominations') <> 'null' AND (jsonb_typeof(p->'denominations') <> 'array' OR jsonb_array_length(p->'denominations') > 40) THEN RAISE EXCEPTION 'invalid_denominations'; END IF;
  IF length(coalesce(p->>'note', '')) > 2000 THEN RAISE EXCEPTION 'note_too_long'; END IF;
  book := banking_book_balance(org, b.id, d);
  SELECT count(DISTINCT j.id) INTO pend FROM accounting_journals j JOIN accounting_journal_lines l ON l.organization_id = j.organization_id AND l.journal_id = j.id
    WHERE j.organization_id = org AND l.account_id = banking_ledger(org, b.id) AND j.status IN ('draft','submitted','approved') AND j.entry_date <= d;
  INSERT INTO cash_counts (organization_id, banking_account_id, currency, count_date, counted_amount, book_balance, pending_journals, denominations, note, counted_by_id, witness_id, evidence_id, idempotency_key)
  VALUES (org, b.id, b.currency, d, counted, book, pend, CASE WHEN jsonb_typeof(p->'denominations') = 'array' THEN p->'denominations' END, nullif(trim(coalesce(p->>'note', '')), ''), staff, wid, ev, key)
  RETURNING id INTO cid;
  PERFORM banking_event(org, 'cash_count', cid::text, actor, staff, 'counted', p->>'note',
    jsonb_build_object('bankingAccountId', b.id, 'countDate', d, 'counted', counted::text, 'book', book::text, 'difference', (counted - book)::text, 'pendingJournals', pend), key, correlation);
  RETURN jsonb_build_object('id', cid, 'difference', (counted - book)::text, 'bookBalance', book::text, 'pendingJournals', pend, 'already', false);
END $$;
