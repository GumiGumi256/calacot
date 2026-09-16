import { and, eq, inArray, sql } from "drizzle-orm";
import { designPurchases } from "@/database/schema";
import { openStatuses } from "./model";

export type ReviewDecision = "confirm" | "reject" | "cancel";
export function ownedPurchaseFilter(id: string, userId: string) {
  return and(
    eq(designPurchases.id, id),
    eq(designPurchases.clerkUserId, userId),
  );
}
export function paymentSubmissionFilter(id: string, userId: string) {
  return and(
    ownedPurchaseFilter(id, userId),
    inArray(designPurchases.purchaseStatus, [
      "awaiting_payment",
      "awaiting_contact",
    ]),
    inArray(designPurchases.paymentStatus, ["pending", "rejected"]),
  );
}
export function reviewFilter(
  id: string,
  revision: string,
  decision: ReviewDecision,
) {
  return and(
    eq(designPurchases.id, id),
    eq(designPurchases.revision, revision),
    decision === "reject"
      ? eq(designPurchases.purchaseStatus, "payment_submitted")
      : inArray(designPurchases.purchaseStatus, [...openStatuses]),
    decision === "reject"
      ? eq(designPurchases.paymentStatus, "submitted")
      : undefined,
  );
}
export function reviewChanges(
  decision: ReviewDecision,
  adminId: string,
  adminNotes: string,
) {
  return {
    ...(decision === "confirm"
      ? {
          purchaseStatus: "completed" as const,
          paymentStatus: "confirmed" as const,
          accessStatus: "active" as const,
        }
      : decision === "reject"
        ? {
            purchaseStatus: "awaiting_payment" as const,
            paymentStatus: "rejected" as const,
            accessStatus: "pending" as const,
          }
        : {
            purchaseStatus: "cancelled" as const,
            accessStatus: "revoked" as const,
          }),
    adminNotes: adminNotes || null,
    reviewedBy: adminId,
    reviewedAt: new Date(),
    updatedAt: new Date(),
    revision: sql`${designPurchases.revision} + 1`,
  };
}
