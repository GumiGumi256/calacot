import "server-only";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { canReadMetric, dashboardQuery, type DashboardMetric } from "./dashboard-queries";
import { cacheKeyContext, adminCache } from "@/lib/cache-tags";
import { cacheLife } from "next/cache";

export type MetricResult = { state: "ready"; rows: Record<string, unknown>[] } | { state: "restricted" } | { state: "error" };
const metrics: DashboardMetric[] = ["payments", "outstanding", "projects", "quotations", "leads", "enquiries", "overdueInvoices", "designReviews"];
export async function readDashboard() {
  const context = await staffContext();
  return cachedReadDashboard(cacheKeyContext(context));
}
/** Cached per organization, caller context and inputs; expired on writes (lib/cache-tags.ts). */
async function cachedReadDashboard(context: Awaited<ReturnType<typeof staffContext>>) {
  "use cache: remote";
  adminCache(context.organizationId);
  let failed = false;
  const entries = await Promise.all(metrics.map(async (metric): Promise<[DashboardMetric, MetricResult]> => {
    if (!canReadMetric(context, metric)) return [metric, { state: "restricted" }];
    try {
      const result = await db.execute(dashboardQuery(context.organizationId, metric));
      return [metric, { state: "ready", rows: result.rows }];
    } catch {
      console.error(`Dashboard metric unavailable: ${metric}`);
      failed = true;
      return [metric, { state: "error" }];
    }
  }));
  // A failed metric must not be cached for minutes: keep this result only briefly.
  if (failed) cacheLife("seconds");
  return Object.fromEntries(entries) as Record<DashboardMetric, MetricResult>;
}

