// Phase 2A: pure accounting engine checks (no database, no network). The engine must agree with
// the database rules; scripts/verify-accounting-db.mts checks the database side.
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  convertMinor, fromMinor, isValidClassification, normalBalanceAmount, normalBalanceFor, reverseLines,
  summarizeLines, toMinor, trialBalanceSides, validateJournal, type JournalLineInput,
} from "../lib/accounting/engine";
import { chartSeedPayload, proposedChart, validateChart } from "../lib/accounting/chart";
import { buildSourceJournal, exampleRules, sourceEvents, sourceTypes, validateRuleDefinition } from "../lib/accounting/source-events";

const passed: string[] = [];
const check = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed.push(name); };
const L = (debit: string, credit: string, currency = "UGX", exchangeRate?: string): JournalLineInput => ({ accountId: "a", debit, credit, currency, exchangeRate });

await check("decimal money: parse, format, limits, no floats", () => {
  assert.equal(toMinor("1234.5"), BigInt(123450));
  assert.equal(toMinor("0.01"), BigInt(1));
  assert.equal(fromMinor(BigInt(123450)), "1234.50");
  assert.equal(fromMinor(BigInt(-5)), "-0.05");
  assert.equal(fromMinor(toMinor("999999999999999.99")), "999999999999999.99");
  for (const bad of ["1.001", "-1", "1e3", "", " ", "abc", "1,000", "9999999999999999"]) assert.throws(() => toMinor(bad), /invalid_amount/, bad);
  // 0.1 + 0.2 is exact in minor units.
  assert.equal(fromMinor(toMinor("0.1") + toMinor("0.2")), "0.30");
});

await check("normal balances and classifications", () => {
  assert.equal(normalBalanceFor("asset"), "debit");
  assert.equal(normalBalanceFor("asset", true), "credit");
  assert.equal(normalBalanceFor("income"), "credit");
  assert.equal(normalBalanceFor("income", true), "debit");
  assert.equal(normalBalanceFor("other_expense"), "debit");
  assert.equal(isValidClassification("asset", "current_asset", true), true);
  assert.equal(isValidClassification("asset", "operating_revenue", true), false);
  assert.equal(isValidClassification("asset", null, false), true);
  assert.equal(isValidClassification("asset", null, true), false);
  assert.equal(normalBalanceAmount("credit", BigInt(100), BigInt(250)), BigInt(150));
  assert.deepEqual(trialBalanceSides(BigInt(100), BigInt(250)), { debit: BigInt(0), credit: BigInt(150) });
});

await check("conversion rounds exactly like PostgreSQL round(numeric, 2)", async () => {
  const pg = new PGlite();
  try {
    const cases: [string, string][] = [["100.05", "3712.4567"], ["0.01", "0.5"], ["0.01", "0.4999999999"], ["12345.67", "3800"], ["1", "0.0000000001"], ["999999.99", "1.5"], ["2.5", "1"]];
    for (const [amount, rate] of cases) {
      const db = (await pg.query<{ r: string }>("SELECT round($1::numeric * $2::numeric, 2)::text AS r", [amount, rate])).rows[0].r;
      assert.equal(fromMinor(convertMinor(toMinor(amount), rate)), db, `${amount} x ${rate}`);
    }
  } finally { await pg.close(); }
  assert.throws(() => convertMinor(BigInt(1), "0"), /invalid_exchange_rate/);
  assert.throws(() => convertMinor(BigInt(1), "-2"), /invalid_exchange_rate/);
});

await check("balance summary: per currency, never mixed; invalid lines flagged", () => {
  const ok = summarizeLines([L("100", ""), L("", "60"), L("", "40")]);
  assert.equal(ok.balanced, true);
  assert.equal(ok.functional.debit, BigInt(10000));
  const off = summarizeLines([L("100", ""), L("", "99.99")]);
  assert.equal(off.balanced, false);
  assert.equal(off.functional.difference, BigInt(1));
  const mixed = summarizeLines([L("10", "", "USD", "3700"), L("", "37000")]);
  assert.equal(mixed.byCurrency.length, 2);
  assert.equal(mixed.functional.difference, BigInt(0), "functional amounts agree");
  assert.equal(mixed.balanced, false, "but each currency must also balance on its own");
  assert.deepEqual(summarizeLines([L("5", "5"), L("", ""), L("x", "")]).invalidLines, [0, 1, 2]);
});

