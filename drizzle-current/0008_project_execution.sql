ALTER TABLE "project_milestones" ADD COLUMN "deliverable" text;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD COLUMN "responsible_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD COLUMN "mandatory" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD COLUMN "completion_evidence" text;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD COLUMN "review_feedback" text;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "mandatory" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_responsible_staff_fk" FOREIGN KEY ("organization_id","responsible_staff_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE OR REPLACE FUNCTION project_execution_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE org text; pid uuid; state text; archived timestamptz;
BEGIN
  IF TG_OP='UPDATE' AND (OLD.project_id IS DISTINCT FROM NEW.project_id OR OLD.organization_id IS DISTINCT FROM NEW.organization_id) THEN RAISE EXCEPTION 'project_change_not_allowed'; END IF;
  IF TG_OP='DELETE' THEN org:=OLD.organization_id; pid:=OLD.project_id; ELSE org:=NEW.organization_id; pid:=NEW.project_id; END IF;
  IF pid IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  SELECT status,archived_at INTO state,archived FROM projects WHERE id=pid AND organization_id=org FOR UPDATE;
  IF NOT FOUND OR archived IS NOT NULL OR state NOT IN ('planned','active','on_hold') THEN RAISE EXCEPTION 'project_not_open'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
--> statement-breakpoint
CREATE TRIGGER project_task_guard BEFORE INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION project_execution_guard();
--> statement-breakpoint
CREATE TRIGGER project_milestone_guard BEFORE INSERT OR UPDATE OR DELETE ON project_milestones FOR EACH ROW EXECUTE FUNCTION project_execution_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION project_execution_transition(org text, actor text, pid uuid, target text, reason text, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE current_project projects; open_tasks int; open_milestones int;
BEGIN
  SELECT * INTO current_project FROM projects WHERE id=pid AND organization_id=org FOR UPDATE;
  IF NOT FOUND OR current_project.archived_at IS NOT NULL THEN RAISE EXCEPTION 'project_unavailable'; END IF;
  IF current_project.status=target THEN RETURN jsonb_build_object('id',pid,'already',true); END IF;
  IF NOT ((current_project.status='active' AND target IN ('on_hold','completed','cancelled')) OR (current_project.status='on_hold' AND target IN ('active','completed','cancelled')) OR (current_project.status='planned' AND target='cancelled')) THEN RAISE EXCEPTION 'invalid_project_transition'; END IF;
  IF target IN ('active','completed') AND current_project.quotation_version_id IS NULL THEN RAISE EXCEPTION 'confirmed_quotation_required'; END IF;
  IF target IN ('completed','cancelled') THEN
    SELECT count(*) INTO open_tasks FROM tasks WHERE organization_id=org AND project_id=pid AND mandatory AND status NOT IN ('completed','cancelled');
    SELECT count(*) INTO open_milestones FROM project_milestones WHERE organization_id=org AND project_id=pid AND mandatory AND status NOT IN ('completed','cancelled');
    IF (open_tasks>0 OR open_milestones>0) AND length(trim(coalesce(reason,'')))<10 THEN RAISE EXCEPTION 'project_exception_required'; END IF;
  END IF;
  UPDATE projects SET status=target,completed_at=CASE WHEN target='completed' THEN now() ELSE NULL END,updated_at=now() WHERE id=pid AND organization_id=org;
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
  VALUES(org,actor,'staff','project.transition','project',pid::text,jsonb_build_object('from',current_project.status,'to',target,'openTasks',coalesce(open_tasks,0),'openMilestones',coalesce(open_milestones,0),'exceptionReason',nullif(trim(coalesce(reason,'')),'')),correlation);
  RETURN jsonb_build_object('id',pid,'already',false);
END $$;
