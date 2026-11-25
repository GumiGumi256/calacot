import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import type { Permission } from "@/lib/sales/permissions";

export async function notificationFeed(ctx: { organizationId: string; actor?: string; role: string; permissions: readonly Permission[] }) {
  const queries = [];
  if (ctx.role === "org:admin") {
    queries.push(db.execute<{ id: string; at: string }>(sql`
      SELECT id::text, event_at::text AS at FROM whatsapp_messages
      WHERE direction='inbound' AND event_at > now() - interval '7 days'
      ORDER BY event_at DESC LIMIT 20
    `).then(r => r.rows.map(row => ({ id: `whatsapp:${row.id}`, at: row.at, title: "New WhatsApp message", description: "A customer sent a message.", href: "/admin/customer-care" }))));
  }
  if (ctx.role === "org:admin" && ctx.permissions.includes("expenses_read")) {
    // Expenses another administrator added or approved without a separate review (migration 0027).
    queries.push(db.execute<{ id: string; at: string; expense_id: string; actor: string | null; description: string; currency: string; total: string }>(sql`
      SELECT ev.id::text, ev.created_at::text AS at, ev.expense_id::text, nullif(trim(s.display_name),'') AS actor, e.description, e.currency, e.total::text AS total
      FROM expense_events ev JOIN expenses e ON e.organization_id=ev.organization_id AND e.id=ev.expense_id
      LEFT JOIN staff_memberships s ON s.organization_id=ev.organization_id AND s.id=ev.actor_staff_id
      WHERE ev.organization_id=${ctx.organizationId} AND ev.action='admin_verified' AND ev.actor_clerk_user_id IS DISTINCT FROM ${ctx.actor ?? null}::text
        AND ev.created_at > now() - interval '7 days'
      ORDER BY ev.created_at DESC LIMIT 20
    `).then(r => r.rows.map(row => ({ id: `expense-verified:${row.id}`, at: row.at, title: "Expense added by an administrator", description: `${row.actor ?? "An administrator"} added and approved "${row.description}" (${row.currency} ${Number(row.total).toLocaleString("en-US")}).`, href: `/admin/expenses/${row.expense_id}` }))));
  }
  if (ctx.permissions.includes("notifications_manage")) {
    queries.push(db.execute<{ id: string; at: string; channel: string; status: string }>(sql`
      SELECT id::text, updated_at::text AS at, channel, status FROM delivery_intents
      WHERE organization_id=${ctx.organizationId} AND status IN ('failed','blocked','uncertain','bounced')
        AND updated_at > now() - interval '7 days'
      ORDER BY updated_at DESC LIMIT 20
    `).then(r => r.rows.map(row => ({ id: `delivery:${row.id}:${row.status}:${row.at}`, at: row.at, title: "Delivery needs attention", description: `${row.channel === "whatsapp" ? "WhatsApp" : "Email"} delivery: ${row.status}.`, href: `/admin/deliveries/${row.id}` }))));
  }
  if (ctx.permissions.includes("payments_read")) {
    queries.push(db.execute<{ id: string; at: string }>(sql`
      SELECT id::text, confirmed_at::text AS at FROM payments
      WHERE organization_id=${ctx.organizationId} AND status='confirmed'
        AND confirmed_at > now() - interval '7 days'
      ORDER BY confirmed_at DESC LIMIT 20
    `).then(r => r.rows.map(row => ({ id: `payment:${row.id}`, at: row.at, title: "Payment confirmed", description: "A payment has been verified.", href: "/admin/payments" }))));
  }
  if (ctx.permissions.includes("leads_read")) {
    queries.push(db.execute<{ id: string; at: string }>(sql`
      SELECT id::text, created_at::text AS at FROM leads
      WHERE organization_id=${ctx.organizationId} AND created_at > now() - interval '7 days'
      ORDER BY created_at DESC LIMIT 20
    `).then(r => r.rows.map(row => ({ id: `lead:${row.id}`, at: row.at, title: "New lead", description: "A lead has been added.", href: "/admin/leads" }))));
  }
  const items = (await Promise.all(queries)).flat().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 30);
  return items;
}
