CREATE TABLE "expense_disbursements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"expense_id" uuid NOT NULL,
	"amount" numeric(17, 2) NOT NULL,
	"currency" text NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"reference_normalized" text GENERATED ALWAYS AS (nullif(upper(regexp_replace(coalesce(reference, ''), '[^A-Za-z0-9]', '', 'g')), '')) STORED,
	"paid_on" date NOT NULL,
	"responsible_staff_id" uuid NOT NULL,
	"recorded_by_id" uuid NOT NULL,
	"evidence_document_id" uuid,
	"notes" text,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'recorded' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by_id" uuid,
	"void_reason" text,
	"reconciled_at" timestamp with time zone,
	"reconciled_by_id" uuid,
	"reconciliation_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_disbursements_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "expense_disbursements_idempotency_uq" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "expense_disbursements_method_check" CHECK ("expense_disbursements"."method" in ('bank_transfer', 'mobile_money', 'cash', 'cheque', 'other')),
	CONSTRAINT "expense_disbursements_status_check" CHECK ("expense_disbursements"."status" in ('recorded', 'void')),
	CONSTRAINT "expense_disbursements_currency_check" CHECK ("expense_disbursements"."currency" in ('UGX', 'USD')),
	CONSTRAINT "expense_disbursements_amount_check" CHECK ("expense_disbursements"."amount" > 0),
	CONSTRAINT "expense_disbursements_reference_check" CHECK ("expense_disbursements"."method" = 'cash' or "expense_disbursements"."reference_normalized" is not null),
	CONSTRAINT "expense_disbursements_void_check" CHECK ("expense_disbursements"."status" <> 'void' or ("expense_disbursements"."voided_at" is not null and "expense_disbursements"."voided_by_id" is not null and nullif(trim("expense_disbursements"."void_reason"), '') is not null)),
	CONSTRAINT "expense_disbursements_reconciled_check" CHECK ("expense_disbursements"."reconciled_at" is null or ("expense_disbursements"."status" = 'recorded' and "expense_disbursements"."reconciled_by_id" is not null and nullif(trim("expense_disbursements"."reconciliation_reference"), '') is not null)),
	CONSTRAINT "expense_disbursements_segregation_check" CHECK ("expense_disbursements"."reconciled_by_id" is null or "expense_disbursements"."reconciled_by_id" <> "expense_disbursements"."recorded_by_id")
);
--> statement-breakpoint
CREATE TABLE "expense_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"expense_id" uuid NOT NULL,
	"disbursement_id" uuid,
	"actor_clerk_user_id" text NOT NULL,
	"actor_staff_id" uuid,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"version" integer,
	"note" text,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_events_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_status_check";--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "requested_by_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "reviewed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
