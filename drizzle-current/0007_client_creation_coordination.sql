CREATE OR REPLACE FUNCTION client_possible_matches(org text, p jsonb) RETURNS uuid[] LANGUAGE sql VOLATILE AS $$
 SELECT coalesce(array_agg(c.id ORDER BY c.id),ARRAY[]::uuid[]) FROM clients c
 WHERE c.organization_id=org AND (
   (nullif(btrim(p->>'displayName'),'') IS NOT NULL AND lower(btrim(c.display_name))=lower(btrim(p->>'displayName')))
   OR EXISTS (SELECT 1 FROM client_contacts cc CROSS JOIN LATERAL jsonb_array_elements(coalesce(p->'contacts','[]'::jsonb)) input
      WHERE cc.organization_id=org AND cc.client_id=c.id AND (
         (nullif(btrim(input->>'email'),'') IS NOT NULL AND lower(btrim(cc.email))=lower(btrim(input->>'email'))) OR
         (nullif(btrim(input->>'phone'),'') IS NOT NULL AND cc.phone=btrim(input->>'phone'))))
 );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sales_client(org text, actor text, p jsonb, correlation text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE cid uuid := coalesce((p->>'id')::uuid,gen_random_uuid()); c jsonb; matches uuid[]; reviewed uuid[];
BEGIN
  IF coalesce(p->>'department','') NOT IN ('estates','architecture','painting','interiors','tech') THEN RAISE EXCEPTION 'client_department_required'; END IF;
  IF p ? 'id' THEN
    PERFORM 1 FROM clients WHERE id=cid AND organization_id=org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'record_unavailable'; END IF;
    PERFORM sales_audit(org,actor,'client.edit','client',cid::text,jsonb_build_object('before',(SELECT jsonb_build_object('name',display_name,'kind',kind) FROM clients WHERE id=cid),'after',jsonb_build_object('name',p->>'displayName','kind',p->>'kind'),'recipientChanged',true),correlation);
    UPDATE clients SET kind=p->>'kind',display_name=p->>'displayName',legal_name=nullif(p->>'legalName',''),trading_name=nullif(p->>'tradingName',''),department=p->>'department',tax_identifier=nullif(p->>'taxIdentifier',''),billing_address=p->'billingAddress',updated_at=now() WHERE id=cid AND organization_id=org;
    UPDATE client_contacts SET is_primary=false WHERE client_id=cid AND organization_id=org;
  ELSE
    -- Serialize all new clients per organization, including lead conversions.
    PERFORM pg_advisory_xact_lock(hashtextextended('calacot-client-create:' || org, 0));
    matches := client_possible_matches(org,p);
    SELECT coalesce(array_agg(x::uuid ORDER BY x::uuid),ARRAY[]::uuid[]) INTO reviewed FROM jsonb_array_elements_text(coalesce(p->'reviewedClientIds','[]'::jsonb)) AS x;
    IF matches <> reviewed THEN RAISE EXCEPTION 'client_matches_changed'; END IF;
    IF cardinality(matches)>0 AND coalesce((p->>'confirmDistinct')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'client_review_required'; END IF;
    INSERT INTO clients(id,organization_id,kind,display_name,legal_name,trading_name,department,tax_identifier,billing_address)
    VALUES(cid,org,p->>'kind',p->>'displayName',nullif(p->>'legalName',''),nullif(p->>'tradingName',''),p->>'department',nullif(p->>'taxIdentifier',''),p->'billingAddress');
    PERFORM sales_audit(org,actor,'client.create','client',cid::text,jsonb_build_object('name',p->>'displayName','distinctClientConfirmed',cardinality(matches)>0,'reviewedClientIds',to_jsonb(matches)),correlation);
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
