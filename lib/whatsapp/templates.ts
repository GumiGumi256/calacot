import type { DesignPurchaseRecord } from "@/database/schema";
import { formatAmount } from "@/lib/design-purchases/model";
import type { NotificationKind, TemplateComponent } from "./types";

// Values are configured names of approved Meta templates, never presumed IDs.
export const WHATSAPP_TEMPLATES = {
  purchaseCreated: "WHATSAPP_TEMPLATE_PURCHASE_CREATED",
  paymentSubmitted: "WHATSAPP_TEMPLATE_PAYMENT_SUBMITTED",
  paymentConfirmed: "WHATSAPP_TEMPLATE_PAYMENT_CONFIRMED",
  advisorFollowup: "WHATSAPP_TEMPLATE_ADVISOR_FOLLOWUP",
} as const;

export function purchaseMessageVariables(p: DesignPurchaseRecord) {
  return [p.customerName, p.designTitle, p.packageName, formatAmount(p.amount, p.currency), p.purchaseReference];
}
export function templateComponents(p: DesignPurchaseRecord): TemplateComponent[] {
  return [
    { type: "body", parameters: purchaseMessageVariables(p).map((text) => ({ type: "text", text: text.replace(/\s+/g, " ").trim() })) },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: p.id }] },
  ];
export function purchaseMessageText(kind: NotificationKind, p: DesignPurchaseRecord, url: string) {
  const context = `Hi ${p.customerName},\n${p.designTitle} - ${p.packageName}\nAmount: ${formatAmount(p.amount, p.currency)}\nPurchase: ${p.purchaseReference}`;
  const message = {
    purchaseCreated: "We've received your purchase request. Your invoice is available in your account. Complete your purchase online or reply here for help.",
    paymentSubmitted: "We've received your payment details. Our team is verifying the transaction and will let you know once it is confirmed.",
    paymentConfirmed: "Payment confirmed. Your design purchase is now active. Our team will make your design documents available through your account.",
    advisorFollowup: "You requested help with this purchase. Reply here and the Calacot team will assist you.",
  }[kind];
  return `${context}\n\n${message}\n\nView your purchase: ${url}`;
}