-- Moved ahead of the composite foreign key that depends on it (drizzle-kit emitted it later).
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_org_id_currency_uq" UNIQUE("organization_id","id","currency");--> statement-breakpoint
ALTER TABLE "expense_disbursements" ADD CONSTRAINT "expense_disbursements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_disbursements" ADD CONSTRAINT "expense_disbursements_expense_currency_fk" FOREIGN KEY ("organization_id","expense_id","currency") REFERENCES "public"."expenses"("organization_id","id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_disbursements" ADD CONSTRAINT "expense_disbursements_responsible_fk" FOREIGN KEY ("organization_id","responsible_staff_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_disbursements" ADD CONSTRAINT "expense_disbursements_recorded_fk" FOREIGN KEY ("organization_id","recorded_by_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_disbursements" ADD CONSTRAINT "expense_disbursements_voided_fk" FOREIGN KEY ("organization_id","voided_by_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_disbursements" ADD CONSTRAINT "expense_disbursements_reconciled_fk" FOREIGN KEY ("organization_id","reconciled_by_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_disbursements" ADD CONSTRAINT "expense_disbursements_evidence_fk" FOREIGN KEY ("organization_id","evidence_document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_expense_fk" FOREIGN KEY ("organization_id","expense_id") REFERENCES "public"."expenses"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_disbursement_fk" FOREIGN KEY ("organization_id","disbursement_id") REFERENCES "public"."expense_disbursements"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_actor_fk" FOREIGN KEY ("organization_id","actor_staff_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_disbursements_reference_uq" ON "expense_disbursements" USING btree ("organization_id","method","reference_normalized") WHERE "expense_disbursements"."status" = 'recorded' and "expense_disbursements"."reference_normalized" is not null;--> statement-breakpoint
CREATE INDEX "expense_disbursements_expense_idx" ON "expense_disbursements" USING btree ("organization_id","expense_id");--> statement-breakpoint
CREATE INDEX "expense_disbursements_paid_idx" ON "expense_disbursements" USING btree ("organization_id","paid_on");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_events_idempotency_uq" ON "expense_events" USING btree ("organization_id","idempotency_key") WHERE "expense_events"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "expense_events_expense_idx" ON "expense_events" USING btree ("organization_id","expense_id","created_at");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_requestedById_fk" FOREIGN KEY ("organization_id","requested_by_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reviewedById_fk" FOREIGN KEY ("organization_id","reviewed_by_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_idempotency_uq" ON "expenses" USING btree ("organization_id","idempotency_key") WHERE "expenses"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "expenses_requester_status_idx" ON "expenses" USING btree ("organization_id","requested_by_id","status");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_no_self_approval_check" CHECK ("expenses"."approved_by_id" is null or "expenses"."requested_by_id" is null or "expenses"."approved_by_id" <> "expenses"."requested_by_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_returned_check" CHECK ("expenses"."status" <> 'returned' or ("expenses"."reviewed_by_id" is not null and "expenses"."reviewed_at" is not null and nullif(trim("expenses"."review_note"), '') is not null));--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_version_check" CHECK ("expenses"."version" > 0);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_status_check" CHECK ("expenses"."status" in ('draft', 'submitted', 'returned', 'approved', 'paid', 'rejected', 'void'));--> statement-breakpoint
-- Phase 1D financial operations. Called through the Neon HTTP driver: each function call
-- is one PostgreSQL transaction. Functions are INVOKER. Application code performs Clerk
-- permission checks; these functions enforce record ownership, segregation of duties,
-- state transitions, optimistic versions and idempotency. Restrict direct callers.
CREATE OR REPLACE FUNCTION finance_staff(org text, actor text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM staff_memberships WHERE organization_id=org AND clerk_user_id=actor AND status='active';
  IF sid IS NULL THEN RAISE EXCEPTION 'staff_mirror_required'; END IF;
  RETURN sid;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance_kampala_today() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'Africa/Kampala')::date;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION expense_event(org text, eid uuid, did uuid, actor text, staff uuid, act text, from_s text, to_s text, ver integer, note text, changes jsonb, key text, correlation text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO expense_events(organization_id,expense_id,disbursement_id,actor_clerk_user_id,actor_staff_id,action,from_status,to_status,version,note,changes,idempotency_key,correlation_id)
  VALUES(org,eid,did,actor,staff,act,from_s,to_s,ver,note,coalesce(changes,'{}'::jsonb),key,correlation);
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
  VALUES(org,actor,'staff','expense.'||act,'expense',eid::text,jsonb_build_object('from',from_s,'to',to_s,'disbursementId',did,'version',ver),correlation);
$$;
--> statement-breakpoint
-- True when this idempotency key already completed the same command on the same expense.
CREATE OR REPLACE FUNCTION expense_replay(org text, key text, eid uuid, act text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE ev expense_events;
BEGIN
  IF nullif(key,'') IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO ev FROM expense_events WHERE organization_id=org AND idempotency_key=key;
  IF NOT FOUND THEN RETURN false; END IF;
  IF ev.expense_id<>eid OR ev.action<>act THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN true;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION expense_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'expense_history_immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER expense_events_immutable BEFORE UPDATE OR DELETE ON expense_events FOR EACH ROW EXECUTE FUNCTION expense_history_guard();
--> statement-breakpoint
CREATE TRIGGER expense_events_no_truncate BEFORE TRUNCATE ON expense_events FOR EACH STATEMENT EXECUTE FUNCTION expense_history_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION expense_disbursement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'disbursement_immutable'; END IF;
  IF (NEW.id,NEW.organization_id,NEW.expense_id,NEW.amount,NEW.currency,NEW.method,NEW.reference,NEW.paid_on,NEW.responsible_staff_id,NEW.recorded_by_id,NEW.evidence_document_id,NEW.notes,NEW.idempotency_key,NEW.created_at)
     IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.expense_id,OLD.amount,OLD.currency,OLD.method,OLD.reference,OLD.paid_on,OLD.responsible_staff_id,OLD.recorded_by_id,OLD.evidence_document_id,OLD.notes,OLD.idempotency_key,OLD.created_at)
  THEN RAISE EXCEPTION 'disbursement_immutable'; END IF;
  IF OLD.status='void' THEN RAISE EXCEPTION 'disbursement_immutable'; END IF;
  IF OLD.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'reconciled_disbursement_locked'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER expense_disbursements_guard BEFORE UPDATE OR DELETE ON expense_disbursements FOR EACH ROW EXECUTE FUNCTION expense_disbursement_guard();
--> statement-breakpoint
CREATE TRIGGER expense_disbursements_no_truncate BEFORE TRUNCATE ON expense_disbursements FOR EACH STATEMENT EXECUTE FUNCTION expense_history_guard();
--> statement-breakpoint
-- Once an expense leaves draft/returned, its financial substance is locked for every writer.
CREATE OR REPLACE FUNCTION expense_integrity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id OR OLD.id IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'expense_locked'; END IF;
  IF OLD.requested_by_id IS NOT NULL AND NEW.requested_by_id IS DISTINCT FROM OLD.requested_by_id THEN RAISE EXCEPTION 'expense_locked'; END IF;
  IF OLD.status NOT IN ('draft','returned') AND
     (NEW.net_amount,NEW.tax_amount,NEW.total,NEW.currency,NEW.division,NEW.project_id,NEW.supplier_id,NEW.category,NEW.description,NEW.purpose,NEW.incurred_at,NEW.supplier_invoice_reference)
     IS DISTINCT FROM (OLD.net_amount,OLD.tax_amount,OLD.total,OLD.currency,OLD.division,OLD.project_id,OLD.supplier_id,OLD.category,OLD.description,OLD.purpose,OLD.incurred_at,OLD.supplier_invoice_reference)
  THEN RAISE EXCEPTION 'expense_locked'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER expenses_integrity_guard BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION expense_integrity_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION expense_save(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  staff uuid := finance_staff(org,actor); e expenses; eid uuid; sid uuid; proj projects;
  net numeric; tax numeric; key text := nullif(p->>'key',''); incurred_on date; incurred timestamptz;
  supplier_name text := nullif(trim(coalesce(p->>'supplierName','')),'');
BEGIN
  IF key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF coalesce(p->>'division','') NOT IN ('estates','architecture','painting','interiors','tech') THEN RAISE EXCEPTION 'invalid_division'; END IF;
  IF coalesce(p->>'currency','') NOT IN ('UGX','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  IF length(trim(coalesce(p->>'category','')))=0 OR length(p->>'category')>100 THEN RAISE EXCEPTION 'invalid_category'; END IF;
  IF length(trim(coalesce(p->>'description','')))=0 OR length(p->>'description')>500 THEN RAISE EXCEPTION 'invalid_description'; END IF;
  IF length(trim(coalesce(p->>'purpose','')))<5 OR length(p->>'purpose')>4000 THEN RAISE EXCEPTION 'purpose_required'; END IF;
  IF length(coalesce(p->>'supplierInvoiceReference',''))>200 THEN RAISE EXCEPTION 'invalid_reference'; END IF;
  IF coalesce(p->>'netAmount','') !~ '^\d{1,15}(\.\d{1,2})?$' OR coalesce(nullif(p->>'taxAmount',''),'0') !~ '^\d{1,15}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  net := (p->>'netAmount')::numeric; tax := coalesce(nullif(p->>'taxAmount',''),'0')::numeric;
  IF net+tax<=0 OR net+tax>999999999999999.99 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF coalesce(p->>'incurredOn','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'invalid_expense_date'; END IF;
  incurred_on := (p->>'incurredOn')::date;
  IF incurred_on>finance_kampala_today() THEN RAISE EXCEPTION 'future_expense_date'; END IF;
  incurred := incurred_on::timestamp AT TIME ZONE 'Africa/Kampala';
  IF nullif(p->>'projectId','') IS NOT NULL THEN
    SELECT * INTO proj FROM projects WHERE id=(p->>'projectId')::uuid AND organization_id=org;
    IF NOT FOUND OR proj.archived_at IS NOT NULL THEN RAISE EXCEPTION 'project_unavailable'; END IF;
    IF proj.division<>p->>'division' THEN RAISE EXCEPTION 'project_division_mismatch'; END IF;
  END IF;
  IF nullif(p->>'supplierId','') IS NOT NULL THEN
    SELECT id INTO sid FROM suppliers WHERE id=(p->>'supplierId')::uuid AND organization_id=org AND archived_at IS NULL;
    IF sid IS NULL THEN RAISE EXCEPTION 'supplier_unavailable'; END IF;
  ELSIF supplier_name IS NOT NULL THEN
    IF length(supplier_name)>200 THEN RAISE EXCEPTION 'supplier_unavailable'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext(org||':supplier:'||lower(supplier_name)));
    SELECT id INTO sid FROM suppliers WHERE organization_id=org AND archived_at IS NULL AND lower(trim(name))=lower(supplier_name) ORDER BY created_at,id LIMIT 1;
    IF sid IS NULL THEN INSERT INTO suppliers(organization_id,name) VALUES(org,supplier_name) RETURNING id INTO sid; END IF;
  END IF;
  IF nullif(p->>'id','') IS NULL THEN
    SELECT * INTO e FROM expenses WHERE organization_id=org AND idempotency_key=key;
    IF FOUND THEN
      IF e.requested_by_id IS DISTINCT FROM staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
      RETURN jsonb_build_object('id',e.id,'version',e.version,'already',true);
    END IF;
    INSERT INTO expenses(organization_id,supplier_id,project_id,division,category,description,purpose,net_amount,tax_amount,total,currency,status,incurred_at,supplier_invoice_reference,requested_by_id,idempotency_key)
    VALUES(org,sid,nullif(p->>'projectId','')::uuid,p->>'division',trim(p->>'category'),trim(p->>'description'),trim(p->>'purpose'),net,tax,net+tax,p->>'currency','draft',incurred,nullif(trim(coalesce(p->>'supplierInvoiceReference','')),''),staff,key)
    ON CONFLICT (organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING id INTO eid;
    IF eid IS NULL THEN
      SELECT * INTO e FROM expenses WHERE organization_id=org AND idempotency_key=key;
      IF e.requested_by_id IS DISTINCT FROM staff THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
      RETURN jsonb_build_object('id',e.id,'version',e.version,'already',true);
    END IF;
    PERFORM expense_event(org,eid,NULL,actor,staff,'created',NULL,'draft',1,NULL,jsonb_build_object('total',(net+tax)::text,'currency',p->>'currency','division',p->>'division','projectId',nullif(p->>'projectId','')),key,correlation);
    RETURN jsonb_build_object('id',eid,'version',1,'already',false);
  END IF;
  SELECT * INTO e FROM expenses WHERE id=(p->>'id')::uuid AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_unavailable'; END IF;
  IF expense_replay(org,key,e.id,'updated') THEN RETURN jsonb_build_object('id',e.id,'version',e.version,'already',true); END IF;
  IF e.requested_by_id IS DISTINCT FROM staff THEN RAISE EXCEPTION 'not_requester'; END IF;
  IF e.status NOT IN ('draft','returned') THEN RAISE EXCEPTION 'expense_not_editable'; END IF;
  IF e.version IS DISTINCT FROM (p->>'version')::integer THEN RAISE EXCEPTION 'stale_expense'; END IF;
  UPDATE expenses SET supplier_id=sid,project_id=nullif(p->>'projectId','')::uuid,division=p->>'division',category=trim(p->>'category'),description=trim(p->>'description'),purpose=trim(p->>'purpose'),net_amount=net,tax_amount=tax,total=net+tax,currency=p->>'currency',incurred_at=incurred,supplier_invoice_reference=nullif(trim(coalesce(p->>'supplierInvoiceReference','')),''),version=version+1,updated_at=now()
  WHERE id=e.id AND organization_id=org;
  PERFORM expense_event(org,e.id,NULL,actor,staff,'updated',e.status,e.status,e.version+1,NULL,jsonb_build_object('before',jsonb_build_object('total',e.total::text,'currency',e.currency,'division',e.division,'projectId',e.project_id,'supplierId',e.supplier_id,'category',e.category),'after',jsonb_build_object('total',(net+tax)::text,'currency',p->>'currency','division',p->>'division','projectId',nullif(p->>'projectId',''),'supplierId',sid,'category',trim(p->>'category'))),key,correlation);
  RETURN jsonb_build_object('id',e.id,'version',e.version+1,'already',false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION expense_command(org text, actor text, eid uuid, cmd text, expected integer, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org,actor); e expenses; target text; clean text := nullif(trim(coalesce(note,'')),'');
BEGIN
  IF cmd NOT IN ('submit','withdraw','cancel','approve','return','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO e FROM expenses WHERE id=eid AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_unavailable'; END IF;
  IF expense_replay(org,key,eid,cmd) THEN RETURN jsonb_build_object('id',eid,'status',e.status,'version',e.version,'already',true); END IF;
  IF length(coalesce(clean,''))>4000 THEN RAISE EXCEPTION 'note_too_long'; END IF;
  IF cmd IN ('submit','withdraw','cancel') THEN
    IF e.requested_by_id IS DISTINCT FROM staff THEN RAISE EXCEPTION 'not_requester'; END IF;
    IF e.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_expense'; END IF;
    IF (cmd IN ('submit','cancel') AND e.status NOT IN ('draft','returned')) OR (cmd='withdraw' AND e.status<>'submitted') THEN RAISE EXCEPTION 'invalid_expense_transition'; END IF;
    target := CASE cmd WHEN 'submit' THEN 'submitted' WHEN 'withdraw' THEN 'draft' ELSE 'void' END;
    UPDATE expenses SET status=target,submitted_at=CASE WHEN cmd='submit' THEN now() ELSE submitted_at END,version=version+1,updated_at=now() WHERE id=eid AND organization_id=org;
  ELSE
    IF e.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_review'; END IF;
    IF e.status<>'submitted' THEN RAISE EXCEPTION 'invalid_expense_transition'; END IF;
    IF e.requested_by_id IS NULL THEN RAISE EXCEPTION 'requester_unknown'; END IF;
    IF e.requested_by_id=staff THEN RAISE EXCEPTION 'self_review_denied'; END IF;
    IF cmd IN ('return','reject') AND length(coalesce(clean,''))<5 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
    target := CASE cmd WHEN 'approve' THEN 'approved' WHEN 'return' THEN 'returned' ELSE 'rejected' END;
    UPDATE expenses SET status=target,reviewed_by_id=staff,reviewed_at=now(),review_note=clean,
      approved_by_id=CASE WHEN cmd='approve' THEN staff ELSE approved_by_id END,
      approved_at=CASE WHEN cmd='approve' THEN now() ELSE approved_at END,
      version=version+1,updated_at=now()
    WHERE id=eid AND organization_id=org;
  END IF;
  PERFORM expense_event(org,eid,NULL,actor,staff,cmd,e.status,target,e.version+1,clean,'{}'::jsonb,key,correlation);
  RETURN jsonb_build_object('id',eid,'status',target,'version',e.version+1,'already',false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION expense_disburse(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  staff uuid := finance_staff(org,actor); e expenses; d expense_disbursements; did uuid; disbursed numeric; amt numeric;
  key text := nullif(p->>'key',''); resp uuid; paid date; ref text := nullif(trim(coalesce(p->>'reference','')),''); target text; cname text;
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
  IF ref IS NOT NULL AND EXISTS(SELECT 1 FROM expense_disbursements WHERE organization_id=org AND method=p->>'method' AND status='recorded' AND reference_normalized=nullif(upper(regexp_replace(ref,'[^A-Za-z0-9]','','g')),'')) THEN RAISE EXCEPTION 'duplicate_disbursement_reference'; END IF;
  BEGIN
    INSERT INTO expense_disbursements(organization_id,expense_id,amount,currency,method,reference,paid_on,responsible_staff_id,recorded_by_id,evidence_document_id,notes,idempotency_key)
    VALUES(org,e.id,amt,e.currency,p->>'method',ref,paid,resp,staff,nullif(p->>'evidenceDocumentId','')::uuid,nullif(trim(coalesce(p->>'notes','')),''),key) RETURNING id INTO did;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS cname = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', CASE WHEN cname='expense_disbursements_reference_uq' THEN 'duplicate_disbursement_reference' ELSE 'idempotency_conflict' END;
  END;
  disbursed := disbursed+amt;
  target := CASE WHEN disbursed=e.total THEN 'paid' ELSE 'approved' END;
  UPDATE expenses SET status=target,paid_at=CASE WHEN target='paid' THEN paid::timestamp AT TIME ZONE 'Africa/Kampala' ELSE paid_at END,
    payment_reference=CASE WHEN target='paid' THEN ref ELSE payment_reference END,version=version+1,updated_at=now()
  WHERE id=e.id AND organization_id=org;
  PERFORM expense_event(org,e.id,did,actor,staff,'disbursement_recorded',e.status,target,e.version+1,NULL,jsonb_build_object('amount',amt::text,'currency',e.currency,'method',p->>'method','reference',ref,'paidOn',paid,'responsibleStaffId',resp),key,correlation);
  RETURN jsonb_build_object('id',did,'status',target,'already',false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION expense_disbursement_command(org text, actor text, did uuid, cmd text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  staff uuid := finance_staff(org,actor); d expense_disbursements; e expenses; key text := nullif(p->>'key','');
  clean text := nullif(trim(coalesce(p->>'note','')),''); ref text := nullif(trim(coalesce(p->>'statementReference','')),''); target text;
BEGIN
  IF cmd NOT IN ('void','reconcile') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO d FROM expense_disbursements WHERE id=did AND organization_id=org;
  IF NOT FOUND THEN RAISE EXCEPTION 'disbursement_unavailable'; END IF;
  -- Lock order: expense, then disbursement (same order as expense_disburse).
  SELECT * INTO e FROM expenses WHERE id=d.expense_id AND organization_id=org FOR UPDATE;
  SELECT * INTO d FROM expense_disbursements WHERE id=did AND organization_id=org FOR UPDATE;
  IF expense_replay(org,key,e.id,'disbursement_'||cmd) THEN RETURN jsonb_build_object('id',did,'already',true); END IF;
  IF d.status<>'recorded' THEN RAISE EXCEPTION 'disbursement_unavailable'; END IF;
  IF d.reconciled_at IS NOT NULL THEN RAISE EXCEPTION 'reconciled_disbursement_locked'; END IF;
  IF cmd='void' THEN
    IF length(coalesce(clean,''))<5 OR length(clean)>2000 THEN RAISE EXCEPTION 'void_reason_required'; END IF;
    UPDATE expense_disbursements SET status='void',voided_at=now(),voided_by_id=staff,void_reason=clean WHERE id=did AND organization_id=org;
    target := CASE WHEN e.status='paid' THEN 'approved' ELSE e.status END;
    UPDATE expenses SET status=target,paid_at=CASE WHEN target='approved' THEN NULL ELSE paid_at END,payment_reference=CASE WHEN target='approved' THEN NULL ELSE payment_reference END,version=version+1,updated_at=now() WHERE id=e.id AND organization_id=org;
    PERFORM expense_event(org,e.id,did,actor,staff,'disbursement_void',e.status,target,e.version+1,clean,jsonb_build_object('amount',d.amount::text,'currency',d.currency,'reference',d.reference),key,correlation);
  ELSE
    IF d.recorded_by_id=staff THEN RAISE EXCEPTION 'self_reconciliation_denied'; END IF;
    IF ref IS NULL OR length(ref)>200 OR length(coalesce(clean,''))>2000 THEN RAISE EXCEPTION 'reconciliation_reference_required'; END IF;
    UPDATE expense_disbursements SET reconciled_at=now(),reconciled_by_id=staff,reconciliation_reference=ref WHERE id=did AND organization_id=org;
    PERFORM expense_event(org,e.id,did,actor,staff,'disbursement_reconcile',e.status,e.status,e.version,clean,jsonb_build_object('amount',d.amount::text,'currency',d.currency,'statementReference',ref),key,correlation);
  END IF;
  RETURN jsonb_build_object('id',did,'already',false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION expense_attach_document(org text, actor text, eid uuid, p jsonb, correlation text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org,actor); e expenses; doc uuid := (p->>'documentId')::uuid; key text;
BEGIN
  key := 'attach:'||doc::text;
  SELECT * INTO e FROM expenses WHERE id=eid AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_unavailable'; END IF;
  IF expense_replay(org,key,eid,'document_attached') THEN RETURN doc; END IF;
  IF p->>'role'='requester' THEN
    IF e.requested_by_id IS DISTINCT FROM staff THEN RAISE EXCEPTION 'not_requester'; END IF;
    IF e.status NOT IN ('draft','returned') THEN RAISE EXCEPTION 'expense_not_editable'; END IF;
  ELSIF p->>'role'='finance' THEN
    IF e.status NOT IN ('approved','paid') THEN RAISE EXCEPTION 'expense_not_approved'; END IF;
  ELSE RAISE EXCEPTION 'invalid_command'; END IF;
  IF p->>'storageKey' IS DISTINCT FROM 'finance/expenses/'||eid::text||'/'||doc::text THEN RAISE EXCEPTION 'invalid_storage_key'; END IF;
  IF coalesce(p->>'mimeType','') NOT IN ('application/pdf','image/jpeg','image/png','image/webp') THEN RAISE EXCEPTION 'invalid_document_type'; END IF;
  IF (p->>'sizeBytes')::bigint<=0 OR (p->>'sizeBytes')::bigint>10485760 THEN RAISE EXCEPTION 'document_size_limit'; END IF;
  IF coalesce(p->>'sha256','') !~ '^[0-9a-f]{64}$' OR length(trim(coalesce(p->>'name','')))=0 OR length(p->>'name')>200 THEN RAISE EXCEPTION 'invalid_document'; END IF;
  INSERT INTO documents(id,organization_id,name,kind,storage_key,mime_type,size_bytes,sha256,created_by_clerk_user_id)
  VALUES(doc,org,trim(p->>'name'),'expense_receipt',p->>'storageKey',p->>'mimeType',(p->>'sizeBytes')::bigint,p->>'sha256',actor);
  INSERT INTO document_links(organization_id,document_id,expense_id) VALUES(org,doc,eid);
  PERFORM expense_event(org,eid,NULL,actor,staff,'document_attached',e.status,e.status,e.version,NULL,jsonb_build_object('documentId',doc,'name',trim(p->>'name'),'role',p->>'role','sha256',p->>'sha256'),key,correlation);
  RETURN doc;
END $$;
