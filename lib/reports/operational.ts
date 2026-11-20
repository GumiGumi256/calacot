import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/database/db";
import { staffContext, type Permission } from "@/lib/sales/permissions";
import { listBase } from "@/lib/sales/queries";
import { literalSearch } from "@/lib/sales/contracts";
import { readFinancialReports, reportFilters } from "@/lib/finance/reports";

export type Raw = Record<string, string | string[] | undefined>;
export type Column = { key: string; label: string; numeric?: boolean; money?: boolean };
export type ReportTable = { key: string; title: string; description: string; columns: Column[]; rows: Record<string, unknown>[] };
export const sections = ["sales", "projects", "finance", "staff"] as const;
export type Section = (typeof sections)[number];
const sectionNeeds: Record<Section, Permission[]> = {
  sales: ["leads_read", "quotations_read", "invoices_read", "payments_read"],
  projects: ["projects_read"],
  finance: ["finance_reports"],
  staff: ["staff_manage"],
};
const one = (raw: Raw, k: string) => (typeof raw[k] === "string" ? (raw[k] as string).slice(0, 200) : "");

/**
 * Operational reports from existing records. Every money column is per currency (UGX and USD
 * are never combined) and invoice balances reuse the sales ledger expression. These are
 * management reports, not audited financial statements.
 */
