import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { notFound } from "next/navigation";
import { db } from "@/database/db";
import { literalSearch, parseQuery } from "@/lib/sales/contracts";
import { actorStaffId, financeContext } from "./context";
import { effectiveSettings } from "@/lib/admin/settings";
import { expenseStatuses, expenseViews, type ExpenseView } from "./options";
import { cacheKeyContext, adminCache, type CacheKeyContext } from "@/lib/cache-tags";

export type SearchParams = Record<string, string | string[] | undefined>;
const one = (raw: SearchParams, k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");

/** Amount columns shared by list, detail and project reads. Money never crosses currencies. */
export const expenseAmounts = sql`
  coalesce((SELECT sum(d.amount) FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded'),0) AS disbursed,
  coalesce((SELECT sum(d.amount) FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded' AND d.reconciled_at IS NOT NULL),0) AS reconciled`;

export type ExpenseListRow = {
  id: string; description: string; category: string; division: string; supplier: string | null; project: string | null; project_id: string | null;
  total: string; currency: string; status: string; incurred_on: string; requester: string | null; requested_by_id: string | null;
  disbursed: string; reconciled: string; outstanding: string; submitted_at: string | null; legacy_paid: boolean;
};

export async function readExpenseList(raw: SearchParams) {
  const ctx = await financeContext(["expenses_read", "expenses_create"]);
  return cachedReadExpenseList(cacheKeyContext(ctx), raw);
}
/** Cached per organization, caller context and inputs; expired on writes (lib/cache-tags.ts). */
async function cachedReadExpenseList(ctx: CacheKeyContext<Awaited<ReturnType<typeof financeContext>>>, raw: SearchParams) {
  "use cache: remote";
  adminCache(ctx.organizationId);
  const org = ctx.organizationId;
  const me = await actorStaffId(org, ctx.actor);
  const canAll = ctx.permissions.includes("expenses_read");
  const canReview = ctx.permissions.includes("expenses_review") || ctx.permissions.includes("expenses_approve");
  const canPay = ctx.permissions.includes("expenses_disburse");
  const q = parseQuery(raw);
  const requested = one(raw, "view") as ExpenseView;
  const defaultView: ExpenseView = canReview ? "review" : canAll ? "all" : "mine";
  let view: ExpenseView = expenseViews.includes(requested) ? requested : defaultView;
  if (!canAll) view = "mine";
  const status = expenseStatuses.includes(one(raw, "status") as never) ? one(raw, "status") : "";
  const projectId = z.uuid().safeParse(one(raw, "projectId")).success ? one(raw, "projectId") : "";
  const where: SQL[] = [];
  if (view === "mine") where.push(me ? sql`requested_by_id=${me}::uuid` : sql`false`);
  if (view === "review") where.push(sql`status='submitted'`);
  if (view === "payable") where.push(sql`status='approved'`);
  if (status) where.push(sql`status=${status}`);
  if (q.division) where.push(sql`division=${q.division}`);
  if (q.currency) where.push(sql`currency=${q.currency}`);
  if (projectId) where.push(sql`project_id=${projectId}::uuid`);
  if (q.from) where.push(sql`incurred_on>=${q.from}::date`);
  if (q.to) where.push(sql`incurred_on<=${q.to}::date`);
  if (q.search) {
    const s = literalSearch(q.search);
    where.push(sql`(description ILIKE ${s} OR category ILIKE ${s} OR coalesce(supplier,'') ILIKE ${s} OR coalesce(project,'') ILIKE ${s} OR coalesce(requester,'') ILIKE ${s})`);
  }
  const base = sql`SELECT e.id,e.description,e.category,e.division,s.name AS supplier,p.name AS project,e.project_id,e.total::text AS total,e.currency,e.status,
      to_char(e.incurred_at AT TIME ZONE 'Africa/Kampala','YYYY-MM-DD') AS incurred_on,coalesce(r.display_name,r.clerk_user_id) AS requester,e.requested_by_id,e.submitted_at::text AS submitted_at,
      ${expenseAmounts}
    FROM expenses e
    LEFT JOIN suppliers s ON s.id=e.supplier_id AND s.organization_id=e.organization_id
    LEFT JOIN projects p ON p.id=e.project_id AND p.organization_id=e.organization_id
    LEFT JOIN staff_memberships r ON r.id=e.requested_by_id AND r.organization_id=e.organization_id
    WHERE e.organization_id=${org}`;
  const wrapped = sql`SELECT b.id,b.description,b.category,b.division,b.supplier,b.project,b.project_id,b.total,b.currency,b.status,b.incurred_on,b.requester,b.requested_by_id,b.submitted_at,
      (CASE WHEN b.status='approved' THEN b.total::numeric-b.disbursed ELSE 0 END)::text AS outstanding,
      (b.status='paid' AND b.disbursed=0) AS legacy_paid,b.disbursed::text AS disbursed,b.reconciled::text AS reconciled FROM (${base}) b
      ${where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``}`;
  const count = await db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM (${wrapped}) w`);
  const total = count.rows[0]?.count ?? 0;
  const page = Math.min(q.page, Math.max(1, Math.ceil(total / q.size)));
  const [rows, summary, counts] = await Promise.all([
    db.execute<ExpenseListRow>(sql`SELECT * FROM (${wrapped}) w ORDER BY CASE WHEN status='submitted' THEN submitted_at END ASC NULLS LAST,incurred_on DESC,id LIMIT ${q.size} OFFSET ${(page - 1) * q.size}`),
    db.execute<{ currency: string; requested: string; approved: string; disbursed: string; outstanding: string }>(sql`SELECT currency,
        coalesce(sum(total::numeric) FILTER (WHERE status='submitted'),0)::text AS requested,
        coalesce(sum(total::numeric) FILTER (WHERE status IN ('approved','paid')),0)::text AS approved,
        coalesce(sum(disbursed::numeric),0)::text AS disbursed,
        coalesce(sum(outstanding::numeric),0)::text AS outstanding
      FROM (${wrapped}) w GROUP BY currency ORDER BY currency`),
    db.execute<{ review: number; payable: number; mine_returned: number }>(sql`SELECT
        count(*) FILTER (WHERE status='submitted')::int AS review,
        count(*) FILTER (WHERE status='approved')::int AS payable,
        count(*) FILTER (WHERE status='returned' AND requested_by_id=${me}::uuid)::int AS mine_returned
      FROM expenses WHERE organization_id=${org} ${canAll ? sql`` : sql`AND requested_by_id=${me}::uuid`}`),
  ]);
  const exceptions = canAll && (canPay || canReview || ctx.permissions.includes("expenses_reconcile")) ? await readExpenseExceptions(org) : [];
  return {
    rows: rows.rows, total, page, size: q.size, summary: summary.rows, counts: counts.rows[0], exceptions,
    view, canAll, canReview, canPay, canCreate: ctx.permissions.includes("expenses_create"),
    filters: { view, search: q.search, status, division: q.division, currency: q.currency, from: q.from, to: q.to, projectId },
  };
}

export async function readExpenseDetail(id: string) {
  const ctx = await financeContext(["expenses_read", "expenses_create"]);
  if (!z.uuid().safeParse(id).success) notFound();
  const org = ctx.organizationId;
  const me = await actorStaffId(org, ctx.actor);
  const r = await db.execute<Record<string, unknown> & { requested_by_id: string | null; status: string; version: number; currency: string; total: string; disbursed: string; reconciled: string; project_id: string | null }>(sql`SELECT e.*,e.total::text AS total,e.net_amount::text AS net_amount,e.tax_amount::text AS tax_amount,
      to_char(e.incurred_at AT TIME ZONE 'Africa/Kampala','YYYY-MM-DD') AS incurred_on,s.name AS supplier,p.name AS project,p.code AS project_code,
      coalesce(r.display_name,r.clerk_user_id) AS requester,coalesce(a.display_name,a.clerk_user_id) AS approver,coalesce(v.display_name,v.clerk_user_id) AS reviewer,
      ${expenseAmounts}
    FROM expenses e
    LEFT JOIN suppliers s ON s.id=e.supplier_id AND s.organization_id=e.organization_id
    LEFT JOIN projects p ON p.id=e.project_id AND p.organization_id=e.organization_id
    LEFT JOIN staff_memberships r ON r.id=e.requested_by_id AND r.organization_id=e.organization_id
    LEFT JOIN staff_memberships a ON a.id=e.approved_by_id AND a.organization_id=e.organization_id
    LEFT JOIN staff_memberships v ON v.id=e.reviewed_by_id AND v.organization_id=e.organization_id
    WHERE e.id=${id}::uuid AND e.organization_id=${org}`);
  const expense = r.rows[0];
  if (!expense) notFound();
  const isRequester = !!me && expense.requested_by_id === me;
  // Least privilege: without expenses_read, staff only see their own requests.
  if (!ctx.can("expenses_read") && !isRequester) notFound();
  const [disbursements, documents, history, staff, accounts] = await Promise.all([
    db.execute(sql`SELECT d.id,d.amount::text AS amount,d.currency,d.method,d.reference,(SELECT fa.label||' ('||fa.provider||')' FROM finance_accounts fa WHERE fa.id=d.source_account_id AND fa.organization_id=d.organization_id) AS source_account,d.paid_on::text AS paid_on,d.status,d.notes,d.void_reason,d.reconciled_at::text AS reconciled_at,d.reconciliation_reference,d.evidence_document_id,d.recorded_by_id,
        coalesce(rs.display_name,rs.clerk_user_id) AS responsible,coalesce(rb.display_name,rb.clerk_user_id) AS recorded_by,coalesce(rc.display_name,rc.clerk_user_id) AS reconciled_by,d.created_at::text AS created_at
      FROM expense_disbursements d
      LEFT JOIN staff_memberships rs ON rs.id=d.responsible_staff_id AND rs.organization_id=d.organization_id
      LEFT JOIN staff_memberships rb ON rb.id=d.recorded_by_id AND rb.organization_id=d.organization_id
      LEFT JOIN staff_memberships rc ON rc.id=d.reconciled_by_id AND rc.organization_id=d.organization_id
      WHERE d.organization_id=${org} AND d.expense_id=${id}::uuid ORDER BY d.created_at,d.id`),
    db.execute(sql`SELECT doc.id,doc.name,doc.mime_type,doc.size_bytes::text AS size_bytes,doc.created_at::text AS created_at FROM document_links l JOIN documents doc ON doc.id=l.document_id AND doc.organization_id=l.organization_id WHERE l.organization_id=${org} AND l.expense_id=${id}::uuid AND doc.archived_at IS NULL ORDER BY doc.created_at,doc.id LIMIT 50`),
    db.execute(sql`SELECT ev.id,ev.action,ev.from_status,ev.to_status,ev.note,ev.changes,ev.created_at::text AS created_at,coalesce(s.display_name,s.clerk_user_id,ev.actor_clerk_user_id) AS actor FROM expense_events ev LEFT JOIN staff_memberships s ON s.id=ev.actor_staff_id AND s.organization_id=ev.organization_id WHERE ev.organization_id=${org} AND ev.expense_id=${id}::uuid ORDER BY ev.created_at DESC,ev.id LIMIT 100`),
    ctx.can("expenses_disburse") ? db.execute<{ id: string; name: string }>(sql`SELECT id,coalesce(display_name,clerk_user_id) AS name FROM staff_memberships WHERE organization_id=${org} AND status='active' ORDER BY name,id LIMIT 100`) : Promise.resolve({ rows: [] as { id: string; name: string }[] }),
    // Active verified source accounts in the expense currency (approved reference policy).
    ctx.can("expenses_disburse") ? db.execute<{ id: string; method: string; label: string }>(sql`SELECT id,method,label||' - '||provider||' '||account_identifier AS label FROM finance_accounts WHERE organization_id=${org} AND status='active' AND currency=${expense.currency} ORDER BY method,label,id LIMIT 100`) : Promise.resolve({ rows: [] as { id: string; method: string; label: string }[] }),
  ]);
  const status = expense.status;
  const own = isRequester;
  return {
    expense, disbursements: disbursements.rows, documents: documents.rows, history: history.rows, staff: staff.rows, accounts: accounts.rows, me,
    can: {
      edit: own && ctx.can("expenses_create") && ["draft", "returned"].includes(status),
      submit: own && ctx.can("expenses_submit") && ["draft", "returned"].includes(status),
      withdraw: own && ctx.can("expenses_create") && status === "submitted",
      cancel: own && ctx.can("expenses_create") && ["draft", "returned"].includes(status),
      review: !own && status === "submitted" && !!expense.requested_by_id && (ctx.can("expenses_review") || ctx.can("expenses_approve")),
      approve: !own && status === "submitted" && !!expense.requested_by_id && ctx.can("expenses_approve"),
      returnOrReject: !own && status === "submitted" && !!expense.requested_by_id && ctx.can("expenses_review"),
      disburse: !own && status === "approved" && ctx.can("expenses_disburse"),
      voidDisbursement: ctx.can("expenses_disburse"),
      reconcile: ctx.can("expenses_reconcile"),
      uploadAsRequester: own && ctx.can("expenses_create") && ["draft", "returned"].includes(status),
      uploadAsFinance: ctx.can("expenses_disburse") && ["approved", "paid"].includes(status),
    },
  };
}

/** Options for the request form: projects (non-archived) and active suppliers. */
export async function expenseFormOptions() {
  const ctx = await financeContext(["expenses_create"]);
  const org = ctx.organizationId;
  const [projects, suppliers] = await Promise.all([
    db.execute<{ id: string; name: string; code: string; division: string; currency: string }>(sql`SELECT id,name,code,division,currency FROM projects WHERE organization_id=${org} AND archived_at IS NULL ORDER BY CASE WHEN status IN ('planned','active','on_hold') THEN 0 ELSE 1 END,name,id LIMIT 300`),
    db.execute<{ id: string; name: string }>(sql`SELECT id,name FROM suppliers WHERE organization_id=${org} AND archived_at IS NULL ORDER BY name,id LIMIT 500`),
  ]);
  // Phase 1E company settings: enabled divisions (with display names) and default currency.
  const settings = await effectiveSettings(org);
  const divisionOptions = (settings?.divisions ?? ["estates", "architecture", "painting", "interiors", "tech"].map((key) => ({ key, label: key, enabled: true }))).filter((d) => d.enabled).map((d) => ({ key: d.key, label: d.label }));
  return { projects: projects.rows, suppliers: suppliers.rows, divisionOptions, defaultCurrency: settings?.defaults.defaultCurrency ?? "UGX" };
}

/** Exceptions for finance staff on the expenses workspace. */
export async function readExpenseExceptions(org: string) {
  "use cache: remote";
  adminCache(org);
  const r = await db.execute<{ kind: string; count: number }>(sql`
    SELECT 'paid_without_disbursement' AS kind,count(*)::int AS count FROM expenses e WHERE e.organization_id=${org} AND e.status='paid' AND NOT EXISTS(SELECT 1 FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded')
    UNION ALL SELECT 'unreconciled_over_30_days',count(*)::int FROM expense_disbursements d WHERE d.organization_id=${org} AND d.status='recorded' AND d.reconciled_at IS NULL AND d.paid_on<finance_kampala_today()-30
    UNION ALL SELECT 'cash_without_reference_or_evidence',count(*)::int FROM expense_disbursements d WHERE d.organization_id=${org} AND d.status='recorded' AND d.method='cash' AND d.reference IS NULL AND d.evidence_document_id IS NULL
    UNION ALL SELECT 'pending_review_over_7_days',count(*)::int FROM expenses e WHERE e.organization_id=${org} AND e.status='submitted' AND e.submitted_at<now()-interval '7 days'`);
  return r.rows.filter((x) => x.count > 0);
}
