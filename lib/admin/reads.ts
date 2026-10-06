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
  const result = await run<LeadRow>(
    sql`SELECT id,type,full_name,email,phone,service,status,estimated_budget,project_location,timeline,project_overview,preferred_date::text AS preferred_date,preferred_time,admin_notes,created_at::text AS created_at FROM leads`,
    where,
    q.page,
    q.size,
    sql`created_at DESC,id`,
  );
  const stats = await db.execute<{ status: string; count: number }>(
    sql`SELECT status,count(*)::int AS count FROM leads GROUP BY status`,
  );
  return {
    ...result,
    filters: { search: q.search, status, type },
    stats: stats.rows,
    canWrite: ctx.permissions.includes("leads_write"),
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
  const base = sql`SELECT p.id,p.receipt_number,c.display_name AS client,p.amount::text AS amount,p.currency,p.method,p.status,p.reference,p.received_at::text AS received_at,coalesce((SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id=p.id AND a.organization_id=p.organization_id),0)::text AS allocated FROM payments p JOIN clients c ON c.id=p.client_id AND c.organization_id=p.organization_id WHERE p.organization_id=${ctx.organizationId}`;
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
