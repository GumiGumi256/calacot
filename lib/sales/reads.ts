import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { notFound } from "next/navigation";
import { db } from "@/database/db";
import { staffContext } from "./permissions";
import { listQueries, balanceExpression } from "./queries";
import type { Entity, ListRow, QueryState } from "./contracts";
export async function readList(entity: Entity, query: QueryState) {
  const ctx = await staffContext(
    entity === "deliveries" ? "notifications_manage" : `${entity}_read`,
  );
  const queries = listQueries(ctx.organizationId, entity, query);
  const [count, summary] = await Promise.all([
    db.execute<{ count: number }>(queries.count),
    db.execute<{ currency: string; total: string; due: string }>(
      queries.summary,
    ),
  ]);
  const total = count.rows[0]?.count ?? 0;
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.size)));
  const rows = await db.execute<ListRow>(queries.rows(page));
  return {
    rows: rows.rows.map((r) => ({
      ...r,
      created: new Date(r.created).toISOString(),
    })),
    total,
    query: { ...query, page },
    summary: summary.rows,
    permissions: ctx.permissions,
  };
}
export async function clientDetail(id: string) {
  const ctx = await staffContext("clients_read");
  const org = ctx.organizationId;
  if (!z.uuid().safeParse(id).success) notFound();
  const c = await db.execute(
    sql`SELECT * FROM clients WHERE id=${id}::uuid AND organization_id=${org}`,
  );
  if (!c.rows.length) notFound();
  const [contacts, projects, quotes, invoices, activity] = await Promise.all([
    db.execute(
      sql`SELECT * FROM client_contacts WHERE client_id=${id}::uuid AND organization_id=${org} ORDER BY is_primary DESC,created_at LIMIT 20`,
    ),
    db.execute(
      sql`SELECT id,name,status FROM projects WHERE client_id=${id}::uuid AND organization_id=${org} ORDER BY created_at DESC LIMIT 50`,
    ),
    db.execute(
      sql`SELECT id,title,number FROM quotations WHERE client_id=${id}::uuid AND organization_id=${org} ORDER BY created_at DESC LIMIT 50`,
    ),
    db.execute(
      sql`SELECT i.id,i.number,i.currency,i.status,(${balanceExpression})::text AS balance FROM invoices i WHERE i.client_id=${id}::uuid AND i.organization_id=${org} ORDER BY i.created_at DESC LIMIT 50`,
    ),
    db.execute(
      sql`SELECT action,created_at,changes FROM audit_logs WHERE organization_id=${org} AND entity_type='client' AND entity_id=${id} ORDER BY created_at DESC LIMIT 50`,
    ),
  ]);
  const balances = await db.execute(
    sql`SELECT i.currency,sum(${balanceExpression})::text AS balance FROM invoices i WHERE i.client_id=${id}::uuid AND i.organization_id=${org} GROUP BY i.currency`,
  );
  return {
    client: c.rows[0],
    contacts: contacts.rows,
    projects: projects.rows,
    quotes: quotes.rows,
    invoices: invoices.rows,
    activity: activity.rows,
    balances: balances.rows,
    permissions: ctx.permissions,
  };
}
export async function documentDetail(
  entity: "quotations" | "invoices",
  id: string,
) {
  const ctx = await staffContext(`${entity}_read`);
  const org = ctx.organizationId;
  if (!z.uuid().safeParse(id).success) notFound();
  const record = await db.execute(
    entity === "quotations"
      ? sql`SELECT * FROM quotations WHERE id=${id}::uuid AND organization_id=${org}`
      : sql`SELECT i.*,(${balanceExpression})::text AS balance FROM invoices i WHERE i.id=${id}::uuid AND i.organization_id=${org}`,
  );
  if (!record.rows.length) notFound();
  const versions =
    entity === "quotations"
      ? await db.execute(
          sql`SELECT * FROM quotation_versions WHERE quotation_id=${id}::uuid AND organization_id=${org} ORDER BY version DESC`,
        )
      : { rows: [] };
  const current = entity === "quotations" ? versions.rows[0] : record.rows[0];
  const vid = String(current.id);
  const context = await db.execute<{client: string; project: string; recipient: string}>(
    sql`SELECT c.display_name AS client,coalesce(p.name,'Unlinked historical project') AS project,coalesce(cc.email,'') AS recipient FROM clients c LEFT JOIN projects p ON p.id=${record.rows[0].project_id ?? null}::uuid AND p.organization_id=c.organization_id AND p.client_id=c.id LEFT JOIN client_contacts cc ON cc.id=${entity === "quotations" ? current.delivery_contact_id ?? null : null}::uuid AND cc.organization_id=c.organization_id AND cc.client_id=c.id WHERE c.organization_id=${org} AND c.id=${record.rows[0].client_id}::uuid`,
  );
  const [items, schedules, deliveries, activity] = await Promise.all([
    db.execute(
      entity === "quotations"
        ? sql`SELECT * FROM quotation_items WHERE quotation_version_id=${vid}::uuid AND organization_id=${org} ORDER BY position`
        : sql`SELECT * FROM invoice_items WHERE invoice_id=${id}::uuid AND organization_id=${org} ORDER BY position`,
    ),
    entity === "quotations"
      ? db.execute(
          sql`SELECT * FROM quotation_payment_schedules WHERE quotation_version_id=${vid}::uuid AND organization_id=${org} ORDER BY position`,
        )
      : Promise.resolve({ rows: [] }),
    db.execute(
      sql`SELECT d.*,coalesce((SELECT jsonb_agg(jsonb_build_object('attempt',a.attempt,'state',a.state,'code',a.code,'at',a.created_at) ORDER BY a.created_at) FROM delivery_attempts a WHERE a.organization_id=d.organization_id AND a.intent_id=d.id),'[]') AS attempts FROM delivery_intents d WHERE d.organization_id=${org} AND (d.entity_id=${id}::uuid OR d.entity_id IN (SELECT id FROM quotation_versions WHERE quotation_id=${id}::uuid AND organization_id=${org})) ORDER BY d.created_at DESC LIMIT 50`,
    ),
    db.execute(
      sql`SELECT action,created_at,changes FROM audit_logs WHERE organization_id=${org} AND entity_type=${entity === "quotations" ? "quotation" : "invoice"} AND entity_id=${id} ORDER BY created_at DESC LIMIT 50`,
    ),
  ]);
  const payments =
    entity === "invoices"
      ? await db.execute(
          sql`SELECT p.id,p.amount,p.currency,p.status,p.reference,coalesce((SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id=p.id AND a.organization_id=p.organization_id),0)::text AS allocated FROM payments p WHERE p.organization_id=${org} AND p.client_id=${record.rows[0].client_id}::uuid AND p.currency=${record.rows[0].currency} ORDER BY p.created_at DESC LIMIT 50`,
        )
      : { rows: [] };
  return {
    record: record.rows[0],
    context: context.rows[0],
    current,
    versions: versions.rows,
    items: items.rows,
    schedules: schedules.rows,
    deliveries: deliveries.rows,
    activity: activity.rows,
    payments: payments.rows,
    permissions: ctx.permissions,
  };
}
export async function pickers(clientId?: string, search = "") {
  const ctx = await staffContext("quotations_read");
  const org = ctx.organizationId;
  if (clientId && !z.uuid().safeParse(clientId).success)
    return { clients: [], projects: [], contacts: [], owners: [] };
  const [clients, projects, contacts, owners] = await Promise.all([
    db.execute(
      sql`SELECT id,display_name AS name FROM clients WHERE organization_id=${org} AND archived_at IS NULL AND display_name ILIKE ${"%" + search.replace(/[\\%_]/g, "\\$&") + "%"} ORDER BY display_name,id LIMIT 50`,
    ),
    clientId
      ? db.execute(
          sql`SELECT id,name,division,currency FROM projects WHERE organization_id=${org} AND client_id=${clientId}::uuid AND status='planned' AND quotation_version_id IS NULL AND archived_at IS NULL ORDER BY name,id LIMIT 50`,
        )
      : Promise.resolve({ rows: [] }),
    clientId
      ? db.execute(
          sql`SELECT id,name,email FROM client_contacts WHERE organization_id=${org} AND client_id=${clientId}::uuid AND email IS NOT NULL ORDER BY is_primary DESC,name LIMIT 20`,
        )
      : Promise.resolve({ rows: [] }),
    db.execute(
      sql`SELECT id,coalesce(display_name,clerk_user_id) AS name FROM staff_memberships WHERE organization_id=${org} AND status='active' ORDER BY display_name,id LIMIT 50`,
    ),
  ]);
  return {
    clients: clients.rows,
    projects: projects.rows,
    contacts: contacts.rows,
    owners: owners.rows,
  };
}
