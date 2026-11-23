"use server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { financeMutation, type FinanceResult } from "@/lib/finance/context";
import type { Permission } from "@/lib/sales/permissions";
import { expireAdminData } from "@/lib/cache-tags";
import { exceptableChecks, statementLines, type StatementLine } from "@/lib/accounting/statements";

/*
 * Phase 2E commands. Validate, then run inside financeMutation (live Clerk re-check of the named
 * permission, same origin, rate limit, active staff) and call exactly one database function (one
 * transaction). Statement figures are always computed by the database from the posted ledger; no
 * figure is ever accepted from the browser.
 */

const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
const fields = (data: FormData) => Object.fromEntries([...data.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
const invalid = (message: string): FinanceResult => ({ ok: false, message });
const date = z.iso.date();
const money = z.string().trim().regex(/^\d{1,15}(\.\d{1,2})?$/);
type Result = { result: Record<string, unknown> };

async function run(permission: Permission, call: (org: string, actor: string, correlation: string) => ReturnType<typeof sql>, done: (r: Record<string, unknown>) => FinanceResult) {
  return financeMutation(permission, async (ctx, correlation) => {
    const r = await db.execute<Result>(sql`SELECT ${call(ctx.organizationId, ctx.actor, correlation)} AS result`);
    revalidatePath("/admin/accounting", "layout");
    expireAdminData();
    return done(r.rows[0].result);
  });
}

// ---------------------------------------------------------------------------------------------
// Policies: statement classification, overhead allocation, period-close policy
// ---------------------------------------------------------------------------------------------

/** Form fields line:<accountId>, cf:<accountId>, clearing:<accountId>. Account types come from the database. */
export async function proposeClassificationAction(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const f = fields(data);
  const head = z.object({ key: z.uuid(), retainedEarningsAccountId: z.uuid(), note: z.string().trim().min(5).max(2000) }).safeParse(f);
  if (!head.success) return invalid("Choose the retained earnings account and explain the proposal (at least 5 characters).");
  const mappings: Record<string, { line: StatementLine; cashflow: string | null; clearing: boolean }> = {};
  for (const [k, v] of Object.entries(f)) {
    if (!k.startsWith("line:") || !v) continue;
    const id = k.slice(5);
    if (!z.uuid().safeParse(id).success || !(v in statementLines)) return invalid("A statement line is not recognised. Refresh the page.");
    const cf = f[`cf:${id}`] ?? "";
    if (cf && !["operating", "investing", "financing"].includes(cf)) return invalid("A cash-flow class is not recognised.");
    mappings[id] = { line: v as StatementLine, cashflow: v === "cash_and_bank" ? null : cf || null, clearing: f[`clearing:${id}`] === "on" };
  }
  if (Object.keys(mappings).length === 0) return invalid("Classify at least one account.");
  // The database validates every line against the account type (fs_line_fits) for this organization.
  return run("fs_adjust_prepare", (org, actor, c) => sql`fs_classification_propose(${org},${actor},${json({ ...head.data, mappings })},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already proposed." : `Classification version ${r.version} proposed. A different person with statement approval authority must approve it.` }));
}

const decision = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(2000).default(""), key: z.uuid(), entity: z.enum(["classification", "overhead_policy", "close_policy"]) });
export async function decideFsPolicy(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = decision.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if (v.decision === "reject" && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return run(v.entity === "close_policy" ? "close_approve" : "fs_approve", (org, actor, c) => sql`fs_policy_decide(${org},${actor},${v.entity},${v.id}::uuid,${v.decision},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : `Proposal ${r.status}.` }));
}

const divisions = ["estates", "architecture", "painting", "interiors", "tech"] as const;
export async function proposeOverheadAction(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const f = fields(data);
  const p = z.object({ key: z.uuid(), effectiveFrom: date, note: z.string().trim().min(5).max(2000) }).safeParse(f);
  if (!p.success) return invalid("Give the effective date and a note (at least 5 characters).");
  const shares: Record<string, string> = {};
  for (const d of divisions) {
    const pct = (f[`share:${d}`] ?? "").trim();
    if (!pct) continue;
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(pct) || Number(pct) > 100) return invalid("Shares are percentages between 0 and 100 with at most 2 decimals.");
    if (Number(pct) > 0) shares[d] = (Number(pct) / 100).toFixed(4);
  }
  return run("fs_adjust_prepare", (org, actor, c) => sql`overhead_allocation_propose(${org},${actor},${json({ ...p.data, shares })},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already proposed." : `Allocation policy version ${r.version} proposed for approval.` }));
}

export async function proposeClosePolicyAction(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const f = fields(data);
  const p = z.object({ key: z.uuid(), note: z.string().trim().min(5).max(2000), clearingTolerance: money.default("0"), evidenceItems: z.string().max(3000).default("") }).safeParse(f);
  if (!p.success) return invalid("Explain the policy (at least 5 characters) and give a valid tolerance.");
  const evidenceItems = p.data.evidenceItems.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (evidenceItems.length > 20 || evidenceItems.some((s) => s.length < 3 || s.length > 120)) return invalid("List up to 20 evidence items, one per line, each 3 to 120 characters.");
  const payload = { key: p.data.key, note: p.data.note, clearingTolerance: p.data.clearingTolerance, evidenceItems, requireBankReconciliation: f.requireBankReconciliation === "on", requireCashCount: f.requireCashCount === "on" };
  return run("close_start", (org, actor, c) => sql`period_close_policy_propose(${org},${actor},${json(payload)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already proposed." : `Close policy version ${r.version} proposed. Once approved, periods close only through Period closing.` }));
}

// ---------------------------------------------------------------------------------------------
// Statement sets (snapshots)
// ---------------------------------------------------------------------------------------------

export async function createStatementSet(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ key: z.uuid(), kind: z.enum(["month", "quarter", "year", "custom"]), periodStart: date, periodEnd: date,
    comparativeStart: z.union([date, z.literal("")]).default(""), comparativeEnd: z.union([date, z.literal("")]).default("") }).safeParse(fields(data));
  if (!p.success) return invalid("Choose the statement type and dates.");
  return run("fs_adjust_prepare", (org, actor, c) => sql`fs_statement_set_create(${org},${actor},${json(p.data)},${c})`,
    (r) => {
      const problems = (r.problems as string[] | undefined) ?? [];
      return { ok: true, id: String(r.id), message: r.already ? "Already prepared." : problems.length ? `Draft prepared, but it is provisional (${problems.join(", ").replaceAll("_", " ")}) and cannot be approved.` : "Draft statements prepared from the posted ledger. A different person can now review and approve them." };
    });
}
export async function decideStatementSet(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(2000).default(""), key: z.uuid() }).safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if (v.decision === "reject" && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return run("fs_approve", (org, actor, c) => sql`fs_statement_set_decide(${org},${actor},${v.id}::uuid,${v.decision},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : v.decision === "approve" ? "Statements approved. The snapshot is now permanent." : "Statements rejected." }));
}

// ---------------------------------------------------------------------------------------------
// Adjusting and reversing entries
// ---------------------------------------------------------------------------------------------

const lineSchema = z.object({ accountId: z.uuid(), debit: z.string().default(""), credit: z.string().default(""), description: z.string().max(300).default(""), division: z.string().default(""), projectId: z.string().default("") });
export async function createAdjustment(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const f = fields(data);
  const p = z.object({ key: z.uuid(), kind: z.enum(["accrual", "prepayment", "deferral", "provision", "depreciation", "reclassification", "correction", "prior_period", "other"]),
    entryDate: date, description: z.string().trim().min(3).max(500), reference: z.string().trim().max(100).default(""), reason: z.string().trim().min(10).max(2000),
    evidenceReference: z.string().trim().min(3).max(300), autoReverseOn: z.union([date, z.literal("")]).default(""), replacesJournalId: z.union([z.uuid(), z.literal("")]).default(""),
    lines: z.string().max(50000) }).safeParse(f);
  if (!p.success) return invalid("Complete the adjustment: type, date, description, reason (10+ characters), evidence and lines.");
  let lines: z.infer<typeof lineSchema>[];
  try { lines = z.array(lineSchema).min(2).max(200).parse(JSON.parse(p.data.lines)); } catch { return invalid("Add at least two complete lines."); }
  // Lines are in the functional currency of this organization's approved policy (set by the database).
  const payload = { ...p.data, lines };
  return run("fs_adjust_prepare", (org, actor, c) => sql`fs_adjustment_create(${org},${actor},jsonb_set(${json(payload)}, '{lines}',
      (SELECT coalesce(jsonb_agg(l || jsonb_build_object('currency', coalesce((accounting_policy(${org})).functional_currency, 'UGX'))), '[]'::jsonb) FROM jsonb_array_elements(${json(lines)}) l)),${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already recorded." : "Adjustment submitted for review. A different person must approve and post it." }));
}

export async function adjustmentCommand(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ id: z.uuid(), cmd: z.enum(["approve", "return", "reject", "post"]), version: z.coerce.number().int().positive(), note: z.string().trim().max(2000).default(""), key: z.uuid() }).safeParse({ ...fields(data), cmd: fields(data).decision ?? fields(data).cmd });
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if ((v.cmd === "return" || v.cmd === "reject") && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return run("fs_adjust_review", (org, actor, c) => sql`fs_adjustment_command(${org},${actor},${v.id}::uuid,${v.cmd},${v.version},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : r.status === "posted" ? `Posted as ${String(r.number)}.` : `Adjustment ${String(r.status)}.` }));
}

export async function reverseAdjustment(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ id: z.uuid(), key: z.uuid() }).safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  return run("fs_adjust_prepare", (org, actor, c) => sql`fs_adjustment_reverse(${org},${actor},${p.data.id}::uuid,${p.data.key},${c})`,
    (r) => ({ ok: true, id: p.data.id, message: r.already ? "Already reversed." : `Reversal posted as ${String(r.number)}.` }));
}

// ---------------------------------------------------------------------------------------------
// Period close
// ---------------------------------------------------------------------------------------------

export async function startClose(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ periodId: z.uuid(), key: z.uuid() }).safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  return run("close_start", (org, actor, c) => sql`period_close_start(${org},${actor},${p.data.periodId}::uuid,${p.data.key},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already started." : "Close started. Work through the checklist, record the evidence, then submit for review." }));
}
export async function addCloseEvidence(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ closeId: z.uuid(), key: z.uuid(), item: z.string().trim().min(3).max(120), reference: z.string().trim().min(3).max(300), note: z.string().trim().max(2000).default("") }).safeParse(fields(data));
  if (!p.success) return invalid("Give the evidence item and where it is kept (at least 3 characters each).");
  return run("close_start", (org, actor, c) => sql`period_close_evidence_add(${org},${actor},${p.data.closeId}::uuid,${json(p.data)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already recorded." : "Evidence recorded." }));
}
export async function raiseCloseException(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ closeId: z.uuid(), key: z.uuid(), checkKey: z.enum(exceptableChecks), explanation: z.string().trim().min(20).max(2000) }).safeParse(fields(data));
  if (!p.success) return invalid("Choose the check and explain the exception (at least 20 characters).");
  return run("close_start", (org, actor, c) => sql`period_close_exception_raise(${org},${actor},${p.data.closeId}::uuid,${json(p.data)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already raised." : "Exception raised. A different person with close approval authority must accept or reject it." }));
}
export async function decideCloseException(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject"]), note: z.string().trim().min(5).max(2000), key: z.uuid() }).safeParse(fields(data));
  if (!p.success) return invalid("Give a note (at least 5 characters) for the decision.");
  return run("close_approve", (org, actor, c) => sql`period_close_exception_decide(${org},${actor},${p.data.id}::uuid,${p.data.decision},${p.data.note},${p.data.key},${c})`,
    (r) => ({ ok: true, id: p.data.id, message: r.already ? "Already recorded." : `Exception ${String(r.status)}.` }));
}

export async function assignCloseReviewer(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ id: z.uuid(), reviewerId: z.union([z.uuid(), z.literal("")]).default(""), version: z.coerce.number().int().positive(), key: z.uuid() }).safeParse(fields(data));
  if (!p.success) return invalid("Choose a reviewer.");
  return run("close_start", (org, actor, c) => sql`period_close_assign(${org},${actor},${p.data.id}::uuid,${p.data.reviewerId || null}::uuid,${p.data.version},${p.data.key},${c})`,
    (r) => ({ ok: true, id: p.data.id, message: r.already ? "Already recorded." : p.data.reviewerId ? "Reviewer assigned. Only this person can approve the close." : "Assignment removed." }));
}

const closePermission: Record<string, Permission> = { submit: "close_start", cancel: "close_start", return: "close_approve", approve: "close_approve", reopen: "close_reopen" };
export async function closeCommand(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const f = fields(data);
  const p = z.object({ id: z.uuid(), cmd: z.enum(["submit", "cancel", "return", "approve", "reopen"]), version: z.coerce.number().int().positive(), note: z.string().trim().max(2000).default(""), key: z.uuid() }).safeParse({ ...f, cmd: f.decision ?? f.cmd });
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if (v.cmd === "return" && v.note.length < 5) return invalid("Say what must be fixed (at least 5 characters).");
  if (v.cmd === "reopen" && v.note.length < 10) return invalid("Give the reason for reopening (at least 10 characters).");
  const done: Record<string, string> = { submit: "Close submitted for review.", cancel: "Close cancelled.", return: "Close returned to the preparer.", approve: "Period closed. No further entries can be posted to it.", reopen: "Period reopened. The reason is recorded." };
  return run(closePermission[v.cmd], (org, actor, c) => sql`period_close_command(${org},${actor},${v.id}::uuid,${v.cmd},${v.version},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : done[v.cmd] }));
}

// ---------------------------------------------------------------------------------------------
// Year-end
// ---------------------------------------------------------------------------------------------

export async function prepareYearEnd(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ fiscalYear: z.coerce.number().int().min(2000).max(2200), statementSetId: z.uuid(), key: z.uuid(), note: z.string().trim().max(2000).default("") }).safeParse(fields(data));
  if (!p.success) return invalid("Choose the financial year and its approved annual statements.");
  return run("close_start", (org, actor, c) => sql`year_end_prepare(${org},${actor},${p.data.fiscalYear},${json(p.data)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already prepared." : `Year-end prepared: closing result ${String(r.netResult)} to retained earnings. A different person must approve it.` }));
}
export async function decideYearEnd(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(2000).default(""), key: z.uuid() }).safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  if (p.data.decision === "reject" && p.data.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return run("year_end_approve", (org, actor, c) => sql`year_end_decide(${org},${actor},${p.data.id}::uuid,${p.data.decision},${p.data.note},${p.data.key},${c})`,
    (r) => ({ ok: true, id: p.data.id, message: r.already ? "Already recorded." : p.data.decision === "approve" ? "Year closed: closing entries posted and the final period closed." : "Year-end rejected." }));
}
export async function reopenYearEnd(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ id: z.uuid(), note: z.string().trim().min(10).max(2000), key: z.uuid() }).safeParse(fields(data));
  if (!p.success) return invalid("Give the reason for reopening the year (at least 10 characters).");
  return run("close_reopen", (org, actor, c) => sql`year_end_reopen(${org},${actor},${p.data.id}::uuid,${p.data.note},${p.data.key},${c})`,
    (r) => ({ ok: true, id: p.data.id, message: r.already ? "Already reopened." : "Year reopened: the closing entries were reversed and the final period is open." }));
}
