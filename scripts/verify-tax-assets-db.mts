// Phase 2D: tax management, fixed assets and payroll foundation on a disposable in-memory PGlite
// database migrated with the real drizzle-current chain (0000-0022). Synthetic data only: no
// environment variables, no network, no real tax data. Every rule is exercised through the command
// functions and, where relevant, through direct SQL that tries to bypass them.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { chartSeedPayload } from "../lib/accounting/chart";
import { straightLineDepreciation } from "../lib/assets/depreciation";

const db = new PGlite();
const passed: string[] = [];
const check = async (name: string, f: () => Promise<void>) => { await f(); passed.push(name); console.log("PASS", name); };
const q = async <T = Record<string, unknown>,>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
const one = async <T = Record<string, unknown>,>(text: string, params: unknown[] = []) => (await q<T>(text, params))[0];
const fn = async (call: string, params: unknown[] = []) => (await one<{ r: Record<string, unknown> }>(`SELECT ${call} AS r`, params)).r;
const key = () => randomUUID();
const S = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  assert.ok(journal.entries.some((e) => e.tag === "0022_tax_assets_payroll"));
  for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await db.exec(s);
  console.log("PASS migration chain 0000-0022 applied");

  await db.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A'),('b','B','B');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,display_name,status) VALUES
      ('${S(1)}','a','prep','Preparer','active'),('${S(2)}','a','review','Reviewer','active'),('${S(3)}','a','third','Third','active'),
      ('${S(4)}','a','gone','Suspended','suspended'),('${S(9)}','b','other','Other','active');`);
  const today = (await one<{ d: string }>("SELECT finance_kampala_today()::text AS d")).d;
  const Y = Number(today.slice(0, 4)) - 1;
  const D = (m: number, d: number) => `${Y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const doc = async (name: string, org = "a") => String((await one<{ id: string }>("INSERT INTO documents(organization_id,name,kind,storage_key,mime_type,size_bytes) VALUES($1,$2,'policy',$3,'application/pdf',100) RETURNING id", [org, name, `t/${randomUUID()}`])).id);
  const evidence = await doc("URA registration certificate (synthetic)");

  await fn("accounting_chart_seed('a','prep',$1::jsonb,$2,'t')", [JSON.stringify(chartSeedPayload()), key()]);
  const acct: Record<string, string> = {};
  for (const r of await q<{ id: string; code: string }>("SELECT id,code FROM accounting_accounts WHERE organization_id='a'")) acct[r.code] = r.id;
  await fn("accounting_account_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), code: "1120-01", name: "Bank UGX", accountType: "asset", reportingClass: "current_asset", parentId: acct["1100"], currency: "UGX" })]);
  await fn("accounting_chart_approve('a','review',$1,'t')", [key()]);
  for (const r of await q<{ id: string; code: string }>("SELECT id,code FROM accounting_accounts WHERE organization_id='a'")) acct[r.code] = r.id;
  const pol = await fn("accounting_policy_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: true, note: "Fixture policy" })]);
  await fn("accounting_policy_decide('a','review',$1,'approve','ok',$2,'t')", [pol.id, key()]);
  await fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [Y, key()]);
  await fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [Y + 1, key()]);
  const L = (code: string, side: "debit" | "credit", amount: string) => ({ accountId: acct[code], [side]: amount, currency: "UGX" });
  const postManual = async (date: string, description: string, lines: Record<string, unknown>[]) => {
    const j = await fn("accounting_journal_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), entryDate: date, description, lines })]);
    const s = await fn("accounting_journal_command('a','prep',$1,'submit',1,'',$2,'t')", [j.id, key()]);
    const a = await fn("accounting_journal_command('a','review',$1,'approve',$2,'',$3,'t')", [j.id, s.version, key()]);
    await fn("accounting_journal_command('a','review',$1,'post',$2,'',$3,'t')", [j.id, a.version, key()]);
    return String(j.id);
  };
  const decide = (lid: unknown, actor = "review", decision = "approve", note = "Checked") => fn("ledger_link_decide('a',$1,$2::uuid,$3,$4,$5,'t')", [actor, lid, decision, note, key()]);

  // A bank account through Phase 2C, for tax payments and disposal proceeds.
  const fa = await fn("finance_account_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), method: "bank_transfer", provider: "Fixture Bank", accountIdentifier: "000111", label: "Bank", currency: "UGX", verificationNote: "Synthetic fixture" })]);
  const bank = String((await fn("banking_account_register('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), kind: "bank", financeAccountId: fa.id })])).id);
  const bm = await fn("bank_mapping_propose('a','prep',$1::uuid,$2::uuid,'Bank mapping',$3,'t')", [bank, acct["1120-01"], key()]);
  await fn("bank_mapping_decide('a','review',$1::uuid,'approve','',$2,'t')", [bm.id, key()]);

  const rule = (p: Record<string, unknown>, actor = "prep") => fn("tax_rule_propose('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), evidenceDocumentId: evidence, legalBasis: "Income Tax Act, as confirmed by the company accountant", ...p })]);
  const ruleDecide = (id: unknown, actor = "review", decision = "approve", note = "Agreed with the accountant") => fn("tax_rule_decide('a',$1,$2::uuid,$3,$4,$5,'t')", [actor, id, decision, note, key()]);
  const obligation = (p: Record<string, unknown>, actor = "prep") => fn("tax_obligation_propose('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), taxpayerName: "Fixture Group Ltd", effectiveFrom: `${Y}-01-01`, legalBasis: "Registration per URA certificate (synthetic)", periodBasis: "accounting_year", filingFrequency: "annual", ...p })]);
  const obligationDecide = (id: unknown, actor = "review", decision = "approve", note = "Evidence checked") => fn("tax_obligation_decide('a',$1,$2::uuid,$3,$4,$5,'t')", [actor, id, decision, note, key()]);

  // ------------------------------------------------------------------------------------------
  await check("tax rules: validated, evidenced, approved by a second person; versions supersede but stay in force for past dates", async () => {
    await assert.rejects(rule({ ruleCode: "cit-rate", ruleKind: "income_tax_rate", description: "Bad rate", parameters: { rate: "30" }, effectiveFrom: `${Y}-01-01` }), /invalid_tax_rule/, "30 is not a fraction");
    await assert.rejects(rule({ ruleCode: "cit-rate", ruleKind: "income_tax_rate", description: "No evidence", parameters: { rate: "0.3" }, effectiveFrom: `${Y}-01-01`, evidenceDocumentId: "" }), /tax_evidence_required/);
    await assert.rejects(rule({ ruleCode: "cit-rate", ruleKind: "income_tax_rate", description: "Other org evidence", parameters: { rate: "0.3" }, effectiveFrom: `${Y}-01-01`, evidenceDocumentId: await doc("x", "b") }), /tax_evidence_unavailable/);
    const r1 = await rule({ ruleCode: "cit-rate", ruleKind: "income_tax_rate", description: "Corporate rate for testing", parameters: { rate: "0.3" }, effectiveFrom: `${Y - 5}-01-01` });
    await assert.rejects(rule({ ruleCode: "cit-rate", ruleKind: "income_tax_rate", description: "Second proposal", parameters: { rate: "0.25" }, effectiveFrom: `${Y + 1}-01-01` }), /tax_rule_pending/);
    await assert.rejects(ruleDecide(r1.id, "prep"), /tax_self_approval_denied/);
    await ruleDecide(r1.id);
    await assert.rejects(q("UPDATE tax_rule_versions SET parameters='{\"rate\":\"0.1\"}' WHERE id=$1", [r1.id]), /tax_history_immutable/);
    await assert.rejects(q("DELETE FROM tax_rule_versions WHERE id=$1", [r1.id]), /tax_history_immutable/);
    const r2 = await rule({ ruleCode: "cit-rate", ruleKind: "income_tax_rate", description: "Future rate change for testing", parameters: { rate: "0.25" }, effectiveFrom: `${Y + 1}-01-01` });
    await ruleDecide(r2.id);
    const at = async (d: string) => (await one<{ r: { parameters: { rate: string } } }>("SELECT to_jsonb(tax_rule_at('a','cit-rate',$1::date)) AS r", [d])).r.parameters.rate;
    assert.equal(await at(`${Y}-06-30`), "0.3", "the superseded version still applies to earlier dates");
    assert.equal(await at(`${Y + 1}-06-30`), "0.25");
    const ca = await rule({ ruleCode: "ca-computers", ruleKind: "capital_allowance_class", description: "Computers class for testing", parameters: { classCode: "computers", method: "straight_line", rate: "0.4" }, effectiveFrom: `${Y - 5}-01-01` });
    await ruleDecide(ca.id);
  });

  let cit = "";
  await check("obligations: no tax is operational by default; VAT, WHT, PAYE and NSSF cannot be enabled; evidence and a second person are required", async () => {
    await assert.rejects(obligation({ code: "vat", taxType: "vat", name: "Value added tax", registrationStatus: "registered", processingEnabled: true, evidenceDocumentId: evidence, calculationRuleCode: "cit-rate", accounts: { expense: acct["8900"], liability: acct["2180"] } }), /tax_type_not_enabled_in_phase/);
    for (const t of ["withholding_tax", "paye", "nssf"]) await assert.rejects(obligation({ code: t.replace("_", "-"), taxType: t, name: `${t} obligation`, registrationStatus: "registered", processingEnabled: true, evidenceDocumentId: evidence }), /tax_type_not_enabled_in_phase/);
    await assert.rejects(obligation({ code: "vat", taxType: "vat", name: "Value added tax", registrationStatus: "registered" }), /tax_evidence_required/, "a registration claim needs evidence");
    const vat = await obligation({ code: "vat", taxType: "vat", name: "Value added tax", registrationStatus: "pending_verification", note: "Registration not confirmed" });
    await obligationDecide(vat.id);
    await assert.rejects(q("UPDATE tax_obligation_versions SET processing_enabled=true WHERE id=$1", [vat.id]), /tax_history_immutable/);
    await assert.rejects(q(`INSERT INTO tax_obligation_versions(organization_id,code,version,tax_type,name,registration_status,taxpayer_name,effective_from,legal_basis,period_basis,filing_frequency,processing_enabled,evidence_document_id,calculation_rule_code,expense_account_id,liability_account_id,proposed_by_id,idempotency_key)
      VALUES('a','vat2',1,'vat','VAT direct','registered','X','${Y}-01-01','Direct insert attempt','calendar_month','monthly',true,$1,'cit-rate',$2,$3,$4,$5)`, [evidence, acct["8900"], acct["2180"], S(1), key()]), /check|violates/i, "direct SQL cannot enable VAT");
    const deadlines = [
      { event: "provisional_return", label: "Provisional return and first instalment", anchor: "year_start", monthsOffset: 5, day: "last", filing: true, payment: true },
      { event: "second_instalment", label: "Second provisional instalment", anchor: "year_start", monthsOffset: 11, day: "last", filing: false, payment: true },
      { event: "final_return", label: "Final return and balance", anchor: "period_end", monthsOffset: 6, day: "last", filing: true, payment: true },
    ];
    const bad = await assert.rejects(obligation({ code: "cit", taxType: "corporate_income_tax", name: "Corporate income tax", registrationStatus: "registered", evidenceDocumentId: evidence, deadlineRules: [{ event: "x" }] }), /invalid_deadline_rules/);
    void bad;
    await assert.rejects(obligation({ code: "cit", taxType: "corporate_income_tax", name: "Corporate income tax", registrationStatus: "registered", evidenceDocumentId: evidence, processingEnabled: true, deadlineRules: deadlines }), /tax_processing_prerequisites/, "processing needs a rule and accounts");
    const o = await obligation({ code: "cit", taxType: "corporate_income_tax", name: "Corporate income tax", registrationStatus: "registered", taxpayerTin: "1000000000", evidenceDocumentId: evidence,
      processingEnabled: true, calculationRuleCode: "cit-rate", deadlineRules: deadlines, accounts: { expense: acct["8900"], liability: acct["2195"], prepayment: acct["1240"] } });
    await assert.rejects(obligationDecide(o.id, "prep"), /tax_self_approval_denied/);
    await assert.rejects(fn("tax_obligation_decide('b','other',$1::uuid,'approve','',$2,'t')", [o.id, key()]), /tax_obligation_unavailable/);
    await obligationDecide(o.id);
    cit = "cit";
    assert.equal((await one<{ n: number }>("SELECT count(*)::int AS n FROM tax_obligation_versions WHERE organization_id='a' AND processing_enabled")).n, 1);
  });

  // Ledger activity for year Y: revenue 10,000,000; expenses 4,000,000.
  await postManual(D(3, 31), "Design fees", [L("1120-01", "debit", "10000000.00"), L("4100", "credit", "10000000.00")]);
  await postManual(D(4, 30), "Rent", [L("6200", "debit", "4000000.00"), L("1120-01", "credit", "4000000.00")]);

  // ------------------------------------------------------------------------------------------
  let asset = "";
  await check("fixed assets: categories are approved policy; hired equipment is never capitalized; thresholds and expense limits apply", async () => {
    const cat = (p: Record<string, unknown>, actor = "prep") => fn("asset_category_propose('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), name: "Computers", usefulLifeMonths: 36, residualPercent: "0", periodConvention: "daily_proration",
      capitalizationThreshold: "500000", taxAllowanceRuleCode: "ca-computers", policyBasis: "Board-approved asset policy (synthetic)", accounts: { cost: acct["1540"], accumulated: acct["1590"], expense: acct["6900"], impairment: acct["6900"], gain: acct["7300"], loss: acct["8300"] }, ...p })]);
    await assert.rejects(cat({ code: "BAD", accounts: { cost: acct["6900"], accumulated: acct["1590"], expense: acct["6900"], impairment: acct["6900"], gain: acct["7300"], loss: acct["8300"] } }), /asset_category_account_invalid/, "cost must be an asset");
    await assert.rejects(cat({ code: "BAD2", accounts: { cost: acct["1540"], accumulated: acct["1540"], expense: acct["6900"], impairment: acct["6900"], gain: acct["7300"], loss: acct["8300"] } }), /asset_category_account_invalid/, "accumulated depreciation must be a contra asset");
    const c1 = await cat({ code: "COMP" });
    await assert.rejects(fn("asset_category_decide('a','prep',$1::uuid,'approve','',$2,'t')", [c1.id, key()]), /asset_self_approval_denied/);
    const save = (p: Record<string, unknown>) => fn("fixed_asset_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), currency: "UGX", ...p })]);
    await assert.rejects(save({ name: "Laptop", ownership: "owned", categoryCode: "COMP", acquisitionDate: D(1, 10), capitalizationDate: D(1, 16), cost: "3600000", capitalizationSource: "direct_credit", creditAccountId: acct["2120"] }), /asset_category_not_approved/, "no posting policy before approval");
    await fn("asset_category_decide('a','review',$1::uuid,'approve','',$2,'t')", [c1.id, key()]);
    const hired = await save({ name: "Hired scaffolding", ownership: "hired", acquisitionDate: D(2, 1), hireReference: "HIRE-77", location: "Site A" });
    await assert.rejects(fn("fixed_asset_capitalize('a','prep',$1::uuid,$2::jsonb,'t')", [hired.id, JSON.stringify({ key: key() })]), /hired_asset_not_capitalized/);
    await assert.rejects(save({ name: "Mouse", ownership: "owned", categoryCode: "COMP", acquisitionDate: D(1, 10), capitalizationDate: D(1, 16), cost: "50000", capitalizationSource: "direct_credit", creditAccountId: acct["2120"] }), /asset_below_capitalization_threshold/);
    // An approved expense of 4,000,000 net: assets linked to it can never exceed it.
    await db.query("INSERT INTO expenses(id,organization_id,division,category,description,net_amount,tax_amount,total,currency,status,incurred_at,approved_by_id,approved_at) VALUES($1,'a','tech','equipment','Laptops',4000000,0,4000000,'UGX','approved',now(),$2,now())", [S(50), S(2)]);
    const a1 = await save({ name: "Laptop A", ownership: "owned", categoryCode: "COMP", acquisitionDate: D(1, 10), capitalizationDate: D(1, 16), cost: "3600000", capitalizationSource: "expense_reclass", expenseId: S(50), creditAccountId: acct["6990"], serialNumber: "SN-1", custodianId: S(3), division: "tech" });
    await assert.rejects(save({ name: "Laptop B", ownership: "owned", categoryCode: "COMP", acquisitionDate: D(1, 10), capitalizationDate: D(1, 16), cost: "600000", capitalizationSource: "expense_reclass", expenseId: S(50), creditAccountId: acct["6990"] }), /asset_exceeds_expense/, "the same supplier invoice is never capitalized twice");
    asset = String(a1.id);
    assert.equal(a1.assetNumber, "FA-00002", "asset numbers are sequential per organization (hired equipment took FA-00001)");
    const cap = await fn("fixed_asset_capitalize('a','prep',$1::uuid,$2::jsonb,'t')", [asset, JSON.stringify({ key: key() })]);
    await assert.rejects(q("UPDATE fixed_assets SET cost=1 WHERE id=$1", [asset]), /asset_capitalized_locked/, "financial fields lock once capitalization is prepared");
    await assert.rejects(decide(cap.id, "prep"), /accounting_self_approval_denied/);
    await decide(cap.id);
    assert.equal((await one<{ c: boolean }>("SELECT fixed_asset_capitalized('a',$1) AS c", [asset])).c, true);
  });

  await check("depreciation: straight-line with daily proration matches the TypeScript model; one pending run at a time; posted through the ledger", async () => {
    const period = async (m: number) => (await one<{ id: string }>("SELECT id FROM accounting_periods WHERE organization_id='a' AND fiscal_year=$1 AND start_date=$2", [Y, D(m, 1)])).id;
    const prev = await q<{ amount: string }>("SELECT amount::text FROM asset_depreciation_preview('a',$1)", [await period(1)]);
    const ts = straightLineDepreciation({ cost: "3600000.00", residual: "0.00", usefulLifeMonths: 36, convention: "daily_proration", depreciationStart: D(1, 16), accumulated: "0.00" }, D(1, 1), D(1, 31));
    assert.equal(prev[0].amount, "1612903.23".slice(0, 0) + ts, "SQL and TypeScript agree");
    assert.equal(ts, "51612.90", "16 of 31 days of 100,000");
    const run1 = await fn("asset_depreciation_prepare('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), periodId: await period(1) })]);
    await assert.rejects(fn("asset_depreciation_prepare('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), periodId: await period(2) })]), /depreciation_run_pending/);
    await decide(run1.linkId);
    await assert.rejects(fn("asset_depreciation_prepare('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), periodId: await period(1) })]), /nothing_to_depreciate/, "a period is never depreciated twice");
    const run2 = await fn("asset_depreciation_prepare('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), periodId: await period(2) })]);
    assert.equal(run2.total, "100000.00");
    await decide(run2.linkId);
    assert.equal((await one<{ v: string }>("SELECT fixed_asset_accumulated('a',$1)::text AS v", [asset])).v, "151612.90");
    await assert.rejects(q("UPDATE asset_depreciation_lines SET amount=1"), /accounting_history_immutable/);
  });

  await check("impairment and disposal: carrying amount limits; gain or loss computed; disposal reversal restores the asset; capitalization reversal blocked by later entries", async () => {
    const impDoc = await doc("Impairment memo");
    await assert.rejects(fn("asset_impairment_prepare('a','prep',$1::uuid,$2::jsonb,'t')", [asset, JSON.stringify({ key: key(), amount: "9000000", impairmentDate: D(2, 28), reason: "Water damage", evidenceDocumentId: impDoc })]), /impairment_exceeds_carrying_amount/);
    const disp = await fn("asset_disposal_prepare('a','prep',$1::uuid,$2::jsonb,'t')", [asset, JSON.stringify({ key: key(), disposalDate: D(3, 10), kind: "sale", proceeds: "3500000", proceedsBankingAccountId: bank, note: "Sold to a staff member at market value", evidenceDocumentId: impDoc })]);
    assert.deepEqual([disp.finalDepreciation, disp.netBookValue, disp.gainOrLoss], ["32258.06", "3416129.04", "83870.96"]);
    const jl = await q<{ code: string; debit: string; credit: string }>("SELECT a.code,l.debit::text,l.credit::text FROM accounting_journal_lines l JOIN accounting_accounts a ON a.id=l.account_id JOIN ledger_source_links k ON k.journal_id=l.journal_id WHERE k.id=$1 ORDER BY l.line_number", [disp.linkId]);
    const dr = jl.reduce((s, l) => s + Number(l.debit), 0), cr = jl.reduce((s, l) => s + Number(l.credit), 0);
    assert.equal(dr.toFixed(2), cr.toFixed(2), "disposal journal balances");
    await assert.rejects(fn("asset_disposal_prepare('a','prep',$1::uuid,$2::jsonb,'t')", [asset, JSON.stringify({ key: key(), disposalDate: D(3, 11), kind: "scrap", note: "Second disposal attempt", evidenceDocumentId: impDoc })]), /asset_already_disposed/);
    await decide(disp.linkId);
    const mar = (await one<{ id: string }>("SELECT id FROM accounting_periods WHERE organization_id='a' AND start_date=$1", [D(3, 1)])).id;
    assert.equal((await q("SELECT * FROM asset_depreciation_preview('a',$1)", [mar])).length, 0, "a disposed asset is not depreciated");
    const capLink = (await one<{ id: string }>("SELECT id FROM ledger_source_links WHERE purpose='asset_capitalization' AND source_id=$1", [asset])).id;
    await assert.rejects(decide(capLink, "review", "reverse", "Capitalized in error"), /reversal_blocked_by_later_entries/);
    await decide(disp.linkId, "review", "reverse", "Sale cancelled by the buyer");
    assert.equal((await one<{ d: boolean }>("SELECT fixed_asset_disposed('a',$1) AS d", [asset])).d, false, "the reversed disposal no longer counts");
    assert.equal((await q("SELECT * FROM asset_depreciation_preview('a',$1)", [mar])).length, 1);
  });

  // ------------------------------------------------------------------------------------------
  let comp = "";
  await check("income tax: computation from the posted ledger, separate taxable adjustments, losses and credits; accounting vs tax depreciation kept apart", async () => {
    const create = (p: Record<string, unknown>) => fn("income_tax_computation_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), obligationCode: cit, fiscalYear: String(Y), ...p })]);
    await assert.rejects(create({ obligationCode: "vat", kind: "final" }), /tax_obligation_not_operational/);
    await assert.rejects(create({ kind: "provisional" }), /tax_estimate_required/);
    await assert.rejects(create({ kind: "final", fiscalYear: String(Y + 5) }), /tax_year_periods_missing/);
    const c = await create({ kind: "final" });
    comp = String(c.id);
    const imp = await fn("income_tax_import_schedules('a','prep',$1::uuid,$2,'t')", [comp, key()]);
    // Jan + Feb runs (151,612.90) + the disposal's final partial month (32,258.06) posted in year Y; the
    // disposal reversal is dated today, in a later year, so it does not reduce year Y.
    assert.equal(imp.depreciationAddBack, "183870.96", "accounting depreciation from the ledger is added back");
    assert.equal(imp.capitalAllowances, "1440000.00", "capital allowance from the approved class rule (cost x 0.4), never from accounting depreciation");
    assert.equal((await one<{ n: number }>("SELECT count(*)::int AS n FROM accounting_journal_lines l JOIN accounting_journals j ON j.id=l.journal_id WHERE j.description ILIKE '%allowance%'")).n, 0, "capital allowances never reach the ledger");
    const lossDoc = await doc("Prior-year loss schedule"), whtDoc = await doc("WHT certificate");
    const v = (await one<{ version: number }>("SELECT version FROM income_tax_computations WHERE id=$1", [comp])).version;
    await assert.rejects(fn("income_tax_computation_save('a','prep',$1::uuid,$2::jsonb,'t')", [comp, JSON.stringify({ key: key(), version: v, lossBroughtForward: "1000000", adjustments: [], credits: [] })]), /tax_evidence_required/, "a loss brought forward needs evidence");
    await fn("income_tax_computation_save('a','prep',$1::uuid,$2::jsonb,'t')", [comp, JSON.stringify({ key: key(), version: v, lossBroughtForward: "1000000", lossEvidenceDocumentId: lossDoc,
      adjustments: [{ kind: "non_deductible", description: "Entertainment", amount: "500000" }, { kind: "exempt_income", description: "Exempt interest", amount: "200000" }],
      credits: [{ kind: "withholding_credit", certificateReference: "WHT-001", counterparty: "Client A", amount: "150000", evidenceDocumentId: whtDoc }] })]);
    const f = (await one<{ f: Record<string, string> }>("SELECT income_tax_figures('a',$1) AS f", [comp])).f;
    // Profit: 10,000,000 - 4,000,000 - 151,612.90 depreciation + 83,870.96 gain (reversed) => posted net of reversal.
    const profit = (await one<{ p: string }>("SELECT income_tax_accounting_profit('a',$1,$2)::text AS p", [D(1, 1), D(12, 31)])).p;
    assert.equal(f.accountingProfit, profit);
    const adjusted = Number(profit) + 500000 + 183870.96 - 200000 - 1440000;
    assert.equal(f.adjustedProfit, adjusted.toFixed(2));
    assert.equal(f.lossUsed, "1000000.00");
    assert.equal(f.chargeableIncome, (adjusted - 1000000).toFixed(2));
    assert.equal(f.taxCharge, (Math.round((adjusted - 1000000) * 0.3 * 100) / 100).toFixed(2));
    assert.equal(f.credits, "150000.00");
  });

  await check("income tax review: two people; schedules lock on submission; a ledger change after submission blocks approval", async () => {
    const ver = async () => (await one<{ version: number }>("SELECT version FROM income_tax_computations WHERE id=$1", [comp])).version;
    const cmd = async (actor: string, c: string, note = "") => fn("income_tax_computation_command('a',$1,$2::uuid,$3,$4,$5,$6,'t')", [actor, comp, c, await ver(), note, key()]);
    await cmd("prep", "submit");
    await assert.rejects(q("INSERT INTO income_tax_adjustments(organization_id,computation_id,line_number,kind,description,amount) VALUES('a',$1,99,'deduction','Sneaky deduction',1)", [comp]), /tax_computation_locked/);
    await assert.rejects(cmd("prep", "approve"), /tax_self_approval_denied/);
    await postManual(D(6, 30), "Late expense", [L("6700", "debit", "100000.00"), L("1120-01", "credit", "100000.00")]);
    await assert.rejects(cmd("review", "approve"), /tax_profit_changed/);
    await cmd("review", "return", "Ledger changed, recompute");
    await cmd("prep", "submit");
    const r = await cmd("review", "approve");
    assert.equal(r.status, "approved");
    await assert.rejects(q("UPDATE income_tax_computations SET figures='{}' WHERE id=$1", [comp]), /tax_history_immutable/);
  });

  await check("provision, payments, filings and assessments are separate; duplicate PRNs refused; payments reconcile through the bank", async () => {
    const tax = (await one<{ t: string }>("SELECT figures->>'taxCharge' AS t FROM income_tax_computations WHERE id=$1", [comp])).t;
    let pos = (await one<{ p: Record<string, string | null> }>("SELECT income_tax_position('a','cit',$1) AS p", [Y])).p;
    assert.equal(pos.basis, "approved_computation");
    const prov = await fn("income_tax_provision_prepare('a','prep',$1::uuid,$2::jsonb,'t')", [comp, JSON.stringify({ key: key() })]);
    assert.equal(prov.amount, tax);
    await assert.rejects(fn("income_tax_provision_prepare('a','prep',$1::uuid,$2::jsonb,'t')", [comp, JSON.stringify({ key: key() })]), /tax_provision_pending/);
    await decide(prov.id);
    await assert.rejects(fn("income_tax_provision_prepare('a','prep',$1::uuid,$2::jsonb,'t')", [comp, JSON.stringify({ key: key() })]), /tax_provision_up_to_date/);
    const payDoc = await doc("Bank payment slip");
    const pay = (p: Record<string, unknown>) => fn("tax_payment_record('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), obligationCode: "cit", fiscalYear: String(Y), bankingAccountId: bank, evidenceDocumentId: payDoc, ...p })]);
    const p1 = await pay({ kind: "provisional_instalment", amount: "500000", paidOn: D(6, 30), prn: "PRN 2201-0001" });
    await assert.rejects(pay({ kind: "final_balance", amount: "500000", paidOn: D(6, 30), prn: "prn-2201-0001" }), /duplicate_tax_payment/, "the same PRN cannot be recorded twice");
    await decide(p1.linkId);
    pos = (await one<{ p: Record<string, string | null> }>("SELECT income_tax_position('a','cit',$1) AS p", [Y])).p;
    assert.equal(pos.paid, "500000.00");
    assert.deepEqual(pos.filings, [], "paying is not filing");
    const fileDoc = await doc("Return acknowledgement");
    await fn("tax_filing_record('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), obligationCode: "cit", fiscalYear: String(Y), kind: "final_return", computationId: comp, filedOn: D(12, 31), filingReference: "RET-1", acknowledgementReference: "ACK-1", evidenceDocumentId: fileDoc })]);
    await assert.rejects(fn("tax_filing_record('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), obligationCode: "cit", fiscalYear: String(Y), kind: "final_return", filedOn: D(12, 31), filingReference: "RET-2", evidenceDocumentId: fileDoc })]), /tax_filing_exists/);
    await assert.rejects(fn("tax_filing_record('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), obligationCode: "vat", fiscalYear: String(Y), kind: "other_return", filedOn: D(12, 31), filingReference: "V-1", evidenceDocumentId: fileDoc })]), /tax_obligation_not_registered/);
    // URA assesses more than computed: liability follows the assessment, never silently the computation.
    const asDoc = await doc("Assessment notice");
    const a1 = await fn("tax_assessment_record('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), obligationCode: "cit", fiscalYear: String(Y), kind: "original", assessmentReference: "AS-100", assessedOn: D(12, 31), amount: String(Number(tax) + 300000), evidenceDocumentId: asDoc })]);
    await assert.rejects(fn("tax_assessment_record('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), obligationCode: "cit", fiscalYear: String(Y), kind: "original", assessmentReference: "as 100", assessedOn: D(12, 31), amount: "1", evidenceDocumentId: asDoc })]), /tax_assessment_exists/);
    pos = (await one<{ p: Record<string, string | null> }>("SELECT income_tax_position('a','cit',$1) AS p", [Y])).p;
    assert.equal(pos.basis, "assessment");
    assert.equal(pos.outstanding, (Number(tax) + 300000 - 150000 - 500000).toFixed(2));
    await fn("tax_assessment_record('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), obligationCode: "cit", fiscalYear: String(Y), kind: "objection_decision", assessmentReference: "OBJ-1", assessedOn: D(12, 31), amount: "100000", supersedesId: a1.id, evidenceDocumentId: asDoc })]);
    pos = (await one<{ p: Record<string, string | null> }>("SELECT income_tax_position('a','cit',$1) AS p", [Y])).p;
    assert.deepEqual([pos.outstanding, pos.overpaid], ["0.00", "550000.00"], "an objection reducing the assessment turns payments and credits into an overpayment");
    // The tax payment's bank line is an ordinary ledger line on the bank account: it reconciles like any payment.
    await fn("bank_statement_import('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), bankingAccountId: bank, currency: "UGX", fileName: "s.csv", fileSha256: "e".repeat(64), fileSize: 10, storageKey: "t/s", sourceFormat: "csv", columnMapping: { date: 0 }, rows: [{ row: 2, date: D(6, 30), description: "URA PRN 2201-0001", reference: "PRN22010001", amount: "-500000" }] })]);
    const sl = (await one<{ id: string }>("SELECT id FROM bank_statement_lines WHERE reference='PRN22010001'")).id;
    const pl = (await one<{ id: string }>("SELECT l.id FROM accounting_journal_lines l JOIN ledger_source_links k ON k.journal_id=l.journal_id WHERE k.id=$1 AND l.account_id=$2", [p1.linkId, acct["1120-01"]])).id;
    await fn("bank_match_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), bankingAccountId: bank, kind: "match", items: [{ statementLineId: sl, amount: "-500000" }, { journalLineId: pl, amount: "-500000" }] })]);
    for (const t of ["tax_filings", "tax_payments", "tax_assessments", "tax_events"]) await assert.rejects(q(`DELETE FROM ${t}`), /immutable/);
  });

  await check("tax-period restrictions: a provision or payment dated in a closed accounting period is refused", async () => {
    const per = await one<{ id: string; version: number }>("SELECT id,version FROM accounting_periods WHERE organization_id='a' AND start_date=$1", [D(12, 1)]);
    await fn("accounting_period_command('a','review',$1,'close',$2,'December closed',$3,'t')", [per.id, per.version, key()]);
    const payDoc = await doc("Slip 2");
    await assert.rejects(fn("tax_payment_record('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), obligationCode: "cit", fiscalYear: String(Y), kind: "final_balance", amount: "10", paidOn: D(12, 15), prn: "PRN-CLOSED", bankingAccountId: bank, evidenceDocumentId: payDoc })]), /period_closed/);
  });

  await check("VAT, EFRIS and withholding readiness structures refuse every write while inactive", async () => {
    const rv = (await one<{ id: string }>("SELECT id FROM tax_rule_versions WHERE rule_code='cit-rate' LIMIT 1")).id;
    await db.query("INSERT INTO clients(id,organization_id,kind,display_name) VALUES($1,'a','company','Client A')", [S(60)]);
    await db.query("INSERT INTO invoices(id,organization_id,client_id,number,status,customer_snapshot,issuer_snapshot,currency,subtotal,total,issued_at) VALUES($1,'a',$2,'INV-1','draft','{}','{}','UGX',100,100,now())", [S(61), S(60)]);
    await assert.rejects(q("INSERT INTO vat_document_treatments(organization_id,invoice_id,supply_type,direction,net_amount,vat_amount,rule_version_id) VALUES('a',$1,'standard_rated','output',100,18,$2)", [S(61), rv]), /vat_not_operational/);
    await assert.rejects(q("INSERT INTO efris_documents(organization_id,invoice_id) VALUES('a',$1)", [S(61)]), /vat_not_operational/);
    await db.query("INSERT INTO suppliers(id,organization_id,name) VALUES($1,'a','Supplier')", [S(62)]);
    await assert.rejects(q("INSERT INTO withholding_tax_records(organization_id,direction,supplier_id,gross_amount,amount,rule_version_id) VALUES('a','withheld_by_calacot',$1,100,6,$2)", [S(62), rv]), /withholding_tax_not_operational/);
    assert.equal((await one<{ t: string }>("SELECT total::text AS t FROM invoices WHERE id=$1", [S(61)])).t, "100.00", "no invoice is changed");
  });

  await check("payroll foundation: explicit profiles, contractors separate, two-person set-up, simulation only, no statutory deductions or postings", async () => {
    const prof = (p: Record<string, unknown>) => fn("payroll_profile_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), startDate: D(1, 1), paymentMethod: "bank", ...p })]);
    const pd = (etype: string, id: unknown, actor = "review", decision = "approve") => fn("payroll_decide('a',$1,$2,$3::uuid,$4,'Checked',$5,'t')", [actor, etype, id, decision, key()]);
    const emp = await prof({ personName: "Synthetic Employee", engagementType: "employee", employeeNumber: "E-1", staffId: S(3), paymentAccount: "0123456789", tin: "1000000001" });
    const con = await prof({ personName: "Synthetic Contractor", engagementType: "contractor", employeeNumber: "C-1" });
    assert.equal((await one<{ v: string }>("SELECT payment_account_last4 AS v FROM payroll_profiles WHERE id=$1", [emp.id])).v, "6789", "only the last four characters are stored");
    await assert.rejects(pd("payroll_profile", emp.id, "prep"), /payroll_self_approval_denied/);
    await pd("payroll_profile", emp.id); await pd("payroll_profile", con.id);
    const comp1 = await fn("payroll_component_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), code: "BASIC", name: "Basic salary", kind: "basic_salary", taxable: true, expenseAccountId: acct["6100"] })]);
    const comp2 = await fn("payroll_component_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), code: "TRANSPORT", name: "Transport allowance", kind: "allowance", taxable: true })]);
    const paye = await fn("payroll_component_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), code: "PAYE", name: "PAYE", kind: "deduction", taxable: false, statutory: "paye" })]);
    for (const c of [comp1, comp2, paye]) await pd("payroll_component", c.id);
    const struct = (profileId: unknown, lines: unknown[]) => fn("payroll_structure_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), profileId, effectiveFrom: D(1, 1), currency: "UGX", lines })]);
    await assert.rejects(struct(con.id, [{ componentCode: "BASIC", amount: "1000000" }]), /contractor_not_on_payroll/);
    await assert.rejects(struct(emp.id, [{ componentCode: "PAYE", amount: "100000" }]), /payroll_component_not_approved/, "statutory deductions cannot be typed in");
    const s1 = await struct(emp.id, [{ componentCode: "BASIC", amount: "2000000" }, { componentCode: "TRANSPORT", amount: "200000" }]);
    await pd("payroll_structure", s1.id);
    const journals = (await one<{ n: number }>("SELECT count(*)::int AS n FROM accounting_journals WHERE organization_id='a'")).n;
    const run = await fn("payroll_run_simulate('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), periodStart: D(1, 1), periodEnd: D(1, 31) })]);
    assert.deepEqual([run.employees, run.gross], [1, "2200000.00"]);
    assert.deepEqual(run.problems, ["paye_not_operational", "nssf_not_operational"]);
    assert.equal((await one<{ n: number }>("SELECT count(*)::int AS n FROM accounting_journals WHERE organization_id='a'")).n, journals, "a simulation posts nothing");
    await assert.rejects(q("UPDATE payroll_runs SET status='approved' WHERE id=$1", [run.id]), /payroll_history_immutable|check/i);
    await assert.rejects(q("INSERT INTO payroll_runs(organization_id,period_start,period_end,status,totals,prepared_by_id,idempotency_key) VALUES('a',$1,$2,'posted','{}',$3,$4)", [D(2, 1), D(2, 28), S(1), key()]), /check|violates/i, "payroll cannot be approved, paid or posted in this phase");
  });

  await check("suspended staff, cross-organization access and general-ledger agreement", async () => {
    await assert.rejects(rule({ ruleCode: "x-rate", ruleKind: "income_tax_rate", description: "Suspended attempt", parameters: { rate: "0.1" }, effectiveFrom: `${Y}-01-01` }, "gone"), /staff_mirror_required/);
    await assert.rejects(fn("income_tax_computation_command('b','other',$1::uuid,'approve',1,'',$2,'t')", [comp, key()]), /tax_computation_unavailable/);
    await assert.rejects(fn("fixed_asset_capitalize('b','other',$1::uuid,$2::jsonb,'t')", [asset, JSON.stringify({ key: key() })]), /asset_unavailable/);
    const types = await q<{ journal_type: string }>("SELECT DISTINCT j.journal_type FROM accounting_journals j JOIN ledger_source_links l ON l.journal_id=j.id WHERE j.reverses_journal_id IS NULL");
    assert.deepEqual(types.map((t) => t.journal_type), ["manual"], "no parallel ledger");
    const tb = await one<{ d: string; c: string }>("SELECT sum(functional_debit)::text AS d, sum(functional_credit)::text AS c FROM accounting_journal_lines l JOIN accounting_journals j ON j.id=l.journal_id WHERE j.status='posted' AND j.organization_id='a'");
    assert.equal(tb.d, tb.c);
    const payable = (await one<{ v: string }>("SELECT coalesce(sum(l.credit-l.debit),0)::text AS v FROM accounting_journal_lines l JOIN accounting_journals j ON j.id=l.journal_id AND j.status='posted' WHERE l.account_id=$1", [acct["2195"]])).v;
    const tax = (await one<{ t: string }>("SELECT figures->>'taxCharge' AS t FROM income_tax_computations WHERE id=$1", [comp])).t;
    assert.equal(payable, tax, "income tax payable = provision (the instalment went to prepayments)");
    const events = (await one<{ n: number }>("SELECT count(*)::int AS n FROM tax_events WHERE organization_id='a'")).n;
    const audits = (await one<{ n: number }>("SELECT count(*)::int AS n FROM audit_logs WHERE organization_id='a' AND action LIKE 'tax.%'")).n;
    assert.equal(events, audits, "every command is in the audit trail");
  });

  console.log(`Tax, asset and payroll database checks passed (${passed.length}).`);
} finally {
  await db.close();
}
