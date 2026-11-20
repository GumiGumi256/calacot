ALTER TABLE "services" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "item_type" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "row_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "created_by_clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "updated_by_clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN "item_name" text;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN "item_type" text;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN "catalogue_unit_price" numeric(17, 2);--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN "price_source" text;--> statement-breakpoint
CREATE UNIQUE INDEX "services_active_item_uq" ON "services" USING btree ("organization_id","division","currency",lower("name"),"unit") WHERE "services"."is_active";--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_item_type_check" CHECK ("services"."item_type" is null or "services"."item_type" in ('material', 'labour', 'service'));--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_row_version_check" CHECK ("services"."row_version" > 0);--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_price_source_check" CHECK ("quotation_items"."price_source" is null
        or ("quotation_items"."price_source" = 'custom' and "quotation_items"."service_id" is null and "quotation_items"."catalogue_unit_price" is null)
        or ("quotation_items"."price_source" = 'catalogue' and "quotation_items"."service_id" is not null and "quotation_items"."catalogue_unit_price" = "quotation_items"."unit_price")
        or ("quotation_items"."price_source" = 'override' and "quotation_items"."service_id" is not null and "quotation_items"."catalogue_unit_price" is not null and "quotation_items"."catalogue_unit_price" <> "quotation_items"."unit_price"));--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_item_type_check" CHECK ("quotation_items"."item_type" is null or "quotation_items"."item_type" in ('material', 'labour', 'service'));--> statement-breakpoint
-- ===== Reviewed functions (item catalogue). Replace the 0001 sales_quote_save/sales_quote_command additively. =====
CREATE SEQUENCE IF NOT EXISTS catalogue_item_code_seq;
--> statement-breakpoint
-- Create or update one catalogue item. Optimistic concurrency on row_version; every change audited.
CREATE OR REPLACE FUNCTION catalogue_item_save(org text, actor text, p jsonb, correlation text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE old services; sid uuid; nm text := trim(coalesce(p->>'name','')); unit_ text := trim(coalesce(p->>'unit','')); cat text := nullif(trim(coalesce(p->>'category','')),'');
  descr text := nullif(trim(coalesce(p->>'description','')),''); price numeric; active boolean := coalesce((p->>'isActive')::boolean,true); act text; changes jsonb; nv integer;
BEGIN
  IF length(nm) NOT BETWEEN 1 AND 200 OR length(unit_) NOT BETWEEN 1 AND 40 OR coalesce(length(cat),0)>80 OR coalesce(length(descr),0)>2000
    OR coalesce(p->>'division','') NOT IN ('estates','architecture','painting','interiors','tech') OR coalesce(p->>'itemType','') NOT IN ('material','labour','service')
    OR coalesce(p->>'currency','') NOT IN ('UGX','USD') OR coalesce(p->>'unitPrice','') !~ '^\d{1,15}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'catalogue_invalid'; END IF;
  price := (p->>'unitPrice')::numeric;
  IF p ? 'id' THEN
    SELECT * INTO old FROM services WHERE id=(p->>'id')::uuid AND organization_id=org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'catalogue_item_unavailable'; END IF;
    IF old.row_version<>(p->>'rowVersion')::int THEN RAISE EXCEPTION 'catalogue_conflict'; END IF;
    UPDATE services SET name=nm,division=p->>'division',category=cat,item_type=p->>'itemType',description=descr,unit=unit_,default_unit_price=price,currency=p->>'currency',is_active=active,
      row_version=row_version+1,updated_by_clerk_user_id=actor,updated_at=now() WHERE id=old.id RETURNING id,row_version INTO sid,nv;
    act := CASE WHEN old.is_active AND NOT active THEN 'catalogue.deactivate' WHEN NOT old.is_active AND active THEN 'catalogue.reactivate' WHEN old.default_unit_price IS DISTINCT FROM price THEN 'catalogue.price_change' ELSE 'catalogue.update' END;
    SELECT coalesce(jsonb_object_agg(k,jsonb_build_object('from',b->k,'to',a->k)),'{}'::jsonb) INTO changes
      FROM (SELECT to_jsonb(old) AS b,to_jsonb(s) AS a FROM services s WHERE s.id=sid) x, unnest(ARRAY['name','division','category','item_type','description','unit','default_unit_price','currency','is_active']) AS k WHERE b->k IS DISTINCT FROM a->k;
  ELSE
    INSERT INTO services(organization_id,code,name,division,category,item_type,description,unit,default_unit_price,currency,is_active,created_by_clerk_user_id,updated_by_clerk_user_id)
    VALUES(org,'CAT-'||upper(left(p->>'division',3))||'-'||lpad(nextval('catalogue_item_code_seq')::text,5,'0'),nm,p->>'division',cat,p->>'itemType',descr,unit_,price,p->>'currency',true,actor,actor)
    RETURNING id,row_version INTO sid,nv;
    act := 'catalogue.create';
    changes := jsonb_build_object('name',nm,'division',p->>'division','itemType',p->>'itemType','unit',unit_,'unitPrice',price::numeric(17,2)::text,'currency',p->>'currency','source',coalesce(p->>'source','catalogue'));
  END IF;
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) VALUES(org,actor,'staff',act,'catalogue_item',sid::text,changes,correlation);
  RETURN jsonb_build_object('id',sid,'rowVersion',nv);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sales_quote_save(org text, actor text, p jsonb, correlation text) RETURNS uuid LANGUAGE plpgsql AS $$
