-- Document verification (additive). Issuance records and append-only status events for
-- commercial quotation and invoice PDFs. Nothing here alters an existing table, row or
-- financial workflow. All application calls must also be authorized in the application.
CREATE TABLE verification_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organizations(id),
  document_id uuid NOT NULL,
  reference_hash text NOT NULL UNIQUE CHECK (reference_hash ~ '^[0-9a-f]{64}$'),
  pdf_sha256 text NOT NULL CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  document_type text NOT NULL CHECK (document_type IN ('quotation','invoice')),
  document_number text NOT NULL CHECK (length(trim(document_number)) BETWEEN 1 AND 200),
  issuer_name text NOT NULL CHECK (length(trim(issuer_name)) BETWEEN 1 AND 200),
  issued_at timestamptz NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  registered_by text NOT NULL CHECK (length(trim(registered_by)) > 0),
  evidence text NOT NULL CHECK (length(trim(evidence)) BETWEEN 10 AND 2000),
  registration_kind text NOT NULL CHECK (registration_kind IN ('legacy','embedded')),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, document_id),
  FOREIGN KEY (organization_id, document_id) REFERENCES documents(organization_id, id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE verification_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  issuance_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  status text NOT NULL CHECK (status IN ('issued','superseded','withdrawn','expired','voided','revoked')),
  actor text NOT NULL CHECK (length(trim(actor)) > 0),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 2000),
  replacement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, issuance_id, sequence),
  FOREIGN KEY (organization_id, issuance_id) REFERENCES verification_issuances(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, replacement_id) REFERENCES verification_issuances(organization_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'superseded') = (replacement_id IS NOT NULL)),
  CHECK (replacement_id IS NULL OR replacement_id <> issuance_id)
);
--> statement-breakpoint
CREATE FUNCTION verification_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'verification_record_immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER verification_issuances_immutable BEFORE UPDATE OR DELETE ON verification_issuances FOR EACH ROW EXECUTE FUNCTION verification_immutable();
--> statement-breakpoint
CREATE TRIGGER verification_status_events_immutable BEFORE UPDATE OR DELETE ON verification_status_events FOR EACH ROW EXECUTE FUNCTION verification_immutable();
--> statement-breakpoint
-- Protect append order and transition rules even for callers bypassing the helper functions.
CREATE FUNCTION verification_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item verification_issuances; last_status text; last_sequence integer; replacement_type text; replacement_status text;
BEGIN
  SELECT * INTO item FROM verification_issuances WHERE organization_id=NEW.organization_id AND id=NEW.issuance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'verification_unavailable'; END IF;
  SELECT status,sequence INTO last_status,last_sequence FROM verification_status_events
    WHERE organization_id=NEW.organization_id AND issuance_id=NEW.issuance_id ORDER BY sequence DESC LIMIT 1;
  IF last_sequence IS NULL THEN
    IF NEW.sequence<>1 OR NEW.status<>'issued' OR NEW.replacement_id IS NOT NULL THEN RAISE EXCEPTION 'verification_transition_denied'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.sequence<>last_sequence+1 OR last_status<>'issued' OR NEW.status NOT IN ('superseded','withdrawn','expired','voided','revoked') OR
     (NEW.status='expired' AND item.document_type<>'quotation') OR (NEW.status='voided' AND item.document_type<>'invoice')
  THEN RAISE EXCEPTION 'verification_transition_denied'; END IF;
  IF NEW.status='superseded' THEN
    SELECT document_type INTO replacement_type FROM verification_issuances WHERE organization_id=NEW.organization_id AND id=NEW.replacement_id FOR UPDATE;
    SELECT status INTO replacement_status FROM verification_status_events WHERE organization_id=NEW.organization_id AND issuance_id=NEW.replacement_id ORDER BY sequence DESC LIMIT 1;
    IF NEW.replacement_id IS NULL OR NEW.replacement_id=NEW.issuance_id OR replacement_type IS DISTINCT FROM item.document_type OR replacement_status IS DISTINCT FROM 'issued'
    THEN RAISE EXCEPTION 'verification_replacement_denied'; END IF;
  ELSIF NEW.replacement_id IS NOT NULL THEN
    RAISE EXCEPTION 'verification_replacement_denied';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER verification_status_event_guard BEFORE INSERT ON verification_status_events FOR EACH ROW EXECUTE FUNCTION verification_event_guard();
