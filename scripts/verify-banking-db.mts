// Phase 2C: banking, cash management and bank reconciliation checks on a disposable in-memory PGlite
// database migrated with the real drizzle-current chain (0000-0021). Synthetic data only: no
// environment variables, no network, no production connection, no real statements or credentials.
// Every rule is exercised through the command functions and, where relevant, through direct SQL.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { chartSeedPayload } from "../lib/accounting/chart";

const db = new PGlite();
const passed: string[] = [];
const check = async (name: string, f: () => Promise<void>) => { await f(); passed.push(name); console.log("PASS", name); };
const q = async <T = Record<string, unknown>,>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
const one = async <T = Record<string, unknown>,>(text: string, params: unknown[] = []) => (await q<T>(text, params))[0];
const fn = async (call: string, params: unknown[] = []) => (await one<{ r: Record<string, unknown> }>(`SELECT ${call} AS r`, params)).r;
const key = () => randomUUID();
const S = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const n = (v: unknown) => Number(v ?? 0);

try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  assert.ok(journal.entries.some((e) => e.tag === "0021_banking_reconciliation"), "0021 is in the active migration history");
  for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await db.exec(s);
  console.log("PASS migration chain 0000-0021 applied");

  // Staff: prep prepares, review approves, third is a further approver, gone is suspended, other is org b.
  await db.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A'),('b','B','B');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,display_name,status) VALUES
      ('${S(1)}','a','prep','Preparer','active'),('${S(2)}','a','review','Reviewer','active'),('${S(3)}','a','third','Third','active'),
      ('${S(4)}','a','gone','Suspended','suspended'),('${S(5)}','a','emp','Employee','active'),('${S(9)}','b','other','Other org','active');`);
  const today = (await one<{ d: string }>("SELECT finance_kampala_today()::text AS d")).d;
  const Y = Number(today.slice(0, 4)) - 1; // every fixture date is in the previous, fully past year
  const D = (m: number, d: number) => `${Y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // Ledger prerequisites through the Phase 2A functions.
  await fn("accounting_chart_seed('a','prep',$1::jsonb,$2,'t')", [JSON.stringify(chartSeedPayload()), key()]);
  const acct: Record<string, string> = {};
  for (const r of await q<{ id: string; code: string }>("SELECT id,code FROM accounting_accounts WHERE organization_id='a'")) acct[r.code] = r.id;
  const saveAcct = async (code: string, name: string, currency: string | null, type = "asset", cls = "current_asset") =>
    (acct[code] = String((await fn("accounting_account_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), code, name, accountType: type, reportingClass: cls, parentId: acct["1100"], currency })])).id));
  await saveAcct("1120-01", "Bank - Stanbic UGX", "UGX");
  await saveAcct("1130-01", "MTN Mobile Money", "UGX");
  await saveAcct("1130-02", "Airtel Money", "UGX");
  await saveAcct("1115", "Office cash", "UGX");
  await saveAcct("1120-02", "Bank - second UGX", "UGX");
  await fn("accounting_chart_approve('a','review',$1,'t')", [key()]);
  const pol = await fn("accounting_policy_propose('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: true, note: "Fixture policy, manual posting on" })]);
  await fn("accounting_policy_decide('a','review',$1,'approve','Fixture approval',$2,'t')", [pol.id, key()]);
  await fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [Y, key()]);
  await fn("accounting_period_generate_year('a','prep',$1,$2,'t')", [Y + 1, key()]);

  const postManual = async (date: string, description: string, lines: Record<string, unknown>[]) => {
    const j = await fn("accounting_journal_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), entryDate: date, description, lines })]);
    const s = await fn("accounting_journal_command('a','prep',$1,'submit',1,'',$2,'t')", [j.id, key()]);
    const a = await fn("accounting_journal_command('a','review',$1,'approve',$2,'',$3,'t')", [j.id, s.version, key()]);
    await fn("accounting_journal_command('a','review',$1,'post',$2,'',$3,'t')", [j.id, a.version, key()]);
    return String(j.id);
  };
  const L = (code: string, side: "debit" | "credit", amount: string) => ({ accountId: acct[code], [side]: amount, currency: "UGX" });
  const lineOf = async (jid: string, code: string) => String((await one<{ id: string }>("SELECT id FROM accounting_journal_lines WHERE journal_id=$1 AND account_id=$2", [jid, acct[code]])).id);

  // ------------------------------------------------------------------------------------------
  const fa: Record<string, string> = {};
  const ba: Record<string, string> = {};
  const register = (p: Record<string, unknown>, actor = "prep", org = "a") => fn("banking_account_register($1,$2,$3::jsonb,'t')", [org, actor, JSON.stringify({ key: key(), ...p })]);

  await check("accounts: verified finance accounts are reused once; cash, petty cash and clearing are unique by label", async () => {
    for (const [k, method, provider, ident, label, cur] of [
      ["bank", "bank_transfer", "Stanbic", "9030001234567", "Stanbic UGX", "UGX"], ["mtn", "mobile_money", "MTN Mobile Money", "256770000001", "MTN MoMo", "UGX"],
      ["airtel", "mobile_money", "Airtel Money", "256750000001", "Airtel Money", "UGX"], ["usd", "bank_transfer", "Stanbic", "9030009999999", "Stanbic USD", "USD"],
      ["bank2", "bank_transfer", "Centenary", "3100012345", "Centenary UGX", "UGX"]]) {
      fa[k] = String((await fn("finance_account_save('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), method, provider, accountIdentifier: ident, label, currency: cur, verificationNote: "Synthetic fixture account" })])).id);
    }
    const k1 = key();
    ba.bank = String((await fn("banking_account_register('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: k1, kind: "bank", financeAccountId: fa.bank })])).id);
    assert.equal((await fn("banking_account_register('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: k1, kind: "bank", financeAccountId: fa.bank })])).already, true, "retry is idempotent");
    await assert.rejects(register({ kind: "bank", financeAccountId: fa.bank }), /banking_account_exists/, "the same verified account cannot be registered twice");
    await assert.rejects(register({ kind: "mobile_money", financeAccountId: fa.bank2 }), /finance_account_unavailable/, "a bank account is not a mobile-money wallet");
    ba.mtn = String((await register({ kind: "mobile_money", financeAccountId: fa.mtn })).id);
    ba.airtel = String((await register({ kind: "mobile_money", financeAccountId: fa.airtel })).id);
    ba.usd = String((await register({ kind: "bank", financeAccountId: fa.usd })).id);
    ba.bank2 = String((await register({ kind: "bank", financeAccountId: fa.bank2 })).id);
    await assert.rejects(register({ kind: "petty_cash", label: "Head office petty cash", currency: "UGX" }), /custodian_unavailable/, "cash needs a custodian");
    ba.petty = String((await register({ kind: "petty_cash", label: "Head office petty cash", currency: "UGX", custodianId: S(5), floatAmount: "150000" })).id);
    await assert.rejects(register({ kind: "petty_cash", label: "head-office PETTY cash", currency: "UGX", custodianId: S(5) }), /banking_account_exists/, "labels are compared normalized");
    ba.cash = String((await register({ kind: "cash", label: "Office cash", currency: "UGX", custodianId: S(5) })).id);
    ba.clearing = String((await register({ kind: "clearing", label: "Receipts clearing", currency: "UGX" })).id);
    await assert.rejects(register({ kind: "cash", label: "Gone's cash", currency: "UGX", custodianId: S(4) }), /custodian_unavailable/, "a suspended custodian is refused");
    await assert.rejects(register({ kind: "clearing", label: "Floats", currency: "UGX", floatAmount: "10" }), /float_not_applicable/);
    await assert.rejects(register({ kind: "bank", financeAccountId: fa.bank }, "gone"), /staff_mirror_required/, "suspended staff cannot act");
    await assert.rejects(register({ kind: "bank", financeAccountId: fa.bank }, "other", "b"), /finance_account_unavailable/, "another organization's account is invisible");
    await assert.rejects(q("UPDATE banking_accounts SET currency='USD' WHERE id=$1", [ba.bank]), /identity_immutable/);
    await assert.rejects(q("DELETE FROM banking_accounts WHERE id=$1", [ba.bank]), /banking_history_immutable/);
  });

  await check("ledger mappings: two people, one per side, asset accounts of the same currency only", async () => {
    const propose = (bid: string, code: string, actor = "prep", note = "Verified against the bank letter") => fn("bank_mapping_propose('a',$1,$2::uuid,$3::uuid,$4,$5,'t')", [actor, bid, acct[code], note, key()]);
    const decide = (id: unknown, actor: string, decision = "approve", note = "") => fn("bank_mapping_decide('a',$1,$2::uuid,$3,$4,$5,'t')", [actor, id, decision, note, key()]);
    const m = await propose(ba.bank, "1120-01");
    await assert.rejects(decide(m.id, "prep"), /accounting_self_approval_denied/);
    await assert.rejects(fn("bank_mapping_decide('b','other',$1::uuid,'approve','',$2,'t')", [m.id, key()]), /bank_mapping_unavailable/, "cross-organization decision refused");
    await decide(m.id, "review");
    await assert.rejects(propose(ba.bank, "4100"), /bank_mapping_invalid_account/, "revenue cannot represent a bank account");
    await assert.rejects(propose(ba.usd, "1120-02"), /bank_mapping_invalid_account/, "currency mismatch refused");
    await assert.rejects(propose(ba.bank, "1200"), /bank_mapping_invalid_account/, "control accounts refused (manual posting denied)");
    const dupLedger = await propose(ba.bank2, "1120-01");
    await assert.rejects(decide(dupLedger.id, "review"), /unique|duplicate/i, "one ledger account cannot represent two banking accounts");
    await decide(dupLedger.id, "review", "reject", "Wrong ledger account chosen");
    for (const [b, code] of [["bank2", "1120-02"], ["mtn", "1130-01"], ["airtel", "1130-02"], ["petty", "1110"], ["cash", "1115"], ["clearing", "1140"]]) await decide((await propose(ba[b], code)).id, "review");
    await assert.rejects(q("UPDATE bank_account_mappings SET note='rewritten' WHERE id=$1", [m.id]), /banking_history_immutable/);
    await assert.rejects(q("DELETE FROM bank_account_mappings WHERE id=$1", [m.id]), /banking_history_immutable/);
    assert.equal(n((await one("SELECT count(*) AS c FROM bank_account_mappings WHERE organization_id='a' AND status='approved'")).c), 7);
  });

  await check("category accounts: approved by a second person, with the right account type", async () => {
    const propose = (category: string, code: string, actor = "prep") => fn("banking_category_propose('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), category, ledgerAccountId: acct[code], note: "Accountant approved treatment" })]);
    await assert.rejects(propose("bank_fee", "4100"), /banking_category_invalid_account/, "a fee is not revenue");
    await assert.rejects(propose("staff_advances", "6990"), /banking_category_invalid_account/, "advances are an asset, never an expense");
    await assert.rejects(propose("bank_fee", "1120-01"), /banking_category_invalid_account/, "a bank ledger account is not a category account");
    for (const [cat, code] of [["bank_fee", "6910"], ["interest_income", "7100"], ["interest_expense", "8100"], ["staff_advances", "1230"], ["cash_shortage", "6990"], ["cash_overage", "7900"]]) {
      const p = await propose(cat, code);
      if (cat === "bank_fee") await assert.rejects(fn("banking_category_decide('a','prep',$1::uuid,'approve','',$2,'t')", [p.id, key()]), /accounting_self_approval_denied/);
      await fn("banking_category_decide('a','review',$1::uuid,'approve','',$2,'t')", [p.id, key()]);
    }
  });

  // ------------------------------------------------------------------------------------------
  // Ledger activity for February (opening balance at the end of January).
  const cashTxn = (p: Record<string, unknown>, actor = "prep") => fn("cash_transaction_create('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), ...p })]);
  const decideCash = (id: unknown, actor = "review", decision = "approve", note = "Checked against evidence", k = key()) => fn("cash_transaction_decide('a',$1,$2::uuid,$3,$4,$5,'t')", [actor, id, decision, note, k]);
  const jstatus = async (tid: unknown) => (await one<{ status: string; number: string }>("SELECT j.status,j.number FROM cash_transactions t JOIN accounting_journals j ON j.id=t.journal_id WHERE t.id=$1", [tid]));
  const tx: Record<string, string> = {};
  let openingJournal = "";

  await check("cash receipts and payments post through the manual journal workflow; transfers never become income or expense", async () => {
    openingJournal = await postManual(D(1, 31), "Opening bank balance (cut-over)", [L("1120-01", "debit", "1000000.00"), L("3900", "credit", "1000000.00")]);
    const before = n((await one("SELECT count(*) AS c FROM accounting_journals WHERE organization_id='a'")).c);
    const r = await cashTxn({ kind: "receipt", bankingAccountId: ba.bank, counterAccountId: acct["4100"], date: D(2, 3), amount: "500000", description: "Design fee received", reference: "RCPT-77" });
    assert.equal((await jstatus(r.id)).status, "submitted", "prepared and submitted, not posted");
    await assert.rejects(decideCash(r.id, "prep"), /accounting_self_approval_denied/, "the preparer cannot approve");
    const k = key();
    const ok = await decideCash(r.id, "review", "approve", "", k);
    assert.equal(ok.status, "posted");
    assert.equal((await decideCash(r.id, "review", "approve", "", k)).already, true, "approval retry is idempotent");
    tx.receipt = String(r.id);
    assert.equal(n((await one("SELECT count(*) AS c FROM accounting_journals WHERE organization_id='a'")).c), before + 1, "one journal per cash transaction");
    tx.rent = String((await cashTxn({ kind: "payment", bankingAccountId: ba.bank, counterAccountId: acct["6200"], date: D(2, 10), amount: "200000", description: "February office rent", reference: "CHQ-1001" })).id);
    await decideCash(tx.rent);
    await assert.rejects(cashTxn({ kind: "payment", bankingAccountId: ba.bank, counterAccountId: acct["1110"], date: D(2, 10), amount: "1000", description: "Disguised transfer" }), /use_transfer_for_company_accounts/);
    await assert.rejects(cashTxn({ kind: "payment", bankingAccountId: ba.bank, counterAccountId: acct["1230"], date: D(2, 10), amount: "1000", description: "Disguised advance" }), /use_advance_workflow/);
    await assert.rejects(cashTxn({ kind: "payment", bankingAccountId: ba.bank, counterAccountId: acct["1200"], date: D(2, 10), amount: "1000", description: "Into receivables" }), /account_manual_posting_denied/);
    await assert.rejects(cashTxn({ kind: "receipt", bankingAccountId: ba.bank, counterAccountId: acct["4100"], date: `${Y + 2}-01-01`, amount: "1", description: "Future" }), /future_banking_date/);
    await assert.rejects(cashTxn({ kind: "receipt", bankingAccountId: ba.bank, counterAccountId: acct["4100"], date: D(2, 3), amount: "1.001", description: "Too precise" }), /invalid_amount/);
  });

  await check("transfers: one record, balanced, duplicate from either side refused, retries safe, petty cash float enforced", async () => {
    const k = key();
    const t = await fn("cash_transaction_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: k, kind: "transfer", bankingAccountId: ba.bank, toAccountId: ba.petty, date: D(2, 12), amount: "100000", description: "Petty cash top-up", reference: "TRF-1" })]);
    assert.equal((await fn("cash_transaction_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: k, kind: "transfer", bankingAccountId: ba.bank, toAccountId: ba.petty, date: D(2, 12), amount: "100000", description: "Petty cash top-up", reference: "TRF-1" })])).already, true);
    await assert.rejects(cashTxn({ kind: "transfer", bankingAccountId: ba.petty, toAccountId: ba.bank, date: D(2, 12), amount: "100000", description: "Same movement entered from the other side", reference: "trf 1" }), /duplicate_transfer/);
    await assert.rejects(cashTxn({ kind: "transfer", bankingAccountId: ba.bank, toAccountId: ba.bank, date: D(2, 12), amount: "1", description: "Self", reference: "X1" }), /transfer_same_account/);
    await assert.rejects(cashTxn({ kind: "transfer", bankingAccountId: ba.bank, toAccountId: ba.usd, date: D(2, 12), amount: "1", description: "FX", reference: "X2" }), /banking_mapping_required|transfer_currency_mismatch/);
    await assert.rejects(cashTxn({ kind: "transfer", bankingAccountId: ba.bank, toAccountId: ba.mtn, date: D(2, 12), amount: "1", description: "No reference" }), /transfer_reference_required/);
    await decideCash(t.id);
    tx.transfer = String(t.id);
    const lines = await q<{ code: string; debit: string; credit: string }>("SELECT a.code,l.debit::text,l.credit::text FROM accounting_journal_lines l JOIN accounting_accounts a ON a.id=l.account_id JOIN cash_transactions t ON t.journal_id=l.journal_id WHERE t.id=$1 ORDER BY l.line_number", [t.id]);
    assert.deepEqual(lines.map((l) => [l.code, l.debit, l.credit]), [["1110", "100000.00", "0.00"], ["1120-01", "0.00", "100000.00"]], "asset to asset only");
    await assert.rejects(cashTxn({ kind: "transfer", bankingAccountId: ba.bank, toAccountId: ba.petty, date: D(2, 13), amount: "60000", description: "Over the float", reference: "TRF-2" }), /petty_cash_float_exceeded/);
  });

  // ------------------------------------------------------------------------------------------
  const csvRow = (row: number, date: string, description: string, amount: string, reference = "", balance = "") => ({ row, date, description, reference, amount, balance });
  const importStatement = (bid: string, rows: unknown[], extra: Record<string, unknown> = {}, actor = "prep", org = "a") =>
    fn("bank_statement_import($1,$2,$3::jsonb,'t')", [org, actor, JSON.stringify({ key: key(), bankingAccountId: bid, currency: "UGX", fileName: "feb.csv", fileSha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
      fileSize: 500, storageKey: `banking/test/${randomUUID()}.csv`, sourceFormat: "csv", columnMapping: { date: 0, description: 1, amount: 2 }, rows, ...extra })]);
  const lineId = async (bid: string, date: string, amount: string, status = "active") => String((await one<{ id: string }>("SELECT id FROM bank_statement_lines WHERE banking_account_id=$1 AND txn_date=$2 AND amount=$3 AND review_status=$4 ORDER BY created_at LIMIT 1", [bid, date, amount, status])).id);
  const febRows = [
    csvRow(2, D(2, 3), "Transfer in RCPT-77", "500000", "RCPT-77", "1500000"),
    csvRow(3, D(2, 12), "Transfer out", "-100000", "TRF-1", "1400000"),
    csvRow(4, D(2, 28), "Monthly ledger fee", "-5000", "", "1395000"),
    csvRow(5, D(2, 28), "Credit interest", "1200", "", "1396200"),
  ];

  await check("statement import: preview-validated rows stored immutably; same file and same key are idempotent; no journal created", async () => {
    const journalsBefore = n((await one("SELECT count(*) AS c FROM accounting_journals WHERE organization_id='a'")).c);
    const sha = "a".repeat(64), k = key();
    const p = { key: k, bankingAccountId: ba.bank, currency: "UGX", fileName: "feb.csv", fileSha256: sha, fileSize: 400, storageKey: "banking/test/feb.csv", sourceFormat: "csv", columnMapping: { date: 0, description: 1, amount: 2, balance: 3 }, rows: febRows };
    const r = await fn("bank_statement_import('a','prep',$1::jsonb,'t')", [JSON.stringify(p)]);
    assert.ok(r.id, "import recorded");
    assert.deepEqual([r.imported, r.duplicates, r.review], [4, 0, 0]);
    assert.equal((await fn("bank_statement_import('a','prep',$1::jsonb,'t')", [JSON.stringify(p)])).already, true, "same key");
    const again = await fn("bank_statement_import('a','prep',$1::jsonb,'t')", [JSON.stringify({ ...p, key: key() })]);
    assert.equal(again.sameFile, true, "the same file is imported once per account");
    const imp = await one<{ derived_opening_balance: string; derived_closing_balance: string }>("SELECT derived_opening_balance::text,derived_closing_balance::text FROM bank_statement_imports WHERE id=$1", [r.id]);
    assert.deepEqual([imp.derived_opening_balance, imp.derived_closing_balance], ["1000000.00", "1396200.00"], "running balances reconcile oldest-first");
    assert.equal(n((await one("SELECT count(*) AS c FROM accounting_journals WHERE organization_id='a'")).c), journalsBefore, "importing never creates a journal");
    await assert.rejects(q("UPDATE bank_statement_lines SET amount=1 WHERE import_id=$1", [r.id]), /banking_history_immutable/);
    await assert.rejects(q("DELETE FROM bank_statement_lines WHERE import_id=$1", [r.id]), /banking_history_immutable/);
    await assert.rejects(q("UPDATE bank_statement_imports SET file_name='x' WHERE id=$1", [r.id]), /banking_history_immutable/);
  });

  await check("statement import: account, currency, date, amount and cross-organization mismatches are refused", async () => {
    await assert.rejects(importStatement(ba.bank, febRows, { currency: "USD" }), /statement_currency_mismatch/);
    await assert.rejects(importStatement(ba.petty, febRows), /statement_not_applicable/, "cash accounts have no bank statement");
    await assert.rejects(importStatement(ba.usd, febRows, { currency: "USD" }), /banking_mapping_required/, "an unmapped account cannot import");
    await assert.rejects(importStatement(ba.bank, [csvRow(2, `${Y}-02-30`, "Bad date", "1")]), /invalid_banking_date/);
    await assert.rejects(importStatement(ba.bank, [csvRow(2, `${Y + 2}-01-01`, "Future", "1")]), /future_banking_date/);
    await assert.rejects(importStatement(ba.bank, [csvRow(2, D(3, 1), "Zero", "0")]), /statement_rows_invalid/);
    await assert.rejects(importStatement(ba.bank, [csvRow(2, D(3, 1), "Grouped", "1,000")]), /invalid_amount/);
    await assert.rejects(importStatement(ba.bank, [csvRow(3, D(3, 1), "A", "1"), csvRow(2, D(3, 1), "B", "1")]), /statement_rows_invalid/, "rows must keep file order");
    await assert.rejects(importStatement(ba.bank, febRows, {}, "other", "b"), /banking_account_unavailable/);
  });

  await check("overlapping imports: exact duplicates are skipped, ambiguous ones wait for review, identical rows in one file stay distinct", async () => {
    const r = await importStatement(ba.bank, [
      csvRow(2, D(2, 28), "Monthly  ledger fee", "-5000"),          // exact duplicate (whitespace normalized)
      csvRow(3, D(2, 28), "INTEREST CREDIT FEB", "1200"),           // same day and amount, different text: ambiguous
      csvRow(4, D(3, 5), "Cheque 1001 presented", "-200000", "CHQ-1001"),
      csvRow(5, D(3, 8), "Airtime", "-3000"), csvRow(6, D(3, 8), "Airtime", "-3000"), // two genuine identical rows
    ]);
    assert.deepEqual([r.imported, r.duplicates, r.review], [3, 1, 1]);
    const dupe = await one<{ review_reason: string; duplicate_of_id: string }>("SELECT review_reason,duplicate_of_id FROM bank_statement_lines WHERE import_id=$1 AND review_status='duplicate'", [r.id]);
    assert.equal(dupe.review_reason, "exact_duplicate");
    const again = await importStatement(ba.bank, [csvRow(2, D(3, 8), "Airtime", "-3000"), csvRow(3, D(3, 8), "Airtime", "-3000"), csvRow(4, D(3, 8), "Airtime", "-3000")]);
    assert.deepEqual([again.imported, again.duplicates, again.review], [0, 2, 1], "the first two already exist; a third identical row may be genuine, so it waits for review");
    await assert.rejects(q("INSERT INTO bank_statement_lines(organization_id,import_id,banking_account_id,currency,source_row,txn_date,description,amount,occurrence,dedupe_key,review_status) SELECT organization_id,import_id,banking_account_id,currency,99,txn_date,description,amount,occurrence,dedupe_key,'active' FROM bank_statement_lines WHERE import_id=$1 AND review_status='active' LIMIT 1", [r.id]), /unique|duplicate/i, "a live duplicate is impossible even by direct SQL");
    const review = await one<{ id: string }>("SELECT id FROM bank_statement_lines WHERE import_id=$1 AND review_status='needs_review'", [r.id]);
    await assert.rejects(fn("bank_statement_line_review('a','prep',$1,'duplicate','',$2,'t')", [review.id, key()]), /review_reason_required/);
    await fn("bank_statement_line_review('a','prep',$1,'duplicate','Same interest credit as the February statement',$2,'t')", [review.id, key()]);
    await assert.rejects(fn("bank_statement_line_review('a','prep',$1,'accept','Changed my mind about it',$2,'t')", [review.id, key()]), /statement_line_not_in_review/);
  });

  // ------------------------------------------------------------------------------------------
  const match = (p: Record<string, unknown>, actor = "prep") => fn("bank_match_create('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), bankingAccountId: ba.bank, kind: "match", ...p })]);
  const recon = (p: Record<string, unknown>, actor = "prep") => fn("bank_reconciliation_create('a',$1,$2::jsonb,'t')", [actor, JSON.stringify({ key: key(), bankingAccountId: ba.bank, ...p })]);
  const rcmd = async (rid: unknown, actor: string, cmd: string, note = "") => {
    const v = n((await one("SELECT version FROM bank_reconciliations WHERE id=$1", [rid])).version);
    return fn("bank_reconciliation_command('a',$1,$2::uuid,$3,$4,$5,$6,'t')", [actor, rid, cmd, v, note, key()]);
  };
  const figures = async (rid: unknown) => (await one<{ f: Record<string, unknown> }>("SELECT bank_reconciliation_figures('a',$1) AS f", [rid])).f;
  let feb = "";

  await check("exact matching: suggestions never write; a confirmed match is idempotent and never changes the ledger", async () => {
    feb = String((await recon({ periodStart: D(2, 1), periodEnd: D(2, 28), openingStatementBalance: "1000000", closingStatementBalance: "1396200" })).id);
    const opening = await lineOf(openingJournal, "1120-01");
    await assert.rejects(match({ kind: "opening_balance", note: "Cut-over balance", items: [{ journalLineId: opening, amount: "999999" }] }), /match_exceeds_available|opening_match_invalid/);
    await match({ kind: "opening_balance", note: "Cut-over balance agreed to the January statement", items: [{ journalLineId: opening, amount: "1000000" }] });
    const tb = await q("SELECT * FROM accounting_trial_balance('a',$1::date)", [today]);
    const receiptLine = await lineOf(String((await one("SELECT journal_id FROM cash_transactions WHERE id=$1", [tx.receipt])).journal_id), "1120-01");
    const k = key();
    const p = { key: k, bankingAccountId: ba.bank, kind: "match", items: [{ statementLineId: await lineId(ba.bank, D(2, 3), "500000.00"), amount: "500000" }, { journalLineId: receiptLine, amount: "500000" }] };
    const m1 = await fn("bank_match_create('a','prep',$1::jsonb,'t')", [JSON.stringify(p)]);
    assert.equal(m1.partial, false);
    assert.equal((await fn("bank_match_create('a','prep',$1::jsonb,'t')", [JSON.stringify(p)])).already, true);
    await assert.rejects(match({ items: [{ statementLineId: await lineId(ba.bank, D(2, 3), "500000.00"), amount: "1" }, { journalLineId: receiptLine, amount: "1" }] }), /match_exceeds_available/, "no double matching");
    const transferLine = await lineOf(String((await one("SELECT journal_id FROM cash_transactions WHERE id=$1", [tx.transfer])).journal_id), "1120-01");
    await match({ items: [{ statementLineId: await lineId(ba.bank, D(2, 12), "-100000.00"), amount: "-100000" }, { journalLineId: transferLine, amount: "-100000" }] });
    const tb2 = await q("SELECT * FROM accounting_trial_balance('a',$1::date)", [today]);
    assert.deepEqual(tb2, tb, "matching changes nothing in the ledger");
  });

  await check("finalization requires the balance equation, no unmatched statement items and an independent reviewer", async () => {
    let f = await figures(feb);
    assert.equal(f.unmatchedStatementCount, 2, "fee and interest are unmatched exceptions");
    assert.equal(f.outstandingPayments, "200000.00", "the rent cheque is an outstanding payment");
    await assert.rejects(rcmd(feb, "prep", "submit"), /unmatched_statement_items/);
    // Bank charge and interest: classified exceptions become draft adjustments that need approval.
    const fee = await cashTxn({ kind: "bank_adjustment", statementLineId: await lineId(ba.bank, D(2, 28), "-5000.00"), category: "bank_fee" });
    await assert.rejects(cashTxn({ kind: "bank_adjustment", statementLineId: await lineId(ba.bank, D(2, 28), "-5000.00"), category: "bank_fee" }), /statement_line_adjusted/, "one adjustment per statement line");
    await assert.rejects(cashTxn({ kind: "bank_adjustment", statementLineId: await lineId(ba.bank, D(2, 28), "1200.00"), category: "bank_fee" }), /adjustment_direction_mismatch/);
    f = await figures(feb);
    assert.equal(f.unmatchedStatementCount, 2, "a draft adjustment changes nothing until it is approved and posted");
    await assert.rejects(decideCash(fee.id, "prep"), /accounting_self_approval_denied/);
    await decideCash(fee.id, "review");
    const interest = await cashTxn({ kind: "bank_adjustment", statementLineId: await lineId(ba.bank, D(2, 28), "1200.00"), category: "interest_income" });
    await decideCash(interest.id, "review");
    f = await figures(feb);
    assert.deepEqual([f.unmatchedStatementCount, f.statementCheck, f.difference, f.closingBook, f.balanced], [0, "0.00", "0.00", "1196200.00", true]);
    await assert.rejects(fn("bank_reconciliation_command('a','prep',$1::uuid,'submit',99,'',$2,'t')", [feb, key()]), /stale_reconciliation/);
    await rcmd(feb, "prep", "submit");
    await assert.rejects(rcmd(feb, "prep", "finalize"), /reconciliation_self_approval_denied/);
    await rcmd(feb, "review", "finalize");
    const snap = await one<{ figures: Record<string, unknown>; sequence: number }>("SELECT figures,sequence FROM bank_reconciliation_snapshots WHERE reconciliation_id=$1", [feb]);
    assert.equal(snap.figures.difference, "0.00");
    await assert.rejects(q("UPDATE bank_reconciliation_snapshots SET figures='{}' WHERE reconciliation_id=$1", [feb]), /accounting_history_immutable/);
    await assert.rejects(q("UPDATE bank_reconciliations SET closing_statement_balance=1 WHERE id=$1", [feb]), /reconciliation_locked/);
  });

  await check("finalized periods are locked: matches, late statement rows and acceptance are refused until an audited reopen", async () => {
    const g = await one<{ id: string }>("SELECT id FROM bank_match_groups WHERE banking_account_id=$1 AND kind='match' AND status='active' ORDER BY created_at LIMIT 1", [ba.bank]);
    await assert.rejects(fn("bank_match_cancel('a','prep',$1,'Matched in error, redo it',$2,'t')", [g.id, key()]), /match_in_finalized_period/);
    const late = await importStatement(ba.bank, [csvRow(2, D(2, 20), "Late correction", "-750")]);
    assert.equal(late.review, 1, "a late row dated in a finalized period waits for review");
    const lid = await lineId(ba.bank, D(2, 20), "-750.00", "needs_review");
    await assert.rejects(fn("bank_statement_line_review('a','prep',$1,'accept','Genuine bank correction',$2,'t')", [lid, key()]), /statement_line_in_finalized_period/);
    await assert.rejects(rcmd(feb, "prep", "reopen", "x"), /reopen_reason_required/);
    await rcmd(feb, "review", "reopen", "Bank issued a correction dated 20 February");
    await fn("bank_statement_line_review('a','prep',$1,'accept','Genuine bank correction',$2,'t')", [lid, key()]);
    assert.equal(n((await one("SELECT count(*) AS c FROM bank_reconciliation_snapshots WHERE reconciliation_id=$1", [feb])).c), 1, "the earlier finalized figures are preserved");
    // The correction is now an unexplained bank item: the closing balance no longer agrees.
    let f = await figures(feb);
    assert.equal(f.balanced, false);
    assert.ok((f.problems as string[]).includes("statement_balance_mismatch"));
    // Resolve it the controlled way: correct the statement closing balance and post a reviewed adjustment journal.
    const v = n((await one("SELECT version FROM bank_reconciliations WHERE id=$1", [feb])).version);
    await fn("bank_reconciliation_update('a','prep',$1,$2::jsonb,'t')", [feb, JSON.stringify({ key: key(), version: v, periodEnd: D(2, 28), closingStatementBalance: "1395450" })]);
    const corr = await postManual(D(2, 20), "Bank correction per bank advice", [L("6910", "debit", "750.00"), L("1120-01", "credit", "750.00")]);
    await match({ items: [{ statementLineId: lid, amount: "-750" }, { journalLineId: await lineOf(corr, "1120-01"), amount: "-750" }] });
    f = await figures(feb);
    assert.equal(f.balanced, true);
    await rcmd(feb, "prep", "submit");
    await rcmd(feb, "third", "finalize");
    assert.equal(n((await one("SELECT count(*) AS c FROM bank_reconciliation_snapshots WHERE reconciliation_id=$1", [feb])).c), 2);
    assert.equal(n((await one("SELECT reopen_count FROM bank_reconciliations WHERE id=$1", [feb])).reopen_count), 1);
  });

  await check("partial, one-to-many, many-to-one, offsets and reversals in the next period", async () => {
    await assert.rejects(recon({ periodStart: D(3, 2), periodEnd: D(3, 31), openingStatementBalance: "1395450", closingStatementBalance: "0" }), /reconciliation_not_contiguous/);
    await assert.rejects(recon({ periodStart: D(3, 1), periodEnd: D(3, 31), openingStatementBalance: "1", closingStatementBalance: "0" }), /opening_balance_mismatch/);
    const mar = String((await recon({ periodStart: D(3, 1), periodEnd: D(3, 31), openingStatementBalance: "1395450", closingStatementBalance: "0" })).id);
    await assert.rejects(recon({ periodStart: D(4, 1), periodEnd: D(4, 30), openingStatementBalance: "0", closingStatementBalance: "0" }), /previous_reconciliation_open/);
    // Ledger: two receipts deposited together; one receipt banked in two lots; a partially presented payment; a journal and its reversal.
    const r1 = await cashTxn({ kind: "receipt", bankingAccountId: ba.bank, counterAccountId: acct["4100"], date: D(3, 10), amount: "30000", description: "Plan sale A" });
    const r2 = await cashTxn({ kind: "receipt", bankingAccountId: ba.bank, counterAccountId: acct["4100"], date: D(3, 10), amount: "20000", description: "Plan sale B" });
    const r3 = await cashTxn({ kind: "receipt", bankingAccountId: ba.bank, counterAccountId: acct["4500"], date: D(3, 12), amount: "25000", description: "Rent collected" });
    const p1 = await cashTxn({ kind: "payment", bankingAccountId: ba.bank, counterAccountId: acct["6800"], date: D(3, 14), amount: "60000", description: "Repairs" });
    for (const t of [r1, r2, r3, p1]) await decideCash(t.id);
    const jl = async (t: Record<string, unknown>) => lineOf(String((await one("SELECT journal_id FROM cash_transactions WHERE id=$1", [t.id])).journal_id), "1120-01");
    const wrong = await postManual(D(3, 15), "Posted to the wrong bank in error", [L("1120-01", "debit", "9000.00"), L("4100", "credit", "9000.00")]);
    const rev = await fn("accounting_journal_reverse('a','review',$1,$2::jsonb,'t')", [wrong, JSON.stringify({ key: key(), reason: "Posted to the wrong account", entryDate: D(3, 16) })]);
    await importStatement(ba.bank, [
      csvRow(2, D(3, 11), "Deposit", "50000"), csvRow(3, D(3, 12), "Deposit lot 1", "10000"), csvRow(4, D(3, 13), "Deposit lot 2", "15000"),
      csvRow(5, D(3, 16), "Repairs cheque part", "-40000"), csvRow(6, D(3, 20), "Returned item", "7000"), csvRow(7, D(3, 21), "Returned item reversal", "-7000"),
    ]);
    await match({ items: [{ statementLineId: await lineId(ba.bank, D(3, 11), "50000.00"), amount: "50000" }, { journalLineId: await jl(r1), amount: "30000" }, { journalLineId: await jl(r2), amount: "20000" }] });
    await match({ items: [{ statementLineId: await lineId(ba.bank, D(3, 12), "10000.00"), amount: "10000" }, { statementLineId: await lineId(ba.bank, D(3, 13), "15000.00"), amount: "15000" }, { journalLineId: await jl(r3), amount: "25000" }] });
    const partial = { items: [{ statementLineId: await lineId(ba.bank, D(3, 16), "-40000.00"), amount: "-40000" }, { journalLineId: await jl(p1), amount: "-40000" }] };
    await assert.rejects(match(partial), /match_note_required/, "a partial match needs an explanation");
    const pm = await match({ ...partial, note: "Supplier presented the cheque in two parts" });
    assert.equal(pm.partial, true);
    assert.ok((pm.residuals as { residual: string }[]).some((x) => x.residual === "-20000.00"), "explicit residual on the ledger line");
    await assert.rejects(match({ items: [{ statementLineId: await lineId(ba.bank, D(3, 5), "-200000.00"), amount: "-30000" }, { journalLineId: await jl(p1), amount: "-30000" }], note: "Too much" }), /match_exceeds_available/);
    await assert.rejects(match({ items: [{ statementLineId: await lineId(ba.bank, D(3, 11), "50000.00"), amount: "1" }, { journalLineId: await jl(p1), amount: "-1" }] }), /match_sign_mismatch|match_exceeds_available/);
    await assert.rejects(match({ kind: "statement_offset", items: [{ statementLineId: await lineId(ba.bank, D(3, 20), "7000.00"), amount: "7000" }, { statementLineId: await lineId(ba.bank, D(3, 21), "-7000.00"), amount: "-7000" }] }), /match_note_required/);
    await match({ kind: "statement_offset", note: "Bank reversed a returned item", items: [{ statementLineId: await lineId(ba.bank, D(3, 20), "7000.00"), amount: "7000" }, { statementLineId: await lineId(ba.bank, D(3, 21), "-7000.00"), amount: "-7000" }] });
    await match({ kind: "ledger_offset", note: "Journal and its reversal", items: [{ journalLineId: await lineOf(wrong, "1120-01"), amount: "9000" }, { journalLineId: await lineOf(String(rev.id), "1120-01"), amount: "-9000" }] });
    // The February rent cheque, outstanding at the end of February, presented on 5 March.
    const rentLine = await lineOf(String((await one("SELECT journal_id FROM cash_transactions WHERE id=$1", [tx.rent])).journal_id), "1120-01");
    await match({ items: [{ statementLineId: await lineId(ba.bank, D(3, 5), "-200000.00"), amount: "-200000" }, { journalLineId: rentLine, amount: "-200000" }] });
    // Airtime rows (3 identical) still unmatched: the period cannot be submitted.
    const f = await figures(mar);
    assert.deepEqual([f.unmatchedStatementCount, f.reviewPending], [2, 1], "two airtime rows unmatched, one awaiting duplicate review");
    assert.equal(f.outstandingPayments, "20000.00", "the unpresented part of the repairs cheque");
    await assert.rejects(rcmd(mar, "prep", "submit"), /statement_balance_mismatch|unmatched_statement_items/);
    // Direct SQL cannot create an unbalanced or over-allocated match.
    await db.exec("BEGIN");
    await assert.rejects((async () => {
      const g = await one<{ id: string }>("INSERT INTO bank_match_groups(organization_id,banking_account_id,kind,effective_date,created_by_id,idempotency_key) VALUES('a',$1,'match',$2,$3,$4) RETURNING id", [ba.bank, D(3, 8), S(1), key()]);
      await q("INSERT INTO bank_match_items(organization_id,group_id,banking_account_id,statement_line_id,amount) VALUES('a',$1,$2,$3,-3000)", [g.id, ba.bank, await lineId(ba.bank, D(3, 8), "-3000.00")]);
      await db.exec("COMMIT");
    })(), /match_unbalanced/);
    await db.exec("ROLLBACK").catch(() => {});
    await assert.rejects(q("INSERT INTO bank_match_items(organization_id,group_id,banking_account_id,journal_line_id,amount) SELECT 'a',id,banking_account_id,$1,-1 FROM bank_match_groups WHERE banking_account_id=$2 AND status='active' LIMIT 1", [rentLine, ba.bank]), /match_exceeds_available/);
    await assert.rejects(q("DELETE FROM bank_match_items"), /banking_history_immutable/);
  });

  await check("unexplained differences block finalization; nothing is auto-balanced", async () => {
    const mtnOpen = await postManual(D(1, 31), "Opening MTN balance", [L("1130-01", "debit", "80000.00"), L("3900", "credit", "80000.00")]);
    const r = String((await fn("bank_reconciliation_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), bankingAccountId: ba.mtn, periodStart: D(2, 1), periodEnd: D(2, 28), openingStatementBalance: "75000", closingStatementBalance: "75000" })])).id);
    const f = await figures(r);
    assert.notEqual(f.difference, "0.00", "book 80,000 vs statement 75,000 with no explanation");
    assert.ok((f.problems as string[]).includes("reconciliation_difference"));
    await assert.rejects(rcmd(r, "prep", "submit"), /reconciliation_difference/);
    await assert.rejects(fn("bank_match_create('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), bankingAccountId: ba.mtn, kind: "opening_balance", note: "Force it to agree", items: [{ journalLineId: await lineOf(mtnOpen, "1130-01"), amount: "80000" }] })]), /opening_match_invalid/, "the opening match must equal the statement opening balance");
    assert.equal(n((await one("SELECT count(*) AS c FROM accounting_journals WHERE organization_id='a' AND description ILIKE '%balancing%'")).c), 0);
  });

  await check("cash advances and accountability: an asset until accounted for, evidence required, never over-accounted", async () => {
    await assert.rejects(cashTxn({ kind: "advance", bankingAccountId: ba.bank, staffId: S(4), date: D(3, 2), amount: "300000", description: "Site advance" }), /staff_unavailable/, "no advances to suspended staff");
    const adv = await cashTxn({ kind: "advance", bankingAccountId: ba.bank, staffId: S(5), date: D(3, 2), amount: "300000", description: "Site materials advance", reference: "ADV-1" });
    const ev = await fn("banking_evidence_record('a','emp',$1::jsonb,'t')", [JSON.stringify({ key: key(), sha256: "b".repeat(64), storageKey: "banking/evidence/test-1", fileName: "receipts.pdf", mimeType: "application/pdf", sizeBytes: 1000 })]);
    const account = (p: Record<string, unknown>) => cashTxn({ kind: "accountability", advanceId: adv.id, date: D(3, 20), description: "Receipts for site materials", evidenceId: ev.id, ...p });
    await assert.rejects(account({ expenses: [{ accountId: acct["5300"], amount: "100" }] }), /advance_not_posted/);
    await decideCash(adv.id);
    const advLines = await q<{ code: string; debit: string }>("SELECT a.code,l.debit::text FROM accounting_journal_lines l JOIN accounting_accounts a ON a.id=l.account_id JOIN cash_transactions t ON t.journal_id=l.journal_id WHERE t.id=$1 AND l.debit>0", [adv.id]);
    assert.deepEqual(advLines.map((l) => l.code), ["1230"], "an advance is a receivable from the employee, not an expense");
    await assert.rejects(account({ evidenceId: "", expenses: [{ accountId: acct["5300"], amount: "100" }] }), /cash_evidence_required/);
    await assert.rejects(account({ expenses: [{ accountId: acct["1110"], amount: "100" }] }), /accountability_account_invalid/);
    await assert.rejects(account({ expenses: [{ accountId: acct["5300"], amount: "250000" }], cashReturned: "60000", bankingAccountId: ba.petty }), /accountability_exceeds_advance/);
    const a1 = await account({ expenses: [{ accountId: acct["5300"], amount: "120000", description: "Cement" }, { accountId: acct["6400"], amount: "20000", description: "Transport" }], cashReturned: "10000", bankingAccountId: ba.petty });
    await decideCash(a1.id);
    assert.equal((await one<{ v: string }>("SELECT cash_advance_outstanding('a',$1)::text AS v", [adv.id])).v, "150000.00");
    const a2 = await account({ expenses: [{ accountId: acct["5300"], amount: "150000" }] });
    await assert.rejects(account({ expenses: [{ accountId: acct["5300"], amount: "1" }] }), /accountability_exceeds_advance/, "a pending accountability already consumes the balance");
    await decideCash(a2.id, "review", "reject", "Receipts are illegible");
    assert.equal((await one<{ v: string }>("SELECT cash_advance_outstanding('a',$1)::text AS v", [adv.id])).v, "150000.00", "a rejected accountability releases the balance");
  });

  await check("cash counts: shortages and overages need evidence and independent approval, once per count", async () => {
    const book = (await one<{ v: string }>("SELECT banking_book_balance('a',$1,NULL)::text AS v", [ba.petty])).v;
    assert.equal(book, "110000.00", "100,000 top-up plus 10,000 returned");
    await assert.rejects(fn("cash_count_record('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), bankingAccountId: ba.bank, countDate: D(3, 31), countedAmount: "1" })]), /cash_count_not_applicable/);
    await assert.rejects(fn("cash_count_record('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), bankingAccountId: ba.petty, countDate: D(3, 31), countedAmount: "1", witnessId: S(1) })]), /witness_must_differ/);
    const c = await fn("cash_count_record('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), bankingAccountId: ba.petty, countDate: D(3, 31), countedAmount: "108000", witnessId: S(5), denominations: [{ value: 50000, count: 2 }, { value: 1000, count: 8 }] })]);
    assert.equal(c.difference, "-2000.00");
    await assert.rejects(cashTxn({ kind: "count_adjustment", cashCountId: c.id, description: "Unexplained shortage after count" }), /cash_evidence_required/);
    const ev = await fn("banking_evidence_record('a','prep',$1::jsonb,'t')", [JSON.stringify({ key: key(), sha256: "c".repeat(64), storageKey: "banking/evidence/count-1", fileName: "count-sheet.png", mimeType: "image/png", sizeBytes: 2000 })]);
    const adj = await cashTxn({ kind: "count_adjustment", cashCountId: c.id, evidenceId: ev.id, description: "Shortage after count, custodian statement attached" });
    await assert.rejects(cashTxn({ kind: "count_adjustment", cashCountId: c.id, evidenceId: ev.id, description: "Second adjustment for the same count" }), /cash_count_adjusted/);
    await assert.rejects(decideCash(adj.id, "prep"), /accounting_self_approval_denied/);
    await decideCash(adj.id, "review");
    assert.equal((await one<{ v: string }>("SELECT banking_book_balance('a',$1,NULL)::text AS v", [ba.petty])).v, "108000.00");
    await assert.rejects(q("UPDATE cash_counts SET counted_amount=110000 WHERE id=$1", [c.id]), /accounting_history_immutable/);
    await assert.rejects(q("UPDATE cash_transactions SET amount=1 WHERE id=$1", [adj.id]), /accounting_history_immutable/);
  });

  await check("closed accounting periods: cash transactions and adjustments dated in them are refused", async () => {
    const per = await one<{ id: string; version: number }>("SELECT id,version FROM accounting_periods WHERE organization_id='a' AND $1::date BETWEEN start_date AND end_date", [D(4, 15)]);
    await fn("accounting_period_command('a','review',$1,'close',$2,'April closed for fixture',$3,'t')", [per.id, per.version, key()]);
    await assert.rejects(cashTxn({ kind: "receipt", bankingAccountId: ba.bank, counterAccountId: acct["4100"], date: D(4, 15), amount: "1000", description: "Into a closed period" }), /period_closed/);
    await importStatement(ba.bank, [csvRow(2, D(4, 30), "April fee", "-2500")]);
    await assert.rejects(cashTxn({ kind: "bank_adjustment", statementLineId: await lineId(ba.bank, D(4, 30), "-2500.00"), category: "bank_fee" }), /period_closed/);
  });

  await check("separation of duties, suspended staff and organization isolation", async () => {
    const t = await cashTxn({ kind: "receipt", bankingAccountId: ba.bank, counterAccountId: acct["4100"], date: D(3, 25), amount: "1000", description: "Small receipt" });
    await q("UPDATE staff_memberships SET status='suspended' WHERE id=$1", [S(2)]);
    await assert.rejects(decideCash(t.id, "review"), /staff_mirror_required/, "a suspended approver loses access immediately");
    await q("UPDATE staff_memberships SET status='active' WHERE id=$1", [S(2)]);
    await assert.rejects(fn("cash_transaction_decide('b','other',$1::uuid,'approve','',$2,'t')", [t.id, key()]), /cash_transaction_unavailable/);
    await assert.rejects(fn("bank_reconciliation_command('b','other',$1::uuid,'submit',1,'',$2,'t')", [feb, key()]), /reconciliation_unavailable/);
    await assert.rejects(fn("bank_match_create('b','other',$1::jsonb,'t')", [JSON.stringify({ key: key(), bankingAccountId: ba.bank, kind: "match", items: [] })]), /banking_account_unavailable/);
    await assert.rejects(fn("cash_transaction_decide('a','prep',$1::uuid,'cancel','',$2,'t')", [t.id, key()]), /review_reason_required/);
    assert.equal((await fn("cash_transaction_decide('a','prep',$1::uuid,'cancel','Entered twice by mistake',$2,'t')", [t.id, key()])).status, "discarded");
    await assert.rejects(q("UPDATE banking_events SET note='x'"), /accounting_history_immutable/);
  });

  await check("general ledger agreement: every banking journal is ordinary, balanced and traceable; book balances come only from posted lines", async () => {
    const unbalanced = await q("SELECT j.id FROM accounting_journals j JOIN cash_transactions t ON t.journal_id=j.id WHERE j.status='posted' AND j.total_debit<>j.total_credit");
    assert.equal(unbalanced.length, 0);
    const types = await q<{ journal_type: string }>("SELECT DISTINCT j.journal_type FROM accounting_journals j JOIN cash_transactions t ON t.journal_id=j.id");
    assert.deepEqual(types.map((t) => t.journal_type), ["manual"], "no parallel ledger and no system journals");
    const tb = await q<{ debit: string; credit: string }>("SELECT coalesce(sum(functional_debit),0)::text AS debit, coalesce(sum(functional_credit),0)::text AS credit FROM accounting_journal_lines l JOIN accounting_journals j ON j.id=l.journal_id WHERE j.status='posted' AND j.organization_id='a'");
    assert.equal(tb[0].debit, tb[0].credit, "trial balance balances");
    const book = (await one<{ v: string }>("SELECT banking_book_balance('a',$1,NULL)::text AS v", [ba.bank])).v;
    const direct = (await one<{ v: string }>("SELECT sum(l.debit-l.credit)::text AS v FROM accounting_journal_lines l JOIN accounting_journals j ON j.id=l.journal_id AND j.status='posted' WHERE l.account_id=$1", [acct["1120-01"]])).v;
    assert.equal(book, direct);
    const events = n((await one("SELECT count(*) AS c FROM banking_events WHERE organization_id='a'")).c);
    const audits = n((await one("SELECT count(*) AS c FROM audit_logs WHERE organization_id='a' AND action LIKE 'banking.%'")).c);
    assert.equal(events, audits, "every banking command is in the audit trail");
    assert.equal(n((await one("SELECT count(*) AS c FROM payments")).c) + n((await one("SELECT count(*) AS c FROM payment_allocations")).c), 0, "customer payments and allocations untouched");
  });

  console.log(`Banking database checks passed (${passed.length}).`);
} finally {
  await db.close();
}
