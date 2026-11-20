"use server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { leadStatuses } from "./options";
import { clientSchema, divisions } from "@/lib/sales/contracts";
import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { expireAdminData } from "@/lib/cache-tags";

const schema = z.object({
  id: z.uuid(),
  status: z.enum(leadStatuses),
  adminNotes: z.string().trim().max(4000),
  division: z.union([z.enum(divisions), z.literal("")]),
  assignedStaffId: z.union([z.uuid(), z.literal("")]),
  followUpOn: z.union([z.iso.date(), z.literal("")]),
  followUpNotes: z.string().trim().max(4000),
});

export async function updateLead(_: { message: string; ok: boolean }, formData: FormData) {
  const ctx = await staffContext("leads_write");
  const parsed = schema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    adminNotes: formData.get("adminNotes") ?? "",
    division: formData.get("division") ?? "",
    assignedStaffId: formData.get("assignedStaffId") ?? "",
    followUpOn: formData.get("followUpOn") ?? "",
    followUpNotes: formData.get("followUpNotes") ?? "",
  });
  if (!parsed.success) return { ok: false, message: "Check the status and notes and try again." };
  const { id, status, adminNotes, division, assignedStaffId, followUpOn, followUpNotes } = parsed.data;
  try {
    if (assignedStaffId) {
      const staff = await db.execute<{ clerk_user_id: string }>(sql`SELECT clerk_user_id FROM staff_memberships WHERE id=${assignedStaffId}::uuid AND organization_id=${ctx.organizationId} AND status='active'`);
      if (!staff.rows.length) return { ok: false, message: "The selected employee is not available in this organization." };
      const clerk = await clerkClient();
      const memberships = await clerk.organizations.getOrganizationMembershipList({ organizationId: ctx.organizationId, userId: [staff.rows[0].clerk_user_id], limit: 1 });
      if (!memberships.data.some(member => member.organization.id === ctx.organizationId && member.publicUserData?.userId === staff.rows[0].clerk_user_id)) {
        return { ok: false, message: "The selected employee is no longer a member of this organization." };
      }
    }
    const result = await db.execute(
      sql`SELECT lead_update(${ctx.organizationId},${ctx.actor},${id}::uuid,${JSON.stringify({ status, notes: adminNotes, division, assignedStaffId, followUpOn, followUpNotes })}::jsonb)`,
    );
    if (!result.rows.length) return { ok: false, message: "This lead is no longer available." };
  } catch (error) {
    const text = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}` : "";
    if (text.includes("division_disabled")) return { ok: false, message: "That division is not currently enabled in company settings. Choose an enabled division." };
    return { ok: false, message: "Could not verify the employee or save this lead. Please try again." };
  }
  revalidatePath("/", "layout");
  expireAdminData(); // cached admin reads (lib/cache-tags.ts)
  return { ok: true, message: "Lead saved." };
}

export async function convertLead(input: unknown) {
  const ctx = await staffContext("leads_write");
  if (!ctx.permissions.includes("clients_write") || !ctx.permissions.includes("clients_read")) return { ok: false as const, error: "Client access is required." };
  const parsed = z.object({ leadId: z.uuid(), clientId: z.union([z.uuid(), z.literal("")]), client: z.unknown().optional(), reviewedClientIds: z.array(z.uuid()).max(1000).default([]), confirmDistinct: z.boolean().default(false) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check the conversion details." };
  const { leadId, clientId } = parsed.data;
  const client = clientId ? null : clientSchema.safeParse(parsed.data.client);
  if (client && !client.success) return { ok: false as const, error: "Check the client details, including department and contact." };
  try {
    const result = await db.execute<{ id: string }>(sql`SELECT lead_convert(${ctx.organizationId},${ctx.actor},${leadId}::uuid,${clientId || null}::uuid,${JSON.stringify(client ? { ...client.data, reviewedClientIds: parsed.data.reviewedClientIds, confirmDistinct: parsed.data.confirmDistinct } : null)}::jsonb,${randomUUID()}) AS id`);
    revalidatePath("/", "layout");
    expireAdminData(); // cached admin reads (lib/cache-tags.ts)
    return { ok: true as const, id: result.rows[0].id };
  } catch (error) {
    const text = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}` : "";
    if (text.includes("client_matches_changed") || text.includes("client_review_required")) return { ok: false as const, error: "Possible matches changed or need confirmation. Check clients again before converting." };
    return { ok: false as const, error: "Conversion could not be completed. Check that the lead is qualified and the client is available." };
  }
}
