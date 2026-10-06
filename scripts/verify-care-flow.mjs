import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
await mkdir("tmp/care-test", { recursive: true });
await build({
  entryPoints: ["lib/customer-care/worker.ts"],
  outfile: "tmp/care-test/worker.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  plugins: [
    {
      name: "isolated-care-services",
      setup(b) {
        b.onResolve({ filter: /^server-only$/ }, () => ({
          path: "empty",
          namespace: "test",
        }));
        b.onResolve({ filter: /^@\/database\/db$/ }, () => ({
          path: "db",
          namespace: "test",
        }));
        b.onResolve({ filter: /^@\/lib\/sales\/artifacts$/ }, () => ({
          path: "artifacts",
          namespace: "test",
        }));
        b.onResolve({ filter: /^\.\/knowledge$/ }, () => ({
          path: "knowledge",
          namespace: "test",
        }));
        b.onResolve({ filter: /^@\/lib\/whatsapp\/client$/ }, () => ({
          path: "transport",
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
          contents:
            path === "empty"
              ? ""
              : path === "db"
                ? "export const db=globalThis.__careDb;"
                : path === "knowledge"
                  ? "export async function loadCompanyProfile(){return {businessUnits:[{unit:'architecture',description:'Approved architecture service information.'}]};}"
                  : path === "artifacts"
                    ? "export async function finalArtifact(){return {id:'00000000-0000-4000-8000-000000000001'};} export async function artifactShare(){return 'https://example.test/private-document';}"
                    : "export async function sendWhatsAppInteractiveList(...args){return globalThis.__careSend(...args);} export async function sendWhatsAppText(...args){return globalThis.__careSend(...args);}",
        }));
      },
    },
  ],
});
const pg = new PGlite();
try {
  const journal = JSON.parse(
    await readFile("drizzle-current/meta/_journal.json", "utf8"),
  );
  for (const entry of journal.entries)
    for (const statement of (
      await readFile(`drizzle-current/${entry.tag}.sql`, "utf8")
    ).split("--> statement-breakpoint"))
      if (statement.trim()) await pg.exec(statement);
  globalThis.__careDb = drizzle(pg);
  let sends = 0;
  globalThis.__careSend = async () => {
    sends++;
    return { ok: true, wamid: `wamid.test.${sends}` };
  };
  Object.assign(process.env, {
    CUSTOMER_CARE_ENABLED: "true",
    CUSTOMER_CARE_MODE: "menu",
    CUSTOMER_CARE_NOTIFICATION_MODE: "capture",
    CALACOT_CLERK_ORG_ID: "org_flow_test",
    WHATSAPP_BUSINESS_ACCOUNT_ID: "123",
    CALACOT_APP_URL: "https://example.test",
  });
  const { runCareWorker } = createRequire(import.meta.url)(
    "../tmp/care-test/worker.cjs",
  );
  const phone = "256772123456",
    org = "org_flow_test",
    user = "user_owner";
  await pg.query(
    "INSERT INTO organizations(id,name,legal_name) VALUES($1,'Fixture','Fixture Ltd')",
    [org],
  );
  await pg.query(
    "INSERT INTO whatsapp_contacts(phone,last_inbound_at) VALUES($1,now())",
    [phone],
  );
  await pg.query(
    "INSERT INTO care_conversations(phone,organization_id,business_account_id) VALUES($1,$2,'123')",
    [phone, org],
  );
  const state = async () =>
    (
      await pg.query(
        "SELECT menu_state,mode FROM care_conversations WHERE phone=$1",
        [phone],
      )
    ).rows[0];
  const send = async (body, type = "text") => {
    const id = randomUUID();
    await pg.query(
      "INSERT INTO whatsapp_messages(id,customer_phone,direction,message_type,body,event_at) VALUES($1,$2,'inbound',$3,$4,now())",
      [id, phone, type, body],
    );
    await pg.query("INSERT INTO care_jobs(message_id,phone) VALUES($1,$2)", [
      id,
      phone,
    ]);
    await runCareWorker(1);
    return state();
  };
  const choose = async (action) => {
    const s = await state();
    const id = Object.entries(s.menu_state.options).find(
      ([, value]) => value === action,
    )?.[0];
    assert.ok(id, `Missing handler option ${action}`);
    return send(id, "interactive");
  };
  assert.equal((await send("hi")).menu_state.screen, "main");
  await choose("services");
  await choose("service:architecture");
  assert.equal((await state()).menu_state.screen, "service");
  assert.equal((await send("not an option")).menu_state.screen, "service");
  await choose("start_selected");
  await send("Fixture Customer");
  await send("Architecture project in Kampala.");
  assert.equal((await state()).menu_state.screen, "summary");
  await choose("submit");
  assert.equal(
    (
      await pg.query(
        "SELECT count(*)::int AS count FROM care_requests WHERE kind='lead'",
      )
    ).rows[0].count,
    1,
  );
  await choose("quotes");
  await choose("quote_latest");
  assert.equal((await state()).menu_state.screen, "verification");
  await pg.query(
    "UPDATE care_conversations SET clerk_user_id=$1,linked_until=now()+interval '1 hour' WHERE phone=$2",
    [user, phone],
  );
  await choose("verified");
  await choose("quotes");
  await choose("quote_confirm");
  const missing = (
    await pg.query(
      "SELECT body FROM whatsapp_messages WHERE direction='outbound' ORDER BY created_at DESC LIMIT 1",
    )
  ).rows[0].body;
  assert.match(missing, /couldn.t find a quotation/);
  // Previously authenticated user ownership is required by the real record queries.
  const client = randomUUID(),
    project = randomUUID();
  await pg.query(
    "INSERT INTO clients(id,organization_id,display_name,clerk_user_id) VALUES($1,$2,'Fixture',$3)",
    [client, org, user],
  );
  await pg.query(
    "INSERT INTO projects(id,organization_id,client_id,code,name,division,currency) VALUES($1,$2,$3,'TEST-P','Fixture project','architecture','UGX')",
    [project, org, client],
  );
  const quote = randomUUID(),
    version = randomUUID();
  await pg.query(
    "INSERT INTO quotations(id,organization_id,client_id,project_id,title,number,division) VALUES($1,$2,$3,$4,'Fixture quote','TEST-Q','architecture')",
    [quote, org, client, project],
  );
  await pg.query(
    "INSERT INTO quotation_versions(id,organization_id,quotation_id,version,status,sent_at,valid_until,scope,currency,total,subtotal,document_snapshot,customer_snapshot,issuer_snapshot,terms) VALUES($1,$2,$3,1,'sent',now(),now()+interval '1 day','Fixture','UGX',100,100,$4::jsonb,'{}','{}','Fixture terms')",
    [
      version,
      org,
      quote,
      JSON.stringify({
        project: "Fixture project",
        customer: { email: "fixture@example.test" },
      }),
    ],
  );
  await choose("quote_confirm");
  assert.equal((await state()).menu_state.screen, "review");
  await send("yes");
  assert.equal(
    (
      await pg.query("SELECT status FROM quotation_versions WHERE id=$1", [
        version,
      ])
    ).rows[0].status,
    "sent",
  );
  await send("cancel");
  await choose("quotes");
  await choose("quote_latest");
  assert.equal((await state()).menu_state.screen, "quotes");
  await pg.query("UPDATE quotation_versions SET status='expired' WHERE id=$1", [
    version,
  ]);
  await choose("quote_confirm");
  assert.equal((await state()).menu_state.screen, "quotes");
  await pg.query(
    "UPDATE quotation_versions SET status='superseded' WHERE id=$1",
    [version],
  );
  await choose("quote_confirm");
  assert.equal((await state()).menu_state.screen, "quotes");
  await pg.query(
    "UPDATE quotation_versions SET status='accepted',accepted_at=now(),accepted_by_name='Fixture Owner' WHERE id=$1",
    [version],
  );
  await choose("quote_confirm");
  assert.equal((await state()).menu_state.screen, "quotes");
  const current = (await state()).menu_state.options;
  await pg.query(
    "UPDATE care_conversations SET session_expires_at=now()-interval '1 second' WHERE phone=$1",
    [phone],
  );
  await send(Object.keys(current)[0], "interactive");
  assert.equal((await state()).menu_state.screen, "main");
  await choose("invoices");
  await choose("invoice_latest");
  await choose("invoice_outstanding");
  await choose("pay");
  await send("menu");
  await choose("purchases");
  await choose("purchase_latest");
  await choose("purchase_reference");
  await send("bad reference");
  assert.equal((await state()).menu_state.screen, "reference");
  await send("menu");
  await choose("team");
  assert.equal((await state()).mode, "human");
  const before = (
    await pg.query(
      "SELECT count(*)::int AS count FROM whatsapp_messages WHERE direction='outbound'",
    )
  ).rows[0].count;
  await send("hello again");
  assert.equal(
    (
      await pg.query(
        "SELECT count(*)::int AS count FROM whatsapp_messages WHERE direction='outbound'",
      )
    ).rows[0].count,
    before,
  );
  await send("resume");
  assert.equal((await state()).mode, "bot");
  assert.equal(sends, 0, "Capture must never invoke transport");
  process.env.CUSTOMER_CARE_NOTIFICATION_MODE = "staging";
  process.env.CUSTOMER_CARE_SEND_ALLOWLIST = phone;
  await send("menu");
  assert.equal(sends, 1, "Allowlisted staging should use existing transport");
  const latestReply = async () => (
    await pg.query("SELECT body,status,message_type FROM whatsapp_messages WHERE direction='outbound' ORDER BY created_at DESC LIMIT 1")
  ).rows[0];
  // Actual owned database records return status; a newer other customer's
  // purchase must never appear in the linked customer's response.
  const ownedReference = "CAL-DES-AAAAAAAAAAAAAAAA";
  for (const [owner, reference] of [[user, ownedReference], ["other_owner", "CAL-DES-BBBBBBBBBBBBBBBB"]]) {
    await pg.query("INSERT INTO design_purchases(clerk_user_id,customer_name,customer_email,customer_phone,sanity_design_id,design_slug,design_title,sanity_package_id,package_name,package_includes,amount,purchase_reference,invoice_number) VALUES($1,'Fixture','fixture@example.test',$2,'design','fixture','Fixture design','package','Fixture package','[]',100,$3,$3)", [owner, phone, reference]);
  }
  await choose("purchases");
  await choose("purchase_latest");
  assert.match((await latestReply()).body, new RegExp(ownedReference));
  assert.doesNotMatch((await latestReply()).body, /BBBBBBBBBBBBBBBB/);
  // A lookup outage must commit a staff request and actually deliver the
  // handoff acknowledgement after the conversation switches to human.
  const execute = globalThis.__careDb.execute.bind(globalThis.__careDb);
  globalThis.__careDb.execute = (query) => {
    if (new PgDialect().sqlToQuery(query).sql.includes("FROM design_purchases"))
      throw new Error("simulated_private_lookup_failure");
    return execute(query);
  };
  const handoffCount = (await pg.query("SELECT count(*)::int AS n FROM care_requests WHERE kind='handoff'")).rows[0].n;
  await choose("purchase_latest");
  globalThis.__careDb.execute = execute;
  assert.equal((await state()).mode, "human");
  assert.equal((await latestReply()).status, "sent");
  assert.match((await latestReply()).body, /passed to the Calacot team/);
  assert.doesNotMatch((await latestReply()).body, /simulated_private_lookup_failure/);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM care_requests WHERE kind='handoff'")).rows[0].n, handoffCount + 1);
  await runCareWorker(1);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM care_requests WHERE kind='handoff'")).rows[0].n, handoffCount + 1);
  await send("resume");
  await pg.query("UPDATE care_conversations SET clerk_user_id=NULL,linked_until=NULL WHERE phone=$1", [phone]);
  await choose("quotes");
  process.env.CALACOT_APP_URL = "http://example.test";
  const tokensBefore = (await pg.query("SELECT count(*)::int AS n FROM care_link_tokens")).rows[0].n;
  await choose("quote_latest");
  assert.equal((await state()).mode, "human");
  assert.equal((await latestReply()).status, "sent");
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM care_link_tokens")).rows[0].n, tokensBefore);
  process.env.CALACOT_APP_URL = "https://example.test";
  await send("resume");
  await choose("purchases");
  await choose("purchase_latest");
  assert.equal((await state()).menu_state.screen, "verification");
  assert.match((await latestReply()).body, /https:\/\/example.test\/account\/customer-care\/link/);
  const beforeOptOut = sends;
  await pg.query(
    "UPDATE whatsapp_contacts SET opted_out_at=now() WHERE phone=$1",
    [phone],
  );
  await send("menu");
  assert.equal(sends, beforeOptOut, "Opt-out prevents further sends");
  console.log(
    "PASS: actual worker handles nested services/enquiry, verification, private quote outcomes, generic-yes rejection, expiry, invoice/purchase options, handoff/resume, capture, staging allowlist and opt-out with mocked providers.",
  );
} finally {
  await pg.close();
}
