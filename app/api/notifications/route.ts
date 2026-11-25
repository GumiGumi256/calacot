import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { z } from "zod";
import { notificationFeed } from "@/lib/admin/notification-feed";

export async function GET() {
  const ctx = await staffContext(undefined, "fresh");
  let items, reads;
  try {
    items = await notificationFeed(ctx);
    reads = await db.execute<{ event_id: string }>(sql`SELECT event_id FROM staff_notification_reads WHERE organization_id=${ctx.organizationId} AND clerk_user_id=${ctx.actor} AND read_at > now()-interval '30 days'`);
  } catch (error) {
    // Usually a database missing migration 0025 (staff_notification_reads). Logged so it shows in runtime logs.
    console.error("notification_feed_failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "notification_feed_failed", pushPublicKey: process.env.NEXT_PUBLIC_WEB_PUSH_KEY || null }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
  return Response.json({ items, seen: reads.rows.map(r => r.event_id), pushPublicKey: process.env.NEXT_PUBLIC_WEB_PUSH_KEY || null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const ctx = await staffContext(undefined, "fresh");
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const input = z.object({ ids: z.array(z.string().max(200)).max(30) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return new Response("Invalid request", { status: 400 });
  for (const id of input.data.ids) await db.execute(sql`INSERT INTO staff_notification_reads(organization_id,clerk_user_id,event_id) VALUES(${ctx.organizationId},${ctx.actor},${id}) ON CONFLICT DO NOTHING`);
  return new Response(null, { status: 204 });
}
