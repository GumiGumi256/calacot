import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import {
  menuReply,
  selectedAction,
  tree,
  parent,
} from "../lib/customer-care/menu-tree";
import { parseWhatsAppWebhook } from "../lib/whatsapp/webhook";
async function main() {
  for (const screen of Object.keys(tree)) {
    const r = menuReply({ screen }, "Test");
    assert.ok(r.payload.action.sections[0].rows.length <= 10);
    assert.ok(
      r.payload.action.sections[0].rows.every((row) => row.title.length <= 24),
    );
    const row = r.payload.action.sections[0].rows[0];
    assert.equal(
      selectedAction(r.state, row.id, "interactive", false),
      r.state.options[row.id],
    );
    assert.equal(selectedAction(r.state, row.id, "interactive", true), null);
    assert.equal(selectedAction(r.state, "yes", "text", false), null);
    assert.equal(selectedAction(r.state, "forged", "interactive", false), null);
  }
  assert.equal(parent("review"), "quotes");
  const event = parseWhatsAppWebhook(
    {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "456" },
                messages: [
                  {
                    id: "wamid.test",
                    from: "256772123456",
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "interactive",
                    interactive: {
                      list_reply: {
                        id: "opaque-action",
                        title: "Untrusted label",
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    { businessAccountId: "123", phoneNumberId: "456" },
  );
  assert.equal(event.messages[0].body, "opaque-action");
  const remote = process.argv.includes("--postgres");
  config({ path: [".env.local", ".env"], quiet: true });
  if (
    remote &&
    (!process.env.CARE_TEST_DATABASE_URL ||
      process.env.CARE_TEST_DATABASE_APPROVED !== "true")
  )
    throw new Error(
      "Set CARE_TEST_DATABASE_URL and CARE_TEST_DATABASE_APPROVED=true for an isolated migrated target. Never uses DATABASE_URL.",
    );
  if (
    remote &&
    [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED]
      .filter(Boolean)
      .some(
        (url) =>
          new URL(url!).hostname.replace(/-pooler(?=\.)/, "") ===
          new URL(process.env.CARE_TEST_DATABASE_URL!).hostname.replace(
            /-pooler(?=\.)/,
            "",
          ),
      )
  )
    throw new Error(
      "Concurrency target must not be the application database endpoint.",
    );
  const remoteQuery = remote ? neon(process.env.CARE_TEST_DATABASE_URL!) : null;
  const pg = remote
    ? ({
        query: (query: string, params?: unknown[]) =>
          remoteQuery!.query(query, params).then((rows) => ({ rows })),
        close: async () => {},
      } as unknown as PGlite)
    : new PGlite();
  try {
    const journal = JSON.parse(
      await readFile("drizzle-current/meta/_journal.json", "utf8"),
    );
    for (const entry of remote ? [] : journal.entries)
      for (const statement of (
        await readFile(`drizzle-current/${entry.tag}.sql`, "utf8")
      ).split("--> statement-breakpoint"))
        if (statement.trim()) await pg.exec(statement);
    const org = remote ? `org_menu_test_${randomUUID()}` : "org_menu_test",
      phone = remote
        ? `2567${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`
        : "256772123456",
      user = "user_owner",
      account = "123";
    await pg.query(
      "INSERT INTO organizations(id,name,legal_name) VALUES($1,'Test','Test Ltd')",
      [org],
    );
    await pg.query(
      "INSERT INTO whatsapp_contacts(phone,last_inbound_at) VALUES($1,now())",
      [phone],
    );
    await pg.query(
      "INSERT INTO care_conversations(phone,organization_id,business_account_id,clerk_user_id,linked_until) VALUES($1,$2,$3,$4,now()+interval '1 hour')",
      [phone, org, account, user],
    );
    const addJob = async (body = "hello", type = "text", age = 0) => {
      const msg = randomUUID(),
        job = randomUUID(),
        lease = randomUUID();
      await pg.query(
        "INSERT INTO whatsapp_messages(id,customer_phone,direction,message_type,body,event_at) VALUES($1,$2,'inbound',$3,$4,now()+$5*interval '1 second')",
        [msg, phone, type, body, age],
      );
      await pg.query(
        "INSERT INTO care_jobs(id,message_id,phone,state,lease_token,lease_until) VALUES($1,$2,$3,'processing',$4,now()+interval '3 minutes')",
        [job, msg, phone, lease],
      );
      return { msg, job, lease };
    };
    const commit = (
      j: Awaited<ReturnType<typeof addJob>>,
      revision: number,
      state: unknown,
      command = {},
      owner: string | null = null,
    ) =>
      pg.query<{ id: string | null }>(
        "SELECT care_menu_commit($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,300) AS id",
        [
          j.job,
          j.lease,
          revision,
          org,
          account,
          owner,
          JSON.stringify(state),
          JSON.stringify(menuReply({ screen: "main" }, "Test").payload),
          JSON.stringify(command),
          JSON.stringify({
            mode: "capture",
            policy: "full",
            dueDays: 14,
            from: "test@example.test",
            replyTo: "test@example.test",
            templateApproved: false,
          }),
        ],
      );
    const first = await addJob();
    const result = await commit(first, 0, { screen: "main" });
    assert.ok(result.rows[0].id);
    assert.equal(
      (await commit(first, 0, { screen: "main" })).rows[0].id,
      result.rows[0].id,
    );
    const older = await addJob("old", "text", -60);
    assert.equal((await commit(older, 1, { screen: "main" })).rows[0].id, null);
    const next = await addJob();
    await assert.rejects(() => commit(next, 0, { screen: "main" }));
    await assert.rejects(() =>
      commit(next, 1, { screen: "main" }, {}, "user_intruder"),
    );
    await commit(
      next,
      1,
      { screen: "main" },
      { kind: "handoff", reason: "test" },
    );
    assert.equal(
      (
        await pg.query<{ mode: string }>(
          "SELECT mode FROM care_conversations WHERE phone=$1",
          [phone],
        )
      ).rows[0].mode,
      "human",
    );
    const duringHuman = await addJob();
    assert.equal(
      (await commit(duringHuman, 2, { screen: "main" })).rows[0].id,
      null,
    );
    const resume = await addJob("resume");
    await commit(resume, 2, { screen: "main" }, { kind: "resume" });
    // Build an actual sent quotation using the existing commercial functions.
    const client = (
      await pg.query<{ id: string }>(
        "SELECT sales_client($1,'staff',$2::jsonb,'test') AS id",
        [
          org,
          JSON.stringify({
            kind: "individual",
            displayName: "Owner",
            department: "architecture",
            contacts: [
              { name: "Owner", email: "owner@example.test", isPrimary: true },
            ],
            billingAddress: {},
          }),
        ],
      )
    ).rows[0].id;
    await pg.query("UPDATE clients SET clerk_user_id=$1 WHERE id=$2", [
      user,
      client,
    ]);
    const contact = (
      await pg.query<{ id: string }>(
        "SELECT id FROM client_contacts WHERE client_id=$1",
        [client],
      )
    ).rows[0].id;
    const project = (
      await pg.query<{ id: string }>(
        "SELECT sales_project($1,'staff',$2::jsonb,'test') AS id",
        [
          org,
          JSON.stringify({
            clientId: client,
            name: "Test project",
            division: "architecture",
            currency: "UGX",
            scope: "Test",
          }),
        ],
      )
    ).rows[0].id;
    const quote = (
      await pg.query<{ id: string }>(
        "SELECT sales_quote_save($1,'staff',$2::jsonb,'test') AS id",
        [
          org,
          JSON.stringify({
            clientId: client,
            projectId: project,
            contactId: contact,
            title: "Test quote",
            division: "architecture",
            currency: "UGX",
            scope: "Test scope",
            deliverables: [],
            exclusions: [],
            terms: "Test terms",
            validUntil: new Date(Date.now() + 86400000).toISOString(),
            subtotal: "100.00",
            discountAmount: "0.00",
            taxAmount: "0.00",
            total: "100.00",
            items: [
              {
                description: "Test",
                unit: "item",
                quantity: "1",
                unitPrice: "100.00",
                discountAmount: "0",
                taxRate: "0",
                subtotal: "100.00",
                taxAmount: "0",
                total: "100.00",
              },
            ],
            schedules: [{ label: "Full", amount: "100.00" }],
          }),
        ],
      )
    ).rows[0].id;
    const version = (
      await pg.query<{ id: string; revision: number }>(
        "SELECT id,revision FROM quotation_versions WHERE quotation_id=$1",
        [quote],
      )
    ).rows[0];
    const cfg = {
      mode: "capture",
      policy: "full",
      dueDays: 14,
      taxRate: "0",
      from: "test@example.test",
      replyTo: "test@example.test",
      templateApproved: false,
    };
    await pg.query(
      "SELECT sales_quote_command($1,'staff',$2,$3,$4,'send','{}',$5::jsonb,'send-test')",
      [org, quote, version.id, version.revision, JSON.stringify(cfg)],
    );
    const review = menuReply(
      { screen: "review", versionId: version.id },
      "Review",
    );
    const action = Object.entries(review.state.options).find(
      ([, v]) => v === "accept",
    )![0];
    const reviewJob = await addJob();
    await commit(reviewJob, 3, review.state, {}, user);
    const forged = await addJob(`care:${randomUUID()}`, "interactive");
    await assert.rejects(() =>
      commit(forged, 4, { screen: "invoices" }, { kind: "confirm" }, user),
    );
    const typedAction = await addJob(action, "text");
    await assert.rejects(() =>
      commit(typedAction, 4, { screen: "invoices" }, { kind: "confirm" }, user),
    );
    const expiring = await addJob(action, "interactive");
    await pg.query(
      "UPDATE care_conversations SET session_expires_at=now()-interval '1 second' WHERE phone=$1",
      [phone],
    );
    await assert.rejects(() =>
      commit(expiring, 4, { screen: "invoices" }, { kind: "confirm" }, user),
    );
    await pg.query(
      "UPDATE care_conversations SET session_expires_at=now()+interval '5 minutes' WHERE phone=$1",
      [phone],
    );
    const newer = randomUUID();
    await pg.query(
      "INSERT INTO quotation_versions(id,organization_id,quotation_id,version,customer_snapshot,issuer_snapshot,scope,terms,currency) VALUES($1,$2,$3,2,'{}','{}','Revision','Revision terms','UGX')",
      [newer, org, quote],
    );
    await assert.rejects(() =>
      commit(expiring, 4, { screen: "invoices" }, { kind: "confirm" }, user),
    );
    await pg.query("DELETE FROM quotation_versions WHERE id=$1", [newer]);
    await pg.query(
      "UPDATE quotation_versions SET status='expired' WHERE id=$1",
      [version.id],
    );
    await assert.rejects(() =>
      commit(expiring, 4, { screen: "invoices" }, { kind: "confirm" }, user),
    );
    await pg.query("UPDATE quotation_versions SET status='sent' WHERE id=$1", [
      version.id,
    ]);
    const accept = await addJob(action, "interactive");
    await Promise.all([
      commit(accept, 4, { screen: "invoices" }, { kind: "confirm" }, user),
      pg.query(
        "SELECT sales_quote_command($1,'staff',$2,$3,NULL,'confirm','{}',$4::jsonb,'concurrent')",
        [org, quote, version.id, JSON.stringify(cfg)],
      ),
    ]);
    assert.equal(
      (
        await pg.query<{ status: string }>(
          "SELECT status FROM quotation_versions WHERE id=$1",
          [version.id],
        )
      ).rows[0].status,
      "accepted",
    );
    await commit(accept, 4, { screen: "invoices" }, { kind: "confirm" }, user);
    // A simultaneous/repeated staff acceptance returns the very same initial invoice.
    await pg.query(
      "SELECT sales_quote_command($1,'staff',$2,$3,NULL,'confirm','{}',$4::jsonb,'repeat')",
      [org, quote, version.id, JSON.stringify(cfg)],
    );
    assert.equal(
      (
        await pg.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM invoices WHERE quotation_version_id=$1",
          [version.id],
        )
      ).rows[0].count,
      1,
    );
    assert.equal(
      (
        await pg.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM delivery_intents WHERE entity_type='invoice' AND organization_id=$1",
          [org],
        )
      ).rows[0].count,
      2,
    );
    if (!remote)
      assert.equal(
        (
          await pg.query<{ type: string }>(
            "SELECT actor_type AS type FROM audit_logs WHERE action='quotation.confirm'",
          )
        ).rows[0].type,
        "customer",
      );
    console.log(
      "PASS: nested menu limits, opaque selections, expiry, webhook IDs, leases, deduplication, delayed messages, identity rejection, persistent handoff/resume, exact-version customer acceptance and repeated staff confirmation with one invoice/two intents.",
    );
    if (remote)
      console.log("Isolated concurrency fixture retained for inspection:", org);
  } finally {
    await pg.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
