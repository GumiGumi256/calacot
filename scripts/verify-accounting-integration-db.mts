// Phase 2B: source-to-ledger integration checks on a disposable in-memory PGlite database migrated
// with the real drizzle-current chain (0000-0019). Synthetic data only; no environment variables,
// no network, no production connection. Business records are created through the real sales and
// expense functions wherever a workflow exists; refunds (no workflow yet) are inserted directly.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { chartSeedPayload } from "../lib/accounting/chart";

const db = new PGlite();
const passed: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => { await fn(); passed.push(name); console.log("PASS", name); };
const q = async <T = Record<string, unknown>,>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
const one = async <T = Record<string, unknown>,>(text: string, params: unknown[] = []) => (await q<T>(text, params))[0];
const fn = async (call: string, params: unknown[] = []) => (await one<{ r: Record<string, unknown> }>(`SELECT ${call} AS r`, params)).r;
const key = () => randomUUID();
const S = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const n = (v: unknown) => Number(v ?? 0);

try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await db.exec(s);
  passed.push(`migration chain 0000-${journal.entries.at(-1).tag} applied`);

  await db.exec(`
    INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A'),('b','B','B');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,display_name,status) VALUES
      ('${S(1)}','a','fin','Finance','active'),('${S(2)}','a','acct','Accountant','active'),('${S(3)}','a','req','Requester','active'),
      ('${S(6)}','a','rec','Reconciler','active'),('${S(5)}','b','other','Other org','active'),('${S(7)}','b','other2','Other org 2','active');
    INSERT INTO clients(id,organization_id,kind,display_name) VALUES('${S(10)}','a','company','Client A'),('${S(20)}','b','company','Client B');
    INSERT INTO projects(id,organization_id,client_id,code,name,division,currency) VALUES
      ('${S(11)}','a','${S(10)}','P-1','Villa','architecture','UGX'),('${S(12)}','a','${S(10)}','P-2','Repaint','painting','UGX'),
      ('${S(13)}','a','${S(10)}','P-3','Portal','tech','UGX'),('${S(14)}','a','${S(10)}','P-4','Lodge','interiors','USD'),
      ('${S(21)}','b','${S(20)}','P-1','Other','architecture','UGX');`);
  const today = (await one<{ d: string }>("SELECT finance_kampala_today()::text AS d")).d;
  const year = Number(today.slice(0, 4));
  const priorDay = `${year - 1}-06-15`;

  // Business-record helpers (same statements the sales functions use).
  let invoiceNo = 0;
  const issueInvoice = async (o: { project: string; total: string; tax?: string; currency?: string; deposit?: boolean; issuedAt?: string; org?: string; client?: string }) => {
    const id = randomUUID(); const tax = o.tax ?? "0"; const sub = (Number(o.total) - Number(tax)).toFixed(2);
    await db.query(`INSERT INTO invoices(id,organization_id,client_id,project_id,billing_purpose,billing_schedule_id,number,status,customer_snapshot,issuer_snapshot,currency,subtotal,discount_amount,tax_amount,total,issued_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,'draft','{}','{}',$8,$9,0,$10,$11,$12)`,
      [id, o.org ?? "a", o.client ?? S(10), o.project, o.deposit ? "initial" : null, o.deposit ? randomUUID() : null, `CAL-I-T-${++invoiceNo}`, o.currency ?? "UGX", sub, tax, o.total, o.issuedAt ?? new Date().toISOString()]);
    await db.query("UPDATE invoices SET status='issued' WHERE id=$1", [id]);
    return id;
  };
  const submitPayment = async (invoiceId: string, amount: string, method = "bank_transfer") =>
    (await one<{ id: string }>("SELECT sales_payment('a','fin',$1::jsonb,'t') AS id", [JSON.stringify({ command: "submit", invoiceId, amount, method, reference: `REF-${randomUUID().slice(0, 8)}`, key: key(), receivedAt: new Date().toISOString() })])).id;
  const allocate = async (invoiceId: string, paymentId: string, amount: string) =>
    one("SELECT sales_payment('a','fin',$1::jsonb,'t') AS id", [JSON.stringify({ command: "confirm", invoiceId, paymentId, amount, evidence: "Bank statement line checked" })]);
  const process = (actor = "fin", org = "a", max = 100) => fn("accounting_integration_process($1,$2,$3,'test-worker','t')", [org, actor, max]);
  // JSON row: dates come back as ISO date strings.
  const ev = async (k: string) => (await one<{ r: Record<string, unknown> }>("SELECT to_jsonb(e) AS r FROM accounting_integration_events e WHERE organization_id='a' AND event_key=$1", [k])).r;
  const balance = async (code: string, org = "a") => n((await one<{ b: string }>(`SELECT coalesce(sum(l.functional_debit-l.functional_credit),0)::text AS b FROM accounting_journal_lines l
      JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id JOIN accounting_accounts a ON a.organization_id=l.organization_id AND a.id=l.account_id
      WHERE l.organization_id=$1 AND j.status='posted' AND a.code=$2`, [org, code])).b);
  const systemJournals = async () => n((await one<{ c: number }>("SELECT count(*)::int AS c FROM accounting_journals WHERE organization_id='a' AND journal_type IN ('system','reversal')")).c);
  const recon = async (mode: string, asOf = today) => Object.fromEntries((await q<Record<string, string>>("SELECT * FROM accounting_integration_reconciliation('a',$1::date,$2)", [asOf, mode])).map((r) => [`${r.check_key}:${r.currency}`, r]));
  const settings = async (stage: string, controls: Record<string, string> = {}) => {
    const p = await fn("accounting_integration_settings_propose('a','fin',$1::jsonb,'t')", [JSON.stringify({ key: key(), stage, note: `Move to ${stage} for verification`, controlAccounts: controls })]);
    return fn("accounting_integration_settings_decide('a','acct',$1,'approve','Reviewed',$2,'t')", [p.id, key()]);
  };
  const mapping = async (eventType: string, conditions: Record<string, string>, lines: unknown[] | null, approve = true) => {
    const p = await fn("accounting_mapping_propose('a','fin',$1::jsonb,'t')", [JSON.stringify({ key: key(), eventType, conditions, treatment: lines ? "journal" : "no_entry", definition: lines ? { lines } : {}, effectiveFrom: `${year - 1}-01-01`, description: `Synthetic ${eventType} mapping` })]);
    if (approve) await fn("accounting_mapping_decide('a','acct',$1,'approve','Approved for test',$2,'t')", [p.id, key()]);
    return String(p.id);
  };
  const line = (side: string, account: unknown, amount: string) => ({ side, account: typeof account === "string" ? { code: account } : account, amount });
  const controls = { receivables: "1200", unallocatedReceipts: "2140", payables: "2110", outputTax: "2180" };

  // Ledger foundation (Phase 2A): chart, policy (manual posting OFF), periods.
  await fn("accounting_chart_seed('a','fin',$1::jsonb,$2,'t')", [JSON.stringify(chartSeedPayload()), key()]);
  await fn("accounting_chart_approve('a','acct',$1,'t')", [key()]);
  const pol = await fn("accounting_policy_propose('a','fin',$1::jsonb,'t')", [JSON.stringify({ key: key(), functionalCurrency: "UGX", fiscalYearStartMonth: 1, manualPostingEnabled: false, note: "Synthetic policy for integration tests" })]);
  await fn("accounting_policy_decide('a','acct',$1,'approve','',$2,'t')", [pol.id, key()]);
  await fn("accounting_period_generate_year('a','fin',$1,$2,'t')", [year, key()]);
  await fn("accounting_period_generate_year('a','fin',$1,$2,'t')", [year - 1, key()]);
  const closed = await one<{ id: string; version: number; end_date: string }>("SELECT id,version,end_date::text FROM accounting_periods WHERE organization_id='a' AND $1::date BETWEEN start_date AND end_date", [priorDay]);
  await fn("accounting_period_command('a','acct',$1,'close',$2,'Closed for test',$3,'t')", [closed.id, closed.version, key()]);

  // ---------------------------------------------------------------------------------------------
  let inv1 = "", pay1 = "";
  await check("disabled by default: business workflows run unchanged and nothing is captured or posted", async () => {
    assert.equal(await fn("accounting_integration_stage('a')"), "disabled");
    inv1 = await issueInvoice({ project: S(11), total: "1000000" });
    pay1 = await submitPayment(inv1, "1200000");
    await allocate(inv1, pay1, "600000");
    assert.equal(n((await one<{ c: number }>("SELECT count(*)::int c FROM accounting_integration_events")).c), 0);
    assert.equal(await systemJournals(), 0);
    await assert.rejects(process(), /integration_disabled/);
    const inv = await one<{ status: string; total: string }>("SELECT status,total::text FROM invoices WHERE id=$1", [inv1]);
    assert.deepEqual(inv, { status: "issued", total: "1000000.00" }, "invoice totals untouched");
  });

  await check("rollout stage: two people; 'active' production posting is impossible; isolated test needs a marked test database", async () => {
    await assert.rejects(fn("accounting_integration_settings_propose('a','fin',$1::jsonb,'t')", [JSON.stringify({ key: key(), stage: "active", note: "Try to go live now" })]), /production_activation_unavailable/);
    await assert.rejects(db.query("INSERT INTO accounting_integration_settings(organization_id,version,stage,status,note,proposed_by_id,idempotency_key) VALUES('a',99,'active','proposed','force live',$1,'x')", [S(1)]), /accounting_integration_no_activation|check/i);
    await assert.rejects(fn("accounting_integration_settings_propose('a','fin',$1::jsonb,'t')", [JSON.stringify({ key: key(), stage: "isolated_test", note: "Not a test database" })]), /isolated_test_requires_test_database/);
    await assert.rejects(fn("accounting_integration_settings_propose('a','fin',$1::jsonb,'t')", [JSON.stringify({ key: key(), stage: "shadow", note: "Bad control", controlAccounts: { receivables: "9999" } })]), /invalid_control_accounts/);
    const p = await fn("accounting_integration_settings_propose('a','fin',$1::jsonb,'t')", [JSON.stringify({ key: key(), stage: "shadow", note: "Shadow reconciliation on history", controlAccounts: controls })]);
    await assert.rejects(fn("accounting_integration_settings_decide('a','fin',$1,'approve','',$2,'t')", [p.id, key()]), /accounting_self_approval_denied/);
    await assert.rejects(fn("accounting_integration_settings_decide('b','other',$1,'approve','',$2,'t')", [p.id, key()]), /integration_proposal_unavailable/, "other organization cannot decide");
    await fn("accounting_integration_settings_decide('a','acct',$1,'approve','Reviewed',$2,'t')", [p.id, key()]);
    assert.equal(await fn("accounting_integration_stage('a')"), "shadow");
    assert.equal(await fn("accounting_integration_stage('b')"), "disabled", "stage is per organization");
  });

  const revenue = { byDivision: { architecture: "4100", interiors: "4100", painting: "4200", estates: "4410" } };
  await check("mappings: validated, versioned, two-person approved; unknown accounts and conditions refused", async () => {
    const bad = (p: Record<string, unknown>) => fn("accounting_mapping_propose('a','fin',$1::jsonb,'t')", [JSON.stringify({ key: key(), effectiveFrom: today, description: "Invalid mapping", treatment: "journal", ...p })]);
    await assert.rejects(bad({ eventType: "invoice_issued", conditions: { colour: "blue" }, definition: { lines: [line("debit", "1200", "total"), line("credit", "4100", "total")] } }), /invalid_mapping_conditions/);
    await assert.rejects(bad({ eventType: "invoice_issued", conditions: {}, definition: { lines: [line("debit", "1200", "total"), line("debit", "4100", "total")] } }), /invalid_mapping_definition/, "both sides required");
    await assert.rejects(bad({ eventType: "invoice_issued", conditions: {}, definition: { lines: [line("debit", "1200", "amount"), line("credit", "4100", "amount")] } }), /invalid_mapping_definition/, "amount key must exist for the event");
    await assert.rejects(bad({ eventType: "invoice_voided", conditions: {}, definition: { lines: [] } }), /invalid_mapping_event/, "corrections are mechanical reversals, never mapped");
    const ghost = await mapping("invoice_issued", { billingKind: "milestone" }, [line("debit", "1200", "total"), line("credit", "1999", "total")], false);
    await assert.rejects(fn("accounting_mapping_decide('a','acct',$1,'approve','',$2,'t')", [ghost, key()]), /posting_rule_invalid_account/);
    await assert.rejects(fn("accounting_mapping_decide('a','fin',$1,'approve','',$2,'t')", [ghost, key()]), /accounting_self_approval_denied/);
    await assert.rejects(fn("accounting_mapping_decide('b','other',$1,'approve','',$2,'t')", [ghost, key()]), /mapping_unavailable/);
    await assert.rejects(db.query("UPDATE accounting_event_mappings SET definition='{}' WHERE id=$1", [ghost]), /accounting_history_immutable/, "proposals are immutable");
    await assert.rejects(db.query("DELETE FROM accounting_event_mappings WHERE id=$1", [ghost]), /accounting_history_immutable/);
    await fn("accounting_mapping_decide('a','acct',$1,'reject','Wrong account code',$2,'t')", [ghost, key()]);

    await mapping("invoice_issued", { billingKind: "standard" }, [line("debit", "1200", "total"), line("credit", revenue, "net")]);
    await mapping("invoice_issued", { billingKind: "deposit" }, [line("debit", "1200", "total"), line("credit", "2130", "total")]);
    for (const method of ["bank_transfer", "mobile_money", "cash"]) await mapping("payment_confirmed", { method }, [line("debit", "1140", "amount"), line("credit", "2140", "amount")]);
    await mapping("payment_allocated", {}, [line("debit", "2140", "amount"), line("credit", "1200", "amount")]);
    await mapping("allocation_reversed", {}, [line("debit", "1200", "amount"), line("credit", "2140", "amount")]);
    await mapping("credit_note_issued", { taxTreatment: "none" }, [line("debit", "4900", "total"), line("credit", "1200", "total")]);
    await mapping("disbursement_recorded", { expenseRecognized: "no" }, [line("debit", "6990", "amount"), line("credit", "1110", "amount")]);
    await mapping("disbursement_recorded", { expenseRecognized: "yes" }, [line("debit", "2110", "amount"), line("credit", "1110", "amount")]);
    const v = await q<{ version: number }>("SELECT version FROM accounting_event_mappings WHERE organization_id='a' AND event_type='payment_confirmed' ORDER BY version");
    assert.deepEqual(v.map((x) => x.version), [1, 2, 3], "versions per event type");
    const hist = await q("SELECT action FROM accounting_events WHERE organization_id='a' AND entity_type='event_mapping'");
    assert.ok(hist.length >= 20, "every proposal and decision is in the accounting history");
  });

  // ---------------------------------------------------------------------------------------------
  await check("shadow stage: historical records are backfilled and previewed without touching the ledger", async () => {
    const b = await fn("accounting_integration_backfill('a','fin',$1,'t')", [key()]);
    assert.equal(b.created, 3, "invoice issued, payment confirmed, allocation");
    const again = await fn("accounting_integration_backfill('a','fin',$1,'t')", [key()]);
    assert.equal(again.created, 0, "backfill is idempotent by event identity");
    const r = await process();
    assert.equal((r.outcomes as Record<string, number>).shadowed, 3);
    assert.equal(await systemJournals(), 0, "the general ledger is untouched in shadow mode");
    assert.equal(n((await one<{ c: number }>("SELECT count(*)::int c FROM accounting_shadow_lines WHERE organization_id='a'")).c), 6);
    const rc = await recon("shadow");
    assert.deepEqual([n(rc["receivables:UGX"].operational), n(rc["receivables:UGX"].ledger), rc["receivables:UGX"].status], [400000, 400000, "matched"]);
    assert.deepEqual([n(rc["unallocatedReceipts:UGX"].operational), n(rc["unallocatedReceipts:UGX"].ledger), rc["unallocatedReceipts:UGX"].status], [600000, 600000, "matched"]);
    await assert.rejects(db.query("DELETE FROM accounting_shadow_lines"), /integration_event_immutable/, "shadow results change only through the worker");
  });

  await check("isolated test stage: shadow previews are replayed and posted exactly once, linked to their source", async () => {
    await assert.rejects(settings("isolated_test", controls), /isolated_test_requires_test_database/, "an unmarked database can never post");
    await db.exec("SET calacot.accounting_test_database = 'on'");
    const d = await settings("isolated_test", controls);
    assert.equal(d.replayed, 3, "shadowed events re-queued");
    assert.equal(n((await one<{ c: number }>("SELECT count(*)::int c FROM accounting_shadow_lines")).c), 0);
    const r = await process();
    assert.equal((r.outcomes as Record<string, number>).posted, 3);
    const e = await ev(`invoice_issued:${inv1}`);
    const j = await one<Record<string, unknown>>("SELECT * FROM accounting_journals WHERE id=$1", [e.journal_id]);
    assert.deepEqual([j.journal_type, j.status, j.source_type, j.source_id, j.source_event, (j.entry_date as Date).toISOString().slice(0, 10)], ["system", "posted", "invoice_issued", inv1, `invoice_issued:${inv1}`, e.effective_date]);
    assert.match(String(j.number), /^JE-\d{4}-\d{6}$/);
    assert.equal(e.mapping_version, 2, "version 1 was the rejected proposal; the approved version is recorded");
    assert.deepEqual([await balance("1200"), await balance("4100"), await balance("2140"), await balance("1140")], [400000, -1000000, -600000, 1200000]);
    assert.equal((await process()).claimed, 0, "nothing left to do");
    assert.equal(await fn("accounting_capture('a','invoice_issued',$1,'backfill','isolated_test')", [inv1]), false, "duplicate delivery is a no-op");
    await assert.rejects(db.query(`INSERT INTO accounting_integration_events(organization_id,event_type,event_key,source_table,source_id,occurred_at,effective_date,currency,amount,payload,captured_by,capture_stage)
      VALUES('a','invoice_issued',$1,'invoices',$2,now(),current_date,'UGX',1,'{}','trigger','isolated_test')`, [`invoice_issued:${inv1}`, inv1]), /unique|duplicate/i);
    const attempts = await q("SELECT action,to_status FROM accounting_integration_attempts WHERE event_id=$1 ORDER BY created_at", [e.id]);
    assert.deepEqual(attempts.map((x) => `${x.action}:${x.to_status}`), ["captured:pending", "process:shadowed", "replay:pending", "process:posted"]);
  });

  await check("payments: receipt and allocation are separate; partial payments, overpayment and unallocated funds; no second revenue", async () => {
    const inv2 = await issueInvoice({ project: S(12), total: "300000" });
    await allocate(inv2, pay1, "200000"); // second allocation from the same overpaid receipt: partial payment of inv2
    await allocate(inv2, pay1, "200000"); // retried command: the sales ledger returns early, nothing new
    await process();
    assert.equal(await balance("2140"), -400000, "unallocated customer funds remain a liability");
    assert.equal(await balance("1200"), 400000 + 300000 - 200000);
    assert.equal(await balance("4100") + await balance("4200"), -1300000, "revenue only from issuance, never from payment");
    assert.equal(n((await one<{ c: number }>("SELECT count(*)::int c FROM accounting_integration_events WHERE event_type='payment_allocated'")).c), 2);
    const rc = await recon("ledger");
    assert.equal(rc["receivables:UGX"].status, "matched");
    assert.deepEqual([n(rc["unallocatedReceipts:UGX"].operational), rc["unallocatedReceipts:UGX"].status], [400000, "matched"]);
  });

  await check("deposit invoices follow the deposit mapping (deferred income), not revenue", async () => {
    const dep = await issueInvoice({ project: S(11), total: "250000", deposit: true });
    await process();
    const lines = await q<{ code: string; debit: string; credit: string }>(`SELECT a.code,l.debit::text,l.credit::text FROM accounting_journal_lines l JOIN accounting_accounts a ON a.id=l.account_id
      WHERE l.journal_id=(SELECT journal_id FROM accounting_integration_events WHERE event_key=$1) ORDER BY l.line_number`, [`invoice_issued:${dep}`]);
    assert.deepEqual(lines, [{ code: "1200", debit: "250000.00", credit: "0.00" }, { code: "2130", debit: "0.00", credit: "250000.00" }]);
  });

  await check("credit notes and invoice voids: contra-revenue entry and an exact reversal of the original journal", async () => {
    const inv3 = await issueInvoice({ project: S(11), total: "500000" });
    const inv4 = await issueInvoice({ project: S(12), total: "80000" });
    await process();
    const cn = await one<{ r: { creditNoteId: string } }>("SELECT sales_invoice_command('a','fin',$1,'credit','{\"reason\":\"Scope reduced\",\"amount\":\"50000\"}'::jsonb,'t') AS r", [inv3]);
    await one("SELECT sales_invoice_command('a','fin',$1,'void','{\"reason\":\"Issued in error\"}'::jsonb,'t')", [inv4]);
    await process();
    assert.equal((await ev(`credit_note_issued:${cn.r.creditNoteId}`)).status, "posted");
    assert.equal(await balance("4900"), 50000);
    const voided = await ev(`invoice_voided:${inv4}`);
    const rev = await one<Record<string, unknown>>("SELECT * FROM accounting_journals WHERE id=$1", [voided.journal_id]);
    const orig = await ev(`invoice_issued:${inv4}`);
    assert.deepEqual([rev.journal_type, rev.reverses_journal_id], ["reversal", orig.journal_id]);
    const origJournal = await one<{ status: string }>("SELECT status FROM accounting_journals WHERE id=$1", [orig.journal_id]);
    assert.equal(origJournal.status, "posted", "the original stays posted and unchanged");
    assert.equal(await balance("4200"), -300000, "voided invoice revenue fully reversed");
    assert.equal((await recon("ledger"))["receivables:UGX"].status, "matched");
  });

  await check("refunds and allocation reversals: missing mapping goes to the exception queue, then posts after approval and retry", async () => {
    const inv5 = await issueInvoice({ project: S(11), total: "100000" });
    const pay = await submitPayment(inv5, "100000", "mobile_money");
    await allocate(inv5, pay, "100000");
    const alloc = (await one<{ id: string }>("SELECT id FROM payment_allocations WHERE payment_id=$1", [pay])).id;
    const refund = randomUUID();
    await db.query("INSERT INTO payment_refunds(id,organization_id,payment_id,client_id,currency,amount,status,reason,idempotency_key) VALUES($1,'a',$2,$3,'UGX',40000,'pending','Customer overcharged',$4)", [refund, pay, S(10), key()]);
    await db.query("INSERT INTO payment_allocation_reversals(organization_id,payment_id,allocation_id,refund_id,amount) VALUES('a',$1,$2,$3,40000)", [pay, alloc, refund]);
    assert.equal((await q("SELECT 1 FROM accounting_integration_events WHERE event_type IN ('refund_completed','allocation_reversed')")).length, 0, "pending refund has no accounting effect");
    await db.query("UPDATE payment_refunds SET status='completed',completed_at=now(),processed_by_id=$2 WHERE id=$1", [refund, S(1)]);
    await process();
    const r = await ev(`refund_completed:${refund}`);
    assert.deepEqual([r.status, r.last_error_code], ["blocked", "mapping_missing"], "never guesses an account");
    const rev = await one<Record<string, unknown>>("SELECT * FROM accounting_integration_events WHERE event_type='allocation_reversed'");
    assert.equal(rev.status, "posted", "the allocation reversal has its own approved mapping");
    await mapping("refund_completed", {}, [line("debit", "2140", "amount"), line("credit", "1140", "amount")]);
    assert.equal((await process()).claimed, 0, "a blocked event is not retried until someone acts");
    await fn("accounting_integration_event_command('a','fin',$1,'retry','{}'::jsonb,$2,'t')", [r.id, key()]);
    await process();
    assert.equal((await ev(`refund_completed:${refund}`)).status, "posted");
    const rc = await recon("ledger");
    assert.equal(rc["receivables:UGX"].status, "matched");
    assert.equal(rc["unallocatedReceipts:UGX"].status, "matched");
    assert.equal(rc["refunds:UGX"].status, "matched");
  });

  await check("dependencies: an allocation waits for its blocked receipt and is released when the receipt posts", async () => {
    const inv6 = await issueInvoice({ project: S(11), total: "70000" });
    const pay = await submitPayment(inv6, "70000", "other");
    await allocate(inv6, pay, "70000");
    await process();
    assert.equal((await ev(`payment_confirmed:${pay}`)).last_error_code, "mapping_missing");
    const alloc = await one<Record<string, unknown>>("SELECT * FROM accounting_integration_events WHERE event_type='payment_allocated' AND payload->>'paymentId'=$1", [pay]);
    assert.deepEqual([alloc.status, alloc.last_error_code], ["blocked", "dependency_blocked"]);
    await mapping("payment_confirmed", { method: "other" }, [line("debit", "1140", "amount"), line("credit", "2140", "amount")]);
    await fn("accounting_integration_event_command('a','fin',$1,'retry','{}'::jsonb,$2,'t')", [(await ev(`payment_confirmed:${pay}`)).id, key()]);
    await process(); await process();
    assert.equal((await ev(alloc.event_key as string)).status, "posted");
  });

  await check("tax: a taxed invoice needs a mapping approved for taxed items; then VAT is posted separately", async () => {
    const inv = await issueInvoice({ project: S(11), total: "118000", tax: "18000" });
    await process();
    assert.equal((await ev(`invoice_issued:${inv}`)).last_error_code, "tax_treatment_unapproved");
    await mapping("invoice_issued", { billingKind: "standard", taxTreatment: "taxed" }, [line("debit", "1200", "total"), line("credit", revenue, "net"), line("credit", "2180", "tax")]);
    await fn("accounting_integration_event_command('a','fin',$1,'retry','{}'::jsonb,$2,'t')", [(await ev(`invoice_issued:${inv}`)).id, key()]);
    await process();
    assert.equal(await balance("2180"), -18000);
    assert.equal((await recon("ledger"))["outputTax:UGX"].status, "matched");
  });

  await check("missing division account, currency separation and closed periods are blocked with an explanation", async () => {
    const tech = await issueInvoice({ project: S(13), total: "90000" });
    const usd = await issueInvoice({ project: S(14), total: "1500", currency: "USD" });
    const old = await issueInvoice({ project: S(11), total: "60000", issuedAt: `${priorDay}T09:00:00Z` });
    await process();
    assert.equal((await ev(`invoice_issued:${tech}`)).last_error_code, "mapping_account_missing");
    assert.equal((await ev(`invoice_issued:${usd}`)).last_error_code, "fx_policy_unapproved", "UGX and USD are never mixed or converted");
    const o = await ev(`invoice_issued:${old}`);
    assert.deepEqual([o.status, o.last_error_code, o.effective_date], ["blocked", "period_closed", priorDay]);
    const tbBefore = await q("SELECT code,debit::text,credit::text FROM accounting_trial_balance('a',$1::date)", [closed.end_date]);
    await assert.rejects(fn("accounting_integration_event_command('a','fin',$1,'redate',$2::jsonb,$3,'t')", [o.id, JSON.stringify({ postingDate: `${year - 1}-01-15`, reason: "Try to backdate" }), key()]), /backdating_denied/);
    await assert.rejects(fn("accounting_integration_event_command('a','fin',$1,'redate',$2::jsonb,$3,'t')", [o.id, JSON.stringify({ postingDate: today, reason: "" }), key()]), /redate_reason_required/);
    await fn("accounting_integration_event_command('a','fin',$1,'redate',$2::jsonb,$3,'t')", [o.id, JSON.stringify({ postingDate: today, reason: "Prior period closed; post in current period per accountant" }), key()]);
    await process();
    const after = await ev(`invoice_issued:${old}`);
    const j = await one<{ entry_date: string }>("SELECT entry_date::text FROM accounting_journals WHERE id=$1", [after.journal_id]);
    assert.deepEqual([after.status, after.effective_date, after.posting_date, j.entry_date], ["posted", priorDay, today, today], "source date kept, posting moved forward and recorded");
    assert.deepEqual(await q("SELECT code,debit::text,credit::text FROM accounting_trial_balance('a',$1::date)", [closed.end_date]), tbBefore, "closed-period balances unchanged");
    const rc = await recon("ledger");
    assert.equal(rc["receivables:USD"].status, "explained", "the USD invoice is reported, explained by its unposted event");
    assert.equal(n(rc["receivables:USD"].ledger), 0);
    assert.equal(rc["receivables:UGX"].status, "explained", "the blocked tech invoice explains the UGX difference");
    assert.equal(n(rc["receivables:UGX"].unposted), 90000);
    const prior = await recon("ledger", closed.end_date);
    assert.equal(prior["receivables:UGX"].status, "explained", "as at the closed period end, the redated invoice is a timing difference");
  });

  await check("expenses: approval alone posts nothing; cash-basis disbursement posts the expense once; voids reverse", async () => {
    const e = await fn("expense_save('a','req',$1::jsonb,'t')", [JSON.stringify({ key: key(), division: "painting", category: "Transport", description: "Site trip", purpose: "Deliver paint to site", currency: "UGX", netAmount: "50000", incurredOn: today, projectId: S(12) })]);
    await fn("expense_command('a','req',$1,'submit',1,'',$2,'t')", [e.id, key()]);
    await fn("expense_command('a','acct',$1,'approve',2,'',$2,'t')", [e.id, key()]);
    await process();
    const appr = await ev(`expense_approved:${e.id}`);
    assert.deepEqual([appr.status, appr.journal_id, appr.resolution_note], ["no_effect", null, "no_recognition_policy"], "approval is authorization only");
    const d1 = await fn("expense_disburse('a','fin',$1::jsonb,'t')", [JSON.stringify({ key: key(), expenseId: e.id, version: 3, amount: "30000", currency: "UGX", method: "cash", paidOn: today, responsibleStaffId: S(1) })]);
    const d2 = await fn("expense_disburse('a','fin',$1::jsonb,'t')", [JSON.stringify({ key: key(), expenseId: e.id, version: 4, amount: "20000", currency: "UGX", method: "cash", paidOn: today, responsibleStaffId: S(1) })]);
    await process();
    assert.equal(await balance("6990"), 50000, "expense recognized on payment (cash basis), once");
    assert.equal(await balance("2110"), 0, "no payable was created");
    await fn("expense_disbursement_command('a','acct',$1,'void',$2::jsonb,'t')", [d2.id, JSON.stringify({ key: key(), note: "Duplicate cash entry" })]);
    await fn("expense_disbursement_command('a','rec',$1,'reconcile',$2::jsonb,'t')", [d1.id, JSON.stringify({ key: key(), statementReference: "PETTY-0042" })]);
    await process();
    assert.equal((await ev(`disbursement_voided:${d2.id}`)).status, "posted");
    assert.equal(await balance("6990"), 30000);
    assert.equal((await ev(`disbursement_reconciled:${d1.id}`)).status, "no_effect", "reconciliation is evidence; no mapping, no entry");
    assert.equal((await recon("ledger"))["disbursements:UGX"].status, "matched");
  });

  await check("accrual recognition (when explicitly approved): payable on approval, settled on payment, never double-counted", async () => {
    await mapping("expense_approved", { category: "materials" }, [line("debit", "5100", "total"), line("credit", "2110", "total")]);
    const e = await fn("expense_save('a','req',$1::jsonb,'t')", [JSON.stringify({ key: key(), division: "painting", category: "Materials", description: "Paint", purpose: "Paint for P-2", currency: "UGX", netAmount: "200000", incurredOn: today, supplierName: "Paint Co" })]);
    await fn("expense_command('a','req',$1,'submit',1,'',$2,'t')", [e.id, key()]);
    await fn("expense_command('a','acct',$1,'approve',2,'',$2,'t')", [e.id, key()]);
    await fn("expense_disburse('a','fin',$1::jsonb,'t')", [JSON.stringify({ key: key(), expenseId: e.id, version: 3, amount: "150000", currency: "UGX", method: "cash", paidOn: today, responsibleStaffId: S(1) })]);
    await process();
    assert.equal(await balance("5100"), 200000, "expense recognized once, on approval");
    assert.equal(await balance("2110"), -50000, "remaining supplier obligation");
    assert.equal(await balance("6990"), 30000, "the cash-basis mapping was not used for this disbursement");
    const rc = await recon("ledger");
    assert.deepEqual([n(rc["payables:UGX"].operational), n(rc["payables:UGX"].ledger), rc["payables:UGX"].status], [50000, 50000, "matched"]);
  });

  await check("posting controls hold for direct SQL: no system journal, reversal or event edit outside the worker", async () => {
    await assert.rejects(db.query("INSERT INTO accounting_journals(organization_id,journal_type,entry_date,description,prepared_by_id,idempotency_key,source_type,source_id,source_event) VALUES('a','system',$1,'forged',$2,$3,'invoice_issued',$4,$5)", [today, S(1), key(), inv1, `invoice_issued:${inv1}`]), /automatic_posting_disabled/);
    const posted = await ev(`invoice_issued:${inv1}`);
    await assert.rejects(fn("accounting_journal_reverse('a','acct',$1,$2::jsonb,'t')", [posted.journal_id, JSON.stringify({ key: key(), reason: "Manual reversal attempt" })]), /system_journal_reversal_denied/, "system entries are corrected through their source document");
    await assert.rejects(db.query("UPDATE accounting_journals SET description='x' WHERE id=$1", [posted.journal_id]), /posted_journal_immutable/);
    await assert.rejects(db.query("UPDATE accounting_integration_events SET status='pending' WHERE id=$1", [posted.id]), /integration_event_immutable|integration_event_final/);
    await assert.rejects(db.query("DELETE FROM accounting_integration_events WHERE id=$1", [posted.id]), /integration_event_immutable/);
    await assert.rejects(db.query("UPDATE accounting_integration_attempts SET note='x'"), /accounting_history_immutable/);
    // Even inside a worker-flagged transaction, a second journal for the same source event is impossible.
    await db.exec("BEGIN");
    await db.exec("SELECT set_config('calacot.accounting_integration','on',true)");
    await assert.rejects(db.query("INSERT INTO accounting_journals(organization_id,journal_type,entry_date,description,prepared_by_id,idempotency_key,source_type,source_id,source_event) VALUES('a','system',$1,'dup',$2,$3,'invoice_issued',$4,$5)", [today, S(1), key(), inv1, `invoice_issued:${inv1}`]), /unique|duplicate/i);
    await db.exec("ROLLBACK");
    await assert.rejects(process("nobody"), /staff_mirror_required/, "only active staff can run the worker");
    await assert.rejects(fn("accounting_integration_event_command('a','fin',$1,'retry','{}'::jsonb,$2,'t')", [posted.id, key()]), /integration_event_not_blocked/, "posted events cannot be re-queued");
  });

  await check("crash before commit: rolled back work leaves the event pending with no journal; the retry posts it once", async () => {
    const inv = await issueInvoice({ project: S(11), total: "45000" });
    const before = await systemJournals();
    await db.exec("BEGIN");
    await db.query("SELECT accounting_integration_process('a','fin',10,'crashing-worker','t')");
    assert.equal(await systemJournals(), before + 1, "posted inside the open transaction");
    await db.exec("ROLLBACK"); // the worker dies before COMMIT
    assert.equal(await systemJournals(), before);
    const e = await ev(`invoice_issued:${inv}`);
    assert.deepEqual([e.status, e.attempts, e.journal_id], ["pending", 0, null]);
    await process();
    await process();
    assert.equal(await systemJournals(), before + 1);
    assert.equal(n((await one<{ c: number }>("SELECT count(*)::int c FROM accounting_journals WHERE source_event=$1", [`invoice_issued:${inv}`])).c), 1);
  });

  await check("capture failures never block business transactions and are recovered by backfill", async () => {
    await db.exec(`CREATE FUNCTION test_fail_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.amount = 33333 THEN RAISE EXCEPTION 'injected_capture_fault'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_fail_capture BEFORE INSERT ON accounting_integration_events FOR EACH ROW EXECUTE FUNCTION test_fail_capture();`);
    const inv = await issueInvoice({ project: S(11), total: "33333" });
    assert.equal((await one<{ status: string }>("SELECT status FROM invoices WHERE id=$1", [inv])).status, "issued", "the invoice was issued anyway");
    const f = await one<Record<string, unknown>>("SELECT * FROM accounting_integration_capture_failures WHERE source_id=$1", [inv]);
    assert.deepEqual([f.event_type, f.error_code, f.resolved_at], ["invoice_issued", "injected_capture_fault", null]);
    let rc = await recon("ledger");
    assert.equal(rc["receivables:UGX"].status, "unexplained", "an uncaptured record is an unexplained difference, never balanced away");
    await db.exec("DROP TRIGGER test_fail_capture ON accounting_integration_events; DROP FUNCTION test_fail_capture();");
    const b = await fn("accounting_integration_backfill('a','fin',$1,'t')", [key()]);
    assert.equal(b.created, 1);
    assert.equal((await one<{ resolved_at: string | null }>("SELECT resolved_at FROM accounting_integration_capture_failures WHERE source_id=$1", [inv])).resolved_at !== null, true);
    rc = await recon("ledger");
    assert.equal(rc["receivables:UGX"].status, "explained");
    await process();
    assert.equal((await ev(`invoice_issued:${inv}`)).status, "posted");
    assert.equal(n(rc["receivables:UGX"].unposted) - 33333, 90000, "only the tech invoice remains unposted");
    const ledger = await one<{ d: string; c: string }>("SELECT sum(total_debit)::text d,sum(total_credit)::text c FROM accounting_journals WHERE organization_id='a' AND status='posted'");
    assert.equal(ledger.d, ledger.c, "every posted journal is balanced");
    const auto = await q("SELECT 1 FROM accounting_journals WHERE organization_id='a' AND journal_type='manual'");
    assert.equal(auto.length, 0, "no balancing journal was ever created");
  });

  await check("cross-organization isolation", async () => {
    const r = await fn("accounting_integration_stage('b')");
    assert.equal(r, "disabled");
    const other = await one<{ id: string }>("SELECT id FROM accounting_integration_events WHERE organization_id='a' AND status='blocked' LIMIT 1");
    await assert.rejects(fn("accounting_integration_event_command('b','other',$1,'retry','{}'::jsonb,$2,'t')", [other.id, key()]), /integration_event_unavailable/);
    await assert.rejects(fn("accounting_integration_event_command('b','fin',$1,'retry','{}'::jsonb,$2,'t')", [other.id, key()]), /staff_mirror_required/);
    await assert.rejects(process("other", "b"), /integration_disabled/);
    await issueInvoice({ org: "b", client: S(20), project: S(21), total: "1000" });
    assert.equal((await q("SELECT 1 FROM accounting_integration_events WHERE organization_id='b'")).length, 0, "org b is disabled, so nothing is captured for it");
    assert.equal((await q("SELECT * FROM accounting_integration_reconciliation('b',$1::date,'ledger')", [today])).length, 0);
  });

  await check("every captured event ended in a journal, a recorded no-effect decision, or a visible exception", async () => {
    const rows = await q<{ status: string; c: number }>("SELECT status,count(*)::int c FROM accounting_integration_events WHERE organization_id='a' GROUP BY status ORDER BY status");
    const by = Object.fromEntries(rows.map((r) => [r.status, r.c]));
    assert.equal(by.pending ?? 0, 0);
    assert.equal(by.failed ?? 0, 0);
    const blocked = await q<{ last_error_code: string }>("SELECT last_error_code FROM accounting_integration_events WHERE organization_id='a' AND status='blocked' ORDER BY last_error_code");
    assert.deepEqual(blocked.map((b) => b.last_error_code), ["fx_policy_unapproved", "mapping_account_missing"]);
    const unbalanced = await q(`SELECT j.id FROM accounting_journals j JOIN accounting_journal_lines l ON l.journal_id=j.id WHERE j.organization_id='a' AND j.status='posted'
      GROUP BY j.id HAVING sum(l.debit)<>sum(l.credit)`);
    assert.equal(unbalanced.length, 0);
    const orphans = await q(`SELECT j.id FROM accounting_journals j WHERE j.organization_id='a' AND j.journal_type IN ('system','reversal')
      AND NOT EXISTS (SELECT 1 FROM accounting_integration_events e WHERE e.journal_id=j.id)`);
    assert.equal(orphans.length, 0, "every automatic journal traces to exactly one source event");
    console.log("  event outcomes:", JSON.stringify(by));
  });

  console.log(`Accounting integration database checks passed (${passed.length}).`);
} finally {
  await db.close();
}
