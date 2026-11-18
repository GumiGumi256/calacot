import { randomUUID, timingSafeEqual } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { reconcileOrganization } from "@/lib/admin/staff-sync";

export const runtime = "nodejs";

/**
 * Scheduled Clerk-to-mirror reconciliation (recovers missed or failed webhook deliveries).
 * Requires `Authorization: Bearer <STAFF_SYNC_SECRET>`; disabled when the secret is unset.
 */
export async function POST(request: Request) {
  const secret = process.env.STAFF_SYNC_SECRET;
  const org = process.env.CALACOT_CLERK_ORG_ID?.trim();
  if (!secret || secret.length < 32 || !org) return new Response("Not configured", { status: 503 });
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 });
  try {
    const count = await reconcileOrganization(await clerkClient(), org, "system", `staff-sync:${randomUUID()}`);
    return Response.json({ ok: true, reconciled: count });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
