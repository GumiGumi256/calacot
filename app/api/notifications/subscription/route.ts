import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";

function validEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" || url.hostname.endsWith(".push.apple.com") || url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}
const subscription = z.object({ endpoint: z.string().max(2048).refine(validEndpoint), keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }) });

export async function POST(request: Request) {
  const ctx = await staffContext(undefined, "fresh");
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const parsed = subscription.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid subscription", { status: 400 });
  const { endpoint, keys } = parsed.data;
  await db.execute(sql`INSERT INTO staff_push_subscriptions(endpoint,organization_id,clerk_user_id,p256dh,auth) VALUES(${endpoint},${ctx.organizationId},${ctx.actor},${keys.p256dh},${keys.auth}) ON CONFLICT(endpoint) DO UPDATE SET organization_id=excluded.organization_id,clerk_user_id=excluded.clerk_user_id,p256dh=excluded.p256dh,auth=excluded.auth,created_at=CASE WHEN staff_push_subscriptions.organization_id<>excluded.organization_id OR staff_push_subscriptions.clerk_user_id<>excluded.clerk_user_id THEN now() ELSE staff_push_subscriptions.created_at END,updated_at=now()`);
  return new Response(null, { status: 204 });
}
export async function DELETE(request: Request) {
  const ctx = await staffContext(undefined, "fresh");
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const parsed = z.object({ endpoint: z.string().max(2048) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid subscription", { status: 400 });
  await db.execute(sql`DELETE FROM staff_push_subscriptions WHERE endpoint=${parsed.data.endpoint} AND organization_id=${ctx.organizationId} AND clerk_user_id=${ctx.actor}`);
  return new Response(null, { status: 204 });
}