export async function readOperationalReport(raw: Raw) {
  const ctx = await staffContext();
  const has = (p: Permission) => ctx.permissions.includes(p);
  const allowed = sections.filter((s) => sectionNeeds[s].some(has));
  if (!allowed.length) notFound();
  const requested = one(raw, "section") as Section;
  const section: Section = allowed.includes(requested) ? requested : allowed[0];
  const org = ctx.organizationId;
  const today = (await db.execute<{ d: string }>(sql`SELECT finance_kampala_today()::text AS d`)).rows[0].d;
  const f = { ...reportFilters(raw, today), search: one(raw, "search").trim() };
  const range = (col: SQL) => sql`(${col} AT TIME ZONE 'Africa/Kampala')::date BETWEEN ${f.from}::date AND ${f.to}::date`;
  const cur = (col: SQL) => (f.currency ? sql`AND ${col}=${f.currency}` : sql``);
  const projectScope = (alias: string) => sql`${f.division ? sql`AND ${sql.raw(alias)}.division=${f.division}` : sql``} ${f.projectId ? sql`AND ${sql.raw(alias)}.id=${f.projectId}::uuid` : sql``}`;
  const tables: ReportTable[] = [];

  if (section === "sales") {
    if (has("leads_read")) {
      const leadScope = sql`organization_id=${org} AND created_at::date BETWEEN ${f.from}::date AND ${f.to}::date ${f.division ? sql`AND division=${f.division}` : sql``}`;
      tables.push({ key: "leads_by_status", title: "Leads by status", description: "Leads received in the period.", columns: [{ key: "status", label: "Status" }, { key: "leads", label: "Leads", numeric: true }],
        rows: (await db.execute(sql`SELECT replace(status,'_',' ') AS status,count(*)::int AS leads FROM leads WHERE ${leadScope} GROUP BY status ORDER BY count(*) DESC,status`)).rows });
      tables.push({ key: "lead_conversion", title: "Lead conversion", description: "Of leads received in the period: converted to clients, won and lost.", columns: [{ key: "received", label: "Received", numeric: true }, { key: "converted", label: "Converted to client", numeric: true }, { key: "won", label: "Closed won", numeric: true }, { key: "lost", label: "Closed lost", numeric: true }, { key: "conversion_rate", label: "Conversion rate %", numeric: true }],
        rows: (await db.execute(sql`SELECT count(*)::int AS received,count(*) FILTER (WHERE EXISTS(SELECT 1 FROM crm_source_links s WHERE s.lead_id=l.id AND s.client_id IS NOT NULL))::int AS converted,count(*) FILTER (WHERE status='closed_won')::int AS won,count(*) FILTER (WHERE status='closed_lost')::int AS lost,
            CASE WHEN count(*)=0 THEN 0 ELSE round(100.0*count(*) FILTER (WHERE EXISTS(SELECT 1 FROM crm_source_links s WHERE s.lead_id=l.id AND s.client_id IS NOT NULL))/count(*),1) END::text AS conversion_rate FROM leads l WHERE ${leadScope}`)).rows });
    }
    if (has("quotations_read")) {
      tables.push({ key: "quotations_by_status", title: "Quotations by status", description: "Latest version of quotations updated in the period, per currency.", columns: [{ key: "status", label: "Status" }, { key: "currency", label: "Currency" }, { key: "quotations", label: "Quotations", numeric: true }, { key: "total", label: "Total", money: true }],
        rows: (await db.execute(sql`WITH b AS (${listBase(org, "quotations")}) SELECT b.status,b.currency,count(*)::int AS quotations,sum(b.total::numeric)::text AS total FROM b JOIN quotations q ON q.id=b.id AND q.organization_id=${org} LEFT JOIN projects p ON p.id=q.project_id AND p.organization_id=${org}
            WHERE ${range(sql`b.created`)} ${f.division ? sql`AND q.division=${f.division}` : sql``} ${f.projectId ? sql`AND q.project_id=${f.projectId}::uuid` : sql``} ${cur(sql`b.currency`)} GROUP BY b.status,b.currency ORDER BY b.currency,b.status`)).rows });
    }
    if (has("invoices_read")) {
      const invScope = sql`${f.projectId ? sql`AND i.project_id=${f.projectId}::uuid` : sql``} ${f.division ? sql`AND EXISTS(SELECT 1 FROM projects sp WHERE sp.organization_id=i.organization_id AND sp.id=i.project_id AND sp.division=${f.division})` : sql``}`;
      tables.push({ key: "invoiced", title: "Invoiced amounts", description: "Invoices issued in the period (excluding voided), per currency. Invoicing is not revenue recognition.", columns: [{ key: "currency", label: "Currency" }, { key: "invoices", label: "Invoices", numeric: true }, { key: "invoiced", label: "Invoiced", money: true }],
        rows: (await db.execute(sql`SELECT i.currency,count(*)::int AS invoices,sum(i.total)::text AS invoiced FROM invoices i WHERE i.organization_id=${org} AND i.status='issued' AND ${range(sql`i.issued_at`)} ${invScope} ${cur(sql`i.currency`)} GROUP BY i.currency ORDER BY i.currency`)).rows });
      tables.push({ key: "outstanding", title: "Outstanding customer balances", description: "As of today, from the invoice ledger (not limited to the period).", columns: [{ key: "currency", label: "Currency" }, { key: "invoices", label: "Invoices with a balance", numeric: true }, { key: "outstanding", label: "Outstanding", money: true }, { key: "overdue", label: "Of which overdue", money: true }],
        rows: (await db.execute(sql`WITH b AS (${listBase(org, "invoices")}) SELECT b.currency,count(*) FILTER (WHERE b.balance::numeric>0)::int AS invoices,coalesce(sum(b.balance::numeric),0)::text AS outstanding,coalesce(sum(b.balance::numeric) FILTER (WHERE b.payment='overdue'),0)::text AS overdue FROM b JOIN invoices i ON i.id=b.id AND i.organization_id=${org} WHERE b.status='issued' ${invScope} ${cur(sql`b.currency`)} GROUP BY b.currency ORDER BY b.currency`)).rows });
    }
    if (has("payments_read")) {
      const scoped = !!(f.projectId || f.division);
      tables.push({ key: "collections", title: "Confirmed collections", description: scoped ? "Confirmed payments received in the period and allocated to invoices of the selected project/division." : "Confirmed customer payments received in the period. Collections are cash received, not profit.", columns: [{ key: "currency", label: "Currency" }, { key: "payments", label: "Payments", numeric: true }, { key: "collected", label: "Collected", money: true }],
        rows: (await db.execute(scoped
          ? sql`SELECT a.currency,count(DISTINCT p.id)::int AS payments,sum(a.amount)::text AS collected FROM payment_allocations a JOIN payments p ON p.id=a.payment_id AND p.organization_id=a.organization_id JOIN invoices i ON i.id=a.invoice_id AND i.organization_id=a.organization_id WHERE a.organization_id=${org} AND p.status='confirmed' AND ${range(sql`p.received_at`)} ${f.projectId ? sql`AND i.project_id=${f.projectId}::uuid` : sql``} ${f.division ? sql`AND EXISTS(SELECT 1 FROM projects sp WHERE sp.organization_id=i.organization_id AND sp.id=i.project_id AND sp.division=${f.division})` : sql``} ${cur(sql`a.currency`)} GROUP BY a.currency ORDER BY a.currency`
          : sql`SELECT currency,count(*)::int AS payments,sum(amount)::text AS collected FROM payments WHERE organization_id=${org} AND status='confirmed' AND ${range(sql`received_at`)} ${cur(sql`currency`)} GROUP BY currency ORDER BY currency`)).rows });
    }
  }

  if (section === "projects") {
    tables.push({ key: "projects_by_status", title: "Projects by status", description: "All current (non-archived) projects.", columns: [{ key: "status", label: "Status" }, { key: "projects", label: "Projects", numeric: true }],
      rows: (await db.execute(sql`SELECT replace(p.status,'_',' ') AS status,count(*)::int AS projects FROM projects p WHERE p.organization_id=${org} AND p.archived_at IS NULL ${projectScope("p")} GROUP BY p.status ORDER BY count(*) DESC`)).rows });
    tables.push({ key: "project_progress", title: "Project progress", description: "Task and milestone completion (cancelled items excluded). Overdue = past due and not completed.", columns: [{ key: "project", label: "Project" }, { key: "status", label: "Status" }, { key: "tasks_done", label: "Tasks done", numeric: true }, { key: "tasks_total", label: "Tasks", numeric: true }, { key: "tasks_overdue", label: "Overdue tasks", numeric: true }, { key: "milestones_done", label: "Milestones done", numeric: true }, { key: "milestones_total", label: "Milestones", numeric: true }, { key: "milestones_completed_in_period", label: "Milestones completed in period", numeric: true }, { key: "due_on", label: "Due date" }],
      rows: (await db.execute(sql`SELECT p.code||' '||p.name AS project,replace(p.status,'_',' ') AS status,
          (SELECT count(*) FROM tasks t WHERE t.organization_id=p.organization_id AND t.project_id=p.id AND t.status='completed')::int AS tasks_done,
          (SELECT count(*) FROM tasks t WHERE t.organization_id=p.organization_id AND t.project_id=p.id AND t.status<>'cancelled')::int AS tasks_total,
          (SELECT count(*) FROM tasks t WHERE t.organization_id=p.organization_id AND t.project_id=p.id AND t.status NOT IN ('completed','cancelled') AND t.due_at<now())::int AS tasks_overdue,
          (SELECT count(*) FROM project_milestones m WHERE m.organization_id=p.organization_id AND m.project_id=p.id AND m.status='completed')::int AS milestones_done,
          (SELECT count(*) FROM project_milestones m WHERE m.organization_id=p.organization_id AND m.project_id=p.id AND m.status<>'cancelled')::int AS milestones_total,
          (SELECT count(*) FROM project_milestones m WHERE m.organization_id=p.organization_id AND m.project_id=p.id AND m.status='completed' AND m.completed_at IS NOT NULL AND ${range(sql`m.completed_at`)})::int AS milestones_completed_in_period,
          coalesce(p.due_on::text,'') AS due_on
        FROM projects p WHERE p.organization_id=${org} AND p.archived_at IS NULL ${projectScope("p")} ${f.search ? sql`AND (p.name ILIKE ${literalSearch(f.search)} OR p.code ILIKE ${literalSearch(f.search)})` : sql``}
        ORDER BY CASE WHEN p.status IN ('active','on_hold','planned') THEN 0 ELSE 1 END,p.code LIMIT 200`)).rows });
    tables.push({ key: "overdue_tasks", title: "Overdue tasks", description: "Open tasks past their due date (most overdue first, up to 200).", columns: [{ key: "project", label: "Project" }, { key: "task", label: "Task" }, { key: "assignee", label: "Assigned to" }, { key: "due", label: "Due" }, { key: "status", label: "Status" }],
      rows: (await db.execute(sql`SELECT p.code||' '||p.name AS project,t.title AS task,coalesce(s.display_name,s.email,'Unassigned') AS assignee,to_char(t.due_at AT TIME ZONE 'Africa/Kampala','YYYY-MM-DD') AS due,replace(t.status,'_',' ') AS status
        FROM tasks t JOIN projects p ON p.id=t.project_id AND p.organization_id=t.organization_id LEFT JOIN staff_memberships s ON s.id=t.assignee_id AND s.organization_id=t.organization_id
        WHERE t.organization_id=${org} AND p.archived_at IS NULL AND t.status NOT IN ('completed','cancelled') AND t.due_at<now() ${projectScope("p")} ORDER BY t.due_at,t.id LIMIT 200`)).rows });
    if (has("expenses_read")) {
      tables.push({ key: "project_expenditure", title: "Project expenditure", description: "Approved and paid project expenses to date, per currency.", columns: [{ key: "project", label: "Project" }, { key: "currency", label: "Currency" }, { key: "approved", label: "Approved", money: true }, { key: "disbursed", label: "Paid (disbursed)", money: true }, { key: "outstanding", label: "Approved, not yet paid", money: true }],
        rows: (await db.execute(sql`SELECT p.code||' '||p.name AS project,e.currency,sum(e.total)::text AS approved,sum(x.paid)::text AS disbursed,sum(CASE WHEN e.status='approved' THEN e.total-x.paid ELSE 0 END)::text AS outstanding
          FROM expenses e JOIN projects p ON p.id=e.project_id AND p.organization_id=e.organization_id
          CROSS JOIN LATERAL (SELECT coalesce(sum(d.amount),0) AS paid FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded') x
          WHERE e.organization_id=${org} AND e.status IN ('approved','paid') AND p.archived_at IS NULL ${projectScope("p")} ${cur(sql`e.currency`)} GROUP BY p.code,p.name,e.currency ORDER BY p.code,e.currency LIMIT 300`)).rows });
    }
  }

  if (section === "finance") {
    // Same queries and permission as /admin/financial-reports (Phase 1D).
    const r = await readFinancialReports(raw);
    const groupCols: Column[] = [{ key: "label", label: "Group" }, { key: "currency", label: "Currency" }, { key: "count", label: "Expenses", numeric: true }, { key: "approved", label: "Approved", money: true }, { key: "disbursed", label: "Paid", money: true }, { key: "outstanding", label: "Approved, not yet paid", money: true }];
    tables.push({ key: "expenses_by_category", title: "Expenses by category", description: "Approved and paid expenses dated in the period.", columns: groupCols, rows: r.byCategory });
    tables.push({ key: "expenses_by_division", title: "Expenses by division", description: "Approved and paid expenses dated in the period.", columns: groupCols, rows: r.byDivision });
    tables.push({ key: "approved_vs_paid", title: "Approved versus paid expenses", description: "Expenses dated in the period: pending review, approved (committed) and approved but not yet paid.", columns: [{ key: "currency", label: "Currency" }, { key: "pending", label: "Pending review", money: true }, { key: "approved", label: "Approved", money: true }, { key: "outstanding", label: "Approved, not yet paid", money: true }], rows: r.pipeline });
    tables.push({ key: "pending_disbursements", title: "Pending disbursements", description: "All approved expenses still awaiting payment (as of today).", columns: [{ key: "currency", label: "Currency" }, { key: "expenses", label: "Expenses", numeric: true }, { key: "outstanding", label: "Outstanding", money: true }, { key: "oldest_approval", label: "Oldest approval" }],
      rows: (await db.execute(sql`SELECT e.currency,count(*)::int AS expenses,sum(e.total-x.paid)::text AS outstanding,min(e.approved_at)::date::text AS oldest_approval FROM expenses e CROSS JOIN LATERAL (SELECT coalesce(sum(d.amount),0) AS paid FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded') x
        WHERE e.organization_id=${org} AND e.status='approved' ${f.division ? sql`AND e.division=${f.division}` : sql``} ${f.projectId ? sql`AND e.project_id=${f.projectId}::uuid` : sql``} ${cur(sql`e.currency`)} GROUP BY e.currency ORDER BY e.currency`)).rows });
    tables.push({ key: "outstanding_invoices", title: "Outstanding invoices", description: "As of today, from the invoice ledger.", columns: [{ key: "currency", label: "Currency" }, { key: "invoices", label: "Invoices with a balance", numeric: true }, { key: "outstanding", label: "Outstanding", money: true }, { key: "overdue", label: "Of which overdue", money: true }], rows: r.outstanding });
  }

  if (section === "staff") {
    tables.push({ key: "workload", title: "Workload by employee", description: "Open work as of today and work completed in the period. Active staff only.", columns: [{ key: "employee", label: "Employee" }, { key: "open_tasks", label: "Open tasks", numeric: true }, { key: "overdue_tasks", label: "Overdue tasks", numeric: true }, { key: "completed_tasks", label: "Tasks completed in period", numeric: true }, { key: "open_milestones", label: "Open milestones", numeric: true }, { key: "open_leads", label: "Open leads", numeric: true }],
      rows: (await db.execute(sql`SELECT coalesce(s.display_name,s.email,s.clerk_user_id) AS employee,
          (SELECT count(*) FROM tasks t JOIN projects p ON p.id=t.project_id AND p.organization_id=t.organization_id WHERE t.organization_id=s.organization_id AND t.assignee_id=s.id AND t.status NOT IN ('completed','cancelled') ${projectScope("p")})::int AS open_tasks,
          (SELECT count(*) FROM tasks t JOIN projects p ON p.id=t.project_id AND p.organization_id=t.organization_id WHERE t.organization_id=s.organization_id AND t.assignee_id=s.id AND t.status NOT IN ('completed','cancelled') AND t.due_at<now() ${projectScope("p")})::int AS overdue_tasks,
          (SELECT count(*) FROM tasks t JOIN projects p ON p.id=t.project_id AND p.organization_id=t.organization_id WHERE t.organization_id=s.organization_id AND t.assignee_id=s.id AND t.status='completed' AND t.completed_at IS NOT NULL AND ${range(sql`t.completed_at`)} ${projectScope("p")})::int AS completed_tasks,
          (SELECT count(*) FROM project_milestones m JOIN projects p ON p.id=m.project_id AND p.organization_id=m.organization_id WHERE m.organization_id=s.organization_id AND m.responsible_staff_id=s.id AND m.status NOT IN ('completed','cancelled') ${projectScope("p")})::int AS open_milestones,
          (SELECT count(*) FROM leads l WHERE l.organization_id=s.organization_id AND l.assigned_staff_id=s.id AND l.status NOT IN ('closed_won','closed_lost'))::int AS open_leads
        FROM staff_memberships s WHERE s.organization_id=${org} AND s.status='active' ${f.division ? sql`AND s.division=${f.division}` : sql``} ${f.search ? sql`AND (coalesce(s.display_name,'') ILIKE ${literalSearch(f.search)} OR coalesce(s.email,'') ILIKE ${literalSearch(f.search)})` : sql``}
        ORDER BY 2 DESC,employee LIMIT 300`)).rows });
  }

  const projectOptions = (await db.execute<{ id: string; label: string }>(sql`SELECT id,code||' '||name AS label FROM projects WHERE organization_id=${org} AND archived_at IS NULL ORDER BY code,id LIMIT 300`)).rows;
  return { section, allowed, filters: f, tables, projectOptions, today };
}
