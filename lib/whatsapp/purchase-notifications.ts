import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/database/db";
import {
  designPurchases,
  whatsappMessages,
  whatsappContacts,
  type DesignPurchaseRecord,
} from "@/database/schema";
import { purchaseUrl } from "@/lib/company";
import { sendWhatsAppTemplate } from "./client";
import { getWhatsAppConfig } from "./config";
import { normalizeWhatsAppPhone } from "./phone";
import {
  purchaseMessageText,
  getWhatsAppTemplateName,
  templateComponents,
} from "./templates";

export function queuePurchaseCreatedWhatsApp(purchase: DesignPurchaseRecord) {
  if (!purchase.whatsappConsentAt) return;
  after(async () => {
    try {
      await deliverPurchaseCreatedWhatsApp(purchase);
    } catch (error) {
      console.error("Design purchase WhatsApp setup failed", {
        purchaseId: purchase.id,
        reason: error instanceof Error ? error.message : "Unknown failure",
      });
      await db
        .update(designPurchases)
        .set({ whatsappStatus: "failed" })
        .where(
          and(
            eq(designPurchases.id, purchase.id),
            eq(designPurchases.whatsappStatus, "not_started"),
          ),
        );
    }
  });
}

async function deliverPurchaseCreatedWhatsApp(purchase: DesignPurchaseRecord) {
  const phone = normalizeWhatsAppPhone(purchase.customerPhone);
  if (!phone) {
    console.warn("Design purchase WhatsApp skipped: invalid phone", {
      purchaseId: purchase.id,
    });
    throw new Error("Customer WhatsApp number is invalid");
  }

  getWhatsAppConfig();
  const [contact] = await db
    .select({ optedOutAt: whatsappContacts.optedOutAt })
    .from(whatsappContacts)
    .where(eq(whatsappContacts.phone, phone))
    .limit(1);
  if (contact?.optedOutAt) return;
  const dedupeKey = `purchaseCreated/${purchase.id}`;
  const url = purchaseUrl(purchase.id);
  const templateName = getWhatsAppTemplateName("purchaseCreated");
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
      templateName,
      status: "sending",
      attemptedAt: new Date(),
      eventAt: new Date(),
    })
    .onConflictDoUpdate({
      target: whatsappMessages.dedupeKey,
      set: {
        status: "sending",
        attemptedAt: new Date(),
        updatedAt: new Date(),
        errorCode: null,
        templateName,
      },
      setWhere: and(
        inArray(whatsappMessages.status, ["failed", "uncertain"]),
        isNull(whatsappMessages.wamid),
      ),
    })
    .returning({ id: whatsappMessages.id });

  if (!message) return;

  try {
    const result = await sendWhatsAppTemplate(phone, message.id, {
      name: templateName,
      language: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en_US",
      components: templateComponents(purchase),
    });
    if (!result.ok) {
      console.error("WhatsApp provider rejected or could not confirm message", {
        purchaseId: purchase.id,
        code: result.code,
        uncertain: result.uncertain,
      });
      await db
        .update(whatsappMessages)
        .set({
          status: result.uncertain ? "uncertain" : "failed",
          errorCode: result.code,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(whatsappMessages.id, message.id),
            eq(whatsappMessages.status, "sending"),
          ),
        );
      await db
        .update(designPurchases)
        .set({ whatsappStatus: "failed" })
        .where(
          and(
            eq(designPurchases.id, purchase.id),
            inArray(designPurchases.whatsappStatus, ["not_started", "failed"]),
          ),
        );
      return;
    }
    await db
      .update(whatsappMessages)
      .set({ wamid: result.wamid, status: "sent", updatedAt: new Date() })
      .where(
        and(
          eq(whatsappMessages.id, message.id),
          eq(whatsappMessages.status, "sending"),
        ),
      );
    await db
      .update(designPurchases)
      .set({
        whatsappPhone: phone,
        whatsappStatus: "message_sent",
        whatsappLastMessageId: result.wamid,
        whatsappStartedAt: new Date(),
        whatsappLastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(designPurchases.id, purchase.id),
          inArray(designPurchases.whatsappStatus, [
            "not_started",
            "failed",
            "message_sent",
          ]),
        ),
      );
  } catch (error) {
    console.error("Design purchase WhatsApp delivery failed", {
      purchaseId: purchase.id,
      reason: error instanceof Error ? error.message : "Unknown failure",
    });
    await db
      .update(whatsappMessages)
      .set({
        status: "uncertain",
        errorCode: "delivery_exception",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappMessages.id, message.id),
          eq(whatsappMessages.status, "sending"),
        ),
      );
    await db
      .update(designPurchases)
      .set({ whatsappStatus: "failed", updatedAt: new Date() })
      .where(
        and(
          eq(designPurchases.id, purchase.id),
          inArray(designPurchases.whatsappStatus, ["not_started", "failed"]),
        ),
      );
  }
}
