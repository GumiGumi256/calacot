/** Regression: WhatsApp consent record/revoke against real PostgreSQL (in-memory PGlite). No env vars or remote databases are used. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { whatsAppConsentSchema, whatsAppConsentStatement } from "../lib/sales/whatsapp-consent";

const client = new PGlite();
const db = drizzle({ client });

async function migrate() {
  const journal = JSON.parse(await readFile(new URL("../drizzle-current/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    const migration = await readFile(new URL(`../drizzle-current/${entry.tag}.sql`, import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) await client.exec(statement);
  }
}

type Contact = { whatsapp_consent_at: Date | null; whatsapp_consent_source: string | null };
type Audit = { action: string; actor_clerk_user_id: string; actor_type: string; entity_type: string; entity_id: string; changes: Record<string, string>; request_id: string };

async function main() {
  await migrate();
  const org = "org_consent", otherOrg = "org_other", actor = "user_staff";
  const clientId = "20000000-0000-4000-8000-000000000001", contactId = "40000000-0000-4000-8000-000000000001";
  const phone = "+256700000001";
  await client.exec(`INSERT INTO organizations(id,name,legal_name) VALUES ('${org}','A','A'),('${otherOrg}','B','B');
    INSERT INTO clients(id,organization_id,kind,display_name) VALUES ('${clientId}','${org}','company','Synthetic client');
    INSERT INTO client_contacts(id,organization_id,client_id,name,phone) VALUES ('${contactId}','${org}','${clientId}','Synthetic contact','${phone}');`);
  const ctx = { organizationId: org, actor };
  const contact = async () => (await client.query<Contact>("SELECT whatsapp_consent_at,whatsapp_consent_source FROM client_contacts WHERE id=$1", [contactId])).rows[0];
  const audits = async () => (await client.query<Audit>("SELECT action,actor_clerk_user_id,actor_type,entity_type,entity_id,changes,request_id FROM audit_logs WHERE organization_id=$1 ORDER BY created_at,id", [org])).rows;
  const run = async (input: unknown, c = ctx) => {
    const correlation = randomUUID();
    const r = await db.execute(whatsAppConsentStatement(c, whatsAppConsentSchema.parse(input), correlation));
    return { rows: r.rows, correlation };
  };

  // 1. Record consent (this is the statement that failed in production with "could not determine data type of parameter $11").
  const grantEvidence = "Client confirmed by signed form on 2026-11-20";
  const granted = await run({ clientId, contactId, phone, granted: true, evidence: grantEvidence });
  assert.equal(granted.rows.length, 1);
  assert.equal(granted.rows[0].id, contactId);
  let row = await contact();
  assert.ok(row.whatsapp_consent_at instanceof Date, "consent time recorded");
  assert.equal(row.whatsapp_consent_source, grantEvidence);
  let log = await audits();
  assert.equal(log.length, 1);
  assert.deepEqual(log[0], {
    action: "client.whatsapp_consent_granted", actor_clerk_user_id: actor, actor_type: "staff", entity_type: "client", entity_id: clientId,
    changes: { contactId, phone, evidence: grantEvidence }, request_id: granted.correlation,
  });

  // 2. Revoke consent.
  const revokeEvidence = "Client asked by phone to stop WhatsApp messages";
  const revoked = await run({ clientId, contactId, phone, granted: false, evidence: revokeEvidence });
  assert.equal(revoked.rows.length, 1);
  row = await contact();
  assert.equal(row.whatsapp_consent_at, null);
  assert.equal(row.whatsapp_consent_source, null);
  log = await audits();
  assert.equal(log.length, 2);
  assert.deepEqual(log[1], {
    action: "client.whatsapp_consent_revoked", actor_clerk_user_id: actor, actor_type: "staff", entity_type: "client", entity_id: clientId,
    changes: { contactId, phone, evidence: revokeEvidence }, request_id: revoked.correlation,
  });

  // 3. Safeguards: a changed phone, another organization, or the wrong client changes nothing and writes no audit.
  for (const [input, c] of [
    [{ clientId, contactId, phone: "+256700000002", granted: true, evidence: grantEvidence }, ctx],
    [{ clientId, contactId, phone, granted: true, evidence: grantEvidence }, { organizationId: otherOrg, actor }],
    [{ clientId: randomUUID(), contactId, phone, granted: true, evidence: grantEvidence }, ctx],
  ] as const) assert.equal((await run(input, c)).rows.length, 0);
  assert.equal((await contact()).whatsapp_consent_at, null);
  assert.equal((await audits()).length, 2);

  // 4. Input validation is unchanged.
  for (const bad of [
    { clientId, contactId, phone: "0700000001", granted: true, evidence: grantEvidence },
    { clientId, contactId, phone, granted: true, evidence: "too short" },
    { clientId: "not-a-uuid", contactId, phone, granted: true, evidence: grantEvidence },
    { clientId, contactId, phone, granted: "yes", evidence: grantEvidence },
  ]) assert.throws(() => whatsAppConsentSchema.parse(bad));

  console.log("PASS: WhatsApp consent records and revokes on PostgreSQL with matching audit events; mismatches change nothing.");
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => client.close());
