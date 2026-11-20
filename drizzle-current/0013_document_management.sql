ALTER TABLE "document_links" DROP CONSTRAINT "document_links_one_parent_check";--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_kind_check";--> statement-breakpoint
ALTER TABLE "document_links" ADD COLUMN "milestone_id" uuid;--> statement-breakpoint
ALTER TABLE "document_links" ADD COLUMN "staff_id" uuid;--> statement-breakpoint
ALTER TABLE "document_links" ADD COLUMN "company_record" boolean;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "archived_by" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "archive_reason" text;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_milestoneId_fk" FOREIGN KEY ("organization_id","milestone_id") REFERENCES "public"."project_milestones"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_staffId_fk" FOREIGN KEY ("organization_id","staff_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_links_project_idx" ON "document_links" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "document_links_client_idx" ON "document_links" USING btree ("organization_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_single_successor_uq" ON "documents" USING btree ("organization_id","supersedes_document_id") WHERE "documents"."supersedes_document_id" is not null;--> statement-breakpoint
CREATE INDEX "documents_family_idx" ON "documents" USING btree ("organization_id","family_id");--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_company_record_check" CHECK ("document_links"."company_record" is null or "document_links"."company_record");--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_one_parent_check" CHECK (num_nonnulls("document_links"."client_id", "document_links"."opportunity_id", "document_links"."quotation_version_id", "document_links"."invoice_id", "document_links"."project_id", "document_links"."task_id", "document_links"."expense_id", "document_links"."property_id", "document_links"."milestone_id", "document_links"."staff_id", "document_links"."company_record") = 1);--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_archive_check" CHECK ("documents"."archived_at" is null or "documents"."archived_by" is null or nullif(trim("documents"."archive_reason"), '') is not null);--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_kind_check" CHECK ("documents"."kind" in ('contract', 'quotation', 'invoice', 'receipt', 'drawing', 'brief', 'expense_receipt', 'property_document', 'other', 'permit', 'photo', 'report', 'policy', 'staff_record'));--> statement-breakpoint
-- Phase 1F document management. One authoritative document row per uploaded version; links
-- attach to the family root (coalesce(family_id,id)). Issued quotation/invoice artifacts and
-- expense evidence are "financial" and can never be revised or archived through this workspace.
CREATE OR REPLACE FUNCTION document_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'document_immutable'; END IF;
  -- Content and identity never change (the commercial artifact upsert rewrites identical values).
  IF (NEW.id,NEW.organization_id,NEW.name,NEW.kind,NEW.storage_key,NEW.mime_type,NEW.size_bytes,NEW.sha256,NEW.version,NEW.supersedes_document_id,NEW.created_by_clerk_user_id,NEW.created_at,NEW.family_id)
     IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.name,OLD.kind,OLD.storage_key,OLD.mime_type,OLD.size_bytes,OLD.sha256,OLD.version,OLD.supersedes_document_id,OLD.created_by_clerk_user_id,OLD.created_at,OLD.family_id)
  THEN RAISE EXCEPTION 'document_immutable'; END IF;
  -- Archival is one-way and recorded once.
  IF OLD.archived_at IS NOT NULL AND (NEW.archived_at,NEW.archived_by,NEW.archive_reason) IS DISTINCT FROM (OLD.archived_at,OLD.archived_by,OLD.archive_reason) THEN RAISE EXCEPTION 'document_immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER documents_guard BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION document_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION document_links_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'document_link_immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER document_links_immutable BEFORE UPDATE OR DELETE ON document_links FOR EACH ROW EXECUTE FUNCTION document_links_guard();
--> statement-breakpoint
-- True when any version of the family is a financial artifact or evidence.
CREATE OR REPLACE FUNCTION document_is_financial(org text, root uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM documents d WHERE d.organization_id=org AND coalesce(d.family_id,d.id)=root AND d.kind IN ('quotation','invoice','receipt','expense_receipt'))
      OR EXISTS(SELECT 1 FROM document_links l WHERE l.organization_id=org AND l.document_id=root AND (l.invoice_id IS NOT NULL OR l.quotation_version_id IS NOT NULL OR l.expense_id IS NOT NULL));
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION document_upload(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  staff uuid := finance_staff(org,actor); did uuid := (p->>'documentId')::uuid; existing documents; prev documents; root uuid;
  link_type text := p->>'linkType'; target uuid := nullif(p->>'linkId','')::uuid; ver integer := 1; cname text;
BEGIN
  SELECT * INTO existing FROM documents WHERE id=did AND organization_id=org;
  IF FOUND THEN
    IF existing.storage_key IS DISTINCT FROM p->>'storageKey' OR existing.sha256 IS DISTINCT FROM p->>'sha256' THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id',did,'version',existing.version,'already',true);
  END IF;
  -- Content-addressed key: an object can only ever hold the bytes it was registered with.
  IF p->>'storageKey' IS DISTINCT FROM 'documents/'||did::text||'/'||coalesce(p->>'sha256','') THEN RAISE EXCEPTION 'invalid_storage_key'; END IF;
  IF coalesce(p->>'mimeType','') NOT IN ('application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') THEN RAISE EXCEPTION 'invalid_document_type'; END IF;
  IF (p->>'sizeBytes')::bigint<=0 OR (p->>'sizeBytes')::bigint>20971520 THEN RAISE EXCEPTION 'document_size_limit'; END IF;
  IF coalesce(p->>'sha256','') !~ '^[0-9a-f]{64}$' OR length(trim(coalesce(p->>'name','')))=0 OR length(p->>'name')>200 THEN RAISE EXCEPTION 'invalid_document'; END IF;
  IF nullif(p->>'supersedesId','') IS NOT NULL THEN
    SELECT * INTO prev FROM documents WHERE id=(p->>'supersedesId')::uuid AND organization_id=org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_unavailable'; END IF;
    root := coalesce(prev.family_id,prev.id);
    IF prev.archived_at IS NOT NULL THEN RAISE EXCEPTION 'document_archived'; END IF;
    IF document_is_financial(org,root) THEN RAISE EXCEPTION 'financial_document_immutable'; END IF;
    IF EXISTS(SELECT 1 FROM documents WHERE organization_id=org AND supersedes_document_id=prev.id) THEN RAISE EXCEPTION 'document_revision_conflict'; END IF;
    BEGIN
      INSERT INTO documents(id,organization_id,name,kind,storage_key,mime_type,size_bytes,sha256,version,supersedes_document_id,family_id,created_by_clerk_user_id)
      VALUES(did,org,trim(p->>'name'),prev.kind,p->>'storageKey',p->>'mimeType',(p->>'sizeBytes')::bigint,p->>'sha256',prev.version+1,prev.id,root,actor);
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS cname = CONSTRAINT_NAME;
      RAISE EXCEPTION '%', CASE WHEN cname='documents_single_successor_uq' THEN 'document_revision_conflict' ELSE 'idempotency_conflict' END;
    END;
    ver := prev.version+1;
    INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
    VALUES(org,actor,'staff','document.revise','document',root::text,jsonb_build_object('documentId',did,'version',ver,'supersedes',prev.id,'name',trim(p->>'name'),'sha256',p->>'sha256','actorStaffId',staff),correlation);
    RETURN jsonb_build_object('id',did,'version',ver,'already',false);
  END IF;
  IF coalesce(p->>'kind','') NOT IN ('contract','drawing','brief','property_document','other','permit','photo','report','policy','staff_record') THEN RAISE EXCEPTION 'invalid_document_kind'; END IF;
  IF link_type='company' THEN target := NULL;
  ELSIF target IS NULL THEN RAISE EXCEPTION 'document_link_required';
  ELSIF link_type='client' THEN IF NOT EXISTS(SELECT 1 FROM clients WHERE id=target AND organization_id=org AND archived_at IS NULL) THEN RAISE EXCEPTION 'document_link_unavailable'; END IF;
  ELSIF link_type='project' THEN IF NOT EXISTS(SELECT 1 FROM projects WHERE id=target AND organization_id=org AND archived_at IS NULL) THEN RAISE EXCEPTION 'document_link_unavailable'; END IF;
  ELSIF link_type='task' THEN IF NOT EXISTS(SELECT 1 FROM tasks WHERE id=target AND organization_id=org) THEN RAISE EXCEPTION 'document_link_unavailable'; END IF;
  ELSIF link_type='milestone' THEN IF NOT EXISTS(SELECT 1 FROM project_milestones WHERE id=target AND organization_id=org) THEN RAISE EXCEPTION 'document_link_unavailable'; END IF;
  ELSIF link_type='staff' THEN IF NOT EXISTS(SELECT 1 FROM staff_memberships WHERE id=target AND organization_id=org) THEN RAISE EXCEPTION 'document_link_unavailable'; END IF;
  ELSE RAISE EXCEPTION 'document_link_required'; END IF;
  INSERT INTO documents(id,organization_id,name,kind,storage_key,mime_type,size_bytes,sha256,version,family_id,created_by_clerk_user_id)
  VALUES(did,org,trim(p->>'name'),p->>'kind',p->>'storageKey',p->>'mimeType',(p->>'sizeBytes')::bigint,p->>'sha256',1,did,actor);
  INSERT INTO document_links(organization_id,document_id,client_id,project_id,task_id,milestone_id,staff_id,company_record)
  VALUES(org,did,CASE WHEN link_type='client' THEN target END,CASE WHEN link_type='project' THEN target END,CASE WHEN link_type='task' THEN target END,
    CASE WHEN link_type='milestone' THEN target END,CASE WHEN link_type='staff' THEN target END,CASE WHEN link_type='company' THEN true END);
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
  VALUES(org,actor,'staff','document.upload','document',did::text,jsonb_build_object('name',trim(p->>'name'),'kind',p->>'kind','linkType',link_type,'linkId',target,'sizeBytes',(p->>'sizeBytes')::bigint,'sha256',p->>'sha256','actorStaffId',staff),correlation);
  RETURN jsonb_build_object('id',did,'version',1,'already',false);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION document_archive(org text, actor text, did uuid, reason text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE staff uuid := finance_staff(org,actor); d documents; root uuid; clean text := nullif(trim(coalesce(reason,'')),''); n integer;
BEGIN
  SELECT * INTO d FROM documents WHERE id=did AND organization_id=org;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_unavailable'; END IF;
  root := coalesce(d.family_id,d.id);
  -- Lock the whole family (root first) so archival and revision cannot interleave.
  PERFORM 1 FROM documents WHERE organization_id=org AND coalesce(family_id,id)=root ORDER BY version FOR UPDATE;
  IF document_is_financial(org,root) THEN RAISE EXCEPTION 'financial_document_immutable'; END IF;
  IF length(coalesce(clean,''))<5 OR length(clean)>1000 THEN RAISE EXCEPTION 'archive_reason_required'; END IF;
  UPDATE documents SET archived_at=now(),archived_by=actor,archive_reason=clean WHERE organization_id=org AND coalesce(family_id,id)=root AND archived_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n=0 THEN RETURN jsonb_build_object('id',root,'already',true); END IF;
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
  VALUES(org,actor,'staff','document.archive','document',root::text,jsonb_build_object('versions',n,'reason',clean,'actorStaffId',staff),correlation);
  RETURN jsonb_build_object('id',root,'already',false);
END $$;
--> statement-breakpoint
-- Hardening of division_enabled from 0012 (additive; 0012 itself is unchanged): an empty
-- divisions list means "not configured", so every division stays available.
CREATE OR REPLACE FUNCTION division_enabled(org text, d text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN cur.settings IS NULL OR jsonb_typeof(cur.settings->'divisions')<>'array' OR jsonb_array_length(cur.settings->'divisions')=0 THEN true
    ELSE EXISTS(SELECT 1 FROM jsonb_array_elements(cur.settings->'divisions') x WHERE x->>'key'=d AND (x->>'enabled')::boolean) END
  FROM (SELECT (SELECT settings FROM company_settings_versions WHERE organization_id=org AND status='approved' ORDER BY version DESC LIMIT 1) AS settings) cur;
$$;
