"use server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { financeMutation, type FinanceResult } from "@/lib/finance/context";
import type { Permission } from "@/lib/sales/permissions";
import { expireAdminData } from "@/lib/cache-tags";
import { ledgerAmount } from "@/lib/accounting/format";
import { bankingKinds, categories, cashKinds } from "./catalog";

/*
 * Phase 2C banking and cash commands. Each action validates its input, then runs inside
 * financeMutation (live Clerk re-check of the named permission, same-origin check, rate limit, active
 * staff mirror) and calls exactly one database function, which is one PostgreSQL transaction.
 * Record-level rules (two people, availability, locks, periods, immutability) are in the database.
 */

const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
const fields = (data: FormData) => Object.fromEntries([...data.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
const invalid = (message: string): FinanceResult => ({ ok: false, message });
const money = z.string().trim().regex(/^\d{1,15}(\.\d{1,2})?$/);
const signedMoney = z.string().trim().regex(/^-?\d{1,15}(\.\d{1,2})?$/);
const date = z.iso.date();
const note = z.string().trim().max(2000).default("");
type Result = { result: Record<string, unknown> };

function refresh() {
  revalidatePath("/admin/accounting", "layout");
  expireAdminData();
}
async function run(permission: Permission, call: (org: string, actor: string, correlation: string) => ReturnType<typeof sql>, done: (r: Record<string, unknown>) => FinanceResult) {
  return financeMutation(permission, async (ctx, correlation) => {
    const r = await db.execute<Result>(sql`SELECT ${call(ctx.organizationId, ctx.actor, correlation)} AS result`);
    refresh();
    return done(r.rows[0].result);
  });
}

// ---------------------------------------------------------------------------------------------
// Accounts, ledger mappings and category accounts
// ---------------------------------------------------------------------------------------------

const registerInput = z.object({
  key: z.uuid(), kind: z.enum(bankingKinds), financeAccountId: z.union([z.uuid(), z.literal("")]).default(""),
  label: z.string().trim().max(120).default(""), currency: z.enum(["", "UGX", "USD"]).default(""),
  custodianId: z.union([z.uuid(), z.literal("")]).default(""), floatAmount: z.union([money, z.literal("")]).default(""),
});
export async function registerBankingAccount(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = registerInput.safeParse(fields(data));
  if (!p.success) return invalid("Check the account type, name, currency and float.");
  const v = p.data;
  if ((v.kind === "bank" || v.kind === "mobile_money") && !v.financeAccountId) return invalid("Choose the verified payment account.");
  if (!(v.kind === "bank" || v.kind === "mobile_money") && (!v.label || !v.currency)) return invalid("Enter a name and choose the currency.");
  if ((v.kind === "cash" || v.kind === "petty_cash") && !v.custodianId) return invalid("Choose the employee who holds this cash.");
  const payload = { key: v.key, kind: v.kind, financeAccountId: v.financeAccountId || null, label: v.label || null, currency: v.currency || null, custodianId: v.custodianId || null, floatAmount: v.floatAmount || null };
  return run("banking_manage", (org, actor, c) => sql`banking_account_register(${org},${actor},${json(payload)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already registered." : "Account registered. Propose its ledger account next; it cannot be used until a second person approves the mapping." }));
}

const accountCommandInput = z.object({ id: z.uuid(), command: z.enum(["update", "deactivate", "reactivate"]), version: z.string().regex(/^\d{1,9}$/), key: z.uuid(), note: z.string().trim().min(5).max(2000),
  custodianId: z.union([z.uuid(), z.literal("")]).default(""), floatAmount: z.union([money, z.literal("")]).default("") });
export async function bankingAccountCommand(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = accountCommandInput.safeParse(fields(data));
  if (!p.success) return invalid("Explain the change (at least 5 characters) and check the values.");
  const v = p.data;
  return run("banking_manage", (org, actor, c) => sql`banking_account_command(${org},${actor},${v.id}::uuid,${v.command},${Number(v.version)},${json({ note: v.note, custodianId: v.custodianId || null, floatAmount: v.floatAmount || null })},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : { update: "Account updated.", deactivate: "Account deactivated. Its history is kept.", reactivate: "Account reactivated." }[v.command] }));
}

const mappingInput = z.object({ key: z.uuid(), bankingAccountId: z.uuid(), ledgerAccountId: z.uuid(), note: z.string().trim().min(5).max(2000) });
export async function proposeBankMapping(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = mappingInput.safeParse(fields(data));
  if (!p.success) return invalid("Choose the ledger account and explain how it was verified (at least 5 characters).");
  const v = p.data;
  return run("banking_manage", (org, actor, c) => sql`bank_mapping_propose(${org},${actor},${v.bankingAccountId}::uuid,${v.ledgerAccountId}::uuid,${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already proposed." : "Mapping proposed. A different person with policy-approval authority must approve it." }));
}

const decisionInput = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject", "retire"]), note, key: z.uuid() });
export async function decideBankMapping(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = decisionInput.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if (v.decision !== "approve" && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return run("accounting_policy_approve", (org, actor, c) => sql`bank_mapping_decide(${org},${actor},${v.id}::uuid,${v.decision},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : { approve: "Mapping approved. The account can now be reconciled and used for cash transactions.", reject: "Mapping rejected.", retire: "Mapping retired." }[v.decision] }));
}

