import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
try {
  await db.exec(await readFile("drizzle-current/0025_staff_notifications.sql", "utf8"));
  await db.query("INSERT INTO staff_notification_reads(organization_id,clerk_user_id,event_id) VALUES ('org','alice','one'),('org','bob','one')");
  await db.query("INSERT INTO staff_notification_reads(organization_id,clerk_user_id,event_id) VALUES ('org','alice','one') ON CONFLICT DO NOTHING");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM staff_notification_reads")).rows[0].n, 2);
  await db.query("INSERT INTO staff_push_subscriptions(endpoint,organization_id,clerk_user_id,p256dh,auth) VALUES ('https://fcm.googleapis.com/test','org','alice','key','auth')");
  const claim = () => db.query("INSERT INTO staff_push_deliveries(endpoint,event_id) VALUES ('https://fcm.googleapis.com/test','one') ON CONFLICT(endpoint,event_id) DO UPDATE SET claimed_at=now() WHERE staff_push_deliveries.sent_at IS NULL AND staff_push_deliveries.claimed_at<now()-interval '5 minutes' RETURNING event_id");
  assert.equal((await claim()).rows.length, 1);
  assert.equal((await claim()).rows.length, 0);
  await db.query("UPDATE staff_push_deliveries SET claimed_at=now()-interval '6 minutes'");
  assert.equal((await claim()).rows.length, 1);
  await db.query("UPDATE staff_push_deliveries SET sent_at=now(),claimed_at=now()-interval '6 minutes'");
  assert.equal((await claim()).rows.length, 0);
  await db.query("DELETE FROM staff_push_subscriptions");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM staff_push_deliveries")).rows[0].n, 0);
  console.log("PASS: read state is per user; push claims deduplicate, recover and cascade.");
} finally { await db.close(); }
