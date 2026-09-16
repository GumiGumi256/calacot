import "server-only";
import { absoluteUrl } from "@/lib/seo";
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
  const origin = setting("CALACOT_APP_URL");
  return origin
    ? new URL(`/account/designs/${id}`, origin).toString()
    : absoluteUrl(`/account/designs/${id}`);
}
