CREATE TABLE "admin_operation_leases" (
	"organization_id" text NOT NULL,
	"scope" text NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "admin_operation_leases_pk" UNIQUE("organization_id","scope")
);
--> statement-breakpoint
CREATE TABLE "clerk_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"event_type" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"error_code" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "clerk_webhook_events_status_check" CHECK ("clerk_webhook_events"."status" in ('processing', 'processed', 'ignored', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "company_settings_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"version" integer NOT NULL,
	"base_version" integer NOT NULL,
	"settings" jsonb NOT NULL,
	"changed_sections" text[] NOT NULL,
	"status" text NOT NULL,
	"note" text NOT NULL,
	"proposed_by" text NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"idempotency_key" text NOT NULL,
	CONSTRAINT "company_settings_versions_org_version_uq" UNIQUE("organization_id","version"),
	CONSTRAINT "company_settings_versions_idempotency_uq" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "company_settings_versions_status_check" CHECK ("company_settings_versions"."status" in ('approved', 'proposed', 'rejected', 'superseded')),
	CONSTRAINT "company_settings_versions_version_check" CHECK ("company_settings_versions"."version" > 0 and "company_settings_versions"."base_version" >= 0 and "company_settings_versions"."base_version" < "company_settings_versions"."version"),
	CONSTRAINT "company_settings_versions_note_check" CHECK (length(trim("company_settings_versions"."note")) >= 5),
	CONSTRAINT "company_settings_versions_decision_check" CHECK ("company_settings_versions"."status" = 'proposed' or ("company_settings_versions"."decided_by" is not null and "company_settings_versions"."decided_at" is not null)),
	CONSTRAINT "company_settings_versions_two_person_check" CHECK ("company_settings_versions"."status" <> 'approved' or not ('payment' = any("company_settings_versions"."changed_sections")) or "company_settings_versions"."decided_by" <> "company_settings_versions"."proposed_by")
);
--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD COLUMN "responsibilities" text;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD COLUMN "profile_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD COLUMN "suspended_by" text;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD COLUMN "suspension_reason" text;--> statement-breakpoint
ALTER TABLE "admin_operation_leases" ADD CONSTRAINT "admin_operation_leases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings_versions" ADD CONSTRAINT "company_settings_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clerk_webhook_events_received_idx" ON "clerk_webhook_events" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "company_settings_one_open_proposal_uq" ON "company_settings_versions" USING btree ("organization_id") WHERE "company_settings_versions"."status" = 'proposed';--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_suspension_check" CHECK ("staff_memberships"."status" <> 'suspended' or "staff_memberships"."suspended_at" is null or nullif(trim("staff_memberships"."suspension_reason"), '') is not null);--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_profile_version_check" CHECK ("staff_memberships"."profile_version" > 0);--> statement-breakpoint
-- Phase 1E staff administration and company settings. INVOKER functions called by the
-- application after Clerk-verified authorization; each call is one transaction.
CREATE OR REPLACE FUNCTION admin_lease_acquire(org text, lease_scope text, lease_holder text, seconds integer) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE got text;
BEGIN
  INSERT INTO admin_operation_leases(organization_id,scope,holder,expires_at) VALUES(org,lease_scope,lease_holder,clock_timestamp()+make_interval(secs=>seconds))
  ON CONFLICT(organization_id,scope) DO UPDATE SET holder=EXCLUDED.holder,expires_at=EXCLUDED.expires_at
    WHERE admin_operation_leases.expires_at<clock_timestamp() OR admin_operation_leases.holder=EXCLUDED.holder
  RETURNING holder INTO got;
  RETURN got IS NOT NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION admin_lease_release(org text, lease_scope text, lease_holder text) RETURNS void LANGUAGE sql AS $$
  DELETE FROM admin_operation_leases WHERE organization_id=org AND scope=lease_scope AND holder=lease_holder;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION staff_profile_save(org text, actor text, sid uuid, expected integer, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE me uuid := finance_staff(org,actor); s staff_memberships; division_value text := nullif(p->>'division','');
BEGIN
  SELECT * INTO s FROM staff_memberships WHERE id=sid AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_unavailable'; END IF;
  IF s.profile_version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_staff_record'; END IF;
  IF division_value IS NOT NULL AND division_value NOT IN ('estates','architecture','painting','interiors','tech') THEN RAISE EXCEPTION 'invalid_division'; END IF;
  IF length(coalesce(p->>'jobTitle',''))>120 OR length(coalesce(p->>'responsibilities',''))>2000 THEN RAISE EXCEPTION 'invalid_staff_profile'; END IF;
  UPDATE staff_memberships SET division=division_value,job_title=nullif(trim(coalesce(p->>'jobTitle','')),''),responsibilities=nullif(trim(coalesce(p->>'responsibilities','')),''),profile_version=profile_version+1,updated_at=now()
  WHERE id=sid AND organization_id=org;
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
  VALUES(org,actor,'staff','staff.profile','staff_membership',sid::text,jsonb_build_object('divisionFrom',s.division,'divisionTo',division_value,'jobTitleChanged',s.job_title IS DISTINCT FROM nullif(trim(coalesce(p->>'jobTitle','')),''),'responsibilitiesChanged',s.responsibilities IS DISTINCT FROM nullif(trim(coalesce(p->>'responsibilities','')),''),'actorStaffId',me),correlation);
  RETURN jsonb_build_object('id',sid,'version',s.profile_version+1);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION staff_set_status(org text, actor text, sid uuid, target text, reason text, expected integer, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE me uuid := finance_staff(org,actor); s staff_memberships; clean text := nullif(trim(coalesce(reason,'')),'');
BEGIN
  IF target NOT IN ('active','suspended') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO s FROM staff_memberships WHERE id=sid AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_unavailable'; END IF;
  IF s.clerk_user_id=actor THEN RAISE EXCEPTION 'self_administration_denied'; END IF;
  IF s.profile_version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_staff_record'; END IF;
  IF target='suspended' AND s.status<>'active' THEN RAISE EXCEPTION 'invalid_staff_transition'; END IF;
  IF target='active' AND s.status<>'suspended' THEN RAISE EXCEPTION 'invalid_staff_transition'; END IF;
  IF length(coalesce(clean,''))<5 OR length(clean)>1000 THEN RAISE EXCEPTION 'status_reason_required'; END IF;
  UPDATE staff_memberships SET status=target,suspended_at=CASE WHEN target='suspended' THEN now() END,suspended_by=CASE WHEN target='suspended' THEN actor END,
    suspension_reason=CASE WHEN target='suspended' THEN clean END,profile_version=profile_version+1,updated_at=now()
  WHERE id=sid AND organization_id=org;
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
  VALUES(org,actor,'staff',CASE WHEN target='suspended' THEN 'staff.suspend' ELSE 'staff.reactivate' END,'staff_membership',sid::text,jsonb_build_object('from',s.status,'to',target,'reason',clean,'actorStaffId',me),correlation);
  RETURN jsonb_build_object('id',sid,'status',target,'version',s.profile_version+1);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION company_settings_current(org text) RETURNS company_settings_versions LANGUAGE sql STABLE AS $$
  SELECT * FROM company_settings_versions WHERE organization_id=org AND status='approved' ORDER BY version DESC LIMIT 1;
$$;
--> statement-breakpoint
-- Keeps the document issuer source (organizations) aligned with approved settings. Already
-- issued quotation/invoice snapshots copied these values earlier and are never modified.
CREATE OR REPLACE FUNCTION company_settings_apply(org text, s jsonb) RETURNS void LANGUAGE sql AS $$
  UPDATE organizations SET legal_name=s->'identity'->>'legalName',name=coalesce(nullif(s->'identity'->>'tradingName',''),s->'identity'->>'legalName'),
    tax_identifier=nullif(s->'identity'->>'taxIdentifier',''),email=nullif(s->'contacts'->>'email',''),phone=nullif(s->'contacts'->>'phone',''),
    billing_address=nullif(concat_ws(', ',nullif(s->'address'->>'line1',''),nullif(s->'address'->>'city',''),nullif(s->'address'->>'country','')),''),updated_at=now()
  WHERE id=org;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION company_settings_propose(org text, actor text, base integer, s jsonb, baseline jsonb, note text, key text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE me uuid := finance_staff(org,actor); cur company_settings_versions; existing company_settings_versions; prev jsonb; sections text[]; next_version integer; target text; vid uuid;
BEGIN
  IF nullif(key,'') IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  SELECT * INTO existing FROM company_settings_versions WHERE organization_id=org AND idempotency_key=key;
  IF FOUND THEN RETURN jsonb_build_object('id',existing.id,'status',existing.status,'version',existing.version,'already',true); END IF;
  PERFORM pg_advisory_xact_lock(hashtext(org||':company_settings'));
  cur := company_settings_current(org);
  IF coalesce(cur.version,0)<>base THEN RAISE EXCEPTION 'stale_settings'; END IF;
  IF EXISTS(SELECT 1 FROM company_settings_versions WHERE organization_id=org AND status='proposed') THEN RAISE EXCEPTION 'settings_proposal_pending'; END IF;
  IF length(trim(coalesce(note,'')))<5 THEN RAISE EXCEPTION 'settings_note_required'; END IF;
  IF jsonb_typeof(s)<>'object' OR NOT (s ?& ARRAY['identity','contacts','address','divisions','payment','defaults']) OR length(trim(coalesce(s->'identity'->>'legalName','')))=0 THEN RAISE EXCEPTION 'invalid_settings'; END IF;
  -- With no saved version, compare with the server-derived baseline (organization record and
  -- deployment payment configuration) so only genuine changes count.
  prev := coalesce(cur.settings,baseline,'{}'::jsonb);
  SELECT coalesce(array_agg(k ORDER BY k),'{}') INTO sections FROM unnest(ARRAY['identity','contacts','address','divisions','payment','defaults']) k WHERE s->k IS DISTINCT FROM prev->k;
  IF cardinality(sections)=0 THEN RAISE EXCEPTION 'settings_unchanged'; END IF;
  SELECT coalesce(max(version),0)+1 INTO next_version FROM company_settings_versions WHERE organization_id=org;
  target := CASE WHEN 'payment'=ANY(sections) THEN 'proposed' ELSE 'approved' END;
  INSERT INTO company_settings_versions(organization_id,version,base_version,settings,changed_sections,status,note,proposed_by,decided_by,decided_at,idempotency_key)
  VALUES(org,next_version,coalesce(cur.version,0),s,sections,target,trim(note),actor,CASE WHEN target='approved' THEN actor END,CASE WHEN target='approved' THEN now() END,key) RETURNING id INTO vid;
  IF target='approved' THEN PERFORM company_settings_apply(org,s); END IF;
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
  VALUES(org,actor,'staff',CASE WHEN target='approved' THEN 'settings.update' ELSE 'settings.propose' END,'company_settings',vid::text,jsonb_build_object('version',next_version,'sections',sections,'note',trim(note),'actorStaffId',me),correlation);
  RETURN jsonb_build_object('id',vid,'status',target,'version',next_version,'already',false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION company_settings_decide(org text, actor text, vid uuid, decision text, decision_reason text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE me uuid := finance_staff(org,actor); v company_settings_versions; cur company_settings_versions; target text;
BEGIN
  IF decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(org||':company_settings'));
  SELECT * INTO v FROM company_settings_versions WHERE id=vid AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'settings_proposal_unavailable'; END IF;
  IF v.status<>'proposed' THEN
    IF (decision='approve' AND v.status='approved') OR (decision='reject' AND v.status='rejected') THEN RETURN jsonb_build_object('id',vid,'status',v.status,'already',true); END IF;
    RAISE EXCEPTION 'settings_proposal_unavailable';
  END IF;
  IF v.proposed_by=actor THEN RAISE EXCEPTION 'self_approval_denied'; END IF;
  IF length(trim(coalesce(decision_reason,'')))<5 THEN RAISE EXCEPTION 'settings_note_required'; END IF;
  cur := company_settings_current(org);
  IF decision='approve' AND coalesce(cur.version,0)<>v.base_version THEN
    UPDATE company_settings_versions SET status='superseded',decided_by=actor,decided_at=now(),decision_note='Settings changed after this proposal' WHERE id=vid;
    -- Persist the outcome (raising here would roll the update back).
    INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
    VALUES(org,actor,'staff','settings.superseded','company_settings',vid::text,jsonb_build_object('version',v.version,'currentVersion',coalesce(cur.version,0)),correlation);
    RETURN jsonb_build_object('id',vid,'status','superseded','already',false);
  END IF;
  target := CASE WHEN decision='approve' THEN 'approved' ELSE 'rejected' END;
  UPDATE company_settings_versions SET status=target,decided_by=actor,decided_at=now(),decision_note=trim(decision_reason) WHERE id=vid;
  IF target='approved' THEN PERFORM company_settings_apply(org,v.settings); END IF;
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
  VALUES(org,actor,'staff','settings.'||decision,'company_settings',vid::text,jsonb_build_object('version',v.version,'sections',v.changed_sections,'note',trim(decision_reason),'actorStaffId',me),correlation);
  RETURN jsonb_build_object('id',vid,'status',target,'already',false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION company_settings_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'settings_history_immutable'; END IF;
  IF OLD.status<>'proposed' OR (NEW.organization_id,NEW.version,NEW.base_version,NEW.settings,NEW.changed_sections,NEW.note,NEW.proposed_by,NEW.proposed_at,NEW.idempotency_key)
     IS DISTINCT FROM (OLD.organization_id,OLD.version,OLD.base_version,OLD.settings,OLD.changed_sections,OLD.note,OLD.proposed_by,OLD.proposed_at,OLD.idempotency_key)
  THEN RAISE EXCEPTION 'settings_history_immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER company_settings_versions_guard BEFORE UPDATE OR DELETE ON company_settings_versions FOR EACH ROW EXECUTE FUNCTION company_settings_history_guard();
