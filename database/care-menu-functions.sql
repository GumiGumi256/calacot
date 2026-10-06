-- Invoker functions. Verified webhook context and leased jobs are mandatory.
CREATE OR REPLACE FUNCTION care_customer_confirm(org text, sender text, vid uuid, expected_user text, inbound uuid, cfg jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE conv care_conversations; q quotations; v quotation_versions; result jsonb;
BEGIN
 SELECT * INTO conv FROM care_conversations WHERE phone=sender FOR UPDATE;
 IF expected_user IS NULL OR org IS NULL OR conv.organization_id IS DISTINCT FROM org OR conv.clerk_user_id IS DISTINCT FROM expected_user OR conv.linked_until<=now() OR conv.linked_until IS NULL THEN RAISE EXCEPTION 'care_identity_required'; END IF;
 IF EXISTS(SELECT 1 FROM whatsapp_contacts WHERE phone=sender AND opted_out_at IS NOT NULL) THEN RAISE EXCEPTION 'care_identity_required'; END IF;
 -- Match staff's parent/version lock order; shared business command is idempotent.
 SELECT qq.* INTO q FROM quotations qq JOIN quotation_versions vv ON vv.quotation_id=qq.id AND vv.organization_id=qq.organization_id WHERE vv.id=vid AND qq.organization_id=org FOR UPDATE OF qq;
 IF NOT FOUND THEN RAISE EXCEPTION 'care_quote_unavailable'; END IF;
 SELECT * INTO v FROM quotation_versions WHERE id=vid AND organization_id=org FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM clients WHERE id=q.client_id AND organization_id=org AND clerk_user_id=expected_user AND archived_at IS NULL) OR v.sent_at IS NULL THEN RAISE EXCEPTION 'care_identity_required'; END IF;
 IF conv.menu_state->>'screen' IS DISTINCT FROM 'review' OR conv.menu_state->>'versionId' IS DISTINCT FROM vid::text OR conv.session_expires_at IS NULL OR conv.session_expires_at<=now() THEN RAISE EXCEPTION 'care_review_expired'; END IF;
 IF v.status<>'accepted' AND (v.status<>'sent' OR v.valid_until IS NULL OR v.valid_until<=now()) THEN RAISE EXCEPTION 'quotation_not_confirmable'; END IF;
 PERFORM set_config('calacot.actor_type','customer',true);
 result:=sales_quote_command(org,expected_user,q.id,vid,NULL,'confirm',jsonb_build_object('source','whatsapp','acceptedBy',expected_user,'acceptedAt',now(),'evidence','whatsapp inbound '||inbound::text,'verifiedAccount',expected_user,'sender',sender),cfg,inbound::text);
 IF NOT EXISTS(SELECT 1 FROM clients WHERE id=q.client_id AND organization_id=org AND clerk_user_id=expected_user AND archived_at IS NULL) THEN RAISE EXCEPTION 'care_identity_required'; END IF;
 INSERT INTO care_audit(actor,phone,action,details) VALUES(expected_user,sender,'quotation_customer_confirm',jsonb_build_object('versionId',vid,'inboundId',inbound));
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION care_menu_commit(jid uuid, fence uuid, expected_revision integer, org text, account text, expected_user text, next_state jsonb, reply jsonb, command jsonb, cfg jsonb, ttl integer) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE job care_jobs; conv care_conversations; message whatsapp_messages; outid uuid; result jsonb; inv invoices; v quotation_versions; q quotations; reply_text text;
BEGIN
 SELECT * INTO job FROM care_jobs WHERE id=jid FOR UPDATE;
 IF NOT FOUND OR job.lease_token IS DISTINCT FROM fence OR job.lease_until IS NULL OR job.lease_until<=now() OR job.state<>'processing' THEN RETURN NULL; END IF;
 SELECT id INTO outid FROM whatsapp_messages WHERE dedupe_key='care/'||jid;
 IF outid IS NOT NULL THEN RETURN outid; END IF;
 SELECT * INTO conv FROM care_conversations WHERE phone=job.phone FOR UPDATE;
 SELECT * INTO message FROM whatsapp_messages WHERE id=job.message_id;
 IF conv.session_revision IS DISTINCT FROM expected_revision THEN RAISE EXCEPTION 'care_state_conflict'; END IF;
 IF org IS NULL OR account IS NULL OR conv.organization_id IS DISTINCT FROM org OR conv.business_account_id IS DISTINCT FROM account OR message.direction<>'inbound' THEN RAISE EXCEPTION 'care_context_mismatch'; END IF;
 IF conv.mode='closed' OR (conv.mode='human' AND NOT (coalesce(command->>'kind','')='resume' AND conv.assigned_to IS NULL AND message.message_type='text' AND lower(trim(coalesce(message.body,'')))='resume')) THEN RETURN NULL; END IF;
 IF conv.last_processed_at IS NOT NULL AND (message.event_at,message.created_at,message.id)<=(conv.last_processed_at,(SELECT created_at FROM whatsapp_messages WHERE id=conv.last_processed_message_id),conv.last_processed_message_id) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM whatsapp_contacts WHERE phone=job.phone AND opted_out_at IS NULL AND last_inbound_at>now()-interval '24 hours') OR message.event_at<now()-interval '24 hours' THEN RETURN NULL; END IF;
 IF expected_user IS NOT NULL AND (conv.clerk_user_id IS DISTINCT FROM expected_user OR conv.linked_until IS NULL OR conv.linked_until<=now()) THEN RAISE EXCEPTION 'care_identity_required'; END IF;
 IF command->>'kind'='confirm' THEN
   IF message.message_type<>'interactive' OR conv.session_expires_at IS NULL OR conv.session_expires_at<=now() OR conv.menu_state->'options'->>message.body IS DISTINCT FROM 'accept' THEN RAISE EXCEPTION 'care_review_expired'; END IF;
   result:=care_customer_confirm(org,job.phone,(conv.menu_state->>'versionId')::uuid,expected_user,message.id,cfg);
   SELECT * INTO inv FROM invoices WHERE id=(result->>'invoiceId')::uuid AND organization_id=org;
   SELECT * INTO v FROM quotation_versions WHERE id=(conv.menu_state->>'versionId')::uuid;
   SELECT * INTO q FROM quotations WHERE id=v.quotation_id;
   reply_text:='Thank you. Quotation '||q.number||' for '||(v.document_snapshot->>'project')||' is confirmed. Invoice '||inv.number||' has been issued. Choose View latest invoice below to view it. Payment has not been confirmed.';
   reply:=jsonb_set(reply,'{body,text}',to_jsonb(reply_text));
 END IF;
 IF command->>'kind' IN ('lead','handoff') THEN
   INSERT INTO care_requests(job_id,phone,kind,business_unit,fields) VALUES(jid,job.phone,command->>'kind',command->>'service',CASE WHEN command->>'kind'='handoff' THEN jsonb_build_object('reason',command->>'reason') ELSE coalesce(command->'fields','{}') END) ON CONFLICT(job_id) DO NOTHING;
 END IF;
 UPDATE care_conversations SET menu_state=next_state,session_revision=session_revision+1,session_expires_at=now()+make_interval(secs=>least(greatest(ttl,60),86400)),last_processed_at=message.event_at,last_processed_message_id=message.id,
   mode=CASE WHEN command->>'kind'='handoff' THEN 'human' WHEN command->>'kind'='resume' THEN 'bot' ELSE mode END,
   handoff_reason=CASE WHEN command->>'kind'='handoff' THEN command->>'reason' ELSE handoff_reason END,business_unit=coalesce(command->>'service',next_state->>'service',business_unit),updated_at=now() WHERE phone=job.phone;
 INSERT INTO whatsapp_messages(dedupe_key,customer_phone,direction,message_type,body,status,event_at) VALUES('care/'||jid,job.phone,'outbound',CASE WHEN command->>'kind'='handoff' THEN 'text' ELSE 'interactive' END,CASE WHEN command->>'kind'='handoff' THEN reply->'body'->>'text' ELSE reply::text END,'queued',now()) RETURNING id INTO outid;
 UPDATE care_jobs SET decision=jsonb_build_object('flowVersion',1,'revision',expected_revision+1,'outboundId',outid,'verifiedUser',expected_user) WHERE id=jid;
 RETURN outid;
END $$;

CREATE OR REPLACE FUNCTION sales_audit(org text, actor text, action text, entity text, eid text, changes jsonb, correlation text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
 VALUES(org,actor,CASE WHEN current_setting('calacot.actor_type',true)='customer' THEN 'customer' ELSE 'staff' END,action,entity,eid,changes,correlation);
$$;
