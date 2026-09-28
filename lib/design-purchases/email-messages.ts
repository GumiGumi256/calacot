import type { CreateEmailOptions } from "resend";
import type { DesignPurchaseRecord } from "@/database/schema";
import { renderNotificationTemplate } from "@/lib/email/template";
import { formatAmount } from "./model";
import { sendEmailWithRetry, type EmailSend } from "@/lib/email/delivery";

export type DesignEmailKind = "invoice" | "confirmed" | "paymentSubmitted" | "assistance" | "rejected" | "cancelled";
const copy: Record<DesignEmailKind, [string, string]> = {
  invoice: ["Your design request has been received", "Your proforma invoice and payment instructions are available in your account. Payment is still pending."],
  confirmed: ["Payment confirmed", "Your payment is confirmed and access is active. The Calacot team will make your design documents available through your account."],
  paymentSubmitted: ["Payment details received", "We have received your payment reference. Our team will verify the payment and email you when it is confirmed."],
  assistance: ["Your assistance request has been received", "Our team will contact you using your preferred contact method to help complete your purchase."],
  rejected: ["Your payment needs attention", "We could not verify your payment. Please view your account for the next steps and submit a new payment reference."],
  cancelled: ["Your design request has been cancelled", "Your purchase request has been cancelled. Reply to this email if you need help."],
};

export function buildDesignEmails(p: DesignPurchaseRecord, kind: DesignEmailKind, from: string, team: string, url: string) {
  const [heading, message] = copy[kind];
  const rows: Array<[string, string]> = [["Design", p.designTitle], ["Package", p.packageName], ["Amount", formatAmount(p.amount, p.currency)], ["Invoice", p.invoiceNumber]];
  return (["customer", "team"] as const).map((audience) => {
    const details: Array<[string, string]> = audience === "team"
      ? [...rows, ["Customer", p.customerName], ["Email", p.customerEmail], ["Phone", p.customerPhone], ["Preferred contact", p.preferredContactMethod || "email"], ...(p.paymentReference ? [["Payment reference", p.paymentReference] as [string, string]] : []), ...(p.customerNote ? [["Customer note", p.customerNote] as [string, string]] : [])]
      : rows;
    const actionUrl = audience === "customer" ? url : new URL(`/admin/design-purchases/${p.id}`, url).toString();
    const title = audience === "team" ? `Design purchase: ${heading}` : heading;
    const body = audience === "team" ? `A design purchase update has been saved: ${heading}. Review the purchase and follow up with the customer.` : message;
    const payload: CreateEmailOptions = {
      from, to: audience === "customer" ? p.customerEmail : team,
      replyTo: audience === "customer" ? team : p.customerEmail,
      subject: `${title} | Calacot`,
      text: `${title}\n\n${body}\n\nReference: ${p.purchaseReference}\n${details.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${actionUrl}`,
      html: renderNotificationTemplate({ audience, heading: title, reference: p.purchaseReference, message: body, details, action: { label: audience === "customer" ? "View your purchase" : "Review purchase", url: actionUrl } }),
    };
    const event = kind === "invoice" || kind === "confirmed" ? kind : `${kind}-${p.revision}`;
    return { audience, key: `design-${event}${audience === "team" ? "-team" : ""}/${p.id}`, payload };
  });
}

export type EmailTimestamp = "invoiceEmailSentAt" | "invoiceTeamEmailSentAt" | "confirmationEmailSentAt" | "confirmationTeamEmailSentAt";

export async function deliverDesignMessages(p: DesignPurchaseRecord, kind: DesignEmailKind, deps: {
  from: string; team: string; url: string; send: EmailSend;
  invoice: () => Promise<Buffer>;
  markAccepted: (field: EmailTimestamp) => Promise<void>;
}) {
  for (const { audience, key, payload } of buildDesignEmails(p, kind, deps.from, deps.team, deps.url)) {
    const field: EmailTimestamp | null = kind === "invoice"
      ? audience === "customer" ? "invoiceEmailSentAt" : "invoiceTeamEmailSentAt"
      : kind === "confirmed" ? audience === "customer" ? "confirmationEmailSentAt" : "confirmationTeamEmailSentAt" : null;
    if (field && p[field]) continue;
    try {
      if (kind === "invoice" && audience === "customer") {
        try { payload.attachments = [{ filename: `${p.invoiceNumber}.pdf`, content: await deps.invoice() }]; }
        catch { console.error("Invoice PDF unavailable; sending account link", { purchaseId: p.id }); }
      }
      const accepted = await sendEmailWithRetry(payload, key, deps.send);
      if (accepted && field) await deps.markAccepted(field);
    } catch {
      console.error("Design email processing failed", { purchaseId: p.id, kind, audience });
    }
  }
}
