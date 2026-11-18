import "server-only";
import { formatAmount } from "@/lib/design-purchases/model";
import type { DesignPurchaseRecord } from "@/database/schema";

const setting = (key: string) => process.env[key]?.trim() || "";
export function paymentInstructions() {
  const mobile = {
    network: setting("CALACOT_MOBILE_MONEY_NETWORK"),
    number: setting("CALACOT_MOBILE_MONEY_NUMBER"),
    account: setting("CALACOT_MOBILE_MONEY_ACCOUNT_NAME"),
    currency: setting("CALACOT_MOBILE_MONEY_CURRENCY") || "UGX",
  };
  const bank = {
    name: setting("CALACOT_BANK_NAME"),
    number: setting("CALACOT_BANK_ACCOUNT_NUMBER"),
    account: setting("CALACOT_BANK_ACCOUNT_NAME"),
    swift: setting("CALACOT_BANK_SWIFT"),
    currency: setting("CALACOT_BANK_CURRENCY") || "UGX",
  };
  return {
    mobile: mobile.network && mobile.number && mobile.account ? mobile : null,
    bank: bank.name && bank.number && bank.account ? bank : null,
  };
}
export function purchaseWhatsAppUrl(
  p: Pick<
    DesignPurchaseRecord,
    "purchaseReference" | "designTitle" | "packageName" | "amount" | "currency"
  >,
) {
  const number = setting("CALACOT_WHATSAPP_NUMBER").replace(/[+\s()-]/g, "");
  if (!/^[1-9]\d{7,14}$/.test(number)) return null;
  const message = `Hello Calacot, I'd like to complete purchase ${p.purchaseReference} for ${p.designTitle} - ${p.packageName}, ${formatAmount(p.amount, p.currency)}.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
export function purchaseUrl(id: string) {
  const origin = new URL(
    setting("CALACOT_APP_URL") || "https://www.calacot.com",
  );
  if (origin.hostname === "calacot.com") origin.hostname = "www.calacot.com";
  return new URL(
    `/account/designs/${encodeURIComponent(id)}`,
    origin,
  ).toString();
}

/**
 * Phase 1E: payment instructions approved in company settings (two-person approval) take
 * precedence; with no saved settings the deployment configuration above is used unchanged.
 * Issued quotation/invoice snapshots already contain the instructions in force when issued.
 */
export async function approvedPaymentInstructions(org?: string | null) {
  const organizationId = org || process.env.CALACOT_CLERK_ORG_ID?.trim();
  if (!organizationId) return paymentInstructions();
  const { db } = await import("@/database/db");
  const { sql } = await import("drizzle-orm");
  const r = await db.execute<{ payment: { bank: ReturnType<typeof paymentInstructions>["bank"]; mobile: ReturnType<typeof paymentInstructions>["mobile"] } | null }>(sql`SELECT settings->'payment' AS payment FROM company_settings_versions WHERE organization_id=${organizationId} AND status='approved' ORDER BY version DESC LIMIT 1`);
  const saved = r.rows[0]?.payment;
  return saved ? { bank: saved.bank ?? null, mobile: saved.mobile ?? null } : paymentInstructions();
}
