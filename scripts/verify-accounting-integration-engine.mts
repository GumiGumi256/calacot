// Phase 2B: the client-side catalogue and mapping validator (lib/accounting/integration-catalog.ts)
// must agree exactly with the database (accounting_event_catalog / accounting_mapping_validate in
// drizzle-current/0019_accounting_integration.sql). Runs the SQL functions in a bare in-memory PGlite.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { integrationEvents, validateMapping, guidanceFor, sourceHref, blockGuidance } from "../lib/accounting/integration-catalog";

const db = new PGlite();
const statement = (sqlText: string, name: string) => sqlText.split("--> statement-breakpoint").find((s) => s.includes(`FUNCTION ${name}(`))!;
const passed: string[] = [];
const check = async (name: string, fn: () => Promise<void> | void) => { await fn(); passed.push(name); console.log("PASS", name); };
try {
  const s18 = await readFile("drizzle-current/0018_accounting_foundation.sql", "utf8");
  const s19 = await readFile("drizzle-current/0019_accounting_integration.sql", "utf8");
  await db.exec(statement(s18, "accounting_is_uuid"));
  for (const f of ["accounting_event_catalog", "accounting_mapping_validate", "accounting_integration_blocking_codes"]) await db.exec(statement(s19, f));

  await check("catalogue: every event, amount, condition, reversal and tax flag matches the database", async () => {
    const rows = (await db.query<{ event_type: string; stage: string; requires_mapping: boolean; amount_keys: string[]; condition_keys: string[]; reverses: string | null; taxable: boolean }>("SELECT * FROM accounting_event_catalog()")).rows;
    assert.deepEqual(rows.map((r) => r.event_type), integrationEvents.map((e) => e.type));
    for (const r of rows) {
      const e = integrationEvents.find((x) => x.type === r.event_type)!;
      assert.deepEqual([r.stage, r.requires_mapping, r.amount_keys, r.condition_keys, r.reverses, r.taxable], [e.stage, e.requiresMapping, [...e.amountKeys], [...e.conditionKeys], e.reverses, e.taxable], r.event_type);
    }
  });

  await check("approval and evidence events never require a mapping; recognition, cash and settlement always do", () => {
    for (const e of integrationEvents) assert.equal(e.requiresMapping, ["recognition", "cash", "settlement"].includes(e.stage), e.type);
  });

  await check("mapping validator: TypeScript and SQL agree on valid and invalid definitions", async () => {
    const L = (side: string, account: unknown, amount: string) => ({ side, account, amount });
    const cases: [string, Record<string, unknown>, string, Record<string, unknown>][] = [
      ["invoice_issued", {}, "journal", { lines: [L("debit", { code: "1200" }, "total"), L("credit", { code: "4100" }, "net"), L("credit", { code: "2180" }, "tax")] }],
      ["invoice_issued", { division: "tech", billingKind: "deposit" }, "journal", { lines: [L("debit", { code: "1200" }, "total"), L("credit", { byDivision: { tech: "4600" }, fallback: "4100" }, "total")] }],
      ["expense_approved", { category: "materials" }, "no_entry", {}],
      ["disbursement_recorded", { financeAccountId: "00000000-0000-4000-8000-000000000001", expenseRecognized: "yes" }, "journal", { lines: [L("debit", { code: "2110" }, "amount"), L("credit", { code: "1120-01" }, "amount")] }],
      ["invoice_issued", { colour: "red" }, "journal", { lines: [L("debit", { code: "1200" }, "total"), L("credit", { code: "4100" }, "total")] }],
      ["invoice_issued", { division: "mars" }, "journal", { lines: [L("debit", { code: "1200" }, "total"), L("credit", { code: "4100" }, "total")] }],
      ["invoice_issued", {}, "journal", { lines: [L("debit", { code: "1200" }, "total"), L("debit", { code: "4100" }, "total")] }],
      ["invoice_issued", {}, "journal", { lines: [L("debit", { code: "1200" }, "amount"), L("credit", { code: "4100" }, "amount")] }],
      ["invoice_issued", {}, "journal", { lines: [L("debit", { code: "12" }, "total"), L("credit", { code: "4100" }, "total")] }],
      ["invoice_issued", {}, "journal", { lines: [L("debit", { byDivision: { mars: "4100" } }, "total"), L("credit", { code: "4100" }, "total")] }],
      ["invoice_issued", {}, "journal", { lines: [L("debit", { code: "1200" }, "total"), L("credit", { code: "4100" }, "total")], extra: true }],
      ["invoice_issued", {}, "no_entry", { lines: [] }],
      ["invoice_voided", {}, "journal", { lines: [L("debit", { code: "4100" }, "total"), L("credit", { code: "1200" }, "total")] }],
      ["payment_confirmed", { method: "bitcoin" }, "journal", { lines: [L("debit", { code: "1140" }, "amount"), L("credit", { code: "2140" }, "amount")] }],
      ["disbursement_recorded", { financeAccountId: "nope" }, "journal", { lines: [L("debit", { code: "6990" }, "amount"), L("credit", { code: "1110" }, "amount")] }],
    ];
    for (const [type, conds, treatment, def] of cases) {
      const ts = validateMapping(type, conds, treatment, def as never);
      let sqlCode = "";
      try { await db.query("SELECT accounting_mapping_validate($1,$2::jsonb,$3,$4::jsonb)", [type, JSON.stringify(conds), treatment, JSON.stringify(def)]); }
      catch (e) { sqlCode = (e as Error).message; }
      assert.equal(ts[0] ?? "", sqlCode, `${type} ${JSON.stringify(conds)} ${JSON.stringify(def)}`);
    }
  });

  await check("every blocking code the worker can record has plain-language guidance", async () => {
    const codes = (await db.query<{ c: string[] }>("SELECT accounting_integration_blocking_codes() AS c")).rows[0].c;
    const missing = codes.filter((c) => !blockGuidance[c] && !["integration_disabled", "invalid_mapping_definition"].includes(c));
    assert.deepEqual(missing, []);
    assert.match(guidanceFor("period_closed").resolve, /never|forward|reopen/i);
    assert.match(guidanceFor("something_new").problem, /something_new/);
  });

  await check("source links point at the originating document", () => {
    assert.equal(sourceHref("invoice_issued", "i1", {}), "/admin/invoices/i1");
    assert.equal(sourceHref("payment_allocated", "a1", { invoiceId: "i2" }), "/admin/invoices/i2");
    assert.equal(sourceHref("disbursement_voided", "d1", { expenseId: "e1" }), "/admin/expenses/e1");
    assert.equal(sourceHref("expense_approved", "e2", {}), "/admin/expenses/e2");
  });

  console.log(`Accounting integration engine checks passed (${passed.length}).`);
} finally {
  await db.close();
}
