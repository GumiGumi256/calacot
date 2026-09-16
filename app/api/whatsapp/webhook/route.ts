import { db } from "@/database/db";
import { getWebhookConfig } from "@/lib/whatsapp/config";
import { recordInboundQuery, recordStatusQuery } from "@/lib/whatsapp/queries";
import { readWebhookBody, verifyWebhookChallenge, verifyWebhookSignature } from "@/lib/whatsapp/security";
import { parseWhatsAppWebhook } from "@/lib/whatsapp/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return verifyWebhookChallenge(new URL(request.url), process.env.WHATSAPP_VERIFY_TOKEN);
}

export async function POST(request: Request) {
  let config: ReturnType<typeof getWebhookConfig>;
  try {
    config = getWebhookConfig();
  } catch {
    console.error("whatsapp_webhook_configuration_missing");
    return new Response("Webhook temporarily unavailable", { status: 503 });
  }

  let raw: Buffer;
  try {
    raw = await readWebhookBody(request);
  } catch {
    return new Response("Invalid webhook body", { status: 413 });
  }

  if (!verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    console.warn("whatsapp_webhook_signature_invalid");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const events = parseWhatsAppWebhook(payload, config);
  if (events.ignored) console.warn("whatsapp_webhook_unknown_format", { ignored: events.ignored });

  try {
    // Only short database operations here. A failed write returns 503 so Meta retries.
    for (const message of events.messages) {
      const result = await db.execute<{ id: string; purchase_id: string | null }>(recordInboundQuery(message));
      if (result.rows.some((row) => !row.purchase_id)) {
        console.info("whatsapp_message_unassociated", { messageId: message.wamid });
      }
    }

    for (const status of events.statuses) {
      await db.execute(recordStatusQuery(status));
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    console.error("whatsapp_webhook_persistence_failed", error);
    return new Response("Please retry", { status: 503 });
  }
}