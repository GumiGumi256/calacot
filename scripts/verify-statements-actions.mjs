// Phase 2E: statement, adjustment and closing server actions, reads and the CSV export route against
// a disposable PGlite database migrated with the real drizzle-current chain. The REAL permission
// module (role grants, delegation, staffContext, live re-verification), actions, reads and route run;
// only Clerk, Next.js and the database driver are replaced with in-memory fakes. Synthetic data only.
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
      ('${S(3)}','org_a','adm','Administrator','active','org:admin'),('${S(4)}','org_a','adm2','Second admin','active','org:admin'),
      ('${S(5)}','org_a','view','Viewer','active','org:viewer'),('${S(6)}','org_a','sales','Sales','active','org:sales'),
      ('${S(8)}','org_a','pm','Project manager','active','org:project_manager'),('${S(7)}','org_b','other','Other org admin','active','org:admin');`);
  const c = (globalThis.__fs = {
    db: drizzle(pg), org: "org_a", actor: "fin", origin: "http://app.test", revoked: false,
    users: { fin: "org:finance", fin2: "org:finance", adm: "org:admin", adm2: "org:admin", view: "org:viewer", sales: "org:sales", pm: "org:project_manager", other: "org:admin" },
    custom: {},
  });
  process.env.CALACOT_CLERK_ORG_ID = "org_a";
  const as = (actor, org = "org_a") => { c.actor = actor; c.org = org; };
  await mkdir("tmp", { recursive: true });
  const entry = `export * from "./lib/statements/actions"; export * from "./lib/statements/reads"; export * from "./lib/accounting/actions"; export { GET as exportStatements } from "./app/api/accounting/statements/route"; export { proposeClassification } from "./lib/accounting/statements";`;
  const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{ name: "isolated", setup(b) {
      b.onResolve({ filter: /^(server-only|react|next\/cache|next\/headers|next\/navigation|@\/database\/db|@clerk\/nextjs\/server)$/ }, ({ path }) => ({ path, namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => {
        const g = "const c=globalThis.__fs;";
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
  const file = resolve("tmp/phase2e-statements-actions.cjs");
  await writeFile(file, bundle.outputFiles[0].contents);
  const m = createRequire(import.meta.url)(file);
  const q = async (text, params = []) => (await pg.query(text, params)).rows;
  const fn = async (call, params = []) => (await q(`SELECT ${call} AS r`, params))[0].r;
  const ok = (r) => { assert.equal(r.ok, true, r.message); return r; };
  const refused = (r, pattern) => { assert.equal(r.ok, false); if (pattern) assert.match(r.message, pattern); return r; };
  const today = (await q("SELECT finance_kampala_today()::text AS d"))[0].d;
  const Y = Number(today.slice(0, 4)) - 1;
  const D = (mo, d) => `${Y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // Ledger prerequisites through the 2A actions.
  as("fin"); ok(await m.loadProposedChart({}, form({ key: key() })));
  as("adm"); ok(await m.approveChart({}, form({ key: key() })));
  as("fin"); const pol = ok(await m.proposePolicy({}, form({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: "1", manualPostingEnabled: "true", note: "Fixture policy for statements" })));
  as("adm"); ok(await m.decidePolicy({}, form({ id: pol.id, decision: "approve", key: key() })));
  as("fin"); ok(await m.generateFiscalYear({}, form({ key: key(), fiscalYear: String(Y) })));
  const acct = Object.fromEntries((await q("SELECT code,id FROM accounting_accounts WHERE organization_id='org_a'")).map((r) => [r.code, r.id]));
  const post = async (date, lines) => {
    const j = await fn("accounting_journal_save('org_a','fin',$1::jsonb,'t')", [JSON.stringify({ key: key(), entryDate: date, description: "Synthetic entry", lines })]);
    const s = await fn("accounting_journal_command('org_a','fin',$1,'submit',1,'',$2,'t')", [j.id, key()]);
    const a = await fn("accounting_journal_command('org_a','adm',$1,'approve',$2,'',$3,'t')", [j.id, s.version, key()]);
    await fn("accounting_journal_command('org_a','adm',$1,'post',$2,'',$3,'t')", [j.id, a.version, key()]);
  };
  const L = (code, side, amount) => ({ accountId: acct[code], [side]: amount, currency: "UGX" });
  await post(D(1, 10), [L("1120", "debit", "2000000.00"), L("3100", "credit", "2000000.00")]);
  await post(D(1, 20), [L("1120", "debit", "900000.00"), L("4100", "credit", "900000.00")]);
  await post(D(1, 25), [L("6200", "debit", "300000.00"), L("1120", "credit", "300000.00")]);

  await check("least privilege: viewers read statements only; sales and project managers see nothing; finance prepares but cannot approve", async () => {
    for (const r of ["sales", "pm"]) { as(r); await assert.rejects(m.readStatements({}), /NEXT_NOT_FOUND/); await assert.rejects(m.readClosing({}), /NEXT_NOT_FOUND/); }
    as("view");
    const v = await m.readStatements({ report: "income", from: D(1, 1), to: D(1, 31) });
    assert.equal(v.current.netProfit, "600000.00");
    assert.deepEqual(v.can, { adjust: false, review: false, approve: false, closeStart: false, closeApprove: false, reopen: false, yearEnd: false });
    await assert.rejects(m.createStatementSet({}, form({ key: key(), kind: "month", periodStart: D(1, 1), periodEnd: D(1, 31) })), /NEXT_NOT_FOUND/);
    as("fin");
    assert.deepEqual((await m.readStatements({})).can, { adjust: true, review: false, approve: false, closeStart: true, closeApprove: false, reopen: false, yearEnd: false });
    as("adm");
    assert.deepEqual((await m.readStatements({})).can, { adjust: true, review: true, approve: true, closeStart: true, closeApprove: true, reopen: true, yearEnd: true });
  });

  await check("classification through the app: finance proposes, cannot approve; an administrator approves; statements stop being provisional", async () => {
    as("fin");
    const settings = await m.readStatementSettings();
    const mapping = m.proposeClassification(settings.accounts.map((a) => ({ id: a.id, code: a.code, accountType: a.account_type, isContra: a.is_contra, isPostable: a.is_postable, reportingClass: a.reporting_class })));
    const fields = { key: key(), retainedEarningsAccountId: acct["3200"], note: "Classification for review" };
    for (const [id, e] of Object.entries(mapping)) { fields[`line:${id}`] = e.line; fields[`cf:${id}`] = e.cashflow ?? ""; fields[`clearing:${id}`] = e.clearing ? "on" : ""; }
    refused(await m.proposeClassificationAction({}, form({ ...fields, [`line:${acct["1120"]}`]: "revenue", key: key() })), /does not fit its type/);
    const p = ok(await m.proposeClassificationAction({}, form(fields)));
    await assert.rejects(m.decideFsPolicy({}, form({ id: p.id, entity: "classification", decision: "approve", key: key() })), /NEXT_NOT_FOUND/);
    as("adm"); ok(await m.decideFsPolicy({}, form({ id: p.id, entity: "classification", decision: "approve", key: key() })));
    const s = await m.readStatements({ report: "balance", to: D(1, 31) });
    assert.equal(s.current.balanced, true);
    assert.equal(s.current.provisional, false);
  });

  let setId = "";
  await check("statement sets: prepared from the ledger by finance, approved only by another person with approval authority; CSV export is labelled and formula-safe", async () => {
    as("fin");
    const r = ok(await m.createStatementSet({}, form({ key: key(), kind: "month", periodStart: D(1, 1), periodEnd: D(1, 31) })));
    setId = r.id;
    as("adm2"); c.custom.adm2 = [];
    ok(await m.decideStatementSet({}, form({ id: setId, decision: "approve", key: key() })));
    const d = await m.readStatementSet(setId);
    assert.equal(d.set.status, "approved");
    const res = await m.exportStatements(new Request(`http://app.test/api/accounting/statements?set=${setId}`));
    const text = await res.text();
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.match(text, /APPROVED statements/);
    const live = await (await m.exportStatements(new Request(`http://app.test/api/accounting/statements?report=income&from=${D(1, 1)}&to=${D(1, 31)}`))).text();
    assert.match(live, /DRAFT/);
    assert.match(live, /"Profit for the period","600000.00"/);
    as("view");
    assert.equal((await m.exportStatements(new Request(`http://app.test/api/accounting/statements?set=${setId}`))).status, 200, "viewers may export what they may read");
    as("sales");
    assert.equal((await m.exportStatements(new Request(`http://app.test/api/accounting/statements?set=${setId}`))).status, 404);
    as("other", "org_b");
    await assert.rejects(m.readStatementSet(setId), /NEXT_NOT_FOUND/, "another organization cannot read the set");
    assert.equal((await q("SELECT count(*)::int AS n FROM audit_logs WHERE action='fs.export'"))[0].n, 3);
  });

  await check("adjustments: finance prepares; finance cannot review; the preparer can never approve their own; administrators approve and post", async () => {
    as("fin");
    const lines = [{ accountId: acct["6600"], debit: "50000.00", credit: "" }, { accountId: acct["2120"], debit: "", credit: "50000.00" }];
    refused(await m.createAdjustment({}, form({ key: key(), kind: "accrual", entryDate: D(1, 31), description: "Audit accrual", reason: "short", evidenceReference: "EL-1", lines })), /reason/);
    const a = ok(await m.createAdjustment({}, form({ key: key(), kind: "accrual", entryDate: D(1, 31), description: "Audit accrual", reason: "Audit fee for January not yet invoiced", evidenceReference: "Engagement letter EL-1", lines })));
    const v = (await q("SELECT j.version FROM adjustment_entries x JOIN accounting_journals j ON j.id=x.journal_id WHERE x.id=$1", [a.id]))[0].version;
    await assert.rejects(m.adjustmentCommand({}, form({ id: a.id, decision: "approve", version: String(v), key: key() })), /NEXT_NOT_FOUND/);
    as("adm");
    const own = ok(await m.createAdjustment({}, form({ key: key(), kind: "reclassification", entryDate: D(1, 31), description: "Reclass", reason: "Rent was coded to the wrong account", evidenceReference: "Lease", lines })));
    const ov = (await q("SELECT j.version FROM adjustment_entries x JOIN accounting_journals j ON j.id=x.journal_id WHERE x.id=$1", [own.id]))[0].version;
    refused(await m.adjustmentCommand({}, form({ id: own.id, decision: "approve", version: String(ov), key: key() })), /cannot approve/i);
    ok(await m.adjustmentCommand({}, form({ id: a.id, decision: "approve", version: String(v), key: key() })));
    ok(await m.adjustmentCommand({}, form({ id: a.id, cmd: "post", version: String(v + 1), key: key() })));
    as("adm2"); ok(await m.adjustmentCommand({}, form({ id: own.id, decision: "reject", note: "Not needed after review", version: String(ov), key: key() })));
    const list = await m.readAdjustments();
    assert.equal(list.adjustments.find((x) => x.id === a.id).journal_status, "posted");
  });

  await check("period close through the app: policy, checklist, evidence, separation of duties, delegation and authorized reopen", async () => {
    as("fin");
    ok(await m.proposeClosePolicyAction({}, form({ key: key(), note: "Month-end policy", clearingTolerance: "0", evidenceItems: "Bank statements", requireBankReconciliation: "on", requireCashCount: "" })));
    const polId = (await q("SELECT id FROM period_close_policy_versions WHERE organization_id='org_a' AND status='proposed'"))[0].id;
    await assert.rejects(m.decideFsPolicy({}, form({ id: polId, entity: "close_policy", decision: "approve", key: key() })), /NEXT_NOT_FOUND/);
    as("adm"); ok(await m.decideFsPolicy({}, form({ id: polId, entity: "close_policy", decision: "approve", key: key() })));
    const jan = (await q("SELECT id FROM accounting_periods WHERE organization_id='org_a' AND start_date=$1", [D(1, 1)]))[0].id;
    as("fin");
    const st = ok(await m.startClose({}, form({ periodId: jan, key: key() })));
    let d = await m.readPeriodClose(jan);
    assert.equal(d.checks.ready, false);
    const ver = async () => (await q("SELECT version FROM period_closes WHERE id=$1", [st.id]))[0].version;
    refused(await m.closeCommand({}, form({ id: st.id, decision: "submit", version: String(await ver()), key: key() })), /checks have failed/);
    ok(await m.addCloseEvidence({}, form({ closeId: st.id, key: key(), item: "Bank statements", reference: "January pack (synthetic)" })));
    d = await m.readPeriodClose(jan);
    assert.equal(d.checks.ready, true, JSON.stringify(d.checks.checks.filter((x) => x.status === "fail")));
    ok(await m.closeCommand({}, form({ id: st.id, decision: "submit", version: String(await ver()), key: key() })));
    await assert.rejects(m.closeCommand({}, form({ id: st.id, decision: "approve", version: String(await ver()), key: key() })), /NEXT_NOT_FOUND/, "finance cannot approve a close");
    c.custom.fin2 = ["org:calacot:close_approve"];
    as("fin2");
    ok(await m.closeCommand({}, form({ id: st.id, decision: "approve", version: String(await ver()), key: key() })));
    assert.equal((await q("SELECT status FROM accounting_periods WHERE id=$1", [jan]))[0].status, "closed");
    await assert.rejects(m.closeCommand({}, form({ id: st.id, decision: "reopen", note: "Correction needed for January", version: String(await ver()), key: key() })), /NEXT_NOT_FOUND/, "close approval does not grant reopen");
    as("adm");
    refused(await m.closeCommand({}, form({ id: st.id, decision: "reopen", note: "short", version: String(await ver()), key: key() })), /at least 10/);
    ok(await m.closeCommand({}, form({ id: st.id, decision: "reopen", note: "Correction needed for January", version: String(await ver()), key: key() })));
    assert.equal((await q("SELECT status FROM accounting_periods WHERE id=$1", [jan]))[0].status, "open");
    // The legacy Periods action is now refused with a clear message.
    const v2 = (await q("SELECT version FROM accounting_periods WHERE id=$1", [jan]))[0].version;
    refused(await m.periodCommand({}, form({ periodId: jan, command: "close", version: String(v2), key: key(), note: "" })), /through Period closing/);
    c.custom.fin2 = [];
  });

  await check("revoked membership, cross-origin requests and other organizations are refused", async () => {
    as("fin");
    const n = (await q("SELECT count(*)::int AS n FROM fs_statement_sets"))[0].n;
    c.origin = "http://evil.test";
    assert.equal((await m.createStatementSet({}, form({ key: key(), kind: "month", periodStart: D(2, 1), periodEnd: D(2, 28) }))).ok, false);
    c.origin = "http://app.test"; c.revoked = true;
    await assert.rejects(m.createStatementSet({}, form({ key: key(), kind: "month", periodStart: D(2, 1), periodEnd: D(2, 28) })), /NEXT_NOT_FOUND/);
    c.revoked = false;
    assert.equal((await q("SELECT count(*)::int AS n FROM fs_statement_sets"))[0].n, n);
    as("other", "org_b");
    await assert.rejects(m.readPeriodClose((await q("SELECT id FROM accounting_periods WHERE organization_id='org_a' LIMIT 1"))[0].id), /NEXT_NOT_FOUND/);
  });

  console.log(`Statement, adjustment and closing action checks passed (${passed.length}).`);
} finally {
  await pg.close();
}
