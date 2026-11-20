import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { clerkClient } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { db } from "@/database/db";
import { syncStaffMember } from "@/lib/admin/staff-sync";
import { expiringAdminData } from "@/lib/cache-tags";

const membershipEvents = new Set(["organizationMembership.created", "organizationMembership.updated", "organizationMembership.deleted"]);

/**
 * Clerk membership webhook. The payload is only a hint: the handler re-reads Clerk for the
 * affected user, so duplicate and out-of-order deliveries converge on Clerk's current state.
 * Svix delivery ids are recorded; processed ids are acknowledged without reprocessing and
 * failures return 500 so Svix retries. Scheduled reconciliation covers missed deliveries.
 */
async function handlePOST(request: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) return new Response("Webhook not configured", { status: 503 });
  const org = process.env.CALACOT_CLERK_ORG_ID?.trim();
  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try { event = await verifyWebhook(request); } catch { return new Response("Invalid signature", { status: 400 }); }
  const deliveryId = request.headers.get("svix-id");
  if (!deliveryId) return new Response("Missing delivery id", { status: 400 });
  const data = event.data as { organization?: { id?: string }; public_user_data?: { user_id?: string } };
  const eventOrg = data.organization?.id ?? null;
  const relevant = membershipEvents.has(event.type) && !!org && eventOrg === org && !!data.public_user_data?.user_id;
  const claimed = await db.execute<{ status: string }>(sql`INSERT INTO clerk_webhook_events(id,organization_id,event_type,status) VALUES(${deliveryId},${eventOrg},${event.type},${relevant ? "processing" : "ignored"})
    ON CONFLICT(id) DO UPDATE SET status='processing',attempts=clerk_webhook_events.attempts+1,error_code=NULL WHERE clerk_webhook_events.status='failed' OR (clerk_webhook_events.status='processing' AND clerk_webhook_events.received_at<now()-interval '2 minutes') RETURNING status`);
  if (!claimed.rows.length) return new Response("Duplicate delivery", { status: 200 });
  if (!relevant) return new Response("Ignored", { status: 200 });
  try {
    await syncStaffMember(await clerkClient(), org!, data.public_user_data!.user_id!, "system", `clerk-webhook:${deliveryId}:${randomUUID()}`);
    await db.execute(sql`UPDATE clerk_webhook_events SET status='processed',processed_at=now() WHERE id=${deliveryId}`);
    return new Response("Processed", { status: 200 });
  } catch {
    await db.execute(sql`UPDATE clerk_webhook_events SET status='failed',error_code='sync_failed' WHERE id=${deliveryId}`);
    return new Response("Sync failed", { status: 500 });
  }
}

// Expire cached admin reads after a successful write (lib/cache-tags.ts).
export const POST = expiringAdminData(handlePOST);
