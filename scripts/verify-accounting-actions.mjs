// Phase 2A: accounting server actions and reads against a disposable PGlite database migrated with
// the real drizzle-current chain. The REAL permission module (role grants, effectiveGrants,
// staffContext, live re-verification) runs; only Clerk, Next.js and the database driver are
// replaced with in-memory fakes. Nothing touches the network or any real database.
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
const check = async (name, fn) => { await fn(); passed.push(name); };

try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec(`
    INSERT INTO organizations(id,name,legal_name) VALUES('org_a','A','A'),('org_b','B','B');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,display_name,status,clerk_role) VALUES
      ('${S(1)}','org_a','fin','Finance One','active','org:finance'),('${S(2)}','org_a','fin2','Finance Two','active','org:finance'),
      ('${S(3)}','org_a','adm','Administrator','active','org:admin'),('${S(4)}','org_a','adm2','Accountant (admin)','active','org:admin'),
      ('${S(5)}','org_a','view','Viewer','active','org:viewer'),('${S(6)}','org_a','sales','Sales','active','org:sales'),
      ('${S(7)}','org_b','other','Other org admin','active','org:admin');`);

  // Fake Clerk: the session and the live membership both come from `c.users[actor]`.
  const c = (globalThis.__acct = {
    db: drizzle(pg), org: "org_a", actor: "fin", origin: "http://app.test", revoked: false,
    users: { fin: "org:finance", fin2: "org:finance", adm: "org:admin", adm2: "org:admin", view: "org:viewer", sales: "org:sales", other: "org:admin" },
    custom: {},
  });
  process.env.CALACOT_CLERK_ORG_ID = "org_a";
  const as = (actor, org = "org_a") => { c.actor = actor; c.org = org; };

  await mkdir("tmp", { recursive: true });
  const entry = `export * from "./lib/accounting/actions"; export * from "./lib/accounting/reads";`;
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
  const file = resolve("tmp/phase2a-accounting.cjs");
  await writeFile(file, bundle.outputFiles[0].contents);
  const m = createRequire(import.meta.url)(file);
  const q = async (text, params = []) => (await pg.query(text, params)).rows;
  const today = (await q("SELECT finance_kampala_today()::text AS d"))[0].d;
  const year = Number(today.slice(0, 4));
  const ok = (r) => { assert.equal(r.ok, true, r.message); return r; };

  await check("roles: viewer reads only; sales has no access; finance cannot approve; admins can", async () => {
    as("view"); assert.ok((await m.readOverview()).can.read);
    await assert.rejects(m.loadProposedChart({}, form({ key: key() })), /NEXT_NOT_FOUND/);
    as("sales"); await assert.rejects(m.readOverview(), /NEXT_NOT_FOUND/);
    as("fin");
    const can = (await m.readOverview()).can;
    assert.deepEqual([can.prepare, can.post, can.manage, can.approve, can.reverse, can.close, can.reopen, can.approvePolicy], [true, true, true, false, false, false, false, false]);
    as("adm"); assert.ok(Object.values((await m.readOverview()).can).every(Boolean));
  });

  await check("disabled by default: overview explains every missing prerequisite", async () => {
    as("fin");
    const o = await m.readOverview();
    assert.equal(o.readiness.postingReady, false);
    assert.deepEqual(o.readiness.checklist.map((x) => x.done), [false, false, false, false]);
  });

  await check("chart: finance loads proposed chart; an admin approves it; finance cannot approve", async () => {
    as("fin");
    ok(await m.loadProposedChart({}, form({ key: key() })));
    await assert.rejects(m.approveChart({}, form({ key: key() })), /NEXT_NOT_FOUND/, "finance lacks accounting_policy_approve");
    as("adm"); assert.match(ok(await m.approveChart({}, form({ key: key() }))).message, /accounts approved/);
    as("fin");
    const accounts = await m.readAccounts({});
    assert.ok(accounts.rows.every((a) => a.status === "active"));
    assert.equal(accounts.rows.find((a) => a.code === "1110").depth, 2, "hierarchy depth from the recursive read");
    const bad = await m.saveAccount({}, form({ key: key(), code: "1110", name: "Dup", accountType: "asset", reportingClass: "current_asset" }));
    assert.match(bad.message, /already exists/);
  });

  await check("policy: two people; delegated accountant permission works through Clerk", async () => {
    as("fin");
    const proposed = ok(await m.proposePolicy({}, form({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: "1", manualPostingEnabled: "true", note: "Accountant-confirmed fixture policy" })));
    c.custom.fin = ["org:calacot:accounting_policy_approve"];
    const self = await m.decidePolicy({}, form({ id: proposed.id, decision: "approve", key: key() }));
    assert.match(self.message, /cannot approve something you prepared/, "delegated permission still cannot self-approve");
    c.custom.fin = [];
    as("adm"); ok(await m.decidePolicy({}, form({ id: proposed.id, decision: "approve", key: key() })));
    as("fin"); ok(await m.generateFiscalYear({}, form({ key: key(), fiscalYear: String(year) })));
    assert.equal((await m.readOverview()).readiness.postingReady, true);
  });

  const acc = Object.fromEntries((await q("SELECT code,id FROM accounting_accounts WHERE organization_id='org_a'")).map((r) => [r.code, r.id]));
  const lines = (amount, dr = "1110", cr = "3100") => [{ accountId: acc[dr], debit: amount, credit: "", currency: "UGX" }, { accountId: acc[cr], debit: "", credit: amount, currency: "UGX" }];
  let jid = "";
  await check("journal workflow through actions: draft, submit, approve, post, reverse", async () => {
    as("fin");
    const unbalanced = ok(await m.saveJournal({}, form({ key: key(), entryDate: today, description: "Owner capital", lines: [lines("500000")[0]] })));
    jid = unbalanced.id;
    const detail = await m.readJournal(jid);
    assert.equal(detail.actions.submit, true);
    assert.match((await m.journalCommand({}, form({ journalId: jid, command: "submit", version: "1", key: key() }))).message, /do not balance|at least two lines/);
    ok(await m.saveJournal({}, form({ key: key(), id: jid, version: "1", entryDate: today, description: "Owner capital", lines: lines("500000") })));
    ok(await m.journalCommand({}, form({ journalId: jid, command: "submit", version: "2", key: key() })));
    await assert.rejects(m.journalCommand({}, form({ journalId: jid, command: "approve", version: "3", key: key() })), /NEXT_NOT_FOUND/, "finance cannot approve");
    as("fin2"); await assert.rejects(m.journalCommand({}, form({ journalId: jid, command: "approve", version: "3", key: key() })), /NEXT_NOT_FOUND/, "another finance user cannot approve either");
    as("adm");
    assert.equal((await m.readJournal(jid)).actions.review, true);
    ok(await m.journalCommand({}, form({ journalId: jid, command: "approve", version: "3", key: key() })));
    as("fin");
    const posted = ok(await m.journalCommand({}, form({ journalId: jid, command: "post", version: "4", key: key() })));
    assert.match(posted.message, new RegExp(`Posted as JE-${year}-000001`));
    const tb = await m.readTrialBalance({});
    assert.deepEqual(tb.totals.map((t) => [t.currency, t.closing_debit, t.closing_credit, t.balanced]), [["UGX", "500000.00", "500000.00", true]]);
    await assert.rejects(m.reverseJournal({}, form({ journalId: jid, key: key(), reason: "Posted in error" })), /NEXT_NOT_FOUND/, "finance cannot reverse by default");
    as("adm");
    assert.match(ok(await m.reverseJournal({}, form({ journalId: jid, key: key(), reason: "Posted in error" }))).message, /Reversed by JE-/);
    const after = await m.readJournal(jid);
    assert.ok(after.journal.reversal_number && !after.actions.reverse);
    const tb2 = await m.readTrialBalance({});
    assert.equal(tb2.totals[0].closing_debit, "0.00");
  });

  await check("errors are friendly; unknown or other-org records are not found", async () => {
    as("fin");
    const r = await m.saveJournal({}, form({ key: key(), entryDate: today, description: "Control", lines: [{ accountId: acc["1200"], debit: "1", credit: "", currency: "UGX" }] }));
    assert.match(r.message, /control account/);
    const both = await m.saveJournal({}, form({ key: key(), entryDate: today, description: "Both", lines: [{ accountId: acc["1110"], debit: "1", credit: "1", currency: "UGX" }] }));
    assert.match(both.message, /either a debit or a credit/);
    await assert.rejects(m.readJournal(S(999)), /NEXT_NOT_FOUND/);
    await assert.rejects(m.readJournal("not-a-uuid"), /NEXT_NOT_FOUND/);
    as("other", "org_b");
    await assert.rejects(m.readJournal(jid), /NEXT_NOT_FOUND/, "org_b is not the configured organization");
  });

  await check("mutations: cross-origin refused, revoked membership refused, nothing written", async () => {
    as("fin");
    c.origin = "http://evil.test";
    assert.match((await m.saveJournal({}, form({ key: key(), entryDate: today, description: "x", lines: lines("1") }))).message, /origin/i);
    c.origin = "http://app.test";
    c.revoked = true;
    await assert.rejects(m.saveJournal({}, form({ key: key(), entryDate: today, description: "x", lines: lines("1") })), /NEXT_NOT_FOUND/);
    c.revoked = false;
    assert.equal((await q("SELECT count(*)::int n FROM accounting_journals WHERE description='x'"))[0].n, 0);
  });

  await check("periods: close needs close permission; reopen needs reopen permission and reason", async () => {
    as("fin");
    const p = (await m.readPeriods()).periods.find((x) => x.start_date === `${year}-01-01`);
    await assert.rejects(m.periodCommand({}, form({ periodId: p.id, command: "close", version: String(p.version), key: key() })), /NEXT_NOT_FOUND/);
    as("adm");
    ok(await m.periodCommand({}, form({ periodId: p.id, command: "close", version: String(p.version), key: key() })));
    assert.match((await m.periodCommand({}, form({ periodId: p.id, command: "reopen", version: String(p.version + 1), key: key(), note: "" }))).message, /reason/);
    ok(await m.periodCommand({}, form({ periodId: p.id, command: "reopen", version: String(p.version + 1), key: key(), note: "Correction needed" })));
  });

  await check("existing operational reads and workflows still run alongside the ledger", async () => {
    // Expense workflow (Phase 1D functions) on the same migrated database: unaffected by 0018.
    const e = (await q(`SELECT expense_save('org_a','fin',$1::jsonb,'t') AS r`, [JSON.stringify({ key: key(), division: "tech", category: "Software", description: "Licence", purpose: "Regression check", currency: "UGX", netAmount: "1000", incurredOn: today })]))[0].r;
    await q("SELECT expense_command('org_a','fin',$1,'submit',1,'',$2,'t')", [e.id, key()]);
    await q("SELECT expense_command('org_a','adm',$1,'approve',2,'',$2,'t')", [e.id, key()]);
    assert.equal((await q("SELECT status FROM expenses WHERE id=$1", [e.id]))[0].status, "approved");
    assert.equal((await q("SELECT count(*)::int n FROM accounting_journals WHERE organization_id='org_a' AND journal_type='system'"))[0].n, 0, "approving an expense posts nothing");
  });

  console.log(passed.map((p) => `PASS ${p}`).join("\n"));
  console.log(`Accounting action checks passed (${passed.length}).`);
} finally {
  await pg.close();
}
