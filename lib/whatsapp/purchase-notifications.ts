import "server-only";

import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/database/db";
import {
  designPurchases,
  whatsappMessages,
  type DesignPurchaseRecord,
} from "@/database/schema";
import { purchaseUrl } from "@/lib/company";
import { sendWhatsAppTemplate } from "./client";
import { normalizeWhatsAppPhone } from "./phone";
import {
  purchaseMessageText,
  templateComponents,
  WHATSAPP_TEMPLATES,
} from "./templates";

export function queuePurchaseCreatedWhatsApp(purchase: DesignPurchaseRecord) {
  if (purchase.preferredContactMethod !== "whatsapp") return;
  after(() => deliverPurchaseCreatedWhatsApp(purchase));
}

async function deliverPurchaseCreatedWhatsApp(purchase: DesignPurchaseRecord) {
  const phone = normalizeWhatsAppPhone(purchase.customerPhone);
  if (!phone) {
    console.warn("Design purchase WhatsApp skipped: invalid phone", {
      purchaseId: purchase.id,
    });
    return;
  }

  const callbackId = purchase.id;
  const dedupeKey = `purchaseCreated/${purchase.id}`;
  const url = purchaseUrl(purchase.id);
  const [message] = await db
    .insert(whatsappMessages)
    .values({
      dedupeKey,
      purchaseId: purchase.id,
      customerPhone: phone,
      direction: "outbound",
      messageType: "template",
      notificationKind: "purchaseCreated",
      body: purchaseMessageText("purchaseCreated", purchase, url),
      templateName: WHATSAPP_TEMPLATES.purchaseCreated,
      status: "queued",
      eventAt: new Date(),
    })
    .onConflictDoNothing({ target: whatsappMessages.dedupeKey })
    .returning({ id: whatsappMessages.id });

  if (!message) return;

  try {
    await db
      .update(whatsappMessages)
      .set({ status: "sending", attemptedAt: new Date(), updatedAt: new Date() })
      .where(eq(whatsappMessages.id, message.id));
    const result = await sendWhatsAppTemplate(phone, callbackId, {
      name: WHATSAPP_TEMPLATES.purchaseCreated,
      language: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en_US",
      components: templateComponents(purchase),
    });
    if (!result.ok) {
      await db
        .update(whatsappMessages)
        .set({ status: result.uncertain ? "uncertain" : "failed", errorCode: result.code, updatedAt: new Date() })
        .where(eq(whatsappMessages.id, message.id));
      return;
    }
    await db
      .update(whatsappMessages)
      .set({ wamid: result.wamid, status: "sent", updatedAt: new Date() })
      .where(eq(whatsappMessages.id, message.id));
    await db
      .update(designPurchases)
      .set({
        whatsappPhone: phone,
        whatsappConsentAt: new Date(),
        whatsappStatus: "message_sent",
        whatsappLastMessageId: result.wamid,
        whatsappStartedAt: new Date(),
        whatsappLastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(designPurchases.id, purchase.id));
  } catch (error) {
    console.error("Design purchase WhatsApp delivery failed", {
      purchaseId: purchase.id,
      reason: error instanceof Error ? error.message : "Unknown failure",
    });
    await db
      .update(whatsappMessages)
      .set({ status: "uncertain", errorCode: "delivery_exception", updatedAt: new Date() })
      .where(eq(whatsappMessages.id, message.id));
  }
}