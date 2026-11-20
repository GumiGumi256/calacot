import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { Permission } from "@/lib/sales/permissions";

export type DocumentContext = { organizationId: string; actor: string; role: string; permissions: readonly Permission[] };
export const linkTypes = ["client", "project", "task", "milestone", "staff", "company"] as const;
export type LinkType = (typeof linkTypes)[number];

/**
 * Record-level rule: a document is visible only if the user may read EVERY business record it
 * is linked to (the most restrictive link wins), so a receipt linked to an expense never
 * leaks through a client or project page. Documents with no links are administrator-only.
 */
export function readFlags(ctx: DocumentContext) {
  const has = (p: Permission) => ctx.permissions.includes(p);
  return {
    client: has("clients_read"),
    project: has("projects_read"),
    expense: has("expenses_read"),
    invoice: has("invoices_read"),
    quotation: has("quotations_read"),
    property: ctx.role === "org:admin",
    staff: has("staff_manage"),
    company: has("settings_manage"),
    unlinked: ctx.role === "org:admin",
  };
}

/** Additional rule for creating or revising: staff and company records need their admin permission. */
export function canWriteLink(ctx: DocumentContext, type: LinkType) {
  const f = readFlags(ctx);
  if (!ctx.permissions.includes("documents_write")) return false;
  return { client: f.client, project: f.project, task: f.project, milestone: f.project, staff: f.staff, company: f.company }[type];
}

/** SQL predicate over a family root id expression, scoped to the organization. */
export function documentAccessPredicate(ctx: DocumentContext, root: SQL): SQL {
  const f = readFlags(ctx);
  const deny: SQL[] = [];
  if (!f.client) deny.push(sql`l.client_id IS NOT NULL`);
  if (!f.project) deny.push(sql`(l.project_id IS NOT NULL OR l.task_id IS NOT NULL OR l.milestone_id IS NOT NULL)`);
  if (!f.expense) deny.push(sql`l.expense_id IS NOT NULL`);
  if (!f.invoice) deny.push(sql`l.invoice_id IS NOT NULL`);
  if (!f.quotation) deny.push(sql`(l.quotation_version_id IS NOT NULL OR l.opportunity_id IS NOT NULL)`);
  if (!f.property) deny.push(sql`l.property_id IS NOT NULL`);
  if (!f.staff) deny.push(sql`l.staff_id IS NOT NULL`);
  if (!f.company) deny.push(sql`l.company_record`);
  const linked = sql`EXISTS(SELECT 1 FROM document_links l WHERE l.organization_id=${ctx.organizationId} AND l.document_id=${root})`;
  const denied = deny.length ? sql`AND NOT EXISTS(SELECT 1 FROM document_links l WHERE l.organization_id=${ctx.organizationId} AND l.document_id=${root} AND (${sql.join(deny, sql` OR `)}))` : sql``;
  return f.unlinked ? sql`(NOT ${linked} OR (true ${denied}))` : sql`(${linked} ${denied})`;
}
