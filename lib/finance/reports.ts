import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { balanceExpression, listBase } from "@/lib/sales/queries";
import { financeContext } from "./context";
import { cacheKeyContext, adminCache } from "@/lib/cache-tags";

export type SearchParams = Record<string, string | string[] | undefined>;
const one = (raw: SearchParams, k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
const divisions = ["estates", "architecture", "painting", "interiors", "tech"] as const;

export function reportFilters(raw: SearchParams, today: string) {
  const date = (v: string) => (z.iso.date().safeParse(v).success ? v : "");
  let from = date(one(raw, "from")) || `${today.slice(0, 8)}01`;
  let to = date(one(raw, "to")) || today;
  if (from > to) [from, to] = [to, from];
  // Bound report cost: at most ~3 years per request.
  const maxFrom = new Date(Date.parse(`${to}T00:00:00Z`) - 3 * 366 * 86400000).toISOString().slice(0, 10);
  if (from < maxFrom) from = maxFrom;
  const division = divisions.includes(one(raw, "division") as never) ? one(raw, "division") : "";
  const currency = ["UGX", "USD"].includes(one(raw, "currency")) ? one(raw, "currency") : "";
  const projectId = z.uuid().safeParse(one(raw, "projectId")).success ? one(raw, "projectId") : "";
  return { from, to, division, currency, projectId };
}
export type ReportFilters = ReturnType<typeof reportFilters>;

const kampala = (col: SQL) => sql`(${col} AT TIME ZONE 'Africa/Kampala')::date`;

/**
 * Operational financial reports. Every amount is grouped by currency; UGX and USD are never
 * combined (no approved conversion method exists). These are management reports from
 * operational records, not accounting statements: there is no general ledger, revenue
 * recognition policy or accrual accounting in this system.
 */
export async function readFinancialReports(raw: SearchParams) {
  const ctx = await financeContext(["finance_reports"]);
  return cachedReadFinancialReports(cacheKeyContext(ctx), raw);
}
/** Cached per organization, caller context and inputs; expired on writes (lib/cache-tags.ts). */
async function cachedReadFinancialReports(ctx: Awaited<ReturnType<typeof financeContext>>, raw: SearchParams) {
  "use cache: remote";
  adminCache(ctx.organizationId);
  const org = ctx.organizationId;
  const today = (await db.execute<{ d: string }>(sql`SELECT finance_kampala_today()::text AS d`)).rows[0].d;
  const f = reportFilters(raw, today);
  const range = (col: SQL) => sql`${kampala(col)} BETWEEN ${f.from}::date AND ${f.to}::date`;
  const cur = (col: SQL) => (f.currency ? sql`AND ${col}=${f.currency}` : sql``);
  // Project/division scope for invoice-side figures; invoices without a project have no division.
  const invoiceScope = (alias: string) => {
    const parts: SQL[] = [];
    if (f.projectId) parts.push(sql`${sql.raw(alias)}.project_id=${f.projectId}::uuid`);
    if (f.division) parts.push(sql`EXISTS(SELECT 1 FROM projects sp WHERE sp.organization_id=${sql.raw(alias)}.organization_id AND sp.id=${sql.raw(alias)}.project_id AND sp.division=${f.division})`);
    return parts.length ? sql`AND ${sql.join(parts, sql` AND `)}` : sql``;
  };
  const expenseScope = sql`${f.division ? sql`AND e.division=${f.division}` : sql``} ${f.projectId ? sql`AND e.project_id=${f.projectId}::uuid` : sql``} ${cur(sql`e.currency`)}`;
  const scoped = !!(f.division || f.projectId);

  const [receipts, refunds, invoiced, credits, outstanding, byCategory, byDivision, byProject, pipeline, disbursed, projects, monthly, projectOptions] = await Promise.all([
    // Confirmed customer receipts by received date. With a project/division filter only the
    // portion allocated to that scope's invoices can be attributed.
    scoped
      ? db.execute<{ currency: string; count: number; amount: string }>(sql`SELECT a.currency,count(DISTINCT p.id)::int AS count,sum(a.amount)::text AS amount FROM payment_allocations a JOIN payments p ON p.id=a.payment_id AND p.organization_id=a.organization_id JOIN invoices i ON i.id=a.invoice_id AND i.organization_id=a.organization_id WHERE a.organization_id=${org} AND p.status='confirmed' AND ${range(sql`p.received_at`)} ${invoiceScope("i")} ${cur(sql`a.currency`)} GROUP BY a.currency ORDER BY a.currency`)
      : db.execute<{ currency: string; count: number; amount: string }>(sql`SELECT currency,count(*)::int AS count,sum(amount)::text AS amount FROM payments WHERE organization_id=${org} AND status='confirmed' AND ${range(sql`received_at`)} ${cur(sql`currency`)} GROUP BY currency ORDER BY currency`),
    scoped ? Promise.resolve({ rows: [] as { currency: string; amount: string }[] }) : db.execute<{ currency: string; amount: string }>(sql`SELECT currency,sum(amount)::text AS amount FROM payment_refunds WHERE organization_id=${org} AND status='completed' AND ${range(sql`completed_at`)} ${cur(sql`currency`)} GROUP BY currency ORDER BY currency`),
    db.execute<{ currency: string; count: number; amount: string }>(sql`SELECT i.currency,count(*)::int AS count,sum(i.total)::text AS amount FROM invoices i WHERE i.organization_id=${org} AND i.status='issued' AND ${range(sql`i.issued_at`)} ${invoiceScope("i")} ${cur(sql`i.currency`)} GROUP BY i.currency ORDER BY i.currency`),
    db.execute<{ currency: string; amount: string }>(sql`SELECT c.currency,sum(c.total)::text AS amount FROM credit_notes c JOIN invoices i ON i.id=c.invoice_id AND i.organization_id=c.organization_id WHERE c.organization_id=${org} AND c.status='issued' AND ${range(sql`c.issued_at`)} ${invoiceScope("i")} ${cur(sql`c.currency`)} GROUP BY c.currency ORDER BY c.currency`),
    // Balances are as of now and reuse the sales ledger list query (balance + overdue rule).
    db.execute<{ currency: string; outstanding: string; overdue: string; invoices: number }>(sql`WITH b AS (${listBase(org, "invoices")}) SELECT b.currency,coalesce(sum(b.balance::numeric),0)::text AS outstanding,coalesce(sum(b.balance::numeric) FILTER (WHERE b.payment='overdue'),0)::text AS overdue,count(*) FILTER (WHERE b.balance::numeric>0)::int AS invoices FROM b JOIN invoices i ON i.id=b.id AND i.organization_id=${org} WHERE b.status='issued' ${invoiceScope("i")} ${cur(sql`b.currency`)} GROUP BY b.currency ORDER BY b.currency`),
    expenseGroups(org, sql`e.category`, range, expenseScope),
    expenseGroups(org, sql`e.division`, range, expenseScope),
    expenseGroups(org, sql`coalesce(p.code||' '||p.name,'No project')`, range, expenseScope),
    db.execute<{ currency: string; pending: string; approved: string; outstanding: string; legacy_paid: string }>(sql`SELECT e.currency,
        coalesce(sum(e.total) FILTER (WHERE e.status='submitted'),0)::text AS pending,
        coalesce(sum(e.total) FILTER (WHERE e.status IN ('approved','paid')),0)::text AS approved,
        coalesce(sum(e.total-coalesce((SELECT sum(d.amount) FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded'),0)) FILTER (WHERE e.status='approved'),0)::text AS outstanding,
        coalesce(sum(e.total) FILTER (WHERE e.status='paid' AND NOT EXISTS(SELECT 1 FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded')),0)::text AS legacy_paid
      FROM expenses e WHERE e.organization_id=${org} AND ${range(sql`e.incurred_at`)} ${expenseScope} GROUP BY e.currency ORDER BY e.currency`),
    db.execute<{ currency: string; count: number; amount: string; reconciled: string }>(sql`SELECT d.currency,count(*)::int AS count,sum(d.amount)::text AS amount,coalesce(sum(d.amount) FILTER (WHERE d.reconciled_at IS NOT NULL),0)::text AS reconciled FROM expense_disbursements d JOIN expenses e ON e.id=d.expense_id AND e.organization_id=d.organization_id WHERE d.organization_id=${org} AND d.status='recorded' AND d.paid_on BETWEEN ${f.from}::date AND ${f.to}::date ${expenseScope} GROUP BY d.currency ORDER BY d.currency`),
    // Project summaries are lifetime-to-date (not limited to the selected period).
    db.execute<{ id: string; code: string; name: string; currency: string; invoiced: string; collected: string; outstanding: string; approved: string; disbursed: string }>(sql`WITH scope AS (SELECT p.id,p.code,p.name FROM projects p WHERE p.organization_id=${org} AND p.archived_at IS NULL ${f.division ? sql`AND p.division=${f.division}` : sql``} ${f.projectId ? sql`AND p.id=${f.projectId}::uuid` : sql``}),
      inv AS (SELECT i.project_id,i.currency,sum(i.total) AS invoiced,sum(${balanceExpression}) AS outstanding,
          sum(coalesce((SELECT sum(a.amount) FROM payment_allocations a JOIN payments pp ON pp.id=a.payment_id AND pp.organization_id=a.organization_id WHERE a.organization_id=i.organization_id AND a.invoice_id=i.id AND pp.status='confirmed'),0)) AS collected
        FROM invoices i WHERE i.organization_id=${org} AND i.status='issued' AND i.project_id IN (SELECT id FROM scope) GROUP BY i.project_id,i.currency),
      exp AS (SELECT e.project_id,e.currency,sum(e.total) AS approved,sum(coalesce((SELECT sum(d.amount) FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded'),0)) AS disbursed
        FROM expenses e WHERE e.organization_id=${org} AND e.status IN ('approved','paid') AND e.project_id IN (SELECT id FROM scope) GROUP BY e.project_id,e.currency),
      keys AS (SELECT project_id,currency FROM inv UNION SELECT project_id,currency FROM exp)
      SELECT s.id,s.code,s.name,k.currency,coalesce(inv.invoiced,0)::text AS invoiced,coalesce(inv.collected,0)::text AS collected,coalesce(inv.outstanding,0)::text AS outstanding,coalesce(exp.approved,0)::text AS approved,coalesce(exp.disbursed,0)::text AS disbursed
      FROM keys k JOIN scope s ON s.id=k.project_id LEFT JOIN inv ON inv.project_id=k.project_id AND inv.currency=k.currency LEFT JOIN exp ON exp.project_id=k.project_id AND exp.currency=k.currency
      WHERE true ${cur(sql`k.currency`)} ORDER BY s.code,k.currency LIMIT 200`),
    db.execute<{ month: string; currency: string; invoiced: string; receipts: string; approved: string; disbursed: string }>(sql`WITH activity AS (
        SELECT to_char(${kampala(sql`i.issued_at`)},'YYYY-MM') AS month,i.currency,i.total AS invoiced,0::numeric AS receipts,0::numeric AS approved,0::numeric AS disbursed FROM invoices i WHERE i.organization_id=${org} AND i.status='issued' AND ${range(sql`i.issued_at`)} ${invoiceScope("i")}
        UNION ALL ${scoped
          ? sql`SELECT to_char(${kampala(sql`p.received_at`)},'YYYY-MM'),a.currency,0,a.amount,0,0 FROM payment_allocations a JOIN payments p ON p.id=a.payment_id AND p.organization_id=a.organization_id JOIN invoices i ON i.id=a.invoice_id AND i.organization_id=a.organization_id WHERE a.organization_id=${org} AND p.status='confirmed' AND ${range(sql`p.received_at`)} ${invoiceScope("i")}`
          : sql`SELECT to_char(${kampala(sql`received_at`)},'YYYY-MM'),currency,0,amount,0,0 FROM payments WHERE organization_id=${org} AND status='confirmed' AND ${range(sql`received_at`)}`}
        UNION ALL SELECT to_char(${kampala(sql`e.incurred_at`)},'YYYY-MM'),e.currency,0,0,e.total,0 FROM expenses e WHERE e.organization_id=${org} AND e.status IN ('approved','paid') AND ${range(sql`e.incurred_at`)} ${expenseScope}
        UNION ALL SELECT to_char(d.paid_on,'YYYY-MM'),d.currency,0,0,0,d.amount FROM expense_disbursements d JOIN expenses e ON e.id=d.expense_id AND e.organization_id=d.organization_id WHERE d.organization_id=${org} AND d.status='recorded' AND d.paid_on BETWEEN ${f.from}::date AND ${f.to}::date ${expenseScope})
      SELECT month,currency,sum(invoiced)::text AS invoiced,sum(receipts)::text AS receipts,sum(approved)::text AS approved,sum(disbursed)::text AS disbursed FROM activity WHERE true ${cur(sql`currency`)} GROUP BY month,currency ORDER BY month,currency`),
    db.execute<{ id: string; label: string }>(sql`SELECT id,code||' '||name AS label FROM projects WHERE organization_id=${org} AND archived_at IS NULL ORDER BY code,id LIMIT 300`),
  ]);
  return {
    filters: f, today, scoped,
    receipts: receipts.rows, refunds: refunds.rows, invoiced: invoiced.rows, credits: credits.rows, outstanding: outstanding.rows,
    byCategory: byCategory.rows, byDivision: byDivision.rows, byProject: byProject.rows,
    pipeline: pipeline.rows, disbursed: disbursed.rows, projects: projects.rows, monthly: monthly.rows, projectOptions: projectOptions.rows,
  };
}

export type ExpenseGroupRow = { label: string; currency: string; count: number; approved: string; disbursed: string; outstanding: string };
function expenseGroups(org: string, label: SQL, range: (c: SQL) => SQL, scope: SQL) {
  return db.execute<ExpenseGroupRow>(sql`SELECT label,currency,count(*)::int AS count,sum(total)::text AS approved,sum(disbursed)::text AS disbursed,sum(CASE WHEN status='approved' THEN total-disbursed ELSE 0 END)::text AS outstanding FROM (
      SELECT ${label} AS label,e.currency,e.total,e.status,coalesce((SELECT sum(d.amount) FROM expense_disbursements d WHERE d.organization_id=e.organization_id AND d.expense_id=e.id AND d.status='recorded'),0) AS disbursed
      FROM expenses e LEFT JOIN projects p ON p.id=e.project_id AND p.organization_id=e.organization_id
      WHERE e.organization_id=${org} AND e.status IN ('approved','paid') AND ${range(sql`e.incurred_at`)} ${scope}) g
    GROUP BY label,currency ORDER BY currency,sum(total) DESC,label LIMIT 200`);
}
