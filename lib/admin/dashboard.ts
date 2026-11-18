import "server-only";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { canReadMetric, dashboardQuery, type DashboardMetric } from "./dashboard-queries";

export type MetricResult = { state: "ready"; rows: Record<string, unknown>[] } | { state: "restricted" } | { state: "error" };
const metrics: DashboardMetric[] = ["payments", "outstanding", "projects", "quotations", "leads", "enquiries", "overdueInvoices", "designReviews"];
export async function readDashboard() {
  const context = await staffContext();
  const entries = await Promise.all(metrics.map(async (metric): Promise<[DashboardMetric, MetricResult]> => {
    if (!canReadMetric(context, metric)) return [metric, { state: "restricted" }];
    try {
      const result = await db.execute(dashboardQuery(context.organizationId, metric));
      return [metric, { state: "ready", rows: result.rows }];
    } catch {
      console.error(`Dashboard metric unavailable: ${metric}`);
      return [metric, { state: "error" }];
    }
  }));
  return Object.fromEntries(entries) as Record<DashboardMetric, MetricResult>;
}

