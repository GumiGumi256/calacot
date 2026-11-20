import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { staffContext } from "./permissions";
import { listBase } from "./queries";
import { cacheKeyContext, adminCache } from "@/lib/cache-tags";
import { cacheLife } from "next/cache";

/** A draft untouched this long is surfaced as needing completion. */
export const STALE_DRAFT_DAYS = 14;
/** Sent quotations expiring within this many days are surfaced. */
export const EXPIRING_WITHIN_DAYS = 7;

export type AttentionItem = { key: string; label: string; count: number; href?: string; tone: "warning" | "destructive" };
export type AttentionResult = { state: "ready"; items: AttentionItem[] } | { state: "error" };

/** Label text without the number; the count is shown separately. */
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Quotations that need a decision (Design System V1, Phase 5 attention strip).
 * Read-only. It counts over the exact rows the Quotations list shows (listBase), under the same
 * quotations_read permission and organization scope, so every number matches the linked
 * filtered list. A failure never breaks the page: the strip reports it could not check.
 */
export async function quotationAttention(): Promise<AttentionResult> {
  const ctx = await staffContext("quotations_read");
  return cachedQuotationAttention(cacheKeyContext(ctx));
}
/** Cached per organization, caller context and inputs; expired on writes (lib/cache-tags.ts). */
async function cachedQuotationAttention(ctx: Awaited<ReturnType<typeof staffContext>>): Promise<AttentionResult> {
  "use cache: remote";
  adminCache(ctx.organizationId);
  try {
    const row = (
      await db.execute<{ stale: number; expiring: number; expired: number; undelivered: number }>(sql`
        WITH b AS (${listBase(ctx.organizationId, "quotations")})
        SELECT
          count(*) FILTER (WHERE status='draft' AND created < now() - make_interval(days => ${STALE_DRAFT_DAYS}))::int AS stale,
          count(*) FILTER (WHERE status='sent' AND due <> '' AND due::timestamptz < now() + make_interval(days => ${EXPIRING_WITHIN_DAYS}))::int AS expiring,
          count(*) FILTER (WHERE status='expired')::int AS expired,
          count(*) FILTER (WHERE status IN ('sent','accepted') AND delivery IN ('failed','blocked','bounced','suppressed'))::int AS undelivered
        FROM b`)
    ).rows[0];
    const canSeeDeliveries = ctx.permissions.includes("notifications_manage");
    const items: AttentionItem[] = [
      {
        key: "expiring",
        count: row.expiring,
        label: `${plural(row.expiring, "sent quotation expires", "sent quotations expire")} within ${EXPIRING_WITHIN_DAYS} days`,
        href: "/admin/quotations?status=sent&sort=due&desc=false",
        tone: "warning" as const,
      },
      {
        key: "expired",
        count: row.expired,
        label: `${plural(row.expired, "quotation has", "quotations have")} expired without a decision`,
        href: "/admin/quotations?status=expired",
        tone: "destructive" as const,
      },
      {
        key: "undelivered",
        count: row.undelivered,
        label: `${plural(row.undelivered, "quotation email", "quotation emails")} failed to deliver`,
        href: canSeeDeliveries ? "/admin/deliveries?status=failed" : undefined,
        tone: "destructive" as const,
      },
      {
        key: "stale",
        count: row.stale,
        label: `${plural(row.stale, "draft", "drafts")} not updated in ${STALE_DRAFT_DAYS} days`,
        href: "/admin/quotations?status=draft&sort=created&desc=false",
        tone: "warning" as const,
      },
    ].filter((item) => item.count > 0);
    return { state: "ready", items };
  } catch (error) {
    console.error("quotation_attention_failed", error);
    cacheLife("seconds"); // never keep a failure for minutes
    return { state: "error" };
  }
}
