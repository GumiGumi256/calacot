"use server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { financeMutation, type FinanceResult } from "@/lib/finance/context";
import type { Permission } from "@/lib/sales/permissions";
import { expireAdminData } from "@/lib/cache-tags";
import { migrationRowKinds, migrationSourceSystems } from "@/lib/accounting/migration";

/*
 * Phase 2F staging-only migration commands. One database function per action, inside
 * financeMutation (live Clerk re-check, same origin, rate limit, active staff). Nothing here posts to
 * the general ledger: an approved batch is evidence for a later, separately reviewed opening journal.
 */

const fields = (data: FormData) => Object.fromEntries([...data.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
const invalid = (message: string): FinanceResult => ({ ok: false, message });
type Result = { result: Record<string, unknown> };

async function run(permission: Permission, call: (org: string, actor: string, correlation: string) => ReturnType<typeof sql>, done: (r: Record<string, unknown>) => FinanceResult) {
  return financeMutation(permission, async (ctx, correlation) => {
    const r = await db.execute<Result>(sql`SELECT ${call(ctx.organizationId, ctx.actor, correlation)} AS result`);
    revalidatePath("/admin/accounting/migration", "layout");
    expireAdminData();
    return done(r.rows[0].result);
  });
}

export async function createMigrationBatch(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ key: z.uuid(), sourceSystem: z.enum(Object.keys(migrationSourceSystems) as [string, ...string[]]), sourceDescription: z.string().trim().min(5).max(500),
    cutoffDate: z.iso.date(), evidenceReference: z.string().trim().min(3).max(300) }).safeParse(fields(data));
  if (!p.success) return invalid("Give the source, a description, the cutoff date and the evidence reference.");
  return run("migration_prepare", (org, actor, c) => sql`migration_batch_create(${org},${actor},${JSON.stringify(p.data)}::jsonb,${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already created." : "Batch created. Load the rows from the template." }));
}

const rowSchema = z.object({
  kind: z.enum(Object.keys(migrationRowKinds) as [string, ...string[]]), sourceRef: z.string().min(1).max(200), sourceAccount: z.string().max(200).optional(), accountCode: z.string().max(20).optional(),
  counterparty: z.string().max(200).optional(), documentNumber: z.string().max(100).optional(), documentDate: z.string().max(10).optional(), currency: z.string().max(3),
  amount: z.string().regex(/^-?\d{1,15}(\.\d{1,2})?$/), details: z.record(z.string(), z.string()).optional(),
});
export async function loadMigrationRows(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ id: z.uuid(), version: z.coerce.number().int().positive(), key: z.uuid(), rows: z.string().max(900_000) }).safeParse(fields(data));
  if (!p.success) return invalid("The rows could not be read. Files larger than about 5,000 rows must be split.");
  let rows: z.infer<typeof rowSchema>[];
  try { rows = z.array(rowSchema).min(1).max(20000).parse(JSON.parse(p.data.rows)); } catch { return invalid("The rows do not match the template."); }
  return run("migration_prepare", (org, actor, c) => sql`migration_rows_replace(${org},${actor},${p.data.id}::uuid,${p.data.version},${JSON.stringify(rows)}::jsonb,${p.data.key},${c})`,
    (r) => ({ ok: true, id: p.data.id, message: r.already ? "Already loaded." : `${String(r.rows)} rows staged. Review the reconciliation below.` }));
}

const commandPermission: Record<string, Permission> = { submit: "migration_prepare", withdraw: "migration_prepare", approve: "migration_approve", reject: "migration_approve" };
export async function migrationBatchCommand(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const f = fields(data);
  const p = z.object({ id: z.uuid(), cmd: z.enum(["submit", "withdraw", "approve", "reject"]), version: z.coerce.number().int().positive(), note: z.string().trim().max(2000).default(""), key: z.uuid() }).safeParse({ ...f, cmd: f.decision ?? f.cmd });
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if (v.cmd === "reject" && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  const done: Record<string, string> = { submit: "Submitted for approval with its reconciliation.", withdraw: "Withdrawn to draft.", approve: "Approved as the opening-balance evidence. Nothing has been posted.", reject: "Batch rejected." };
  return run(commandPermission[v.cmd], (org, actor, c) => sql`migration_batch_command(${org},${actor},${v.id}::uuid,${v.cmd},${v.version},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : done[v.cmd] }));
}
