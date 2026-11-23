"use server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { financeMutation, type FinanceResult } from "@/lib/finance/context";
import type { Permission } from "@/lib/sales/permissions";
import { expireAdminData } from "@/lib/cache-tags";
import { ledgerAmount } from "@/lib/accounting/format";
import { adjustmentKinds, registrationStatuses, ruleKinds, taxTypes } from "./catalog";

/*
 * Phase 2D tax commands. Validate, then run inside financeMutation (live Clerk re-check of the named
 * permission, same origin, rate limit, active staff) and call one database function (one transaction).
 * Nothing here files a return with URA or initiates a payment: it records evidence of what happened.
 */

const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
const fields = (data: FormData) => Object.fromEntries([...data.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
const invalid = (message: string): FinanceResult => ({ ok: false, message });
const uuidOrEmpty = z.union([z.uuid(), z.literal("")]).default("");
const money = z.string().trim().regex(/^\d{1,15}(\.\d{1,2})?$/);
const date = z.iso.date();
type Result = { result: Record<string, unknown> };

async function run(permission: Permission, call: (org: string, actor: string, correlation: string) => ReturnType<typeof sql>, done: (r: Record<string, unknown>) => FinanceResult) {
  return financeMutation(permission, async (ctx, correlation) => {
    const r = await db.execute<Result>(sql`SELECT ${call(ctx.organizationId, ctx.actor, correlation)} AS result`);
    revalidatePath("/admin/accounting", "layout");
    expireAdminData();
    return done(r.rows[0].result);
  });
}
const parseJson = <T,>(raw: string, schema: z.ZodType<T>): T | null => { try { return schema.parse(JSON.parse(raw)); } catch { return null; } };

// ---------------------------------------------------------------------------------------------
// Rules and obligations (policy)
// ---------------------------------------------------------------------------------------------

const ruleInput = z.object({ key: z.uuid(), ruleCode: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{2,59}$/), ruleKind: z.enum(ruleKinds), description: z.string().trim().min(5).max(500),
  parameters: z.string().max(5000), effectiveFrom: date, effectiveTo: z.union([date, z.literal("")]).default(""), legalBasis: z.string().trim().min(5).max(1000), evidenceDocumentId: z.uuid() });
export async function proposeTaxRule(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = ruleInput.safeParse(fields(data));
  if (!p.success) return invalid("Complete every field: rule code, type, description, parameters, effective date, legal basis and evidence.");
  const parameters = parseJson(p.data.parameters, z.record(z.string(), z.unknown()));
  if (!parameters) return invalid("Parameters must be valid JSON, for example {\"rate\": \"0.3\"}.");
  return run("tax_policy_manage", (org, actor, c) => sql`tax_rule_propose(${org},${actor},${json({ ...p.data, parameters })},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already proposed." : `Version ${r.version} proposed. A different person with tax approval authority must approve it before it is used.` }));
}

const decisionInput = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject", "retire"]), note: z.string().trim().max(2000).default(""), key: z.uuid() });
export async function decideTaxRule(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = decisionInput.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if (v.decision !== "approve" && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return run("tax_approve", (org, actor, c) => sql`tax_rule_decide(${org},${actor},${v.id}::uuid,${v.decision},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : `Rule ${r.status}.` }));
}

const deadlineSchema = z.array(z.object({ event: z.string().regex(/^[a-z][a-z_]{2,39}$/), label: z.string().trim().min(3).max(120), anchor: z.enum(["period_end", "year_start"]),
  monthsOffset: z.number().int().min(-12).max(24), day: z.union([z.literal("last"), z.number().int().min(1).max(31)]), filing: z.boolean(), payment: z.boolean() })).max(20);
