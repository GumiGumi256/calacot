ALTER TABLE "clients" ADD COLUMN "trading_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "department" text;--> statement-breakpoint
CREATE INDEX "clients_org_department_idx" ON "clients" USING btree ("organization_id","department");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_department_check" CHECK ("clients"."department" in ('estates', 'architecture', 'painting', 'interiors', 'tech'));
-- BEGIN CLIENT SERVICE
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sales_client(org text, actor text, p jsonb, correlation text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE cid uuid := coalesce((p->>'id')::uuid,gen_random_uuid()); c jsonb;
BEGIN
  IF coalesce(p->>'department','') NOT IN ('estates','architecture','painting','interiors','tech') THEN RAISE EXCEPTION 'client_department_required'; END IF;
  IF p ? 'id' THEN
    PERFORM 1 FROM clients WHERE id=cid AND organization_id=org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'record_unavailable'; END IF;
    PERFORM sales_audit(org,actor,'client.edit','client',cid::text,jsonb_build_object('before',(SELECT jsonb_build_object('name',display_name,'kind',kind) FROM clients WHERE id=cid),'after',jsonb_build_object('name',p->>'displayName','kind',p->>'kind'),'recipientChanged',true),correlation);
    UPDATE clients SET kind=p->>'kind',display_name=p->>'displayName',legal_name=nullif(p->>'legalName',''),trading_name=nullif(p->>'tradingName',''),department=p->>'department',tax_identifier=nullif(p->>'taxIdentifier',''),billing_address=p->'billingAddress',updated_at=now() WHERE id=cid AND organization_id=org;
    UPDATE client_contacts SET is_primary=false WHERE client_id=cid AND organization_id=org;
  ELSE
    INSERT INTO clients(id,organization_id,kind,display_name,legal_name,trading_name,department,tax_identifier,billing_address)
    VALUES(cid,org,p->>'kind',p->>'displayName',nullif(p->>'legalName',''),nullif(p->>'tradingName',''),p->>'department',nullif(p->>'taxIdentifier',''),p->'billingAddress');
    PERFORM sales_audit(org,actor,'client.create','client',cid::text,jsonb_build_object('name',p->>'displayName'),correlation);
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p->'contacts') LOOP
    IF c ? 'id' THEN
      UPDATE client_contacts SET name=c->>'name',email=nullif(c->>'email',''),phone=nullif(c->>'phone',''),is_primary=(c->>'isPrimary')::boolean,
        whatsapp_consent_at=CASE WHEN phone IS DISTINCT FROM nullif(c->>'phone','') THEN NULL ELSE whatsapp_consent_at END,whatsapp_consent_source=CASE WHEN phone IS DISTINCT FROM nullif(c->>'phone','') THEN NULL ELSE whatsapp_consent_source END,updated_at=now()
        WHERE id=(c->>'id')::uuid AND client_id=cid AND organization_id=org;
      IF NOT FOUND THEN RAISE EXCEPTION 'contact_unavailable'; END IF;
    ELSE
      INSERT INTO client_contacts(organization_id,client_id,name,email,phone,is_primary,whatsapp_consent_at,whatsapp_consent_source)
      VALUES(org,cid,c->>'name',nullif(c->>'email',''),nullif(c->>'phone',''),(c->>'isPrimary')::boolean,NULL,NULL);
    END IF;
  END LOOP;
  RETURN cid;
END $$;

