"use server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { financeMutation, type FinanceResult } from "@/lib/finance/context";
import type { Permission } from "@/lib/sales/permissions";
import { expireAdminData } from "@/lib/cache-tags";
import { conditionValues, mappableEvents, validateMapping, type MappingLine } from "./integration-catalog";

/*
 * Phase 2B integration commands. Each action validates input, then runs inside financeMutation (live
 * Clerk re-check for the named permission, same-origin check, rate limit, active staff mirror) and
 * calls exactly one database function (one PostgreSQL transaction). The database enforces the
 * two-person rule, idempotency, posting gates and the append-only history.
 */

const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
const fields = (data: FormData) => Object.fromEntries([...data.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
const invalid = (message: string): FinanceResult => ({ ok: false, message });
type Result = { result: Record<string, unknown> };

async function run(permission: Permission, call: (org: string, actor: string, correlation: string) => ReturnType<typeof sql>, done: (r: Record<string, unknown>) => FinanceResult, paths: string[] = []) {
  return financeMutation(permission, async (ctx, correlation) => {
    const r = await db.execute<Result>(sql`SELECT ${call(ctx.organizationId, ctx.actor, correlation)} AS result`);
    revalidatePath("/admin/accounting", "layout");
    for (const p of paths) revalidatePath(p);
    expireAdminData();
    return done(r.rows[0].result);
  });
}

const code = z.union([z.string().trim().toUpperCase().regex(/^[0-9]{3,8}(-[0-9A-Z]{1,6})?$/), z.literal("")]).default("");
const stageInput = z.object({
  key: z.uuid(), stage: z.enum(["disabled", "isolated_test", "shadow"]), note: z.string().trim().min(5).max(2000),
  receivables: code, unallocatedReceipts: code, payables: code, outputTax: code,
});

export async function proposeIntegrationStage(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = stageInput.safeParse(fields(data));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.path[0] === "note" ? "Explain the change (at least 5 characters)." : "Choose a stage and enter valid account codes (or leave them empty).");
  const p = parsed.data;
  const controlAccounts = Object.fromEntries((["receivables", "unallocatedReceipts", "payables", "outputTax"] as const).filter((k) => p[k]).map((k) => [k, p[k]]));
  return run("accounting_manage", (org, actor, c) => sql`accounting_integration_settings_propose(${org},${actor},${json({ key: p.key, stage: p.stage, note: p.note, controlAccounts })},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already proposed." : "Proposed. A second authorized person must approve it before it takes effect." }));
}

const decideInput = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject", "retire"]), note: z.string().max(2000).default(""), key: z.uuid() });

export async function decideIntegrationStage(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = decideInput.safeParse(fields(data));
  if (!parsed.success || parsed.data.decision === "retire") return invalid("Refresh the page and try again.");
  const p = parsed.data;
  if (p.decision === "reject" && p.note.trim().length < 5) return invalid("Give a reason (at least 5 characters) for rejecting.");
  return run("accounting_policy_approve", (org, actor, c) => sql`accounting_integration_settings_decide(${org},${actor},${p.id}::uuid,${p.decision},${p.note},${p.key},${c})`,
    (r) => ({ ok: true, id: p.id, message: r.already ? "Already recorded." : p.decision === "approve" ? `Approved. The new stage is in effect${Number(r.replayed) ? `; ${r.replayed} shadow previews were re-queued` : ""}.` : "Proposal rejected." }));
}

const mappingInput = z.object({
  key: z.uuid(), eventType: z.enum(mappableEvents.map((e) => e.type) as [string, ...string[]]), description: z.string().trim().min(5).max(1000),
  treatment: z.enum(["journal", "no_entry"]), conditions: z.string().max(4000).default("{}"), lines: z.string().max(8000).default("[]"),
  priority: z.string().regex(/^\d{1,4}$/).default("0"), effectiveFrom: z.iso.date(), policyVersion: z.union([z.string().regex(/^\d{1,6}$/), z.literal("")]).default(""),
});

export async function proposeMapping(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = mappingInput.safeParse(fields(data));
  if (!parsed.success) {
    const k = parsed.error.issues[0]?.path[0];
    return invalid(k === "description" ? "Describe the accounting basis for this mapping (at least 5 characters)." : k === "effectiveFrom" ? "Enter the date the mapping takes effect." : "Check the mapping details.");
  }
  const p = parsed.data;
  let conditions: Record<string, string>; let lines: MappingLine[];
  try { conditions = JSON.parse(p.conditions); lines = JSON.parse(p.lines); } catch { return invalid("The conditions or lines could not be read. Refresh and try again."); }
  for (const [k, v] of Object.entries(conditions)) if (v === "") delete conditions[k];
  if (conditions.category) conditions.category = conditions.category.trim().toLowerCase();
  const definition = p.treatment === "journal" ? { lines } : {};
  const errors = validateMapping(p.eventType, conditions, p.treatment, definition);
  if (errors.length) return invalid(errors[0] === "invalid_mapping_conditions"
    ? `Check the conditions. Allowed values: ${Object.entries(conditionValues).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k} (${(v as readonly string[]).join(", ")})`).join("; ")}.`
    : "A journal mapping needs 2 to 20 lines with at least one debit and one credit, an amount for each line, and a valid account code (or one per division).");
  if (Number(p.priority) > 1000) return invalid("Priority must be between 0 and 1000.");
  return run("accounting_manage", (org, actor, c) => sql`accounting_mapping_propose(${org},${actor},${json({ key: p.key, eventType: p.eventType, description: p.description, treatment: p.treatment, conditions, definition, priority: p.priority, effectiveFrom: p.effectiveFrom, policyVersion: p.policyVersion || null })},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already proposed." : `Mapping version ${r.version} proposed. It has no effect until a second authorized person approves it.` }),
    ["/admin/accounting/integration/mappings"]);
}

export async function decideMapping(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = decideInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Refresh the page and try again.");
  const p = parsed.data;
  if (p.decision !== "approve" && p.note.trim().length < 5) return invalid("Give a reason (at least 5 characters).");
  return run("accounting_policy_approve", (org, actor, c) => sql`accounting_mapping_decide(${org},${actor},${p.id}::uuid,${p.decision},${p.note},${p.key},${c})`,
    (r) => ({ ok: true, id: p.id, message: r.already ? "Already recorded." : { approve: "Mapping approved. It applies to events processed from now on; blocked events need a retry.", reject: "Mapping rejected.", retire: "Mapping retired. It no longer applies to new processing." }[p.decision] }),
    ["/admin/accounting/integration/mappings"]);
}

const processInput = z.object({ batch: z.string().regex(/^\d{1,3}$/).default("100") });

export async function processIntegrationQueue(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = processInput.safeParse(fields(data));
  const batch = parsed.success ? Math.min(500, Math.max(1, Number(parsed.data.batch))) : 100;
  return run("accounting_integration_operate", (org, actor, c) => sql`accounting_integration_process(${org},${actor},${batch},'admin-ui',${c})`, (r) => {
    const o = (r.outcomes ?? {}) as Record<string, number>;
    const parts = Object.entries(o).map(([k, v]) => `${v} ${k.replace("_", " ")}`);
    return { ok: true, message: Number(r.claimed) ? `Processed ${r.claimed} events: ${parts.join(", ")}.` : "Nothing was waiting to be processed." };
  });
}

const eventCommandInput = z.object({ eventId: z.uuid(), command: z.enum(["retry", "redate"]), key: z.uuid(), postingDate: z.union([z.iso.date(), z.literal("")]).default(""), reason: z.string().trim().max(500).default("") });

export async function integrationEventCommand(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = eventCommandInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Check the posting date and try again.");
  const p = parsed.data;
  if (p.command === "redate" && (!p.postingDate || p.reason.length < 5)) return invalid("Choose a posting date in an open period and give a reason (at least 5 characters).");
  return run("accounting_integration_operate", (org, actor, c) => sql`accounting_integration_event_command(${org},${actor},${p.eventId}::uuid,${p.command},${json({ postingDate: p.postingDate || null, reason: p.reason })},${p.key},${c})`,
    (r) => ({ ok: true, id: p.eventId, message: r.already ? "Already recorded." : p.command === "retry" ? "Queued again. It is applied on the next processing run." : `Re-dated to ${p.postingDate} and queued. The original date is kept on the record.` }),
    [`/admin/accounting/integration/${p.eventId}`]);
}

export async function backfillIntegration(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = z.object({ key: z.uuid() }).safeParse(fields(data));
  if (!parsed.success) return invalid("Refresh the page and try again.");
  return run("accounting_integration_operate", (org, actor, c) => sql`accounting_integration_backfill(${org},${actor},${parsed.data.key},${c})`,
    (r) => ({ ok: true, message: r.already ? "Already done." : `${r.created} historical events were captured. Existing events were left unchanged.` }));
}
