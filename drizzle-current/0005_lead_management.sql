CREATE TABLE "lead_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "assigned_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "division" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "follow_up_on" date;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "follow_up_notes" text;--> statement-breakpoint
ALTER TABLE "lead_activity" ADD CONSTRAINT "lead_activity_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activity" ADD CONSTRAINT "lead_activity_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_activity_lead_idx" ON "lead_activity" USING btree ("organization_id","lead_id","created_at");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_staff_id_staff_memberships_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."staff_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE OR REPLACE FUNCTION lead_created_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    INSERT INTO lead_activity(organization_id,lead_id,actor,action,changes)
    VALUES(NEW.organization_id,NEW.id,'website','created',jsonb_build_object('source',NEW.type));
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER lead_created_activity_trigger AFTER INSERT ON leads FOR EACH ROW EXECUTE FUNCTION lead_created_activity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION lead_update(org text, actor text, lead uuid, p jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE oldrow leads;
BEGIN
  SELECT * INTO oldrow FROM leads WHERE id=lead AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead_unavailable'; END IF;
  IF p->>'status' NOT IN ('new','contacted','scheduled','qualified','closed_won','closed_lost') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF nullif(p->>'division','') IS NOT NULL AND p->>'division' NOT IN ('estates','architecture','painting','interiors','tech') THEN RAISE EXCEPTION 'invalid_division'; END IF;
  IF nullif(p->>'assignedStaffId','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff_memberships WHERE id=(p->>'assignedStaffId')::uuid AND organization_id=org AND status='active') THEN RAISE EXCEPTION 'invalid_assignee'; END IF;
  UPDATE leads SET status=p->>'status',admin_notes=nullif(p->>'notes',''),division=nullif(p->>'division',''),assigned_staff_id=nullif(p->>'assignedStaffId','')::uuid,follow_up_on=nullif(p->>'followUpOn','')::date,follow_up_notes=nullif(p->>'followUpNotes','') WHERE id=lead AND organization_id=org;
  IF oldrow.status IS DISTINCT FROM p->>'status' THEN INSERT INTO lead_activity(organization_id,lead_id,actor,action,changes) VALUES(org,lead,actor,'status_changed',jsonb_build_object('from',oldrow.status,'to',p->>'status')); END IF;
  IF oldrow.assigned_staff_id IS DISTINCT FROM nullif(p->>'assignedStaffId','')::uuid THEN INSERT INTO lead_activity(organization_id,lead_id,actor,action,changes) VALUES(org,lead,actor,'assignment_changed',jsonb_build_object('from',oldrow.assigned_staff_id,'to',nullif(p->>'assignedStaffId',''))); END IF;
  IF oldrow.follow_up_on IS DISTINCT FROM nullif(p->>'followUpOn','')::date OR oldrow.follow_up_notes IS DISTINCT FROM nullif(p->>'followUpNotes','') THEN INSERT INTO lead_activity(organization_id,lead_id,actor,action,changes) VALUES(org,lead,actor,'follow_up_changed',jsonb_build_object('from',oldrow.follow_up_on,'to',nullif(p->>'followUpOn',''),'notes',nullif(p->>'followUpNotes',''))); END IF;
  IF oldrow.admin_notes IS DISTINCT FROM nullif(p->>'notes','') OR oldrow.division IS DISTINCT FROM nullif(p->>'division','') THEN INSERT INTO lead_activity(organization_id,lead_id,actor,action,changes) VALUES(org,lead,actor,'details_changed',jsonb_build_object('notes',nullif(p->>'notes',''),'division',nullif(p->>'division',''))); END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION lead_convert(org text, actor text, lead uuid, existing uuid, client_data jsonb, correlation text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE source leads; cid uuid;
BEGIN
  SELECT * INTO source FROM leads WHERE id=lead AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead_unavailable'; END IF;
  SELECT client_id INTO cid FROM crm_source_links WHERE organization_id=org AND lead_id=lead;
  IF FOUND THEN IF cid IS NULL OR (existing IS NOT NULL AND existing<>cid) THEN RAISE EXCEPTION 'lead_already_linked'; END IF; RETURN cid; END IF;
  IF source.status<>'qualified' THEN RAISE EXCEPTION 'lead_not_qualified'; END IF;
  IF existing IS NULL THEN
    IF client_data ? 'id' THEN RAISE EXCEPTION 'invalid_client_data'; END IF;
    IF EXISTS (SELECT 1 FROM clients c WHERE c.organization_id=org AND (lower(c.display_name)=lower(source.full_name) OR EXISTS (SELECT 1 FROM client_contacts cc WHERE cc.organization_id=org AND cc.client_id=c.id AND ((nullif(source.email,'') IS NOT NULL AND lower(cc.email)=lower(source.email)) OR (nullif(source.phone,'') IS NOT NULL AND cc.phone=source.phone))))) THEN RAISE EXCEPTION 'possible_duplicate'; END IF;
    cid := sales_client(org,actor,client_data,correlation);
  ELSE
    SELECT id INTO cid FROM clients WHERE id=existing AND organization_id=org AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'client_unavailable'; END IF;
  END IF;
  INSERT INTO crm_source_links(organization_id,lead_id,client_id) VALUES(org,lead,cid);
  UPDATE leads SET status='closed_won' WHERE id=lead AND organization_id=org;
  INSERT INTO lead_activity(organization_id,lead_id,actor,action,changes) VALUES(org,lead,actor,'converted',jsonb_build_object('clientId',cid));
  RETURN cid;
END $$;
