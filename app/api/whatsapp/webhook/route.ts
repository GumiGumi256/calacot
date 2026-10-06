import { db } from "@/database/db";
import { sql } from "drizzle-orm";
import { getWebhookConfig } from "@/lib/whatsapp/config";
import { recordInboundQuery, recordStatusQuery } from "@/lib/whatsapp/queries";
import {
  readWebhookBody,
  verifyWebhookChallenge,
  verifyWebhookSignature,
} from "@/lib/whatsapp/security";
import { parseWhatsAppWebhook } from "@/lib/whatsapp/webhook";
import { enqueueQuery, insertJobQuery } from "@/lib/customer-care/queries";
import { after } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(request: Request) {
  return verifyWebhookChallenge(
    new URL(request.url),
    process.env.WHATSAPP_VERIFY_TOKEN,
  );
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

  if (
    !verifyWebhookSignature(
      raw,
      request.headers.get("x-hub-signature-256"),
      config.appSecret,
    )
  ) {
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
  if (events.ignored)
    console.warn("whatsapp_webhook_unknown_format", {
      ignored: events.ignored,
    });

  try {
    // Only short database operations here. A failed write returns 503 so Meta retries.
    for (const message of events.messages) {
      const result = await db.execute<{
        id: string;
        purchase_id: string | null;
      }>(recordInboundQuery(message));
      if (result.rows.some((row) => !row.purchase_id)) {
        console.info("whatsapp_message_unassociated", {
          messageId: message.wamid,
        });
      }
      if (process.env.CUSTOMER_CARE_ENABLED === "true") {
        await db.execute(
          enqueueQuery(
            message.wamid,
            process.env.CALACOT_CLERK_ORG_ID || null,
            config.businessAccountId,
          ),
        );
        await db.execute(insertJobQuery(message.wamid));
      }
    }

    for (const status of events.statuses) {
      // Persist sales events before acknowledgement, including events arriving before the provider ID write.
      await db.execute(
        sql`INSERT INTO sales_webhook_inbox(id,provider,payload) VALUES(${`whatsapp/${status.wamid}/${status.status}/${status.timestamp.toISOString()}`},'whatsapp',${JSON.stringify(status)}::jsonb) ON CONFLICT(id) DO NOTHING`,
      );
      await db.execute(recordStatusQuery(status));
    }

    if (
      process.env.CUSTOMER_CARE_ENABLED === "true" &&
      events.messages.length > 0
    ) {
      // Respond to Meta first; durable jobs remain available to the scheduled
      // worker if this best-effort immediate trigger is interrupted.
      after(async () => {
        try {
          const { runCareWorker } = await import("@/lib/customer-care/worker");
          await runCareWorker(2);
        } catch {
          console.error("customer_care_immediate_worker_failed");
        }
      });
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch {
    console.error("whatsapp_webhook_persistence_failed", {
      code: "database_write_failed",
    });
    return new Response("Please retry", { status: 503 });
  }
}
