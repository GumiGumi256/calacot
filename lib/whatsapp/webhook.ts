import { z } from "zod";
import { normalizeWhatsAppPhone } from "./phone";
import type { InboundMessage, StatusEvent } from "./types";

const envelopeSchema = z.object({ object: z.literal("whatsapp_business_account"), entry: z.array(z.object({ id: z.string(), changes: z.array(z.object({ field: z.string(), value: z.unknown() })) })) });
const valueSchema = z.object({ metadata: z.object({ phone_number_id: z.string() }), messages: z.array(z.unknown()).optional(), statuses: z.array(z.unknown()).optional() });
const base = { id: z.string().min(1).max(512), timestamp: z.string().regex(/^\d{1,12}$/) };
const inboundSchema = z.object({ ...base, from: z.string(), type: z.string().max(100), text: z.object({ body: z.string() }).optional(), document: z.object({ caption: z.string().optional() }).optional(), interactive: z.object({ button_reply: z.object({ title: z.string() }).optional(), list_reply: z.object({ title: z.string() }).optional() }).optional(), button: z.object({ text: z.string() }).optional() });
const statusSchema = z.object({ ...base, recipient_id: z.string(), status: z.enum(["sent", "delivered", "read", "failed"]), biz_opaque_callback_data: z.string().optional(), errors: z.array(z.object({ code: z.number() })).optional() });

export function parseWhatsAppWebhook(payload: unknown, config: { phoneNumberId: string; businessAccountId: string }, now = new Date()) {
  const messages: InboundMessage[] = [];
  const statuses: StatusEvent[] = [];
  let ignored = 0;
  const parsed = envelopeSchema.safeParse(payload);
  if (!parsed.success) return { messages, statuses, ignored: 1 };
  const timestamp = (s: string) => {
    const date = new Date(Number(s) * 1000);
    return Number.isFinite(date.getTime()) && date.getTime() <= now.getTime() + 60_000 ? date : null;
  };
  for (const entry of parsed.data.entry) {
    if (entry.id !== config.businessAccountId) { ignored++; continue; }
    for (const change of entry.changes) {
      if (change.field !== "messages") { ignored++; continue; }
      const value = valueSchema.safeParse(change.value);
      if (!value.success || value.data.metadata.phone_number_id !== config.phoneNumberId) { ignored++; continue; }
      for (const raw of value.data.messages ?? []) {
        const m = inboundSchema.safeParse(raw);
        if (!m.success) { ignored++; continue; }
        const phone = normalizeWhatsAppPhone(m.data.from);
        const at = timestamp(m.data.timestamp);
        if (!phone || !at) { ignored++; continue; }
        const type = m.data.type === "text" || m.data.type === "document" || m.data.type === "interactive" ? m.data.type : "unknown";
        const body = m.data.text?.body ?? m.data.document?.caption ?? m.data.interactive?.button_reply?.title ?? m.data.interactive?.list_reply?.title ?? m.data.button?.text ?? null;
        messages.push({ wamid: m.data.id, phone, timestamp: at, type, rawType: m.data.type, body: body?.slice(0, 4096) ?? null });
      }
      for (const raw of value.data.statuses ?? []) {
        const s = statusSchema.safeParse(raw);
        if (!s.success) { ignored++; continue; }
        const phone = normalizeWhatsAppPhone(s.data.recipient_id);
        const at = timestamp(s.data.timestamp);
        if (!phone || !at) { ignored++; continue; }
        const callback = z.uuid().safeParse(s.data.biz_opaque_callback_data);
        statuses.push({ wamid: s.data.id, phone, timestamp: at, status: s.data.status, callbackId: callback.success ? callback.data : null, errorCode: s.data.errors?.[0] ? `meta_${s.data.errors[0].code}` : null });
      }
    }
  }
  return { messages, statuses, ignored };
}

export function hasServiceWindow(lastInbound: Date | null | undefined, now = new Date()) {
  return !!lastInbound && lastInbound.getTime() <= now.getTime() && now.getTime() - lastInbound.getTime() < 24 * 60 * 60 * 1000;
}
export function isWhatsAppOptOut(body: string | null) {
  return /^(stop|unsubscribe|cancel whatsapp|stop whatsapp)$/i.test(body?.trim() || "");
}
