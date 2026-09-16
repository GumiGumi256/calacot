import { z } from "zod";
import type { DesignPurchaseRecord } from "@/database/schema";

export const purchaseStatuses = [
  "awaiting_payment",
  "awaiting_contact",
  "payment_submitted",
  "completed",
  "cancelled",
] as const;
export const openStatuses = [
  "awaiting_payment",
  "awaiting_contact",
  "payment_submitted",
] as const;
export const statusLabels = {
  awaiting_payment: "Awaiting payment",
  awaiting_contact: "Awaiting Calacot",
  payment_submitted: "Payment under review",
  completed: "Purchased",
  cancelled: "Cancelled",
};
export const TERMS_VERSION = "design-purchase-2026-09";
export type ActionState = { error?: string; success?: string };
export type PurchaseAction = (
  state: ActionState,
  data: FormData,
) => Promise<ActionState>;
export const purchaseSchema = z.object({
  designSlug: z.string().trim().min(1).max(200),
  packageId: z.string().trim().min(1).max(200),
  fullName: z.string().trim().min(2, "Enter your full name.").max(150),
  email: z.email("Enter a valid email address.").max(254),
  phone: z
    .string()
    .trim()
    .regex(
      /^\+?[\d\s().-]{7,25}$/,
      "Enter a valid phone number with country code.",
    ),
  acceptTerms: z.literal("true", {
    error: "Please accept the purchase terms.",
  }),
  preferredContactMethod: z
    .enum(["whatsapp", "phone", "email"])
    .default("email"),
  customerNote: z.string().trim().max(2000).default(""),
});
export const paymentSchema = z.object({
  purchaseId: z.uuid(),
  paymentMethod: z.enum(["mobile_money", "bank_transfer", "cash", "other"]),
  paymentReference: z
    .string()
    .trim()
    .min(3, "Enter the reference from your payment confirmation.")
    .max(150),
});
export const reviewSchema = z.object({
  purchaseId: z.uuid(),
  revision: z.string().regex(/^\d+$/),
  adminNotes: z.string().trim().max(4000).default(""),
});
export function canAccessDesign(
  p: Pick<DesignPurchaseRecord, "paymentStatus" | "accessStatus">,
) {
  return p.paymentStatus === "confirmed" && p.accessStatus === "active";
}
export function formatAmount(amount: string | number, currency = "UGX") {
  // Keep all 17 numeric digits intact instead of rounding through a JS float.
  const [whole, decimal = "00"] = String(amount).split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${decimal !== "00" ? `.${decimal.padEnd(2, "0")}` : ""}`;
}
export const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Africa/Kampala",
  }).format(date);
