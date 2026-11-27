/** Regression: retrying a WhatsApp delivery WhatsApp refused, against real PostgreSQL (in-memory PGlite). No env vars or remote databases are used. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { whatsAppDeliveryRetryStatement } from "../lib/sales/whatsapp-consent";

const client = new PGlite();
const db = drizzle({ client });

async function migrate() {
  const journal = JSON.parse(await readFile(new URL("../drizzle-current/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    const migration = await readFile(new URL(`../drizzle-current/${entry.tag}.sql`, import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) await client.exec(statement);
  }
}

const org = "org_retry", otherOrg = "org_other", actor = "user_staff";
const ctx = { organizationId: org, actor };
const phone = "+256700000001";

type Case = {
  status: string;
  errorCode: string | null;
  providerId?: string | null;
  outbox: string;
  message?: { status: string; wamid?: string | null } | null;
  recipient?: string;
};

/** Creates one WhatsApp delivery intent, its outbox job and (optionally) its whatsapp_messages row. */
async function seed(c: Case) {
  const id = randomUUID(), entity = randomUUID();
  const recipient = c.recipient ?? phone;
  await client.query(
    `INSERT INTO delivery_intents(id,organization_id,entity_type,entity_id,channel,recipient,payload,status,provider_id,error_code,first_attempt_at,correlation_id)
     VALUES($1,$2,'invoice',$3,'whatsapp',$4,'{}'::jsonb,$5,$6,$7,now(),'seed')`,
    [id, org, entity, recipient, c.status, c.providerId ?? null, c.errorCode],
  );
  await client.query(
    `INSERT INTO automation_outbox(organization_id,event_type,aggregate_type,aggregate_id,payload,idempotency_key,status,attempts,last_error_code,completed_at)
     VALUES($1,'sales.delivery','delivery',$2,$3::jsonb,$4,$5::text,1,$6,CASE WHEN $5::text='completed' THEN now() END)`,
    [org, id, JSON.stringify({ intentId: id }), `seed/${id}`, c.outbox, c.errorCode],
  );
  if (c.message)
    await client.query(
      `INSERT INTO whatsapp_messages(id,dedupe_key,customer_phone,direction,message_type,template_name,status,wamid,error_code,event_at)
       VALUES($1,$2,$3,'outbound','template','invoice',$4,$5,$6,now())`,
      [id, `sales/${org}/${id}`, recipient.replace(/^\+/, ""), c.message.status, c.message.wamid ?? null, c.errorCode],
    );
  return id;
}

const retry = async (id: string, c = ctx) => (await db.execute(whatsAppDeliveryRetryStatement(c, id, randomUUID()))).rows;
const intent = async (id: string) => (await client.query<{ status: string; error_code: string | null }>("SELECT status,error_code FROM delivery_intents WHERE id=$1", [id])).rows[0];
const job = async (id: string) => (await client.query<{ status: string; attempts: number; last_error_code: string | null }>("SELECT status,attempts,last_error_code FROM automation_outbox WHERE payload->>'intentId'=$1", [id])).rows[0];
const message = async (id: string) => (await client.query<{ status: string; error_code: string | null }>("SELECT status,error_code FROM whatsapp_messages WHERE id=$1", [id])).rows[0];
const audits = async () => (await client.query<{ action: string; changes: Record<string, string> }>("SELECT action,changes FROM audit_logs WHERE organization_id=$1 ORDER BY created_at,id", [org])).rows;