await check("validation stages: draft lenient, submit balanced, post single functional currency", () => {
  assert.deepEqual(validateJournal([L("100", "")], { stage: "draft" }), []);
  assert.deepEqual(validateJournal([L("100", "")], { stage: "submit" }).sort(), ["journal_lines_required", "journal_unbalanced"]);
  assert.deepEqual(validateJournal([L("100", ""), L("", "100")], { stage: "submit" }), []);
  assert.deepEqual(validateJournal([L("100", "", "USD"), L("", "100", "USD")], { stage: "post", functionalCurrency: "UGX" }).sort(), ["exchange_rate_required", "multi_currency_posting_disabled"]);
  assert.deepEqual(validateJournal([L("100", "", "USD", "3700"), L("", "100", "USD", "3700")], { stage: "post", functionalCurrency: "UGX" }), ["multi_currency_posting_disabled"]);
  assert.deepEqual(validateJournal([L("100", "", "EUR"), L("", "100", "EUR")], { stage: "submit" }), ["invalid_currency"]);
  assert.deepEqual(validateJournal([], { stage: "draft" }), ["journal_lines_required"]);
});

await check("reversal lines swap sides and keep everything else", () => {
  const lines = [{ ...L("100", ""), description: "x", division: "tech" }, L("", "100")];
  const r = reverseLines(lines);
  assert.deepEqual(r.map((l) => [l.debit, l.credit]), [["", "100"], ["100", ""]]);
  assert.equal(r[0].division, "tech");
  assert.equal(summarizeLines([...lines, ...r]).functional.debit, BigInt(20000));
});

await check("proposed chart: valid, complete hierarchy, divisions are dimensions not accounts", () => {
  assert.deepEqual(validateChart(proposedChart), []);
  assert.deepEqual(validateChart([{ code: "1100", name: "x", accountType: "asset", reportingClass: "current_asset", parentCode: "1000" }]), ["1100: parent 1000 must appear earlier"]);
  assert.match(validateChart([...proposedChart, { code: "1110", name: "Dup", accountType: "asset", reportingClass: "current_asset" }]).join(), /duplicate/);
  const types = new Set(proposedChart.map((a) => a.accountType));
  assert.equal(types.size, 8, "all eight account types are covered");
  for (const d of ["Painting", "Architecture", "Interiors", "Estates", "Technology"]) assert.ok(!proposedChart.some((a) => a.name === d), `${d} is a dimension, not an account`);
  assert.ok(proposedChart.filter((a) => a.manualPostingAllowed === false).every((a) => ["1200", "2110", "2140"].includes(a.code)));
  assert.equal(chartSeedPayload().length, proposedChart.length);
});

await check("source mapping: deterministic preview, identity, balance and division routing", () => {
  assert.deepEqual(sourceEvents.map((e) => e.type).sort(), [...sourceTypes].sort());
  assert.equal(sourceEvents.find((e) => e.type === "expense_approved")?.stage, "approval", "approval is not recognition");
  const ev = { sourceType: "invoice_issued" as const, sourceId: "inv-1", eventKey: "issue", date: "2026-11-01", currency: "UGX", division: "painting", description: "CAL-I-2026-000001", amounts: { total: "1180000.00", subtotal: "1000000.00", discount: "0", tax: "180000.00" } };
  const r = buildSourceJournal({ sourceType: "invoice_issued", definition: exampleRules.invoice_issued! }, ev);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.identity, { sourceType: "invoice_issued", sourceId: "inv-1", sourceEvent: "issue" });
    assert.deepEqual(r.lines.map((l) => [l.accountCode, l.debit, l.credit]), [["1200", "1180000.00", "0.00"], ["4200", "0.00", "1180000.00"]]);
  }
  assert.deepEqual(buildSourceJournal({ sourceType: "invoice_issued", definition: exampleRules.invoice_issued! }, ev), r, "same input, same output");
  const noDiv = buildSourceJournal({ sourceType: "invoice_issued", definition: exampleRules.invoice_issued! }, { ...ev, division: null });
  assert.ok(noDiv.ok && noDiv.lines[1].accountCode === "4100", "fallback account");
  assert.deepEqual(buildSourceJournal({ sourceType: "payment_allocated", definition: exampleRules.invoice_issued! }, ev), { ok: false, errors: ["source_type_mismatch"] });
  const unbalanced = { schema: 1 as const, lines: [{ side: "debit" as const, account: { code: "1200" }, amount: "total" }, { side: "credit" as const, account: { code: "4100" }, amount: "subtotal" }] };
  assert.deepEqual(buildSourceJournal({ sourceType: "invoice_issued", definition: unbalanced }, ev), { ok: false, errors: ["journal_unbalanced"] });
  assert.deepEqual(validateRuleDefinition("payment_confirmed", { schema: 1, lines: [{ side: "debit", account: { code: "1120" }, amount: "total" }, { side: "credit", account: { code: "2140" }, amount: "amount" }] }), ["line_1_amount_total"]);
  assert.deepEqual(buildSourceJournal({ sourceType: "invoice_issued", definition: exampleRules.invoice_issued! }, { ...ev, amounts: { ...ev.amounts, total: "1.001" } }), { ok: false, errors: ["invalid_amount_total"] });
});

console.log(passed.map((p) => `PASS ${p}`).join("\n"));
console.log(`Accounting engine checks passed (${passed.length}).`);
