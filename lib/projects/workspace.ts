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
    db.execute(sql`SELECT m.id,coalesce(nullif(trim(s.display_name),''),m.external_name,'Staff member') AS name,m.staff_id,m.external_company,m.external_phone,m.external_email,m.responsibility,m.agreed_amount::text AS agreed_amount FROM project_members m LEFT JOIN staff_memberships s ON s.organization_id=m.organization_id AND s.id=m.staff_id WHERE m.organization_id=${org} AND m.project_id=${projectId}::uuid ORDER BY name,m.id LIMIT 100`),
    db.execute(sql`SELECT t.id,t.title,t.status,t.priority,t.mandatory,t.due_at,t.assignee_id,to_char(t.due_at AT TIME ZONE 'Africa/Kampala','YYYY-MM-DD') AS due_date,to_char(t.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version,coalesce(s.display_name,s.clerk_user_id) AS assignee,coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC) FROM (SELECT tc.id,tc.body,tc.created_at,coalesce(author.display_name,author.clerk_user_id) AS author FROM task_comments tc JOIN staff_memberships author ON author.organization_id=tc.organization_id AND author.id=tc.author_id WHERE tc.organization_id=t.organization_id AND tc.task_id=t.id ORDER BY tc.created_at DESC,tc.id LIMIT 10) c),'[]'::jsonb) AS comments FROM tasks t LEFT JOIN staff_memberships s ON s.id=t.assignee_id AND s.organization_id=t.organization_id WHERE t.organization_id=${org} AND t.project_id=${projectId}::uuid ORDER BY t.due_at NULLS LAST,t.id LIMIT 100`),
    db.execute<{ total: number; completed: number }>(sql`SELECT count(*)::int AS total,count(*) FILTER (WHERE status='completed')::int AS completed FROM tasks WHERE organization_id=${org} AND project_id=${projectId}::uuid AND status<>'cancelled'`),
    db.execute(sql`SELECT m.id,m.title,m.status,m.due_at,to_char(m.due_at AT TIME ZONE 'Africa/Kampala','YYYY-MM-DD') AS due_date,m.responsible_staff_id,m.deliverable,m.mandatory,m.completion_evidence,m.review_feedback,coalesce(s.display_name,s.clerk_user_id) AS responsible,to_char(m.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version FROM project_milestones m LEFT JOIN staff_memberships s ON s.id=m.responsible_staff_id AND s.organization_id=m.organization_id WHERE m.organization_id=${org} AND m.project_id=${projectId}::uuid ORDER BY m.position,m.id LIMIT 100`),
    db.execute(sql`SELECT a.action,a.actor_type,a.created_at,nullif(trim(s.display_name),'') AS actor_name FROM audit_logs a LEFT JOIN staff_memberships s ON s.organization_id=a.organization_id AND s.clerk_user_id=a.actor_clerk_user_id WHERE a.organization_id=${org} AND a.entity_type='project' AND a.entity_id=${projectId} ORDER BY a.created_at DESC,a.id LIMIT 50`),
    permissions.includes("quotations_read") ? db.execute(sql`SELECT q.id,q.number,q.title,v.version,v.status FROM projects p JOIN quotation_versions v ON v.id=p.quotation_version_id AND v.organization_id=p.organization_id JOIN quotations q ON q.id=v.quotation_id AND q.organization_id=v.organization_id WHERE p.id=${projectId}::uuid AND p.organization_id=${org}`) : Promise.resolve(null),
    permissions.includes("invoices_read") ? db.execute(sql`SELECT i.id,i.number,i.status,i.currency,i.total::text AS total,(${balanceExpression})::text AS balance FROM invoices i WHERE i.organization_id=${org} AND i.project_id=${projectId}::uuid ORDER BY i.created_at DESC,i.id LIMIT 50`) : Promise.resolve(null),
    permissions.includes("expenses_read") ? db.execute(sql`SELECT e.id,e.description,e.status,e.currency,e.incurred_at,e.total::text AS total,
        coalesce((SELECT sum(d.amount) FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded'),0)::text AS disbursed,
        (SELECT count(*)::int FROM document_links l WHERE l.organization_id=e.organization_id AND l.expense_id=e.id) AS documents
      FROM expenses e WHERE e.organization_id=${org} AND e.project_id=${projectId}::uuid ORDER BY e.incurred_at DESC,e.id LIMIT 50`) : Promise.resolve(null),
  ]);
  // Phase 1D: project expenditure per currency (never combined) and recent financial history.
  // Read-only: paying an expense never changes project status, milestones or invoices.
  const [expenseSummary, expenseActivity, teamPayments, finance] = permissions.includes("expenses_read") ? await Promise.all([
    db.execute<{ currency: string; requested: string; approved: string; disbursed: string; outstanding: string; reconciled: string }>(sql`SELECT e.currency,
        coalesce(sum(e.total) FILTER (WHERE e.status='submitted'),0)::text AS requested,
        coalesce(sum(e.total) FILTER (WHERE e.status IN ('approved','paid')),0)::text AS approved,
        coalesce(sum(x.disbursed),0)::text AS disbursed,
        coalesce(sum(e.total-x.disbursed) FILTER (WHERE e.status='approved'),0)::text AS outstanding,
        coalesce(sum(x.reconciled),0)::text AS reconciled
      FROM expenses e CROSS JOIN LATERAL (SELECT coalesce(sum(d.amount),0) AS disbursed,coalesce(sum(d.amount) FILTER (WHERE d.reconciled_at IS NOT NULL),0) AS reconciled FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded') x
      WHERE e.organization_id=${org} AND e.project_id=${projectId}::uuid GROUP BY e.currency ORDER BY e.currency`),
    db.execute(sql`SELECT ev.action,ev.created_at,ev.expense_id,e.description,coalesce(s.display_name,s.clerk_user_id,ev.actor_clerk_user_id) AS actor FROM expense_events ev JOIN expenses e ON e.id=ev.expense_id AND e.organization_id=ev.organization_id LEFT JOIN staff_memberships s ON s.id=ev.actor_staff_id AND s.organization_id=ev.organization_id WHERE ev.organization_id=${org} AND e.project_id=${projectId}::uuid ORDER BY ev.created_at DESC,ev.id LIMIT 30`),
    // Per-person totals from expense breakdowns (migration 0026), per currency, plus each member's agreed
    // pay (migration 0027, project currency). A share counts as paid once its expense is paid in full;
    // drafts, returned, rejected and void expenses are excluded.
    db.execute<TeamPaymentRow>(sql`WITH lines AS (
        SELECT l.project_member_id AS member_id,e.currency,e.status,l.amount,e.id AS expense_id,e.description,e.incurred_at,
          (SELECT coalesce(jsonb_agg(jsonb_build_object('paidOn',d.paid_on::text,'method',d.method,'reference',d.reference) ORDER BY d.paid_on,d.created_at),'[]'::jsonb)
            FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded') AS payments
        FROM expense_payees l JOIN expenses e ON e.organization_id=l.organization_id AND e.id=l.expense_id
        WHERE l.organization_id=${org} AND e.project_id=${projectId}::uuid AND e.status IN ('submitted','approved','paid')
      ), keys AS (
        SELECT member_id,currency FROM lines
        UNION SELECT m.id,p.currency FROM project_members m JOIN projects p ON p.organization_id=m.organization_id AND p.id=m.project_id
        WHERE m.organization_id=${org} AND m.project_id=${projectId}::uuid AND m.agreed_amount IS NOT NULL
      )
      SELECT m.id AS member_id,coalesce(nullif(trim(s.display_name),''),m.external_name,s.clerk_user_id,'Staff member') AS name,
        nullif(concat_ws(' · ',m.responsibility,m.external_company),'') AS detail,k.currency,
        CASE WHEN k.currency=p.currency THEN m.agreed_amount::text END AS agreed,
        coalesce(sum(l.amount) FILTER (WHERE l.status='paid'),0)::numeric(17,2)::text AS paid,
        coalesce(sum(l.amount) FILTER (WHERE l.status='approved'),0)::numeric(17,2)::text AS approved,
        coalesce(sum(l.amount) FILTER (WHERE l.status='submitted'),0)::numeric(17,2)::text AS pending,
        coalesce(jsonb_agg(jsonb_build_object('expenseId',l.expense_id,'description',l.description,'status',l.status,'amount',l.amount::text,
          'incurredOn',to_char(l.incurred_at AT TIME ZONE 'Africa/Kampala','YYYY-MM-DD'),'payments',l.payments) ORDER BY l.incurred_at DESC,l.expense_id) FILTER (WHERE l.expense_id IS NOT NULL),'[]'::jsonb)
          AS lines
      FROM keys k
      JOIN project_members m ON m.organization_id=${org} AND m.id=k.member_id
      JOIN projects p ON p.organization_id=m.organization_id AND p.id=m.project_id
      LEFT JOIN staff_memberships s ON s.organization_id=m.organization_id AND s.id=m.staff_id
      LEFT JOIN lines l ON l.member_id=k.member_id AND l.currency=k.currency
      GROUP BY m.id,s.id,p.currency,k.currency ORDER BY k.currency,sum(l.amount) FILTER (WHERE l.status='paid') DESC NULLS LAST,name,m.id LIMIT 200`),
    // Project profitability in the project currency. Contract value: the amount an administrator set on the
    // project, else the confirmed quotation total. Spent = approved and paid expenses; team still owed =
    // agreed pay not yet covered by approved or paid shares. Other currencies are reported separately.
    db.execute<ProjectFinanceRow>(sql`SELECT p.currency,p.status,p.completed_at::text AS completed_at,p.budget::text AS contract_set,
        (SELECT v.total::text FROM quotation_versions v WHERE v.organization_id=p.organization_id AND v.id=p.quotation_version_id AND v.currency=p.currency) AS quotation_total,
        coalesce((SELECT sum(e.total) FROM expenses e WHERE e.organization_id=p.organization_id AND e.project_id=p.id AND e.currency=p.currency AND e.status IN ('approved','paid')),0)::numeric(17,2)::text AS spent,
        coalesce((SELECT sum(e.total) FROM expenses e WHERE e.organization_id=p.organization_id AND e.project_id=p.id AND e.currency=p.currency AND e.status='submitted'),0)::numeric(17,2)::text AS pending,
        coalesce((SELECT sum(d.amount) FROM expense_disbursements d JOIN expenses e ON e.organization_id=d.organization_id AND e.id=d.expense_id
          WHERE d.organization_id=p.organization_id AND e.project_id=p.id AND d.currency=p.currency AND d.status='recorded'),0)::numeric(17,2)::text AS paid_out,
        coalesce((SELECT sum(m.agreed_amount) FROM project_members m WHERE m.organization_id=p.organization_id AND m.project_id=p.id),0)::numeric(17,2)::text AS team_agreed,
        coalesce((SELECT sum(greatest(m.agreed_amount-coalesce((SELECT sum(l.amount) FROM expense_payees l JOIN expenses e ON e.organization_id=l.organization_id AND e.id=l.expense_id
            WHERE l.organization_id=m.organization_id AND l.project_member_id=m.id AND e.currency=p.currency AND e.status IN ('approved','paid')),0),0))
          FROM project_members m WHERE m.organization_id=p.organization_id AND m.project_id=p.id AND m.agreed_amount IS NOT NULL),0)::numeric(17,2)::text AS team_owed,
        (SELECT string_agg(x.currency||' '||x.total::text,', ' ORDER BY x.currency) FROM (SELECT e.currency,sum(e.total)::numeric(17,2) AS total FROM expenses e
          WHERE e.organization_id=p.organization_id AND e.project_id=p.id AND e.currency<>p.currency AND e.status IN ('approved','paid') GROUP BY e.currency) x) AS other_currency_spent,
        ${permissions.includes("invoices_read") ? sql`coalesce((SELECT sum(i.total) FROM invoices i WHERE i.organization_id=p.organization_id AND i.project_id=p.id AND i.currency=p.currency AND i.status='issued'),0)::numeric(17,2)::text` : sql`NULL::text`} AS invoiced,
        ${permissions.includes("invoices_read") ? sql`coalesce((SELECT sum(${balanceExpression}) FROM invoices i WHERE i.organization_id=p.organization_id AND i.project_id=p.id AND i.currency=p.currency AND i.status='issued'),0)::numeric(17,2)::text` : sql`NULL::text`} AS invoice_balance
      FROM projects p WHERE p.organization_id=${org} AND p.id=${projectId}::uuid`),
  ]) : [null, null, null, null];
  return { manager: manager.rows[0], members: members.rows, tasks: tasks.rows, counts: counts.rows[0], milestones: milestones.rows, activity: activity.rows, quotation: quotation?.rows[0], invoices: invoices?.rows, expenses: expenses?.rows, expenseSummary: expenseSummary?.rows, expenseActivity: expenseActivity?.rows, teamPayments: teamPayments?.rows, finance: finance?.rows[0] };
}

export type ProjectFinanceRow = {
  currency: string; status: string; completed_at: string | null; contract_set: string | null; quotation_total: string | null;
  spent: string; pending: string; paid_out: string; team_agreed: string; team_owed: string; other_currency_spent: string | null;
  invoiced: string | null; invoice_balance: string | null;
};

export type TeamPaymentRow = {
  member_id: string; name: string; detail: string | null; currency: string; agreed: string | null; paid: string; approved: string; pending: string;
  lines: { expenseId: string; description: string; status: string; amount: string; incurredOn: string; payments: { paidOn: string; method: string; reference: string | null }[] }[];
}
