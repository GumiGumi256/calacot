"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/database/db";
import {
  careAudit,
  careConversations,
  careRequests,
} from "@/database/customer-care-schema";
import { whatsappContacts, whatsappMessages } from "@/database/schema";
import { requireAdmin } from "@/lib/design-purchases/permissions";
import { hasServiceWindow } from "@/lib/whatsapp/webhook";
import { deliverCareMessage } from "./worker";
import { renderStatic } from "./render";
import { revokeLinkQuery } from "./queries";

const phoneSchema = z.string().regex(/^[1-9]\d{7,14}$/);
const refresh = () => revalidatePath("/admin/customer-care");
export async function setConversationMode(form: FormData) {
  const actor = await requireAdmin();
  const phone = phoneSchema.parse(form.get("phone"));
  const mode = z.enum(["bot", "human", "closed"]).parse(form.get("mode"));
  await db
    .update(careConversations)
    .set({
      mode,
      assignedTo: mode === "human" ? actor : null,
      sessionRevision: sql`${careConversations.sessionRevision}+1`,
      menuState: {},
      sessionExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(careConversations.phone, phone));
  await db
    .insert(careAudit)
    .values({ actor, phone, action: "mode_changed", details: { mode } });
  refresh();
}
export async function updateCareRequest(form: FormData) {
  const actor = await requireAdmin();
  const id = z.uuid().parse(form.get("id"));
  const status = z
    .enum(["new", "contacted", "closed"])
    .parse(form.get("status"));
  const [row] = await db
    .update(careRequests)
    .set({ status })
    .where(eq(careRequests.id, id))
    .returning();
  if (row)
    await db.insert(careAudit).values({
      actor,
      phone: row.phone,
      action: "request_updated",
      details: { id, status },
    });
  refresh();
}
export async function sendReviewedReply(form: FormData) {
  const actor = await requireAdmin();
  const phone = phoneSchema.parse(form.get("phone"));
  const template = z
    .enum(["welcome", "details", "handoff", "missing", "custom"])
    .parse(form.get("template"));
  const [contact] = await db
    .select()
    .from(whatsappContacts)
    .where(eq(whatsappContacts.phone, phone));
  if (
    !contact ||
    contact.optedOutAt ||
    !hasServiceWindow(contact.lastInboundAt)
  )
    throw new Error(
      "Reply unavailable: customer opted out or the 24-hour window has ended.",
    );
  const body = template === "custom"
    ? z.string().trim().min(1).max(4096).parse(form.get("body"))
    : renderStatic(template);
  await db
    .update(careConversations)
    .set({ mode: "human", assignedTo: actor, menuState: {},
      sessionRevision: sql`${careConversations.sessionRevision}+1`,
      sessionExpiresAt: null, updatedAt: new Date() })
    .where(eq(careConversations.phone, phone));
  const id = z.uuid().parse(form.get("replyId"));
  const [inserted] = await db
    .insert(whatsappMessages)
    .values({
      id,
      dedupeKey: `care-admin/${id}`,
      customerPhone: phone,
      direction: "outbound",
      messageType: "text",
      body,
      status: "queued",
      eventAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (!inserted) return refresh();
  await db.insert(careAudit).values({
    actor,
    phone,
    action: "reviewed_reply",
    details: { messageId: id, template },
  });
  await deliverCareMessage(id);
  refresh();
}
export async function sendCareReply(
  _previous: { ok: boolean; message: string },
  form: FormData,
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const parsed = z.object({ phone: phoneSchema, replyId: z.uuid(),
    body: z.string().trim().min(1).max(4096) }).safeParse({
    phone: form.get("phone"), replyId: form.get("replyId"), body: form.get("body"),
  });
  if (!parsed.success) return { ok: false, message: "Enter a reply of 1–4,096 characters." };
  const [contact] = await db.select().from(whatsappContacts)
    .where(eq(whatsappContacts.phone, parsed.data.phone));
  if (!contact || contact.optedOutAt || !hasServiceWindow(contact.lastInboundAt))
    return { ok: false, message: "Replies require a customer message within the last 24 hours and no opt-out." };
  form.set("template", "custom");
  try {
    await sendReviewedReply(form);
    const [message] = await db.select().from(whatsappMessages)
      .where(eq(whatsappMessages.id, parsed.data.replyId));
    if (message && ["sent", "delivered", "read"].includes(message.status || ""))
      return { ok: true, message: "Reply submitted to WhatsApp. Delivery status appears below the message." };
    return { ok: false, message: message?.status === "uncertain"
      ? "Delivery is uncertain. Check WhatsApp before sending another reply."
      : `Reply was not confirmed. Check the message status${message?.errorCode ? ` (${message.errorCode})` : ""}.` };
  } catch {
    refresh();
    return { ok: false, message: "Reply could not be confirmed. Check the conversation before trying again." };
  }
}
export async function unlinkConversation(form: FormData) {
  const actor = await requireAdmin();
  const phone = phoneSchema.parse(form.get("phone"));
  await db.execute(revokeLinkQuery(phone));
  await db
    .insert(careAudit)
    .values({ actor, phone, action: "account_unlinked" });
  refresh();
}
