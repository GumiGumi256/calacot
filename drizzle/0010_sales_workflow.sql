ALTER TABLE "projects" ADD CONSTRAINT "projects_org_client_uq" UNIQUE("organization_id","id","client_id");
--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"intent_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"state" text NOT NULL,
	"code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_id" text,
	"document_id" uuid,
	"first_attempt_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"complained_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"error_code" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_intents_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "delivery_provider_uq" UNIQUE("channel","provider_id"),
	CONSTRAINT "delivery_channel_check" CHECK ("delivery_intents"."channel" in ('email','whatsapp'))
);
--> statement-breakpoint
CREATE TABLE "sales_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_webhook_inbox" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "client_contacts" ADD COLUMN "whatsapp_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD COLUMN "whatsapp_consent_source" text;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD COLUMN "delivery_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD COLUMN "acceptance_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD COLUMN "document_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "billing_purpose" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "billing_schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "document_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempt_intent_fk" FOREIGN KEY ("organization_id","intent_id") REFERENCES "public"."delivery_intents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_intents" ADD CONSTRAINT "delivery_intents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_intents" ADD CONSTRAINT "delivery_document_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_entity_idx" ON "delivery_intents" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_contact_fk" FOREIGN KEY ("organization_id","delivery_contact_id") REFERENCES "public"."client_contacts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_project_client_fk" FOREIGN KEY ("organization_id","project_id","client_id") REFERENCES "public"."projects"("organization_id","id","client_id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_client_fk" FOREIGN KEY ("organization_id","project_id","client_id") REFERENCES "public"."projects"("organization_id","id","client_id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_billing_purpose_uq" ON "invoices" USING btree ("organization_id","quotation_version_id","billing_purpose") WHERE "invoices"."quotation_version_id" is not null and "invoices"."billing_purpose" is not null;--> statement-breakpoint

--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
-- BEGIN SALES SERVICES
-- Application calls these parameterized functions through the existing Neon HTTP driver.
-- Each call is one PostgreSQL transaction. Functions are INVOKER, never SECURITY DEFINER.
CREATE OR REPLACE FUNCTION sales_number(org text, kind text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n integer; counter_period text := to_char(now() AT TIME ZONE 'Africa/Kampala','YYYY'); prefix text;
BEGIN
  prefix := CASE kind WHEN 'quotation' THEN 'Q' WHEN 'invoice' THEN 'I' WHEN 'project' THEN 'P' WHEN 'receipt' THEN 'R' WHEN 'credit_note' THEN 'C' END;
  IF prefix IS NULL THEN RAISE EXCEPTION 'invalid_number_type'; END IF;
  INSERT INTO document_counters(organization_id,document_type,period,next_value) VALUES(org,kind,counter_period,2)
  ON CONFLICT(organization_id,document_type,period) DO UPDATE SET next_value=document_counters.next_value+1,updated_at=now() RETURNING next_value-1 INTO n;
  RETURN 'CAL-'||prefix||'-'||counter_period||'-'||lpad(n::text,6,'0');
END $$;

CREATE OR REPLACE FUNCTION sales_audit(org text, actor text, action text, entity text, eid text, changes jsonb, correlation text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
  VALUES(org,actor,'staff',action,entity,eid,changes,correlation);
$$;

CREATE OR REPLACE FUNCTION sales_intent(org text, entity text, eid uuid, channel text, recipient text, payload jsonb, correlation text, logical_key text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE iid uuid := gen_random_uuid();
BEGIN
  INSERT INTO delivery_intents(id,organization_id,entity_type,entity_id,channel,recipient,payload,correlation_id)
  VALUES(iid,org,entity,eid,channel,recipient,payload,correlation);
  INSERT INTO automation_outbox(organization_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  VALUES(org,'sales.delivery',entity,eid::text,jsonb_build_object('intentId',iid),logical_key);
  RETURN iid;
END $$;

CREATE OR REPLACE FUNCTION sales_client(org text, actor text, p jsonb, correlation text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE cid uuid := coalesce((p->>'id')::uuid,gen_random_uuid()); c jsonb;
BEGIN
  IF p ? 'id' THEN
    PERFORM 1 FROM clients WHERE id=cid AND organization_id=org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'record_unavailable'; END IF;
    PERFORM sales_audit(org,actor,'client.edit','client',cid::text,jsonb_build_object('before',(SELECT jsonb_build_object('name',display_name,'kind',kind) FROM clients WHERE id=cid),'after',jsonb_build_object('name',p->>'displayName','kind',p->>'kind'),'recipientChanged',true),correlation);
    UPDATE clients SET kind=p->>'kind',display_name=p->>'displayName',legal_name=nullif(p->>'legalName',''),tax_identifier=nullif(p->>'taxIdentifier',''),billing_address=p->'billingAddress',notes=p->>'notes',updated_at=now() WHERE id=cid AND organization_id=org;
    UPDATE client_contacts SET is_primary=false WHERE client_id=cid AND organization_id=org;
  ELSE
    INSERT INTO clients(id,organization_id,kind,display_name,legal_name,tax_identifier,billing_address,notes)
    VALUES(cid,org,p->>'kind',p->>'displayName',nullif(p->>'legalName',''),nullif(p->>'taxIdentifier',''),p->'billingAddress',p->>'notes');
    PERFORM sales_audit(org,actor,'client.create','client',cid::text,jsonb_build_object('name',p->>'displayName'),correlation);
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p->'contacts') LOOP
    IF c ? 'id' THEN
      UPDATE client_contacts SET name=c->>'name',email=nullif(c->>'email',''),phone=nullif(c->>'phone',''),is_primary=(c->>'isPrimary')::boolean,
        whatsapp_consent_at=coalesce(nullif(c->>'consentAt','')::timestamptz,whatsapp_consent_at),whatsapp_consent_source=coalesce(nullif(c->>'consentSource',''),whatsapp_consent_source),updated_at=now()
        WHERE id=(c->>'id')::uuid AND client_id=cid AND organization_id=org;
      IF NOT FOUND THEN RAISE EXCEPTION 'contact_unavailable'; END IF;
    ELSE
      INSERT INTO client_contacts(organization_id,client_id,name,email,phone,is_primary,whatsapp_consent_at,whatsapp_consent_source)
      VALUES(org,cid,c->>'name',nullif(c->>'email',''),nullif(c->>'phone',''),(c->>'isPrimary')::boolean,nullif(c->>'consentAt','')::timestamptz,nullif(c->>'consentSource',''));
    END IF;
  END LOOP;
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION sales_project(org text, actor text, p jsonb, correlation text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE pid uuid := gen_random_uuid();
BEGIN
  PERFORM 1 FROM clients WHERE id=(p->>'clientId')::uuid AND organization_id=org AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'client_unavailable'; END IF;
  INSERT INTO projects(id,organization_id,client_id,manager_id,code,name,division,currency,scope,starts_on,due_on)
  VALUES(pid,org,(p->>'clientId')::uuid,nullif(p->>'managerId','')::uuid,sales_number(org,'project'),p->>'name',p->>'division',p->>'currency',p->>'scope',nullif(p->>'startsOn','')::date,nullif(p->>'dueOn','')::date);
  PERFORM sales_audit(org,actor,'project.create','project',pid::text,jsonb_build_object('status','planned'),correlation);
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION sales_quote_save(org text, actor text, p jsonb, correlation text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE qid uuid := coalesce((p->>'id')::uuid,gen_random_uuid()); vid uuid; v quotation_versions; line jsonb; schedule jsonb; pos integer := 0; sub numeric:=0; disc numeric:=0; tax numeric:=0; calculated_total numeric:=0;
BEGIN
  PERFORM 1 FROM clients WHERE id=(p->>'clientId')::uuid AND organization_id=org AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'client_unavailable'; END IF;
  PERFORM 1 FROM projects WHERE id=(p->>'projectId')::uuid AND organization_id=org AND client_id=(p->>'clientId')::uuid AND status='planned' AND archived_at IS NULL AND quotation_version_id IS NULL AND division=p->>'division' AND currency=p->>'currency' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'eligible_project_required'; END IF;
  PERFORM 1 FROM client_contacts WHERE id=(p->>'contactId')::uuid AND organization_id=org AND client_id=(p->>'clientId')::uuid AND email IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'delivery_contact_required'; END IF;
  IF p ? 'id' THEN
    PERFORM 1 FROM quotations WHERE id=qid AND organization_id=org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'record_unavailable'; END IF;
    SELECT * INTO v FROM quotation_versions WHERE quotation_id=qid AND organization_id=org ORDER BY version DESC LIMIT 1 FOR UPDATE;
    IF v.status<>'draft' OR v.revision<>(p->>'revision')::int THEN RAISE EXCEPTION 'draft_conflict'; END IF;
    vid:=v.id;
    UPDATE quotations SET client_id=(p->>'clientId')::uuid,project_id=(p->>'projectId')::uuid,title=p->>'title',division=p->>'division',updated_at=now() WHERE id=qid;
    DELETE FROM quotation_items WHERE quotation_version_id=vid AND organization_id=org;
    DELETE FROM quotation_payment_schedules WHERE quotation_version_id=vid AND organization_id=org;
  ELSE
    INSERT INTO quotations(id,organization_id,client_id,project_id,title,division) VALUES(qid,org,(p->>'clientId')::uuid,(p->>'projectId')::uuid,p->>'title',p->>'division');
    vid:=gen_random_uuid();
    INSERT INTO quotation_versions(id,organization_id,quotation_id,version,customer_snapshot,issuer_snapshot,scope,terms) VALUES(vid,org,qid,1,'{}','{}',p->>'scope',p->>'terms');
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p->'items') LOOP
    INSERT INTO quotation_items(organization_id,quotation_version_id,position,description,unit,quantity,unit_price,discount_amount,tax_rate,subtotal,tax_amount,total)
    VALUES(org,vid,pos,line->>'description',line->>'unit',(line->>'quantity')::numeric,(line->>'unitPrice')::numeric,(line->>'discountAmount')::numeric,(line->>'taxRate')::numeric,(line->>'subtotal')::numeric,(line->>'taxAmount')::numeric,(line->>'total')::numeric);
    pos:=pos+1; sub:=sub+(line->>'subtotal')::numeric; disc:=disc+(line->>'discountAmount')::numeric; tax:=tax+(line->>'taxAmount')::numeric; calculated_total:=calculated_total+(line->>'total')::numeric;
  END LOOP;
  IF pos=0 OR calculated_total<=0 THEN RAISE EXCEPTION 'invalid_totals'; END IF;
  pos:=0;
  FOR schedule IN SELECT value FROM jsonb_array_elements(p->'schedules') LOOP
    INSERT INTO quotation_payment_schedules(organization_id,quotation_version_id,position,label,amount,due_at)
    VALUES(org,vid,pos,schedule->>'label',(schedule->>'amount')::numeric,nullif(schedule->>'dueAt','')::timestamptz); pos:=pos+1;
  END LOOP;
  IF pos=0 OR (SELECT sum(amount) FROM quotation_payment_schedules WHERE quotation_version_id=vid)<>calculated_total THEN RAISE EXCEPTION 'schedule_total_mismatch'; END IF;
  UPDATE quotation_versions SET revision=revision+1,delivery_contact_id=(p->>'contactId')::uuid,scope=p->>'scope',deliverables=p->'deliverables',exclusions=p->'exclusions',terms=p->>'terms',currency=p->>'currency',valid_until=(p->>'validUntil')::timestamptz,subtotal=sub,discount_amount=disc,tax_amount=tax,total=calculated_total,updated_at=now() WHERE id=vid;
  PERFORM sales_audit(org,actor,'quotation.save','quotation',qid::text,jsonb_build_object('revision',coalesce(v.revision,0)+1),correlation);
  RETURN qid;
END $$;

CREATE OR REPLACE FUNCTION sales_quote_command(org text, actor text, qid uuid, vid uuid, revision integer, cmd text, p jsonb, cfg jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE q quotations; v quotation_versions; pr projects; c clients; contact client_contacts; issuer organizations; num text; snap jsonb; iid uuid; nv uuid; bill numeric; sub numeric; disc numeric; tax numeric; schedule_id uuid;
BEGIN
  SELECT * INTO q FROM quotations WHERE id=qid AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'record_unavailable'; END IF;
  SELECT * INTO v FROM quotation_versions WHERE id=vid AND quotation_id=qid AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_unavailable'; END IF;
  IF cmd='confirm' AND v.status='accepted' THEN
    SELECT id INTO iid FROM invoices WHERE organization_id=org AND quotation_version_id=vid AND billing_purpose='initial';
    IF iid IS NULL THEN RAISE EXCEPTION 'accepted_invoice_missing'; END IF;
    RETURN jsonb_build_object('invoiceId',iid);
  END IF;
  IF cmd='send' AND v.status='sent' THEN RETURN jsonb_build_object('id',qid); END IF;
  IF v.version<>(SELECT max(version) FROM quotation_versions WHERE quotation_id=qid AND organization_id=org) THEN RAISE EXCEPTION 'stale_version'; END IF;
  SELECT * INTO pr FROM projects WHERE id=q.project_id AND organization_id=org AND client_id=q.client_id FOR UPDATE;
  IF NOT FOUND OR pr.archived_at IS NOT NULL OR pr.status<>'planned' OR pr.quotation_version_id IS NOT NULL THEN RAISE EXCEPTION 'eligible_project_required'; END IF;
  SELECT * INTO c FROM clients WHERE id=q.client_id AND organization_id=org FOR UPDATE;
  IF c.archived_at IS NOT NULL THEN RAISE EXCEPTION 'client_archived'; END IF;
  IF cmd='send' THEN
    IF v.status<>'draft' OR revision IS NULL OR v.revision<>revision THEN RAISE EXCEPTION 'draft_conflict'; END IF;
    IF v.valid_until IS NULL OR v.valid_until<=now() THEN RAISE EXCEPTION 'quotation_expired'; END IF;
    IF pr.currency<>v.currency OR pr.division<>q.division OR v.total<=0 OR NOT EXISTS(SELECT 1 FROM quotation_items WHERE quotation_version_id=vid AND organization_id=org)
      OR v.total<>(SELECT sum(total) FROM quotation_items WHERE quotation_version_id=vid AND organization_id=org)
      OR v.subtotal<>(SELECT sum(subtotal) FROM quotation_items WHERE quotation_version_id=vid AND organization_id=org)
      OR v.discount_amount<>(SELECT sum(discount_amount) FROM quotation_items WHERE quotation_version_id=vid AND organization_id=org)
      OR v.tax_amount<>(SELECT sum(tax_amount) FROM quotation_items WHERE quotation_version_id=vid AND organization_id=org)
      OR EXISTS(SELECT 1 FROM quotation_items WHERE quotation_version_id=vid AND tax_rate<>coalesce((cfg->>'taxRate')::numeric,0))
      OR v.total<>coalesce((SELECT sum(amount) FROM quotation_payment_schedules WHERE quotation_version_id=vid AND organization_id=org),0) THEN RAISE EXCEPTION 'invalid_totals'; END IF;
    SELECT * INTO contact FROM client_contacts WHERE id=v.delivery_contact_id AND organization_id=org AND client_id=c.id FOR UPDATE;
    IF NOT FOUND OR contact.email IS NULL THEN RAISE EXCEPTION 'delivery_contact_required'; END IF;
    SELECT * INTO issuer FROM organizations WHERE id=org;
    IF nullif(issuer.legal_name,'') IS NULL THEN RAISE EXCEPTION 'issuer_configuration_missing'; END IF;
    num:=coalesce(q.number,sales_number(org,'quotation'));
    snap:=jsonb_build_object('type','quotation','number',num,'version',v.version,'title',q.title,'project',pr.name,'clientId',c.id,'projectId',pr.id,'quotationVersionId',vid,'currency',v.currency,
      'customer',jsonb_build_object('name',coalesce(nullif(c.legal_name,''),c.display_name),'email',contact.email,'address',concat_ws(', ',c.billing_address->>'line1',c.billing_address->>'city',c.billing_address->>'country'),'taxIdentifier',coalesce(c.tax_identifier,'')),
      'issuer',jsonb_build_object('legalName',issuer.legal_name,'address',coalesce(issuer.billing_address,''),'email',coalesce(issuer.email,''),'phone',coalesce(issuer.phone,''),'taxIdentifier',coalesce(issuer.tax_identifier,'')),
      'scope',v.scope,'deliverables',v.deliverables,'exclusions',v.exclusions,'terms',v.terms,'instructions',cfg->>'instructions','brand',cfg->'brand','items',
      (SELECT jsonb_agg(jsonb_build_object('description',description,'unit',unit,'position',position,'quantity',quantity::text,'unitPrice',unit_price::text,'discountAmount',discount_amount::text,'taxRate',tax_rate::text,'subtotal',subtotal::text,'taxAmount',tax_amount::text,'total',total::text) ORDER BY position) FROM quotation_items WHERE quotation_version_id=vid),
      'schedules',(SELECT jsonb_agg(jsonb_build_object('label',label,'amount',amount::text,'dueAt',coalesce(due_at::text,'')) ORDER BY position) FROM quotation_payment_schedules WHERE quotation_version_id=vid),
      'subtotal',v.subtotal::text,'discountAmount',v.discount_amount::text,'taxAmount',v.tax_amount::text,'total',v.total::text,'issuedAt',now(),'due',v.valid_until,'billingPolicy',cfg->>'policy','billingPurpose','quotation','invoiceDueDays',(cfg->>'dueDays')::int);
    UPDATE quotations SET number=num,updated_at=now() WHERE id=qid;
    UPDATE quotation_versions SET status='sent',sent_at=now(),document_snapshot=snap,customer_snapshot=snap->'customer',issuer_snapshot=snap->'issuer',revision=v.revision+1,updated_at=now() WHERE id=vid;
    PERFORM sales_intent(org,'quotation',vid,'email',contact.email,jsonb_build_object('document',snap,'from',cfg->>'from','replyTo',cfg->>'replyTo','template','quotation-v1'),correlation,'sales/'||org||'/quotation/'||vid||'/email');
  ELSIF cmd='confirm' THEN
    IF v.status<>'sent' OR v.valid_until<=now() OR v.document_snapshot IS NULL THEN RAISE EXCEPTION 'quotation_not_confirmable'; END IF;
    IF nullif(p->>'evidence','') IS NULL OR nullif(p->>'source','') IS NULL OR nullif(p->>'acceptedBy','') IS NULL OR (p->>'acceptedAt')::timestamptz>now() OR (p->>'acceptedAt')::timestamptz<v.sent_at THEN RAISE EXCEPTION 'acceptance_evidence_required'; END IF;
    snap:=v.document_snapshot;
    IF snap->>'billingPolicy'='deposit' THEN
      IF v.tax_amount<>0 THEN RAISE EXCEPTION 'deposit_tax_policy_required'; END IF;
      SELECT id,amount INTO schedule_id,bill FROM quotation_payment_schedules WHERE quotation_version_id=vid ORDER BY position LIMIT 1;
      -- A deposit is its own exact line, never prorated rounding of accepted line items.
      sub:=bill; disc:=0; tax:=0;
    ELSE bill:=v.total; sub:=v.subtotal; disc:=v.discount_amount; tax:=v.tax_amount; END IF;
    iid:=gen_random_uuid(); num:=sales_number(org,'invoice');
    snap:=snap||jsonb_build_object('type','invoice','number',num,'issuedAt',now(),'due',(current_date+coalesce((snap->>'invoiceDueDays')::int,14))::text,'billingPurpose','initial','subtotal',sub::text,'discountAmount',disc::text,'taxAmount',tax::text,'total',bill::text);
    IF schedule_id IS NOT NULL THEN
      snap:=snap||jsonb_build_object('acceptedItems',v.document_snapshot->'items','items',jsonb_build_array(jsonb_build_object('description','Initial deposit per accepted payment schedule','unit','deposit','quantity','1','unitPrice',bill::text,'discountAmount','0.00','taxRate','0.00','position',0,'subtotal',bill::text,'taxAmount','0.00','total',bill::text)));
    END IF;
    UPDATE quotation_versions SET status='accepted',accepted_at=(p->>'acceptedAt')::timestamptz,accepted_by_name=p->>'acceptedBy',acceptance_evidence=p,updated_at=now() WHERE id=vid;
    UPDATE projects SET quotation_version_id=vid,budget=v.total,updated_at=now() WHERE id=pr.id;
    INSERT INTO invoices(id,organization_id,client_id,project_id,quotation_version_id,billing_purpose,billing_schedule_id,number,status,customer_snapshot,issuer_snapshot,document_snapshot,currency,subtotal,discount_amount,tax_amount,total,issued_at,due_on,terms,notes)
    VALUES(iid,org,c.id,pr.id,vid,'initial',schedule_id,num,'draft',v.customer_snapshot,v.issuer_snapshot,snap,v.currency,sub,disc,tax,bill,now(),(snap->>'due')::date,v.terms,CASE WHEN schedule_id IS NULL THEN 'Full agreed amount' ELSE 'Initial deposit; remaining milestones require explicit billing' END);
    IF schedule_id IS NULL THEN
      INSERT INTO invoice_items(organization_id,invoice_id,position,description,unit,quantity,unit_price,discount_amount,tax_rate,subtotal,tax_amount,total)
      SELECT org,iid,position,description,unit,quantity,unit_price,discount_amount,tax_rate,subtotal,tax_amount,total FROM quotation_items WHERE quotation_version_id=vid;
    ELSE INSERT INTO invoice_items(organization_id,invoice_id,position,description,unit,quantity,unit_price,discount_amount,tax_rate,subtotal,tax_amount,total) VALUES(org,iid,0,'Initial deposit per accepted payment schedule','deposit',1,bill,0,0,bill,0,bill); END IF;
    UPDATE invoices SET status='issued' WHERE id=iid;
    PERFORM sales_intent(org,'invoice',iid,'email',snap->'customer'->>'email',jsonb_build_object('document',snap,'from',cfg->>'from','replyTo',cfg->>'replyTo','template','invoice-v1'),correlation,'sales/'||org||'/invoice/'||iid||'/email');
    SELECT * INTO contact FROM client_contacts WHERE id=v.delivery_contact_id AND organization_id=org AND client_id=c.id;
    PERFORM sales_intent(org,'invoice',iid,'whatsapp',coalesce(contact.phone,''),jsonb_build_object('client',snap->'customer'->>'name','project',pr.name,'quotation',q.number,'invoice',num,'consentAt',contact.whatsapp_consent_at,'consentSource',contact.whatsapp_consent_source,'template',cfg->>'template','language',cfg->>'language','approved',cfg->'templateApproved'),correlation,'sales/'||org||'/invoice/'||iid||'/whatsapp');
    PERFORM sales_audit(org,actor,'invoice.issue','invoice',iid::text,jsonb_build_object('total',bill,'currency',v.currency,'billingPolicy',snap->>'billingPolicy'),correlation);
  ELSIF cmd='decline' THEN
    IF v.status<>'sent' OR nullif(p->>'reason','') IS NULL THEN RAISE EXCEPTION 'decline_reason_required'; END IF;
    UPDATE quotation_versions SET status='declined',declined_at=now(),acceptance_evidence=jsonb_build_object('reason',p->>'reason'),updated_at=now() WHERE id=vid;
  ELSIF cmd='revise' THEN
    IF v.status NOT IN ('sent','declined','expired') THEN RAISE EXCEPTION 'revision_not_permitted'; END IF;
    UPDATE quotation_versions SET status='superseded',updated_at=now() WHERE id=vid;
    nv:=gen_random_uuid();
    INSERT INTO quotation_versions(id,organization_id,quotation_id,version,customer_snapshot,issuer_snapshot,delivery_contact_id,scope,deliverables,exclusions,terms,currency,subtotal,discount_amount,tax_amount,total,valid_until)
    VALUES(nv,org,qid,v.version+1,'{}','{}',v.delivery_contact_id,v.scope,v.deliverables,v.exclusions,v.terms,v.currency,v.subtotal,v.discount_amount,v.tax_amount,v.total,now()+interval '30 days');
    INSERT INTO quotation_items(organization_id,quotation_version_id,position,description,unit,quantity,unit_price,discount_amount,tax_rate,subtotal,tax_amount,total) SELECT org,nv,position,description,unit,quantity,unit_price,discount_amount,tax_rate,subtotal,tax_amount,total FROM quotation_items WHERE quotation_version_id=vid;
    INSERT INTO quotation_payment_schedules(organization_id,quotation_version_id,position,label,amount,due_at) SELECT org,nv,position,label,amount,due_at FROM quotation_payment_schedules WHERE quotation_version_id=vid;
  ELSE RAISE EXCEPTION 'invalid_transition'; END IF;
  PERFORM sales_audit(org,actor,'quotation.'||cmd,'quotation',qid::text,jsonb_build_object('version',v.version,'before',v.status,'after',CASE cmd WHEN 'confirm' THEN 'accepted' WHEN 'send' THEN 'sent' WHEN 'decline' THEN 'declined' ELSE 'superseded' END,'evidence',CASE WHEN cmd='confirm' THEN p ELSE NULL END),correlation);
  RETURN jsonb_build_object('id',qid,'invoiceId',iid);
END $$;

-- Protect final content even from accidental application writes. Lifecycle fields remain separate.
CREATE OR REPLACE FUNCTION sales_immutable_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status<>'draft' AND (to_jsonb(NEW)-ARRAY['status','accepted_at','accepted_by_name','declined_at','acceptance_evidence','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','accepted_at','accepted_by_name','declined_at','acceptance_evidence','updated_at']) THEN RAISE EXCEPTION 'final_quotation_immutable'; END IF;
  IF OLD.status='accepted' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'accepted_version_immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_version_immutable BEFORE UPDATE ON quotation_versions FOR EACH ROW EXECUTE FUNCTION sales_immutable_version();
CREATE OR REPLACE FUNCTION sales_immutable_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status<>'draft' AND (to_jsonb(NEW)-ARRAY['status','voided_at','void_reason','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','voided_at','void_reason','updated_at']) THEN RAISE EXCEPTION 'issued_invoice_immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_invoice_immutable BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION sales_immutable_invoice();
CREATE OR REPLACE FUNCTION sales_immutable_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state text; org text; parent uuid;
BEGIN
  org:=coalesce(OLD.organization_id,NEW.organization_id);
  IF TG_TABLE_NAME='invoice_items' THEN
    parent:=coalesce(OLD.invoice_id,NEW.invoice_id); SELECT status INTO state FROM invoices WHERE id=parent AND organization_id=org FOR UPDATE;
  ELSE parent:=coalesce(OLD.quotation_version_id,NEW.quotation_version_id); SELECT status INTO state FROM quotation_versions WHERE id=parent AND organization_id=org FOR UPDATE; END IF;
  IF state<>'draft' THEN RAISE EXCEPTION 'final_items_immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_invoice_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON invoice_items FOR EACH ROW EXECUTE FUNCTION sales_immutable_items();
CREATE TRIGGER sales_quote_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON quotation_items FOR EACH ROW EXECUTE FUNCTION sales_immutable_items();
CREATE TRIGGER sales_quote_schedule_immutable BEFORE INSERT OR UPDATE OR DELETE ON quotation_payment_schedules FOR EACH ROW EXECUTE FUNCTION sales_immutable_items();

-- Stage 1: historical NULL projects are retained. All new and changed relationships are required.
CREATE OR REPLACE FUNCTION sales_project_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.project_id IS NULL THEN RAISE EXCEPTION 'project_required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_new_quote_project BEFORE INSERT OR UPDATE OF client_id,project_id ON quotations FOR EACH ROW EXECUTE FUNCTION sales_project_required();

CREATE OR REPLACE FUNCTION sales_commercial_relationship() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q quotations; v quotation_versions;
BEGIN
  IF NEW.quotation_version_id IS NOT NULL THEN
    SELECT * INTO v FROM quotation_versions WHERE id=NEW.quotation_version_id AND organization_id=NEW.organization_id;
    SELECT * INTO q FROM quotations WHERE id=v.quotation_id AND organization_id=NEW.organization_id;
    IF q.id IS NULL OR q.client_id<>NEW.client_id OR v.status<>'accepted' THEN RAISE EXCEPTION 'commercial_relationship_mismatch'; END IF;
    IF TG_TABLE_NAME='projects' THEN
      IF q.project_id IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'commercial_relationship_mismatch'; END IF;
    ELSE
      IF q.project_id IS DISTINCT FROM NEW.project_id THEN RAISE EXCEPTION 'commercial_relationship_mismatch'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_invoice_relationship BEFORE INSERT OR UPDATE OF quotation_version_id,client_id,project_id ON invoices FOR EACH ROW EXECUTE FUNCTION sales_commercial_relationship();
CREATE TRIGGER sales_project_relationship BEFORE UPDATE OF quotation_version_id ON projects FOR EACH ROW EXECUTE FUNCTION sales_commercial_relationship();

CREATE OR REPLACE FUNCTION sales_quote_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM quotation_versions WHERE quotation_id=OLD.id AND organization_id=OLD.organization_id AND status='accepted') OR
    (EXISTS(SELECT 1 FROM quotation_versions WHERE quotation_id=OLD.id AND organization_id=OLD.organization_id) AND NOT EXISTS(SELECT 1 FROM quotation_versions WHERE quotation_id=OLD.id AND organization_id=OLD.organization_id AND status='draft')) THEN
    IF (NEW.title,NEW.client_id,NEW.project_id,NEW.division,NEW.number) IS DISTINCT FROM (OLD.title,OLD.client_id,OLD.project_id,OLD.division,OLD.number) THEN RAISE EXCEPTION 'final_quotation_identity_immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_quote_identity_guard BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION sales_quote_identity_immutable();

CREATE OR REPLACE FUNCTION sales_invoice_command(org text, actor text, iid uuid, cmd text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE i invoices; paid numeric; credited numeric; cn uuid;
BEGIN
  SELECT * INTO i FROM invoices WHERE id=iid AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'record_unavailable'; END IF;
  IF i.status<>'issued' OR nullif(p->>'reason','') IS NULL THEN RAISE EXCEPTION 'invoice_transition_not_permitted'; END IF;
  SELECT coalesce(sum(a.amount),0) INTO paid FROM payment_allocations a JOIN payments pay ON pay.id=a.payment_id AND pay.organization_id=a.organization_id WHERE a.invoice_id=iid AND a.organization_id=org AND pay.status='confirmed';
  SELECT coalesce(sum(total),0) INTO credited FROM credit_notes WHERE invoice_id=iid AND organization_id=org AND status='issued';
  IF cmd='void' THEN
    IF paid>0 OR credited>0 THEN RAISE EXCEPTION 'allocated_invoice_requires_credit_process'; END IF;
    UPDATE invoices SET status='void',voided_at=now(),void_reason=p->>'reason',updated_at=now() WHERE id=iid;
  ELSIF cmd='credit' THEN
    IF (p->>'amount')::numeric<=0 OR (p->>'amount')::numeric>i.total-credited OR paid>0 THEN RAISE EXCEPTION 'credit_requires_unallocated_balance'; END IF;
    cn:=gen_random_uuid();
    INSERT INTO credit_notes(id,organization_id,invoice_id,client_id,number,status,reason,currency,subtotal,total,issued_at) VALUES(cn,org,iid,i.client_id,sales_number(org,'credit_note'),'issued',p->>'reason',i.currency,(p->>'amount')::numeric,(p->>'amount')::numeric,now());
  ELSE RAISE EXCEPTION 'invalid_transition'; END IF;
  PERFORM sales_audit(org,actor,'invoice.'||cmd,'invoice',iid::text,p,correlation);
  RETURN jsonb_build_object('id',iid,'creditNoteId',cn);
END $$;

CREATE OR REPLACE FUNCTION sales_payment(org text, actor text, p jsonb, correlation text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i invoices; pay payments; pid uuid; staff uuid; paid numeric; credited numeric; due numeric;
BEGIN
  SELECT * INTO i FROM invoices WHERE id=(p->>'invoiceId')::uuid AND organization_id=org FOR UPDATE;
  IF NOT FOUND OR i.status<>'issued' THEN RAISE EXCEPTION 'invoice_unavailable'; END IF;
  IF p->>'command'='submit' THEN
    pid:=gen_random_uuid();
    INSERT INTO payments(id,organization_id,client_id,amount,currency,method,reference,idempotency_key,received_at) VALUES(pid,org,i.client_id,(p->>'amount')::numeric,i.currency,p->>'method',p->>'reference',p->>'key',(p->>'receivedAt')::timestamptz) ON CONFLICT(organization_id,idempotency_key) DO NOTHING;
    SELECT id INTO pid FROM payments WHERE organization_id=org AND idempotency_key=p->>'key' AND client_id=i.client_id AND currency=i.currency;
    IF pid IS NULL THEN RAISE EXCEPTION 'payment_key_conflict'; END IF;
  ELSE
    SELECT * INTO pay FROM payments WHERE id=(p->>'paymentId')::uuid AND organization_id=org AND client_id=i.client_id AND currency=i.currency FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'payment_unavailable'; END IF;
    pid:=pay.id;
    IF EXISTS(SELECT 1 FROM payment_allocations WHERE payment_id=pid AND invoice_id=i.id AND organization_id=org) THEN RETURN pid; END IF;
    SELECT id INTO staff FROM staff_memberships WHERE organization_id=org AND clerk_user_id=actor;
    IF staff IS NULL THEN RAISE EXCEPTION 'staff_mirror_required_for_ledger'; END IF;
    IF pay.status='rejected' THEN RAISE EXCEPTION 'payment_rejected'; END IF;
    IF pay.status='submitted' THEN
      IF nullif(p->>'evidence','') IS NULL THEN RAISE EXCEPTION 'verification_evidence_required'; END IF;
      UPDATE payments SET status='confirmed',confirmed_at=now(),confirmed_by_id=staff,receipt_number=sales_number(org,'receipt'),notes=p->>'evidence',updated_at=now() WHERE id=pid;
    END IF;
    SELECT coalesce(sum(amount),0) INTO paid FROM payment_allocations WHERE payment_id=pid AND organization_id=org;
    SELECT coalesce(sum(amount),0) INTO credited FROM payment_refunds WHERE payment_id=pid AND organization_id=org AND status='completed';
    IF (p->>'amount')::numeric<=0 OR (p->>'amount')::numeric>pay.amount-paid-credited THEN RAISE EXCEPTION 'allocation_exceeds_funds'; END IF;
    SELECT coalesce(sum(a.amount),0) INTO paid FROM payment_allocations a JOIN payments pp ON pp.id=a.payment_id AND pp.organization_id=a.organization_id WHERE a.invoice_id=i.id AND a.organization_id=org AND pp.status='confirmed';
    SELECT coalesce(sum(total),0) INTO credited FROM credit_notes WHERE invoice_id=i.id AND organization_id=org AND status='issued';
    SELECT i.total-paid-credited+coalesce(sum(r.amount),0) INTO due FROM payment_allocation_reversals r JOIN payment_allocations a ON a.id=r.allocation_id AND a.organization_id=r.organization_id JOIN payment_refunds f ON f.id=r.refund_id AND f.organization_id=r.organization_id WHERE a.invoice_id=i.id AND a.organization_id=org AND f.status='completed';
    IF (p->>'amount')::numeric>due THEN RAISE EXCEPTION 'allocation_exceeds_balance'; END IF;
    INSERT INTO payment_allocations(organization_id,payment_id,client_id,currency,invoice_id,amount) VALUES(org,pid,i.client_id,i.currency,i.id,(p->>'amount')::numeric);
  END IF;
  PERFORM sales_audit(org,actor,'payment.'||(p->>'command'),'invoice',i.id::text,jsonb_build_object('paymentId',pid,'amount',p->>'amount','evidence',p->>'evidence'),correlation);
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION sales_delivery_command(org text, actor text, iid uuid, cmd text, p jsonb, correlation text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE d delivery_intents; new_id uuid;
BEGIN
  SELECT * INTO d FROM delivery_intents WHERE id=iid AND organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'record_unavailable'; END IF;
  IF cmd='retry' THEN
    IF d.status NOT IN ('failed','blocked') OR (d.first_attempt_at IS NOT NULL AND d.first_attempt_at<now()-interval '23 hours' AND d.error_code='provider_ambiguous') THEN RAISE EXCEPTION 'delivery_requires_reconciliation'; END IF;
    UPDATE automation_outbox SET status='pending',attempts=0,available_at=now(),locked_at=NULL,locked_by=NULL,lease_expires_at=NULL,last_error_code=NULL WHERE organization_id=org AND payload->>'intentId'=iid::text AND status IN ('dead','failed');
    IF NOT FOUND THEN RAISE EXCEPTION 'delivery_in_progress'; END IF;
    UPDATE delivery_intents SET status='queued',error_code=NULL,updated_at=now() WHERE id=iid;
    new_id:=iid;
  ELSIF cmd='resend' THEN
    IF nullif(p->>'reason','') IS NULL OR d.channel<>'email' OR d.status IN ('queued','processing') THEN RAISE EXCEPTION 'resend_reason_required'; END IF;
    new_id:=sales_intent(org,d.entity_type,d.entity_id,d.channel,coalesce(p->>'recipient',d.recipient),d.payload-'emailPayload',correlation,'sales/resend/'||gen_random_uuid());
  ELSE RAISE EXCEPTION 'invalid_command'; END IF;
  PERFORM sales_audit(org,actor,'delivery.'||cmd,d.entity_type,d.entity_id::text,jsonb_build_object('originalIntent',iid,'newIntent',new_id,'reason',p->>'reason','recipientChanged',p ? 'recipient'),correlation);
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION sales_claim(worker text, org text) RETURNS SETOF automation_outbox LANGUAGE sql AS $$
  UPDATE automation_outbox SET status='processing',attempts=attempts+1,locked_at=now(),locked_by=worker,lease_expires_at=now()+interval '5 minutes',updated_at=now()
  WHERE id=(SELECT id FROM automation_outbox WHERE organization_id=org AND event_type='sales.delivery' AND attempts<8
    AND ((status IN ('pending','failed') AND available_at<=now()) OR (status='processing' AND lease_expires_at<now())) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION sales_webhook_apply() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE e sales_webhook_inbox; d delivery_intents; state text; changed integer:=0;
BEGIN
  FOR e IN SELECT * FROM sales_webhook_inbox WHERE processed_at IS NULL ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
    IF e.provider='resend' THEN
      SELECT * INTO d FROM delivery_intents WHERE channel='email' AND provider_id=e.payload->'data'->>'email_id' FOR UPDATE;
      IF NOT FOUND THEN CONTINUE; END IF;
      state:=CASE e.payload->>'type' WHEN 'email.delivered' THEN 'delivered' WHEN 'email.bounced' THEN 'bounced' WHEN 'email.complained' THEN 'suppressed' WHEN 'email.suppressed' THEN 'suppressed' WHEN 'email.failed' THEN 'failed' ELSE NULL END;
    ELSE
      SELECT * INTO d FROM delivery_intents WHERE channel='whatsapp' AND (provider_id=e.payload->>'wamid' OR id=nullif(e.payload->>'callbackId','')::uuid) FOR UPDATE;
      IF NOT FOUND THEN CONTINUE; END IF;
      state:=e.payload->>'status';
    END IF;
    UPDATE delivery_intents SET
      status=CASE WHEN state IN ('bounced','suppressed') THEN state WHEN status IN ('bounced','suppressed') THEN status WHEN state='read' THEN state WHEN state='delivered' AND status<>'read' THEN state WHEN state='sent' AND status NOT IN ('delivered','read') THEN 'provider_accepted' WHEN state='failed' AND status NOT IN ('delivered','read') THEN state ELSE status END,
      bounced_at=CASE WHEN state='bounced' THEN now() ELSE bounced_at END,complained_at=CASE WHEN state='suppressed' THEN now() ELSE complained_at END,
      delivered_at=CASE WHEN state IN ('delivered','read') THEN coalesce(delivered_at,now()) ELSE delivered_at END,updated_at=now() WHERE id=d.id;
    UPDATE sales_webhook_inbox SET processed_at=now() WHERE id=e.id; changed:=changed+1;
  END LOOP;
  RETURN changed;
END $$;
