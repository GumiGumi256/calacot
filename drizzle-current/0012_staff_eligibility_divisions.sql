ALTER TABLE "staff_memberships" ADD COLUMN "employee_eligibility" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD COLUMN "eligibility_decided_by" text;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD COLUMN "eligibility_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_eligibility_check" CHECK ("staff_memberships"."employee_eligibility" in ('pending', 'approved', 'revoked'));--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_eligibility_decision_check" CHECK ("staff_memberships"."employee_eligibility" = 'pending' or ("staff_memberships"."eligibility_decided_by" is not null and "staff_memberships"."eligibility_decided_at" is not null));--> statement-breakpoint
-- Phase 1E stabilization. Employee eligibility is administrator-controlled and only narrows
-- access (Clerk `org:member` users receive no permissions until approved).
CREATE OR REPLACE FUNCTION staff_set_eligibility(org text, actor text, sid uuid, target text, reason text, expected integer, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE me uuid := finance_staff(org,actor); s staff_memberships; clean text := nullif(trim(coalesce(reason,'')),'');
BEGIN
  IF target NOT IN ('approved','revoked') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO s FROM staff_memberships WHERE id=sid AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_unavailable'; END IF;
  IF s.clerk_user_id=actor THEN RAISE EXCEPTION 'self_administration_denied'; END IF;
  IF s.profile_version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_staff_record'; END IF;
  IF target='approved' AND s.status<>'active' THEN RAISE EXCEPTION 'invalid_staff_transition'; END IF;
  IF s.employee_eligibility=target THEN RAISE EXCEPTION 'invalid_staff_transition'; END IF;
  IF length(coalesce(clean,''))<5 OR length(clean)>1000 THEN RAISE EXCEPTION 'status_reason_required'; END IF;
  UPDATE staff_memberships SET employee_eligibility=target,eligibility_decided_by=actor,eligibility_decided_at=now(),profile_version=profile_version+1,updated_at=now() WHERE id=sid AND organization_id=org;
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
  VALUES(org,actor,'staff','staff.eligibility_'||CASE WHEN target='approved' THEN 'approve' ELSE 'revoke' END,'staff_membership',sid::text,jsonb_build_object('from',s.employee_eligibility,'to',target,'reason',clean,'actorStaffId',me),correlation);
  RETURN jsonb_build_object('id',sid,'eligibility',target,'version',s.profile_version+1);
END $$;
--> statement-breakpoint
-- Division availability from approved company settings; with no saved settings every division is available.
CREATE OR REPLACE FUNCTION division_enabled(org text, d text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN cur.settings IS NULL OR jsonb_typeof(cur.settings->'divisions')<>'array' THEN true
    ELSE EXISTS(SELECT 1 FROM jsonb_array_elements(cur.settings->'divisions') x WHERE x->>'key'=d AND (x->>'enabled')::boolean) END
  FROM (SELECT (SELECT settings FROM company_settings_versions WHERE organization_id=org AND status='approved' ORDER BY version DESC LIMIT 1) AS settings) cur;
$$;
--> statement-breakpoint
-- Rejects new records in, and moves into, a disabled division. Existing records that already
-- belong to a disabled division keep working (their division is not changing).
CREATE OR REPLACE FUNCTION division_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.division IS NULL OR NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.division IS NOT DISTINCT FROM OLD.division THEN RETURN NEW; END IF;
  IF NOT division_enabled(NEW.organization_id,NEW.division) THEN RAISE EXCEPTION 'division_disabled'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER expenses_division_guard BEFORE INSERT OR UPDATE OF division ON expenses FOR EACH ROW EXECUTE FUNCTION division_guard();
--> statement-breakpoint
CREATE TRIGGER projects_division_guard BEFORE INSERT OR UPDATE OF division ON projects FOR EACH ROW EXECUTE FUNCTION division_guard();
--> statement-breakpoint
CREATE TRIGGER leads_division_guard BEFORE INSERT OR UPDATE OF division ON leads FOR EACH ROW EXECUTE FUNCTION division_guard();
--> statement-breakpoint
CREATE TRIGGER staff_memberships_division_guard BEFORE INSERT OR UPDATE OF division ON staff_memberships FOR EACH ROW EXECUTE FUNCTION division_guard();
