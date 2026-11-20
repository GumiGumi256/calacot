"use server";
import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { staffContext } from "@/lib/sales/permissions";
import { reconcileOrganization } from "./staff-sync";
import { expireAdminData } from "@/lib/cache-tags";

/** Explicit administrator reconciliation. Assignments still verify Clerk independently. */
export async function reconcileStaffMemberships(): Promise<{ ok: boolean; message: string }> {
  const ctx = await staffContext();
  if (ctx.role !== "org:admin") return { ok: false, message: "Only an administrator can refresh staff memberships." };
  try {
    const clerk = await clerkClient();
    const admin = await clerk.organizations.getOrganizationMembershipList({ organizationId: ctx.organizationId, userId: [ctx.actor], limit: 1 });
    if (!admin.data.some((m) => m.organization.id === ctx.organizationId && m.publicUserData?.userId === ctx.actor && m.role === "org:admin")) return { ok: false, message: "Your administrator membership could not be verified." };
    const updated = await reconcileOrganization(clerk, ctx.organizationId, ctx.actor, randomUUID());
    revalidatePath("/", "layout");
    expireAdminData(); // cached admin reads (lib/cache-tags.ts)
    return { ok: true, message: `Staff refresh completed for ${updated} records.` };
  } catch (e) {
    if (e instanceof Error && e.message === "organization_too_large") return { ok: false, message: "The organization is too large for this refresh. Contact an administrator." };
    return { ok: false, message: "Staff refresh did not finish. Assignments still require live Clerk verification; please retry." };
  }
}
