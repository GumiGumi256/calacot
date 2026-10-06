import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Resend } from "resend";
import { totals, scaled } from "../lib/sales/money";
import { parseQuery, literalSearch, quoteSchema, clientSchema } from "../lib/sales/contracts";
import { listQueries } from "../lib/sales/queries";
import {
  recoveryDecision,
  whatsappEligible,
  backoff,
} from "../lib/sales/worker-policy";
import { renderCommercialPdf } from "../lib/sales/pdf";
import { emailContent } from "../lib/sales/email";
import type { DocumentSnapshot } from "../lib/sales/document-model";
import { verifyWebhookSignature } from "../lib/whatsapp/security";
import { createRequire } from "node:module";
async function main() {
  const line = {
    description: "Architectural design",
    unit: "item",
    quantity: "1.0050",
    unitPrice: "1.00",
    discountAmount: "0.01",
    taxRate: "18.00",
  };
  assert.equal(totals([line], "18").total, "1.18");
  assert.throws(() => totals([{ ...line, discountAmount: "99" }], "18"));
  assert.throws(() => totals([line], "0"));
  assert.throws(() => scaled("1e10"));
  assert.throws(() => scaled("-1"));
  assert.equal(
    parseQuery({
      size: "9999",
      page: "-1",
      sort: "DROP TABLE",
      currency: "EUR",
    }).size,
    25,
  );
  assert.equal(parseQuery({ page: "999999999" }).page, 1);
  assert.equal(literalSearch("100%_\\"), "%100\\%\\_\\\\%");
  assert.equal(
    recoveryDecision("whatsapp", new Date().toISOString(), null),
    "uncertain",
  );
  assert.equal(
    recoveryDecision(
      "email",
      new Date(Date.now() - 25 * 3600000).toISOString(),
      null,
    ),
    "uncertain",
  );
  assert.equal(
    recoveryDecision("email", new Date().toISOString(), null),
    "retry",
  );
  assert.equal(recoveryDecision("email", null, "provider-1"), "complete");
  assert.equal(
    backoff(1, 60, () => 0),
    60,
  );
  assert.equal(
    whatsappEligible({ recipient: "+256700000000" }, false),
    "consent_missing",
  );
  assert.equal(
    whatsappEligible(
      {
        recipient: "+256700000000",
        consentAt: "now",
        consentSource: "signed",
        template: "utility",
        approved: true,
      },
      true,
    ),
    "recipient_opted_out",
  );
  assert.equal(
    whatsappEligible(
      {
        recipient: "+256700000000",
        consentAt: "now",
        consentSource: "signed",
        template: "utility",
        approved: true,
      },
      false,
    ),
    null,
  );
  assert.equal(
    verifyWebhookSignature(Buffer.from("{}"), "sha256=bad", "secret"),
    false,
  );
  assert.throws(() =>
    new Resend("test").webhooks.verify({
      payload: "{}",
      headers: { id: "bad", timestamp: "0", signature: "bad" },
      webhookSecret: "whsec_" + Buffer.from("secret").toString("base64"),
    }),
  );
  const pg = new PGlite();
  const db = drizzle(pg);
  const journal = JSON.parse(
    await readFile("drizzle/meta/_journal.json", "utf8"),
  );
  // Existing custom 0005-0007 overlap generated 0008. Preserve history; test the generated baseline.
  const legacyClient = randomUUID(), legacyContact = randomUUID();
  for (const entry of journal.entries.filter(
    (e: { idx: number }) => ![5, 6, 7].includes(e.idx),
  )) {
    if (entry.idx === 11) {
      await pg.query("INSERT INTO organizations(id,name,legal_name) VALUES('org_client_migration_test','Migration fixture','Migration Fixture Ltd')");
      await pg.query("INSERT INTO clients(id,organization_id,kind,display_name,legal_name,notes) VALUES($1,'org_client_migration_test','company','Existing trading identity','Existing Legal Ltd','Historical note')",[legacyClient]);
      await pg.query("INSERT INTO client_contacts(id,organization_id,client_id,name,phone,is_primary,whatsapp_consent_at,whatsapp_consent_source) VALUES($1,'org_client_migration_test',$2,'Historical contact','+256700000000',true,now(),'Previously verified')",[legacyContact,legacyClient]);
    }
    const source = await readFile(`drizzle/${entry.tag}.sql`, "utf8");
    for (const statement of source.split("--> statement-breakpoint")) {
      if (statement.trim()) await pg.exec(statement);
    }
  }
  const preserved = (await pg.query<{display_name:string;notes:string;department:string|null;trading_name:string|null}>("SELECT display_name,notes,department,trading_name FROM clients WHERE id=$1",[legacyClient])).rows[0];
  assert.deepEqual(preserved,{display_name:"Existing trading identity",notes:"Historical note",department:null,trading_name:null});
  assert.equal((await pg.query<{source:string}>("SELECT whatsapp_consent_source AS source FROM client_contacts WHERE id=$1",[legacyContact])).rows[0].source,"Previously verified");
  console.log(
    "PASS: additive migrations through 0011 apply on isolated PostgreSQL-compatible baseline and preserve historical client identities, notes and consent",
  );
  const org = "org_sales_test",
    other = "org_other_test",
    actor = "user_staff_test";
  await pg.query(
    "INSERT INTO organizations(id,name,legal_name,email) VALUES($1,'Example Calacot','Example Calacot Ltd','billing@example.test'),($2,'Other','Other',NULL)",
    [org, other],
  );
  await pg.query(
    "INSERT INTO staff_memberships(organization_id,clerk_user_id) VALUES($1,$2)",
    [org, actor],
  );
  const clientPayload = {
    kind: "company",
    department: "architecture",
    displayName: "Example 100%_ Client",
    legalName: "Example Client Ltd",
    taxIdentifier: "",
    billingAddress: {
      line1: "Example Street",
      city: "Example City",
      country: "Uganda",
    },
    notes: "Private notes must never appear in PDF",
    contacts: [
      {
        name: "Sample Contact",
        email: "contact@example.test",
        phone: "+256700000000",
        isPrimary: true,
      },
    ],
  };
  assert.equal(clientSchema.safeParse({...clientPayload,kind:"individual",legalName:"",taxIdentifier:""}).success,true);
  assert.equal(clientSchema.safeParse({...clientPayload,legalName:""}).success,false);
  assert.equal(clientSchema.safeParse({...clientPayload,department:undefined}).success,false);
  assert.equal(clientSchema.parse({...clientPayload,tradingName:"Example Trading"}).displayName,"Example Trading");
  const cid = (
    await pg.query<{ id: string }>(
      "SELECT sales_client($1,$2,$3::jsonb,$4) AS id",
      [org, actor, JSON.stringify(clientPayload), randomUUID()],
    )
  ).rows[0].id;
  const cid2 = (
    await pg.query<{ id: string }>(
      "SELECT sales_client($1,$2,$3::jsonb,$4) AS id",
      [
        org,
        actor,
        JSON.stringify({ ...clientPayload, displayName: "Second Client" }),
        randomUUID(),
      ],
    )
  ).rows[0].id;
  const contact = (
    await pg.query<{ id: string }>(
      "SELECT id FROM client_contacts WHERE client_id=$1",
      [cid],
    )
  ).rows[0].id;
  await pg.query("UPDATE clients SET notes='Historical note' WHERE id=$1",[cid]);
  await pg.query("UPDATE client_contacts SET whatsapp_consent_at=now(),whatsapp_consent_source='Prior verified permission' WHERE id=$1",[contact]);
  const editClient = (phone:string) => pg.query("SELECT sales_client($1,$2,$3::jsonb,$4)",[org,actor,JSON.stringify({...clientPayload,id:cid,contacts:[{...clientPayload.contacts[0],id:contact,phone}]}),randomUUID()]);
  await editClient(clientPayload.contacts[0].phone);
  assert.equal((await pg.query<{source:string}>("SELECT whatsapp_consent_source AS source FROM client_contacts WHERE id=$1",[contact])).rows[0].source,"Prior verified permission");
  assert.equal((await pg.query<{notes:string}>("SELECT notes FROM clients WHERE id=$1",[cid])).rows[0].notes,"Historical note");
  await editClient("+256700000001");
  assert.equal((await pg.query<{source:string|null}>("SELECT whatsapp_consent_source AS source FROM client_contacts WHERE id=$1",[contact])).rows[0].source,null);
  await editClient(clientPayload.contacts[0].phone);
  console.log("PASS: separate company/individual validation, department requirement, trading names, historical note preservation and phone-bound consent preservation/reset");
  const project = (
    await pg.query<{ id: string }>(
      "SELECT sales_project($1,$2,$3::jsonb,$4) AS id",
      [
        org,
        actor,
        JSON.stringify({
          clientId: cid,
          name: "Example planned project",
          division: "architecture",
          currency: "UGX",
          scope: "Scope",
          managerId: "",
          startsOn: "",
          dueOn: "",
        }),
        randomUUID(),
      ],
    )
  ).rows[0].id;
  const calculated = totals(
    [
      {
        ...line,
        quantity: "2",
        unitPrice: "100.00",
        discountAmount: "0",
        taxRate: "0",
      },
    ],
    "0",
  );
  const input = {
    revision: 0,
    clientId: cid,
    projectId: project,
    contactId: contact,
    title: "Example commercial quote",
    division: "architecture",
    currency: "UGX",
    scope: "Sample agreed design scope",
    deliverables: ["Design drawings"],
    exclusions: ["Construction execution"],
    terms: "Payment within fourteen days of issue.",
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
    schedules: [
      { label: "Deposit", amount: "50.00", dueAt: "" },
      { label: "Completion", amount: "150.00", dueAt: "" },
    ],
    ...calculated,
  };
  assert.equal(
    quoteSchema.safeParse({ ...input, projectId: undefined }).success,
    false,
  );
  const save = (p: unknown, organization = org) =>
    pg.query<{ id: string }>(
      "SELECT sales_quote_save($1,$2,$3::jsonb,$4) AS id",
      [organization, actor, JSON.stringify(p), randomUUID()],
    );
  for (const invalid of [
    { ...input, projectId: null },
    { ...input, clientId: cid2 },
    { ...input, projectId: randomUUID() },
  ])
    await assert.rejects(() => save(invalid));
  await assert.rejects(() => save(input, other));
  await pg.query("UPDATE projects SET archived_at=now() WHERE id=$1", [
    project,
  ]);
  await assert.rejects(() => save(input));
  await pg.query("UPDATE projects SET archived_at=NULL WHERE id=$1", [project]);
  const qid = (await save(input)).rows[0].id;
  const v = (
    await pg.query<{ id: string; revision: number }>(
      "SELECT id,revision FROM quotation_versions WHERE quotation_id=$1",
      [qid],
    )
  ).rows[0];
  await assert.rejects(() => save({ ...input, id: qid, revision: 0 }));
  const logo = await readFile("public/calacot-logo.png");
  const config = {
    mode: "capture",
    policy: "full",
    dueDays: 14,
    from: "billing@example.test",
    replyTo: "billing@example.test",
    instructions: "",
    brand: {
      template: "calacot-commercial-v1",
      logo: "calacot-logo.png",
      logoSha256: createHash("sha256").update(logo).digest("hex"),
      logoBase64: logo.toString("base64"),
    },
    template: "",
    language: "en",
    templateApproved: false,
  };
  const command = (cmd: string, p: unknown = {}, version = v.id) =>
    pg.query<{ result: { invoiceId: string } }>(
      "SELECT sales_quote_command($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9) AS result",
      [
        org,
        actor,
        qid,
        version,
        v.revision,
        cmd,
        JSON.stringify(p),
        JSON.stringify(config),
        randomUUID(),
      ],
    );
  await command("send");
  await command("send");
  await assert.rejects(() => save({ ...input, id: qid, revision: v.revision }));
  await assert.rejects(() =>
    pg.query(
      "UPDATE quotation_items SET unit_price=2 WHERE quotation_version_id=$1",
      [v.id],
    ),
  );
  assert.equal(
    (
      await pg.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM delivery_intents",
      )
    ).rows[0].count,
    1,
  );
  await assert.rejects(() => command("confirm", { acceptedBy: "Only a name" }));
  const acceptance = {
    source: "email",
    acceptedBy: "Verified Example Client",
    acceptedAt: new Date().toISOString(),
    evidence: "Verified email reference: sample-evidence-001",
  };
  const confirmations = await Promise.all([
    command("confirm", acceptance),
    command("confirm", acceptance),
  ]);
  const iid = confirmations[0].rows[0].result.invoiceId;
  assert.equal(confirmations[1].rows[0].result.invoiceId, iid);
  assert.equal(
    (
      await pg.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM invoices",
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (
      await pg.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM delivery_intents",
      )
    ).rows[0].count,
    3,
  );
  assert.equal(
    (
      await pg.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM payments",
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await pg.query<{ status: string }>(
        "SELECT status FROM projects WHERE id=$1",
        [project],
      )
    ).rows[0].status,
    "planned",
  );
  await assert.rejects(() =>
    pg.query("UPDATE invoices SET total=201,subtotal=201 WHERE id=$1", [iid]),
  );
  await assert.rejects(() => command("revise"));
  const snap = (
    await pg.query<{ document_snapshot: DocumentSnapshot }>(
      "SELECT document_snapshot FROM invoices WHERE id=$1",
      [iid],
    )
  ).rows[0].document_snapshot;
  await pg.query(
    "UPDATE clients SET display_name='Renamed later' WHERE id=$1",
    [cid],
  );
  assert.equal(
    (
      await pg.query<{ document_snapshot: DocumentSnapshot }>(
        "SELECT document_snapshot FROM invoices WHERE id=$1",
        [iid],
      )
    ).rows[0].document_snapshot.customer.name,
    snap.customer.name,
  );
  const key = randomUUID();
  const payment = {
    command: "submit",
    invoiceId: iid,
    amount: "75.00",
    method: "bank_transfer",
    reference: "EXAMPLE-PAY-1",
    receivedAt: new Date().toISOString(),
    key,
  };
  const pid = (
    await pg.query<{ id: string }>(
      "SELECT sales_payment($1,$2,$3::jsonb,$4) AS id",
      [org, actor, JSON.stringify(payment), randomUUID()],
    )
  ).rows[0].id;
  const verification = {
    ...payment,
    command: "verify",
    paymentId: pid,
    evidence: "Verified sandbox bank record",
  };
  await pg.query("SELECT sales_payment($1,$2,$3::jsonb,$4)", [
    org,
    actor,
    JSON.stringify(verification),
    randomUUID(),
  ]);
  const list = listQueries(org, "invoices", parseQuery({ payment: "partial" }));
  const balance = await db.execute<{ balance: string }>(list.rows(1));
  assert.equal(balance.rows[0].balance, "125.00");
  await assert.rejects(() =>
    pg.query("SELECT sales_invoice_command($1,$2,$3,'void',$4::jsonb,$5)", [
      org,
      actor,
      iid,
      JSON.stringify({ reason: "Cannot remove paid allocations" }),
      randomUUID(),
    ]),
  );
  const literal = listQueries(org, "clients", parseQuery({ search: "100%_" }));
  assert.equal(
    (await db.execute<{ count: number }>(literal.count)).rows[0].count,
    0,
  ); // renamed; literal input never expands wildcards
  const count = listQueries(
    org,
    "quotations",
    parseQuery({ status: "accepted" }),
  );
  assert.equal(
    (await db.execute<{ count: number }>(count.count)).rows[0].count,
    1,
  );
  const job = (
    await pg.query<{ id: string }>(
      "SELECT id FROM sales_claim('worker-one',$1)",
      [org],
    )
  ).rows[0];
  assert.ok(job);
  await pg.query(
    "UPDATE automation_outbox SET locked_at=now()-interval '10 minutes',lease_expires_at=now()-interval '1 second' WHERE id=$1",
    [job.id],
  );
  const reclaimed = (
    await pg.query<{ id: string; locked_by: string }>(
      "SELECT * FROM sales_claim('worker-two',$1)",
      [org],
    )
  ).rows[0];
  assert.equal(reclaimed.id, job.id);
  assert.equal(reclaimed.locked_by, "worker-two");
  assert.equal(
    (
      await pg.query(
        "UPDATE automation_outbox SET status='dead' WHERE id=$1 AND locked_by='worker-one' RETURNING id",
        [job.id],
      )
    ).rows.length,
    0,
  );
  const intent = (
    await pg.query<{ id: string }>(
      "SELECT id FROM delivery_intents WHERE channel='email' AND entity_type='invoice'",
    )
  ).rows[0].id;
  await pg.query(
    "INSERT INTO sales_webhook_inbox(id,provider,payload) VALUES('early','resend',$1::jsonb)",
    [
      JSON.stringify({
        type: "email.delivered",
        data: { email_id: "early-id" },
      }),
    ],
  );
  await pg.query("SELECT sales_webhook_apply()");
  assert.equal(
    (
      await pg.query<{ processed_at: string | null }>(
        "SELECT processed_at FROM sales_webhook_inbox WHERE id='early'",
      )
    ).rows[0].processed_at,
    null,
  );
  await pg.query(
    "UPDATE delivery_intents SET provider_id='early-id',status='provider_accepted' WHERE id=$1",
    [intent],
  );
  await pg.query("SELECT sales_webhook_apply()");
  assert.equal(
    (
      await pg.query<{ status: string }>(
        "SELECT status FROM delivery_intents WHERE id=$1",
        [intent],
      )
    ).rows[0].status,
    "delivered",
  );
  await pg.query(
    "INSERT INTO sales_webhook_inbox(id,provider,payload) VALUES('late','resend',$1::jsonb)",
    [JSON.stringify({ type: "email.sent", data: { email_id: "early-id" } })],
  );
  await pg.query("SELECT sales_webhook_apply()");
  assert.equal(
    (
      await pg.query<{ status: string }>(
        "SELECT status FROM delivery_intents WHERE id=$1",
        [intent],
      )
    ).rows[0].status,
    "delivered",
  );
  console.log(
    "PASS: relationship validation, revision conflicts, repeated confirmation, invoice/payment separation, immutable snapshots, ledger balances, filtered queries, leases and early/out-of-order webhook reconciliation",
  );
  // Execute the actual worker against PGlite; providers are replaced only in the compiled test bundle.
  const globals=globalThis as unknown as Record<string,unknown>;
  globals.__salesTestDb=db;
  globals.__salesTestEmail=null;
  globals.__salesTestWhatsApp=()=>{throw new Error("A routine test must never call WhatsApp");};
  process.env.CALACOT_CLERK_ORG_ID=org;
  process.env.SALES_NOTIFICATION_MODE="capture";
  process.env.SALES_SHARE_SECRET="isolated-test-share-secret-only-00000000";
  process.env.CALACOT_APP_URL="http://localhost:3000";
  const require=createRequire(import.meta.url);
  const {runSalesWorker}=require("../tmp/sales-test/worker.cjs") as {runSalesWorker:(limit:number)=>Promise<unknown>};
  await pg.query("UPDATE automation_outbox SET status='pending',locked_at=NULL,locked_by=NULL,lease_expires_at=NULL,available_at=now() WHERE status='processing'");
  await runSalesWorker(10);
  assert.equal((await pg.query<{status:string}>("SELECT status FROM delivery_intents WHERE channel='whatsapp'")).rows[0].status,"skipped");
  assert.equal((await pg.query<{count:number}>("SELECT count(*)::int AS count FROM documents")).rows[0].count,1); // invoice email already delivered via the test webhook
  const artifacts=(await pg.query<{count:number}>("SELECT count(*)::int AS count FROM documents")).rows[0].count;
  await runSalesWorker(10);
  assert.equal((await pg.query<{count:number}>("SELECT count(*)::int AS count FROM documents")).rows[0].count,artifacts);
  assert.equal((await pg.query<{status:string}>("SELECT status FROM delivery_intents WHERE entity_type='quotation'")).rows[0].status,"captured");
  console.log("PASS: actual outbox worker persists/reuses private PDF, captures email, skips unconsented WhatsApp and never repeats successful channels");
  await mkdir("tmp/pdfs", { recursive: true });
  const normal = await renderCommercialPdf(snap);
  await writeFile("tmp/pdfs/sales-invoice.pdf", normal);
  const long = {
    ...snap,
    subtotal: "14000.00",
    discountAmount: "0.00",
    taxAmount: "0.00",
    total: "14000.00",
    schedules: [{label: "Deposit", amount: "3500.00", dueAt: ""}, {label: "Completion", amount: "10500.00", dueAt: ""}],
    customer: {
      ...snap.customer,
      name: "Example international organization with a deliberately long legal name for document wrapping and multipage verification",
    },
    items: Array.from({ length: 70 }, (_, i) => ({
      ...snap.items[0],
      description: `Sample service ${i + 1}: Long description of architectural coordination, deliverables, review meetings, drawings and technical design details.`,
      position: i,
    })),
  };
  await writeFile(
    "tmp/pdfs/sales-invoice-long.pdf",
    await renderCommercialPdf(long),
  );
  await writeFile(
    "tmp/pdfs/sales-quotation-draft.pdf",
    await renderCommercialPdf(
      { ...snap, type: "quotation", number: "DRAFT" },
      true,
    ),
  );
  const email = await emailContent(
    snap,
    "https://example.test/private-document",
  );
  assert.ok(email.text.includes("Payment remains due"));
  assert.ok(!email.html.includes(clientPayload.notes));
  await writeFile("tmp/pdfs/sales-invoice-email.html", email.html);
  console.log(
    "PASS: branded PDF and React Email fixtures generated without external sends",
  );
  await pg.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