--> statement-breakpoint
CREATE FUNCTION verification_audit_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
  VALUES(NEW.organization_id,NEW.actor,'staff','verification.status','document',
    (SELECT document_id::text FROM verification_issuances WHERE organization_id=NEW.organization_id AND id=NEW.issuance_id),
    jsonb_build_object('verificationId',NEW.issuance_id,'status',NEW.status,'reason',NEW.reason,'replacementId',NEW.replacement_id),NEW.id::text);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER verification_status_audit AFTER INSERT ON verification_status_events FOR EACH ROW EXECUTE FUNCTION verification_audit_event();
--> statement-breakpoint
-- Legacy registration is deliberately limited to existing unembedded commercial artifacts with
-- immutable snapshots and existing issuance audit evidence. The caller must load the private
-- object and verify its bytes before calling, and must independently authorize the actor using
-- a fresh Clerk membership and the explicit verification_issue permission.
CREATE FUNCTION verification_register_legacy(org text, doc uuid, reference text, fingerprint text, by_actor text, why text, correlation text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE d documents; record_type text; record_number text; issuer text; original_issued_at timestamptz; verification_id uuid; existing verification_issuances;
BEGIN
  IF length(trim(coalesce(by_actor,'')))=0 OR length(trim(coalesce(why,''))) NOT BETWEEN 10 AND 2000 OR
     coalesce(reference,'') !~ '^[0-9a-f]{64}$' OR coalesce(fingerprint,'') !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'verification_invalid_request'; END IF;
  SELECT * INTO d FROM documents WHERE id=doc AND organization_id=org FOR UPDATE;
  IF NOT FOUND OR d.mime_type<>'application/pdf' OR d.sha256 IS DISTINCT FROM fingerprint OR d.archived_at IS NOT NULL
     OR d.storage_key NOT LIKE 'commercial/%/calacot-commercial-v1.pdf' THEN RAISE EXCEPTION 'verification_ineligible_document'; END IF;
  SELECT * INTO existing FROM verification_issuances WHERE organization_id=org AND document_id=doc;
  IF FOUND THEN
    IF existing.reference_hash=reference AND existing.pdf_sha256=fingerprint AND existing.registered_by=by_actor AND existing.evidence=trim(why) AND existing.registration_kind='legacy' THEN RETURN existing.id; END IF;
    RAISE EXCEPTION 'verification_registration_conflict';
  END IF;
  IF d.kind='quotation' THEN
    SELECT 'quotation',v.document_snapshot->>'number',v.document_snapshot->'issuer'->>'legalName',v.sent_at
      INTO record_type,record_number,issuer,original_issued_at
      FROM document_links l JOIN quotation_versions v ON v.id=l.quotation_version_id AND v.organization_id=l.organization_id
      JOIN quotations q ON q.id=v.quotation_id AND q.organization_id=v.organization_id
      WHERE l.organization_id=org AND l.document_id=doc AND v.status='sent' AND v.document_snapshot IS NOT NULL
        AND v.document_snapshot->>'number'=q.number
        AND EXISTS(SELECT 1 FROM audit_logs a WHERE a.organization_id=org AND a.entity_type='quotation' AND a.entity_id=q.id::text AND a.action='quotation.send' AND a.changes->>'version'=v.version::text);
  ELSIF d.kind='invoice' THEN
    SELECT 'invoice',i.number,i.document_snapshot->'issuer'->>'legalName',i.issued_at
      INTO record_type,record_number,issuer,original_issued_at
      FROM document_links l JOIN invoices i ON i.id=l.invoice_id AND i.organization_id=l.organization_id
      WHERE l.organization_id=org AND l.document_id=doc AND i.status='issued' AND i.document_snapshot IS NOT NULL
        AND i.document_snapshot->>'number'=i.number
        AND EXISTS(SELECT 1 FROM audit_logs a WHERE a.organization_id=org AND a.entity_type='invoice' AND a.entity_id=i.id::text AND a.action='invoice.issue');
  END IF;
  IF record_type IS NULL OR nullif(trim(record_number),'') IS NULL OR nullif(trim(issuer),'') IS NULL OR original_issued_at IS NULL
  THEN RAISE EXCEPTION 'verification_ineligible_document'; END IF;
  INSERT INTO verification_issuances(organization_id,document_id,reference_hash,pdf_sha256,document_type,document_number,issuer_name,issued_at,registered_by,evidence,registration_kind)
    VALUES(org,doc,reference,fingerprint,record_type,record_number,issuer,original_issued_at,by_actor,trim(why),'legacy') RETURNING id INTO verification_id;
  INSERT INTO verification_status_events(organization_id,issuance_id,sequence,status,actor,reason)
    VALUES(org,verification_id,1,'issued',by_actor,trim(why));
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
    VALUES(org,by_actor,'staff','verification.register_legacy','document',doc::text,jsonb_build_object('verificationId',verification_id,'sha256',fingerprint,'evidence',trim(why)),correlation);
  RETURN verification_id;
END $$;
--> statement-breakpoint
-- Serialize transitions per issuance. Events are append-only, with no restoration to issued.
-- A replacement must itself currently be issued and belong to the same organization and type.
CREATE FUNCTION verification_change_status(org text, issuance uuid, next_status text, by_actor text, why text, replacement uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE item verification_issuances; old_status text; next_sequence integer; replacement_status text;
BEGIN
  SELECT * INTO item FROM verification_issuances WHERE organization_id=org AND id=issuance FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'verification_unavailable'; END IF;
  SELECT status,sequence+1 INTO old_status,next_sequence FROM verification_status_events
    WHERE organization_id=org AND issuance_id=issuance ORDER BY sequence DESC LIMIT 1;
  IF old_status IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'verification_transition_denied'; END IF;
  IF next_status NOT IN ('superseded','withdrawn','expired','revoked','voided') OR
     (next_status='expired' AND item.document_type<>'quotation') OR
     (next_status='voided' AND item.document_type<>'invoice') OR
     ((next_status='superseded') IS DISTINCT FROM (replacement IS NOT NULL)) OR
     length(trim(coalesce(by_actor,'')))=0 OR length(trim(coalesce(why,''))) NOT BETWEEN 10 AND 2000
  THEN RAISE EXCEPTION 'verification_transition_denied'; END IF;
  IF replacement IS NOT NULL THEN
    IF replacement=issuance OR NOT EXISTS (SELECT 1 FROM verification_issuances r WHERE r.id=replacement AND r.organization_id=org AND r.document_type=item.document_type)
    THEN RAISE EXCEPTION 'verification_replacement_denied'; END IF;
    SELECT status INTO replacement_status FROM verification_status_events WHERE organization_id=org AND issuance_id=replacement ORDER BY sequence DESC LIMIT 1;
    IF replacement_status IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'verification_replacement_denied'; END IF;
  END IF;
  INSERT INTO verification_status_events(organization_id,issuance_id,sequence,status,actor,reason,replacement_id)
    VALUES(org,issuance,next_sequence,next_status,by_actor,trim(why),replacement);
END $$;
--> statement-breakpoint
-- Embedded issuance authority comes from the business issuance itself, never from artifact
-- creation: a sent quotation version with its quotation.send audit (the authorized staff action
-- that froze the snapshot), or an issued invoice with its invoice.issue audit. Rows describe the
-- originally issued document; later status (void, declined, expiry) is reflected at lookup time.
CREATE FUNCTION verification_embedded_candidate(org text, entity text, source uuid)
RETURNS TABLE(record_number text, issuer text, original_issued_at timestamptz, authorized_by text, audit_id uuid)
LANGUAGE sql STABLE AS $$
  SELECT v.document_snapshot->>'number',v.document_snapshot->'issuer'->>'legalName',v.sent_at,a.actor_clerk_user_id,a.id
    FROM quotation_versions v JOIN quotations q ON q.id=v.quotation_id AND q.organization_id=v.organization_id
    JOIN LATERAL (SELECT x.id,x.actor_clerk_user_id FROM audit_logs x WHERE x.organization_id=org AND x.entity_type='quotation' AND x.entity_id=q.id::text
      AND x.action='quotation.send' AND x.changes->>'version'=v.version::text ORDER BY x.created_at,x.id LIMIT 1) a ON true
   WHERE entity='quotation' AND v.id=source AND v.organization_id=org AND v.document_snapshot IS NOT NULL AND v.sent_at IS NOT NULL
     AND v.status IN ('sent','accepted','declined','expired','superseded') AND v.document_snapshot->>'number'=q.number
     AND nullif(trim(v.document_snapshot->'issuer'->>'legalName'),'') IS NOT NULL AND nullif(trim(a.actor_clerk_user_id),'') IS NOT NULL
  UNION ALL
  SELECT i.number,i.document_snapshot->'issuer'->>'legalName',i.issued_at,a.actor_clerk_user_id,a.id
    FROM invoices i
    JOIN LATERAL (SELECT x.id,x.actor_clerk_user_id FROM audit_logs x WHERE x.organization_id=org AND x.entity_type='invoice' AND x.entity_id=i.id::text
      AND x.action='invoice.issue' ORDER BY x.created_at,x.id LIMIT 1) a ON true
   WHERE entity='invoice' AND i.id=source AND i.organization_id=org AND i.document_snapshot IS NOT NULL AND i.status IN ('issued','void')
     AND i.document_snapshot->>'number'=i.number AND nullif(trim(i.document_snapshot->'issuer'->>'legalName'),'') IS NOT NULL
     AND nullif(trim(a.actor_clerk_user_id),'') IS NOT NULL
$$;
--> statement-breakpoint
-- Atomic finalization of an embedded artifact. The caller has already written the PDF (which
-- carries the reference and QR) to a create-only key and hashed the bytes read back from storage.
-- The document row, its link, the issuance, its first event and the audit entry commit together
-- or not at all; an interrupted run leaves only an unregistered private object that the next run
-- recovers by key. Retries with identical inputs return the same document.
CREATE FUNCTION verification_finalize_embedded(org text, entity text, source uuid, key text, file_name text, byte_size bigint, fingerprint text, reference text, correlation text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE c record; d documents; existing verification_issuances; verification_id uuid;
BEGIN
  IF entity NOT IN ('quotation','invoice') OR coalesce(fingerprint,'') !~ '^[0-9a-f]{64}$' OR coalesce(reference,'') !~ '^[0-9a-f]{64}$'
     OR coalesce(key,'') !~ ('^commercial/[0-9a-f]{24}/'||entity||'/'||source::text||'/calacot-commercial-v2-[0-9a-f]{16}\.pdf$')
     OR right(key,20)<>left(reference,16)||'.pdf' OR byte_size IS NULL OR byte_size<=0 OR byte_size>20971520
  THEN RAISE EXCEPTION 'verification_invalid_request'; END IF;
  -- Serialize per source record so concurrent finalizers cannot interleave.
  PERFORM pg_advisory_xact_lock(hashtextextended('verification/'||org||'/'||entity||'/'||source::text,0));
  SELECT * INTO c FROM verification_embedded_candidate(org,entity,source) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'verification_ineligible_document'; END IF;
  INSERT INTO documents(organization_id,name,kind,storage_key,mime_type,size_bytes,sha256,version)
    VALUES(org,file_name,entity,key,'application/pdf',byte_size,fingerprint,1) ON CONFLICT(organization_id,storage_key) DO NOTHING;
  SELECT * INTO d FROM documents WHERE organization_id=org AND storage_key=key FOR UPDATE;
  IF d.sha256 IS DISTINCT FROM fingerprint OR d.kind<>entity THEN RAISE EXCEPTION 'verification_artifact_conflict'; END IF;
  INSERT INTO document_links(organization_id,document_id,quotation_version_id,invoice_id)
    SELECT org,d.id,CASE WHEN entity='quotation' THEN source END,CASE WHEN entity='invoice' THEN source END
     WHERE NOT EXISTS(SELECT 1 FROM document_links l WHERE l.organization_id=org AND l.document_id=d.id);
  IF NOT EXISTS(SELECT 1 FROM document_links l WHERE l.organization_id=org AND l.document_id=d.id
     AND l.quotation_version_id IS NOT DISTINCT FROM CASE WHEN entity='quotation' THEN source END
     AND l.invoice_id IS NOT DISTINCT FROM CASE WHEN entity='invoice' THEN source END)
  THEN RAISE EXCEPTION 'verification_artifact_conflict'; END IF;
  SELECT * INTO existing FROM verification_issuances WHERE organization_id=org AND document_id=d.id;
  IF FOUND THEN
    IF existing.reference_hash=reference AND existing.pdf_sha256=fingerprint AND existing.registration_kind='embedded' THEN RETURN d.id; END IF;
    RAISE EXCEPTION 'verification_registration_conflict';
  END IF;
  INSERT INTO verification_issuances(organization_id,document_id,reference_hash,pdf_sha256,document_type,document_number,issuer_name,issued_at,registered_by,evidence,registration_kind)
    VALUES(org,d.id,reference,fingerprint,entity,c.record_number,c.issuer,c.original_issued_at,c.authorized_by,
      'Embedded at issuance; authorized by '||entity||CASE entity WHEN 'quotation' THEN '.send' ELSE '.issue' END||' audit '||c.audit_id::text,'embedded')
    RETURNING id INTO verification_id;
  INSERT INTO verification_status_events(organization_id,issuance_id,sequence,status,actor,reason)
    VALUES(org,verification_id,1,'issued',c.authorized_by,'Embedded at issuance; audit '||c.audit_id::text);
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
    VALUES(org,c.authorized_by,'staff','verification.issue_embedded','document',d.id::text,
      jsonb_build_object('verificationId',verification_id,'sha256',fingerprint,'source',entity,'sourceId',source,'authorizationAudit',c.audit_id),correlation);
  RETURN d.id;
END $$;
