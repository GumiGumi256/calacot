import "server-only";
import { getWhatsAppConfig } from "./config";
import { postWhatsAppMessage } from "./transport";
import type { TemplateComponent } from "./types";

export async function sendWhatsAppTemplate(to: string, callbackId: string, template: { name: string; language: string; components: TemplateComponent[] }) {
  return postWhatsAppMessage(getWhatsAppConfig(), { messaging_product: "whatsapp", recipient_type: "individual", to, biz_opaque_callback_data: callbackId, type: "template", template: { name: template.name, language: { code: template.language }, components: template.components } });
}
export async function sendWhatsAppText(to: string, callbackId: string, body: string) {
  return postWhatsAppMessage(getWhatsAppConfig(), { messaging_product: "whatsapp", recipient_type: "individual", to, biz_opaque_callback_data: callbackId, type: "text", text: { preview_url: false, body } });
}
