import { cacheLife, cacheTag, revalidateTag, updateTag } from "next/cache";
import { kickBackgroundWork } from "@/lib/background/kick";

/*
 * Admin data caching (Cache Components, "use cache: remote").
 *
 * Reads: every cached admin read runs only after authorization (staffContext), takes the
 * organization id as an argument (so it is part of the cache key and organizations never share
 * entries) and calls `adminCache(org)` inside its "use cache: remote" scope.
 *
 * Writes: anything that changes admin data expires the cache on demand:
 *   - server actions call `expireOrgData(org)` (updateTag: the person who saved sees it at once);
 *   - route handlers, workers and webhooks call `expireAdminData()` (revalidateTag, immediate).
 * Entries also refresh on a timer (cacheLife "admin" below) so time-based states such as overdue
 * invoices and expired quotations never lag by more than a few minutes.
 *
 * Customer care is deliberately never cached: conversations must always be live.
 */

/** Tag shared by all admin data, for writers that do not know the organization (webhooks, workers). */
export const ADMIN_DATA_TAG = "admin-data";
export const orgTag = (org: string) => `org:${org}`;

/** Call inside a "use cache: remote" admin read. */
export function adminCache(org: string) {
  cacheLife({ stale: 30, revalidate: 300, expire: 3600 });
  cacheTag(ADMIN_DATA_TAG, orgTag(org));
}

/**
 * From a server action, after a successful write: read-your-own-writes for this organization.
 * Also starts queued emails, WhatsApp messages and push notifications at once (lib/background/kick.ts).
 */
export function expireOrgData(org: string) {
  try {
    updateTag(orgTag(org));
  } catch {
    // updateTag only works inside server actions; fall back to immediate revalidation elsewhere.
    revalidate(org);
  }
  kickBackgroundWork();
}

/**
 * From route handlers, workers and webhooks. Safe to call outside a Next request (tests, scripts).
 * Pass `{ kick: false }` from the delivery workers themselves, which have just drained the queue.
 */
export function expireAdminData(org?: string | null, { kick = true }: { kick?: boolean } = {}) {
  revalidate(org);
  if (kick) kickBackgroundWork();
}

function revalidate(org?: string | null) {
  try {
    revalidateTag(org ? orgTag(org) : ADMIN_DATA_TAG, { expire: 0 });
  } catch {
    // Not inside a Next.js request (e.g. a test script running the worker): nothing is cached there.
  }
}

/**
 * A request's authorization context as a plain object, for passing into a cached read. It becomes
 * part of the cache key, so results that depend on who is asking (role, permissions, "my" filters)
 * are never shared between people. Only the authorization check itself runs per request.
 */
export type CacheKeyContext<T> = { [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]: T[K] };

export function cacheKeyContext<T extends object>(ctx: T): CacheKeyContext<T> {
  return Object.fromEntries(Object.entries(ctx).filter(([, v]) => typeof v !== "function")) as CacheKeyContext<T>;
}

/**
 * Wrap a route handler that writes admin-visible data (uploads, workers, webhooks): after a
 * successful response the cached admin reads are expired, so staff see the change at once.
 */
export function expiringAdminData<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
  options?: { kick?: boolean },
) {
  return async (...args: A): Promise<Response> => {
    const response = await handler(...args);
    if (response.ok) expireAdminData(null, options);
    return response;
  };
}
