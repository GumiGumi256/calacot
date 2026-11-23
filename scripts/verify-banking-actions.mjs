// Phase 2C: banking server actions, reads and the statement upload route against a disposable PGlite
// database migrated with the real drizzle-current chain. The REAL permission module (role grants,
// effectiveGrants, staffContext, live re-verification), actions, reads and route run; only Clerk,
// Next.js and the database driver are replaced with in-memory fakes. Synthetic data only: nothing
// touches the network or any real database. Statement files go to the local capture store under
// tmp/sales-private (the default local mode) and are deleted at the end.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
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
const FULL_NUMBER = "9030001234567";

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

  const c = (globalThis.__bank = {
    db: drizzle(pg), org: "org_a", actor: "fin", origin: "http://app.test", revoked: false,
    users: { fin: "org:finance", fin2: "org:finance", adm: "org:admin", adm2: "org:admin", view: "org:viewer", sales: "org:sales", pm: "org:project_manager", other: "org:admin" },
    custom: {},
  });
  process.env.CALACOT_CLERK_ORG_ID = "org_a";
  delete process.env.SALES_NOTIFICATION_MODE; // local private store (capture mode), never a real bucket
  const as = (actor, org = "org_a") => { c.actor = actor; c.org = org; };

  await mkdir("tmp", { recursive: true });
  const entry = `export * from "./lib/banking/actions"; export * from "./lib/banking/reads"; export * from "./lib/accounting/actions"; export { POST as statementRoute } from "./app/api/banking/statements/route";`;
  const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{ name: "isolated", setup(b) {
      b.onResolve({ filter: /^(server-only|react|next\/cache|next\/headers|next\/navigation|@\/database\/db|@clerk\/nextjs\/server)$/ }, ({ path }) => ({ path, namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => {
        const g = "const c=globalThis.__bank;";
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
  const file = resolve("tmp/phase2c-banking-actions.cjs");
  await writeFile(file, bundle.outputFiles[0].contents);
  const m = createRequire(import.meta.url)(file);
  const q = async (text, params = []) => (await pg.query(text, params)).rows;
  const ok = (r) => { assert.equal(r.ok, true, r.message); return r; };
  const today = (await q("SELECT finance_kampala_today()::text AS d"))[0].d;
  const Y = Number(today.slice(0, 4)) - 1;
  const D = (mo, d) => `${Y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const upload = async (fields, csv, name = "statement.csv") => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, typeof v === "string" ? v : JSON.stringify(v));
    f.set("file", new File([csv], name, { type: "text/csv" }));
    const res = await m.statementRoute(new Request("http://app.test/api/banking/statements", { method: "POST", body: f, headers: c.origin ? { origin: c.origin } : {} }));
    return { status: res.status, ...(await res.json()) };
  };

  await check("roles: viewer reads only; sales and project managers have no access; finance prepares; approvals are administrator-only by default", async () => {
    as("view");
    const v = await m.readBankingOverview();
    assert.ok(Object.values(v.can).every((x) => x === false), "viewer has no mutation rights");
    await assert.rejects(m.registerBankingAccount({}, form({ key: key(), kind: "cash", label: "Box", currency: "UGX", custodianId: S(1) })), /NEXT_NOT_FOUND/);
    for (const r of ["sales", "pm"]) { as(r); await assert.rejects(m.readBankingOverview(), /NEXT_NOT_FOUND/); await assert.rejects(m.readCashPage({}), /NEXT_NOT_FOUND/); }
    as("fin");
    assert.deepEqual((await m.readBankingOverview()).can, { manage: true, approveMapping: false, importStatements: true, match: true, reconcile: true, finalize: false, reopen: false, createCash: true, approveCash: false });
    as("adm");
    assert.ok(Object.values((await m.readBankingOverview()).can).every((x) => x === true));
  });

  // Ledger prerequisites through the real Phase 2A actions.
  as("fin"); ok(await m.loadProposedChart({}, form({ key: key() })));
  as("adm"); ok(await m.approveChart({}, form({ key: key() })));
  as("fin"); const pol = ok(await m.proposePolicy({}, form({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: "1", manualPostingEnabled: "true", note: "Fixture policy for banking actions" })));
  as("adm"); ok(await m.decidePolicy({}, form({ id: pol.id, decision: "approve", key: key() })));
  as("fin"); ok(await m.generateFiscalYear({}, form({ key: key(), fiscalYear: String(Y) })));
  const acct = Object.fromEntries((await q("SELECT code,id FROM accounting_accounts WHERE organization_id='org_a'")).map((r) => [r.code, r.id]));
  const fa = (await q(`SELECT finance_account_save('org_a','adm',$1::jsonb,'t') AS r`, [JSON.stringify({ key: key(), method: "bank_transfer", provider: "Stanbic", accountIdentifier: FULL_NUMBER, label: "Stanbic UGX", currency: "UGX", verificationNote: "Synthetic fixture" })]))[0].r.id;
  let bank = "", petty = "";

  await check("setup through actions: register, propose mapping, two-person approval with friendly refusals", async () => {
    as("fin");
    assert.match((await m.registerBankingAccount({}, form({ key: key(), kind: "bank" }))).message, /verified payment account/);
    bank = ok(await m.registerBankingAccount({}, form({ key: key(), kind: "bank", financeAccountId: fa }))).id;
    assert.match((await m.registerBankingAccount({}, form({ key: key(), kind: "bank", financeAccountId: fa }))).message, /already registered/);
    petty = ok(await m.registerBankingAccount({}, form({ key: key(), kind: "petty_cash", label: "Office petty cash", currency: "UGX", custodianId: S(2), floatAmount: "200000" }))).id;
    const mp = ok(await m.proposeBankMapping({}, form({ key: key(), bankingAccountId: bank, ledgerAccountId: acct["1120"], note: "Matches the bank confirmation letter" })));
    await assert.rejects(m.decideBankMapping({}, form({ id: mp.id, decision: "approve", key: key() })), /NEXT_NOT_FOUND/, "finance lacks policy approval");
    c.custom.fin = ["org:calacot:accounting_policy_approve"];
    assert.match((await m.decideBankMapping({}, form({ id: mp.id, decision: "approve", key: key() }))).message, /cannot approve something you prepared/);
    c.custom.fin = [];
    as("adm"); ok(await m.decideBankMapping({}, form({ id: mp.id, decision: "approve", key: key() })));
    as("fin"); const pm = ok(await m.proposeBankMapping({}, form({ key: key(), bankingAccountId: petty, ledgerAccountId: acct["1110"], note: "Petty cash float ledger" })));
    as("adm"); ok(await m.decideBankMapping({}, form({ id: pm.id, decision: "approve", key: key() })));
    as("fin"); for (const [category, code] of [["bank_fee", "6910"], ["staff_advances", "1230"]]) {
      const p = ok(await m.proposeCategoryAccount({}, form({ key: key(), category, ledgerAccountId: acct[code], note: "Accountant approved treatment" })));
      as("adm"); ok(await m.decideCategoryAccount({}, form({ id: p.id, decision: "approve", key: key() }))); as("fin");
    }
    const setup = await m.readBankingSetup();
    assert.ok(!JSON.stringify(setup).includes(FULL_NUMBER), "the full account number is never returned");
    assert.equal(setup.accounts.find((a) => a.id === bank).identifier, "•••• 4567");
  });

  await check("cash through actions: finance prepares; approval needs cash_approve and a different person; posting goes through the ledger", async () => {
    as("fin");
    const r = ok(await m.createCashTransaction({}, form({ key: key(), kind: "receipt", bankingAccountId: bank, counterAccountId: acct["4100"], date: D(3, 2), amount: "250000", description: "Consultancy fee", reference: "INV-90" })));
    assert.match(r.message, /different authorized person/);
    await assert.rejects(m.decideCashTransaction({}, form({ id: r.id, decision: "approve", key: key() })), /NEXT_NOT_FOUND/, "finance cannot approve cash by default");
    c.custom.fin = ["org:calacot:cash_approve"];
    assert.match((await m.decideCashTransaction({}, form({ id: r.id, decision: "approve", key: key() }))).message, /cannot approve something you prepared/);
    c.custom.fin = [];
    as("adm");
    assert.match(ok(await m.decideCashTransaction({}, form({ id: r.id, decision: "approve", key: key() }))).message, /posted as JE-/);
    as("fin");
    assert.match((await m.createCashTransaction({}, form({ key: key(), kind: "payment", bankingAccountId: bank, counterAccountId: acct["1110"], date: D(3, 3), amount: "1000", description: "Disguised transfer" }))).message, /transfer, not income or expense/);
    const t = ok(await m.createCashTransaction({}, form({ key: key(), kind: "transfer", bankingAccountId: bank, toAccountId: petty, date: D(3, 4), amount: "50000", description: "Top-up", reference: "TRF-9" })));
    as("adm"); ok(await m.decideCashTransaction({}, form({ id: t.id, decision: "approve", key: key() })));
    as("fin");
    const cash = await m.readCashPage({});
    assert.equal(cash.rows.filter((x) => x.status === "posted").length, 2);
  });

  await check("statement route: preview writes nothing; import is idempotent; malicious and oversized files are refused", async () => {
    as("fin");
    const csv = `Date,Description,Credit,Debit,Reference,Balance\r\n${D(3, 2)},Consultancy fee INV-90,250000,,INV-90,250000\r\n${D(3, 4)},"=HYPERLINK(""http://x"")",,50000,TRF-9,200000\r\n${D(3, 31)},Service charge,,2500,,197500\r\n`;
    const before = (await q("SELECT count(*)::int AS n FROM bank_statement_lines"))[0].n;
    const p = await upload({ bankingAccountId: bank, mode: "preview", key: key() }, csv);
    assert.equal(p.ok, true, p.message);
    assert.equal(p.rowCount, 3);
    assert.deepEqual(p.mapping, { date: 0, description: 1, credit: 2, debit: 3, reference: 4, balance: 5 }, "columns guessed from the header");
    assert.equal((await q("SELECT count(*)::int AS n FROM bank_statement_lines"))[0].n, before, "preview writes nothing");
    const k = key();
    const i = await upload({ bankingAccountId: bank, mode: "import", key: k, mapping: p.mapping }, csv);
    assert.equal(i.ok, true, i.message);
    assert.match(i.message, /Imported 3 new transactions.*No journals were created/);
    const again = await upload({ bankingAccountId: bank, mode: "import", key: key(), mapping: p.mapping }, csv);
    assert.match(again.message, /already imported/);
    const stored = (await q("SELECT description FROM bank_statement_lines WHERE reference='TRF-9'"))[0].description;
    assert.equal(stored, '=HYPERLINK("http://x")', "formula-like text is stored as inert text, never evaluated");
    assert.equal((await upload({ bankingAccountId: bank, mode: "preview", key: key() }, "x".repeat(2 * 1024 * 1024 + 10))).status, 413);
    assert.equal((await upload({ bankingAccountId: bank, mode: "preview", key: key() }, csv, "statement.xlsx")).status, 400);
    assert.match((await upload({ bankingAccountId: bank, mode: "preview", key: key() }, "Date,Description,Amount\n2020-13-45,x,1\n")).message, /Row 2: Invalid ISO date/);
    assert.match((await upload({ bankingAccountId: petty, mode: "preview", key: key() }, csv)).message, /bank and mobile-money/);
    as("view");
    assert.equal((await upload({ bankingAccountId: bank, mode: "preview", key: key() }, csv)).status, 404, "viewers cannot import");
  });

  let rec = "";
  await check("matching and reconciliation through actions: suggestions confirmed by a person; finalized only by someone else", async () => {
    as("fin");
    const w = await m.readBankingAccount(bank, {});
    const sLine = w.lines.find((l) => l.reference === "INV-90");
    const sugg = w.suggestions[sLine.id];
    assert.equal(sugg[0].score, 100, "exact match: same amount, same date, same reference");
    assert.equal((await q("SELECT count(*)::int AS n FROM bank_match_groups"))[0].n, 0, "reading suggestions writes nothing");
    ok(await m.createMatch({}, form({ key: key(), bankingAccountId: bank, kind: "match", items: [{ statementLineId: sLine.id, amount: "250000.00" }, { journalLineId: sugg[0].ledgerId, amount: "250000.00" }] })));
    const tLine = w.lines.find((l) => l.reference === "TRF-9");
    ok(await m.createMatch({}, form({ key: key(), bankingAccountId: bank, kind: "match", items: [{ statementLineId: tLine.id, amount: "-50000.00" }, { journalLineId: w.suggestions[tLine.id][0].ledgerId, amount: "-50000.00" }] })));
    const fee = w.lines.find((l) => l.description === "Service charge");
    ok(await m.createCashTransaction({}, form({ key: key(), kind: "bank_adjustment", statementLineId: fee.id, category: "bank_fee" })));
    rec = ok(await m.createReconciliation({}, form({ key: key(), bankingAccountId: bank, periodStart: D(3, 1), periodEnd: D(3, 31), openingStatementBalance: "0", closingStatementBalance: "197500" }))).id;
    let d = await m.readReconciliation(rec);
    assert.equal(d.figures.balanced, false, "the fee is not posted yet");
    assert.match((await m.reconciliationCommand({}, form({ id: rec, command: "submit", version: String(d.r.version), key: key() }))).message, /not matched/);
    const adj = (await q("SELECT id FROM cash_transactions WHERE kind='bank_adjustment'"))[0].id;
    as("adm"); ok(await m.decideCashTransaction({}, form({ id: adj, decision: "approve", key: key() })));
    as("fin");
    d = await m.readReconciliation(rec);
    assert.deepEqual([d.figures.balanced, d.figures.difference], [true, "0.00"]);
    ok(await m.reconciliationCommand({}, form({ id: rec, command: "submit", version: String(d.r.version), key: key() })));
    d = await m.readReconciliation(rec);
    await assert.rejects(m.reconciliationCommand({}, form({ id: rec, command: "finalize", version: String(d.r.version), key: key() })), /NEXT_NOT_FOUND/, "finance cannot finalize by default");
    c.custom.fin = ["org:calacot:banking_reconcile_approve"];
    assert.match((await m.reconciliationCommand({}, form({ id: rec, command: "finalize", version: String(d.r.version), key: key() }))).message, /did not prepare or submit/);
    c.custom.fin = [];
    as("adm"); ok(await m.reconciliationCommand({}, form({ id: rec, command: "finalize", version: String(d.r.version), key: key() })));
    as("view");
    const list = await m.readReconciliations({});
    assert.equal(list.rows[0].status, "finalized");
    assert.equal(list.rows[0].figures.difference, "0.00", "finalized figures come from the immutable snapshot");
  });

  await check("mutations: cross-origin and revoked sessions write nothing; other organizations see nothing", async () => {
    as("fin");
    const n = (await q("SELECT count(*)::int AS n FROM cash_transactions"))[0].n;
    c.origin = "http://evil.test";
    assert.equal((await m.createCashTransaction({}, form({ key: key(), kind: "receipt", bankingAccountId: bank, counterAccountId: acct["4100"], date: D(3, 5), amount: "1", description: "x" }))).ok, false);
    c.origin = "http://app.test"; c.revoked = true;
    await assert.rejects(m.createCashTransaction({}, form({ key: key(), kind: "receipt", bankingAccountId: bank, counterAccountId: acct["4100"], date: D(3, 5), amount: "1", description: "x" })), /NEXT_NOT_FOUND/);
    c.revoked = false;
    assert.equal((await q("SELECT count(*)::int AS n FROM cash_transactions"))[0].n, n, "nothing written");
    as("other", "org_b"); process.env.CALACOT_CLERK_ORG_ID = "org_b";
    await assert.rejects(m.readBankingAccount(bank, {}), /NEXT_NOT_FOUND/);
    await assert.rejects(m.readReconciliation(rec), /NEXT_NOT_FOUND/);
    assert.equal((await m.readBankingOverview()).accounts.length, 0);
    process.env.CALACOT_CLERK_ORG_ID = "org_a";
  });

  await check("reads: reports keep currencies apart and label book, statement and reconciled balances", async () => {
    as("view");
    const r = await m.readBankingReports({ from: D(1, 1), to: D(12, 31) });
    const b = r.accounts.find((a) => a.id === bank);
    assert.deepEqual([b.book, b.statement, b.reconciled_balance], ["197500.00", "197500.00", "197500.00"]);
    assert.ok(r.movement.every((x) => x.currency === "UGX"));
    assert.equal(r.recognized[0].category, "bank_fee");
    assert.equal(r.transfers.length, 1);
  });

  console.log(`Banking action checks passed (${passed.length}).`);
} finally {
  await pg.close();
  await rm("tmp/sales-private/banking", { recursive: true, force: true });
}
