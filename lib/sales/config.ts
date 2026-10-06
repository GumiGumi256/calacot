import "server-only";
import { z } from "zod";
export function salesConfig() {
  const mode = z
    .enum(["capture", "staging", "live"])
    .parse(process.env.SALES_NOTIFICATION_MODE || "capture");
  const taxRate = process.env.CALACOT_APPROVED_TAX_RATE || "0";
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(taxRate))
    throw new Error("Set an approved tax rate from 0 to 99.99");
  const dueDays = Number(process.env.CALACOT_INVOICE_DUE_DAYS || "14");
  if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365)
    throw new Error("Invalid invoice payment period");
  return {
    mode,
    taxRate,
    dueDays,
    policy: z
      .enum(["full", "deposit"])
      .parse(process.env.CALACOT_INITIAL_BILLING_POLICY || "full"),
    template: process.env.WHATSAPP_PROJECT_CONFIRMATION_TEMPLATE || "",
    language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
    templateApproved: process.env.WHATSAPP_PROJECT_TEMPLATE_APPROVED === "true",
    allowlist: (process.env.SALES_SEND_ALLOWLIST || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    from: process.env.RESEND_FROM_EMAIL || "",
    replyTo: process.env.CALACOT_REPLY_TO_EMAIL || "",
  };
}