const obligationInput = z.object({
  key: z.uuid(), code: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{2,39}$/), taxType: z.enum(taxTypes), name: z.string().trim().min(3).max(120),
  registrationStatus: z.enum(registrationStatuses), taxpayerName: z.string().trim().min(2).max(200), taxpayerTin: z.string().trim().max(20).default(""),
  effectiveFrom: date, effectiveTo: z.union([date, z.literal("")]).default(""), legalBasis: z.string().trim().min(5).max(1000),
  periodBasis: z.enum(["accounting_year", "calendar_month", "calendar_quarter"]), filingFrequency: z.enum(["annual", "semi_annual", "quarterly", "monthly", "none"]),
  deadlineRules: z.string().max(10000).default("[]"), calculationRuleCode: z.string().trim().toLowerCase().max(60).default(""),
  expenseAccountId: uuidOrEmpty, liabilityAccountId: uuidOrEmpty, prepaymentAccountId: uuidOrEmpty, processingEnabled: z.enum(["true", "false"]).default("false"),
  evidenceDocumentId: uuidOrEmpty, note: z.string().trim().max(2000).default(""),
});
export async function proposeTaxObligation(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = obligationInput.safeParse(fields(data));
  if (!p.success) return invalid("Check the obligation: code, type, name, status, taxpayer, dates, legal basis and frequency.");
  const v = p.data;
  const deadlineRules = parseJson(v.deadlineRules, deadlineSchema);
  if (!deadlineRules) return invalid("Check the deadlines: each needs an event, label, anchor, month offset and day.");
  const payload = { ...v, deadlineRules, processingEnabled: v.processingEnabled === "true", accounts: { expense: v.expenseAccountId, liability: v.liabilityAccountId, prepayment: v.prepaymentAccountId } };
  return run("tax_policy_manage", (org, actor, c) => sql`tax_obligation_propose(${org},${actor},${json(payload)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already proposed." : `Version ${r.version} proposed. It has no effect until a different person with tax approval authority approves it.` }));
}
export async function decideTaxObligation(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = decisionInput.safeParse(fields(data));
  if (!p.success || p.data.decision === "retire") return invalid("Refresh the page and try again.");
  const v = p.data;
  if (v.decision === "reject" && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return run("tax_approve", (org, actor, c) => sql`tax_obligation_decide(${org},${actor},${v.id}::uuid,${v.decision},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : v.decision === "approve" ? "Obligation version approved and now current." : "Rejected." }));
}

// ---------------------------------------------------------------------------------------------
// Income tax computations
// ---------------------------------------------------------------------------------------------

const createInput = z.object({ key: z.uuid(), obligationCode: z.string().max(40), fiscalYear: z.string().regex(/^\d{4}$/), kind: z.enum(["provisional", "final", "amended"]),
  estimatedProfit: z.string().trim().max(20).default(""), note: z.string().trim().max(2000).default("") });
