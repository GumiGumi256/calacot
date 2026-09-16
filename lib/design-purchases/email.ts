import "server-only";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/database/db";
import { designPurchases, type DesignPurchaseRecord } from "@/database/schema";
import { getEmailClient } from "@/lib/email/client";
import { escapeHtml } from "@/lib/email/template";
import { purchaseUrl, purchaseWhatsAppUrl } from "@/lib/company";
import { formatAmount } from "./model";

export function queueDesignEmail(
  purchase: DesignPurchaseRecord,
  kind: "invoice" | "confirmed",
) {
  after(() => deliverDesignEmail(purchase, kind));
}

export async function deliverDesignEmail(
  p: DesignPurchaseRecord,
  kind: "invoice" | "confirmed",
) {
  if (kind === "invoice" ? p.invoiceEmailSentAt : p.confirmationEmailSentAt)
    return;
  try {
    const email = getEmailClient();
    if (!email) throw new Error("Email configuration unavailable");
    const confirmed = kind === "confirmed";
    const heading = confirmed
      ? "Payment confirmed"
      : "Your design request is confirmed";
    const next = confirmed
      ? "Your payment is confirmed and access is active. The Calacot team will make your design documents available through your account."
      : "Your purchase request has been received. Your proforma invoice is attached. You can pay directly using the instructions in your account or complete your purchase with Calacot via WhatsApp.";
    const url = purchaseUrl(p.id);
    const whatsapp = purchaseWhatsAppUrl(p);
    const rows = [
      ["Design", p.designTitle],
      ["Package", p.packageName],
      ["Amount", formatAmount(p.amount, p.currency)],
      ["Purchase reference", p.purchaseReference],
      ["Invoice number", p.invoiceNumber],
    ];
    const html = `<html><body style="margin:0;background:#f5f5f2;font-family:Arial,sans-serif;color:#202026"><div style="max-width:600px;margin:24px auto;background:#fff"><div style="padding:32px;background:#202026;border-top:5px solid #ffc919;color:#fff"><strong style="color:#ffc919;font-size:26px;letter-spacing:4px">CALACOT</strong><p>Architecture</p><h1 style="font-size:28px;font-weight:400">${heading}</h1></div><div style="padding:32px"><p style="line-height:1.7">${next}</p>${rows.map(([label, value]) => `<p><span style="font-size:12px;color:#62626b">${label}</span><br><strong>${escapeHtml(value)}</strong></p>`).join("")}<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 20px;background:#ffc919;color:#202026;text-decoration:none">View your purchase</a></p>${!confirmed && whatsapp ? `<p><a href="${escapeHtml(whatsapp)}">Complete purchase on WhatsApp</a></p>` : ""}</div></div></body></html>`;
    const attachments = confirmed
      ? undefined
      : [
          {
            filename: `${p.invoiceNumber}.pdf`,
            content: await (await import("./invoice")).generateDesignInvoice(p),
          },
        ];
    const payload = {
      from: email.from,
      to: p.customerEmail,
      subject: confirmed
        ? "Payment confirmed - Your Calacot design"
        : `Your Calacot design invoice - ${p.invoiceNumber}`,
      html,
      text: `${heading}\n\n${next}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${url}`,
      attachments,
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await email.client.emails.send(payload, {
          idempotencyKey: `design-${kind}/${p.id}`,
        });
        if (result.error || !result.data?.id)
          throw new Error(result.error?.name || "Missing email response");
        await db
          .update(designPurchases)
          .set(
            kind === "invoice"
              ? { invoiceEmailSentAt: new Date() }
              : { confirmationEmailSentAt: new Date() },
          )
          .where(eq(designPurchases.id, p.id));
        return;
      } catch {
        if (attempt === 2)
          throw new Error("Email delivery failed after retries");
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  } catch (error) {
    console.error("Design purchase email/PDF failed; purchase remains saved", {
      purchaseId: p.id,
      kind,
      reason: error instanceof Error ? error.message : "Unknown failure",
    });
  }
}
