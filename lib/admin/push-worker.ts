import "server-only";
import { sql } from "drizzle-orm";
import { sendNotification, setVapidDetails } from "web-push";
import { db } from "@/database/db";
import { effectiveGrants, liveMembership } from "@/lib/sales/permissions";
import { notificationFeed } from "./notification-feed";

export async function runPushWorker() {
  const org = process.env.CALACOT_CLERK_ORG_ID;
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT;
  if (!org || !publicKey || !privateKey || !subject) throw new Error("push_configuration_missing");
  setVapidDetails(subject, publicKey, privateKey);
  const subscriptions = await db.execute<{ endpoint: string; clerk_user_id: string; p256dh: string; auth: string; created_at: string; status: string | null; employee_eligibility: string | null }>(sql`
    SELECT s.endpoint,s.clerk_user_id,s.p256dh,s.auth,s.created_at::text,m.status,m.employee_eligibility
    FROM staff_push_subscriptions s LEFT JOIN staff_memberships m ON m.organization_id=s.organization_id AND m.clerk_user_id=s.clerk_user_id
    WHERE s.organization_id=${org} ORDER BY s.updated_at LIMIT 100`);
  let sent = 0, checked = 0;
  const started = Date.now();
  for (const sub of subscriptions.rows) {
    if (Date.now() - started > 40000) break;
    checked++;
    await db.execute(sql`UPDATE staff_push_subscriptions SET updated_at=now() WHERE endpoint=${sub.endpoint}`);
    // Missing, revoked or suspended membership is never sufficient to send.
    const member = await liveMembership(org, sub.clerk_user_id, true).catch(() => null);
    if (!member || sub.status === "suspended") continue;
    const custom = new Set(member.custom);
    const local = sub.status ? { status: sub.status, eligibility: sub.employee_eligibility || "pending" } : null;
    const grants = effectiveGrants(member.role, p => custom.has(`org:calacot:${p}`), local);
    if (!grants.length) continue;
    const items = await notificationFeed({ organizationId: org, role: member.role, permissions: grants });
    const eligible = items.filter(item => Date.parse(item.at) > Date.parse(sub.created_at));
    const claimed: string[] = [];
    for (const item of eligible) {
      const row = await db.execute(sql`INSERT INTO staff_push_deliveries(endpoint,event_id) SELECT ${sub.endpoint},${item.id} WHERE NOT EXISTS (SELECT 1 FROM staff_notification_reads WHERE organization_id=${org} AND clerk_user_id=${sub.clerk_user_id} AND event_id=${item.id}) ON CONFLICT(endpoint,event_id) DO UPDATE SET claimed_at=now() WHERE staff_push_deliveries.sent_at IS NULL AND staff_push_deliveries.claimed_at<now()-interval '5 minutes' RETURNING event_id`);
      if (row.rows.length) claimed.push(item.id);
    }
    if (claimed.length) {
      try {
        await sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ body: "You have new activity in Calacot.", id: "calacot-activity" }), { TTL: 300, timeout: 10000 });
        for (const id of claimed) await db.execute(sql`UPDATE staff_push_deliveries SET sent_at=now() WHERE endpoint=${sub.endpoint} AND event_id=${id}`);
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.execute(sql`DELETE FROM staff_push_subscriptions WHERE endpoint=${sub.endpoint}`);
        else for (const id of claimed) await db.execute(sql`DELETE FROM staff_push_deliveries WHERE endpoint=${sub.endpoint} AND event_id=${id}`);
      }
    }
  }
  return { checked, sent };
}
