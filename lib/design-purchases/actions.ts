"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { designPurchases } from "@/database/schema";
import {
  requireUser,
  requireAdmin,
  getOwnedDesignPurchase,
  getAdminDesignPurchase,
} from "./permissions";
import { paymentSchema, reviewSchema, type ActionState } from "./model";
import {
  ownedPurchaseFilter,
  paymentSubmissionFilter,
  reviewFilter,
  reviewChanges,
} from "./transitions";
import { queueDesignEmail } from "./email";

function refreshPurchase(id: string) {
  revalidatePath("/account/designs");
  revalidatePath(`/account/designs/${id}`);
  revalidatePath("/admin/design-purchases");
  revalidatePath(`/admin/design-purchases/${id}`);
}

export async function submitDesignPaymentReference(
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  const userId = await requireUser();
  const parsed = paymentSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const values = parsed.data;
  await getOwnedDesignPurchase(values.purchaseId, userId);
  try {
    const [updated] = await db
      .update(designPurchases)
      .set({
        purchaseStatus: "payment_submitted",
        paymentStatus: "submitted",
        paymentMethod: values.paymentMethod,
        paymentReference: values.paymentReference,
        paymentSubmittedAt: new Date(),
        updatedAt: new Date(),
        revision: sql`${designPurchases.revision} + 1`,
      })
      .where(paymentSubmissionFilter(values.purchaseId, userId))
      .returning();
    if (!updated)
      return {
        error:
          "This purchase is already under review or closed. Refresh to see its current status.",
      };
    refreshPurchase(updated.id);
    return { success: "Payment submitted for verification." };
  } catch {
    return {
      error: "We couldn't save your payment reference. Please try again.",
    };
  }
}

async function reviewPurchase(
  data: FormData,
  decision: "confirm" | "reject" | "cancel",
): Promise<ActionState> {
  const adminId = await requireAdmin();
  const parsed = reviewSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success)
    return { error: "Check the purchase and notes, then try again." };
  const { purchaseId, revision, adminNotes } = parsed.data;
  if (decision === "reject" && !adminNotes)
    return {
      error: "Add a note explaining why the payment could not be verified.",
    };
  try {
    const [updated] = await db
      .update(designPurchases)
      .set(reviewChanges(decision, adminId, adminNotes))
      .where(reviewFilter(purchaseId, revision, decision))
      .returning();
    if (!updated)
      return {
        error:
          "This purchase changed or is already closed. Refresh before reviewing it again.",
      };
    if (decision === "confirm") queueDesignEmail(updated, "confirmed");
    refreshPurchase(updated.id);
    return {
      success:
        decision === "confirm"
          ? "Payment confirmed. Access is active."
          : decision === "reject"
            ? "Payment rejected. The customer can submit a new reference."
            : "Purchase cancelled.",
    };
  } catch {
    return {
      error: "The review could not be saved. Please refresh and try again.",
    };
  }
}
export async function confirmDesignPayment(_: ActionState, data: FormData) {
  return reviewPurchase(data, "confirm");
}
export async function rejectDesignPayment(_: ActionState, data: FormData) {
  return reviewPurchase(data, "reject");
}
export async function cancelDesignPurchase(_: ActionState, data: FormData) {
  return reviewPurchase(data, "cancel");
}

export async function requestDesignAssistance(
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  const userId = await requireUser();
  const id = z.uuid().safeParse(data.get("purchaseId"));
  if (!id.success) return { error: "Invalid purchase." };
  await getOwnedDesignPurchase(id.data, userId);
  try {
    const [updated] = await db
      .update(designPurchases)
      .set({
        purchaseStatus: "awaiting_contact",
        updatedAt: new Date(),
        revision: sql`${designPurchases.revision} + 1`,
      })
      .where(
        and(
          ownedPurchaseFilter(id.data, userId),
          eq(designPurchases.purchaseStatus, "awaiting_payment"),
        ),
      )
      .returning();
    if (!updated)
      return {
        error:
          "This purchase is already with Calacot or is no longer awaiting payment.",
      };
    refreshPurchase(id.data);
    return {
      success:
        "Your request is with Calacot. Our team will contact you using your preferred method.",
    };
  } catch {
    return { error: "We couldn't save your request. Please try again." };
  }
}

export async function retryDesignPurchaseEmail(
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  const p = await getAdminDesignPurchase(String(data.get("purchaseId") || ""));
  if (p.purchaseStatus === "cancelled")
    return { error: "This purchase is cancelled." };
  if (!p.invoiceEmailSentAt) queueDesignEmail(p, "invoice");
  if (p.purchaseStatus === "completed" && !p.confirmationEmailSentAt)
    queueDesignEmail(p, "confirmed");
  return {
    success:
      "Any undelivered emails have been queued. Refresh shortly to check delivery.",
  };
}