const categoryInput = z.object({ key: z.uuid(), category: z.enum(categories), ledgerAccountId: z.uuid(), note: z.string().trim().min(5).max(2000) });
export async function proposeCategoryAccount(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = categoryInput.safeParse(fields(data));
  if (!p.success) return invalid("Choose the category and ledger account, and record the basis (at least 5 characters).");
  return run("banking_manage", (org, actor, c) => sql`banking_category_propose(${org},${actor},${json(p.data)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already proposed." : "Proposed. A different person with policy-approval authority must approve it." }));
}
export async function decideCategoryAccount(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = decisionInput.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if (v.decision !== "approve" && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return run("accounting_policy_approve", (org, actor, c) => sql`banking_category_decide(${org},${actor},${v.id}::uuid,${v.decision},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : { approve: "Approved.", reject: "Rejected.", retire: "Retired." }[v.decision] }));
}

// ---------------------------------------------------------------------------------------------
// Statement review and matching
// ---------------------------------------------------------------------------------------------

const reviewInput = z.object({ id: z.uuid(), decision: z.enum(["accept", "duplicate"]), note: z.string().trim().min(5).max(2000), key: z.uuid() });
export async function reviewStatementLine(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = reviewInput.safeParse(fields(data));
  if (!p.success) return invalid("Explain your decision (at least 5 characters).");
  const v = p.data;
  return run("banking_match", (org, actor, c) => sql`bank_statement_line_review(${org},${actor},${v.id}::uuid,${v.decision},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : v.decision === "accept" ? "Accepted as a genuine bank transaction." : "Marked as a duplicate. It is kept for the record but never counted." }));
}

const itemInput = z.object({ statementLineId: z.uuid().optional(), journalLineId: z.uuid().optional(), amount: signedMoney }).refine((i) => !!i.statementLineId !== !!i.journalLineId);
const matchInput = z.object({ key: z.uuid(), bankingAccountId: z.uuid(), kind: z.enum(["match", "statement_offset", "ledger_offset", "opening_balance"]), note, items: z.string().max(100000) });
export async function createMatch(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = matchInput.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  let items: z.infer<typeof itemInput>[];
  try { items = z.array(itemInput).min(1).max(200).parse(JSON.parse(p.data.items)); } catch { return invalid("Select the bank lines and ledger entries to match."); }
  const payload = { ...p.data, items };
  return run("banking_match", (org, actor, c) => sql`bank_match_create(${org},${actor},${json(payload)},${c})`,
    (r) => {
      const residuals = ((r.residuals as { residual: string }[] | undefined) ?? []).filter((x) => x.residual !== "0.00");
      return { ok: true, id: String(r.id), message: r.already ? "Already matched." : r.partial ? `Matched in part. Still unmatched: ${residuals.map((x) => ledgerAmount(x.residual)).join(", ")}.` : "Matched." };
    });
}

const cancelInput = z.object({ id: z.uuid(), reason: z.string().trim().min(5).max(2000), key: z.uuid() });
export async function cancelMatch(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = cancelInput.safeParse(fields(data));
  if (!p.success) return invalid("Give a reason (at least 5 characters).");
  const v = p.data;
  return run("banking_match", (org, actor, c) => sql`bank_match_cancel(${org},${actor},${v.id}::uuid,${v.reason},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already cancelled." : "Match cancelled. The lines are unmatched again; the ledger is unchanged." }));
}

// ---------------------------------------------------------------------------------------------
// Reconciliation periods
// ---------------------------------------------------------------------------------------------

const recInput = z.object({ key: z.uuid(), bankingAccountId: z.uuid(), periodStart: date, periodEnd: date, openingStatementBalance: signedMoney, closingStatementBalance: signedMoney });
export async function createReconciliation(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = recInput.safeParse(fields(data));
  if (!p.success) return invalid("Enter the period dates and the opening and closing balances shown on the statement.");
  return run("banking_reconcile", (org, actor, c) => sql`bank_reconciliation_create(${org},${actor},${json(p.data)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already created." : "Reconciliation started." }));
}

const recUpdateInput = z.object({ id: z.uuid(), key: z.uuid(), version: z.string().regex(/^\d{1,9}$/), periodEnd: date, closingStatementBalance: signedMoney });
export async function updateReconciliation(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = recUpdateInput.safeParse(fields(data));
  if (!p.success) return invalid("Enter the period end and the closing statement balance.");
  const v = p.data;
  return run("banking_reconcile", (org, actor, c) => sql`bank_reconciliation_update(${org},${actor},${v.id}::uuid,${json({ key: v.key, version: Number(v.version), periodEnd: v.periodEnd, closingStatementBalance: v.closingStatementBalance })},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already saved." : "Saved." }));
}

const recCommandInput = z.object({ id: z.uuid(), command: z.enum(["submit", "return", "finalize", "reopen"]), version: z.string().regex(/^\d{1,9}$/), note, key: z.uuid() });
const recPermission = { submit: "banking_reconcile", return: "banking_reconcile_approve", finalize: "banking_reconcile_approve", reopen: "banking_reconcile_reopen" } as const;
export async function reconciliationCommand(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = recCommandInput.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if ((v.command === "return" || v.command === "reopen") && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return run(recPermission[v.command], (org, actor, c) => sql`bank_reconciliation_command(${org},${actor},${v.id}::uuid,${v.command},${Number(v.version)},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : {
      submit: "Submitted. A different authorized person must review and finalize it.", return: "Returned to the preparer.",
      finalize: "Reconciliation finalized. Its figures are preserved and the period is locked.", reopen: "Reopened. The earlier finalized figures are preserved in the history.",
    }[v.command] }));
}

// ---------------------------------------------------------------------------------------------
// Cash transactions, decisions and counts
// ---------------------------------------------------------------------------------------------

const cashInput = z.object({
  key: z.uuid(), kind: z.enum(cashKinds), date: z.union([date, z.literal("")]).default(""), amount: z.union([money, z.literal("")]).default(""),
  description: z.string().trim().max(500).default(""), reference: z.string().trim().max(100).default(""),
  bankingAccountId: z.union([z.uuid(), z.literal("")]).default(""), toAccountId: z.union([z.uuid(), z.literal("")]).default(""),
  counterAccountId: z.union([z.uuid(), z.literal("")]).default(""), division: z.string().max(20).default(""), projectId: z.union([z.uuid(), z.literal("")]).default(""),
  staffId: z.union([z.uuid(), z.literal("")]).default(""), advanceId: z.union([z.uuid(), z.literal("")]).default(""), expenses: z.string().max(20000).default("[]"),
  cashReturned: z.union([money, z.literal("")]).default(""), cashCountId: z.union([z.uuid(), z.literal("")]).default(""),
  statementLineId: z.union([z.uuid(), z.literal("")]).default(""), category: z.string().max(40).default(""), evidenceId: z.union([z.uuid(), z.literal("")]).default(""),
});
const expenseLine = z.object({ accountId: z.uuid(), amount: money, description: z.string().trim().max(300).default("") });
const cashMessages: Record<string, string> = {
  receipt: "Receipt prepared and submitted.", payment: "Payment prepared and submitted.", transfer: "Transfer prepared and submitted.", advance: "Advance prepared and submitted.",
  accountability: "Accountability prepared and submitted.", count_adjustment: "Adjustment prepared and submitted.", bank_adjustment: "Adjustment prepared and submitted.",
};
export async function createCashTransaction(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = cashInput.safeParse(fields(data));
  if (!p.success) return invalid("Check the date, amount, accounts and description.");
  const v = p.data;
  let expenses: z.infer<typeof expenseLine>[] = [];
  try { expenses = z.array(expenseLine).max(20).parse(JSON.parse(v.expenses)); } catch { return invalid("Check each spending line: account and amount."); }
  const nul = (s: string) => s || null;
  const payload = { ...v, expenses, date: nul(v.date), amount: nul(v.amount), description: nul(v.description), reference: nul(v.reference), bankingAccountId: nul(v.bankingAccountId), toAccountId: nul(v.toAccountId),
    counterAccountId: nul(v.counterAccountId), division: nul(v.division), projectId: nul(v.projectId), staffId: nul(v.staffId), advanceId: nul(v.advanceId), cashReturned: nul(v.cashReturned),
    cashCountId: nul(v.cashCountId), statementLineId: nul(v.statementLineId), category: nul(v.category), evidenceId: nul(v.evidenceId) };
  // Classifying a bank statement exception is a reconciliation task; everything else is a cash task.
  return run(v.kind === "bank_adjustment" ? "banking_match" : "cash_create", (org, actor, c) => sql`cash_transaction_create(${org},${actor},${json(payload)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already submitted." : `${cashMessages[v.kind]} A different authorized person must approve it before it is posted.` }));
}

const cashDecisionInput = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject", "cancel"]), note, key: z.uuid() });
export async function decideCashTransaction(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = cashDecisionInput.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if (v.decision !== "approve" && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return run(v.decision === "cancel" ? "cash_create" : "cash_approve", (org, actor, c) => sql`cash_transaction_decide(${org},${actor},${v.id}::uuid,${v.decision},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : { approve: `Approved and posted as ${String(r.number)}.`, reject: "Rejected. Nothing was posted.", cancel: "Cancelled. Nothing was posted." }[v.decision] }));
}

const countInput = z.object({ key: z.uuid(), bankingAccountId: z.uuid(), countDate: date, countedAmount: money, witnessId: z.union([z.uuid(), z.literal("")]).default(""),
  evidenceId: z.union([z.uuid(), z.literal("")]).default(""), note: z.string().trim().max(2000).default(""), denominations: z.string().max(5000).default("") });
const denomination = z.object({ value: z.number().positive().max(1e9), count: z.number().int().min(0).max(1e6) });
export async function recordCashCount(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = countInput.safeParse(fields(data));
  if (!p.success) return invalid("Choose the cash account, the count date and the amount counted.");
  const v = p.data;
  let denominations: z.infer<typeof denomination>[] | null = null;
  if (v.denominations) { try { denominations = z.array(denomination).max(40).parse(JSON.parse(v.denominations)); } catch { return invalid("Check the denominations."); } }
  const payload = { ...v, witnessId: v.witnessId || null, evidenceId: v.evidenceId || null, denominations };
  return run("cash_create", (org, actor, c) => sql`cash_count_record(${org},${actor},${json(payload)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already recorded."
      : r.difference === "0.00" ? `Count recorded. It agrees with the book balance (${ledgerAmount(String(r.bookBalance))}).`
      : `Count recorded. Difference ${ledgerAmount(String(r.difference))} against the book balance of ${ledgerAmount(String(r.bookBalance))}. Prepare an adjustment with evidence for a second person to approve.${Number(r.pendingJournals) ? ` Note: ${r.pendingJournals} transaction(s) for this account are not posted yet.` : ""}` }));
}
