import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { financeContext } from "@/lib/finance/context";

/*
 * Phase 2D payroll reads. Salary data needs payroll_admin or payroll_approve: staff-directory,
 * accounting, banking and tax permissions never reveal it. Payment accounts are stored as the last four
 * characters only. Runs are simulations; nothing is approved, paid or posted in this phase.
 */
export async function readPayroll() {
  const ctx = await financeContext(["payroll_admin", "payroll_approve"]);
  const org = ctx.organizationId;
  const me = (await db.execute<{ id: string }>(sql`SELECT id FROM staff_memberships WHERE organization_id=${org} AND clerk_user_id=${ctx.actor} AND status='active'`)).rows[0]?.id ?? null;
  const [profiles, components, structures, runs, staff, obligations, accounts] = await Promise.all([
    db.execute<{ id: string; person_name: string; engagement_type: string; employee_number: string; start_date: string; end_date: string | null; status: string; staff: string | null; payment_method: string; payment_account_last4: string | null; has_tin: boolean; has_nssf: boolean; prepared_by_id: string }>(sql`
      SELECT p.id,p.person_name,p.engagement_type,p.employee_number,p.start_date::text,p.end_date::text,p.status,coalesce(s.display_name,s.clerk_user_id) AS staff,p.payment_method,p.payment_account_last4,
        p.tin IS NOT NULL AS has_tin,p.nssf_number IS NOT NULL AS has_nssf,p.prepared_by_id
      FROM payroll_profiles p LEFT JOIN staff_memberships s ON s.organization_id=p.organization_id AND s.id=p.staff_id WHERE p.organization_id=${org} ORDER BY p.status,p.employee_number`),
    db.execute<{ id: string; code: string; name: string; kind: string; taxable: boolean; statutory: string | null; status: string; proposed_by_id: string }>(sql`SELECT id,code,name,kind,taxable,statutory,status,proposed_by_id FROM payroll_components WHERE organization_id=${org} ORDER BY status,code`),
    db.execute<{ id: string; profile_id: string; person_name: string; effective_from: string; currency: string; lines: { componentCode: string; amount: string }[]; status: string; prepared_by_id: string }>(sql`
      SELECT s.id,s.profile_id,p.person_name,s.effective_from::text,s.currency,s.lines,s.status,s.prepared_by_id FROM payroll_salary_structures s JOIN payroll_profiles p ON p.organization_id=s.organization_id AND p.id=s.profile_id
      WHERE s.organization_id=${org} ORDER BY s.created_at DESC LIMIT 200`),
    db.execute<{ id: string; period_start: string; period_end: string; totals: Record<string, string | number>; problems: string[]; created_at: string; payslips: { employee: string; gross: string; netBeforeStatutory: string }[] }>(sql`
      SELECT r.id,r.period_start::text,r.period_end::text,r.totals,r.problems,r.created_at::text,
        coalesce((SELECT jsonb_agg(jsonb_build_object('employee',x.payload->>'employee','gross',x.gross::text,'netBeforeStatutory',x.net_before_statutory::text)) FROM payroll_payslips x WHERE x.organization_id=r.organization_id AND x.run_id=r.id),'[]'::jsonb) AS payslips
      FROM payroll_runs r WHERE r.organization_id=${org} ORDER BY r.created_at DESC LIMIT 24`),
    db.execute<{ id: string; name: string }>(sql`SELECT id,coalesce(display_name,clerk_user_id) AS name FROM staff_memberships WHERE organization_id=${org} AND status='active' ORDER BY 2 LIMIT 200`),
    db.execute<{ tax_type: string; registration_status: string; processing_enabled: boolean }>(sql`SELECT tax_type,registration_status,processing_enabled FROM tax_obligation_versions WHERE organization_id=${org} AND status='approved' AND tax_type IN ('paye','nssf')`),
    db.execute<{ id: string; code: string; name: string; account_type: string }>(sql`SELECT id,code,name,account_type FROM accounting_accounts WHERE organization_id=${org} AND status='active' AND is_postable AND account_type IN ('operating_expense','cost_of_sales','liability') ORDER BY code`),
  ]);
  return { can: { admin: ctx.can("payroll_admin"), approve: ctx.can("payroll_approve") }, me, profiles: profiles.rows, components: components.rows, structures: structures.rows, runs: runs.rows, staff: staff.rows, obligations: obligations.rows, accounts: accounts.rows };
}
