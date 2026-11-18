import { sql, type SQL } from "drizzle-orm";
import { balanceExpression } from "@/lib/sales/queries";
import type { Permission } from "@/lib/sales/permissions";

export type DashboardMetric = "payments" | "outstanding" | "projects" | "quotations" | "leads" | "enquiries" | "overdueInvoices" | "designReviews";
export type DashboardAccess = { organizationId: string; role: string; permissions: readonly Permission[] };

// Care and legacy leads are single-company tables; only expose them through the
// same configured-organization authorization used by their existing screens.
export function canReadMetric(ctx: DashboardAccess, metric: DashboardMetric) {
  const required: Partial<Record<DashboardMetric, Permission>> = {
    payments: "payments_read", outstanding: "invoices_read", projects: "projects_read",
    quotations: "quotations_read", leads: "leads_read", overdueInvoices: "invoices_read",
  };
  return metric === "enquiries" || metric === "designReviews" ? ctx.role === "org:admin" : ctx.permissions.includes(required[metric]!);
}

export function dashboardQuery(org: string, metric: DashboardMetric): SQL {
  switch (metric) {
    case "payments": return sql`SELECT currency, sum(amount)::text AS amount FROM payments WHERE organization_id=${org} AND status='confirmed' GROUP BY currency ORDER BY currency`;
    case "outstanding": return sql`SELECT i.currency, sum(${balanceExpression})::text AS amount FROM invoices i WHERE i.organization_id=${org} AND i.status='issued' GROUP BY i.currency ORDER BY i.currency`;
    case "projects": return sql`SELECT count(*)::int AS count FROM projects WHERE organization_id=${org} AND status='active' AND archived_at IS NULL`;
    case "quotations": return sql`SELECT count(*)::int AS count FROM quotations q JOIN LATERAL (SELECT status,valid_until FROM quotation_versions v WHERE v.organization_id=q.organization_id AND v.quotation_id=q.id ORDER BY version DESC LIMIT 1) v ON true WHERE q.organization_id=${org} AND v.status='sent' AND v.valid_until>now()`;
    case "leads": return sql`SELECT count(*)::int AS count FROM leads WHERE organization_id=${org} AND status='new'`;
    case "enquiries": return sql`SELECT count(*)::int AS count FROM care_requests WHERE status='new'`;
    case "overdueInvoices": return sql`SELECT count(*)::int AS count FROM invoices i WHERE i.organization_id=${org} AND i.status='issued' AND i.due_on<current_date AND (${balanceExpression})>0`;
    case "designReviews": return sql`SELECT count(*)::int AS count FROM design_purchases WHERE purchase_status='payment_submitted'`;
  }
}
