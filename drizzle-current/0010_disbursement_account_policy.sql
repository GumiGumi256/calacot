CREATE TABLE "finance_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"method" text NOT NULL,
	"provider" text NOT NULL,
	"account_identifier" text NOT NULL,
	"provider_normalized" text GENERATED ALWAYS AS (upper(regexp_replace(provider, '[^A-Za-z0-9]', '', 'g'))) STORED,
	"account_normalized" text GENERATED ALWAYS AS (upper(regexp_replace(account_identifier, '[^A-Za-z0-9]', '', 'g'))) STORED,
	"label" text NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"verified_by_id" uuid NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"verification_note" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_accounts_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "finance_accounts_org_id_method_currency_uq" UNIQUE("organization_id","id","method","currency"),
	CONSTRAINT "finance_accounts_identity_uq" UNIQUE("organization_id","method","provider_normalized","account_normalized"),
	CONSTRAINT "finance_accounts_idempotency_uq" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "finance_accounts_method_check" CHECK ("finance_accounts"."method" in ('bank_transfer', 'mobile_money', 'cheque')),
	CONSTRAINT "finance_accounts_currency_check" CHECK ("finance_accounts"."currency" in ('UGX', 'USD')),
	CONSTRAINT "finance_accounts_status_check" CHECK ("finance_accounts"."status" in ('active', 'inactive')),
	CONSTRAINT "finance_accounts_identity_check" CHECK ("finance_accounts"."provider_normalized" <> '' and "finance_accounts"."account_normalized" <> '' and length("finance_accounts"."provider") <= 100 and length("finance_accounts"."account_identifier") <= 100 and length(trim("finance_accounts"."label")) between 1 and 120 and length(trim("finance_accounts"."verification_note")) >= 5)
);
--> statement-breakpoint
DROP INDEX "expense_disbursements_reference_uq";--> statement-breakpoint
ALTER TABLE "expense_disbursements" ADD COLUMN "source_account_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_verified_fk" FOREIGN KEY ("organization_id","verified_by_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_disbursements" ADD CONSTRAINT "expense_disbursements_source_account_fk" FOREIGN KEY ("organization_id","source_account_id","method","currency") REFERENCES "public"."finance_accounts"("organization_id","id","method","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_disbursements_account_reference_uq" ON "expense_disbursements" USING btree ("organization_id","method",coalesce("source_account_id", '00000000-0000-0000-0000-000000000000'::uuid),"reference_normalized") WHERE "expense_disbursements"."status" = 'recorded' and "expense_disbursements"."reference_normalized" is not null;--> statement-breakpoint
ALTER TABLE "expense_disbursements" ADD CONSTRAINT "expense_disbursements_source_account_check" CHECK (("expense_disbursements"."method" in ('bank_transfer', 'mobile_money', 'cheque')) = ("expense_disbursements"."source_account_id" is not null));--> statement-breakpoint
-- Approved Phase 1D disbursement reference policy: unique per organization, payment method
-- and (for bank transfer, mobile money and cheque) a verified company source account, using
-- normalized references. Deploy together with 0009: this migration fails if any 0009
-- account-method disbursement without a source account already exists.
CREATE OR REPLACE FUNCTION finance_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'finance_account_immutable'; END IF;
  IF (NEW.id,NEW.organization_id,NEW.method,NEW.provider,NEW.account_identifier,NEW.currency,NEW.verified_by_id,NEW.verified_at,NEW.verification_note,NEW.idempotency_key,NEW.created_at)
     IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.method,OLD.provider,OLD.account_identifier,OLD.currency,OLD.verified_by_id,OLD.verified_at,OLD.verification_note,OLD.idempotency_key,OLD.created_at)
  THEN RAISE EXCEPTION 'finance_account_immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER finance_accounts_guard BEFORE UPDATE OR DELETE ON finance_accounts FOR EACH ROW EXECUTE FUNCTION finance_account_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance_account_save(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org,actor); acc finance_accounts; aid uuid; key text := nullif(p->>'key','');
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO acc FROM finance_accounts WHERE organization_id=org AND idempotency_key=key;
  IF FOUND THEN RETURN jsonb_build_object('id',acc.id,'already',true); END IF;
  IF coalesce(p->>'method','') NOT IN ('bank_transfer','mobile_money','cheque') THEN RAISE EXCEPTION 'invalid_method'; END IF;
  IF coalesce(p->>'currency','') NOT IN ('UGX','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  IF length(trim(coalesce(p->>'verificationNote','')))<5 THEN RAISE EXCEPTION 'account_verification_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(org||':finance_account'));
  IF EXISTS(SELECT 1 FROM finance_accounts WHERE organization_id=org AND method=p->>'method'
      AND provider_normalized=upper(regexp_replace(coalesce(p->>'provider',''),'[^A-Za-z0-9]','','g'))
      AND account_normalized=upper(regexp_replace(coalesce(p->>'accountIdentifier',''),'[^A-Za-z0-9]','','g'))) THEN RAISE EXCEPTION 'finance_account_exists'; END IF;
  BEGIN
    INSERT INTO finance_accounts(organization_id,method,provider,account_identifier,label,currency,verified_by_id,verified_at,verification_note,idempotency_key)
    VALUES(org,p->>'method',trim(p->>'provider'),trim(p->>'accountIdentifier'),trim(p->>'label'),p->>'currency',staff,now(),trim(p->>'verificationNote'),key) RETURNING id INTO aid;
  EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'invalid_finance_account';
  END;
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
  VALUES(org,actor,'staff','finance_account.verify','finance_account',aid::text,jsonb_build_object('method',p->>'method','provider',trim(p->>'provider'),'currency',p->>'currency','note',trim(p->>'verificationNote')),correlation);
  RETURN jsonb_build_object('id',aid,'already',false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance_account_status(org text, actor text, aid uuid, target text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org,actor); acc finance_accounts;
BEGIN
  IF target NOT IN ('active','inactive') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO acc FROM finance_accounts WHERE id=aid AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source_account_unavailable'; END IF;
  IF acc.status=target THEN RETURN jsonb_build_object('id',aid,'already',true); END IF;
  UPDATE finance_accounts SET status=target,updated_at=now() WHERE id=aid AND organization_id=org;
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
  VALUES(org,actor,'staff','finance_account.'||target,'finance_account',aid::text,jsonb_build_object('from',acc.status,'to',target,'staffId',staff),correlation);
  RETURN jsonb_build_object('id',aid,'already',false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION expense_disbursement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'disbursement_immutable'; END IF;
  IF (NEW.id,NEW.organization_id,NEW.expense_id,NEW.amount,NEW.currency,NEW.method,NEW.reference,NEW.source_account_id,NEW.paid_on,NEW.responsible_staff_id,NEW.recorded_by_id,NEW.evidence_document_id,NEW.notes,NEW.idempotency_key,NEW.created_at)
     IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.expense_id,OLD.amount,OLD.currency,OLD.method,OLD.reference,OLD.source_account_id,OLD.paid_on,OLD.responsible_staff_id,OLD.recorded_by_id,OLD.evidence_document_id,OLD.notes,OLD.idempotency_key,OLD.created_at)
  THEN RAISE EXCEPTION 'disbursement_immutable'; END IF;
  IF OLD.status='void' THEN RAISE EXCEPTION 'disbursement_immutable'; END IF;
  IF OLD.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'reconciled_disbursement_locked'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
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
  IF e.requested_by_id=staff THEN RAISE EXCEPTION 'self_disbursement_denied'; END IF;
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
