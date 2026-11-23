-- Phase 2E: financial statements, accounting period closing and year-end processing (additive only).
--
-- No existing table, constraint or function is altered. One trigger is ADDED to accounting_periods:
-- once an organization approves a period-close policy, periods can only be closed or reopened through
-- the controlled close and year-end workflows below. Without an approved policy, Phase 2A behaviour
-- is unchanged.
--
-- Principles enforced by the database:
--   * Statements are computed only from POSTED journal lines (functional amounts). Drafts, submitted,
--     rejected and discarded journals never affect a balance. There is no second ledger and no
--     balancing account: an unexplained difference blocks approval.
--   * Every account's statement line, cash-flow class and clearing flag come from an approved,
--     versioned classification. Unclassified activity makes a report provisional and unapprovable.
--   * Approved statement sets are immutable snapshots tied to a ledger fingerprint; a set whose ledger
--     has moved is stale and cannot be approved.
--   * Period close and year-end are single transactions: a crash leaves nothing half-closed.
--   * Year-end closing is idempotent: one active closing per financial year, never two transfers.

-- ---------------------------------------------------------------------------------------------
-- History and helpers
-- ---------------------------------------------------------------------------------------------

CREATE TABLE fs_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  entity_type text NOT NULL CHECK (entity_type IN ('classification','statement_set','adjustment','overhead_policy','close_policy','period_close','close_exception','year_end')),
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
CREATE UNIQUE INDEX fs_events_idempotency_uq ON fs_events (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX fs_events_entity_idx ON fs_events (organization_id, entity_type, entity_id, created_at);
--> statement-breakpoint
CREATE TRIGGER fs_events_immutable BEFORE UPDATE OR DELETE ON fs_events FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER fs_events_no_truncate BEFORE TRUNCATE ON fs_events FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fs_event(org text, etype text, eid text, actor text, staff uuid, act text, note text, changes jsonb, key text, correlation text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO fs_events (organization_id, entity_type, entity_id, actor_clerk_user_id, actor_staff_id, action, note, changes, idempotency_key, correlation_id)
  VALUES (org, etype, eid, actor, staff, act, nullif(trim(coalesce(note, '')), ''), coalesce(changes, '{}'::jsonb), key, correlation);
  INSERT INTO audit_logs (organization_id, actor_clerk_user_id, actor_type, action, entity_type, entity_id, changes, request_id)
  VALUES (org, actor, 'staff', 'fs.' || etype || '.' || act, etype, eid, coalesce(changes, '{}'::jsonb), correlation);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fs_replay(org text, key text, etype text, eid text, act text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE ev fs_events;
BEGIN
  IF key IS NULL OR length(key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO ev FROM fs_events WHERE organization_id = org AND idempotency_key = key;
  IF NOT FOUND THEN RETURN false; END IF;
  IF ev.entity_type <> etype OR ev.entity_id <> eid OR ev.action <> act THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN true;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Statement classification: an approved, versioned mapping of every account to a statement line,
-- a cash-flow class and a clearing (suspense) flag. Proposed by one person, approved by another.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fs_line_fits(t text, contra boolean, line text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN line = 'revenue' THEN t = 'income'
    WHEN line = 'cost_of_sales' THEN t = 'cost_of_sales'
    WHEN line = 'operating_expenses' THEN t = 'operating_expense'
    WHEN line = 'other_income' THEN t IN ('other_income','income')
    WHEN line IN ('other_expenses','finance_costs','income_tax') THEN t IN ('other_expense','operating_expense')
    WHEN line = 'accumulated_depreciation' THEN t = 'asset' AND contra
    WHEN line IN ('cash_and_bank','ppe_cost') THEN t = 'asset' AND NOT contra
    -- Contra assets such as an allowance for credit losses are presented within their line.
    WHEN line IN ('receivables','advances_prepayments','inventory','tax_assets','other_assets') THEN t = 'asset'
    WHEN line IN ('payables','accrued_expenses','customer_advances','tax_liabilities','borrowings','other_liabilities') THEN t = 'liability'
    WHEN line IN ('share_capital','retained_earnings','distributions','opening_balance_equity','other_equity') THEN t = 'equity'
    ELSE false END;
$$;
--> statement-breakpoint
CREATE TABLE fs_classification_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  version integer NOT NULL CHECK (version > 0),
  -- {"<accountId>": {"line": "...", "cashflow": "operating"|"investing"|"financing"|null, "clearing": bool}}
  mappings jsonb NOT NULL,
  cash_flow_method text NOT NULL DEFAULT 'direct' CHECK (cash_flow_method IN ('direct')),
  retained_earnings_account_id uuid NOT NULL,
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','superseded')),
  proposed_by_id uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, version),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, retained_earnings_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, proposed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'proposed') = (decided_by_id IS NULL)),
  CHECK (decided_by_id IS NULL OR decided_by_id <> proposed_by_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX fs_classification_one_approved_uq ON fs_classification_versions (organization_id) WHERE status = 'approved';
--> statement-breakpoint
CREATE UNIQUE INDEX fs_classification_one_proposal_uq ON fs_classification_versions (organization_id) WHERE status = 'proposed';
--> statement-breakpoint
CREATE TRIGGER fs_classification_no_truncate BEFORE TRUNCATE ON fs_classification_versions FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fs_classification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text; v jsonb; a accounting_accounts;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'fs_history_immutable'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','decision_note']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','decision_note'])
       OR NOT ((OLD.status = 'proposed' AND NEW.status IN ('approved','rejected')) OR (OLD.status = 'approved' AND NEW.status = 'superseded')) THEN
      RAISE EXCEPTION 'fs_history_immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status <> 'proposed' OR jsonb_typeof(NEW.mappings) <> 'object' THEN RAISE EXCEPTION 'invalid_classification'; END IF;
  FOR k, v IN SELECT key, value FROM jsonb_each(NEW.mappings) LOOP
    IF NOT accounting_is_uuid(k) THEN RAISE EXCEPTION 'invalid_classification'; END IF;
    SELECT * INTO a FROM accounting_accounts WHERE organization_id = NEW.organization_id AND id = k::uuid;
    IF NOT FOUND OR NOT a.is_postable OR NOT fs_line_fits(a.account_type, a.is_contra, v->>'line') THEN RAISE EXCEPTION 'classification_line_invalid'; END IF;
    IF v->>'cashflow' IS NOT NULL AND v->>'cashflow' NOT IN ('operating','investing','financing') THEN RAISE EXCEPTION 'invalid_classification'; END IF;
    IF v->>'line' = 'cash_and_bank' AND v->>'cashflow' IS NOT NULL THEN RAISE EXCEPTION 'invalid_classification'; END IF;
    IF v ? 'clearing' AND jsonb_typeof(v->'clearing') <> 'boolean' THEN RAISE EXCEPTION 'invalid_classification'; END IF;
  END LOOP;
  IF NOT (NEW.mappings ? NEW.retained_earnings_account_id::text) OR NEW.mappings->NEW.retained_earnings_account_id::text->>'line' <> 'retained_earnings' THEN
    RAISE EXCEPTION 'retained_earnings_account_invalid';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER fs_classification_guard BEFORE INSERT OR UPDATE OR DELETE ON fs_classification_versions FOR EACH ROW EXECUTE FUNCTION fs_classification_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fs_classification_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); c fs_classification_versions; cid uuid; v integer;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO c FROM fs_classification_versions WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', c.id, 'version', c.version, 'already', true); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':fs_classification', 0));
  IF EXISTS (SELECT 1 FROM fs_classification_versions WHERE organization_id = org AND status = 'proposed') THEN RAISE EXCEPTION 'classification_pending'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v FROM fs_classification_versions WHERE organization_id = org;
  IF NOT accounting_is_uuid(p->>'retainedEarningsAccountId') THEN RAISE EXCEPTION 'retained_earnings_account_invalid'; END IF;
  INSERT INTO fs_classification_versions (organization_id, version, mappings, retained_earnings_account_id, note, proposed_by_id, idempotency_key)
  VALUES (org, v, coalesce(p->'mappings', '{}'::jsonb), (p->>'retainedEarningsAccountId')::uuid, trim(coalesce(p->>'note', '')), staff, key) RETURNING id INTO cid;
  PERFORM fs_event(org, 'classification', cid::text, actor, staff, 'proposed', p->>'note', jsonb_build_object('version', v, 'accounts', (SELECT count(*) FROM jsonb_object_keys(coalesce(p->'mappings', '{}'::jsonb)))), key, correlation);
  RETURN jsonb_build_object('id', cid, 'version', v, 'already', false);
EXCEPTION WHEN check_violation OR foreign_key_violation THEN RAISE EXCEPTION 'invalid_classification';
END $$;
--> statement-breakpoint
-- Generic two-person decision for Phase 2E policies (classification, overhead, close policy).
CREATE OR REPLACE FUNCTION fs_policy_decide(org text, actor text, etype text, pid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); proposer uuid; st text; target text; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF etype NOT IN ('classification','overhead_policy','close_policy') OR decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':fs_policy:' || etype, 0));
  IF fs_replay(org, key, etype, pid::text, decision) THEN RETURN jsonb_build_object('id', pid, 'already', true); END IF;
  IF etype = 'classification' THEN SELECT proposed_by_id, status INTO proposer, st FROM fs_classification_versions WHERE organization_id = org AND id = pid FOR UPDATE;
  ELSIF etype = 'overhead_policy' THEN SELECT proposed_by_id, status INTO proposer, st FROM overhead_allocation_versions WHERE organization_id = org AND id = pid FOR UPDATE;
  ELSE SELECT proposed_by_id, status INTO proposer, st FROM period_close_policy_versions WHERE organization_id = org AND id = pid FOR UPDATE;
  END IF;
  IF st IS DISTINCT FROM 'proposed' THEN RAISE EXCEPTION 'fs_policy_unavailable'; END IF;
  IF proposer = staff THEN RAISE EXCEPTION 'fs_self_approval_denied'; END IF;
  IF decision = 'reject' AND length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
  target := CASE WHEN decision = 'approve' THEN 'approved' ELSE 'rejected' END;
  IF etype = 'classification' THEN
    IF decision = 'approve' THEN UPDATE fs_classification_versions SET status = 'superseded' WHERE organization_id = org AND status = 'approved'; END IF;
    UPDATE fs_classification_versions SET status = target, decided_by_id = staff, decided_at = now(), decision_note = clean WHERE organization_id = org AND id = pid;
  ELSIF etype = 'overhead_policy' THEN
    IF decision = 'approve' THEN UPDATE overhead_allocation_versions SET status = 'superseded' WHERE organization_id = org AND status = 'approved'; END IF;
    UPDATE overhead_allocation_versions SET status = target, decided_by_id = staff, decided_at = now(), decision_note = clean WHERE organization_id = org AND id = pid;
  ELSE
    IF decision = 'approve' THEN UPDATE period_close_policy_versions SET status = 'superseded' WHERE organization_id = org AND status = 'approved'; END IF;
    UPDATE period_close_policy_versions SET status = target, decided_by_id = staff, decided_at = now(), decision_note = clean WHERE organization_id = org AND id = pid;
  END IF;
  PERFORM fs_event(org, etype, pid::text, actor, staff, decision, clean, jsonb_build_object('status', target), key, correlation);
  RETURN jsonb_build_object('id', pid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fs_classification_current(org text) RETURNS fs_classification_versions LANGUAGE sql STABLE AS $$
  SELECT * FROM fs_classification_versions WHERE organization_id = org AND status = 'approved';
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Ledger balances. Posted lines only, functional amounts. Year-end closing journals (and their
-- reversals) are excluded from period results but included in balance-sheet balances.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fs_is_closing_journal(org text, jid uuid) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM year_end_closes y WHERE y.organization_id = org AND (y.journal_id = jid
    OR y.journal_id = (SELECT reverses_journal_id FROM accounting_journals WHERE organization_id = org AND id = jid)));
END $$;
--> statement-breakpoint
-- Per account: opening (before s), period debits and credits, closing (to e). exclude_closing omits
-- year-end closing journals from the PERIOD MOVEMENT only (used for results); opening/closing use all.
CREATE OR REPLACE FUNCTION fs_account_balances(org text, s date, e date, exclude_closing boolean DEFAULT false, div text DEFAULT NULL, proj uuid DEFAULT NULL)
RETURNS TABLE (account_id uuid, code text, name text, account_type text, is_contra boolean, normal_balance text, parent_id uuid,
  opening numeric, debit numeric, credit numeric, closing numeric) LANGUAGE plpgsql STABLE AS $$