async function main() {
  await migrate();
  await client.exec(`INSERT INTO organizations(id,name,legal_name) VALUES ('${org}','A','A'),('${otherOrg}','B','B');`);

  // 1. Meta refused the template (the screenshot case): requeued end to end, with an audit event.
  const rejected = await seed({ status: "blocked", errorCode: "provider_rejected:meta_131030", outbox: "dead", message: { status: "failed" } });
  assert.equal((await retry(rejected)).length, 1);
  assert.deepEqual(await intent(rejected), { status: "queued", error_code: null });
  assert.deepEqual(await job(rejected), { status: "pending", attempts: 0, last_error_code: null });
  assert.deepEqual(await message(rejected), { status: "queued", error_code: null });
  let log = await audits();
  assert.equal(log.length, 1);
  assert.equal(log[0].action, "delivery.retry");
  assert.deepEqual(log[0].changes, { intentId: rejected, previousError: "provider_rejected:meta_131030", channel: "whatsapp" });

  // 2. A configuration block before any provider call (no whatsapp_messages row yet) is also retryable.
  const config = await seed({ status: "blocked", errorCode: "approved_template_missing", outbox: "dead", message: null });
  assert.equal((await retry(config)).length, 1);
  assert.equal((await intent(config)).status, "queued");

  // 3. A transient failure whose outbox job is waiting to retry can be pulled forward.
  const transient = await seed({ status: "failed", errorCode: "artifact_or_provider_failure", outbox: "failed", message: null });
  assert.equal((await retry(transient)).length, 1);

  // 4. Never retry anything that may already have reached the client, or that the client refused.
  const unsafe: Case[] = [
    { status: "uncertain", errorCode: "provider_ambiguous", outbox: "dead", message: { status: "uncertain" } },
    { status: "blocked", errorCode: "provider_ambiguous", outbox: "dead", message: { status: "uncertain" } },
    { status: "blocked", errorCode: "provider_rejected:meta_131030", outbox: "dead", message: { status: "sending" } },
    { status: "blocked", errorCode: "provider_rejected:meta_131030", outbox: "dead", message: { status: "failed", wamid: "wamid.already" } },
    { status: "blocked", errorCode: "provider_rejected:meta_131030", providerId: "wamid.accepted", outbox: "dead", message: { status: "failed" } },
    { status: "provider_accepted", errorCode: null, outbox: "completed", message: { status: "sent", wamid: "wamid.sent" } },
    { status: "skipped", errorCode: "consent_missing", outbox: "completed", message: null },
    { status: "blocked", errorCode: "provider_rejected:meta_131030", outbox: "processing", message: null },
    { status: "blocked", errorCode: "provider_rejected:meta_131050", outbox: "dead", message: { status: "failed" }, recipient: "+256700000009" },
  ];
  await client.exec(`INSERT INTO whatsapp_contacts(phone,opted_out_at) VALUES ('256700000009',now());`);
  for (const c of unsafe) {
    // A 'processing' outbox row needs a valid lease to satisfy its check constraint.
    const id = c.outbox === "processing" ? await seedProcessing(c) : await seed(c);
    const before = { intent: await intent(id), job: await job(id) };
    assert.equal((await retry(id)).length, 0, `must not retry ${JSON.stringify(c)}`);
    assert.deepEqual({ intent: await intent(id), job: await job(id) }, before);
  }

  // 5. Another organization cannot retry this organization's delivery.
  const foreign = await seed({ status: "blocked", errorCode: "provider_rejected:meta_131030", outbox: "dead", message: { status: "failed" } });
  assert.equal((await retry(foreign, { organizationId: otherOrg, actor })).length, 0);
  assert.equal((await intent(foreign)).status, "blocked");

  // 6. Retrying twice is harmless: the second call finds nothing to requeue.
  assert.equal((await retry(rejected)).length, 0);
  log = await audits();
  assert.equal(log.length, 3, "one audit event per successful retry only");

  console.log("PASS: WhatsApp delivery retry requeues only definitively refused messages, resets the message row, audits once, and never touches uncertain, sent, opted-out or other-organization deliveries.");
}

async function seedProcessing(c: Case) {
  const id = await seed({ ...c, outbox: "dead" });
  await client.query(
    "UPDATE automation_outbox SET status='processing',locked_at=now(),locked_by='worker',lease_expires_at=now()+interval '5 minutes' WHERE payload->>'intentId'=$1",
    [id],
  );
  return id;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
