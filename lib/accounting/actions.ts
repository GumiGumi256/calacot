"use server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { financeMutation, type FinanceResult } from "@/lib/finance/context";
import type { Permission } from "@/lib/sales/permissions";
import { expireAdminData } from "@/lib/cache-tags";
import { chartSeedPayload, proposedChart, validateChart } from "./chart";
import { accountTypes, validateJournal } from "./engine";

/*
 * Accounting commands (Phase 2A). Each action: validates input, then runs inside financeMutation
 * (live Clerk re-check for the named permission, same-origin check, rate limit, staff mirror) and
 * calls exactly one database function, which is one PostgreSQL transaction. Record-level rules
 * (balance, segregation of duties, periods, immutability) are enforced by the database.
 */

const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
const fields = (data: FormData) => Object.fromEntries([...data.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
const invalid = (message: string): FinanceResult => ({ ok: false, message });
const version = z.string().regex(/^\d{1,9}$/);
type Result = { result: Record<string, unknown> };

function refresh(...paths: string[]) {
  revalidatePath("/admin/accounting", "layout");
  for (const p of paths) revalidatePath(p);
  expireAdminData();
}

async function run(permission: Permission, call: (org: string, actor: string, correlation: string) => ReturnType<typeof sql>, done: (r: Record<string, unknown>) => FinanceResult, paths: string[] = []) {
  return financeMutation(permission, async (ctx, correlation) => {
    const r = await db.execute<Result>(sql`SELECT ${call(ctx.organizationId, ctx.actor, correlation)} AS result`);
    refresh(...paths);
    return done(r.rows[0].result);
  });
}

// ---------------------------------------------------------------------------------------------
// Chart of accounts
// ---------------------------------------------------------------------------------------------

const accountInput = z.object({
  id: z.union([z.uuid(), z.literal("")]).default(""),
  version: z.union([version, z.literal("")]).default(""),
  key: z.uuid(),
  code: z.string().trim().toUpperCase().max(20).default(""),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  accountType: z.union([z.enum(accountTypes), z.literal("")]).default(""),
  reportingClass: z.string().max(40).default(""),
  parentId: z.union([z.uuid(), z.literal("")]).default(""),
  isPostable: z.enum(["true", "false"]).default("true"),
  isContra: z.enum(["true", "false"]).default("false"),
  manualPostingAllowed: z.enum(["true", "false"]).default("true"),
  currency: z.enum(["", "UGX", "USD"]).default(""),
});

export async function saveAccount(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = accountInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Check the account code, name and type.");
  const p = parsed.data;
  if (p.id && !p.version) return invalid("Refresh the page before saving.");
  if (!p.id && (!p.code || !p.accountType)) return invalid("Enter an account code and choose a type.");
  const payload = { ...p, id: p.id || null, version: p.version ? Number(p.version) : null, parentId: p.parentId || null, currency: p.currency || null, reportingClass: p.reportingClass || null, code: p.code || null, accountType: p.accountType || null };
  return run("accounting_manage", (org, actor, c) => sql`accounting_account_save(${org},${actor},${json(payload)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already saved." : p.id ? "Account updated." : "Account proposed. Another authorized person must approve it before it can be used." }),
    p.id ? [`/admin/accounting/accounts/${p.id}`] : []);
}

const accountCommandInput = z.object({ accountId: z.uuid(), command: z.enum(["activate", "deactivate", "reactivate"]), version, note: z.string().max(2000).default(""), key: z.uuid() });
const accountCommandPermission = { activate: "accounting_policy_approve", reactivate: "accounting_policy_approve", deactivate: "accounting_manage" } as const;

export async function accountCommand(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = accountCommandInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Refresh the page and try again.");
  const p = parsed.data;
  if (p.command === "deactivate" && p.note.trim().length < 5) return invalid("Give a reason (at least 5 characters) for deactivating the account.");
  return run(accountCommandPermission[p.command], (org, actor, c) => sql`accounting_account_command(${org},${actor},${p.accountId}::uuid,${p.command},${Number(p.version)},${p.note},${p.key},${c})`,
    (r) => ({ ok: true, id: p.accountId, message: r.already ? "Already recorded." : { activate: "Account approved and active.", deactivate: "Account deactivated. Its history is kept.", reactivate: "Account reactivated." }[p.command] }),
    [`/admin/accounting/accounts/${p.accountId}`]);
}

/** Loads the proposed Calacot chart (docs/CALACOT_CHART_OF_ACCOUNTS.md) as PROPOSED accounts. */
export async function loadProposedChart(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const key = z.uuid().safeParse(data.get("key"));
  if (!key.success) return invalid("Refresh the page and try again.");
  if (validateChart(proposedChart).length) return invalid("The proposed chart failed validation. Nothing was loaded.");
  return run("accounting_manage", (org, actor, c) => sql`accounting_chart_seed(${org},${actor},${json(chartSeedPayload())},${key.data},${c})`,
    (r) => ({ ok: true, message: r.already ? "Already loaded." : `${r.inserted} proposed accounts added${Number(r.skipped) ? `, ${r.skipped} existing codes left unchanged` : ""}. They need a second person's approval before use.` }));
}

export async function approveChart(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const key = z.uuid().safeParse(data.get("key"));
  if (!key.success) return invalid("Refresh the page and try again.");
  return run("accounting_policy_approve", (org, actor, c) => sql`accounting_chart_approve(${org},${actor},${key.data},${c})`,
    (r) => ({ ok: true, message: r.already ? "Already recorded." : `${r.activated} accounts approved.${Number(r.stillProposed) ? ` ${r.stillProposed} remain proposed: accounts you proposed yourself (or under them) need someone else's approval.` : ""}` }));
}

// ---------------------------------------------------------------------------------------------
// Policy and exchange rates
// ---------------------------------------------------------------------------------------------

const policyInput = z.object({
  key: z.uuid(),
  functionalCurrency: z.enum(["UGX", "USD"]),
  fiscalYearStartMonth: z.string().regex(/^(1[0-2]|[1-9])$/),
  manualPostingEnabled: z.enum(["true", "false"]),
  note: z.string().trim().min(5).max(2000),
});

export async function proposePolicy(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = policyInput.safeParse(fields(data));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.path[0] === "note" ? "Explain the proposal (at least 5 characters), e.g. who approved it and when." : "Choose the functional currency, the first month of the financial year and the posting setting.");
  return run("accounting_manage", (org, actor, c) => sql`accounting_policy_propose(${org},${actor},${json(parsed.data)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already proposed." : "Policy proposed. A different authorized person must approve it." }));
}

const decisionInput = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject"]), note: z.string().max(2000).default(""), key: z.uuid() });

export async function decidePolicy(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = decisionInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Refresh the page and try again.");
  const p = parsed.data;
  if (p.decision === "reject" && p.note.trim().length < 5) return invalid("Give a reason (at least 5 characters) for rejecting the proposal.");
  return run("accounting_policy_approve", (org, actor, c) => sql`accounting_policy_decide(${org},${actor},${p.id}::uuid,${p.decision},${p.note},${p.key},${c})`,
    (r) => ({ ok: true, message: r.already ? "Already recorded." : p.decision === "approve" ? "Policy approved and now in effect." : "Proposal rejected." }));
}

const rateInput = z.object({
  key: z.uuid(),
  fromCurrency: z.enum(["UGX", "USD"]),
  toCurrency: z.enum(["UGX", "USD"]),
  rate: z.string().trim().regex(/^\d{1,10}(\.\d{1,10})?$/),
  rateDate: z.iso.date(),
  source: z.string().trim().min(3).max(200),
});

export async function proposeRate(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = rateInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Enter a positive rate (up to 10 decimal places), its date and where it came from.");
  if (parsed.data.fromCurrency === parsed.data.toCurrency) return invalid("Choose two different currencies.");
  return run("accounting_manage", (org, actor, c) => sql`accounting_rate_propose(${org},${actor},${json(parsed.data)},${c})`,
    (r) => ({ ok: true, message: r.already ? "Already recorded." : "Rate recorded. A different authorized person must approve it before use." }));
}

export async function decideRate(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = decisionInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Refresh the page and try again.");
  const p = parsed.data;
  if (p.decision === "reject" && p.note.trim().length < 5) return invalid("Give a reason (at least 5 characters) for rejecting the rate.");
  return run("accounting_policy_approve", (org, actor, c) => sql`accounting_rate_decide(${org},${actor},${p.id}::uuid,${p.decision},${p.note},${p.key},${c})`,
    (r) => ({ ok: true, message: r.already ? "Already recorded." : p.decision === "approve" ? "Rate approved." : "Rate rejected." }));
}

// ---------------------------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------------------------

export async function generateFiscalYear(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = z.object({ key: z.uuid(), fiscalYear: z.string().regex(/^20\d{2}$/) }).safeParse(fields(data));
  if (!parsed.success) return invalid("Enter the calendar year in which the financial year starts.");
  const p = parsed.data;
  return run("accounting_manage", (org, actor, c) => sql`accounting_period_generate_year(${org},${actor},${Number(p.fiscalYear)},${p.key},${c})`,
    (r) => ({ ok: true, message: r.already ? "Already created." : `${r.created} monthly periods created.` }));
}

const periodCommandInput = z.object({ periodId: z.uuid(), command: z.enum(["close", "reopen"]), version, note: z.string().max(2000).default(""), key: z.uuid() });

export async function periodCommand(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = periodCommandInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Refresh the page and try again.");
  const p = parsed.data;
  if (p.command === "reopen" && p.note.trim().length < 5) return invalid("Give a reason (at least 5 characters) for reopening the period.");
  return run(p.command === "close" ? "accounting_period_close" : "accounting_period_reopen",
    (org, actor, c) => sql`accounting_period_command(${org},${actor},${p.periodId}::uuid,${p.command},${Number(p.version)},${p.note},${p.key},${c})`,
    (r) => ({ ok: true, message: r.already ? "Already recorded." : p.command === "close" ? "Period closed. Nothing can be posted into it until it is reopened." : "Period reopened." }));
}

// ---------------------------------------------------------------------------------------------
// Journals
// ---------------------------------------------------------------------------------------------

const lineInput = z.object({
  accountId: z.uuid(),
  description: z.string().trim().max(300).default(""),
  debit: z.string().trim().max(20).default(""),
  credit: z.string().trim().max(20).default(""),
  currency: z.enum(["UGX", "USD"]),
  exchangeRateId: z.union([z.uuid(), z.literal("")]).default(""),
  division: z.enum(["", "estates", "architecture", "painting", "interiors", "tech"]).default(""),
  projectId: z.union([z.uuid(), z.literal("")]).default(""),
});
const journalInput = z.object({
  id: z.union([z.uuid(), z.literal("")]).default(""),
  version: z.union([version, z.literal("")]).default(""),
  key: z.uuid(),
  entryDate: z.iso.date(),
  description: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(100).default(""),
  lines: z.array(lineInput).min(1).max(200),
});

export async function saveJournal(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  let lines: unknown;
  try { lines = JSON.parse(String(data.get("lines") ?? "[]")); } catch { return invalid("The journal lines could not be read. Refresh and try again."); }
  const parsed = journalInput.safeParse({ ...fields(data), lines });
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path ?? [];
    if (path[0] === "lines") return invalid(path.length > 2 && path[2] === "accountId" ? `Choose an account on line ${Number(path[1]) + 1}.` : "Add at least one complete line.");
    return invalid(path[0] === "description" ? "Enter a description (up to 500 characters)." : path[0] === "entryDate" ? "Enter the accounting date." : "Check the journal details and try again.");
  }
  const p = parsed.data;
  if (p.id && !p.version) return invalid("Refresh the page before saving.");
  const lineErrors = validateJournal(p.lines.map((l) => ({ ...l, exchangeRate: null })), { stage: "draft" });
  if (lineErrors.includes("invalid_journal_line")) return invalid("Each line needs one positive amount, as either a debit or a credit, with at most two decimal places.");
  const payload = {
    ...p, id: p.id || null, version: p.version ? Number(p.version) : null, reference: p.reference || null,
    lines: p.lines.map((l) => ({ ...l, exchangeRateId: l.exchangeRateId || null, division: l.division || null, projectId: l.projectId || null })),
  };
  return run("accounting_journal_prepare", (org, actor, c) => sql`accounting_journal_save(${org},${actor},${json(payload)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already saved." : "Draft saved. Submit it for approval when it balances." }),
    p.id ? [`/admin/accounting/journals/${p.id}`] : []);
}

const journalCommandInput = z.object({ journalId: z.uuid(), command: z.enum(["submit", "withdraw", "discard", "approve", "return", "reject", "post"]), version, note: z.string().max(2000).default(""), key: z.uuid() });
const journalPermission = {
  submit: "accounting_journal_prepare", withdraw: "accounting_journal_prepare", discard: "accounting_journal_prepare",
  approve: "accounting_journal_approve", return: "accounting_journal_approve", reject: "accounting_journal_approve",
  post: "accounting_journal_post",
} as const;
const journalMessage = {
  submit: "Submitted for approval.", withdraw: "Withdrawn to draft.", discard: "Draft discarded. It stays in the history.",
  approve: "Approved. It is not in the ledger until it is posted.", return: "Returned to the preparer as a draft.", reject: "Journal rejected.",
  post: "Posted to the general ledger.",
} as const;

export async function journalCommand(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = journalCommandInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Refresh the page and try again.");
  const p = parsed.data;
  if (["return", "reject"].includes(p.command) && p.note.trim().length < 5) return invalid("Give a reason (at least 5 characters) when returning or rejecting a journal.");
  return run(journalPermission[p.command], (org, actor, c) => sql`accounting_journal_command(${org},${actor},${p.journalId}::uuid,${p.command},${Number(p.version)},${p.note},${p.key},${c})`,
    (r) => ({ ok: true, id: p.journalId, message: r.already ? "Already recorded." : p.command === "post" ? `Posted as ${r.number}.` : journalMessage[p.command] }),
    [`/admin/accounting/journals/${p.journalId}`]);
}

const reverseInput = z.object({ journalId: z.uuid(), key: z.uuid(), entryDate: z.union([z.iso.date(), z.literal("")]).default(""), reason: z.string().trim().min(5).max(300) });

export async function reverseJournal(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = reverseInput.safeParse(fields(data));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.path[0] === "reason" ? "Give a reason (5 to 300 characters) for the reversal." : "Check the reversal date.");
  const p = parsed.data;
  return run("accounting_journal_reverse", (org, actor, c) => sql`accounting_journal_reverse(${org},${actor},${p.journalId}::uuid,${json({ key: p.key, entryDate: p.entryDate || null, reason: p.reason })},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already reversed." : `Reversed by ${r.number}. The original journal is unchanged.` }),
    [`/admin/accounting/journals/${p.journalId}`]);
}
