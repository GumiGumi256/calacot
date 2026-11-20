import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// In-memory database only. No environment variables or production connections are used.
const db = new PGlite();
try {
  const journal = JSON.parse(await readFile(new URL("../drizzle-current/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    const migration = await readFile(new URL(`../drizzle-current/${entry.tag}.sql`, import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) await db.exec(statement);
  }
  await db.exec(`INSERT INTO organizations(id,name,legal_name) VALUES ('a','A','A'),('b','B','B');
    INSERT INTO documents(id,organization_id,name,kind,storage_key,mime_type,size_bytes,sha256) VALUES
    ('00000000-0000-4000-8000-000000000001','a','1.pdf','quotation','k1','application/pdf',10,repeat('a',64)),
    ('00000000-0000-4000-8000-000000000002','a','2.pdf','quotation','k2','application/pdf',10,repeat('a',64)),
    ('00000000-0000-4000-8000-000000000003','b','3.pdf','quotation','k3','application/pdf',10,repeat('a',64));`);
  await assert.rejects(db.query("SELECT verification_register_legacy('a',$1,$2,$3,'staff','verified evidence','request')", ["00000000-0000-4000-8000-000000000001", "b".repeat(64), "a".repeat(64)]), /verification_ineligible_document/);
  await db.exec(`INSERT INTO clients(id,organization_id,kind,display_name) VALUES('20000000-0000-4000-8000-000000000001','a','company','Synthetic');
    INSERT INTO invoices(id,organization_id,client_id,number,status,customer_snapshot,issuer_snapshot,document_snapshot,subtotal,total,issued_at)
      VALUES('30000000-0000-4000-8000-000000000001','a','20000000-0000-4000-8000-000000000001','I-1','issued','{}','{}','{"number":"I-1","issuer":{"legalName":"Calacot"}}',100,100,now());
    INSERT INTO documents(id,organization_id,name,kind,storage_key,mime_type,size_bytes,sha256)
      VALUES('00000000-0000-4000-8000-000000000004','a','I-1.pdf','invoice','commercial/org/invoice/id/calacot-commercial-v1.pdf','application/pdf',10,repeat('a',64));
    INSERT INTO document_links(organization_id,document_id,invoice_id) VALUES('a','00000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001');
    INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
      VALUES('a','staff','staff','invoice.issue','invoice','30000000-0000-4000-8000-000000000001','{}','fixture');`);
  const register = () => db.query("SELECT verification_register_legacy('a',$1,$2,$3,'staff','verified evidence','request') AS id", ["00000000-0000-4000-8000-000000000004", "b".repeat(64), "a".repeat(64)]);
  const first = await register();
  assert.equal((await register()).rows[0].id, first.rows[0].id);
  await assert.rejects(db.query("SELECT verification_register_legacy('b',$1,$2,$3,'staff','verified evidence','request')", ["00000000-0000-4000-8000-000000000004", "b".repeat(64), "a".repeat(64)]), /verification_ineligible_document/);
  const ids = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"];
  for (let i = 0; i < ids.length; i++) {
    const org = i === 2 ? "b" : "a";
    const doc = `00000000-0000-4000-8000-00000000000${i + 1}`;
    await db.query(`INSERT INTO verification_issuances(id,organization_id,document_id,reference_hash,pdf_sha256,document_type,document_number,issuer_name,issued_at,registered_by,evidence,registration_kind)
      VALUES($1,$2,$3,$4,$5,'quotation','Q-1','Calacot',now(),'staff','approved evidence','legacy')`, [ids[i], org, doc, String(i).repeat(64), "a".repeat(64)]);
    await db.query(`INSERT INTO verification_status_events(organization_id,issuance_id,sequence,status,actor,reason) VALUES($1,$2,1,'issued','staff','approved evidence')`, [org, ids[i]]);
  }
  await assert.rejects(db.query("UPDATE verification_issuances SET document_number='changed' WHERE id=$1", [ids[0]]), /verification_record_immutable/);
  await assert.rejects(db.query("DELETE FROM verification_status_events WHERE issuance_id=$1", [ids[0]]), /verification_record_immutable/);
  await assert.rejects(db.query("SELECT verification_change_status('a',$1,'voided','staff','incorrect document',NULL)", [ids[0]]), /verification_transition_denied/);
  await assert.rejects(db.query("SELECT verification_change_status('a',$1,'superseded','staff','new replacement',$2)", [ids[0], ids[2]]), /verification_replacement_denied/);
  await db.query("SELECT verification_change_status('a',$1,'superseded','staff','new replacement',$2)", [ids[0], ids[1]]);
  await assert.rejects(db.query("SELECT verification_change_status('a',$1,'revoked','staff','another reason',NULL)", [ids[0]]), /verification_transition_denied/);
  await assert.rejects(db.query("INSERT INTO verification_status_events(organization_id,issuance_id,sequence,status,actor,reason) VALUES('a',$1,3,'issued','staff','unauthorized reset')", [ids[0]]), /verification_transition_denied/);

  // Embedded issuance: authority comes from the invoice.issue / quotation.send audit, never from the artifact.
  await db.exec(`INSERT INTO invoices(id,organization_id,client_id,number,status,customer_snapshot,issuer_snapshot,document_snapshot,subtotal,total,issued_at)
      VALUES('30000000-0000-4000-8000-000000000002','a','20000000-0000-4000-8000-000000000001','I-2','issued','{}','{}','{"number":"I-2","issuer":{"legalName":"Calacot"}}',100,100,now()),
            ('30000000-0000-4000-8000-000000000003','a','20000000-0000-4000-8000-000000000001','I-3','issued','{}','{}','{"number":"I-3","issuer":{"legalName":"Calacot"}}',100,100,now());
    INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
      VALUES('a','user_issuer','staff','invoice.issue','invoice','30000000-0000-4000-8000-000000000002','{}','fixture');`);
  const inv2 = "30000000-0000-4000-8000-000000000002", inv3 = "30000000-0000-4000-8000-000000000003";
  const ref = "c".repeat(64), sha = "d".repeat(64);
  const key = (source, r = ref) => `commercial/${"e".repeat(24)}/invoice/${source}/calacot-commercial-v2-${r.slice(0, 16)}.pdf`;
  const finalize = (source = inv2, k = key(source), fp = sha, r = ref, org = "a") =>
    db.query("SELECT verification_finalize_embedded($1,'invoice',$2,$3,'I-2.pdf',1234,$4,$5,'request') AS id", [org, source, k, fp, r]);
  assert.equal((await db.query("SELECT * FROM verification_embedded_candidate('a','invoice',$1)", [inv3])).rows.length, 0, "no audit, no authority");
  await assert.rejects(finalize(inv3, key(inv3)), /verification_ineligible_document/);
  await assert.rejects(finalize(inv2, key(inv2).replace("v2-", "v1-")), /verification_invalid_request/);
  await assert.rejects(finalize(inv2, key(inv2, "f".repeat(64))), /verification_invalid_request/, "key must carry the reference digest prefix");
  await assert.rejects(finalize(inv2, key(inv2), sha, ref, "b"), /verification_ineligible_document/, "tenant isolation");
  const embedded = (await finalize()).rows[0].id;
  assert.equal((await finalize()).rows[0].id, embedded, "retry is idempotent");
  await assert.rejects(finalize(inv2, key(inv2), "9".repeat(64)), /verification_artifact_conflict/, "different bytes at the same key");
  const issued = (await db.query("SELECT v.registration_kind,v.registered_by,v.document_number,v.pdf_sha256,(SELECT count(*)::int FROM verification_status_events e WHERE e.issuance_id=v.id) AS events FROM verification_issuances v WHERE v.document_id=$1", [embedded])).rows[0];
  assert.deepEqual(issued, { registration_kind: "embedded", registered_by: "user_issuer", document_number: "I-2", pdf_sha256: sha, events: 1 });
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='verification.issue_embedded' AND entity_id=$1", [embedded])).rows[0].n, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM document_links WHERE document_id=$1 AND invoice_id=$2", [embedded, inv2])).rows[0].n, 1);
  await assert.rejects(db.query("SELECT verification_register_legacy('a',$1,$2,$3,'staff','verified evidence','request')", [embedded, "1".repeat(64), sha]), /verification_ineligible_document/, "embedded artifacts are not legacy");
  // A voided invoice keeps its embedded record; the void is reported at lookup time.
  await db.exec("UPDATE invoices SET status='void',voided_at=now(),void_reason='Issued in error' WHERE id='30000000-0000-4000-8000-000000000002'");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM verification_embedded_candidate('a','invoice',$1)", [inv2])).rows[0].n, 1);
  const embeddedIssuance = (await db.query("SELECT id FROM verification_issuances WHERE document_id=$1", [embedded])).rows[0].id;
  await db.query("SELECT verification_change_status('a',$1,'voided','staff','invoice voided by finance',NULL)", [embeddedIssuance]);
  assert.equal((await db.query("SELECT status FROM verification_status_events WHERE issuance_id=$1 ORDER BY sequence DESC LIMIT 1", [embeddedIssuance])).rows[0].status, "voided");
  // Quotations: the quotation.send audit must name this exact version.
  await db.exec(`ALTER TABLE quotations DISABLE TRIGGER sales_new_quote_project; -- fixture only
    INSERT INTO quotations(id,organization_id,client_id,number,title,division) VALUES('40000000-0000-4000-8000-000000000001','a','20000000-0000-4000-8000-000000000001','Q-9','Fit-out','tech');
    INSERT INTO quotation_versions(id,organization_id,quotation_id,version,status,sent_at,customer_snapshot,issuer_snapshot,document_snapshot,scope,terms)
      VALUES('41000000-0000-4000-8000-000000000001','a','40000000-0000-4000-8000-000000000001',1,'sent',now(),'{}','{}','{"number":"Q-9","issuer":{"legalName":"Calacot"}}','Scope','Terms'),
            ('41000000-0000-4000-8000-000000000002','a','40000000-0000-4000-8000-000000000001',2,'sent',now(),'{}','{}','{"number":"Q-9","issuer":{"legalName":"Calacot"}}','Scope','Terms');
    INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
      VALUES('a','user_sales','staff','quotation.send','quotation','40000000-0000-4000-8000-000000000001','{"version":1}','fixture');`);
  const candidate = async (v) => (await db.query("SELECT authorized_by FROM verification_embedded_candidate('a','quotation',$1)", [v])).rows;
  assert.deepEqual(await candidate("41000000-0000-4000-8000-000000000001"), [{ authorized_by: "user_sales" }]);
  assert.deepEqual(await candidate("41000000-0000-4000-8000-000000000002"), [], "audit for another version is not authority");
  console.log("Isolated verification database checks passed.");
} finally {
  await db.close();
}