BEGIN
  -- Set-based: the closing journals are resolved once, lines are aggregated per account once, and
  -- only then joined to the chart (a per-line function call here was quadratic in practice).
  RETURN QUERY
  WITH closing AS MATERIALIZED (
    SELECT y.journal_id AS jid FROM year_end_closes y WHERE y.organization_id = org AND y.journal_id IS NOT NULL
    UNION
    SELECT r.id FROM accounting_journals r JOIN year_end_closes y ON y.organization_id = r.organization_id AND y.journal_id = r.reverses_journal_id WHERE r.organization_id = org
  ), agg AS MATERIALIZED (
    SELECT l.account_id AS aid,
      sum(l.functional_debit - l.functional_credit) FILTER (WHERE j.entry_date < s) AS o,
      sum(l.functional_debit) FILTER (WHERE j.entry_date >= s AND NOT (exclude_closing AND cj.jid IS NOT NULL)) AS d,
      sum(l.functional_credit) FILTER (WHERE j.entry_date >= s AND NOT (exclude_closing AND cj.jid IS NOT NULL)) AS c,
      sum(l.functional_debit - l.functional_credit) AS cl
    FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id AND j.status = 'posted'
    LEFT JOIN closing cj ON cj.jid = j.id
    WHERE l.organization_id = org AND j.entry_date <= e AND (div IS NULL OR l.division = div) AND (proj IS NULL OR l.project_id = proj)
    GROUP BY l.account_id
  )
  SELECT a.id, a.code, a.name, a.account_type, a.is_contra, a.normal_balance, a.parent_id,
    coalesce(x.o, 0), coalesce(x.d, 0), coalesce(x.c, 0), coalesce(x.cl, 0)
  FROM agg x JOIN accounting_accounts a ON a.organization_id = org AND a.id = x.aid
  WHERE a.is_postable
  ORDER BY a.code;
END $$;
--> statement-breakpoint
-- Trial balance for a period: opening, movement and closing per account; totals must agree.
CREATE OR REPLACE FUNCTION fs_trial_balance(org text, s date, e date) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb; od numeric; oc numeric; md numeric; mc numeric; cd numeric; cc numeric; foreign_lines integer;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('accountId', b.account_id, 'code', b.code, 'name', b.name, 'type', b.account_type,
      'openingDebit', greatest(b.opening, 0)::text, 'openingCredit', greatest(-b.opening, 0)::text, 'debit', b.debit::text, 'credit', b.credit::text,
      'closingDebit', greatest(b.closing, 0)::text, 'closingCredit', greatest(-b.closing, 0)::text) ORDER BY b.code), '[]'::jsonb),
    coalesce(sum(greatest(b.opening, 0)), 0), coalesce(sum(greatest(-b.opening, 0)), 0), coalesce(sum(b.debit), 0), coalesce(sum(b.credit), 0),
    coalesce(sum(greatest(b.closing, 0)), 0), coalesce(sum(greatest(-b.closing, 0)), 0)
    INTO rows, od, oc, md, mc, cd, cc FROM fs_account_balances(org, s, e) b WHERE b.opening <> 0 OR b.debit <> 0 OR b.credit <> 0;
  SELECT count(*) INTO foreign_lines FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id AND j.status = 'posted'
    WHERE l.organization_id = org AND j.entry_date <= e AND l.currency <> j.functional_currency;
  RETURN jsonb_build_object('periodStart', s, 'periodEnd', e, 'rows', rows,
    'totals', jsonb_build_object('openingDebit', od::text, 'openingCredit', oc::text, 'debit', md::text, 'credit', mc::text, 'closingDebit', cd::text, 'closingCredit', cc::text),
    'balanced', od = oc AND md = mc AND cd = cc, 'foreignCurrencyLines', foreign_lines);
END $$;
--> statement-breakpoint
-- Income statement. Amounts are credit-positive (income positive, costs negative), shown by line.
CREATE OR REPLACE FUNCTION fs_income_statement(org text, s date, e date, div text DEFAULT NULL, proj uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE cls fs_classification_versions := fs_classification_current(org); r record; lines jsonb := '{}'::jsonb; unmapped jsonb := '[]'::jsonb; amt numeric; ln text;
  rev numeric := 0; cos numeric := 0; opx numeric := 0; oi numeric := 0; ox numeric := 0; fin numeric := 0; tax numeric := 0; unc numeric := 0;
BEGIN
  FOR r IN SELECT * FROM fs_account_balances(org, s, e, true, div, proj) WHERE account_type IN ('income','other_income','cost_of_sales','operating_expense','other_expense') LOOP
    amt := r.credit - r.debit;
    CONTINUE WHEN amt = 0;
    ln := cls.mappings->r.account_id::text->>'line';
    -- Unclassified activity still counts in the result (the statement is provisional), never dropped.
    IF ln IS NULL THEN unmapped := unmapped || jsonb_build_object('accountId', r.account_id, 'code', r.code, 'name', r.name, 'amount', amt::text); unc := unc + amt; CONTINUE; END IF;
    lines := jsonb_set(lines, ARRAY[ln], coalesce(lines->ln, '[]'::jsonb) || jsonb_build_object('accountId', r.account_id, 'code', r.code, 'name', r.name, 'amount', amt::text));
    CASE ln WHEN 'revenue' THEN rev := rev + amt; WHEN 'cost_of_sales' THEN cos := cos + amt; WHEN 'operating_expenses' THEN opx := opx + amt;
      WHEN 'other_income' THEN oi := oi + amt; WHEN 'other_expenses' THEN ox := ox + amt; WHEN 'finance_costs' THEN fin := fin + amt; WHEN 'income_tax' THEN tax := tax + amt; ELSE NULL; END CASE;
  END LOOP;
  RETURN jsonb_build_object('periodStart', s, 'periodEnd', e, 'division', div, 'projectId', proj, 'classificationVersion', cls.version, 'lines', lines, 'lineTotals', (SELECT coalesce(jsonb_object_agg(g.key, (SELECT sum((x->>'amount')::numeric) FROM jsonb_array_elements(g.value) x)::text), '{}'::jsonb) FROM jsonb_each(lines) g),
    'revenue', rev::text, 'costOfSales', cos::text, 'grossProfit', (rev + cos)::text, 'operatingExpenses', opx::text, 'operatingProfit', (rev + cos + opx)::text,
    'otherIncome', oi::text, 'otherExpenses', ox::text, 'financeCosts', fin::text, 'unclassified', unc::text, 'profitBeforeTax', (rev + cos + opx + oi + ox + fin + unc)::text,
    'incomeTax', tax::text, 'netProfit', (rev + cos + opx + oi + ox + fin + unc + tax)::text, 'unmapped', unmapped,
    'provisional', cls.id IS NULL OR jsonb_array_length(unmapped) > 0);
END $$;
--> statement-breakpoint
-- Balance sheet at a date. Assets debit-positive; liabilities and equity credit-positive. Results not
-- yet closed to retained earnings are shown as current-period results. Any difference blocks approval.
CREATE OR REPLACE FUNCTION fs_balance_sheet(org text, as_of date) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE cls fs_classification_versions := fs_classification_current(org); r record; lines jsonb := '{}'::jsonb; unmapped jsonb := '[]'::jsonb; ln text; amt numeric;
  assets numeric := 0; liab numeric := 0; equity numeric := 0; results numeric := 0;
BEGIN
  FOR r IN SELECT * FROM fs_account_balances(org, as_of, as_of) LOOP
    CONTINUE WHEN r.closing = 0;
    IF r.account_type IN ('income','other_income','cost_of_sales','operating_expense','other_expense') THEN results := results - r.closing; CONTINUE; END IF;
    ln := cls.mappings->r.account_id::text->>'line';
    amt := CASE WHEN r.account_type = 'asset' THEN r.closing ELSE -r.closing END;
    IF ln IS NULL THEN unmapped := unmapped || jsonb_build_object('accountId', r.account_id, 'code', r.code, 'name', r.name, 'amount', amt::text);
    ELSE lines := jsonb_set(lines, ARRAY[ln], coalesce(lines->ln, '[]'::jsonb) || jsonb_build_object('accountId', r.account_id, 'code', r.code, 'name', r.name, 'amount', amt::text)); END IF;
    IF r.account_type = 'asset' THEN assets := assets + amt; ELSIF r.account_type = 'liability' THEN liab := liab + amt; ELSE equity := equity + amt; END IF;
  END LOOP;
  RETURN jsonb_build_object('asOf', as_of, 'classificationVersion', cls.version, 'lines', lines, 'lineTotals', (SELECT coalesce(jsonb_object_agg(g.key, (SELECT sum((x->>'amount')::numeric) FROM jsonb_array_elements(g.value) x)::text), '{}'::jsonb) FROM jsonb_each(lines) g), 'totalAssets', assets::text, 'totalLiabilities', liab::text,
    'totalLiabilitiesAndEquity', (liab + equity + results)::text,
    'equityAccounts', equity::text, 'currentPeriodResults', results::text, 'totalEquity', (equity + results)::text,
    'difference', (assets - liab - equity - results)::text, 'unmapped', unmapped,
    'balanced', assets = liab + equity + results, 'provisional', cls.id IS NULL OR jsonb_array_length(unmapped) > 0);
END $$;
--> statement-breakpoint
-- Direct-method cash flow. Cash accounts are those classified cash_and_bank. Each posted journal's cash
-- movement is attributed to its non-cash lines by THEIR approved cash-flow class (never by sign).
-- Journals that only move money between cash accounts are internal transfers and are excluded.
CREATE OR REPLACE FUNCTION fs_cash_flow(org text, s date, e date) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE cls fs_classification_versions := fs_classification_current(org); opening numeric; closing numeric; op numeric := 0; inv numeric := 0; fin numeric := 0;
  r record; detail jsonb := '{}'::jsonb; unclassified jsonb := '[]'::jsonb; transfers numeric := 0; cf text; unrec jsonb; cash_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(key::uuid), ARRAY[]::uuid[]) INTO cash_ids FROM jsonb_each(coalesce(cls.mappings, '{}'::jsonb)) WHERE value->>'line' = 'cash_and_bank';
  SELECT coalesce(sum(l.functional_debit - l.functional_credit) FILTER (WHERE j.entry_date < s), 0), coalesce(sum(l.functional_debit - l.functional_credit), 0) INTO opening, closing
    FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id AND j.status = 'posted'
    WHERE l.organization_id = org AND l.account_id = ANY (cash_ids) AND j.entry_date <= e;
  FOR r IN
    WITH cash_j AS (
      SELECT DISTINCT l.journal_id FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id AND j.status = 'posted'
      WHERE l.organization_id = org AND l.account_id = ANY (cash_ids) AND j.entry_date BETWEEN s AND e)
    SELECT l.account_id, a.code, a.name, sum(l.functional_credit - l.functional_debit) AS inflow,
      bool_and(l.account_id = ANY (cash_ids)) OVER (PARTITION BY l.journal_id) AS only_cash, l.journal_id
    FROM accounting_journal_lines l JOIN cash_j ON cash_j.journal_id = l.journal_id JOIN accounting_accounts a ON a.organization_id = l.organization_id AND a.id = l.account_id
    WHERE l.organization_id = org GROUP BY l.journal_id, l.account_id, a.code, a.name
  LOOP
    IF r.only_cash THEN
      -- Internal transfer: the amount leaving one cash account (credit) arrives in another.
      transfers := transfers + greatest(r.inflow, 0);
      CONTINUE;
    END IF;
    CONTINUE WHEN r.account_id = ANY (cash_ids);
    cf := cls.mappings->r.account_id::text->>'cashflow';
    IF cf IS NULL THEN unclassified := unclassified || jsonb_build_object('accountId', r.account_id, 'code', r.code, 'name', r.name, 'amount', r.inflow::text); CONTINUE; END IF;
    IF NOT detail ? cf THEN detail := detail || jsonb_build_object(cf, '{}'::jsonb); END IF;
    detail := jsonb_set(detail, ARRAY[cf, r.code || ' ' || r.name], to_jsonb((coalesce((detail->cf->>(r.code || ' ' || r.name))::numeric, 0) + r.inflow)::text), true);
    CASE cf WHEN 'operating' THEN op := op + r.inflow; WHEN 'investing' THEN inv := inv + r.inflow; ELSE fin := fin + r.inflow; END CASE;
  END LOOP;
  -- Bank and mobile-money accounts whose reconciliation is not finalized through the period end.
  SELECT coalesce(jsonb_agg(b.label), '[]'::jsonb) INTO unrec FROM banking_accounts b
    WHERE b.organization_id = org AND b.status = 'active' AND b.kind IN ('bank','mobile_money') AND banking_ledger(org, b.id) = ANY (cash_ids)
      AND coalesce(banking_locked_until(org, b.id), '1900-01-01'::date) < e;
  RETURN jsonb_build_object('periodStart', s, 'periodEnd', e, 'method', 'direct', 'classificationVersion', cls.version,
    'openingCash', opening::text, 'operating', op::text, 'investing', inv::text, 'financing', fin::text, 'netMovement', (op + inv + fin)::text,
    'unclassified', unclassified, 'unclassifiedTotal', (SELECT coalesce(sum((x->>'amount')::numeric), 0) FROM jsonb_array_elements(unclassified) x)::text,
    'closingCash', closing::text, 'internalTransfers', transfers::text, 'detail', detail, 'unreconciledAccounts', unrec,
    'reconciles', opening + op + inv + fin + (SELECT coalesce(sum((x->>'amount')::numeric), 0) FROM jsonb_array_elements(unclassified) x) = closing,
    'provisional', cls.id IS NULL OR jsonb_array_length(unclassified) > 0 OR cardinality(cash_ids) = 0 OR jsonb_array_length(unrec) > 0);
