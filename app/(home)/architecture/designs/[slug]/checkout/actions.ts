"use server";

import { currentUser } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { designPurchases, type DesignPurchaseRecord } from "@/database/schema";
import { getPurchasableDesign } from "@/lib/queries/design";
import { requireUser } from "@/lib/design-purchases/permissions";
import {
  purchaseSchema,
  openStatuses,
  TERMS_VERSION,
  type ActionState,
} from "@/lib/design-purchases/model";
import { createPurchaseReferences } from "@/lib/design-purchases/references";
import { queueDesignEmail } from "@/lib/design-purchases/email";
import { queuePurchaseCreatedWhatsApp } from "@/lib/whatsapp/purchase-notifications";

export async function createDesignPurchase(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUser();
  const parsed = purchaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const values = parsed.data;
  let purchase: DesignPurchaseRecord | undefined;
  try {
    const [user, design] = await Promise.all([
      currentUser(),
      getPurchasableDesign(values.designSlug),
    ]);
    const email = user?.emailAddresses.find(
      (address) =>
        address.emailAddress.toLowerCase() === values.email.toLowerCase() &&
        address.verification?.status === "verified",
    );
    if (!email)
      return {
        error:
          "Use an email address verified on your Calacot account. You can verify it in your account settings.",
      };
    const selected = design?.packages?.find(
      (item) => item.package?._id === values.packageId && item.package.isActive,
    );
    if (!design || design.status !== "available" || !selected)
      return {
        error:
          "This design or package is no longer available. Please choose an available package.",
      };
    const price = selected.price;
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isSafeInteger(Math.round(price * 100))
    )
      return {
        error: "This package's price needs review. Please contact Calacot.",
      };
    const findOpen = async () =>
      (
        await db
          .select()
          .from(designPurchases)
          .where(
            and(
              eq(designPurchases.clerkUserId, userId),
              eq(designPurchases.sanityDesignId, design._id),
              eq(designPurchases.sanityPackageId, selected.package._id),
              inArray(designPurchases.purchaseStatus, [...openStatuses]),
            ),
          )
          .limit(1)
      )[0];
    purchase = await findOpen();
    for (let attempt = 0; !purchase && attempt < 3; attempt++) {
      [purchase] = await db
        .insert(designPurchases)
        .values({
          clerkUserId: userId,
          customerName: values.fullName,
          customerEmail: email.emailAddress,
          customerPhone: values.phone,
          sanityDesignId: design._id,
          designSlug: design.slug,
          designTitle: design.title,
          designCode: design.designCode,
          sanityPackageId: selected.package._id,
          packageSlug: selected.package.slug,
          packageName: selected.package.name,
          packageDescription: selected.package.description,
          packageIncludes: selected.package.includes ?? [],
          amount: price.toFixed(2),
          currency: "UGX",
          ...createPurchaseReferences(),
          purchaseStatus: "awaiting_payment",
          preferredContactMethod: values.preferredContactMethod,
          customerNote: values.customerNote || null,
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();
      // A competing submission can win the partial unique index; return its snapshot.
      purchase ??= await findOpen();
    }
    if (!purchase)
      return { error: "We couldn't create your request. Please try again." };
  } catch {
    console.error("Design purchase creation failed", { userId });
    return {
      error:
        "We couldn't save your purchase request. Please try again; an existing request will be reused.",
    };
  }
  queueDesignEmail(purchase, "invoice");
  queuePurchaseCreatedWhatsApp(purchase);
  revalidatePath("/account/designs");
  revalidatePath("/admin/design-purchases");
  redirect(`/account/designs/${purchase.id}`);
}
