// Phase 2D: tax, asset and payroll server actions and reads against a disposable PGlite database migrated
// with the real drizzle-current chain. The REAL permission module (role grants, effectiveGrants,
// staffContext, live re-verification), actions and reads run; only Clerk, Next.js and the database
// driver are replaced with in-memory fakes. Synthetic data only; no network, no real database.
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
  const c = (globalThis.__tax = {
    db: drizzle(pg), org: "org_a", actor: "fin", origin: "http://app.test", revoked: false,
    users: { fin: "org:finance", fin2: "org:finance", adm: "org:admin", adm2: "org:admin", view: "org:viewer", sales: "org:sales", pm: "org:project_manager", other: "org:admin" },
    custom: {},
  });
  process.env.CALACOT_CLERK_ORG_ID = "org_a";
  const as = (actor, org = "org_a") => { c.actor = actor; c.org = org; };
  await mkdir("tmp", { recursive: true });
  const entry = `export * from "./lib/tax/actions"; export * from "./lib/tax/reads"; export * from "./lib/assets/actions"; export * from "./lib/assets/reads"; export * from "./lib/payroll/actions"; export * from "./lib/payroll/reads"; export * from "./lib/accounting/actions";`;
  const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{ name: "isolated", setup(b) {
      b.onResolve({ filter: /^(server-only|react|next\/cache|next\/headers|next\/navigation|@\/database\/db|@clerk\/nextjs\/server)$/ }, ({ path }) => ({ path, namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => {
        const g = "const c=globalThis.__tax;";
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
  const file = resolve("tmp/phase2d-tax-actions.cjs");
  await writeFile(file, bundle.outputFiles[0].contents);
  const m = createRequire(import.meta.url)(file);
  const q = async (text, params = []) => (await pg.query(text, params)).rows;
  const ok = (r) => { assert.equal(r.ok, true, r.message); return r; };
  const today = (await q("SELECT finance_kampala_today()::text AS d"))[0].d;
  const Y = Number(today.slice(0, 4)) - 1;
  const doc = async (name) => (await q("INSERT INTO documents(organization_id,name,kind,storage_key,mime_type,size_bytes) VALUES('org_a',$1,'policy',$2,'application/pdf',10) RETURNING id", [name, `t/${key()}`]))[0].id;
  const ev = await doc("URA certificate (synthetic)");

  await check("least privilege: viewers, sales and project managers see no tax or payroll data; finance prepares but cannot approve", async () => {
    for (const r of ["view", "sales", "pm"]) {
      as(r);
      await assert.rejects(m.readTaxOverview(), /NEXT_NOT_FOUND/);
      await assert.rejects(m.readPayroll(), /NEXT_NOT_FOUND/);
    }
    as("view"); await m.readAssetRegister({}); // viewers keep read-only accounting visibility of the register
    await assert.rejects(m.proposeTaxRule({}, form({ key: key(), ruleCode: "cit-rate", ruleKind: "income_tax_rate", description: "Viewer attempt", parameters: '{"rate":"0.3"}', effectiveFrom: `${Y}-01-01`, legalBasis: "Attempt", evidenceDocumentId: ev })), /NEXT_NOT_FOUND/);
    as("fin");
    assert.deepEqual((await m.readTaxOverview()).can, { compute: true, approve: false, recordPayments: true, managePolicy: true });
    await assert.rejects(m.readPayroll(), /NEXT_NOT_FOUND/, "finance has no salary access");
    as("adm");
    assert.deepEqual((await m.readTaxOverview()).can, { compute: true, approve: true, recordPayments: true, managePolicy: true });
  });

  await check("payroll privacy: staff-administration rights never reveal salaries; only payroll permissions do", async () => {
    c.custom.pm = ["org:calacot:staff_manage", "org:calacot:accounting_read", "org:calacot:banking_read"];
    as("pm"); await assert.rejects(m.readPayroll(), /NEXT_NOT_FOUND/);
    c.custom.pm = [];
    c.custom.fin2 = ["org:calacot:payroll_admin"];
    as("fin2");
    const p = ok(await m.saveProfile({}, form({ key: key(), personName: "Synthetic Employee", engagementType: "employee", employeeNumber: "E-9", startDate: `${Y}-01-01`, paymentMethod: "bank", paymentAccount: "1234567890" })));
    const data = await m.readPayroll();
    assert.equal(data.profiles[0].payment_account_last4, "7890");
    assert.ok(!JSON.stringify(data).includes("1234567890"), "the full payment account is never stored or returned");
    await assert.rejects(m.decidePayroll({}, form({ id: p.id, entity: "payroll_profile", decision: "approve", key: key() })), /NEXT_NOT_FOUND/, "payroll admin cannot approve");
    as("adm"); ok(await m.decidePayroll({}, form({ id: p.id, entity: "payroll_profile", decision: "approve", key: key() })));
    c.custom.fin2 = [];
  });

  // Ledger prerequisites.
  as("fin"); ok(await m.loadProposedChart({}, form({ key: key() })));
  as("adm"); ok(await m.approveChart({}, form({ key: key() })));
  as("fin"); const pol = ok(await m.proposePolicy({}, form({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: "1", manualPostingEnabled: "true", note: "Fixture policy for tax actions" })));
  as("adm"); ok(await m.decidePolicy({}, form({ id: pol.id, decision: "approve", key: key() })));
  as("fin"); ok(await m.generateFiscalYear({}, form({ key: key(), fiscalYear: String(Y) })));
  const acct = Object.fromEntries((await q("SELECT code,id FROM accounting_accounts WHERE organization_id='org_a'")).map((r) => [r.code, r.id]));

  await check("tax policy: unauthorized rate changes and self-approval are refused; VAT cannot be enabled through the app", async () => {
    as("fin");
    const r = ok(await m.proposeTaxRule({}, form({ key: key(), ruleCode: "cit-rate", ruleKind: "income_tax_rate", description: "Rate for actions test", parameters: '{"rate":"0.3"}', effectiveFrom: `${Y - 2}-01-01`, legalBasis: "Accountant confirmation (synthetic)", evidenceDocumentId: ev })));
    await assert.rejects(m.decideTaxRule({}, form({ id: r.id, decision: "approve", key: key() })), /NEXT_NOT_FOUND/, "finance cannot approve tax rules");
    c.custom.fin = ["org:calacot:tax_approve"];
    assert.match((await m.decideTaxRule({}, form({ id: r.id, decision: "approve", key: key() }))).message, /cannot approve tax work you prepared/);
    c.custom.fin = [];
    as("adm"); ok(await m.decideTaxRule({}, form({ id: r.id, decision: "approve", key: key() })));
    as("fin");
    const vat = await m.proposeTaxObligation({}, form({ key: key(), code: "vat", taxType: "vat", name: "Value added tax", registrationStatus: "registered", taxpayerName: "Fixture Ltd", effectiveFrom: `${Y}-01-01`, legalBasis: "Attempt to enable VAT",
      periodBasis: "calendar_month", filingFrequency: "monthly", processingEnabled: "true", calculationRuleCode: "cit-rate", expenseAccountId: acct["8900"], liabilityAccountId: acct["2180"], evidenceDocumentId: ev }));
    assert.match(vat.message, /Only corporate income tax can be made operational/);
    const cit = ok(await m.proposeTaxObligation({}, form({ key: key(), code: "cit", taxType: "corporate_income_tax", name: "Corporate income tax", registrationStatus: "registered", taxpayerName: "Fixture Ltd",
      effectiveFrom: `${Y - 2}-01-01`, legalBasis: "URA registration (synthetic)", periodBasis: "accounting_year", filingFrequency: "annual",
      deadlineRules: JSON.stringify([{ event: "final_return", label: "Final return", anchor: "period_end", monthsOffset: 6, day: "last", filing: true, payment: true }]),
      calculationRuleCode: "cit-rate", expenseAccountId: acct["8900"], liabilityAccountId: acct["2195"], processingEnabled: "true", evidenceDocumentId: ev })));
    as("adm"); ok(await m.decideTaxObligation({}, form({ id: cit.id, decision: "approve", key: key() })));
    as("fin");
    const o = await m.readTaxOverview();
    assert.equal(o.calendar.length, 1);
    assert.equal(o.positions[0].basis, "not_determined", "no computation yet: the liability is not determined, never zero");
    assert.equal(o.positions[0].outstanding, null);
  });

  await check("computation workflow through actions; tax and asset journal decisions cannot be crossed", async () => {
    as("fin");
    const comp = ok(await m.createComputation({}, form({ key: key(), obligationCode: "cit", fiscalYear: String(Y), kind: "final" })));
    let d = await m.readComputation(comp.id);
    ok(await m.computationCommand({}, form({ id: comp.id, command: "submit", version: String(d.c.version), key: key() })));
    d = await m.readComputation(comp.id);
    await assert.rejects(m.computationCommand({}, form({ id: comp.id, command: "approve", version: String(d.c.version), key: key() })), /NEXT_NOT_FOUND/);
    as("adm"); ok(await m.computationCommand({}, form({ id: comp.id, command: "approve", version: String(d.c.version), key: key() })));
    as("fin");
    const prov = await m.prepareProvision({}, form({ id: comp.id, key: key(), entryDate: "" }));
    assert.match(prov.message, /up to date|Nothing to post/, "zero profit, zero tax: nothing to provide");
    // An asset journal can never be decided through the tax action, and vice versa.
    await pg.query("INSERT INTO suppliers(id,organization_id,name) VALUES($1,'org_a','Supplier')", [S(40)]);
    const catP = ok(await m.proposeCategory({}, form({ key: key(), code: "COMP", name: "Computers", usefulLifeMonths: "36", residualPercent: "0", periodConvention: "daily_proration", capitalizationThreshold: "100000",
      policyBasis: "Asset policy (synthetic)", cost: acct["1540"], accumulated: acct["1590"], expense: acct["6900"], impairment: acct["6900"], gain: acct["7300"], loss: acct["8300"] })));
    await assert.rejects(m.decideCategory({}, form({ id: catP.id, decision: "approve", key: key() })), /NEXT_NOT_FOUND/, "finance cannot approve asset policy");
    as("adm"); ok(await m.decideCategory({}, form({ id: catP.id, decision: "approve", key: key() })));
    as("fin");
    const asset = ok(await m.saveAsset({}, form({ key: key(), name: "Laptop", ownership: "owned", categoryCode: "COMP", acquisitionDate: `${Y}-02-01`, capitalizationDate: `${Y}-02-01`, cost: "1200000", capitalizationSource: "direct_credit", creditAccountId: acct["2120"], supplierId: S(40) })));
    ok(await m.capitalizeAsset({}, form({ id: asset.id, key: key() })));
    const link = (await q("SELECT id FROM ledger_source_links WHERE purpose='asset_capitalization'"))[0].id;
    as("adm");
    assert.match((await m.decideTaxJournal({}, form({ id: link, decision: "approve", key: key() }))).message, /unavailable/, "the tax action refuses asset journals");
    ok(await m.decideAssetJournal({}, form({ id: link, decision: "approve", key: key() })));
    const reg = await m.readAssetRegister({});
    assert.equal(reg.rows[0].state, "in_service");
  });

  await check("cross-organization, cross-origin and revoked sessions see or write nothing", async () => {
    const comp = (await q("SELECT id FROM income_tax_computations LIMIT 1"))[0].id;
    as("other", "org_b"); process.env.CALACOT_CLERK_ORG_ID = "org_b";
    await assert.rejects(m.readComputation(comp), /NEXT_NOT_FOUND/);
    assert.equal((await m.readAssetRegister({})).rows.length, 0);
    process.env.CALACOT_CLERK_ORG_ID = "org_a";
    as("fin");
    const n = (await q("SELECT count(*)::int AS n FROM tax_rule_versions"))[0].n;
    c.origin = "http://evil.test";
    assert.equal((await m.proposeTaxRule({}, form({ key: key(), ruleCode: "x-rate", ruleKind: "income_tax_rate", description: "Cross origin", parameters: '{"rate":"0.1"}', effectiveFrom: `${Y}-01-01`, legalBasis: "Cross origin attempt", evidenceDocumentId: ev }))).ok, false);
    c.origin = "http://app.test"; c.revoked = true;
    await assert.rejects(m.proposeTaxRule({}, form({ key: key(), ruleCode: "x-rate", ruleKind: "income_tax_rate", description: "Revoked", parameters: '{"rate":"0.1"}', effectiveFrom: `${Y}-01-01`, legalBasis: "Revoked attempt", evidenceDocumentId: ev })), /NEXT_NOT_FOUND/);
    c.revoked = false;
    assert.equal((await q("SELECT count(*)::int AS n FROM tax_rule_versions"))[0].n, n);
  });

  console.log(`Tax, asset and payroll action checks passed (${passed.length}).`);
} finally {
  await pg.close();
}