END $$;
--> statement-breakpoint
-- Statement of changes in equity, by equity line, reconciled to posted ledger movements.
CREATE OR REPLACE FUNCTION fs_equity_changes(org text, s date, e date) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE cls fs_classification_versions := fs_classification_current(org); r record; rows jsonb := '[]'::jsonb; ln text;
  opening numeric := 0; closing numeric := 0; capital numeric := 0; distributions numeric := 0; transfers numeric := 0; prior numeric := 0; other numeric := 0;
  results_open numeric; results_close numeric; profit numeric; unmapped integer := 0;
BEGIN
  FOR r IN
    SELECT a.id, a.code, a.name, l.journal_id, j.entry_date, (l.functional_credit - l.functional_debit) AS amt, fs_is_closing_journal(org, j.id) AS closing_j,
      EXISTS (SELECT 1 FROM adjustment_entries x WHERE x.organization_id = org AND x.journal_id = j.id AND x.prior_period) AS prior_j
    FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id AND j.status = 'posted'
    JOIN accounting_accounts a ON a.organization_id = l.organization_id AND a.id = l.account_id
    WHERE l.organization_id = org AND a.account_type = 'equity' AND j.entry_date <= e
  LOOP
    ln := cls.mappings->r.id::text->>'line';
    IF ln IS NULL THEN unmapped := unmapped + 1; END IF;
    IF r.entry_date < s THEN opening := opening + r.amt; CONTINUE; END IF;
    closing := closing + r.amt;
    IF r.closing_j THEN transfers := transfers + r.amt;
    ELSIF r.prior_j THEN prior := prior + r.amt;
    ELSIF ln = 'share_capital' THEN capital := capital + r.amt;
    ELSIF ln = 'distributions' THEN distributions := distributions + r.amt;
    ELSE other := other + r.amt; END IF;
  END LOOP;
  closing := closing + opening;
  -- Results not yet closed to retained earnings, at the start and end of the period.
  SELECT coalesce(-sum(b.opening), 0), coalesce(-sum(b.closing), 0) INTO results_open, results_close
    FROM fs_account_balances(org, s, e) b WHERE b.account_type IN ('income','other_income','cost_of_sales','operating_expense','other_expense');
  profit := (fs_income_statement(org, s, e)->>'netProfit')::numeric;
  RETURN jsonb_build_object('periodStart', s, 'periodEnd', e, 'openingEquityAccounts', opening::text, 'openingUnclosedResults', results_open::text,
    'openingEquity', (opening + results_open)::text, 'capitalIntroduced', capital::text, 'distributions', distributions::text, 'profitForPeriod', profit::text,
    'yearEndTransfers', transfers::text, 'priorPeriodCorrections', prior::text, 'otherMovements', other::text,
    'closingEquityAccounts', closing::text, 'closingUnclosedResults', results_close::text, 'closingEquity', (closing + results_close)::text,
    -- Opening + capital + distributions + profit + prior corrections + other = closing (year-end transfers net to zero against results).
    'reconciles', (opening + results_open) + capital + distributions + profit + prior + other = closing + results_close,
    'provisional', cls.id IS NULL OR unmapped > 0);
END $$;
--> statement-breakpoint
-- A fingerprint of everything posted up to a date: a statement set is stale when it changes.
CREATE OR REPLACE FUNCTION fs_ledger_fingerprint(org text, e date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT md5(concat_ws('|', count(*), coalesce(sum(l.functional_debit), 0), coalesce(sum(l.functional_credit), 0), coalesce(max(j.posted_at)::text, ''),
    coalesce(string_agg(DISTINCT j.number, ',' ORDER BY j.number), '')))
  FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id AND j.status = 'posted'
  WHERE l.organization_id = org AND j.entry_date <= e;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Overhead allocation (division reporting). Shared costs are shown as "not allocated" unless an
-- approved, versioned policy exists. Allocation is a reporting memo only: it never posts journals.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE overhead_allocation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  version integer NOT NULL CHECK (version > 0),
  basis text NOT NULL DEFAULT 'fixed_shares' CHECK (basis IN ('fixed_shares')),
  -- {"estates": "0.25", "architecture": "0.25", ...}; fractions summing to exactly 1.
  shares jsonb NOT NULL,
  effective_from date NOT NULL,
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','superseded')),
  proposed_by_id uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, version),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, proposed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'proposed') = (decided_by_id IS NULL)),
  CHECK (decided_by_id IS NULL OR decided_by_id <> proposed_by_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX overhead_allocation_one_approved_uq ON overhead_allocation_versions (organization_id) WHERE status = 'approved';
--> statement-breakpoint
CREATE UNIQUE INDEX overhead_allocation_one_proposal_uq ON overhead_allocation_versions (organization_id) WHERE status = 'proposed';
--> statement-breakpoint
CREATE TRIGGER overhead_allocation_no_truncate BEFORE TRUNCATE ON overhead_allocation_versions FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
-- Shared guard for the decision-only policy tables of this phase.
CREATE OR REPLACE FUNCTION fs_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'fs_history_immutable'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','decision_note']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','decision_note'])
       OR NOT ((OLD.status = 'proposed' AND NEW.status IN ('approved','rejected')) OR (OLD.status = 'approved' AND NEW.status = 'superseded')) THEN
      RAISE EXCEPTION 'fs_history_immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status <> 'proposed' THEN RAISE EXCEPTION 'invalid_policy'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER overhead_allocation_guard BEFORE INSERT OR UPDATE OR DELETE ON overhead_allocation_versions FOR EACH ROW EXECUTE FUNCTION fs_policy_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION overhead_allocation_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); o overhead_allocation_versions; oid uuid; v integer; k text; val text; total numeric := 0;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO o FROM overhead_allocation_versions WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', o.id, 'version', o.version, 'already', true); END IF;
  IF jsonb_typeof(p->'shares') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_overhead_policy'; END IF;
  FOR k, val IN SELECT e.key, e.value #>> '{}' FROM jsonb_each(p->'shares') e LOOP
    IF k NOT IN ('estates','architecture','painting','interiors','tech') OR coalesce(val, '') !~ '^(0(\.\d{1,4})?|1(\.0{1,4})?)$' THEN RAISE EXCEPTION 'invalid_overhead_policy'; END IF;
    total := total + val::numeric;
  END LOOP;
  IF total <> 1 THEN RAISE EXCEPTION 'overhead_shares_total'; END IF;
  IF coalesce(p->>'effectiveFrom', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_overhead_policy'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':fs_policy:overhead_policy', 0));
  IF EXISTS (SELECT 1 FROM overhead_allocation_versions WHERE organization_id = org AND status = 'proposed') THEN RAISE EXCEPTION 'fs_policy_pending'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v FROM overhead_allocation_versions WHERE organization_id = org;
  INSERT INTO overhead_allocation_versions (organization_id, version, shares, effective_from, note, proposed_by_id, idempotency_key)
  VALUES (org, v, p->'shares', (p->>'effectiveFrom')::date, trim(coalesce(p->>'note', '')), staff, key) RETURNING id INTO oid;
  PERFORM fs_event(org, 'overhead_policy', oid::text, actor, staff, 'proposed', p->>'note', jsonb_build_object('version', v, 'shares', p->'shares'), key, correlation);
  RETURN jsonb_build_object('id', oid, 'version', v, 'already', false);
EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'invalid_overhead_policy';
END $$;
--> statement-breakpoint
-- Division results. Lines without a division are shared costs; they are allocated only as a memo and
-- only under an approved policy effective for the whole period.
CREATE OR REPLACE FUNCTION fs_division_report(org text, s date, e date) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE d text; res jsonb := '[]'::jsonb; total jsonb := fs_income_statement(org, s, e); one jsonb; sum_net numeric := 0; sum_opx numeric := 0; sum_rev numeric := 0;
  shared_net numeric; shared_opx numeric; pol overhead_allocation_versions;
BEGIN
  SELECT * INTO pol FROM overhead_allocation_versions WHERE organization_id = org AND status = 'approved' AND effective_from <= s;
  FOREACH d IN ARRAY ARRAY['estates','architecture','painting','interiors','tech'] LOOP
    one := fs_income_statement(org, s, e, d);
    sum_net := sum_net + (one->>'netProfit')::numeric; sum_opx := sum_opx + (one->>'operatingExpenses')::numeric; sum_rev := sum_rev + (one->>'revenue')::numeric;
    res := res || jsonb_build_object('division', d, 'revenue', one->>'revenue', 'grossProfit', one->>'grossProfit', 'operatingExpenses', one->>'operatingExpenses',
      'netProfit', one->>'netProfit', 'allocatedOverhead', CASE WHEN pol.id IS NULL THEN NULL ELSE round(0, 2)::text END,
      'share', CASE WHEN pol.id IS NULL THEN NULL ELSE pol.shares->>d END);
  END LOOP;
  shared_net := (total->>'netProfit')::numeric - sum_net;
  shared_opx := (total->>'operatingExpenses')::numeric - sum_opx;
  IF pol.id IS NOT NULL THEN
    -- Memo allocation of shared operating expenses; rounding difference goes to the largest share.
    SELECT jsonb_agg(x || jsonb_build_object('allocatedOverhead', round(shared_opx * coalesce((pol.shares->>(x->>'division'))::numeric, 0), 2)::text,
        'netAfterAllocation', ((x->>'netProfit')::numeric + round(shared_opx * coalesce((pol.shares->>(x->>'division'))::numeric, 0), 2))::text))
      INTO res FROM jsonb_array_elements(res) x;
  END IF;
  RETURN jsonb_build_object('periodStart', s, 'periodEnd', e, 'divisions', res, 'unassignedRevenue', ((total->>'revenue')::numeric - sum_rev)::text,
    'sharedOperatingExpenses', shared_opx::text, 'sharedNet', shared_net::text, 'totalNetProfit', total->>'netProfit',
    'allocationPolicyVersion', pol.version, 'allocated', pol.id IS NOT NULL, 'provisional', (total->>'provisional')::boolean);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fs_project_report(org text, s date, e date) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE r record; res jsonb := '[]'::jsonb; one jsonb;
BEGIN
  FOR r IN SELECT DISTINCT p.id, p.name FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id AND j.status = 'posted'
    JOIN projects p ON p.organization_id = l.organization_id AND p.id = l.project_id WHERE l.organization_id = org AND j.entry_date BETWEEN s AND e ORDER BY p.name LOOP
    one := fs_income_statement(org, s, e, NULL, r.id);
    res := res || jsonb_build_object('projectId', r.id, 'name', r.name, 'revenue', one->>'revenue', 'costOfSales', one->>'costOfSales', 'grossProfit', one->>'grossProfit',
      'operatingExpenses', one->>'operatingExpenses', 'netProfit', one->>'netProfit');
  END LOOP;
  RETURN jsonb_build_object('periodStart', s, 'periodEnd', e, 'projects', res);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Statement sets: draft and approved snapshots. The payload is computed by the database from the
-- posted ledger (never supplied by a client), hashed, and tied to a ledger fingerprint.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE fs_statement_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  kind text NOT NULL CHECK (kind IN ('month','quarter','year','custom')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  comparative_start date,
  comparative_end date,
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  ledger_fingerprint text NOT NULL,
  classification_version_id uuid,
  provisional boolean NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected','superseded')),
  prepared_by_id uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, classification_version_id) REFERENCES fs_classification_versions(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (period_end >= period_start AND period_end - period_start <= 371),
  CHECK ((comparative_start IS NULL) = (comparative_end IS NULL)),
  CHECK (comparative_end IS NULL OR (comparative_end >= comparative_start AND comparative_end < period_start)),
  CHECK (decided_by_id IS NULL OR decided_by_id <> prepared_by_id),
  CHECK (status <> 'approved' OR NOT provisional)
);
--> statement-breakpoint
CREATE UNIQUE INDEX fs_statement_sets_one_approved_uq ON fs_statement_sets (organization_id, kind, period_start, period_end) WHERE status = 'approved';
--> statement-breakpoint
CREATE INDEX fs_statement_sets_period_idx ON fs_statement_sets (organization_id, period_end DESC);
--> statement-breakpoint
CREATE TRIGGER fs_statement_sets_no_truncate BEFORE TRUNCATE ON fs_statement_sets FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fs_statement_set_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'fs_history_immutable'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','decision_note']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','decision_note'])
       OR NOT ((OLD.status = 'draft' AND NEW.status IN ('approved','rejected')) OR (OLD.status = 'approved' AND NEW.status = 'superseded')) THEN
      RAISE EXCEPTION 'statement_set_immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status <> 'draft' OR NEW.payload_sha256 <> encode(sha256(convert_to(NEW.payload::text, 'UTF8')), 'hex') THEN RAISE EXCEPTION 'invalid_statement_set'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER fs_statement_sets_guard BEFORE INSERT OR UPDATE OR DELETE ON fs_statement_sets FOR EACH ROW EXECUTE FUNCTION fs_statement_set_guard();
