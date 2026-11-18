import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { literalSearch, parseQuery } from "@/lib/sales/contracts";
import {
  leadStatuses,
  leadTypes,
  paymentStatuses,
  paymentMethods,
  expenseStatuses,
} from "./options";

export type SearchParams = Record<string, string | string[] | undefined>;

const pick = <T extends string>(v: string, allowed: readonly T[]) =>
  allowed.includes(v as T) ? v : "";

function common(raw: SearchParams) {
  const q = parseQuery(raw);
  const get = (k: string) =>
    typeof raw[k] === "string" ? (raw[k] as string) : "";
  return { q, get };
}

const whereClause = (where: SQL[]) =>
  where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;

async function run<R extends Record<string, unknown>>(
  base: SQL,
  where: SQL[],
  page: number,
  size: number,
  orderBy: SQL,
) {
  const clause = whereClause(where);
  const count = await db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM (${base}) b ${clause}`,
  );
  const total = count.rows[0]?.count ?? 0;
  const current = Math.min(page, Math.max(1, Math.ceil(total / size)));
  const res = await db.execute<R>(
    sql`SELECT * FROM (${base}) b ${clause} ORDER BY ${orderBy} LIMIT ${size} OFFSET ${(current - 1) * size}`,
  );
  return { rows: res.rows, page: current, total, size };
}

const totalsBy = (base: SQL, where: SQL[], column: string) =>
  db.execute<{ currency: string; status: string; total: string }>(
    sql`SELECT currency,status,sum(${sql.identifier(column)}::numeric)::text AS total FROM (${base}) b ${whereClause(where)} GROUP BY currency,status ORDER BY currency,status`,
  );

export type LeadRow = {
  id: string;
  type: string;
  full_name: string;
  email: string;
  phone: string;
  service: string;
  status: string;
  estimated_budget: string | null;
  project_location: string | null;
  timeline: string | null;
  project_overview: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  admin_notes: string | null;
  created_at: string;
  assigned_staff_id: string | null;
  division: string | null;
  follow_up_on: string | null;
  follow_up_notes: string | null;
  client_id: string | null;
  activity: { action: string; actor: string; created_at: string; changes: Record<string, unknown> }[];
  overdue: boolean;
};

export async function readLeads(raw: SearchParams) {
  const ctx = await staffContext("leads_read");
  const { q, get } = common(raw);
  const status = pick(get("status"), leadStatuses);
  const type = pick(get("type"), leadTypes);
  const where: SQL[] = [];
  if (q.search) {
    const s = literalSearch(q.search);
    where.push(
      sql`(full_name ILIKE ${s} OR email ILIKE ${s} OR phone ILIKE ${s} OR service ILIKE ${s})`,
    );
  }
  if (status) where.push(sql`status=${status}`);
  if (type) where.push(sql`type=${type}`);
  const assignee = get("assignee");
  const division = get("division");
  const followUp = get("followUp");
  if (assignee === "unassigned") where.push(sql`assigned_staff_id IS NULL`);
  else if (/^[0-9a-f-]{36}$/i.test(assignee)) where.push(sql`assigned_staff_id=${assignee}::uuid`);
  if (["estates", "architecture", "painting", "interiors", "tech"].includes(division)) where.push(sql`division=${division}`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(followUp) && !Number.isNaN(Date.parse(followUp))) where.push(sql`follow_up_on=${followUp}::date`);
  const result = await run<LeadRow>(
    sql`SELECT l.id,l.type,l.full_name,l.email,l.phone,l.service,l.status,l.estimated_budget,l.project_location,l.timeline,l.project_overview,l.preferred_date::text AS preferred_date,l.preferred_time,l.admin_notes,l.created_at::text AS created_at,l.assigned_staff_id,l.division,l.follow_up_on::text AS follow_up_on,l.follow_up_notes,(l.follow_up_on < (now() AT TIME ZONE 'Africa/Kampala')::date AND l.status NOT IN ('closed_won','closed_lost')) AS overdue,s.client_id,coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM (SELECT action,actor,created_at,changes FROM lead_activity WHERE organization_id=l.organization_id AND lead_id=l.id ORDER BY created_at DESC LIMIT 20) a),'[]'::jsonb) AS activity FROM leads l LEFT JOIN crm_source_links s ON s.lead_id=l.id AND s.organization_id=l.organization_id WHERE l.organization_id=${ctx.organizationId}`,
    where,
    q.page,
    q.size,
    sql`created_at DESC,id`,
  );
  const stats = await db.execute<{ status: string; count: number }>(
    sql`SELECT status,count(*)::int AS count FROM leads WHERE organization_id=${ctx.organizationId} GROUP BY status`,
  );
  return {
    ...result,
    filters: { search: q.search, status, type, assignee, division, followUp },
    stats: stats.rows,
    canWrite: ctx.permissions.includes("leads_write"),
    canRefreshStaff: ctx.role === "org:admin",
    canConvert: ctx.permissions.includes("leads_write") && ctx.permissions.includes("clients_write") && ctx.permissions.includes("clients_read"),
    canProject: ctx.permissions.includes("projects_write"),
    staff: (await db.execute<{ id: string; name: string }>(sql`SELECT id,coalesce(display_name,clerk_user_id) AS name FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND status='active' ORDER BY name LIMIT 100`)).rows,
  };
}

export type PaymentRow = {
  id: string;
  receipt_number: string | null;
  client: string;
  amount: string;
  currency: string;
  method: string;
  status: string;
  reference: string | null;
  received_at: string;
  allocated: string;
  client_id: string;
  unallocated: string;
  invoices: { id: string; number: string | null }[];
};

export async function readPayments(raw: SearchParams) {
  const ctx = await staffContext("payments_read");
  const { q, get } = common(raw);
  const status = pick(get("status"), paymentStatuses);
  const method = pick(get("method"), paymentMethods);
  const where: SQL[] = [];
  if (q.search) {
    const s = literalSearch(q.search);
    where.push(
      sql`(client ILIKE ${s} OR coalesce(reference,'') ILIKE ${s} OR coalesce(receipt_number,'') ILIKE ${s})`,
    );
  }
  if (status) where.push(sql`status=${status}`);
  if (method) where.push(sql`method=${method}`);
  if (q.currency) where.push(sql`currency=${q.currency}`);
  if (q.from) where.push(sql`received_at::timestamptz>=${q.from}::date`);
  if (q.to)
    where.push(sql`received_at::timestamptz<${q.to}::date+interval '1 day'`);
  // Phase 1D: unallocated mirrors sales_payment() available funds (amount - allocations - completed refunds).
  const base = sql`SELECT p.id,p.receipt_number,p.client_id,c.display_name AS client,p.amount::text AS amount,p.currency,p.method,p.status,p.reference,p.received_at::text AS received_at,coalesce((SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id=p.id AND a.organization_id=p.organization_id),0)::text AS allocated,
    CASE WHEN p.status='confirmed' THEN (p.amount-coalesce((SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id=p.id AND a.organization_id=p.organization_id),0)-coalesce((SELECT sum(f.amount) FROM payment_refunds f WHERE f.payment_id=p.id AND f.organization_id=p.organization_id AND f.status='completed'),0)) ELSE 0 END::text AS unallocated,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'number',i.number) ORDER BY i.number) FROM payment_allocations a JOIN invoices i ON i.id=a.invoice_id AND i.organization_id=a.organization_id WHERE a.payment_id=p.id AND a.organization_id=p.organization_id),'[]'::jsonb) AS invoices
    FROM payments p JOIN clients c ON c.id=p.client_id AND c.organization_id=p.organization_id WHERE p.organization_id=${ctx.organizationId}`;
  const result = await run<PaymentRow>(
    base,
    where,
    q.page,
    q.size,
    sql`received_at::timestamptz DESC,id`,
  );
  return {
    ...result,
    filters: {
      search: q.search,
      status,
      method,
      currency: q.currency,
      from: q.from,
      to: q.to,
    },
    summary: (await totalsBy(base, where, "amount")).rows,
    canSeeInvoices: ctx.permissions.includes("invoices_read"),
    canSeeClients: ctx.permissions.includes("clients_read"),
  };
}

export type ExpenseRow = {
  id: string;
  description: string;
  category: string;
  division: string;
  supplier: string;
  project: string;
  total: string;
  currency: string;
  status: string;
  incurred_at: string;
  supplier_invoice_reference: string | null;
};

export async function readExpenses(raw: SearchParams) {
  const ctx = await staffContext("expenses_read");
  const { q, get } = common(raw);
  const status = pick(get("status"), expenseStatuses);
  const where: SQL[] = [];
  if (q.search) {
    const s = literalSearch(q.search);
    where.push(
      sql`(description ILIKE ${s} OR category ILIKE ${s} OR supplier ILIKE ${s} OR project ILIKE ${s} OR coalesce(supplier_invoice_reference,'') ILIKE ${s})`,
    );
  }
  if (status) where.push(sql`status=${status}`);
  if (q.division) where.push(sql`division=${q.division}`);
  if (q.currency) where.push(sql`currency=${q.currency}`);
  if (q.from) where.push(sql`incurred_at::timestamptz>=${q.from}::date`);
  if (q.to)
    where.push(sql`incurred_at::timestamptz<${q.to}::date+interval '1 day'`);
  const base = sql`SELECT e.id,e.description,e.category,e.division,coalesce(s.name,'—') AS supplier,coalesce(p.name,'—') AS project,e.total::text AS total,e.currency,e.status,e.incurred_at::text AS incurred_at,e.supplier_invoice_reference FROM expenses e LEFT JOIN suppliers s ON s.id=e.supplier_id AND s.organization_id=e.organization_id LEFT JOIN projects p ON p.id=e.project_id AND p.organization_id=e.organization_id WHERE e.organization_id=${ctx.organizationId}`;
  const result = await run<ExpenseRow>(
    base,
    where,
    q.page,
    q.size,
    sql`incurred_at::timestamptz DESC,id`,
  );
  return {
    ...result,
    filters: {
      search: q.search,
      status,
      division: q.division,
      currency: q.currency,
      from: q.from,
      to: q.to,
    },
    summary: (await totalsBy(base, where, "total")).rows,
  };
}
