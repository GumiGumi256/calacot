// Phase 2A: accounting engine database checks on a disposable in-memory PGlite database migrated
// with the real drizzle-current chain (0000-0018). No environment variables, no network, no
// production connection. Every rule is exercised both through the command functions and, where
// relevant, through direct SQL that tries to bypass them.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { chartSeedPayload, proposedChart, validateChart } from "../lib/accounting/chart";

const db = new PGlite();
const passed: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => { await fn(); passed.push(name); };
const q = async <T = Record<string, unknown>,>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
const one = async <T = Record<string, unknown>,>(text: string, params: unknown[] = []) => (await q<T>(text, params))[0];
const fn = async (call: string, params: unknown[]) => (await one<{ r: Record<string, unknown> }>(`SELECT ${call} AS r`, params)).r;
const key = () => randomUUID();
const S = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await db.exec(s);
  passed.push(`migration chain 0000-${journal.entries.at(-1).tag} applied`);

  await db.exec(`
    INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A'),('b','B','B');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,display_name,status) VALUES
      ('${S(1)}','a','prep','Preparer','active'),('${S(2)}','a','appr','Approver','active'),('${S(3)}','a','acct','Accountant','active'),
      ('${S(4)}','a','gone','Suspended','suspended'),('${S(5)}','b','other','Other org','active'),('${S(6)}','b','other2','Other org 2','active');
    INSERT INTO clients(id,organization_id,kind,display_name) VALUES('${S(10)}','a','company','Client A');
    INSERT INTO projects(id,organization_id,client_id,code,name,division,currency) VALUES('${S(11)}','a','${S(10)}','P-1','Villa','architecture','UGX');`);
  const today = (await one<{ d: string }>("SELECT finance_kampala_today()::text AS d")).d;
  const year = Number(today.slice(0, 4));

  // ---------------------------------------------------------------------------------------------
  await check("disabled by default: no policy means no periods and no posting", async () => {
    assert.equal((await q("SELECT 1 FROM accounting_policy_versions")).length, 0);
    await assert.rejects(fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [year, key()]), /accounting_policy_required/);
    await assert.rejects(db.query("INSERT INTO accounting_policy_versions(organization_id,version,functional_currency,fiscal_year_start_month,automatic_posting_enabled,status,note,proposed_by_id,idempotency_key) VALUES('a',1,'UGX',1,true,'proposed','force it on',$1,'k')", [S(1)]), /check/i, "automatic posting cannot be enabled");
    await assert.rejects(db.query("INSERT INTO accounting_policy_versions(organization_id,version,functional_currency,fiscal_year_start_month,multi_currency_posting_enabled,status,note,proposed_by_id,idempotency_key) VALUES('a',1,'UGX',1,true,'proposed','force it on',$1,'k')", [S(1)]), /check/i, "multi-currency cannot be enabled");
    await assert.rejects(db.query("INSERT INTO accounting_policy_versions(organization_id,version,functional_currency,fiscal_year_start_month,status,note,proposed_by_id,decided_by_id,decided_at,idempotency_key) VALUES('a',1,'UGX',1,'approved','skip review',$1,$1,now(),'k')", [S(1)]), /accounting_history_immutable|check/i, "policies cannot be inserted pre-approved");
  });

  // ---------------------------------------------------------------------------------------------
  let accounts: Record<string, string> = {};
  await check("proposed chart is structurally valid and loads as proposed, idempotently", async () => {
    assert.deepEqual(validateChart(proposedChart), []);
    const seedKey = key();
    const r = await fn("accounting_chart_seed('a','prep',$1::jsonb,$2,'t')", [JSON.stringify(chartSeedPayload()), seedKey]);
    assert.equal(r.inserted, proposedChart.length);
    assert.equal((await fn("accounting_chart_seed('a','prep',$1::jsonb,$2,'t')", [JSON.stringify(chartSeedPayload()), seedKey])).already, true, "retry is a no-op");
    const again = await fn("accounting_chart_seed('a','prep',$1::jsonb,$2,'t')", [JSON.stringify(chartSeedPayload()), key()]);
    assert.deepEqual([again.inserted, again.skipped], [0, proposedChart.length], "existing codes are never overwritten");
    assert.deepEqual(await q("SELECT DISTINCT status FROM accounting_accounts WHERE organization_id='a'"), [{ status: "proposed" }]);
    accounts = Object.fromEntries((await q<{ code: string; id: string }>("SELECT code,id FROM accounting_accounts WHERE organization_id='a'")).map((x) => [x.code, x.id]));
    const contra = await one<{ normal_balance: string }>("SELECT normal_balance FROM accounting_accounts WHERE organization_id='a' AND code='1590'");
    assert.equal(contra.normal_balance, "credit", "accumulated depreciation is a credit-normal contra asset");
  });

  await check("account rules: codes, types, classifications, hierarchy and cycles", async () => {
    const save = (p: Record<string, unknown>, actor = "prep") => fn("accounting_account_save('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), ...p })]);
    await assert.rejects(save({ code: "1110", name: "Dup", accountType: "asset", reportingClass: "current_asset" }), /account_code_exists/);
    await assert.rejects(save({ code: "AB", name: "Bad", accountType: "asset", reportingClass: "current_asset" }), /invalid_account_code/);
    await assert.rejects(save({ code: "1999", name: "Bad", accountType: "asset", reportingClass: "operating_revenue" }), /invalid_reporting_class/);
    await assert.rejects(save({ code: "1999", name: "Bad", accountType: "magic", reportingClass: "current_asset" }), /invalid_account_type/);
    await assert.rejects(save({ code: "1999", name: "Wrong parent type", accountType: "asset", reportingClass: "current_asset", parentId: accounts["4000"] }), /parent_account_invalid/);
    await assert.rejects(save({ code: "1999", name: "Postable parent", accountType: "asset", reportingClass: "current_asset", parentId: accounts["1110"] }), /parent_account_invalid/);
    await assert.rejects(save({ code: "1999", name: "Other org parent", accountType: "asset", reportingClass: "current_asset", parentId: randomUUID() }), /parent_account_invalid/);
    const sub = await save({ code: "1120-01", name: "Bank - Stanbic operations", accountType: "asset", reportingClass: "current_asset", parentId: accounts["1100"], currency: "UGX" });
    accounts["1120-01"] = String(sub.id);
    // Cycle: make header 1100 a child of its own descendant header.
    const h = await save({ code: "1199", name: "Sub header", accountType: "asset", isPostable: false, parentId: accounts["1100"] });
    await assert.rejects(db.query("UPDATE accounting_accounts SET parent_id=$1 WHERE id=$2", [h.id, accounts["1100"]]), /parent_account_invalid/, "cycles are rejected");
    await assert.rejects(db.query("UPDATE accounting_accounts SET parent_id=id WHERE id=$1", [accounts["1100"]]), /check|parent_account_invalid/);
    await assert.rejects(db.query("DELETE FROM accounting_accounts WHERE id=$1", [accounts["1110"]]), /account_delete_denied/);
    await assert.rejects(db.query("UPDATE accounting_accounts SET normal_balance='credit' WHERE id=$1", [accounts["1110"]]), /check/i, "normal balance must follow type");
    await assert.rejects(db.query("INSERT INTO accounting_accounts(organization_id,code,name,account_type,normal_balance,reporting_class,status,created_by_id) VALUES('a','1998','Pre-active','asset','debit','current_asset','active',$1)", [S(1)]), /invalid_account_transition/, "accounts always start proposed");
    // Proposed accounts can be restructured; the edit is versioned.
    const v = await one<{ version: number }>("SELECT version FROM accounting_accounts WHERE id=$1", [h.id]);
    await assert.rejects(fn("accounting_account_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), id: h.id, version: v.version + 5, code: "1199", name: "x", accountType: "asset", isPostable: false, parentId: accounts["1100"] })]), /stale_account/);
  });

  await check("chart approval is a second person's decision, parents before children", async () => {
    await assert.rejects(fn("accounting_account_command('a','prep',$1,'activate',1,'',$2,'t')", [accounts["1000"], key()]), /accounting_self_approval_denied/);
    await assert.rejects(fn("accounting_account_command('a','appr',$1,'activate',1,'',$2,'t')", [accounts["1110"], key()]), /parent_account_inactive/);
    const r = await fn("accounting_chart_approve('a','appr',$1,'t')", [key()]);
    assert.equal(r.activated, proposedChart.length + 2);
    assert.equal(r.stillProposed, 0);
    await assert.rejects(db.query("UPDATE accounting_accounts SET code='1111' WHERE id=$1", [accounts["1110"]]), /account_structure_locked/, "active account codes are fixed");
    await assert.rejects(db.query("UPDATE accounting_accounts SET activated_by_id=created_by_id WHERE id=$1", [accounts["1110"]]), /check/i);
    const own = await fn("accounting_account_save('a','appr',$1::jsonb,'t')", [JSON.stringify({ key: key(), code: "6995", name: "Approver's own account", accountType: "operating_expense", reportingClass: "operating_expense", parentId: accounts["6000"] })]);
    const r2 = await fn("accounting_chart_approve('a','appr',$1,'t')", [key()]);
    assert.deepEqual([r2.activated, r2.stillProposed], [0, 1], "own proposals are left for someone else");
    await fn("accounting_account_command('a','acct',$1,'activate',1,'',$2,'t')", [own.id, key()]);
    accounts["6995"] = String(own.id);
  });

  // ---------------------------------------------------------------------------------------------
  let policyId = "";
  await check("accounting policy: proposal, two-person approval, history", async () => {
    const propose = (actor: string, p: Record<string, unknown>) => fn("accounting_policy_propose('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), ...p })]);
    await assert.rejects(propose("prep", { functionalCurrency: "EUR", fiscalYearStartMonth: 1, manualPostingEnabled: true, note: "Test policy" }), /invalid_accounting_policy/);
    await assert.rejects(propose("prep", { functionalCurrency: "UGX", fiscalYearStartMonth: 13, manualPostingEnabled: true, note: "Test policy" }), /invalid_accounting_policy/);
    const p1 = await propose("prep", { functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: false, note: "Fixture policy, posting off" });
    await assert.rejects(propose("prep", { functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: true, note: "Second" }), /accounting_policy_proposal_pending/);
    await assert.rejects(fn("accounting_policy_decide('a','prep',$1,'approve','',$2,'t')", [p1.id, key()]), /accounting_self_approval_denied/);
    await fn("accounting_policy_decide('a','acct',$1,'approve','Fixture approval',$2,'t')", [p1.id, key()]);
    await assert.rejects(db.query("UPDATE accounting_policy_versions SET functional_currency='USD' WHERE id=$1", [p1.id]), /accounting_history_immutable/);
    await assert.rejects(db.query("DELETE FROM accounting_policy_versions WHERE id=$1", [p1.id]), /accounting_history_immutable/);
    policyId = String(p1.id);
  });

  await check("periods: generated from the approved policy, never overlapping", async () => {
    const gk = key();
    const r = await fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [year, gk]);
    assert.equal(r.created, 12);
    assert.equal((await fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [year, gk])).already, true);
    await assert.rejects(fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [year, key()]), /period_overlap/);
    await assert.rejects(fn("accounting_period_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), name: "Overlap", fiscalYear: year, startDate: `${year}-03-15`, endDate: `${year}-04-15` })]), /period_overlap/);
    await assert.rejects(fn("accounting_period_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), name: "Backwards", fiscalYear: year, startDate: `${year + 5}-03-15`, endDate: `${year + 5}-03-01` })]), /invalid_period/);
    await fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [year - 1, key()]);
    const p = await one<{ id: string }>("SELECT id FROM accounting_periods WHERE organization_id='a' AND start_date=$1", [`${year}-01-01`]);
    await assert.rejects(db.query("UPDATE accounting_periods SET end_date=end_date+1 WHERE id=$1", [p.id]), /period_dates_locked/);
    await assert.rejects(db.query("DELETE FROM accounting_periods WHERE id=$1", [p.id]), /period_delete_denied/);
  });

  // ---------------------------------------------------------------------------------------------
  const line = (code: string, debit: string, credit: string, extra: Record<string, unknown> = {}) => ({ accountId: accounts[code], debit, credit, currency: "UGX", ...extra });
  const save = (actor: string, p: Record<string, unknown>) => fn("accounting_journal_save('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), entryDate: today, description: "Fixture journal", ...p })]);
  const cmd = (actor: string, id: unknown, c: string, version: number, note = "", k = key()) => fn("accounting_journal_command('a',$1,$2,$3,$4,$5,$6,'t')", [actor, id, c, version, note, k]);
  const version = async (id: unknown) => (await one<{ version: number }>("SELECT version FROM accounting_journals WHERE id=$1", [id])).version;
  const approved = async (lines: unknown[], p: Record<string, unknown> = {}) => {
    const j = await save("prep", { lines, ...p });
    await cmd("prep", j.id, "submit", 1);
    await cmd("appr", j.id, "approve", 2);
    return j.id as string;
  };

  let j1 = "";
  await check("drafts may be unbalanced; submission and approval require balance", async () => {
    const k = key();
    const d = await fn("accounting_journal_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: k, entryDate: today, description: "Capital introduced", lines: [line("1120-01", "1000000.00", "")] })]);
    assert.equal((await fn("accounting_journal_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: k, entryDate: today, description: "Capital introduced", lines: [] })])).already, true, "same key returns the same draft");
    await assert.rejects(cmd("prep", d.id, "submit", 1), /journal_lines_required/);
    await fn("accounting_journal_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), id: d.id, version: 1, entryDate: today, description: "Capital introduced", lines: [line("1120-01", "1000000.00", ""), line("3100", "", "999999.99")] })]);
    await assert.rejects(cmd("prep", d.id, "submit", 2), /journal_unbalanced/);
    await assert.rejects(fn("accounting_journal_save('a','appr',$1::jsonb,'t')", [JSON.stringify({ key: key(), id: d.id, version: 2, entryDate: today, description: "x", lines: [line("1120-01", "1", "")] })]), /not_preparer/);
    await assert.rejects(fn("accounting_journal_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), id: d.id, version: 1, entryDate: today, description: "x", lines: [line("1120-01", "1", "")] })]), /stale_journal/);
    await fn("accounting_journal_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), id: d.id, version: 2, entryDate: today, description: "Capital introduced", lines: [line("1120-01", "1000000.00", "", { projectId: S(11) }), line("3100", "", "1000000.00")] })]);
    assert.equal((await one<{ division: string }>("SELECT division FROM accounting_journal_lines WHERE journal_id=$1 AND line_number=1", [d.id])).division, "architecture", "project supplies the division dimension");
    await cmd("prep", d.id, "submit", 3);
    j1 = String(d.id);
  });

  await check("invalid lines: both sides, negative, too precise, wrong org, header, control account", async () => {
    const bad = async (l: unknown, code: RegExp) => assert.rejects(save("prep", { lines: [l] }), code);
    await bad(line("1110", "5", "5"), /invalid_journal_line/);
    await bad(line("1110", "-5", ""), /invalid_journal_line/);
    await bad(line("1110", "1.001", ""), /invalid_journal_line/);
    await bad(line("1110", "0", "0"), /invalid_journal_line/);
    await bad({ ...line("1110", "5", ""), currency: "EUR" }, /invalid_currency/);
    await bad(line("1000", "5", ""), /account_not_postable/);
    await bad(line("1200", "5", ""), /account_manual_posting_denied/);
    await bad(line("1121", "5", ""), /account_currency_mismatch/);
    await bad({ ...line("1110", "5", ""), division: "space" }, /invalid_division/);
    await bad({ ...line("1110", "5", ""), division: "tech", projectId: S(11) }, /project_division_mismatch/);
    const otherOrg = await fn("accounting_account_save('b','other',$1::jsonb,'t')", [JSON.stringify({ key: key(), code: "1110", name: "B cash", accountType: "asset", reportingClass: "current_asset" })]);
    await bad({ accountId: otherOrg.id, debit: "5", credit: "", currency: "UGX" }, /account_unavailable/);
    await assert.rejects(db.query("INSERT INTO accounting_journal_lines(organization_id,journal_id,line_number,account_id,currency,debit,credit,functional_debit,functional_credit) VALUES('a',$1,99,$2,'UGX',5,0,5,0)", [j1, otherOrg.id]), /foreign key|journal_lines_locked/i);
  });

  await check("approval: no self-approval, reasons required, stale versions refused", async () => {
    await assert.rejects(cmd("prep", j1, "approve", 4), /accounting_self_approval_denied/);
    await assert.rejects(cmd("appr", j1, "reject", 4, "no"), /review_reason_required/);
    await assert.rejects(cmd("appr", j1, "approve", 3), /stale_journal/);
    await cmd("appr", j1, "approve", 4);
    await assert.rejects(db.query("UPDATE accounting_journals SET approved_by_id=prepared_by_id WHERE id=$1", [j1]), /check/i);
    await assert.rejects(db.query("UPDATE accounting_journals SET description='changed after approval' WHERE id=$1", [j1]), /journal_not_editable/);
    await assert.rejects(db.query("DELETE FROM accounting_journal_lines WHERE journal_id=$1", [j1]), /journal_lines_locked/);
  });

  await check("posting is refused while the approved policy disables it", async () => {
    await assert.rejects(cmd("appr", j1, "post", 5), /posting_disabled/);
    const p2 = await fn("accounting_policy_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: true, note: "Enable manual posting for fixture" })]);
    await fn("accounting_policy_decide('a','acct',$1,'approve','Approved for fixture',$2,'t')", [p2.id, key()]);
    assert.equal((await one<{ status: string }>("SELECT status FROM accounting_policy_versions WHERE id=$1", [policyId])).status, "superseded");
    const changeYear = await fn("accounting_policy_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: 7, manualPostingEnabled: true, note: "Try to move the year" })]);
    await assert.rejects(fn("accounting_policy_decide('a','acct',$1,'approve','',$2,'t')", [changeYear.id, key()]), /fiscal_year_locked/);
    await fn("accounting_policy_decide('a','acct',$1,'reject','Periods already exist',$2,'t')", [changeYear.id, key()]);
  });

  let number1 = "";
  await check("posting: balanced, numbered, dated into its period, immutable, idempotent", async () => {
    const postKey = key();
    const r = await cmd("appr", j1, "post", 5, "", postKey);
    assert.equal(r.status, "posted");
    number1 = String(r.number);
    assert.match(number1, new RegExp(`^JE-${year}-000001$`));
    assert.equal((await cmd("appr", j1, "post", 5, "", postKey)).already, true, "same key replays");
    await assert.rejects(cmd("appr", j1, "post", 6), /journal_already_posted/);
    const row = await one<{ total_debit: string; total_credit: string; functional_currency: string; period: string }>("SELECT total_debit::text,total_credit::text,functional_currency,(SELECT name FROM accounting_periods p WHERE p.id=j.period_id) AS period FROM accounting_journals j WHERE id=$1", [j1]);
    assert.deepEqual([row.total_debit, row.total_credit, row.functional_currency], ["1000000.00", "1000000.00", "UGX"]);
    await assert.rejects(db.query("UPDATE accounting_journals SET description='edit' WHERE id=$1", [j1]), /posted_journal_immutable/);
    await assert.rejects(db.query("UPDATE accounting_journals SET status='draft' WHERE id=$1", [j1]), /posted_journal_immutable/);
    await assert.rejects(db.query("DELETE FROM accounting_journals WHERE id=$1", [j1]), /posted_journal_immutable/);
    await assert.rejects(db.query("UPDATE accounting_journal_lines SET debit=debit+1, functional_debit=functional_debit+1 WHERE journal_id=$1 AND line_number=1", [j1]), /journal_lines_locked/);
    await assert.rejects(db.query("INSERT INTO accounting_journal_lines(organization_id,journal_id,line_number,account_id,currency,debit,credit,functional_debit,functional_credit) VALUES('a',$1,9,$2,'UGX',5,0,5,0)", [j1, accounts["1110"]]), /journal_lines_locked/);
    // Phase 2C: bank_match_items references journal lines, so PostgreSQL refuses the TRUNCATE on the
    // foreign key before the immutability trigger fires. Either way the lines cannot be truncated.
    await assert.rejects(db.query("TRUNCATE accounting_journal_lines"), /accounting_history_immutable|referenced in a foreign key constraint/);
  });

  await check("direct SQL cannot post an unbalanced, unapproved or pre-numbered journal", async () => {
    await assert.rejects(db.query("INSERT INTO accounting_journals(organization_id,entry_date,description,prepared_by_id,idempotency_key,status) VALUES('a',$1,'x',$2,$3,'posted')", [today, S(1), key()]), /invalid_journal_transition/);
    const d = await save("prep", { lines: [line("1110", "100", ""), line("3100", "", "100")] });
    await assert.rejects(db.query("UPDATE accounting_journals SET status='posted',posted_by_id=$2,posted_at=now() WHERE id=$1", [d.id, S(2)]), /invalid_journal_transition/, "draft cannot jump to posted");
    await cmd("prep", d.id, "submit", 1);
    await cmd("appr", d.id, "approve", 2);
    // Sneak an unbalancing line in by reopening the draft directly (bypassing the functions).
    await db.query("UPDATE accounting_journals SET status='draft',approved_by_id=NULL,approved_at=NULL,approved_version=NULL WHERE id=$1", [d.id]);
    await db.query("INSERT INTO accounting_journal_lines(organization_id,journal_id,line_number,account_id,currency,debit,credit,functional_debit,functional_credit) VALUES('a',$1,3,$2,'UGX',50,0,50,0)", [d.id, accounts["1110"]]);
    await db.query("UPDATE accounting_journals SET status='submitted' WHERE id=$1", [d.id]);
    await db.query("UPDATE accounting_journals SET status='approved',approved_by_id=$2,approved_at=now(),approved_version=version WHERE id=$1", [d.id, S(2)]);
    await assert.rejects(db.query("UPDATE accounting_journals SET status='posted',posted_by_id=$2,posted_at=now() WHERE id=$1", [d.id, S(2)]), /journal_unbalanced/, "posting gate re-checks balance");
    await db.query("UPDATE accounting_journals SET version=version+1 WHERE id=$1", [d.id]);
    await assert.rejects(db.query("UPDATE accounting_journals SET status='posted',posted_by_id=$2,posted_at=now() WHERE id=$1", [d.id, S(2)]), /stale_approval/, "approval is tied to the approved version");
    await db.query("UPDATE accounting_journals SET status='draft',approved_by_id=NULL,approved_at=NULL,approved_version=NULL WHERE id=$1", [d.id]);
    await cmd("prep", d.id, "discard", await version(d.id));
    await assert.rejects(db.query("UPDATE accounting_journals SET status='draft' WHERE id=$1", [d.id]), /invalid_journal_transition/, "discarded is final");
  });

  await check("stale approvals: suspended approver or deactivated account blocks posting", async () => {
    await db.exec(`INSERT INTO staff_memberships(id,organization_id,clerk_user_id,display_name,status) VALUES('${S(7)}','a','temp','Temporary approver','active')`);
    const d = await save("prep", { lines: [line("6200", "300", ""), line("1110", "", "300")] });
    await cmd("prep", d.id, "submit", 1);
    await cmd("temp", d.id, "approve", 2);
    await db.query("UPDATE staff_memberships SET status='suspended' WHERE id=$1", [S(7)]);
    await assert.rejects(cmd("appr", d.id, "post", 3), /stale_approval/);
    await cmd("appr", d.id, "return", 3, "Approver left; re-approve");
    await cmd("prep", d.id, "submit", 4);
    await cmd("appr", d.id, "approve", 5);
    await cmd("appr", d.id, "post", 6);
  });

  await check("account deactivation: needs a reason, zero balance and no pending journals", async () => {
    const a6995 = accounts["6995"];
    const av = async () => (await one<{ version: number }>("SELECT version FROM accounting_accounts WHERE id=$1", [a6995])).version;
    const pending = await approved([line("6995", "10", ""), line("1110", "", "10")]);
    await assert.rejects(fn("accounting_account_command('a','prep',$1,'deactivate',$2,'Not needed',$3,'t')", [a6995, await av(), key()]), /account_in_pending_journals/);
    await cmd("appr", pending, "post", 3);
    await assert.rejects(fn("accounting_account_command('a','prep',$1,'deactivate',$2,'',$3,'t')", [a6995, await av(), key()]), /deactivation_reason_required/);
    await assert.rejects(fn("accounting_account_command('a','prep',$1,'deactivate',$2,'Not needed',$3,'t')", [a6995, await av(), key()]), /account_has_balance/);
    await assert.rejects(fn("accounting_account_command('a','prep',$1,'deactivate',$2,'Header in use',$3,'t')", [accounts["6000"], 2, key()]), /account_has_active_children/);
    await fn("accounting_journal_reverse('a','acct',$1,$2::jsonb,'t')", [pending, JSON.stringify({ key: key(), reason: "Clear test balance" })]);
    await fn("accounting_account_command('a','prep',$1,'deactivate',$2,'Not needed any more',$3,'t')", [a6995, await av(), key()]);
    await assert.rejects(save("prep", { lines: [line("6995", "1", "")] }), /account_not_active/);
    await fn("accounting_account_command('a','appr',$1,'reactivate',$2,'',$3,'t')", [a6995, await av(), key()]);
  });

  let reversal = "";
  await check("reversal: a new posted mirror journal; original untouched; once only", async () => {
    const before = await one("SELECT * FROM accounting_journals WHERE id=$1", [j1]);
    const rk = key();
    await assert.rejects(fn("accounting_journal_reverse('a','acct',$1,$2::jsonb,'t')", [j1, JSON.stringify({ key: rk, reason: "no" })]), /reversal_reason_required/);
    await assert.rejects(fn("accounting_journal_reverse('a','acct',$1,$2::jsonb,'t')", [j1, JSON.stringify({ key: rk, reason: "Posted in error", entryDate: `${year - 1}-06-01` })]), /reversal_date_before_original/);
    const r = await fn("accounting_journal_reverse('a','acct',$1,$2::jsonb,'t')", [j1, JSON.stringify({ key: rk, reason: "Posted in error" })]);
    reversal = String(r.id);
    assert.equal((await fn("accounting_journal_reverse('a','acct',$1,$2::jsonb,'t')", [j1, JSON.stringify({ key: rk, reason: "Posted in error" })])).already, true);
    await assert.rejects(fn("accounting_journal_reverse('a','acct',$1,$2::jsonb,'t')", [j1, JSON.stringify({ key: key(), reason: "Again please" })]), /journal_already_reversed/);
    await assert.rejects(fn("accounting_journal_reverse('a','acct',$1,$2::jsonb,'t')", [reversal, JSON.stringify({ key: key(), reason: "Undo the undo" })]), /reversal_of_reversal_denied/);
    assert.deepEqual(await one("SELECT * FROM accounting_journals WHERE id=$1", [j1]), before, "original row unchanged");
    const net = await q<{ code: string; d: string; c: string }>("SELECT a.code,sum(l.functional_debit)::text d,sum(l.functional_credit)::text c FROM accounting_journal_lines l JOIN accounting_accounts a ON a.id=l.account_id WHERE l.journal_id IN ($1,$2) GROUP BY a.code ORDER BY a.code", [j1, reversal]);
    assert.ok(net.every((x) => x.d === x.c), "original plus reversal nets to zero per account");
    const rv = await one<{ journal_type: string; status: string; reference: string }>("SELECT journal_type,status,reference FROM accounting_journals WHERE id=$1", [reversal]);
    assert.deepEqual(rv, { journal_type: "reversal", status: "posted", reference: number1 });
    await assert.rejects(fn("accounting_journal_reverse('a','acct',$1,$2::jsonb,'t')", [S(99), JSON.stringify({ key: key(), reason: "Missing journal" })]), /journal_unavailable/);
  });

  // ---------------------------------------------------------------------------------------------
  await check("closed periods: no submission, posting or reversal into them; balances stable", async () => {
    const lastYearDate = `${year - 1}-03-10`;
    const old = await approved([line("6100", "250000", ""), line("1120-01", "", "250000")], { entryDate: lastYearDate });
    await cmd("appr", old, "post", 3);
    const period = await one<{ id: string; version: number; end_date: string }>("SELECT id,version,end_date::text FROM accounting_periods WHERE organization_id='a' AND $1::date BETWEEN start_date AND end_date", [lastYearDate]);
    const pending = await approved([line("6100", "1", ""), line("1110", "", "1")], { entryDate: lastYearDate });
    await assert.rejects(fn("accounting_period_command('a','acct',$1,'close',$2,'',$3,'t')", [period.id, period.version, key()]), /period_has_pending_journals/);
    await cmd("appr", pending, "return", 3, "Close the month first");
    await cmd("prep", pending, "discard", 4);
    const tbBefore = await q("SELECT * FROM accounting_trial_balance('a',$1::date)", [period.end_date]);
    const closeKey = key();
    await fn("accounting_period_command('a','acct',$1,'close',$2,'March reviewed',$3,'t')", [period.id, period.version, closeKey]);
    assert.equal((await fn("accounting_period_command('a','acct',$1,'close',$2,'March reviewed',$3,'t')", [period.id, period.version, closeKey])).already, true);
    const late = await save("prep", { entryDate: lastYearDate, lines: [line("6100", "5", ""), line("1110", "", "5")] });
    await assert.rejects(cmd("prep", late.id, "submit", 1), /period_closed/);
    await assert.rejects(fn("accounting_journal_reverse('a','acct',$1,$2::jsonb,'t')", [old, JSON.stringify({ key: key(), reason: "Wrong month", entryDate: lastYearDate })]), /period_closed/);
    // Correct a closed period with a reversal dated in an open period.
    await fn("accounting_journal_reverse('a','acct',$1,$2::jsonb,'t')", [old, JSON.stringify({ key: key(), reason: "Wrong month" })]);
    assert.deepEqual(await q("SELECT * FROM accounting_trial_balance('a',$1::date)", [period.end_date]), tbBefore, "closed-period trial balance unchanged");
    await assert.rejects(fn("accounting_period_command('a','acct',$1,'reopen',$2,'',$3,'t')", [period.id, period.version + 1, key()]), /reopen_reason_required/);
    await assert.rejects(fn("accounting_period_command('a','acct',$1,'reopen',$2,'Audit adjustment',$3,'t')", [period.id, period.version, key()]), /stale_period/);
    await fn("accounting_period_command('a','acct',$1,'reopen',$2,'Audit adjustment',$3,'t')", [period.id, period.version + 1, key()]);
    const events = await q<{ action: string }>("SELECT action FROM accounting_events WHERE entity_type='period' AND entity_id=$1 ORDER BY created_at", [period.id]);
    assert.deepEqual(events.map((e) => e.action), ["created", "close", "reopen"]);
  });

  await check("no period covering the date: posting refused", async () => {
    const far = await approved([line("6200", "1", ""), line("1110", "", "1")], { entryDate: `${year + 3}-01-05` });
    await assert.rejects(cmd("appr", far, "post", 3), /period_missing/);
  });

  // ---------------------------------------------------------------------------------------------
  await check("multi-currency: rates are human-approved; foreign lines draft but never post", async () => {
    const rate = (actor: string, p: Record<string, unknown>) => fn("accounting_rate_propose('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), fromCurrency: "USD", toCurrency: "UGX", rateDate: today, source: "Bank of Uganda mid-rate (fixture)", ...p })]);
    await assert.rejects(rate("prep", { rate: "0" }), /invalid_exchange_rate/);
    await assert.rejects(rate("prep", { rate: "-3700" }), /invalid_exchange_rate/);
    await assert.rejects(rate("prep", { rate: "3700", rateDate: `${year + 1}-01-01` }), /invalid_exchange_rate/, "no future rates");
    await assert.rejects(rate("prep", { rate: "3700", toCurrency: "USD" }), /invalid_exchange_rate/);
    const proposed = await rate("prep", { rate: "3712.4567" });
    const usdLine = (debit: string, credit: string, rateId?: unknown) => ({ accountId: accounts["1121"], debit, credit, currency: "USD", exchangeRateId: rateId });
    await assert.rejects(save("prep", { lines: [usdLine("100", "", proposed.id)] }), /exchange_rate_unavailable/, "unapproved rate");
    await assert.rejects(fn("accounting_rate_decide('a','prep',$1,'approve','',$2,'t')", [proposed.id, key()]), /accounting_self_approval_denied/);
    await fn("accounting_rate_decide('a','acct',$1,'approve','Checked',$2,'t')", [proposed.id, key()]);
    await assert.rejects(db.query("UPDATE accounting_exchange_rates SET rate=1 WHERE id=$1", [proposed.id]), /accounting_history_immutable/);
    const dup = await rate("prep", { rate: "3800" });
    await assert.rejects(fn("accounting_rate_decide('a','acct',$1,'approve','',$2,'t')", [dup.id, key()]), /exchange_rate_exists/, "one approved rate per pair and day");
    // USD 100.05 * 3712.4567 = 371431.293... -> 371431.29 (round half away from zero)
    const fx = await save("prep", { lines: [usdLine("100.05", "", proposed.id), line("3100", "", "371431.29")] });
    const fl = await one<{ functional_debit: string; exchange_rate: string }>("SELECT functional_debit::text,exchange_rate::text FROM accounting_journal_lines WHERE journal_id=$1 AND line_number=1", [fx.id]);
    assert.deepEqual(fl, { functional_debit: "371431.29", exchange_rate: "3712.4567000000" });
    await assert.rejects(cmd("prep", fx.id, "submit", 1), /journal_unbalanced/, "currencies are never added together");
    await assert.rejects(db.query("UPDATE accounting_journal_lines SET functional_debit=1 WHERE journal_id=$1 AND line_number=1", [fx.id]), /check/i, "functional amount must equal amount x rate");
    await assert.rejects(save("prep", { lines: [{ ...usdLine("10", ""), exchangeRateId: undefined }, line("3100", "", "10")] }).then(async (j) => {
      await cmd("prep", j.id, "submit", 1); await cmd("appr", j.id, "approve", 2); await cmd("appr", j.id, "post", 3);
    }), /journal_unbalanced|multi_currency_posting_disabled/, "a USD line without conversion cannot post into a UGX ledger");
    // A balanced, single-currency USD journal still cannot post while multi-currency is disabled.
    const usdOnly = await approved([usdLine("50", "", proposed.id), usdLine("", "50", proposed.id)].map((l, i) => i ? { ...l, accountId: accounts["1121"] } : l));
    await assert.rejects(cmd("appr", usdOnly, "post", 3), /multi_currency_posting_disabled/);
  });

  // ---------------------------------------------------------------------------------------------
  await check("cross-organization: org b cannot see or act on org a records", async () => {
    await assert.rejects(fn("accounting_journal_command('b','other',$1,'approve',1,'',$2,'t')", [j1, key()]), /journal_unavailable/);
    await assert.rejects(fn("accounting_journal_reverse('b','other',$1,$2::jsonb,'t')", [j1, JSON.stringify({ key: key(), reason: "Cross org attempt" })]), /journal_unavailable/);
    await assert.rejects(fn("accounting_account_command('b','other',$1,'activate',1,'',$2,'t')", [accounts["1110"], key()]), /account_unavailable/);
    await assert.rejects(fn("accounting_journal_save('a','other',$1::jsonb,'t')", [JSON.stringify({ key: key(), entryDate: today, description: "x", lines: [] })]), /staff_mirror_required/, "actor must be staff of the organization");
    await assert.rejects(fn("accounting_journal_save('a','gone',$1::jsonb,'t')", [JSON.stringify({ key: key(), entryDate: today, description: "x", lines: [] })]), /staff_mirror_required/, "suspended staff cannot act");
    assert.equal((await q("SELECT * FROM accounting_trial_balance('b',$1::date)", [today])).length, 0);
  });

  await check("trial balance: posted only, balanced, reconciles to journal lines", async () => {
    const draft = await save("prep", { lines: [line("1110", "777", ""), line("3100", "", "777")] });
    await cmd("prep", draft.id, "submit", 1);
    const tb = await q<{ code: string; debit: string; credit: string; balance_debit: string; balance_credit: string; currency: string }>("SELECT code,debit::text,credit::text,balance_debit::text,balance_credit::text,currency FROM accounting_trial_balance('a',$1::date)", [`${year}-12-31`]);
    const sum = (k: "debit" | "credit" | "balance_debit" | "balance_credit") => tb.reduce((s, r) => s + BigInt(r[k].replace(".", "")), BigInt(0));
    assert.equal(sum("debit"), sum("credit"), "total debits equal total credits");
    assert.equal(sum("balance_debit"), sum("balance_credit"), "net balances balance");
    assert.ok(tb.every((r) => r.currency === "UGX"));
    const direct = await q<{ code: string; d: string; c: string }>(`SELECT a.code,sum(l.functional_debit)::text d,sum(l.functional_credit)::text c FROM accounting_journal_lines l
      JOIN accounting_journals j ON j.id=l.journal_id JOIN accounting_accounts a ON a.id=l.account_id WHERE l.organization_id='a' AND j.status='posted' GROUP BY a.code ORDER BY a.code`);
    assert.deepEqual(tb.map((r) => [r.code, r.debit, r.credit]), direct.map((r) => [r.code, r.d, r.c]), "every account reconciles to its posted lines");
    assert.ok(!tb.some((r) => r.debit.includes("777")), "draft and submitted journals do not affect balances");
    const reversed = tb.find((r) => r.code === "3100");
    assert.ok(reversed, "reversed accounts still listed with both sides");
    const numbers = await q<{ number: string }>("SELECT number FROM accounting_journals WHERE organization_id='a' AND status='posted' AND fiscal_year=$1 ORDER BY number", [year]);
    numbers.forEach((n, i) => assert.equal(n.number, `JE-${year}-${String(i + 1).padStart(6, "0")}`, "gapless numbering"));
  });

  await check("posting rules: versioned, two-person approval, only active accounts, never executed", async () => {
    const def = { schema: 1, lines: [{ side: "debit", account: { code: "1200" }, amount: "total" }, { side: "credit", account: { byDivision: { tech: "4600" } }, amount: "total" }] };
    const r1 = await fn("accounting_rule_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), sourceType: "invoice_issued", description: "Invoice to receivables", definition: def, effectiveFrom: today })]);
    await assert.rejects(fn("accounting_rule_decide('a','prep',$1,'approve','',$2,'t')", [r1.id, key()]), /accounting_self_approval_denied/);
    await fn("accounting_rule_decide('a','acct',$1,'approve','',$2,'t')", [r1.id, key()]);
    const bad = await fn("accounting_rule_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), sourceType: "invoice_issued", description: "Unknown account", definition: { schema: 1, lines: [{ side: "debit", account: { code: "9999" }, amount: "total" }, { side: "credit", account: { code: "4600" }, amount: "total" }] }, effectiveFrom: today })]);
    assert.equal(bad.version, 2);
    await assert.rejects(fn("accounting_rule_decide('a','acct',$1,'approve','',$2,'t')", [bad.id, key()]), /posting_rule_invalid_account/);
    await assert.rejects(fn("accounting_rule_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), sourceType: "salary_run", description: "Not a source", definition: def, effectiveFrom: today })]), /invalid_posting_rule/);
    await assert.rejects(db.query("INSERT INTO accounting_journals(organization_id,journal_type,entry_date,description,prepared_by_id,idempotency_key,source_type,source_id,source_event) VALUES('a','system',$1,'auto',$2,$3,'invoice_issued','x','issue')", [today, S(1), key()]), /automatic_posting_disabled/);
  });

  await check("history: every command is recorded and the record is append-only", async () => {
    const acts = await q<{ action: string }>("SELECT action FROM accounting_events WHERE entity_type='journal' AND entity_id=$1 ORDER BY created_at", [j1]);
    assert.deepEqual(acts.map((a) => a.action), ["created", "updated", "updated", "submit", "approve", "post", "reversed"]);
    assert.ok(Number((await one<{ n: number }>("SELECT count(*)::int n FROM audit_logs WHERE action LIKE 'accounting.%'")).n) > 50);
    await assert.rejects(db.query("UPDATE accounting_events SET note='x'"), /accounting_history_immutable/);
    await assert.rejects(db.query("DELETE FROM accounting_events"), /accounting_history_immutable/);
  });

  await check("no existing financial table was touched", async () => {
    for (const t of ["invoices", "payments", "payment_allocations", "credit_notes", "payment_refunds", "expenses", "expense_disbursements"]) {
      const n = await one<{ n: number }>(`SELECT count(*)::int n FROM ${t}`);
      assert.equal(n.n, 0, `${t} untouched`);
    }
    // Phase 2B (0019) adds exactly these AFTER capture triggers (the transactional outbox). They only
    // append outbox rows, and only when integration is enabled: with no approved stage they are inert.
    const triggers = await q<{ tgname: string; relname: string }>("SELECT t.tgname,c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgname LIKE 'accounting%' AND c.relname NOT LIKE 'accounting%' ORDER BY c.relname");
    assert.deepEqual(triggers.map((t) => t.relname), ["credit_notes", "expense_disbursements", "expenses", "invoices", "payment_allocation_reversals", "payment_allocations", "payment_refunds", "payments"], "only the 0019 capture triggers");
    assert.ok(triggers.every((t) => t.tgname.startsWith("accounting_capture_")));
    assert.equal((await one<{ n: number }>("SELECT count(*)::int n FROM accounting_integration_events")).n, 0, "integration disabled: nothing captured");
  });

  console.log(passed.map((p) => `PASS ${p}`).join("\n"));
  console.log(`Accounting database checks passed (${passed.length}).`);
} finally {
  await db.close();
}