--> statement-breakpoint
-- Everything a statement set contains, computed from the ledger as it is now.
CREATE OR REPLACE FUNCTION fs_statement_payload(org text, s date, e date, cs date, ce date) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE pnl jsonb := fs_income_statement(org, s, e); bs jsonb := fs_balance_sheet(org, e); cf jsonb := fs_cash_flow(org, s, e); eq jsonb := fs_equity_changes(org, s, e);
  tb jsonb := fs_trial_balance(org, s, e); open_periods integer; problems jsonb := '[]'::jsonb;
BEGIN
  SELECT count(*) INTO open_periods FROM accounting_periods WHERE organization_id = org AND start_date <= e AND end_date >= s AND status <> 'closed';
  IF (pnl->>'provisional')::boolean OR (bs->>'provisional')::boolean THEN problems := problems || '"unclassified_accounts"'::jsonb; END IF;
  IF NOT (bs->>'balanced')::boolean THEN problems := problems || '"balance_sheet_difference"'::jsonb; END IF;
  IF NOT (tb->>'balanced')::boolean THEN problems := problems || '"trial_balance_unbalanced"'::jsonb; END IF;
  IF NOT (cf->>'reconciles')::boolean THEN problems := problems || '"cash_flow_unreconciled"'::jsonb; END IF;
  IF (cf->>'provisional')::boolean THEN problems := problems || '"cash_flow_provisional"'::jsonb; END IF;
  IF NOT (eq->>'reconciles')::boolean THEN problems := problems || '"equity_unreconciled"'::jsonb; END IF;
  IF (tb->>'foreignCurrencyLines')::integer > 0 THEN problems := problems || '"foreign_currency_lines"'::jsonb; END IF;
  RETURN jsonb_build_object('periodStart', s, 'periodEnd', e, 'comparativeStart', cs, 'comparativeEnd', ce,
    'functionalCurrency', (accounting_policy(org)).functional_currency, 'accountingPolicyVersion', (accounting_policy(org)).version,
    'classificationVersion', (fs_classification_current(org)).version, 'generatedAt', now(),
    'incomeStatement', pnl, 'balanceSheet', bs, 'cashFlow', cf, 'equity', eq, 'trialBalance', tb,
    'comparative', CASE WHEN cs IS NULL THEN NULL ELSE jsonb_build_object('incomeStatement', fs_income_statement(org, cs, ce), 'balanceSheet', fs_balance_sheet(org, ce),
      'cashFlow', fs_cash_flow(org, cs, ce), 'equity', fs_equity_changes(org, cs, ce)) END,
    'openPeriods', open_periods, 'final', open_periods = 0, 'problems', problems);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fs_statement_set_create(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); x fs_statement_sets; sid uuid; s date; e date; cs date; ce date; payload jsonb; kind text := p->>'kind';
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO x FROM fs_statement_sets WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', x.id, 'already', true); END IF;
  IF (accounting_policy(org)).id IS NULL THEN RAISE EXCEPTION 'accounting_policy_required'; END IF;
  IF kind IS NULL OR kind NOT IN ('month','quarter','year','custom') OR coalesce(p->>'periodStart', '') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(p->>'periodEnd', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid_statement_set';
  END IF;
  s := (p->>'periodStart')::date; e := (p->>'periodEnd')::date;
  IF nullif(p->>'comparativeStart', '') IS NOT NULL THEN
    IF p->>'comparativeStart' !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(p->>'comparativeEnd', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_statement_set'; END IF;
    cs := (p->>'comparativeStart')::date; ce := (p->>'comparativeEnd')::date;
  END IF;
  IF e < s OR e - s > 371 OR (cs IS NOT NULL AND (ce < cs OR ce >= s)) THEN RAISE EXCEPTION 'invalid_statement_set'; END IF;
  payload := fs_statement_payload(org, s, e, cs, ce);
  INSERT INTO fs_statement_sets (organization_id, kind, period_start, period_end, comparative_start, comparative_end, payload, payload_sha256, ledger_fingerprint,
    classification_version_id, provisional, prepared_by_id, idempotency_key)
  VALUES (org, kind, s, e, cs, ce, payload, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'), fs_ledger_fingerprint(org, e),
    (fs_classification_current(org)).id, jsonb_array_length(payload->'problems') > 0, staff, key) RETURNING id INTO sid;
  PERFORM fs_event(org, 'statement_set', sid::text, actor, staff, 'prepared', NULL,
    jsonb_build_object('kind', kind, 'periodStart', s, 'periodEnd', e, 'problems', payload->'problems', 'netProfit', payload->'incomeStatement'->>'netProfit'), key, correlation);
  RETURN jsonb_build_object('id', sid, 'problems', payload->'problems', 'already', false);
EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'invalid_statement_set';
END $$;
--> statement-breakpoint
-- Approval: by someone other than the preparer, only if nothing is provisional or unreconciled and the
-- posted ledger is exactly what the snapshot was computed from.
CREATE OR REPLACE FUNCTION fs_statement_set_decide(org text, actor text, sid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); x fs_statement_sets; clean text := nullif(trim(coalesce(note, '')), '');
BEGIN
  IF decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':fs_statement_sets', 0));
  IF fs_replay(org, key, 'statement_set', sid::text, decision) THEN RETURN jsonb_build_object('id', sid, 'already', true); END IF;
  SELECT * INTO x FROM fs_statement_sets WHERE organization_id = org AND id = sid FOR UPDATE;
  IF NOT FOUND OR x.status <> 'draft' THEN RAISE EXCEPTION 'statement_set_unavailable'; END IF;
  IF x.prepared_by_id = staff THEN RAISE EXCEPTION 'fs_self_approval_denied'; END IF;
  IF decision = 'reject' THEN
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
    UPDATE fs_statement_sets SET status = 'rejected', decided_by_id = staff, decided_at = now(), decision_note = clean WHERE organization_id = org AND id = sid;
  ELSE
    IF x.provisional THEN RAISE EXCEPTION 'statements_provisional'; END IF;
    -- Postings take a share lock on their period: holding these rows waits out any posting in flight
    -- and blocks new ones until the approval commits, so the fingerprint cannot change underneath it.
    PERFORM 1 FROM accounting_periods WHERE organization_id = org AND start_date <= x.period_end ORDER BY start_date FOR UPDATE;
    IF x.ledger_fingerprint <> fs_ledger_fingerprint(org, x.period_end) THEN RAISE EXCEPTION 'statements_stale'; END IF;
    IF x.classification_version_id IS DISTINCT FROM (fs_classification_current(org)).id THEN RAISE EXCEPTION 'statements_stale'; END IF;
    UPDATE fs_statement_sets SET status = 'superseded' WHERE organization_id = org AND kind = x.kind AND period_start = x.period_start AND period_end = x.period_end AND status = 'approved';
    UPDATE fs_statement_sets SET status = 'approved', decided_by_id = staff, decided_at = now(), decision_note = clean WHERE organization_id = org AND id = sid;
  END IF;
  PERFORM fs_event(org, 'statement_set', sid::text, actor, staff, decision, clean, jsonb_build_object('sha256', x.payload_sha256), key, correlation);
  RETURN jsonb_build_object('id', sid, 'status', CASE WHEN decision = 'approve' THEN 'approved' ELSE 'rejected' END, 'already', false);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Adjusting and reversing entries. Each adjustment is an ordinary manual journal (2A engine: balance,
-- open period, separation of duties) plus a reason, evidence and optional automatic reversal date.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE adjustment_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  journal_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('accrual','prepayment','deferral','provision','depreciation','reclassification','correction','prior_period','other')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 2000),
  evidence_reference text NOT NULL CHECK (length(trim(evidence_reference)) BETWEEN 3 AND 300),
  auto_reverse_on date,
  replaces_journal_id uuid,
  prior_period boolean NOT NULL DEFAULT false,
  reversal_journal_id uuid,
  prepared_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, journal_id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, journal_id) REFERENCES accounting_journals(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, replaces_journal_id) REFERENCES accounting_journals(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, reversal_journal_id) REFERENCES accounting_journals(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (prior_period = (kind = 'prior_period')),
  CHECK (auto_reverse_on IS NULL OR kind IN ('accrual','prepayment','deferral','provision','other'))
);
--> statement-breakpoint
CREATE TRIGGER adjustment_entries_no_truncate BEFORE TRUNCATE ON adjustment_entries FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION adjustment_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'fs_history_immutable'; END IF;
  IF TG_OP = 'UPDATE' AND ((to_jsonb(NEW) - 'reversal_journal_id') IS DISTINCT FROM (to_jsonb(OLD) - 'reversal_journal_id') OR OLD.reversal_journal_id IS NOT NULL) THEN
    RAISE EXCEPTION 'fs_history_immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER adjustment_entries_guard BEFORE UPDATE OR DELETE ON adjustment_entries FOR EACH ROW EXECUTE FUNCTION adjustment_entry_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fs_adjustment_create(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); x adjustment_entries; j jsonb; aid uuid; kind text := p->>'kind'; ed date; rev date; repl uuid;
  re uuid := (fs_classification_current(org)).retained_earnings_account_id;
BEGIN
  IF key IS NULL OR length(key) > 180 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO x FROM adjustment_entries WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', x.id, 'journalId', x.journal_id, 'already', true); END IF;
  IF kind IS NULL OR kind NOT IN ('accrual','prepayment','deferral','provision','depreciation','reclassification','correction','prior_period','other') THEN RAISE EXCEPTION 'invalid_adjustment'; END IF;
  IF length(trim(coalesce(p->>'reason', ''))) < 10 THEN RAISE EXCEPTION 'adjustment_reason_required'; END IF;
  IF length(trim(coalesce(p->>'evidenceReference', ''))) < 3 THEN RAISE EXCEPTION 'adjustment_evidence_required'; END IF;
  IF coalesce(p->>'entryDate', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_entry_date'; END IF;
  ed := (p->>'entryDate')::date;
  IF nullif(p->>'autoReverseOn', '') IS NOT NULL THEN
    IF p->>'autoReverseOn' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_adjustment'; END IF;
    rev := (p->>'autoReverseOn')::date;
    IF rev <= ed THEN RAISE EXCEPTION 'auto_reverse_date_invalid'; END IF;
  END IF;
  IF nullif(p->>'replacesJournalId', '') IS NOT NULL THEN
    IF NOT accounting_is_uuid(p->>'replacesJournalId') THEN RAISE EXCEPTION 'journal_unavailable'; END IF;
    SELECT id INTO repl FROM accounting_journals WHERE organization_id = org AND id = (p->>'replacesJournalId')::uuid AND status = 'posted';
    IF repl IS NULL THEN RAISE EXCEPTION 'journal_unavailable'; END IF;
  END IF;
  IF kind = 'prior_period' AND (re IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) l WHERE l->>'accountId' = re::text)) THEN
    RAISE EXCEPTION 'prior_period_requires_retained_earnings';
  END IF;
  j := accounting_journal_save(org, actor, jsonb_build_object('key', 'adj:' || key, 'entryDate', ed, 'description', p->>'description', 'reference', p->>'reference', 'lines', p->'lines'), correlation);
  INSERT INTO adjustment_entries (organization_id, journal_id, kind, reason, evidence_reference, auto_reverse_on, replaces_journal_id, prior_period, prepared_by_id, idempotency_key)
  VALUES (org, (j->>'id')::uuid, kind, trim(p->>'reason'), trim(p->>'evidenceReference'), rev, repl, kind = 'prior_period', staff, key) RETURNING id INTO aid;
  -- Submitted for review straight away; a returned adjustment is edited as a draft journal.
  PERFORM accounting_journal_command(org, actor, (j->>'id')::uuid, 'submit', 1, 'Adjustment submitted for review', 'adj:' || key || ':submit', correlation);
  PERFORM fs_event(org, 'adjustment', aid::text, actor, staff, 'prepared', p->>'reason',
    jsonb_build_object('kind', kind, 'journalId', j->>'id', 'evidence', trim(p->>'evidenceReference'), 'autoReverseOn', rev, 'replaces', repl), key, correlation);
  RETURN jsonb_build_object('id', aid, 'journalId', j->>'id', 'already', false);
