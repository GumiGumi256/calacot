// Phase 2B: accounting integration server actions and reads against a disposable PGlite database
// migrated with the real drizzle-current chain. The REAL permission module runs; only Clerk, Next.js
// and the database driver are replaced with in-memory fakes. Nothing touches the network or any
// real database. The PGlite session is not marked as a test database, like production.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const pg = new PGlite();
const S = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const key = () => crypto.randomUUID();
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) if (v !== undefined) f.set(k, typeof v === "string" ? v : JSON.stringify(v)); return f; };
const passed = [];
const check = async (name, fn) => { await fn(); passed.push(name); console.log("PASS", name); };

try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec(`
    INSERT INTO organizations(id,name,legal_name) VALUES('org_a','A','A'),('org_b','B','B');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,display_name,status,clerk_role) VALUES
      ('${S(1)}','org_a','fin','Finance One','active','org:finance'),('${S(2)}','org_a','fin2','Finance Two','active','org:finance'),
      ('${S(3)}','org_a','adm','Administrator','active','org:admin'),('${S(5)}','org_a','view','Viewer','active','org:viewer'),
      ('${S(6)}','org_a','sales','Sales','active','org:sales'),('${S(8)}','org_a','pm','Project manager','active','org:project_manager'),
      ('${S(7)}','org_b','other','Other org admin','active','org:admin');
    INSERT INTO clients(id,organization_id,kind,display_name) VALUES('${S(10)}','org_a','company','Client A');
    INSERT INTO projects(id,organization_id,client_id,code,name,division,currency) VALUES('${S(11)}','org_a','${S(10)}','P-1','Villa','architecture','UGX');`);

  const c = (globalThis.__acct = {
    db: drizzle(pg), org: "org_a", actor: "fin", origin: "http://app.test", revoked: false,
    users: { fin: "org:finance", fin2: "org:finance", adm: "org:admin", view: "org:viewer", sales: "org:sales", pm: "org:project_manager", other: "org:admin" },
    custom: {},
  });
  process.env.CALACOT_CLERK_ORG_ID = "org_a";
  const as = (actor, org = "org_a") => { c.actor = actor; c.org = org; };

  await mkdir("tmp", { recursive: true });
  const entry = `export * from "./lib/accounting/actions"; export * from "./lib/accounting/integration-actions"; export * from "./lib/accounting/integration";`;
  const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{ name: "isolated", setup(b) {
      b.onResolve({ filter: /^(server-only|react|next\/cache|next\/headers|next\/navigation|@\/database\/db|@clerk\/nextjs\/server)$/ }, ({ path }) => ({ path, namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => {
        const g = "const c=globalThis.__acct;";
        if (path === "server-only") return { loader: "js", contents: "" };
        if (path === "react") return { loader: "js", contents: "export const cache=(f)=>f;" };
        if (path === "next/cache") return { loader: "js", contents: "export function revalidatePath(){} export function revalidateTag(){} export function updateTag(){} export function cacheTag(){} export function cacheLife(){}" };
        if (path === "next/headers") return { loader: "js", contents: g + "export async function headers(){return new Headers({host:'app.test',...(c.origin?{origin:c.origin}:{})})}" };
        if (path === "next/navigation") return { loader: "js", contents: "export function notFound(){throw new Error('NEXT_NOT_FOUND')} export function redirect(){throw new Error('NEXT_REDIRECT')}" };
        if (path === "@clerk/nextjs/server") return { loader: "js", contents: g + `
          export async function auth(){const role=c.users[c.actor];return {userId:c.actor,orgId:c.org,orgRole:role,orgSlug:'calacot',has:({permission})=>(c.custom[c.actor]||[]).includes(permission),redirectToSignIn(){throw new Error('NEXT_REDIRECT')}}}
          export async function currentUser(){return {fullName:c.actor,primaryEmailAddress:null}}
          export async function clerkClient(){return {organizations:{async getOrganizationMembershipList(){return {data:c.revoked?[]:[{organization:{id:c.org},role:c.users[c.actor],permissions:c.custom[c.actor]||[],publicUserData:{userId:c.actor}}]}}}}}` };
        return { loader: "js", contents: g + "export const db={execute(q){return c.db.execute(q)}}" };
      });
    } }],
  });
  const file = resolve("tmp/phase2b-accounting-integration.cjs");
  await writeFile(file, bundle.outputFiles[0].contents);
  const m = createRequire(import.meta.url)(file);
  const q = async (text, params = []) => (await pg.query(text, params)).rows;
  const today = (await q("SELECT finance_kampala_today()::text AS d"))[0].d;
  const year = Number(today.slice(0, 4));
  const ok = (r) => { assert.equal(r.ok, true, r.message); return r; };

  await check("roles: viewer reads only; sales and project managers have no access; finance operates but cannot approve; admins can", async () => {
    as("view");
    const v = await m.readIntegrationWorkspace({});
    assert.deepEqual(v.can, { operate: false, propose: false, approve: false });
    assert.equal(v.stage, "disabled");
    await assert.rejects(m.processIntegrationQueue({}, form({})), /NEXT_NOT_FOUND/);
    await assert.rejects(m.proposeMapping({}, form({ key: key(), eventType: "payment_allocated", description: "Viewer tries to map", treatment: "journal", effectiveFrom: today,
      conditions: "{}", lines: JSON.stringify([{ side: "debit", account: { code: "2140" }, amount: "amount" }, { side: "credit", account: { code: "1200" }, amount: "amount" }]) })), /NEXT_NOT_FOUND/);
    for (const r of ["sales", "pm"]) { as(r); await assert.rejects(m.readIntegrationWorkspace({}), /NEXT_NOT_FOUND/); await assert.rejects(m.readMappingsPage(), /NEXT_NOT_FOUND/); }
    as("fin"); assert.deepEqual((await m.readIntegrationWorkspace({})).can, { operate: true, propose: true, approve: false });
    as("adm"); assert.deepEqual((await m.readIntegrationWorkspace({})).can, { operate: true, propose: true, approve: true });
  });

  // Ledger prerequisites through the Phase 2A actions.
  as("fin"); ok(await m.loadProposedChart({}, form({ key: key() })));
  as("adm"); ok(await m.approveChart({}, form({ key: key() })));
  as("fin"); const pol = ok(await m.proposePolicy({}, form({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: "1", manualPostingEnabled: "false", note: "Fixture policy for integration actions" })));
  as("adm"); ok(await m.decidePolicy({}, form({ id: pol.id, decision: "approve", key: key() })));
  as("fin"); ok(await m.generateFiscalYear({}, form({ key: key(), fiscalYear: String(year) })));

  await check("disabled: processing explains why nothing happens", async () => {
    as("fin");
    assert.match((await m.processIntegrationQueue({}, form({}))).message, /disabled/i);
  });

  await check("stage: proposed by finance, approved by an administrator; production activation and isolated test refused here", async () => {
    as("fin");
    assert.equal((await m.proposeIntegrationStage({}, form({ key: key(), stage: "active", note: "Go live" }))).ok, false, "active is not even a valid choice");
    assert.match((await m.proposeIntegrationStage({}, form({ key: key(), stage: "isolated_test", note: "Try test posting" }))).message, /test database/);
    const p = ok(await m.proposeIntegrationStage({}, form({ key: key(), stage: "shadow", note: "Shadow reconciliation", receivables: "1200", unallocatedReceipts: "2140" })));
    await assert.rejects(m.decideIntegrationStage({}, form({ id: p.id, decision: "approve", key: key() })), /NEXT_NOT_FOUND/, "finance cannot approve");
    as("adm"); ok(await m.decideIntegrationStage({}, form({ id: p.id, decision: "approve", key: key() })));
    assert.equal((await m.readIntegrationWorkspace({})).stage, "shadow");
  });

  await check("mappings: friendly validation; finance proposes; delegated accountant approves; nobody approves their own", async () => {
    as("fin");
    const bad = await m.proposeMapping({}, form({ key: key(), eventType: "invoice_issued", description: "Bad lines", treatment: "journal", effectiveFrom: today, conditions: "{}", lines: JSON.stringify([{ side: "debit", account: { code: "1200" }, amount: "total" }]) }));
    assert.match(bad.message, /2 to 20 lines/);
    const badCond = await m.proposeMapping({}, form({ key: key(), eventType: "invoice_issued", description: "Bad condition", treatment: "journal", effectiveFrom: today, conditions: JSON.stringify({ division: "mars" }), lines: "[]" }));
    assert.match(badCond.message, /conditions/);
    const lines = (dr, cr, amount = "total") => JSON.stringify([{ side: "debit", account: { code: dr }, amount }, { side: "credit", account: { code: cr }, amount }]);
    const inv = ok(await m.proposeMapping({}, form({ key: key(), eventType: "invoice_issued", description: "C1: design fees recognized at invoice", treatment: "journal", effectiveFrom: today, conditions: JSON.stringify({ billingKind: "standard", division: "" }), lines: lines("1200", "4100") })));
    await assert.rejects(m.decideMapping({}, form({ id: inv.id, decision: "approve", key: key() })), /NEXT_NOT_FOUND/, "finance lacks policy approval");
    c.custom.fin = ["org:calacot:accounting_policy_approve"];
    assert.match((await m.decideMapping({}, form({ id: inv.id, decision: "approve", key: key() }))).message, /cannot approve something you prepared/);
    c.custom.fin = [];
    c.custom.fin2 = ["org:calacot:accounting_policy_approve"];
    as("fin2"); ok(await m.decideMapping({}, form({ id: inv.id, decision: "approve", key: key() })));
    assert.match((await m.decideMapping({}, form({ id: inv.id, decision: "retire", key: key() }))).message, /reason/);
    c.custom.fin2 = [];
    const row = (await q("SELECT status,conditions FROM accounting_event_mappings WHERE id=$1", [inv.id]))[0];
    assert.deepEqual([row.status, row.conditions], ["approved", { billingKind: "standard" }], "empty conditions are dropped, not stored as blank");
    as("fin"); const mp = await m.readMappingsPage();
    assert.equal(mp.mappings.length, 1);
  });

  await check("workspace: backfill, shadow processing, event detail, reconciliation and a friendly retry refusal", async () => {
    const iid = crypto.randomUUID();
    await pg.query(`INSERT INTO invoices(id,organization_id,client_id,project_id,number,status,customer_snapshot,issuer_snapshot,currency,subtotal,total,issued_at) VALUES($1,'org_a',$2,$3,'CAL-I-A-1','draft','{}','{}','UGX',150000,150000,now())`, [iid, S(10), S(11)]);
    await pg.query("UPDATE invoices SET status='issued' WHERE id=$1", [iid]);
    as("fin");
    assert.match(ok(await m.backfillIntegration({}, form({ key: key() }))).message, /0 historical events/, "the trigger already captured it");
    assert.match(ok(await m.processIntegrationQueue({}, form({}))).message, /1 shadowed/);
    const w = await m.readIntegrationWorkspace({ view: "all" });
    assert.equal(w.counts.shadowed, 1);
    assert.equal(w.events[0].document, "CAL-I-A-1");
    const d = await m.readIntegrationEvent(w.events[0].id);
    assert.equal(d.shadowLines.length, 2);
    assert.deepEqual(d.attempts.map((a) => a.action), ["captured", "process"]);
    const r = await m.readReconciliationPage({});
    assert.equal(r.mode, "shadow");
    assert.deepEqual(r.rows.map((x) => [x.check_key, x.status]), [["receivables", "matched"]]);
    assert.match((await m.integrationEventCommand({}, form({ eventId: w.events[0].id, command: "retry", key: key() }))).message, /Only blocked or failed/);
    assert.equal((await q("SELECT count(*)::int n FROM accounting_journals WHERE organization_id='org_a'"))[0].n, 0, "shadow never writes the ledger");
  });

  await check("isolation: unknown and other-organization events are not found; cross-origin and revoked sessions write nothing", async () => {
    as("fin");
    await assert.rejects(m.readIntegrationEvent(S(999)), /NEXT_NOT_FOUND/);
    await assert.rejects(m.readIntegrationEvent("not-a-uuid"), /NEXT_NOT_FOUND/);
    const ev = (await q("SELECT id FROM accounting_integration_events WHERE organization_id='org_a' LIMIT 1"))[0].id;
    as("other", "org_b"); await assert.rejects(m.readIntegrationEvent(ev), /NEXT_NOT_FOUND/);
    as("fin");
    const before = (await q("SELECT count(*)::int n FROM accounting_integration_attempts"))[0].n;
    c.origin = "http://evil.test";
    assert.match((await m.processIntegrationQueue({}, form({}))).message, /origin/i);
    c.origin = "http://app.test"; c.revoked = true;
    await assert.rejects(m.backfillIntegration({}, form({ key: key() })), /NEXT_NOT_FOUND/);
    c.revoked = false;
    assert.equal((await q("SELECT count(*)::int n FROM accounting_integration_attempts"))[0].n, before);
  });

  await check("existing invoice, payment and expense workflows are unchanged; approval posts nothing", async () => {
    const e = (await q(`SELECT expense_save('org_a','fin',$1::jsonb,'t') AS r`, [JSON.stringify({ key: key(), division: "tech", category: "Software", description: "Licence", purpose: "Regression check", currency: "UGX", netAmount: "1000", incurredOn: today })]))[0].r;
    await q("SELECT expense_command('org_a','fin',$1,'submit',1,'',$2,'t')", [e.id, key()]);
    await q("SELECT expense_command('org_a','adm',$1,'approve',2,'',$2,'t')", [e.id, key()]);
    as("fin"); ok(await m.processIntegrationQueue({}, form({})));
    const ev = (await q("SELECT status,resolution_note FROM accounting_integration_events WHERE event_key=$1", [`expense_approved:${e.id}`]))[0];
    assert.deepEqual(ev, { status: "no_effect", resolution_note: "no_recognition_policy" });
    assert.equal((await q("SELECT status FROM expenses WHERE id=$1", [e.id]))[0].status, "approved");
  });

  console.log(`Accounting integration action checks passed (${passed.length}).`);
} finally {
  await pg.close();
}
