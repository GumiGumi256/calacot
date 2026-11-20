"use server";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { financeMutation, financeMessages, type FinanceResult } from "@/lib/finance/context";
import { staffContext } from "@/lib/sales/permissions";
import { catalogueItemSchema, type CatalogueItem } from "./contracts";
import { catalogueOptions } from "./reads";

export type CatalogueSaveResult = FinanceResult & { item?: CatalogueItem };

/**
 * Create, edit, deactivate or reactivate a catalogue item. Requires catalogue_manage, verified
 * live with Clerk (financeMutation), same-origin, rate limited; the database re-validates every
 * field, enforces the row version (concurrent edits) and writes the audit entry.
 */
export async function saveCatalogueItem(input: unknown): Promise<CatalogueSaveResult> {
  const parsed = catalogueItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || financeMessages.catalogue_invalid };
  let item: CatalogueItem | undefined;
  const result = await financeMutation("catalogue_manage", async (ctx, correlation) => {
    const r = await db.execute<{ result: { id: string } }>(sql`SELECT catalogue_item_save(${ctx.organizationId},${ctx.actor},${JSON.stringify(parsed.data)}::jsonb,${correlation}) AS result`);
    const id = r.rows[0].result.id;
    item = (await db.execute<CatalogueItem>(sql`SELECT id,code,name,division,category,item_type,description,unit,default_unit_price::text AS unit_price,currency,is_active,row_version,updated_at::text AS updated_at,NULL AS updated_by FROM services WHERE id=${id}::uuid AND organization_id=${ctx.organizationId}`)).rows[0];
    revalidatePath("/admin/catalogue", "layout");
    return { ok: true, message: parsed.data.id ? "Catalogue item updated." : "Catalogue item created.", id };
  });
  return result.ok ? { ...result, item } : result;
}

/** Picker search for the quotation editor. Organization comes from the verified session only. */
export async function searchCatalogue(division: string, currency: string, search: string) {
  const ctx = await staffContext("catalogue_read");
  return catalogueOptions(ctx.organizationId, division, currency, typeof search === "string" ? search : "");
}