END $$;
--> statement-breakpoint
-- Review of an adjustment's journal; SoD and posting rules are the 2A engine's.
CREATE OR REPLACE FUNCTION fs_adjustment_command(org text, actor text, aid uuid, cmd text, expected integer, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE x adjustment_entries; r jsonb;
BEGIN
  IF cmd NOT IN ('approve','return','reject','post','submit','withdraw','discard') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO x FROM adjustment_entries WHERE organization_id = org AND id = aid;
  IF NOT FOUND THEN RAISE EXCEPTION 'adjustment_unavailable'; END IF;
  r := accounting_journal_command(org, actor, x.journal_id, cmd, expected, note, key, correlation);
  IF NOT (r->>'already')::boolean THEN
    PERFORM fs_event(org, 'adjustment', aid::text, actor, finance_staff(org, actor), cmd, note, jsonb_build_object('journalStatus', r->>'status', 'number', r->>'number'), NULL, correlation);
  END IF;
  RETURN r || jsonb_build_object('adjustmentId', aid);
END $$;
--> statement-breakpoint
-- Posts the automatic reversal of a posted adjustment on its reversal date (2A reversal engine).
CREATE OR REPLACE FUNCTION fs_adjustment_reverse(org text, actor text, aid uuid, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); x adjustment_entries; r jsonb;
BEGIN
  SELECT * INTO x FROM adjustment_entries WHERE organization_id = org AND id = aid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'adjustment_unavailable'; END IF;
  IF fs_replay(org, key, 'adjustment', aid::text, 'reversed') THEN RETURN jsonb_build_object('id', aid, 'journalId', x.reversal_journal_id, 'already', true); END IF;
  IF x.auto_reverse_on IS NULL THEN RAISE EXCEPTION 'adjustment_not_reversing'; END IF;
  IF x.reversal_journal_id IS NOT NULL THEN RAISE EXCEPTION 'journal_already_reversed'; END IF;
  IF x.auto_reverse_on > finance_kampala_today() THEN RAISE EXCEPTION 'auto_reverse_not_due'; END IF;
  r := accounting_journal_reverse(org, actor, x.journal_id, jsonb_build_object('key', 'adj:' || key || ':reverse', 'entryDate', x.auto_reverse_on,
    'reason', left('Scheduled reversal of adjustment: ' || x.reason, 300)), correlation);
  UPDATE adjustment_entries SET reversal_journal_id = (r->>'id')::uuid WHERE organization_id = org AND id = aid;
  PERFORM fs_event(org, 'adjustment', aid::text, actor, staff, 'reversed', NULL, jsonb_build_object('reversalId', r->>'id', 'number', r->>'number', 'entryDate', x.auto_reverse_on), key, correlation);
  RETURN jsonb_build_object('id', aid, 'journalId', r->>'id', 'number', r->>'number', 'already', false);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Period-close policy. Once a policy has ever been approved for an organization, accounting
-- periods can only be closed or reopened through the controlled close and year-end workflows.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE period_close_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  version integer NOT NULL CHECK (version > 0),
  require_bank_reconciliation boolean NOT NULL DEFAULT true,
  require_cash_count boolean NOT NULL DEFAULT true,
  clearing_tolerance numeric(17,2) NOT NULL DEFAULT 0 CHECK (clearing_tolerance >= 0 AND clearing_tolerance <= 1000000),
  -- Evidence the close preparer must record, e.g. ["Bank statements", "Payroll summary"].
  evidence_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','superseded')),
  proposed_by_id uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, version),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, proposed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'proposed') = (decided_by_id IS NULL)),
  CHECK (decided_by_id IS NULL OR decided_by_id <> proposed_by_id),
  CHECK (jsonb_typeof(evidence_items) = 'array' AND jsonb_array_length(evidence_items) <= 20)
);
--> statement-breakpoint
CREATE UNIQUE INDEX period_close_policy_one_approved_uq ON period_close_policy_versions (organization_id) WHERE status = 'approved';
--> statement-breakpoint
CREATE UNIQUE INDEX period_close_policy_one_proposal_uq ON period_close_policy_versions (organization_id) WHERE status = 'proposed';
--> statement-breakpoint
CREATE TRIGGER period_close_policy_no_truncate BEFORE TRUNCATE ON period_close_policy_versions FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER period_close_policy_guard BEFORE INSERT OR UPDATE OR DELETE ON period_close_policy_versions FOR EACH ROW EXECUTE FUNCTION fs_policy_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION period_close_policy_propose(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); o period_close_policy_versions; oid uuid; v integer; items jsonb := coalesce(p->'evidenceItems', '[]'::jsonb);
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO o FROM period_close_policy_versions WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', o.id, 'version', o.version, 'already', true); END IF;
  IF jsonb_typeof(items) <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(items) i WHERE jsonb_typeof(i) <> 'string' OR length(trim(i #>> '{}')) NOT BETWEEN 3 AND 120)
     OR (SELECT count(DISTINCT lower(trim(i #>> '{}'))) FROM jsonb_array_elements(items) i) <> jsonb_array_length(items) THEN
    RAISE EXCEPTION 'invalid_close_policy';
  END IF;
  IF coalesce(p->>'clearingTolerance', '0') !~ '^\d{1,7}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'invalid_close_policy'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':fs_policy:close_policy', 0));
  IF EXISTS (SELECT 1 FROM period_close_policy_versions WHERE organization_id = org AND status = 'proposed') THEN RAISE EXCEPTION 'fs_policy_pending'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v FROM period_close_policy_versions WHERE organization_id = org;
  INSERT INTO period_close_policy_versions (organization_id, version, require_bank_reconciliation, require_cash_count, clearing_tolerance, evidence_items, note, proposed_by_id, idempotency_key)
  VALUES (org, v, coalesce((p->>'requireBankReconciliation')::boolean, true), coalesce((p->>'requireCashCount')::boolean, true), coalesce(p->>'clearingTolerance', '0')::numeric,
    (SELECT coalesce(jsonb_agg(to_jsonb(trim(i #>> '{}'))), '[]'::jsonb) FROM jsonb_array_elements(items) i), trim(coalesce(p->>'note', '')), staff, key) RETURNING id INTO oid;
  PERFORM fs_event(org, 'close_policy', oid::text, actor, staff, 'proposed', p->>'note', jsonb_build_object('version', v), key, correlation);
  RETURN jsonb_build_object('id', oid, 'version', v, 'already', false);
EXCEPTION WHEN check_violation OR invalid_text_representation THEN RAISE EXCEPTION 'invalid_close_policy';
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fs_close_controlled(org text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM period_close_policy_versions WHERE organization_id = org AND status IN ('approved','superseded'));
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fs_period_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND fs_close_controlled(NEW.organization_id)
     AND coalesce(current_setting('calacot.period_control', true), '') <> 'on' THEN
    RAISE EXCEPTION 'period_close_controlled';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounting_periods_close_control BEFORE UPDATE ON accounting_periods FOR EACH ROW EXECUTE FUNCTION fs_period_control();
--> statement-breakpoint
-- The only way a controlled period changes status. Never called directly by the application.
CREATE OR REPLACE FUNCTION fs_set_period_status(org text, actor text, staff uuid, per accounting_periods, target text, note text, correlation text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('calacot.period_control', 'on', true);
  IF target = 'closed' THEN
    UPDATE accounting_periods SET status = 'closed', closed_by_id = staff, closed_at = now(), close_note = note, version = version + 1 WHERE organization_id = org AND id = per.id;
  ELSE
    UPDATE accounting_periods SET status = 'open', reopened_by_id = staff, reopened_at = now(), reopen_reason = note, version = version + 1 WHERE organization_id = org AND id = per.id;
  END IF;
  PERFORM set_config('calacot.period_control', 'off', true);
  PERFORM accounting_event(org, 'period', per.id::text, actor, staff, CASE WHEN target = 'closed' THEN 'close' ELSE 'reopen' END, per.status, target, per.version + 1, note,
    jsonb_build_object('name', per.name, 'controlled', true), NULL, correlation);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Period close workflow: start -> (evidence, exceptions) -> submit -> approve (closes the period)
-- -> optional authorized reopen. One live close per period.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE period_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  period_id uuid NOT NULL,
  policy_version_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','closed','reopened','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  prepared_by_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  -- Optional review assignment: when set, only this person can approve the close.
  assigned_reviewer_id uuid,
  submitted_by_id uuid,
  submitted_at timestamptz,
  submit_checks jsonb,
  approved_by_id uuid,
  approved_at timestamptz,
  approval_checks jsonb,
  note text,
  reopened_by_id uuid,
  reopened_at timestamptz,
  reopen_reason text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, period_id) REFERENCES accounting_periods(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, policy_version_id) REFERENCES period_close_policy_versions(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, submitted_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, approved_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, reopened_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, assigned_reviewer_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (assigned_reviewer_id IS NULL OR assigned_reviewer_id <> prepared_by_id),
  CHECK (approved_by_id IS NULL OR (approved_by_id <> prepared_by_id AND approved_by_id IS DISTINCT FROM submitted_by_id)),
  CHECK (status NOT IN ('closed','reopened') OR approved_by_id IS NOT NULL),
  CHECK (status <> 'reopened' OR (reopened_by_id IS NOT NULL AND length(reopen_reason) >= 10))
);
--> statement-breakpoint
CREATE UNIQUE INDEX period_closes_live_uq ON period_closes (organization_id, period_id) WHERE status IN ('in_progress','submitted','closed');
--> statement-breakpoint
CREATE TRIGGER period_closes_no_truncate BEFORE TRUNCATE ON period_closes FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION period_close_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'fs_history_immutable'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'in_progress' OR NEW.submitted_by_id IS NOT NULL OR NEW.approved_by_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_close_transition'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.period_id, NEW.policy_version_id, NEW.prepared_by_id, NEW.started_at, NEW.idempotency_key)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.period_id, OLD.policy_version_id, OLD.prepared_by_id, OLD.started_at, OLD.idempotency_key)
     OR OLD.status IN ('reopened','cancelled')
     OR NOT ((OLD.status = NEW.status AND OLD.status IN ('in_progress','submitted')
         AND (to_jsonb(NEW) - ARRAY['assigned_reviewer_id','version']) = (to_jsonb(OLD) - ARRAY['assigned_reviewer_id','version']))
       OR (OLD.status = 'in_progress' AND NEW.status IN ('submitted','cancelled')) OR (OLD.status = 'submitted' AND NEW.status IN ('in_progress','closed'))
       OR (OLD.status = 'closed' AND NEW.status = 'reopened')) THEN
    RAISE EXCEPTION 'invalid_close_transition';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER period_closes_guard BEFORE INSERT OR UPDATE OR DELETE ON period_closes FOR EACH ROW EXECUTE FUNCTION period_close_guard();
--> statement-breakpoint
CREATE TABLE period_close_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  close_id uuid NOT NULL,
  item text NOT NULL CHECK (length(trim(item)) BETWEEN 3 AND 120),
  reference text NOT NULL CHECK (length(trim(reference)) BETWEEN 3 AND 300),
  note text CHECK (note IS NULL OR length(note) <= 2000),
  added_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, close_id) REFERENCES period_closes(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, added_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TRIGGER period_close_evidence_immutable BEFORE UPDATE OR DELETE ON period_close_evidence FOR EACH ROW EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TRIGGER period_close_evidence_no_truncate BEFORE TRUNCATE ON period_close_evidence FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE TABLE period_close_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  close_id uuid NOT NULL,
  check_key text NOT NULL CHECK (check_key IN ('draft_journals','integration_events','receivables_payables','bank_reconciliation','cash_counts','depreciation',
    'pending_source_journals','tax_provision','clearing_accounts','classification','foreign_currency','evidence')),
  explanation text NOT NULL CHECK (length(trim(explanation)) BETWEEN 20 AND 2000),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
  proposed_by_id uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, close_id) REFERENCES period_closes(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, proposed_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'proposed') = (decided_by_id IS NULL)),
  CHECK (decided_by_id IS NULL OR decided_by_id <> proposed_by_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX period_close_exceptions_live_uq ON period_close_exceptions (organization_id, close_id, check_key) WHERE status IN ('proposed','approved');
--> statement-breakpoint
CREATE TRIGGER period_close_exceptions_no_truncate BEFORE TRUNCATE ON period_close_exceptions FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION period_close_exception_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'fs_history_immutable'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'proposed' THEN RAISE EXCEPTION 'invalid_close_exception'; END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','decision_note']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','decision_note'])
     OR OLD.status <> 'proposed' OR NEW.status NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'fs_history_immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER period_close_exceptions_guard BEFORE INSERT OR UPDATE OR DELETE ON period_close_exceptions FOR EACH ROW EXECUTE FUNCTION period_close_exception_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fs_check(k text, label text, ok boolean, n numeric, detail jsonb, exceptable boolean DEFAULT true) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('key', k, 'label', label, 'status', CASE WHEN ok IS NULL THEN 'not_applicable' WHEN ok THEN 'pass' ELSE 'fail' END,
    'count', n, 'detail', coalesce(detail, '[]'::jsonb), 'exceptable', exceptable);
$$;
--> statement-breakpoint
-- Month-end checklist for a period, computed live. Failed checks block the close unless an
-- exception for that check has been approved by a second person (some checks cannot be excepted).
CREATE OR REPLACE FUNCTION period_close_checks(org text, pid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE per accounting_periods; pol period_close_policy_versions; cls fs_classification_versions := fs_classification_current(org); acct accounting_policy_versions := accounting_policy(org);
  cid uuid; res jsonb := '[]'::jsonb; n integer; d jsonb; amt numeric; tb jsonb; x jsonb; final jsonb := '[]'::jsonb; ready boolean := true;
BEGIN
  SELECT * INTO per FROM accounting_periods WHERE organization_id = org AND id = pid;
  IF NOT FOUND THEN RAISE EXCEPTION 'period_unavailable'; END IF;
  SELECT * INTO pol FROM period_close_policy_versions WHERE organization_id = org AND status = 'approved';
  SELECT id INTO cid FROM period_closes WHERE organization_id = org AND period_id = pid AND status IN ('in_progress','submitted','closed');

  SELECT count(*), coalesce(jsonb_agg(name ORDER BY start_date), '[]'::jsonb) INTO n, d FROM accounting_periods
    WHERE organization_id = org AND fiscal_year = per.fiscal_year AND end_date < per.start_date AND status <> 'closed';
  res := res || fs_check('prior_periods', 'Earlier periods of the financial year are closed', n = 0, n, d, false);

  SELECT count(*), coalesce(jsonb_agg(coalesce(number, description) ORDER BY entry_date), '[]'::jsonb) INTO n, d FROM accounting_journals
    WHERE organization_id = org AND status IN ('submitted','approved') AND entry_date BETWEEN per.start_date AND per.end_date;
  res := res || fs_check('pending_journals', 'No journals awaiting approval or posting', n = 0, n, d, false);

  SELECT count(*), coalesce(jsonb_agg(left(description, 80) ORDER BY entry_date), '[]'::jsonb) INTO n, d FROM accounting_journals
    WHERE organization_id = org AND status = 'draft' AND entry_date BETWEEN per.start_date AND per.end_date;
  res := res || fs_check('draft_journals', 'No draft journals dated in the period', n = 0, n, d);

  SELECT count(*), coalesce(jsonb_agg(DISTINCT event_type), '[]'::jsonb) INTO n, d FROM accounting_integration_events
    WHERE organization_id = org AND effective_date <= per.end_date AND status IN ('pending','blocked','failed');
  res := res || fs_check('integration_events', 'Source transactions are all processed (no pending, blocked or failed events)', n = 0, n, d);

  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('check', r.check_key, 'currency', r.currency, 'difference', r.difference::text)), '[]'::jsonb) INTO n, d
    FROM accounting_integration_reconciliation(org, per.end_date, 'ledger') r WHERE r.status = 'unexplained';
  res := res || fs_check('receivables_payables', 'Receivables, payables and receipts reconcile to their control accounts', n = 0, n, d);

  IF coalesce(pol.require_bank_reconciliation, true) THEN
    SELECT count(*), coalesce(jsonb_agg(b.label), '[]'::jsonb) INTO n, d FROM banking_accounts b
      WHERE b.organization_id = org AND b.status = 'active' AND b.kind IN ('bank','mobile_money') AND coalesce(banking_locked_until(org, b.id), '1900-01-01'::date) < per.end_date;
    res := res || fs_check('bank_reconciliation', 'Bank and mobile-money reconciliations are finalized to the period end', n = 0, n, d);
  ELSE
    res := res || fs_check('bank_reconciliation', 'Bank and mobile-money reconciliations (not required by policy)', NULL, 0, NULL);
  END IF;

  IF coalesce(pol.require_cash_count, true) THEN
    SELECT count(*), coalesce(jsonb_agg(b.label), '[]'::jsonb) INTO n, d FROM banking_accounts b
      WHERE b.organization_id = org AND b.status = 'active' AND b.kind IN ('cash','petty_cash')
        AND NOT EXISTS (SELECT 1 FROM cash_counts c WHERE c.organization_id = org AND c.banking_account_id = b.id AND c.count_date BETWEEN per.start_date AND per.end_date);
    res := res || fs_check('cash_counts', 'Cash and petty cash counted in the period', n = 0, n, d);
  ELSE
    res := res || fs_check('cash_counts', 'Cash counts (not required by policy)', NULL, 0, NULL);
  END IF;

  SELECT count(*), coalesce(sum(amount), 0), coalesce(jsonb_agg(asset_number), '[]'::jsonb) INTO n, amt, d FROM asset_depreciation_preview(org, pid) WHERE amount > 0;
  res := res || fs_check('depreciation', 'Depreciation is posted for the period', n = 0, amt, d);

  SELECT count(*), coalesce(jsonb_agg(l.purpose), '[]'::jsonb) INTO n, d FROM ledger_source_links l
    JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id
    WHERE l.organization_id = org AND j.status IN ('draft','submitted','approved') AND j.entry_date <= per.end_date;
  res := res || fs_check('pending_source_journals', 'No tax or asset journals are waiting for approval', n = 0, n, d);

  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('code', b.code, 'balance', b.closing::text)), '[]'::jsonb) INTO n, d
    FROM fs_account_balances(org, per.end_date, per.end_date) b
    WHERE coalesce((cls.mappings->b.account_id::text->>'clearing')::boolean, false) AND abs(b.closing) > coalesce(pol.clearing_tolerance, 0);
  res := res || fs_check('clearing_accounts', 'Clearing and suspense accounts are cleared', CASE WHEN cls.id IS NULL THEN false ELSE n = 0 END, n, d);

  IF per.end_date = (SELECT max(end_date) FROM accounting_periods WHERE organization_id = org AND fiscal_year = per.fiscal_year) THEN
    SELECT count(*) INTO n FROM income_tax_computations t WHERE t.organization_id = org AND t.fiscal_year = per.fiscal_year AND t.status = 'approved';
    res := res || fs_check('tax_provision', 'Income-tax computation for the year is approved (tax provision reviewed)', n > 0, n,
      CASE WHEN EXISTS (SELECT 1 FROM tax_obligation_versions o WHERE o.organization_id = org AND o.status = 'approved' AND o.tax_type = 'corporate_income_tax' AND o.processing_enabled)
        THEN '[]'::jsonb ELSE '["No operational income-tax obligation is configured"]'::jsonb END);
  END IF;

  tb := fs_trial_balance(org, per.start_date, per.end_date);
  res := res || fs_check('trial_balance', 'Trial balance agrees (debits equal credits)', (tb->>'balanced')::boolean, 0, NULL, false);

  SELECT count(*), coalesce(jsonb_agg(b.code), '[]'::jsonb) INTO n, d FROM fs_account_balances(org, per.end_date, per.end_date) b
    WHERE cls.id IS NULL OR NOT (cls.mappings ? b.account_id::text);
  res := res || fs_check('classification', 'Every account with activity is classified for the statements', cls.id IS NOT NULL AND n = 0, n, d);

  SELECT count(*) INTO n FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id = l.organization_id AND j.id = l.journal_id AND j.status = 'posted'
    WHERE l.organization_id = org AND j.entry_date BETWEEN per.start_date AND per.end_date AND l.currency <> acct.functional_currency;
  res := res || fs_check('foreign_currency', 'No foreign-currency postings without an approved policy', n = 0, n, NULL);

  SELECT count(*), coalesce(jsonb_agg(i #>> '{}'), '[]'::jsonb) INTO n, d FROM jsonb_array_elements(coalesce(pol.evidence_items, '[]'::jsonb)) i
    WHERE cid IS NULL OR NOT EXISTS (SELECT 1 FROM period_close_evidence e WHERE e.organization_id = org AND e.close_id = cid AND lower(e.item) = lower(i #>> '{}'));
  res := res || fs_check('evidence', 'Required close evidence is recorded', n = 0, n, d);

  -- Approved exceptions turn a failed (exceptable) check into "excepted".
  FOR x IN SELECT value FROM jsonb_array_elements(res) LOOP
    IF x->>'status' = 'fail' AND (x->>'exceptable')::boolean AND cid IS NOT NULL
       AND EXISTS (SELECT 1 FROM period_close_exceptions e WHERE e.organization_id = org AND e.close_id = cid AND e.check_key = x->>'key' AND e.status = 'approved') THEN
      x := jsonb_set(x, '{status}', '"excepted"');
    END IF;
    IF x->>'status' = 'fail' THEN ready := false; END IF;
    final := final || x;
  END LOOP;
  RETURN jsonb_build_object('periodId', pid, 'closeId', cid, 'policyVersion', pol.version, 'checks', final, 'ready', ready);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION period_close_start(org text, actor text, pid uuid, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); per accounting_periods; pol period_close_policy_versions; c period_closes; cid uuid;
BEGIN
  IF key IS NULL OR length(key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO c FROM period_closes WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF c.period_id <> pid THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', c.id, 'already', true);
  END IF;
  SELECT * INTO pol FROM period_close_policy_versions WHERE organization_id = org AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'close_policy_required'; END IF;
  SELECT * INTO per FROM accounting_periods WHERE organization_id = org AND id = pid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'period_unavailable'; END IF;
  IF per.status <> 'open' THEN RAISE EXCEPTION 'period_closed'; END IF;
  IF EXISTS (SELECT 1 FROM period_closes WHERE organization_id = org AND period_id = pid AND status IN ('in_progress','submitted','closed')) THEN RAISE EXCEPTION 'period_close_exists'; END IF;
  INSERT INTO period_closes (organization_id, period_id, policy_version_id, prepared_by_id, idempotency_key) VALUES (org, pid, pol.id, staff, key) RETURNING id INTO cid;
  PERFORM fs_event(org, 'period_close', cid::text, actor, staff, 'started', NULL, jsonb_build_object('period', per.name, 'policyVersion', pol.version), key, correlation);
  RETURN jsonb_build_object('id', cid, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION period_close_evidence_add(org text, actor text, cid uuid, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); c period_closes; ev period_close_evidence; eid uuid;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO ev FROM period_close_evidence WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', ev.id, 'already', true); END IF;
  SELECT * INTO c FROM period_closes WHERE organization_id = org AND id = cid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'period_close_unavailable'; END IF;
  IF c.status <> 'in_progress' THEN RAISE EXCEPTION 'invalid_close_transition'; END IF;
  IF length(trim(coalesce(p->>'item', ''))) NOT BETWEEN 3 AND 120 OR length(trim(coalesce(p->>'reference', ''))) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'invalid_close_evidence'; END IF;
  INSERT INTO period_close_evidence (organization_id, close_id, item, reference, note, added_by_id, idempotency_key)
  VALUES (org, cid, trim(p->>'item'), trim(p->>'reference'), nullif(trim(coalesce(p->>'note', '')), ''), staff, key) RETURNING id INTO eid;
  PERFORM fs_event(org, 'period_close', cid::text, actor, staff, 'evidence_added', p->>'note', jsonb_build_object('item', trim(p->>'item'), 'reference', trim(p->>'reference')), key, correlation);
  RETURN jsonb_build_object('id', eid, 'already', false);
EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'invalid_close_evidence';
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION period_close_exception_raise(org text, actor text, cid uuid, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); c period_closes; e period_close_exceptions; xid uuid;
BEGIN
  IF key IS NULL OR length(key) > 200 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO e FROM period_close_exceptions WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN RETURN jsonb_build_object('id', e.id, 'already', true); END IF;
  SELECT * INTO c FROM period_closes WHERE organization_id = org AND id = cid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'period_close_unavailable'; END IF;
  IF c.status <> 'in_progress' THEN RAISE EXCEPTION 'invalid_close_transition'; END IF;
  IF length(trim(coalesce(p->>'explanation', ''))) < 20 THEN RAISE EXCEPTION 'exception_explanation_required'; END IF;
  IF EXISTS (SELECT 1 FROM period_close_exceptions WHERE organization_id = org AND close_id = cid AND check_key = p->>'checkKey' AND status IN ('proposed','approved')) THEN
    RAISE EXCEPTION 'close_exception_exists';
  END IF;
  INSERT INTO period_close_exceptions (organization_id, close_id, check_key, explanation, proposed_by_id, idempotency_key)
  VALUES (org, cid, p->>'checkKey', trim(p->>'explanation'), staff, key) RETURNING id INTO xid;
  PERFORM fs_event(org, 'close_exception', xid::text, actor, staff, 'raised', p->>'explanation', jsonb_build_object('closeId', cid, 'check', p->>'checkKey'), key, correlation);
  RETURN jsonb_build_object('id', xid, 'already', false);
EXCEPTION WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'invalid_close_exception';
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION period_close_exception_decide(org text, actor text, xid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); e period_close_exceptions; clean text := nullif(trim(coalesce(note, '')), ''); c period_closes;
BEGIN
  IF decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO e FROM period_close_exceptions WHERE organization_id = org AND id = xid;
  IF NOT FOUND THEN RAISE EXCEPTION 'close_exception_unavailable'; END IF;
  SELECT * INTO c FROM period_closes WHERE organization_id = org AND id = e.close_id FOR UPDATE;
  IF fs_replay(org, key, 'close_exception', xid::text, decision) THEN RETURN jsonb_build_object('id', xid, 'already', true); END IF;
  SELECT * INTO e FROM period_close_exceptions WHERE organization_id = org AND id = xid FOR UPDATE;
  IF e.status <> 'proposed' OR c.status NOT IN ('in_progress','submitted') THEN RAISE EXCEPTION 'close_exception_unavailable'; END IF;
  IF e.proposed_by_id = staff THEN RAISE EXCEPTION 'fs_self_approval_denied'; END IF;
  IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
  UPDATE period_close_exceptions SET status = CASE WHEN decision = 'approve' THEN 'approved' ELSE 'rejected' END, decided_by_id = staff, decided_at = now(), decision_note = clean
    WHERE organization_id = org AND id = xid;
  PERFORM fs_event(org, 'close_exception', xid::text, actor, staff, decision, clean, jsonb_build_object('closeId', e.close_id, 'check', e.check_key), key, correlation);
  RETURN jsonb_build_object('id', xid, 'status', CASE WHEN decision = 'approve' THEN 'approved' ELSE 'rejected' END, 'already', false);
END $$;
--> statement-breakpoint
-- Approval of a submitted close: closes the period in the same transaction. Internal; also used by
-- year-end approval for the final period.
CREATE OR REPLACE FUNCTION fs_period_close_finalize(org text, actor text, staff uuid, c period_closes, close_note text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE per accounting_periods; chk jsonb;
BEGIN
  IF c.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_close_transition'; END IF;
  IF c.prepared_by_id = staff OR c.submitted_by_id = staff THEN RAISE EXCEPTION 'fs_self_approval_denied'; END IF;
  IF c.assigned_reviewer_id IS NOT NULL AND c.assigned_reviewer_id <> staff THEN RAISE EXCEPTION 'close_reviewer_assigned'; END IF;
  -- Lock the period first: concurrent postings into it wait, then see it closed.
  SELECT * INTO per FROM accounting_periods WHERE organization_id = org AND id = c.period_id FOR UPDATE;
  IF per.status <> 'open' THEN RAISE EXCEPTION 'period_closed'; END IF;
  chk := period_close_checks(org, c.period_id);
  IF NOT (chk->>'ready')::boolean THEN RAISE EXCEPTION 'close_checks_failed'; END IF;
  PERFORM fs_set_period_status(org, actor, staff, per, 'closed', close_note, correlation);
  UPDATE period_closes SET status = 'closed', approved_by_id = staff, approved_at = now(), approval_checks = chk, note = coalesce(close_note, period_closes.note), version = version + 1
    WHERE organization_id = org AND id = c.id;
  RETURN chk;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION period_close_assign(org text, actor text, cid uuid, reviewer uuid, expected integer, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); c period_closes;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':period_close', 0));
  SELECT * INTO c FROM period_closes WHERE organization_id = org AND id = cid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'period_close_unavailable'; END IF;
  IF fs_replay(org, key, 'period_close', cid::text, 'assigned') THEN RETURN jsonb_build_object('id', cid, 'already', true); END IF;
  IF c.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_period_close'; END IF;
  IF c.status NOT IN ('in_progress','submitted') THEN RAISE EXCEPTION 'invalid_close_transition'; END IF;
  IF reviewer IS NOT NULL AND (reviewer = c.prepared_by_id OR reviewer IS NOT DISTINCT FROM c.submitted_by_id) THEN RAISE EXCEPTION 'fs_self_approval_denied'; END IF;
  IF reviewer IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff_memberships WHERE organization_id = org AND id = reviewer AND status = 'active') THEN RAISE EXCEPTION 'close_reviewer_unavailable'; END IF;
  UPDATE period_closes SET assigned_reviewer_id = reviewer, version = version + 1 WHERE organization_id = org AND id = cid;
  PERFORM fs_event(org, 'period_close', cid::text, actor, staff, 'assigned', NULL, jsonb_build_object('reviewer', reviewer), key, correlation);
  RETURN jsonb_build_object('id', cid, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION period_close_command(org text, actor text, cid uuid, cmd text, expected integer, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); c period_closes; per accounting_periods; chk jsonb; clean text := nullif(trim(coalesce(note, '')), ''); target text;
BEGIN
  IF cmd NOT IN ('submit','return','approve','cancel','reopen') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':period_close', 0));
  SELECT * INTO c FROM period_closes WHERE organization_id = org AND id = cid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'period_close_unavailable'; END IF;
  IF fs_replay(org, key, 'period_close', cid::text, cmd) THEN RETURN jsonb_build_object('id', cid, 'status', c.status, 'already', true); END IF;
  IF c.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_period_close'; END IF;
  IF length(coalesce(clean, '')) > 2000 THEN RAISE EXCEPTION 'note_too_long'; END IF;
  SELECT * INTO per FROM accounting_periods WHERE organization_id = org AND id = c.period_id;
  IF cmd = 'submit' THEN
    IF c.status <> 'in_progress' THEN RAISE EXCEPTION 'invalid_close_transition'; END IF;
    chk := period_close_checks(org, c.period_id);
    IF NOT (chk->>'ready')::boolean THEN RAISE EXCEPTION 'close_checks_failed'; END IF;
    IF EXISTS (SELECT 1 FROM period_close_exceptions WHERE organization_id = org AND close_id = cid AND status = 'proposed') THEN RAISE EXCEPTION 'close_exceptions_pending'; END IF;
    UPDATE period_closes SET status = 'submitted', submitted_by_id = staff, submitted_at = now(), submit_checks = chk, note = clean, version = version + 1 WHERE organization_id = org AND id = cid;
    target := 'submitted';
  ELSIF cmd = 'return' THEN
    IF c.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_close_transition'; END IF;
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
    UPDATE period_closes SET status = 'in_progress', submitted_by_id = NULL, submitted_at = NULL, submit_checks = NULL, note = clean, version = version + 1 WHERE organization_id = org AND id = cid;
    target := 'in_progress';
  ELSIF cmd = 'approve' THEN
    IF EXISTS (SELECT 1 FROM year_end_closes y WHERE y.organization_id = org AND y.final_close_id = cid AND y.status = 'prepared') THEN RAISE EXCEPTION 'year_end_pending'; END IF;
    chk := fs_period_close_finalize(org, actor, staff, c, clean, correlation);
    target := 'closed';
  ELSIF cmd = 'cancel' THEN
    IF c.status <> 'in_progress' THEN RAISE EXCEPTION 'invalid_close_transition'; END IF;
    UPDATE period_closes SET status = 'cancelled', note = clean, version = version + 1 WHERE organization_id = org AND id = cid;
    target := 'cancelled';
  ELSE
    IF c.status <> 'closed' THEN RAISE EXCEPTION 'invalid_close_transition'; END IF;
    IF length(coalesce(clean, '')) < 10 THEN RAISE EXCEPTION 'reopen_reason_required'; END IF;
    IF EXISTS (SELECT 1 FROM year_end_closes WHERE organization_id = org AND fiscal_year = per.fiscal_year AND status = 'closed') THEN RAISE EXCEPTION 'year_end_closed'; END IF;
    IF EXISTS (SELECT 1 FROM accounting_periods WHERE organization_id = org AND start_date > per.end_date AND fiscal_year = per.fiscal_year AND status = 'closed') THEN
      RAISE EXCEPTION 'later_period_closed';
    END IF;
    SELECT * INTO per FROM accounting_periods WHERE organization_id = org AND id = c.period_id FOR UPDATE;
    PERFORM fs_set_period_status(org, actor, staff, per, 'open', clean, correlation);
    UPDATE period_closes SET status = 'reopened', reopened_by_id = staff, reopened_at = now(), reopen_reason = clean, version = version + 1 WHERE organization_id = org AND id = cid;
    target := 'reopened';
  END IF;
  PERFORM fs_event(org, 'period_close', cid::text, actor, staff, cmd, clean, jsonb_build_object('period', per.name, 'status', target,
    'failed', (SELECT coalesce(jsonb_agg(x->>'key'), '[]'::jsonb) FROM jsonb_array_elements(coalesce(chk->'checks', '[]'::jsonb)) x WHERE x->>'status' IN ('fail','excepted'))), key, correlation);
  RETURN jsonb_build_object('id', cid, 'status', target, 'already', false);
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Year-end. One active closing per financial year. Preparation builds the closing journal (every
-- income and expense balance of the year to retained earnings) and submits it; approval by another
-- person posts it and closes the final period in the same transaction. Opening balances of the next
-- year are the cumulative ledger balances: nothing is copied and no opening journal is created.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE year_end_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2200),
  year_start date NOT NULL,
  year_end date NOT NULL,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','closed','rejected','reopened')),
  journal_id uuid,
  final_close_id uuid NOT NULL,
  statement_set_id uuid NOT NULL,
  retained_earnings_account_id uuid NOT NULL,
  net_result numeric(17,2) NOT NULL,
  ledger_fingerprint text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  prepared_by_id uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  decided_by_id uuid,
  decided_at timestamptz,
  decision_note text,
  reopened_by_id uuid,
  reopened_at timestamptz,
  reopen_reason text,
  reversal_journal_id uuid,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, journal_id) REFERENCES accounting_journals(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, reversal_journal_id) REFERENCES accounting_journals(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, final_close_id) REFERENCES period_closes(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, statement_set_id) REFERENCES fs_statement_sets(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, retained_earnings_account_id) REFERENCES accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, prepared_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, decided_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, reopened_by_id) REFERENCES staff_memberships(organization_id, id) ON DELETE RESTRICT,
  CHECK (decided_by_id IS NULL OR decided_by_id <> prepared_by_id),
  CHECK (status = 'prepared' OR decided_by_id IS NOT NULL),
  CHECK (status <> 'reopened' OR (reopened_by_id IS NOT NULL AND length(reopen_reason) >= 10))
);
--> statement-breakpoint
-- Idempotent retained-earnings transfer: never two live closings for one financial year.
CREATE UNIQUE INDEX year_end_closes_live_uq ON year_end_closes (organization_id, fiscal_year) WHERE status IN ('prepared','closed');
--> statement-breakpoint
CREATE TRIGGER year_end_closes_no_truncate BEFORE TRUNCATE ON year_end_closes FOR EACH STATEMENT EXECUTE FUNCTION accounting_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION year_end_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'fs_history_immutable'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'prepared' THEN RAISE EXCEPTION 'invalid_year_end_transition'; END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','version','decided_by_id','decided_at','decision_note','reopened_by_id','reopened_at','reopen_reason','reversal_journal_id'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','version','decided_by_id','decided_at','decision_note','reopened_by_id','reopened_at','reopen_reason','reversal_journal_id'])
     OR NOT ((OLD.status = 'prepared' AND NEW.status IN ('closed','rejected')) OR (OLD.status = 'closed' AND NEW.status = 'reopened')) THEN
    RAISE EXCEPTION 'invalid_year_end_transition';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER year_end_closes_guard BEFORE INSERT OR UPDATE OR DELETE ON year_end_closes FOR EACH ROW EXECUTE FUNCTION year_end_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION year_end_prepare(org text, actor text, fy integer, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); key text := nullif(p->>'key', ''); y year_end_closes; cls fs_classification_versions := fs_classification_current(org);
  ys date; ye date; last_per accounting_periods; fc period_closes; ss fs_statement_sets; lines jsonb := '[]'::jsonb; r record; net numeric := 0; jid uuid; yid uuid;
  cur text := (accounting_policy(org)).functional_currency;
BEGIN
  IF key IS NULL OR length(key) > 150 THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO y FROM year_end_closes WHERE organization_id = org AND idempotency_key = key;
  IF FOUND THEN
    IF y.fiscal_year <> fy THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', y.id, 'journalId', y.journal_id, 'already', true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':year_end', 0));
  IF EXISTS (SELECT 1 FROM year_end_closes WHERE organization_id = org AND fiscal_year = fy AND status IN ('prepared','closed')) THEN RAISE EXCEPTION 'year_end_exists'; END IF;
  IF cls.id IS NULL THEN RAISE EXCEPTION 'classification_required'; END IF;
  SELECT min(start_date), max(end_date) INTO ys, ye FROM accounting_periods WHERE organization_id = org AND fiscal_year = fy;
  IF ys IS NULL THEN RAISE EXCEPTION 'period_missing'; END IF;
  IF EXISTS (SELECT 1 FROM year_end_closes WHERE organization_id = org AND fiscal_year < fy AND status = 'prepared') THEN RAISE EXCEPTION 'earlier_year_end_pending'; END IF;
  SELECT * INTO last_per FROM accounting_periods WHERE organization_id = org AND fiscal_year = fy AND end_date = ye;
  IF last_per.status <> 'open' THEN RAISE EXCEPTION 'final_period_not_open'; END IF;
  IF EXISTS (SELECT 1 FROM accounting_periods WHERE organization_id = org AND fiscal_year = fy AND id <> last_per.id AND status <> 'closed') THEN RAISE EXCEPTION 'year_periods_open'; END IF;
  SELECT * INTO fc FROM period_closes WHERE organization_id = org AND period_id = last_per.id AND status = 'submitted';
  IF NOT FOUND THEN RAISE EXCEPTION 'final_period_close_not_submitted'; END IF;
  IF nullif(p->>'statementSetId', '') IS NULL OR NOT accounting_is_uuid(p->>'statementSetId') THEN RAISE EXCEPTION 'annual_statements_required'; END IF;
  SELECT * INTO ss FROM fs_statement_sets WHERE organization_id = org AND id = (p->>'statementSetId')::uuid;
  IF NOT FOUND OR ss.status <> 'approved' OR ss.kind <> 'year' OR ss.period_start <> ys OR ss.period_end <> ye THEN RAISE EXCEPTION 'annual_statements_required'; END IF;
  IF ss.ledger_fingerprint <> fs_ledger_fingerprint(org, ye) THEN RAISE EXCEPTION 'statements_stale'; END IF;
  -- Close every income and expense account's balance for the year to retained earnings.
  -- Cumulative balances, so results of any earlier year that was never closed are transferred too.
  FOR r IN SELECT b.account_id, b.code, b.closing AS bal FROM fs_account_balances(org, ys, ye) b
    WHERE b.account_type IN ('income','other_income','cost_of_sales','operating_expense','other_expense') AND b.closing <> 0 ORDER BY b.code LOOP
    lines := lines || jsonb_build_object('accountId', r.account_id, 'currency', cur, 'description', 'Close ' || r.code || ' to retained earnings',
      'debit', CASE WHEN r.bal < 0 THEN (-r.bal)::text ELSE '0' END, 'credit', CASE WHEN r.bal > 0 THEN r.bal::text ELSE '0' END);
    net := net - r.bal;
  END LOOP;
  IF net <> 0 THEN
    lines := lines || jsonb_build_object('accountId', cls.retained_earnings_account_id, 'currency', cur, 'description', CASE WHEN net > 0 THEN 'Profit for FY' ELSE 'Loss for FY' END || fy,
      'debit', CASE WHEN net < 0 THEN (-net)::text ELSE '0' END, 'credit', CASE WHEN net > 0 THEN net::text ELSE '0' END);
  END IF;
  IF jsonb_array_length(lines) >= 2 THEN
    PERFORM set_config('calacot.year_end', 'on', true);
    INSERT INTO accounting_journals (organization_id, journal_type, status, entry_date, description, reference, prepared_by_id, idempotency_key)
    VALUES (org, 'manual', 'draft', ye, 'Year-end closing entries FY' || fy || ': income and expenses to retained earnings', 'YE-FY' || fy, staff, 'ye:' || key) RETURNING id INTO jid;
    PERFORM accounting_journal_write_lines(org, jid, lines);
    PERFORM accounting_event(org, 'journal', jid::text, actor, staff, 'created', NULL, 'draft', 1, NULL, accounting_journal_totals(org, jid) || jsonb_build_object('source', 'year_end'), NULL, correlation);
    PERFORM accounting_journal_command(org, actor, jid, 'submit', 1, 'Year-end closing entries', 'ye:' || key || ':submit', correlation);
    PERFORM set_config('calacot.year_end', 'off', true);
  END IF;
  INSERT INTO year_end_closes (organization_id, fiscal_year, year_start, year_end, journal_id, final_close_id, statement_set_id, retained_earnings_account_id, net_result,
    ledger_fingerprint, prepared_by_id, idempotency_key)
  VALUES (org, fy, ys, ye, jid, fc.id, ss.id, cls.retained_earnings_account_id, net, fs_ledger_fingerprint(org, ye), staff, key) RETURNING id INTO yid;
  PERFORM fs_event(org, 'year_end', yid::text, actor, staff, 'prepared', p->>'note', jsonb_build_object('fiscalYear', fy, 'netResult', net::text, 'journalId', jid, 'lines', jsonb_array_length(lines)), key, correlation);
  RETURN jsonb_build_object('id', yid, 'journalId', jid, 'netResult', net::text, 'already', false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION year_end_decide(org text, actor text, yid uuid, decision text, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); y year_end_closes; clean text := nullif(trim(coalesce(note, '')), ''); fc period_closes; j accounting_journals; ss fs_statement_sets;
BEGIN
  IF decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':year_end', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':period_close', 0));
  IF fs_replay(org, key, 'year_end', yid::text, decision) THEN RETURN jsonb_build_object('id', yid, 'already', true); END IF;
  SELECT * INTO y FROM year_end_closes WHERE organization_id = org AND id = yid FOR UPDATE;
  IF NOT FOUND OR y.status <> 'prepared' THEN RAISE EXCEPTION 'year_end_unavailable'; END IF;
  IF y.prepared_by_id = staff THEN RAISE EXCEPTION 'fs_self_approval_denied'; END IF;
  IF y.journal_id IS NOT NULL THEN SELECT * INTO j FROM accounting_journals WHERE organization_id = org AND id = y.journal_id; END IF;
  IF decision = 'reject' THEN
    IF length(coalesce(clean, '')) < 5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
    IF j.id IS NOT NULL AND j.status = 'submitted' THEN
      PERFORM set_config('calacot.year_end', 'on', true);
      PERFORM accounting_journal_command(org, actor, j.id, 'reject', j.version, clean, 'ye:' || key || ':reject', correlation);
      PERFORM set_config('calacot.year_end', 'off', true);
    END IF;
    UPDATE year_end_closes SET status = 'rejected', decided_by_id = staff, decided_at = now(), decision_note = clean, version = version + 1 WHERE organization_id = org AND id = yid;
  ELSE
    -- Nothing may have been posted to the year since preparation (the closing entry is not posted yet).
    IF y.ledger_fingerprint <> fs_ledger_fingerprint(org, y.year_end) THEN RAISE EXCEPTION 'year_end_stale'; END IF;
    SELECT * INTO ss FROM fs_statement_sets WHERE organization_id = org AND id = y.statement_set_id;
    IF ss.status <> 'approved' THEN RAISE EXCEPTION 'annual_statements_required'; END IF;
    SELECT * INTO fc FROM period_closes WHERE organization_id = org AND id = y.final_close_id FOR UPDATE;
    IF fc.status <> 'submitted' THEN RAISE EXCEPTION 'final_period_close_not_submitted'; END IF;
    IF j.id IS NOT NULL THEN
      IF j.status <> 'submitted' THEN RAISE EXCEPTION 'year_end_journal_changed'; END IF;
      PERFORM set_config('calacot.year_end', 'on', true);
      PERFORM accounting_journal_command(org, actor, j.id, 'approve', j.version, coalesce(clean, 'Year-end closing approved'), 'ye:' || key || ':approve', correlation);
      PERFORM accounting_journal_command(org, actor, j.id, 'post', j.version + 1, NULL, 'ye:' || key || ':post', correlation);
      PERFORM set_config('calacot.year_end', 'off', true);
    END IF;
    PERFORM fs_period_close_finalize(org, actor, staff, fc, coalesce(clean, 'Closed with year-end FY' || y.fiscal_year), correlation);
    PERFORM fs_event(org, 'period_close', fc.id::text, actor, staff, 'approve', clean, jsonb_build_object('status', 'closed', 'yearEnd', yid), NULL, correlation);
    UPDATE year_end_closes SET status = 'closed', decided_by_id = staff, decided_at = now(), decision_note = clean, version = version + 1 WHERE organization_id = org AND id = yid;
  END IF;
  PERFORM fs_event(org, 'year_end', yid::text, actor, staff, decision, clean, jsonb_build_object('fiscalYear', y.fiscal_year, 'netResult', y.net_result::text), key, correlation);
  RETURN jsonb_build_object('id', yid, 'status', CASE WHEN decision = 'approve' THEN 'closed' ELSE 'rejected' END, 'already', false);
END $$;
--> statement-breakpoint
-- Authorized reopening of a closed year: reopens the final period, reverses the closing journal
-- (history preserved) and releases the year for a new closing.
CREATE OR REPLACE FUNCTION year_end_reopen(org text, actor text, yid uuid, reason text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org, actor); y year_end_closes; clean text := nullif(trim(coalesce(reason, '')), ''); fc period_closes; per accounting_periods; r jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':year_end', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(org || ':period_close', 0));
  IF fs_replay(org, key, 'year_end', yid::text, 'reopen') THEN RETURN jsonb_build_object('id', yid, 'already', true); END IF;
  SELECT * INTO y FROM year_end_closes WHERE organization_id = org AND id = yid FOR UPDATE;
  IF NOT FOUND OR y.status <> 'closed' THEN RAISE EXCEPTION 'year_end_unavailable'; END IF;
  IF length(coalesce(clean, '')) < 10 THEN RAISE EXCEPTION 'reopen_reason_required'; END IF;
  IF EXISTS (SELECT 1 FROM year_end_closes WHERE organization_id = org AND fiscal_year > y.fiscal_year AND status IN ('prepared','closed')) THEN RAISE EXCEPTION 'later_year_closed'; END IF;
  SELECT * INTO fc FROM period_closes WHERE organization_id = org AND id = y.final_close_id FOR UPDATE;
  SELECT * INTO per FROM accounting_periods WHERE organization_id = org AND id = fc.period_id FOR UPDATE;
  IF per.status = 'closed' THEN
    PERFORM fs_set_period_status(org, actor, staff, per, 'open', clean, correlation);
  END IF;
  IF fc.status = 'closed' THEN
    UPDATE period_closes SET status = 'reopened', reopened_by_id = staff, reopened_at = now(), reopen_reason = clean, version = version + 1 WHERE organization_id = org AND id = fc.id;
  END IF;
  IF y.journal_id IS NOT NULL THEN
    PERFORM set_config('calacot.year_end', 'on', true);
    r := accounting_journal_reverse(org, actor, y.journal_id, jsonb_build_object('key', 'ye:' || key || ':reverse', 'entryDate', y.year_end, 'reason', left('Year-end reopened: ' || clean, 300)), correlation);
    PERFORM set_config('calacot.year_end', 'off', true);
  END IF;
  UPDATE year_end_closes SET status = 'reopened', reopened_by_id = staff, reopened_at = now(), reopen_reason = clean, reversal_journal_id = (r->>'id')::uuid, version = version + 1
    WHERE organization_id = org AND id = yid;
  PERFORM fs_event(org, 'year_end', yid::text, actor, staff, 'reopen', clean, jsonb_build_object('fiscalYear', y.fiscal_year, 'reversalId', r->>'id'), key, correlation);
  RETURN jsonb_build_object('id', yid, 'status', 'reopened', 'reversalId', r->>'id', 'already', false);
END $$;
--> statement-breakpoint
-- Year-end closing journals (idempotency key prefix "ye:") and their reversals change status only
-- inside the year-end functions, never through the ordinary journal screens.
CREATE OR REPLACE FUNCTION fs_year_end_journal_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('calacot.year_end', true), '') = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.idempotency_key LIKE 'ye:%' OR (NEW.reverses_journal_id IS NOT NULL AND EXISTS (SELECT 1 FROM accounting_journals o
         WHERE o.organization_id = NEW.organization_id AND o.id = NEW.reverses_journal_id AND o.idempotency_key LIKE 'ye:%')) THEN
      RAISE EXCEPTION 'year_end_journal_controlled';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND OLD.idempotency_key LIKE 'ye:%' THEN
    RAISE EXCEPTION 'year_end_journal_controlled';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounting_journals_year_end_control BEFORE INSERT OR UPDATE ON accounting_journals FOR EACH ROW EXECUTE FUNCTION fs_year_end_journal_control();
