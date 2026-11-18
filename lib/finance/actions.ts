"use server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { financeMutation, type FinanceResult } from "./context";
import { disbursementMethods } from "./options";

const amount = z.string().trim().regex(/^\d{1,15}(\.\d{1,2})?$/, "invalid_amount");
const optionalUuid = z.union([z.uuid(), z.literal("")]).default("");
const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
const fields = (data: FormData) => Object.fromEntries([...data.entries()].filter(([, v]) => typeof v === "string"));
const invalid = (message: string): FinanceResult => ({ ok: false, message });
function refresh(expenseId?: string, projectId?: string) {
  revalidatePath("/admin/expenses", "layout");
  revalidatePath("/admin/financial-reports");
  if (expenseId) revalidatePath(`/admin/expenses/${expenseId}`);
  if (projectId) revalidatePath(`/admin/projects/${projectId}`);
}

const expenseInput = z.object({
  id: optionalUuid,
  version: z.string().regex(/^\d{1,9}$/).optional(),
  key: z.uuid(),
  division: z.enum(["estates", "architecture", "painting", "interiors", "tech"]),
  projectId: optionalUuid,
  category: z.string().trim().min(1).max(100),
  supplierId: optionalUuid,
  supplierName: z.string().trim().max(200).default(""),
  description: z.string().trim().min(1).max(500),
  purpose: z.string().trim().min(5).max(4000),
  currency: z.enum(["UGX", "USD"]),
  netAmount: amount,
  taxAmount: z.union([amount, z.literal("")]).default(""),
  incurredOn: z.iso.date(),
  supplierInvoiceReference: z.string().trim().max(200).default(""),
});

/** Creates a draft or saves corrections to the requester's own draft/returned request. */
export async function saveExpense(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = expenseInput.safeParse(fields(data));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    const labels: Record<string, string> = { purpose: "Explain the business purpose (at least 5 characters).", netAmount: "Enter the amount before tax, using at most two decimal places.", taxAmount: "Enter a valid tax amount or leave it empty.", incurredOn: "Enter the expense date.", description: "Enter a short description.", category: "Enter a category." };
    return invalid(labels[field] ?? "Check the highlighted expense details and try again.");
  }
  const p = parsed.data;
  if (p.id && !p.version) return invalid("Refresh the page before saving.");
  return financeMutation("expenses_create", async (ctx, correlation) => {
    const r = await db.execute<{ result: { id: string; already: boolean } }>(sql`SELECT expense_save(${ctx.organizationId},${ctx.actor},${json({ ...p, id: p.id || null, version: p.version ? Number(p.version) : null })},${correlation}) AS result`);
    const id = r.rows[0].result.id;
    refresh(id, p.projectId || undefined);
    return { ok: true, id, message: p.id ? "Corrections saved. Submit the request when it is ready for review." : "Draft saved. Attach receipts, then submit it for review." };
  });
}

const commandInput = z.object({
  expenseId: z.uuid(),
  command: z.enum(["submit", "withdraw", "cancel", "approve", "return", "reject"]),
  version: z.string().regex(/^\d{1,9}$/),
  note: z.string().max(4000).default(""),
  key: z.uuid(),
});
const commandPermission = { submit: "expenses_submit", withdraw: "expenses_create", cancel: "expenses_create", approve: "expenses_approve", return: "expenses_review", reject: "expenses_review" } as const;
const commandMessage = { submit: "Submitted for review.", withdraw: "Returned to draft. You can edit and resubmit it.", cancel: "Request cancelled.", approve: "Approved. No money has been disbursed; finance records payments separately.", return: "Returned to the requester for correction.", reject: "Request rejected." } as const;

/** Submit/withdraw/cancel (requester) and approve/return/reject (reviewer) with version checks. */
export async function expenseCommand(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = commandInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Refresh the page and try again.");
  const p = parsed.data;
  if (["return", "reject"].includes(p.command) && p.note.trim().length < 5) return invalid("Give a reason (at least 5 characters) when returning or rejecting a request.");
  return financeMutation(commandPermission[p.command], async (ctx, correlation) => {
    const r = await db.execute<{ result: { id: string; already: boolean } }>(sql`SELECT expense_command(${ctx.organizationId},${ctx.actor},${p.expenseId}::uuid,${p.command},${Number(p.version)},${p.note},${p.key},${correlation}) AS result`);
    const project = await db.execute<{ project_id: string | null }>(sql`SELECT project_id FROM expenses WHERE id=${p.expenseId}::uuid AND organization_id=${ctx.organizationId}`);
    refresh(p.expenseId, project.rows[0]?.project_id ?? undefined);
    return { ok: true, id: p.expenseId, message: r.rows[0].result.already ? "Already recorded." : commandMessage[p.command] };
  });
}

const disbursementInput = z.object({
  expenseId: z.uuid(),
  version: z.string().regex(/^\d{1,9}$/),
  key: z.uuid(),
  amount,
  currency: z.enum(["UGX", "USD"]),
  method: z.enum(disbursementMethods),
  reference: z.string().trim().max(200).default(""),
  sourceAccountId: optionalUuid,
  paidOn: z.iso.date(),
  responsibleStaffId: z.uuid(),
  evidenceDocumentId: optionalUuid,
  notes: z.string().trim().max(2000).default(""),
});

