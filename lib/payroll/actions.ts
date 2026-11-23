"use server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { financeMutation, type FinanceResult } from "@/lib/finance/context";
import type { Permission } from "@/lib/sales/permissions";
import { expireAdminData } from "@/lib/cache-tags";
import { ledgerAmount } from "@/lib/accounting/format";

/* Phase 2D payroll foundation commands: set-up (payroll_admin), two-person approval (payroll_approve), simulation only. */

const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
const fields = (data: FormData) => Object.fromEntries([...data.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
const invalid = (message: string): FinanceResult => ({ ok: false, message });
const uuidOrEmpty = z.union([z.uuid(), z.literal("")]).default("");
type Result = { result: Record<string, unknown> };
async function run(permission: Permission, call: (org: string, actor: string, correlation: string) => ReturnType<typeof sql>, done: (r: Record<string, unknown>) => FinanceResult) {
  return financeMutation(permission, async (ctx, correlation) => {
    const r = await db.execute<Result>(sql`SELECT ${call(ctx.organizationId, ctx.actor, correlation)} AS result`);
    revalidatePath("/admin/accounting/payroll"); expireAdminData();
    return done(r.rows[0].result);
  });
}

const profileInput = z.object({ key: z.uuid(), staffId: uuidOrEmpty, personName: z.string().trim().min(2).max(160), engagementType: z.enum(["employee", "contractor"]),
  employeeNumber: z.string().trim().regex(/^[A-Za-z0-9-]{1,30}$/), startDate: z.iso.date(), endDate: z.union([z.iso.date(), z.literal("")]).default(""),
  tin: z.string().trim().max(20).default(""), nssfNumber: z.string().trim().max(30).default(""), paymentMethod: z.enum(["bank", "mobile_money", "cash"]), paymentAccount: z.string().trim().max(40).default("") });
export async function saveProfile(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = profileInput.safeParse(fields(data));
  if (!p.success) return invalid("Check the profile: name, engagement, employee number, start date and payment method.");
  return run("payroll_admin", (org, actor, c) => sql`payroll_profile_save(${org},${actor},${json(p.data)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already saved." : "Profile proposed. A different person with payroll approval must approve it. Only the last four characters of the payment account are kept." }));
}

const componentInput = z.object({ key: z.uuid(), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_]{1,29}$/), name: z.string().trim().min(2).max(120),
  kind: z.enum(["basic_salary", "allowance", "bonus", "deduction", "employer_contribution"]), taxable: z.enum(["true", "false"]), statutory: z.enum(["", "paye", "nssf_employee", "nssf_employer"]).default(""),
  expenseAccountId: uuidOrEmpty, liabilityAccountId: uuidOrEmpty });
export async function proposeComponent(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = componentInput.safeParse(fields(data));
  if (!p.success) return invalid("Check the component code, name and type.");
  return run("payroll_admin", (org, actor, c) => sql`payroll_component_propose(${org},${actor},${json({ ...p.data, taxable: p.data.taxable === "true" })},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already proposed." : "Component proposed for approval." }));
}

const structureInput = z.object({ key: z.uuid(), profileId: z.uuid(), effectiveFrom: z.iso.date(), currency: z.enum(["UGX", "USD"]), lines: z.string().max(10000) });
const lines = z.array(z.object({ componentCode: z.string().trim().toUpperCase().max(30), amount: z.string().regex(/^\d{1,15}(\.\d{1,2})?$/) })).min(1).max(30);
export async function proposeStructure(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = structureInput.safeParse(fields(data));
  if (!p.success) return invalid("Choose the employee, effective date and currency.");
  let parsed: z.infer<typeof lines>;
  try { parsed = lines.parse(JSON.parse(p.data.lines)); } catch { return invalid("Add at least one component line with an amount."); }
  return run("payroll_admin", (org, actor, c) => sql`payroll_structure_propose(${org},${actor},${json({ ...p.data, lines: parsed })},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already proposed." : "Salary structure proposed for approval." }));
}

const decideInput = z.object({ id: z.uuid(), entity: z.enum(["payroll_profile", "payroll_component", "payroll_structure"]), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(2000).default(""), key: z.uuid() });
export async function decidePayroll(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = decideInput.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if (v.decision === "reject" && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return run("payroll_approve", (org, actor, c) => sql`payroll_decide(${org},${actor},${v.entity},${v.id}::uuid,${v.decision},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : `Recorded: ${String(r.status)}.` }));
}

const simulateInput = z.object({ key: z.uuid(), periodStart: z.iso.date(), periodEnd: z.iso.date() });
export async function simulateRun(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = simulateInput.safeParse(fields(data));
  if (!p.success) return invalid("Choose the period.");
  return run("payroll_admin", (org, actor, c) => sql`payroll_run_simulate(${org},${actor},${json(p.data)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already simulated." : `Simulation for ${r.employees} employee(s): gross ${ledgerAmount(String(r.gross))}. Statutory deductions are not computed; nothing is paid or posted.` }));
}
