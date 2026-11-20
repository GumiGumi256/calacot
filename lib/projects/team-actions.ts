"use server";

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { expireAdminData } from "@/lib/cache-tags";

const optionalText = (max: number) => z.string().trim().max(max).default("");
const memberInput = z.object({
  projectId: z.uuid(), kind: z.enum(["staff", "external"]),
  staffId: z.union([z.uuid(), z.literal("")]).default(""),
  name: optionalText(200), company: optionalText(200), phone: optionalText(50),
  email: z.union([z.email(), z.literal("")]).default(""), responsibility: optionalText(200),
});
type Result = { ok: boolean; message: string };

export async function addProjectMember(_: Result, data: FormData): Promise<Result> {
  const ctx = await staffContext("projects_write");
  const parsed = memberInput.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, message: "Check the team member details and email address." };
  const p = parsed.data;
  if ((p.kind === "staff" && !p.staffId) || (p.kind === "external" && !p.name)) return { ok: false, message: "Select a staff member or enter the external member's name." };
  try {
    const result = await db.execute(sql`WITH added AS (
      INSERT INTO project_members(organization_id,project_id,staff_id,external_name,external_company,external_phone,external_email,responsibility)
      SELECT ${ctx.organizationId},p.id,${p.kind === "staff" ? p.staffId : null}::uuid,${p.kind === "external" ? p.name : null},${p.kind === "external" ? p.company || null : null},${p.kind === "external" ? p.phone || null : null},${p.kind === "external" ? p.email || null : null},${p.responsibility || null}
      FROM projects p WHERE p.organization_id=${ctx.organizationId} AND p.id=${p.projectId}::uuid AND p.archived_at IS NULL
      AND (${p.kind}='external' OR EXISTS(SELECT 1 FROM staff_memberships s WHERE s.organization_id=p.organization_id AND s.id=${p.staffId || null}::uuid AND s.status='active'))
      ON CONFLICT (organization_id,project_id,staff_id) DO NOTHING RETURNING id
    ), audit AS (INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
      SELECT ${ctx.organizationId},${ctx.actor},'staff','team.add','project',${p.projectId},jsonb_build_object('memberId',id,'kind',${p.kind}::text),${randomUUID()} FROM added)
    SELECT id FROM added`);
    if (!result.rows.length) return { ok: false, message: "Member could not be added. Check that the project and staff member are active and that the staff member is not already on the team." };
    expireAdminData(ctx.organizationId);
    revalidatePath(`/admin/projects/${p.projectId}`);
    return { ok: true, message: "Team member added." };
  } catch { return { ok: false, message: "Could not add the team member. Please try again." }; }
}

export async function removeProjectMember(_: Result, data: FormData): Promise<Result> {
  const ctx = await staffContext("projects_write");
  const parsed = z.object({ projectId: z.uuid(), memberId: z.uuid() }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, message: "Invalid team member." };
  const { projectId, memberId } = parsed.data;
  try {
    const result = await db.execute(sql`WITH removed AS (DELETE FROM project_members m USING projects p
      WHERE m.id=${memberId}::uuid AND m.organization_id=${ctx.organizationId} AND m.project_id=${projectId}::uuid
      AND p.id=m.project_id AND p.organization_id=m.organization_id AND p.archived_at IS NULL RETURNING m.id),
      audit AS (INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
      SELECT ${ctx.organizationId},${ctx.actor},'staff','team.remove','project',${projectId},jsonb_build_object('memberId',id),${randomUUID()} FROM removed) SELECT id FROM removed`);
    if (!result.rows.length) return { ok: false, message: "Team member could not be removed. Refresh and try again." };
    expireAdminData(ctx.organizationId);
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true, message: "Team member removed." };
  } catch { return { ok: false, message: "Could not remove the team member. Please try again." }; }
}