/** Records a manual disbursement. Does not move money and is not a verified bank settlement. */
export async function recordDisbursement(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = disbursementInput.safeParse(fields(data));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    const labels: Record<string, string> = { amount: "Enter a positive amount with at most two decimal places.", paidOn: "Enter the payment date.", responsibleStaffId: "Select the employee responsible for the payment.", method: "Select a payment method." };
    return invalid(labels[field] ?? "Check the disbursement details and try again.");
  }
  const p = parsed.data;
  if (p.method !== "cash" && !p.reference.replace(/[^A-Za-z0-9]/g, "")) return invalid("Enter the bank, mobile-money or cheque transaction reference.");
  if (["bank_transfer", "mobile_money", "cheque"].includes(p.method) && !p.sourceAccountId) return invalid("Select the verified company account the payment was made from.");
  return financeMutation("expenses_disburse", async (ctx, correlation) => {
    const r = await db.execute<{ result: { id: string; status: string; already: boolean } }>(sql`SELECT expense_disburse(${ctx.organizationId},${ctx.actor},${json({ ...p, version: Number(p.version) })},${correlation}) AS result`);
    const project = await db.execute<{ project_id: string | null }>(sql`SELECT project_id FROM expenses WHERE id=${p.expenseId}::uuid AND organization_id=${ctx.organizationId}`);
    refresh(p.expenseId, project.rows[0]?.project_id ?? undefined);
    const result = r.rows[0].result;
    return { ok: true, id: result.id, message: result.already ? "This disbursement was already recorded." : result.status === "paid" ? "Disbursement recorded. The expense is now fully paid and awaits reconciliation." : "Partial disbursement recorded." };
  });
}

const disbursementCommandInput = z.object({
  disbursementId: z.uuid(),
  command: z.enum(["void", "reconcile"]),
  key: z.uuid(),
  note: z.string().max(2000).default(""),
  statementReference: z.string().trim().max(200).default(""),
});

/** Voids an unreconciled disbursement, or reconciles it (by someone other than the recorder). */
export async function disbursementCommand(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = disbursementCommandInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Refresh the page and try again.");
  const p = parsed.data;
  if (p.command === "void" && p.note.trim().length < 5) return invalid("Give a reason (at least 5 characters) for voiding this disbursement.");
  if (p.command === "reconcile" && !p.statementReference) return invalid("Enter the statement line or reference used to reconcile this payment.");
  return financeMutation(p.command === "void" ? "expenses_disburse" : "expenses_reconcile", async (ctx, correlation) => {
    const r = await db.execute<{ result: { already: boolean } }>(sql`SELECT expense_disbursement_command(${ctx.organizationId},${ctx.actor},${p.disbursementId}::uuid,${p.command},${json(p)},${correlation}) AS result`);
    const project = await db.execute<{ id: string; project_id: string | null }>(sql`SELECT e.id,e.project_id FROM expense_disbursements d JOIN expenses e ON e.id=d.expense_id AND e.organization_id=d.organization_id WHERE d.id=${p.disbursementId}::uuid AND d.organization_id=${ctx.organizationId}`);
    refresh(project.rows[0]?.id, project.rows[0]?.project_id ?? undefined);
    return { ok: true, id: p.disbursementId, message: r.rows[0].result.already ? "Already recorded." : p.command === "void" ? "Disbursement voided. The approved amount is outstanding again." : "Disbursement marked as reconciled." };
  });
}

const accountInput = z.object({
  key: z.uuid(),
  method: z.enum(["bank_transfer", "mobile_money", "cheque"]),
  provider: z.string().trim().min(1).max(100),
  accountIdentifier: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
  currency: z.enum(["UGX", "USD"]),
  verificationNote: z.string().trim().min(5).max(2000),
});

/** Registers a company source account as verified by the acting account manager. */
export async function saveFinanceAccount(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = accountInput.safeParse(fields(data));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return invalid(field === "verificationNote" ? "Record how the account was verified (at least 5 characters)." : "Check the method, provider, account number, label and currency.");
  }
  return financeMutation("finance_accounts_manage", async (ctx, correlation) => {
    const r = await db.execute<{ result: { id: string; already: boolean } }>(sql`SELECT finance_account_save(${ctx.organizationId},${ctx.actor},${json(parsed.data)},${correlation}) AS result`);
    revalidatePath("/admin/payment-accounts");
    return { ok: true, id: r.rows[0].result.id, message: r.rows[0].result.already ? "Already registered." : "Account registered as verified." };
  });
}

export async function setFinanceAccountStatus(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = z.object({ accountId: z.uuid(), status: z.enum(["active", "inactive"]) }).safeParse(fields(data));
  if (!parsed.success) return invalid("Refresh the page and try again.");
  return financeMutation("finance_accounts_manage", async (ctx, correlation) => {
    await db.execute(sql`SELECT finance_account_status(${ctx.organizationId},${ctx.actor},${parsed.data.accountId}::uuid,${parsed.data.status},${correlation})`);
    revalidatePath("/admin/payment-accounts");
    return { ok: true, id: parsed.data.accountId, message: parsed.data.status === "active" ? "Account reactivated." : "Account deactivated. It can no longer be used for new disbursements." };
  });
}
