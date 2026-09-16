import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { designPurchases } from "@/database/schema";
import { ownedPurchaseFilter } from "./transitions";

export async function requireUser(returnBackUrl = "/account/designs") {
  const session = await auth();
  if (!session.userId) return session.redirectToSignIn({ returnBackUrl });
  return session.userId;
}
export const isAdmin = cache(
  async () => (await currentUser())?.publicMetadata.role === "admin",
);
export async function requireAdmin() {
  const userId = await requireUser("/admin/design-purchases");
  if (!(await isAdmin())) notFound();
  return userId;
}
export async function getOwnedDesignPurchase(id: string, userId: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const [purchase] = await db
    .select()
    .from(designPurchases)
    .where(ownedPurchaseFilter(id, userId))
    .limit(1);
  if (!purchase) notFound();
  return purchase;
}
export async function getAdminDesignPurchase(id: string) {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) notFound();
  const [purchase] = await db
    .select()
    .from(designPurchases)
    .where(eq(designPurchases.id, id))
    .limit(1);
  if (!purchase) notFound();
  return purchase;
}
