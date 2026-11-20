import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { divisions, currencies, literalSearch } from "@/lib/sales/contracts";
import { catalogueItemTypes, type CatalogueItem } from "./contracts";
import { cacheKeyContext, adminCache } from "@/lib/cache-tags";

type Raw = Record<string, string | string[] | undefined>;
const one = (raw: Raw, k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim().slice(0, 200) : "");
const pick = <T extends readonly string[]>(list: T, v: string) => (list.includes(v) ? v : "");

/** Columns shared by the catalogue page and the quotation picker. Catalogue rows only (typed). */
export const itemColumns = sql`s.id,s.code,s.name,s.division,s.category,s.item_type,s.description,s.unit,s.default_unit_price::text AS unit_price,s.currency,s.is_active,s.row_version,s.updated_at::text AS updated_at,coalesce(m.display_name,m.email,s.updated_by_clerk_user_id) AS updated_by`;
const fromItems = (org: string) => sql`FROM services s LEFT JOIN staff_memberships m ON m.organization_id=s.organization_id AND m.clerk_user_id=s.updated_by_clerk_user_id WHERE s.organization_id=${org} AND s.item_type IS NOT NULL AND s.default_unit_price IS NOT NULL`;

export async function readCatalogue(raw: Raw) {
  const ctx = await staffContext("catalogue_read");
  return cachedReadCatalogue(cacheKeyContext(ctx), raw);
}
/** Cached per organization, caller context and inputs; expired on writes (lib/cache-tags.ts). */
async function cachedReadCatalogue(ctx: Awaited<ReturnType<typeof staffContext>>, raw: Raw) {
  "use cache: remote";
  adminCache(ctx.organizationId);
  const org = ctx.organizationId;
  const filters = {
    search: one(raw, "q"),
    // Painting is the first division using the catalogue, so it is the default view.
    division: raw.division === undefined ? "painting" : pick(divisions, one(raw, "division")),
    itemType: pick(catalogueItemTypes, one(raw, "type")),
    currency: pick(currencies, one(raw, "currency")),
    category: one(raw, "category").slice(0, 80),
    status: ["active", "inactive", "all"].includes(one(raw, "status")) ? one(raw, "status") : "active",
  };
  const where: SQL[] = [];
  if (filters.search) { const s = literalSearch(filters.search); where.push(sql`(s.name ILIKE ${s} OR s.description ILIKE ${s} OR s.category ILIKE ${s} OR s.code ILIKE ${s})`); }
  if (filters.division) where.push(sql`s.division=${filters.division}`);
  if (filters.itemType) where.push(sql`s.item_type=${filters.itemType}`);
  if (filters.currency) where.push(sql`s.currency=${filters.currency}`);
  if (filters.category) where.push(sql`s.category=${filters.category}`);
  if (filters.status !== "all") where.push(filters.status === "active" ? sql`s.is_active` : sql`NOT s.is_active`);
  const cond = where.length ? sql` AND ${sql.join(where, sql` AND `)}` : sql``;
  const size = 25;
  const total = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n ${fromItems(org)}${cond}`)).rows[0]?.n ?? 0;
  const page = Math.min(Math.max(1, Number(one(raw, "page")) || 1), Math.max(1, Math.ceil(total / size)));
  const [rows, categories] = await Promise.all([
    db.execute<CatalogueItem>(sql`SELECT ${itemColumns} ${fromItems(org)}${cond} ORDER BY s.division,s.category NULLS LAST,s.name,s.id LIMIT ${size} OFFSET ${(page - 1) * size}`),
    db.execute<{ category: string }>(sql`SELECT DISTINCT category FROM services WHERE organization_id=${org} AND category IS NOT NULL AND item_type IS NOT NULL ORDER BY category LIMIT 200`),
  ]);
  return { rows: rows.rows, total, page, size, filters, categories: categories.rows.map((r) => r.category), canManage: ctx.permissions.includes("catalogue_manage") };
}

/** Active items for the quotation editor: same division and currency as the quotation. */
export async function catalogueOptions(org: string, division: string, currency: string, search: string) {
  if (!divisions.includes(division as never) || !currencies.includes(currency as never)) return [];
  const s = search.trim().slice(0, 100);
  const match = s ? sql` AND (s.name ILIKE ${literalSearch(s)} OR s.category ILIKE ${literalSearch(s)} OR s.description ILIKE ${literalSearch(s)} OR s.code ILIKE ${literalSearch(s)})` : sql``;
  const r = await db.execute<CatalogueItem>(sql`SELECT ${itemColumns} ${fromItems(org)} AND s.is_active AND s.division=${division} AND s.currency=${currency}${match} ORDER BY s.category NULLS LAST,s.name LIMIT 50`);
  return r.rows;
}