export async function createComputation(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = createInput.safeParse(fields(data));
  if (!p.success) return invalid("Choose the obligation, year and kind.");
  return run("tax_compute", (org, actor, c) => sql`income_tax_computation_create(${org},${actor},${json(p.data)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already created." : "Computation started from the posted ledger." }));
}

const lineSchema = z.array(z.object({ kind: z.enum(adjustmentKinds), description: z.string().trim().min(3).max(300), amount: money, evidenceDocumentId: uuidOrEmpty })).max(100);
const creditSchema = z.array(z.object({ kind: z.enum(["withholding_credit", "foreign_tax_credit", "other_credit"]), certificateReference: z.string().trim().min(1).max(100),
  counterparty: z.string().trim().max(200).default(""), amount: money, evidenceDocumentId: z.uuid() })).max(100);
const saveInput = z.object({ id: z.uuid(), key: z.uuid(), version: z.string().regex(/^\d{1,9}$/), estimatedProfit: z.string().trim().max(20).default(""),
  lossBroughtForward: z.union([money, z.literal("")]).default(""), lossEvidenceDocumentId: uuidOrEmpty, adjustments: z.string().max(100000), credits: z.string().max(100000) });
export async function saveComputation(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = saveInput.safeParse(fields(data));
  if (!p.success) return invalid("Check the amounts (positive, at most two decimals).");
  const adjustments = parseJson(p.data.adjustments, lineSchema), credits = parseJson(p.data.credits, creditSchema);
  if (!adjustments || !credits) return invalid("Check each adjustment and credit: type, description, positive amount, and evidence for credits.");
  const v = p.data;
  return run("tax_compute", (org, actor, c) => sql`income_tax_computation_save(${org},${actor},${v.id}::uuid,${json({ ...v, version: Number(v.version), adjustments, credits })},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already saved." : "Schedules saved." }));
}

const importInput = z.object({ id: z.uuid(), key: z.uuid() });
export async function importSchedules(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = importInput.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  return run("tax_compute", (org, actor, c) => sql`income_tax_import_schedules(${org},${actor},${p.data.id}::uuid,${p.data.key},${c})`,
    (r) => {
      const missing = (r.assetsWithoutRule as string[] | undefined) ?? [];
      return { ok: true, id: p.data.id, message: r.already ? "Already imported." : `Imported: depreciation add-back ${ledgerAmount(String(r.depreciationAddBack))}, capital allowances ${ledgerAmount(String(r.capitalAllowances))}.${missing.length ? ` No approved capital-allowance rule for: ${missing.join(", ")}.` : ""}` };
    });
}

const commandInput = z.object({ id: z.uuid(), command: z.enum(["submit", "return", "approve", "reject"]), version: z.string().regex(/^\d{1,9}$/), note: z.string().trim().max(2000).default(""), key: z.uuid() });
export async function computationCommand(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = commandInput.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if ((v.command === "return" || v.command === "reject") && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return run(v.command === "submit" ? "tax_compute" : "tax_approve", (org, actor, c) => sql`income_tax_computation_command(${org},${actor},${v.id}::uuid,${v.command},${Number(v.version)},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : { submit: "Submitted. A different person must review and approve it.", return: "Returned to the preparer.", approve: "Approved. Nothing is posted until a provision journal is prepared and approved.", reject: "Rejected." }[v.command] }));
}

const provisionInput = z.object({ id: z.uuid(), key: z.uuid(), entryDate: z.union([date, z.literal("")]).default("") });
export async function prepareProvision(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = provisionInput.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  return run("tax_compute", (org, actor, c) => sql`income_tax_provision_prepare(${org},${actor},${p.data.id}::uuid,${json({ key: p.data.key, entryDate: p.data.entryDate })},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already prepared." : `Provision journal of ${ledgerAmount(String(r.amount))} prepared. A different person must approve and post it.` }));
}

// ---------------------------------------------------------------------------------------------
// Filings, assessments and payments (records of what happened; never submissions or transfers)
// ---------------------------------------------------------------------------------------------

const filingInput = z.object({ key: z.uuid(), obligationCode: z.string().max(40), fiscalYear: z.string().regex(/^\d{4}$/), kind: z.enum(["provisional_return", "final_return", "amended_return", "other_return"]),
  computationId: uuidOrEmpty, filedOn: date, filingReference: z.string().trim().min(1).max(100), acknowledgementReference: z.string().trim().max(100).default(""), evidenceDocumentId: z.uuid() });
export async function recordFiling(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = filingInput.safeParse(fields(data));
  if (!p.success) return invalid("Enter the year, return type, filing date, reference and the acknowledgement evidence.");
  return run("tax_payment_record", (org, actor, c) => sql`tax_filing_record(${org},${actor},${json(p.data)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already recorded." : "Filing recorded. Recording a filing does not record a payment." }));
}

const assessmentInput = z.object({ key: z.uuid(), obligationCode: z.string().max(40), fiscalYear: z.string().regex(/^\d{4}$/),
  kind: z.enum(["self_assessment", "original", "additional", "amended", "objection_decision", "penalty", "interest"]), assessmentReference: z.string().trim().min(1).max(100),
  assessedOn: date, amount: money, supersedesId: uuidOrEmpty, evidenceDocumentId: z.uuid(), note: z.string().trim().max(2000).default("") });
export async function recordAssessment(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = assessmentInput.safeParse(fields(data));
  if (!p.success) return invalid("Enter the year, type, reference, date, amount and the assessment notice.");
  return run("tax_payment_record", (org, actor, c) => sql`tax_assessment_record(${org},${actor},${json(p.data)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already recorded." : "Assessment recorded." }));
}

const paymentInput = z.object({ key: z.uuid(), obligationCode: z.string().max(40), fiscalYear: z.string().regex(/^\d{4}$/), kind: z.enum(["provisional_instalment", "final_balance", "assessment", "penalty", "interest"]),
  amount: money, paidOn: date, prn: z.string().trim().min(4).max(40), bankingAccountId: z.uuid(), evidenceDocumentId: z.uuid() });
export async function recordTaxPayment(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = paymentInput.safeParse(fields(data));
  if (!p.success) return invalid("Enter the year, type, amount, date, PRN, paying account and the payment evidence.");
  return run("tax_payment_record", (org, actor, c) => sql`tax_payment_record(${org},${actor},${json(p.data)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already recorded." : "Payment recorded and its journal prepared. A different person must approve and post it; it then reconciles with the bank statement like any payment." }));
}

const linkInput = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject", "cancel", "reverse"]), note: z.string().trim().max(2000).default(""), key: z.uuid() });
/** Decide a tax journal (provision or payment). Asset journals are decided in lib/assets/actions.ts. */
export async function decideTaxJournal(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = linkInput.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if (v.decision !== "approve" && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return financeMutation(v.decision === "cancel" ? "tax_compute" : "tax_approve", async (ctx, correlation) => {
    const purpose = (await db.execute<{ purpose: string }>(sql`SELECT purpose FROM ledger_source_links WHERE organization_id=${ctx.organizationId} AND id=${v.id}::uuid`)).rows[0]?.purpose;
    if (purpose !== "tax_provision" && purpose !== "tax_payment") return invalid("This journal is unavailable.");
    const r = (await db.execute<Result>(sql`SELECT ledger_link_decide(${ctx.organizationId},${ctx.actor},${v.id}::uuid,${v.decision},${v.note},${v.key},${correlation}) AS result`)).rows[0].result;
    revalidatePath("/admin/accounting", "layout"); expireAdminData();
    return { ok: true, id: v.id, message: r.already ? "Already recorded." : { approve: `Approved and posted as ${String(r.number)}.`, reject: "Rejected. Nothing was posted.", cancel: "Cancelled.", reverse: "Reversed by a new posted journal." }[v.decision] };
  });
}