-- Item catalogue: each line is either a catalogue line (price source resolved here, never trusted
-- from the client) or a custom line. Catalogue values are copied into the line as a snapshot.
DECLARE qid uuid := coalesce((p->>'id')::uuid,gen_random_uuid()); vid uuid; v quotation_versions; line jsonb; schedule jsonb; pos integer := 0; sub numeric:=0; disc numeric:=0; tax numeric:=0; calculated_total numeric:=0;
  prev jsonb := '{}'::jsonb; it services; item_id uuid; ref numeric; src text; nm text; itype text; price numeric; overrides jsonb := '[]'::jsonb; may_override boolean := coalesce((p->>'allowPriceOverride')::boolean,false);
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
    -- Catalogue reference prices already on this draft (kept while the line keeps that price).
    SELECT coalesce(jsonb_object_agg(service_id::text,catalogue_unit_price::text),'{}'::jsonb) INTO prev FROM quotation_items WHERE quotation_version_id=vid AND organization_id=org AND service_id IS NOT NULL AND catalogue_unit_price IS NOT NULL;
    UPDATE quotations SET client_id=(p->>'clientId')::uuid,project_id=(p->>'projectId')::uuid,title=p->>'title',division=p->>'division',updated_at=now() WHERE id=qid;
    DELETE FROM quotation_items WHERE quotation_version_id=vid AND organization_id=org;
    DELETE FROM quotation_payment_schedules WHERE quotation_version_id=vid AND organization_id=org;
  ELSE
    INSERT INTO quotations(id,organization_id,client_id,project_id,title,division) VALUES(qid,org,(p->>'clientId')::uuid,(p->>'projectId')::uuid,p->>'title',p->>'division');
    vid:=gen_random_uuid();
    INSERT INTO quotation_versions(id,organization_id,quotation_id,version,customer_snapshot,issuer_snapshot,scope,terms) VALUES(vid,org,qid,1,'{}','{}',p->>'scope',p->>'terms');
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p->'items') LOOP
    item_id := nullif(line->>'catalogueItemId','')::uuid; price := (line->>'unitPrice')::numeric;
    IF item_id IS NOT NULL THEN
      SELECT * INTO it FROM services WHERE id=item_id AND organization_id=org FOR SHARE;
      IF NOT FOUND OR it.item_type IS NULL OR it.default_unit_price IS NULL THEN RAISE EXCEPTION 'catalogue_item_unavailable'; END IF;
      IF it.currency<>p->>'currency' OR it.division<>p->>'division' THEN RAISE EXCEPTION 'catalogue_item_mismatch'; END IF;
      IF line->>'unit' IS DISTINCT FROM it.unit THEN RAISE EXCEPTION 'catalogue_unit_mismatch'; END IF;
      -- An inactive item may stay on a draft that already had it, but cannot be newly selected.
      IF NOT it.is_active AND NOT prev ? item_id::text THEN RAISE EXCEPTION 'catalogue_item_inactive'; END IF;
      ref := CASE WHEN prev ? item_id::text AND price=(prev->>item_id::text)::numeric THEN (prev->>item_id::text)::numeric ELSE it.default_unit_price END;
      src := CASE WHEN price=ref THEN 'catalogue' ELSE 'override' END;
      IF src='override' AND NOT may_override THEN RAISE EXCEPTION 'price_override_not_permitted'; END IF;
      IF src='override' THEN overrides := overrides || jsonb_build_object('item',item_id,'name',it.name,'cataloguePrice',ref::numeric(17,2)::text,'unitPrice',price::numeric(17,2)::text); END IF;
      nm := it.name; itype := it.item_type;
    ELSE
      ref := NULL; src := 'custom'; nm := nullif(trim(line->>'name'),''); itype := nullif(line->>'itemType','');
    END IF;
    INSERT INTO quotation_items(organization_id,quotation_version_id,position,description,unit,quantity,unit_price,discount_amount,tax_rate,subtotal,tax_amount,total,service_id,item_name,item_type,catalogue_unit_price,price_source)
    VALUES(org,vid,pos,line->>'description',line->>'unit',(line->>'quantity')::numeric,price,(line->>'discountAmount')::numeric,(line->>'taxRate')::numeric,(line->>'subtotal')::numeric,(line->>'taxAmount')::numeric,(line->>'total')::numeric,item_id,nm,itype,ref,src);
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
  PERFORM sales_audit(org,actor,'quotation.save','quotation',qid::text,jsonb_build_object('revision',coalesce(v.revision,0)+1)||CASE WHEN jsonb_array_length(overrides)>0 THEN jsonb_build_object('priceOverrides',overrides) ELSE '{}'::jsonb END,correlation);
  RETURN qid;
