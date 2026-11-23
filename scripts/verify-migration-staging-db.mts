// Phase 2F: staging-only opening-balance migration on a disposable PGlite database migrated with the
// real drizzle-current chain (0000-0024). Synthetic schedules only. Verifies reconciliation of the
// staged trial balance with its subledger schedules, duplicate protection, two-person approval,
// immutability, and that nothing reaches the general ledger.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { chartSeedPayload } from "../lib/accounting/chart";
import { proposeClassification, type ChartAccount } from "../lib/accounting/statements";
import { migrationTemplateHeader, parseMigrationTemplate } from "../lib/accounting/migration";

const db = new PGlite();
const passed: string[] = [];
const check = async (name: string, f: () => Promise<void>) => { await f(); passed.push(name); console.log("PASS", name); };
const q = async <T = Record<string, unknown>,>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
const one = async <T = Record<string, unknown>,>(text: string, params: unknown[] = []) => (await q<T>(text, params))[0];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = async (call: string, params: unknown[] = []) => (await one<{ r: any }>(`SELECT ${call} AS r`, params)).r;
const key = () => randomUUID();
const S = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  assert.ok(journal.entries.some((e) => e.tag === "0024_opening_balance_staging"));
  for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await db.exec(s);
  console.log("PASS migration chain applied through 0024");
  await db.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,display_name,status) VALUES ('${S(1)}','a','prep','Preparer','active'),('${S(2)}','a','review','Reviewer','active'),('${S(3)}','a','third','Third','active');`);
  const Y = Number((await one<{ d: string }>("SELECT finance_kampala_today()::text AS d")).d.slice(0, 4));
  const cutoff = `${Y - 1}-12-31`;
  await fn("accounting_chart_seed('a','prep',$1::jsonb,$2,'t')", [JSON.stringify(chartSeedPayload()), key()]);
  await fn("accounting_chart_approve('a','review',$1,'t')", [key()]);
  const pol = await fn("accounting_policy_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: true, note: "Fixture policy" })]);
  await fn("accounting_policy_decide('a','review',$1,'approve','ok',$2,'t')", [pol.id, key()]);
  await fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [Y, key()]);
  const accounts = await q<{ id: string; code: string; account_type: string; is_contra: boolean; is_postable: boolean; reporting_class: string | null }>("SELECT id,code,account_type,is_contra,is_postable,reporting_class FROM accounting_accounts WHERE organization_id='a'");
  const mapping = proposeClassification(accounts.map((a): ChartAccount => ({ id: a.id, code: a.code, accountType: a.account_type as ChartAccount["accountType"], isContra: a.is_contra, isPostable: a.is_postable, reportingClass: a.reporting_class })));
  const cls = await fn("fs_classification_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), mappings: mapping, retainedEarningsAccountId: accounts.find((a) => a.code === "3200")!.id, note: "Fixture classification" })]);
  await fn("fs_policy_decide('a','review','classification',$1::uuid,'approve','ok',$2,'t')", [cls.id, key()]);
  const journalsBefore = (await one<{ n: number }>("SELECT count(*)::int AS n FROM accounting_journals")).n;

  // A synthetic opening position at the cutoff (debit positive). Debits = credits = 9,300,000.
  const tb = (code: string, amount: string) => ({ kind: "trial_balance", sourceRef: `TB-${code}`, sourceAccount: `Source ${code}`, accountCode: code, currency: "UGX", amount });
  const rows = (overrides: { receivable2?: string; extra?: object[] } = {}) => [
    tb("1120", "5000000.00"), tb("1200", "1200000.00"), tb("1240", "100000.00"), tb("1540", "3000000.00"), tb("1590", "-600000.00"),
    tb("2110", "-700000.00"), tb("2130", "-400000.00"), tb("2195", "-300000.00"), tb("3100", "-5000000.00"), tb("3200", "-2300000.00"),
    { kind: "receivable", sourceRef: "INV-001", counterparty: "Client A", documentNumber: "OLD-INV-001", documentDate: `${Y - 1}-11-02`, currency: "UGX", amount: "700000.00" },
    { kind: "receivable", sourceRef: "INV-002", counterparty: "Client B", documentNumber: "OLD-INV-002", documentDate: `${Y - 1}-12-10`, currency: "UGX", amount: overrides.receivable2 ?? "500000.00" },
    { kind: "payable", sourceRef: "SUP-1", counterparty: "Supplier X", currency: "UGX", amount: "700000.00" },
    { kind: "customer_advance", sourceRef: "DEP-1", counterparty: "Client C", currency: "UGX", amount: "400000.00" },
    { kind: "supplier_advance", sourceRef: "ADV-1", counterparty: "Landlord", currency: "UGX", amount: "100000.00" },
    { kind: "bank_balance", sourceRef: "STMT-DEC", accountCode: "1120", currency: "UGX", amount: "5000000.00" },
    { kind: "fixed_asset", sourceRef: "FA-0001", counterparty: "Laptops", currency: "UGX", amount: "2400000.00", details: { cost: "3000000.00", accumulated: "600000.00", acquired: `${Y - 3}-03-01` } },
    { kind: "tax_balance", sourceRef: "URA-ASSESS", accountCode: "2195", currency: "UGX", amount: "300000.00" },
    ...(overrides.extra ?? []),
  ];
  const version = async (id: string) => (await one<{ version: number }>("SELECT version FROM migration_batches WHERE id=$1", [id])).version;
  const load = async (id: string, r: object[], actor = "prep") => fn("migration_rows_replace('a',$1,$2::uuid,$3,$4::jsonb,$5,'t')", [actor, id, await version(id), JSON.stringify(r), key()]);
  const cmd = async (id: string, c: string, actor: string, note = "") => fn("migration_batch_command('a',$1,$2::uuid,$3,$4,$5,$6,'t')", [actor, id, c, await version(id), note, key()]);
  const status = (v: { checks: { key: string; status: string }[] }, k: string) => v.checks.find((x) => x.key === k)?.status;

  let batch = "";
  await check("staging: rows keep their source identifiers; unknown accounts, duplicates and malformed amounts are refused", async () => {
    await assert.rejects(fn("migration_batch_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), sourceSystem: "quickbooks", sourceDescription: "Assumed source", cutoffDate: cutoff, evidenceReference: "x" })]), /invalid_migration_batch/, "the source must be one of the documented kinds, not assumed");
    batch = String((await fn("migration_batch_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), sourceSystem: "accountant_schedule", sourceDescription: "Accountant's opening schedule (synthetic)", cutoffDate: cutoff, evidenceReference: "Signed schedule OB-1" })])).id);
    await assert.rejects(load(batch, [...rows(), tb("1120", "1.00")]), /migration_duplicate_source_ref/);
    await assert.rejects(load(batch, [tb("9999", "1.00")]), /migration_account_unknown/);
    await assert.rejects(load(batch, [tb("1120", "1.005")]), /invalid_migration_rows/);
    await assert.rejects(load(batch, rows(), "review"), /not_preparer/);
    await load(batch, rows({ receivable2: "400000.00" }));
    const r = await one<{ source_ref: string; source_account: string }>("SELECT source_ref,source_account FROM migration_rows WHERE batch_id=$1 AND row_kind='trial_balance' AND source_ref='TB-1120'", [batch]);
    assert.equal(r.source_account, "Source 1120", "the original account label is preserved");
  });

  await check("reconciliation: a schedule that disagrees with its control account is shown with its difference and blocks submission; nothing is adjusted", async () => {
    const v = await fn("migration_batch_validate('a',$1::uuid)", [batch]);
    assert.equal(status(v, "tb_balanced"), "pass");
    assert.equal(status(v, "receivables"), "fail");
    assert.equal(Number(v.checks.find((x: { key: string }) => x.key === "receivables").count), 100000, "the difference is reported, not absorbed");
    for (const k of ["payables", "customer_advances", "supplier_advances", "bank_balances", "bank_evidence", "tax_balances", "fixed_assets", "functional_currency", "accounts_classified", "ledger_empty_to_cutoff", "cutoff_boundary"]) assert.equal(status(v, k), "pass", k);
    await assert.rejects(cmd(batch, "submit", "prep"), /migration_validation_failed/);
    // A foreign-currency balance would need an approved conversion policy: refused, never converted.
    await load(batch, rows({ extra: [{ kind: "trial_balance", sourceRef: "TB-USD", accountCode: "1121", currency: "USD", amount: "0.00" }] }));
    assert.equal(status(await fn("migration_batch_validate('a',$1::uuid)", [batch]), "functional_currency"), "fail");
    await load(batch, rows());
    assert.equal((await fn("migration_batch_validate('a',$1::uuid)", [batch])).ready, true);
  });

  await check("approval: a second person approves after re-validation; rows and batch are then immutable; nothing is posted", async () => {
    await cmd(batch, "submit", "prep");
    await assert.rejects(load(batch, rows()), /migration_rows_locked/);
    await assert.rejects(q("UPDATE migration_rows SET amount=1 WHERE batch_id=$1", [batch]), /migration_rows_locked/, "direct SQL cannot change submitted rows");
    await assert.rejects(cmd(batch, "approve", "prep"), /migration_self_approval_denied/);
    await cmd(batch, "approve", "review", "Agreed to the signed schedule");
    await assert.rejects(q("UPDATE migration_batches SET cutoff_date=cutoff_date-1 WHERE id=$1", [batch]), /invalid_migration_transition/);
    await assert.rejects(q("DELETE FROM migration_batches WHERE id=$1", [batch]), /migration_history_immutable/);
    await assert.rejects(q("DELETE FROM migration_events"), /immutable/);
    assert.equal((await one<{ n: number }>("SELECT count(*)::int AS n FROM accounting_journals")).n, journalsBefore, "staging never writes to the ledger");
    assert.equal((await one<{ n: number }>("SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE 'migration_%' AND prosrc ILIKE '%INSERT INTO accounting_journal%'")).n, 0, "no staging function writes journals");
  });

  await check("duplicates with the live ledger: entries dated on or before the cutoff block the batch", async () => {
    await fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [Y - 1, key()]);
    const acct = Object.fromEntries(accounts.map((a) => [a.code, a.id]));
    const j = await fn("accounting_journal_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), entryDate: `${Y - 1}-12-15`, description: "Pre-cutoff entry", lines: [{ accountId: acct["6200"], debit: "10.00", currency: "UGX" }, { accountId: acct["1120"], credit: "10.00", currency: "UGX" }] })]);
    const s = await fn("accounting_journal_command('a','prep',$1,'submit',1,'',$2,'t')", [j.id, key()]);
    void s;
    const b2 = String((await fn("migration_batch_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), sourceSystem: "spreadsheet", sourceDescription: "Revised schedule (synthetic)", cutoffDate: cutoff, evidenceReference: "Schedule OB-2" })])).id);
    await load(b2, rows());
    const v = await fn("migration_batch_validate('a',$1::uuid)", [b2]);
    assert.equal(status(v, "ledger_empty_to_cutoff"), "fail", "a journal awaiting approval before the cutoff would be double counted");
    assert.ok(Number(v.checks.find((x: { key: string }) => x.key === "approved_overlap").count) > 0, "overlap with the approved batch is reported");
    await fn("accounting_journal_command('a','review',$1,'reject',2,'Belongs in the opening balances',$2,'t')", [j.id, key()]);
    assert.equal((await fn("migration_batch_validate('a',$1::uuid)", [b2])).ready, true);
    await cmd(b2, "submit", "prep");
    await cmd(b2, "approve", "third", "Revised schedule agreed");
    const st = await q<{ id: string; status: string }>("SELECT id,status FROM migration_batches WHERE organization_id='a' ORDER BY prepared_at");
    assert.deepEqual(st.map((x) => x.status), ["superseded", "approved"], "one approved batch; the earlier one is kept as superseded");
  });

  await check("template: shape errors are listed by row; amounts are kept as written, never rounded or converted", async () => {
    const csv = (lines: string[]) => new TextEncoder().encode(lines.join("\n"));
    const head = migrationTemplateHeader.join(",");
    const ok = parseMigrationTemplate(csv([head, "trial_balance,TB-1,Bank,1120,,,,UGX,\"5,000,000.50\",,,", "fixed_asset,FA-1,,,Laptops,,,UGX,2400000,3000000,600000,2023-03-01"]));
    assert.deepEqual(ok.errors, []);
    assert.equal(ok.rows[0].amount, "5000000.50");
    assert.deepEqual(ok.rows[1].details, { cost: "3000000", accumulated: "600000", acquired: "2023-03-01" });
    const bad = parseMigrationTemplate(csv([head, "receivable,,,,,,,UGX,-5,,,", "trial_balance,TB-2,,,,,,UGX,1.234,,,", "loan,L-1,,,,,,UGX,1,,,"]));
    assert.ok(bad.errors.some((e) => e.startsWith("Row 2: source_ref")));
    assert.ok(bad.errors.some((e) => e.startsWith("Row 2: schedule amounts")));
    assert.ok(bad.errors.some((e) => e.startsWith("Row 3: amount")));
    assert.ok(bad.errors.some((e) => e.startsWith("Row 3: account_code")));
    assert.ok(bad.errors.some((e) => e.startsWith("Row 4: unknown kind")));
    assert.match(parseMigrationTemplate(csv(["kind,amount", "trial_balance,1"])).errors[0], /Missing columns/);
  });

  console.log(`\nAll ${passed.length} migration staging checks passed.`);
} finally {
  await db.close();
}
