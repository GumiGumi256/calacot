import { Resend } from "resend";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { readWebhookBody } from "@/lib/whatsapp/security";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.SALES_RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook unavailable", { status: 503 });
  let raw: Buffer;
  try {
    raw = await readWebhookBody(request);
  } catch {
    return new Response("Body too large", { status: 413 });
  }
  let event: unknown;
  try {
    event = new Resend(
      process.env.RESEND_API_KEY || "webhook-verification-only",
    ).webhooks.verify({
      payload: raw.toString("utf8"),
      headers: {
        id: request.headers.get("svix-id") || "",
        timestamp: request.headers.get("svix-timestamp") || "",
        signature: request.headers.get("svix-signature") || "",
      },
      webhookSecret: secret,
    });
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }
  try {
    const id = request.headers.get("svix-id")!;
    await db.execute(
      sql`INSERT INTO sales_webhook_inbox(id,provider,payload) VALUES(${"resend/" + id},'resend',${JSON.stringify(event)}::jsonb) ON CONFLICT(id) DO NOTHING`,
    );
    return new Response("Received", { status: 200 });
  } catch {
    console.error("sales_webhook_persistence_failed");
    return new Response("Retry", { status: 503 });
  }
}