END $$;
--> statement-breakpoint
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
      (SELECT jsonb_agg(jsonb_build_object('description',description,'unit',unit,'position',position,'quantity',quantity::text,'unitPrice',unit_price::text,'discountAmount',discount_amount::text,'taxRate',tax_rate::text,'subtotal',subtotal::text,'taxAmount',tax_amount::text,'total',total::text)||jsonb_strip_nulls(jsonb_build_object('name',item_name,'itemType',item_type,'priceSource',price_source)) ORDER BY position) FROM quotation_items WHERE quotation_version_id=vid),
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
    INSERT INTO quotation_items(organization_id,quotation_version_id,position,description,unit,quantity,unit_price,discount_amount,tax_rate,subtotal,tax_amount,total,service_id,item_name,item_type,catalogue_unit_price,price_source) SELECT org,nv,position,description,unit,quantity,unit_price,discount_amount,tax_rate,subtotal,tax_amount,total,service_id,item_name,item_type,catalogue_unit_price,price_source FROM quotation_items WHERE quotation_version_id=vid;
    INSERT INTO quotation_payment_schedules(organization_id,quotation_version_id,position,label,amount,due_at) SELECT org,nv,position,label,amount,due_at FROM quotation_payment_schedules WHERE quotation_version_id=vid;
  ELSE RAISE EXCEPTION 'invalid_transition'; END IF;
  PERFORM sales_audit(org,actor,'quotation.'||cmd,'quotation',qid::text,jsonb_build_object('version',v.version,'before',v.status,'after',CASE cmd WHEN 'confirm' THEN 'accepted' WHEN 'send' THEN 'sent' WHEN 'decline' THEN 'declined' ELSE 'superseded' END,'evidence',CASE WHEN cmd='confirm' THEN p ELSE NULL END),correlation);
  RETURN jsonb_build_object('id',qid,'invoiceId',iid);
END $$;
