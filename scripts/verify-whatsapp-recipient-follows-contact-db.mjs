// WhatsApp messages follow a client contact's new phone number (migration 0028) against a disposable,
// fully migrated PGlite schema. No environment variables, no network, no real database.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const QUOTE2 = id(10), CLIENT = id(1), CONTACT = id(2), OTHER_CONTACT = id(3), PROJECT = id(4), QUOTE = id(5), VERSION = id(6), INVOICE = id(7), OTHER_VERSION = id(8), OTHER_INVOICE = id(9);
const OLD = "+256700000001", NEW = "+256700000002";
const intent = (n, entity, status, extra = {}) => ({ id: id(100 + n), entity, status, recipient: OLD, error: null, provider: null, attempted: false, ...extra });
const intents = [
  intent(1, INVOICE, "queued"),                                     // waiting to send: moves
  intent(2, INVOICE, "skipped", { error: "consent_missing" }),       // skipped for consent: moves, stays consent_missing
  intent(3, INVOICE, "skipped", { error: "invalid_phone" }),         // skipped for a bad number: moves, becomes consent_missing
  intent(4, INVOICE, "skipped", { error: "approved_template_missing" }), // not about the recipient: moves, keeps its reason
  intent(5, INVOICE, "provider_accepted", { provider: "wamid.1", attempted: true }), // sent: never changes
  intent(6, INVOICE, "uncertain", { attempted: true }),               // attempted: never changes
  intent(7, INVOICE, "queued", { recipient: "+256799999999" }),      // addressed to some other number: never changes
  intent(8, OTHER_INVOICE, "queued"),                                // another contact's invoice: never changes
];
try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) for (const s of (await readFile(`drizzle-current/${entry.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A');
    INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES('${CLIENT}','a','individual','Client','painting');
    INSERT INTO client_contacts(id,organization_id,client_id,name,email,phone,whatsapp_consent_at,whatsapp_consent_source) VALUES
      ('${CONTACT}','a','${CLIENT}','Primary','p@a.test','${OLD}',now(),'Signed form'),('${OTHER_CONTACT}','a','${CLIENT}','Other','o@a.test','${OLD}',now(),'Signed form');
    INSERT INTO projects(id,organization_id,client_id,code,name,division) VALUES('${PROJECT}','a','${CLIENT}','P1','Repaint','painting');
    INSERT INTO quotations(id,organization_id,client_id,project_id,title,division) VALUES('${QUOTE}','a','${CLIENT}','${PROJECT}','Repaint','painting'),('${QUOTE2}','a','${CLIENT}','${PROJECT}','Extra','painting');
    INSERT INTO quotation_versions(id,organization_id,quotation_id,version,status,sent_at,accepted_at,accepted_by_name,customer_snapshot,issuer_snapshot,scope,terms,currency,delivery_contact_id) VALUES
      ('${VERSION}','a','${QUOTE}',1,'accepted',now(),now(),'Client','{}','{}','Scope','Terms','UGX','${CONTACT}'),('${OTHER_VERSION}','a','${QUOTE2}',1,'accepted',now(),now(),'Client','{}','{}','Scope','Terms','UGX','${OTHER_CONTACT}');
    INSERT INTO invoices(id,organization_id,client_id,project_id,quotation_version_id,customer_snapshot,issuer_snapshot) VALUES
      ('${INVOICE}','a','${CLIENT}','${PROJECT}','${VERSION}','{}','{}'),('${OTHER_INVOICE}','a','${CLIENT}','${PROJECT}','${OTHER_VERSION}','{}','{}');`);
  for (const d of intents) {
    await pg.query(`INSERT INTO delivery_intents(id,organization_id,entity_type,entity_id,channel,recipient,payload,status,provider_id,first_attempt_at,error_code,correlation_id)
      VALUES($1,'a','invoice',$2,'whatsapp',$3,$4::jsonb,$5,$6,$7,$8,'c')`, [d.id, d.entity, d.recipient, JSON.stringify({ consentAt: "2026-01-01", consentSource: "Signed form", template: "t" }), d.status, d.provider, d.attempted ? new Date().toISOString() : null, d.error]);
  }

  // Same change as sales_client makes when a number is edited: new phone, consent cleared.
  await pg.query(`UPDATE client_contacts SET phone=$1,whatsapp_consent_at=NULL,whatsapp_consent_source=NULL WHERE id=$2`, [NEW, CONTACT]);
  const rows = Object.fromEntries((await pg.query(`SELECT id::text,recipient,status,error_code,payload->>'consentAt' AS consent,payload->>'template' AS template FROM delivery_intents`)).rows.map((r) => [r.id, r]));
  const get = (n) => rows[id(100 + n)];

  for (const n of [1, 2, 3, 4]) {
    assert.equal(get(n).recipient, NEW, `unsent message ${n} follows the new number`);
    assert.equal(get(n).consent, null, `message ${n} no longer carries the old number's consent`);
    assert.equal(get(n).template, "t", "the rest of the payload is kept");
  }
  assert.deepEqual([get(1).status, get(1).error_code], ["queued", null]);
  assert.deepEqual([get(2).status, get(2).error_code], ["skipped", "consent_missing"]);
  assert.deepEqual([get(3).status, get(3).error_code], ["skipped", "consent_missing"], "a skipped bad number becomes retryable once consent is recorded");
  assert.deepEqual([get(4).status, get(4).error_code], ["skipped", "approved_template_missing"]);
  for (const n of [5, 6, 7, 8]) assert.notEqual(get(n).recipient, NEW, `message ${n} is history or belongs to someone else`);
  assert.equal(get(5).consent, "2026-01-01");
  assert.equal((await pg.query(`SELECT count(*)::int n FROM audit_logs WHERE action='delivery.recipient_updated' AND actor_type='system'`)).rows[0].n, 4);
  assert.equal((await pg.query(`SELECT count(*)::int n FROM audit_logs WHERE action='delivery.recipient_updated' AND changes::text LIKE '%2567%'`)).rows[0].n, 0, "audit entries never store phone numbers");

  // Saving the contact without changing the number moves nothing; changing it again follows again.
  await pg.query(`UPDATE client_contacts SET name='Renamed' WHERE id=$1`, [CONTACT]);
  assert.equal((await pg.query(`SELECT count(*)::int n FROM audit_logs WHERE action='delivery.recipient_updated'`)).rows[0].n, 4);
  await pg.query(`UPDATE client_contacts SET phone='+256700000003' WHERE id=$1`, [CONTACT]);
  assert.equal((await pg.query(`SELECT recipient FROM delivery_intents WHERE id=$1`, [id(101)])).rows[0].recipient, "+256700000003");
  // Removing the number leaves unsent messages with no recipient (the worker skips them), never the old number.
  await pg.query(`UPDATE client_contacts SET phone=NULL WHERE id=$1`, [CONTACT]);
  assert.equal((await pg.query(`SELECT recipient FROM delivery_intents WHERE id=$1`, [id(101)])).rows[0].recipient, "");

  console.log("PASS: unsent WhatsApp messages follow a contact's new number without carrying old consent; sent, attempted and other contacts' messages are untouched; moves are audited without phone numbers.");
} finally { await pg.close(); }
