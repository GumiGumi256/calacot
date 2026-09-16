import "server-only";
import { z } from "zod";

const outbound = z.object({
  accessToken: z.string().min(1), phoneNumberId: z.string().regex(/^\d+$/),
  apiVersion: z.string().regex(/^v\d+\.0$/),
});
export function getWhatsAppConfig() {
  const parsed = outbound.safeParse({ accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim(), phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(), apiVersion: process.env.WHATSAPP_API_VERSION?.trim() });
  if (!parsed.success) throw new Error("WhatsApp outbound configuration is incomplete. Check the token, phone number ID and API version.");
  return parsed.data;
}
export function getWebhookConfig() {
  const parsed = z.object({ appSecret: z.string().min(1), phoneNumberId: z.string().regex(/^\d+$/), businessAccountId: z.string().regex(/^\d+$/) }).safeParse({ appSecret: process.env.META_APP_SECRET?.trim(), phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(), businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() });
  if (!parsed.success) throw new Error("WhatsApp webhook configuration is incomplete.");
  return parsed.data;
}
