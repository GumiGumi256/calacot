"use server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { financeMutation, type FinanceResult } from "@/lib/finance/context";
import type { Permission } from "@/lib/sales/permissions";
import { expireAdminData } from "@/lib/cache-tags";
import { ledgerAmount } from "@/lib/accounting/format";

/*
 * Phase 2D fixed-asset commands. Preparing is assets_manage; approving any asset journal (capitalization,
 * depreciation, impairment, disposal) or asset policy is depreciation_approve, by a different person.
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

const categoryInput = z.object({ key: z.uuid(), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/), name: z.string().trim().min(2).max(120),
  usefulLifeMonths: z.string().regex(/^\d{1,4}$/), residualPercent: z.string().regex(/^0(\.\d{1,6})?$/), periodConvention: z.enum(["daily_proration", "full_month_from_capitalization", "next_month_after_capitalization"]),
  capitalizationThreshold: money, taxAllowanceRuleCode: z.string().trim().toLowerCase().max(60).default(""), policyBasis: z.string().trim().min(5).max(1000),
  cost: z.uuid(), accumulated: z.uuid(), expense: z.uuid(), impairment: z.uuid(), gain: z.uuid(), loss: z.uuid() });
export async function proposeCategory(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = categoryInput.safeParse(fields(data));
  if (!p.success) return invalid("Complete the policy: code, name, useful life (months), residual fraction, convention, threshold, basis and all six accounts.");
  const { cost, accumulated, expense, impairment, gain, loss, ...rest } = p.data;
  return run("assets_manage", (org, actor, c) => sql`asset_category_propose(${org},${actor},${json({ ...rest, accounts: { cost, accumulated, expense, impairment, gain, loss } })},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already proposed." : `Category version ${r.version} proposed. A different person with depreciation approval must approve it.` }));
}

const decisionInput = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(2000).default(""), key: z.uuid() });
export async function decideCategory(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = decisionInput.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if (v.decision === "reject" && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return run("depreciation_approve", (org, actor, c) => sql`asset_category_decide(${org},${actor},${v.id}::uuid,${v.decision},${v.note},${v.key},${c})`,
    (r) => ({ ok: true, id: v.id, message: r.already ? "Already recorded." : v.decision === "approve" ? "Category policy approved." : "Rejected." }));
}

const assetInput = z.object({
  key: z.uuid(), id: uuidOrEmpty, version: z.string().default(""), name: z.string().trim().min(2).max(160), ownership: z.enum(["owned", "hired"]), categoryCode: z.string().trim().max(20).default(""),
  acquisitionDate: date, capitalizationDate: z.union([date, z.literal("")]).default(""), depreciationStartDate: z.union([date, z.literal("")]).default(""),
  cost: z.union([money, z.literal("")]).default(""), currency: z.enum(["UGX", "USD"]).default("UGX"), residualValue: z.union([money, z.literal("")]).default(""),
  usefulLifeMonths: z.union([z.string().regex(/^\d{1,4}$/), z.literal("")]).default(""), capitalizationSource: z.enum(["", "expense_reclass", "direct_credit", "opening_balance"]).default(""),
  creditAccountId: uuidOrEmpty, openingAccumulatedDepreciation: z.union([money, z.literal("")]).default(""), supplierId: uuidOrEmpty, expenseId: uuidOrEmpty, sourceDocumentId: uuidOrEmpty,
  hireReference: z.string().trim().max(100).default(""), division: z.enum(["", "estates", "architecture", "painting", "interiors", "tech"]).default(""), projectId: uuidOrEmpty,
  custodianId: uuidOrEmpty, location: z.string().trim().max(200).default(""), serialNumber: z.string().trim().max(100).default(""), taxAllowanceRuleCode: z.string().trim().toLowerCase().max(60).default(""),
});
export async function saveAsset(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = assetInput.safeParse(fields(data));
  if (!p.success) return invalid("Check the asset details: name, dates and amounts.");
  const v = p.data;
  if (v.ownership === "owned" && (!v.categoryCode || !v.cost || !v.capitalizationDate || !v.capitalizationSource)) return invalid("Owned assets need a category, cost, capitalization date and source.");
  return run("assets_manage", (org, actor, c) => sql`fixed_asset_save(${org},${actor},${json({ ...v, version: v.version ? Number(v.version) : null, id: v.id || null })},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already saved." : v.id ? "Asset updated." : `Asset ${r.assetNumber} registered.${v.ownership === "owned" ? " Prepare its capitalization next." : " Hired equipment is recorded for custody only."}` }));
}

const keyed = z.object({ id: z.uuid(), key: z.uuid() });
export async function capitalizeAsset(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = keyed.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  return run("assets_manage", (org, actor, c) => sql`fixed_asset_capitalize(${org},${actor},${p.data.id}::uuid,${json({ key: p.data.key })},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already prepared." : "Capitalization journal prepared. A different person must approve and post it." }));
}

const runInput = z.object({ periodId: z.uuid(), key: z.uuid() });
export async function prepareDepreciation(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = runInput.safeParse(fields(data));
  if (!p.success) return invalid("Choose a period.");
  return run("assets_manage", (org, actor, c) => sql`asset_depreciation_prepare(${org},${actor},${json(p.data)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already prepared." : `Depreciation of ${ledgerAmount(String(r.total))} prepared. A different person must approve and post it.` }));
}

const impairmentInput = z.object({ id: z.uuid(), key: z.uuid(), amount: money, impairmentDate: date, reason: z.string().trim().min(5).max(2000), evidenceDocumentId: z.uuid() });
export async function prepareImpairment(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = impairmentInput.safeParse(fields(data));
  if (!p.success) return invalid("Enter the amount, date, reason and supporting evidence.");
  const { id, ...rest } = p.data;
  return run("assets_manage", (org, actor, c) => sql`asset_impairment_prepare(${org},${actor},${id}::uuid,${json(rest)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already prepared." : "Impairment prepared. A different person must approve and post it." }));
}

const disposalInput = z.object({ id: z.uuid(), key: z.uuid(), disposalDate: date, kind: z.enum(["sale", "scrap", "write_off", "donation", "loss_or_theft"]), proceeds: z.union([money, z.literal("")]).default(""),
  proceedsBankingAccountId: uuidOrEmpty, proceedsAccountId: uuidOrEmpty, note: z.string().trim().min(5).max(2000), evidenceDocumentId: z.uuid() });
export async function prepareDisposal(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = disposalInput.safeParse(fields(data));
  if (!p.success) return invalid("Enter the date, type, explanation and evidence (and proceeds with where they were received).");
  const { id, ...rest } = p.data;
  return run("assets_manage", (org, actor, c) => sql`asset_disposal_prepare(${org},${actor},${id}::uuid,${json(rest)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already prepared." : `Disposal prepared: carrying amount ${ledgerAmount(String(r.netBookValue))}, ${Number(r.gainOrLoss) >= 0 ? "gain" : "loss"} ${ledgerAmount(String(r.gainOrLoss).replace("-", ""))}. A different person must approve and post it.` }));
}

const transferInput = z.object({ id: z.uuid(), key: z.uuid(), transferDate: date, custodianId: uuidOrEmpty, location: z.string().trim().max(200).default(""),
  division: z.enum(["", "estates", "architecture", "painting", "interiors", "tech"]).default(""), projectId: uuidOrEmpty, reason: z.string().trim().min(5).max(2000) });
export async function recordTransfer(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = transferInput.safeParse(fields(data));
  if (!p.success) return invalid("Enter the date and reason.");
  const { id, ...rest } = p.data;
  return run("assets_manage", (org, actor, c) => sql`asset_transfer_record(${org},${actor},${id}::uuid,${json(rest)},${c})`,
    (r) => ({ ok: true, id: String(r.id), message: r.already ? "Already recorded." : "Transfer recorded." }));
}

const linkInput = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject", "cancel", "reverse"]), note: z.string().trim().max(2000).default(""), key: z.uuid() });
/** Decide an asset journal. Tax journals are decided in lib/tax/actions.ts. */
export async function decideAssetJournal(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = linkInput.safeParse(fields(data));
  if (!p.success) return invalid("Refresh the page and try again.");
  const v = p.data;
  if (v.decision !== "approve" && v.note.length < 5) return invalid("Give a reason (at least 5 characters).");
  return financeMutation(v.decision === "cancel" ? "assets_manage" : "depreciation_approve", async (ctx, correlation) => {
    const purpose = (await db.execute<{ purpose: string }>(sql`SELECT purpose FROM ledger_source_links WHERE organization_id=${ctx.organizationId} AND id=${v.id}::uuid`)).rows[0]?.purpose;
    if (!purpose?.startsWith("asset_")) return invalid("This journal is unavailable.");
    const r = (await db.execute<Result>(sql`SELECT ledger_link_decide(${ctx.organizationId},${ctx.actor},${v.id}::uuid,${v.decision},${v.note},${v.key},${correlation}) AS result`)).rows[0].result;
    revalidatePath("/admin/accounting", "layout"); expireAdminData();
    return { ok: true, id: v.id, message: r.already ? "Already recorded." : { approve: `Approved and posted as ${String(r.number)}.`, reject: "Rejected. Nothing was posted.", cancel: "Cancelled.", reverse: "Reversed by a new posted journal." }[v.decision] };
  });
}
