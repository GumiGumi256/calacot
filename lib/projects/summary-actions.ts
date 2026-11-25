"use server";

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/database/db";
import { expireOrgData } from "@/lib/cache-tags";
import { staffContext } from "@/lib/sales/permissions";

type Result = { ok: boolean; message: string };
const optionalDate = z.union([z.iso.date(), z.literal("")]);

export async function updateProjectSummary(_: Result, data: FormData): Promise<Result> {
  const ctx = await staffContext("projects_write");
  const base = z.object({ projectId: z.uuid(), field: z.enum(["timeline", "manager"]) }).safeParse(Object.fromEntries(data));
  if (!base.success) return { ok: false, message: "Invalid project details." };
  const { projectId, field } = base.data;
  const dates = z.object({ start: optionalDate, due: optionalDate }).safeParse(Object.fromEntries(data));
  const manager = z.union([z.uuid(), z.literal("")]).safeParse(data.get("managerId"));
  if (field === "timeline" && (!dates.success || (dates.data.start && dates.data.due && dates.data.start > dates.data.due))) return { ok: false, message: "Enter valid dates with the deadline on or after the start date." };
  if (field === "manager" && !manager.success) return { ok: false, message: "Select an available project manager." };
  try {
    const start = dates.success ? dates.data.start || null : null;
    const due = dates.success ? dates.data.due || null : null;
    const managerId = manager.success ? manager.data || null : null;
    const result = await db.execute(sql`WITH old AS (
      SELECT id,starts_on,due_on,manager_id FROM projects WHERE organization_id=${ctx.organizationId} AND id=${projectId}::uuid AND archived_at IS NULL FOR UPDATE
    ), changed AS (
      UPDATE projects p SET starts_on=CASE WHEN ${field}='timeline' THEN ${start}::date ELSE p.starts_on END,
        due_on=CASE WHEN ${field}='timeline' THEN ${due}::date ELSE p.due_on END,
        manager_id=CASE WHEN ${field}='manager' THEN ${managerId}::uuid ELSE p.manager_id END,updated_at=now()
      FROM old WHERE p.organization_id=${ctx.organizationId} AND p.id=old.id
        AND (${field}<>'manager' OR ${managerId}::uuid IS NULL OR EXISTS(SELECT 1 FROM staff_memberships s WHERE s.organization_id=p.organization_id AND s.id=${managerId}::uuid AND s.status='active'))
      RETURNING p.id,old.starts_on AS old_start,old.due_on AS old_due,old.manager_id AS old_manager,p.starts_on,p.due_on,p.manager_id
    ), audit AS (INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
      SELECT ${ctx.organizationId},${ctx.actor},'staff',${field === "timeline" ? "project.timeline" : "project.manager"},'project',${projectId},jsonb_build_object('before',CASE WHEN ${field}='timeline' THEN jsonb_build_object('start',old_start,'due',old_due) ELSE jsonb_build_object('managerId',old_manager) END,'after',CASE WHEN ${field}='timeline' THEN jsonb_build_object('start',starts_on,'due',due_on) ELSE jsonb_build_object('managerId',manager_id) END),${randomUUID()} FROM changed)
    SELECT id FROM changed`);
    if (!result.rows.length) return { ok: false, message: "Could not update the project. Check that it and the selected manager are available." };
    expireOrgData(ctx.organizationId);
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true, message: "Project updated." };
  } catch { return { ok: false, message: "Could not update the project. Please try again." }; }
}
