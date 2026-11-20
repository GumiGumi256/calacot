import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { balanceExpression } from "@/lib/sales/queries";
import type { Permission } from "@/lib/sales/permissions";
import { adminCache } from "@/lib/cache-tags";

/** Caller must first authenticate and verify that this project belongs to org. */
export async function readProjectWorkspace(org: string, projectId: string, permissions: readonly Permission[]) {
  "use cache: remote";
  adminCache(org);
  const [manager, members, tasks, counts, milestones, activity, quotation, invoices, expenses] = await Promise.all([
    db.execute(sql`SELECT coalesce(s.display_name,s.clerk_user_id) AS name FROM projects p JOIN staff_memberships s ON s.id=p.manager_id AND s.organization_id=p.organization_id WHERE p.organization_id=${org} AND p.id=${projectId}::uuid`),
    db.execute(sql`SELECT m.id,coalesce(nullif(trim(s.display_name),''),m.external_name,'Staff member') AS name,m.staff_id,m.external_company,m.external_phone,m.external_email,m.responsibility FROM project_members m LEFT JOIN staff_memberships s ON s.organization_id=m.organization_id AND s.id=m.staff_id WHERE m.organization_id=${org} AND m.project_id=${projectId}::uuid ORDER BY name,m.id LIMIT 100`),
    db.execute(sql`SELECT t.id,t.title,t.status,t.priority,t.mandatory,t.due_at,t.assignee_id,to_char(t.due_at AT TIME ZONE 'Africa/Kampala','YYYY-MM-DD') AS due_date,to_char(t.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version,coalesce(s.display_name,s.clerk_user_id) AS assignee,coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC) FROM (SELECT tc.id,tc.body,tc.created_at,coalesce(author.display_name,author.clerk_user_id) AS author FROM task_comments tc JOIN staff_memberships author ON author.organization_id=tc.organization_id AND author.id=tc.author_id WHERE tc.organization_id=t.organization_id AND tc.task_id=t.id ORDER BY tc.created_at DESC,tc.id LIMIT 10) c),'[]'::jsonb) AS comments FROM tasks t LEFT JOIN staff_memberships s ON s.id=t.assignee_id AND s.organization_id=t.organization_id WHERE t.organization_id=${org} AND t.project_id=${projectId}::uuid ORDER BY t.due_at NULLS LAST,t.id LIMIT 100`),
    db.execute<{ total: number; completed: number }>(sql`SELECT count(*)::int AS total,count(*) FILTER (WHERE status='completed')::int AS completed FROM tasks WHERE organization_id=${org} AND project_id=${projectId}::uuid AND status<>'cancelled'`),
    db.execute(sql`SELECT m.id,m.title,m.status,m.due_at,to_char(m.due_at AT TIME ZONE 'Africa/Kampala','YYYY-MM-DD') AS due_date,m.responsible_staff_id,m.deliverable,m.mandatory,m.completion_evidence,m.review_feedback,coalesce(s.display_name,s.clerk_user_id) AS responsible,to_char(m.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version FROM project_milestones m LEFT JOIN staff_memberships s ON s.id=m.responsible_staff_id AND s.organization_id=m.organization_id WHERE m.organization_id=${org} AND m.project_id=${projectId}::uuid ORDER BY m.position,m.id LIMIT 100`),
    db.execute(sql`SELECT a.action,a.actor_type,a.created_at,nullif(trim(s.display_name),'') AS actor_name FROM audit_logs a LEFT JOIN staff_memberships s ON s.organization_id=a.organization_id AND s.clerk_user_id=a.actor_clerk_user_id WHERE a.organization_id=${org} AND a.entity_type='project' AND a.entity_id=${projectId} ORDER BY a.created_at DESC,a.id LIMIT 50`),
    permissions.includes("quotations_read") ? db.execute(sql`SELECT q.id,q.number,q.title,v.version,v.status FROM projects p JOIN quotation_versions v ON v.id=p.quotation_version_id AND v.organization_id=p.organization_id JOIN quotations q ON q.id=v.quotation_id AND q.organization_id=v.organization_id WHERE p.id=${projectId}::uuid AND p.organization_id=${org}`) : Promise.resolve(null),
    permissions.includes("invoices_read") ? db.execute(sql`SELECT i.id,i.number,i.status,i.currency,i.total::text AS total,(${balanceExpression})::text AS balance FROM invoices i WHERE i.organization_id=${org} AND i.project_id=${projectId}::uuid ORDER BY i.created_at DESC,i.id LIMIT 50`) : Promise.resolve(null),
    permissions.includes("expenses_read") ? db.execute(sql`SELECT e.id,e.description,e.status,e.currency,e.total::text AS total,
        coalesce((SELECT sum(d.amount) FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded'),0)::text AS disbursed,
        (SELECT count(*)::int FROM document_links l WHERE l.organization_id=e.organization_id AND l.expense_id=e.id) AS documents
      FROM expenses e WHERE e.organization_id=${org} AND e.project_id=${projectId}::uuid ORDER BY e.incurred_at DESC,e.id LIMIT 50`) : Promise.resolve(null),
  ]);
  // Phase 1D: project expenditure per currency (never combined) and recent financial history.
  // Read-only: paying an expense never changes project status, milestones or invoices.
  const [expenseSummary, expenseActivity] = permissions.includes("expenses_read") ? await Promise.all([
    db.execute<{ currency: string; requested: string; approved: string; disbursed: string; outstanding: string; reconciled: string }>(sql`SELECT e.currency,
        coalesce(sum(e.total) FILTER (WHERE e.status='submitted'),0)::text AS requested,
        coalesce(sum(e.total) FILTER (WHERE e.status IN ('approved','paid')),0)::text AS approved,
        coalesce(sum(x.disbursed),0)::text AS disbursed,
        coalesce(sum(e.total-x.disbursed) FILTER (WHERE e.status='approved'),0)::text AS outstanding,
        coalesce(sum(x.reconciled),0)::text AS reconciled
      FROM expenses e CROSS JOIN LATERAL (SELECT coalesce(sum(d.amount),0) AS disbursed,coalesce(sum(d.amount) FILTER (WHERE d.reconciled_at IS NOT NULL),0) AS reconciled FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded') x
      WHERE e.organization_id=${org} AND e.project_id=${projectId}::uuid GROUP BY e.currency ORDER BY e.currency`),
    db.execute(sql`SELECT ev.action,ev.created_at,ev.expense_id,e.description,coalesce(s.display_name,s.clerk_user_id,ev.actor_clerk_user_id) AS actor FROM expense_events ev JOIN expenses e ON e.id=ev.expense_id AND e.organization_id=ev.organization_id LEFT JOIN staff_memberships s ON s.id=ev.actor_staff_id AND s.organization_id=ev.organization_id WHERE ev.organization_id=${org} AND e.project_id=${projectId}::uuid ORDER BY ev.created_at DESC,ev.id LIMIT 30`),
  ]) : [null, null];
  return { manager: manager.rows[0], members: members.rows, tasks: tasks.rows, counts: counts.rows[0], milestones: milestones.rows, activity: activity.rows, quotation: quotation?.rows[0], invoices: invoices?.rows, expenses: expenses?.rows, expenseSummary: expenseSummary?.rows, expenseActivity: expenseActivity?.rows };
}
