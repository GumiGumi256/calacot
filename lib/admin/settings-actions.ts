"use server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { financeMutation as adminMutation, type FinanceResult } from "@/lib/finance/context";
import { settingsSchema } from "./settings-schema";
import { baselineSettings } from "./settings";
import { expireAdminData } from "@/lib/cache-tags";

/**
 * Saves company settings as a new version. Identity, contacts, address, divisions and
 * defaults take effect immediately; payment-instruction changes become a proposal that a
 * different administrator must approve. Issued document snapshots are never changed.
 */
export async function proposeSettings(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  let payload: unknown;
  try { payload = JSON.parse(String(data.get("settings") ?? "")); } catch { return { ok: false, message: "Check the company settings and try again." }; }
  const settings = settingsSchema.safeParse(payload);
  const meta = z.object({ baseVersion: z.coerce.number().int().min(0), note: z.string().trim().min(5).max(1000), key: z.uuid() }).safeParse({ baseVersion: data.get("baseVersion"), note: data.get("note"), key: data.get("key") });
  if (!settings.success) return { ok: false, message: settings.error.issues[0]?.message ?? "Check the company settings." };
  if (!meta.success) return { ok: false, message: "Explain the change (at least 5 characters)." };
  return adminMutation("settings_manage", async (ctx, correlation) => {
    const baseline = meta.data.baseVersion === 0 ? await baselineSettings(ctx.organizationId) : null;
    const r = await db.execute<{ result: { status: string; already: boolean } }>(sql`SELECT company_settings_propose(${ctx.organizationId},${ctx.actor},${meta.data.baseVersion},${JSON.stringify(settings.data)}::jsonb,${baseline ? JSON.stringify(baseline) : null}::jsonb,${meta.data.note},${meta.data.key},${correlation}) AS result`);
    revalidatePath("/admin/settings");
    expireAdminData(); // cached admin reads (lib/cache-tags.ts)
    const status = r.rows[0].result.status;
    return { ok: true, message: status === "proposed" ? "Saved as a proposal. Payment instructions change only after another administrator approves it." : "Settings saved. New quotations and invoices use them; issued documents are unchanged." };
  });
}

export async function decideSettings(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ versionId: z.uuid(), decision: z.enum(["approve", "reject"]), note: z.string().trim().min(5).max(1000) }).safeParse(Object.fromEntries(data));
  if (!p.success) return { ok: false, message: "Explain the decision (at least 5 characters)." };
  return adminMutation("settings_manage", async (ctx, correlation) => {
    const r = await db.execute<{ result: { status: string } }>(sql`SELECT company_settings_decide(${ctx.organizationId},${ctx.actor},${p.data.versionId}::uuid,${p.data.decision},${p.data.note},${correlation}) AS result`);
    revalidatePath("/admin/settings");
    expireAdminData(); // cached admin reads (lib/cache-tags.ts)
    if (r.rows[0].result.status === "superseded") return { ok: false, message: "Company settings changed after this proposal, so it was closed as superseded. Submit a new proposal." };
    return { ok: true, message: p.data.decision === "approve" ? "Payment instructions approved and now in effect for new documents." : "Proposal rejected." };
  });
}
