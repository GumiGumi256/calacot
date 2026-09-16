export const notificationKinds = ["purchaseCreated", "paymentSubmitted", "paymentConfirmed", "advisorFollowup"] as const;
export type NotificationKind = typeof notificationKinds[number];
export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";
export type MessageType = "text" | "template" | "document" | "interactive" | "unknown";
export type InboundMessage = {
  wamid: string; phone: string; timestamp: Date; type: MessageType; rawType: string; body: string | null;
};
export type StatusEvent = {
  wamid: string; phone: string; timestamp: Date; status: DeliveryStatus; callbackId: string | null; errorCode: string | null;
};
export type SendResult = { ok: true; wamid: string } | { ok: false; uncertain: boolean; code: string };
export type TemplateComponent = { type: "body"; parameters: { type: "text"; text: string }[] } | { type: "button"; sub_type: "url"; index: "0"; parameters: { type: "text"; text: string }[] };
export type SendPayload = {
  messaging_product: "whatsapp"; recipient_type: "individual"; to: string; biz_opaque_callback_data: string;
} & ({ type: "template"; template: { name: string; language: { code: string }; components: TemplateComponent[] } } | { type: "text"; text: { preview_url: boolean; body: string } });
