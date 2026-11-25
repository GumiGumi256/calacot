"use server";

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { expireAdminData } from "@/lib/cache-tags";

const optionalText = (max: number) => z.string().trim().max(max).default("");
const money = z.string().trim().regex(/^\d{1,15}(\.\d{1,2})?$/);
const memberInput = z.object({
  projectId: z.uuid(), kind: z.enum(["staff", "external"]),
  staffId: z.union([z.uuid(), z.literal("")]).default(""),
  name: optionalText(200), company: optionalText(200), phone: optionalText(50),
  email: z.union([z.email(), z.literal("")]).default(""), responsibility: optionalText(200),
  agreedAmount: z.union([money, z.literal("")]).default(""),
});
type Result = { ok: boolean; message: string };

export async function addProjectMember(_: Result, data: FormData): Promise<Result> {
  const ctx = await staffContext("projects_write");
  const parsed = memberInput.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.path[0] === "agreedAmount" ? "Enter the agreed pay using digits and up to two decimals, or leave it empty." : "Check the team member details and email address." };
  const p = parsed.data;
  if ((p.kind === "staff" && !p.staffId) || (p.kind === "external" && !p.name)) return { ok: false, message: "Select a staff member or enter the external member's name." };
  try {
    const result = await db.execute(sql`WITH added AS (
      INSERT INTO project_members(organization_id,project_id,staff_id,external_name,external_company,external_phone,external_email,responsibility,agreed_amount)
      SELECT ${ctx.organizationId},p.id,${p.kind === "staff" ? p.staffId : null}::uuid,${p.kind === "external" ? p.name : null},${p.kind === "external" ? p.company || null : null},${p.kind === "external" ? p.phone || null : null},${p.kind === "external" ? p.email || null : null},${p.responsibility || null},${p.agreedAmount || null}::numeric
      FROM projects p WHERE p.organization_id=${ctx.organizationId} AND p.id=${p.projectId}::uuid AND p.archived_at IS NULL
      AND (${p.kind}='external' OR EXISTS(SELECT 1 FROM staff_memberships s WHERE s.organization_id=p.organization_id AND s.id=${p.staffId || null}::uuid AND s.status='active'))
      ON CONFLICT (organization_id,project_id,staff_id) DO NOTHING RETURNING id
    ), audit AS (INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
      SELECT ${ctx.organizationId},${ctx.actor},'staff','team.add','project',${p.projectId},jsonb_build_object('memberId',id,'kind',${p.kind}::text,'agreedAmount',${p.agreedAmount || null}::text),${randomUUID()} FROM added)
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
  // Shares of project expenses reference the member (migration 0026); keep per-person totals intact.
  const paid = await db.execute(sql`SELECT 1 FROM expense_payees WHERE organization_id=${ctx.organizationId} AND project_member_id=${memberId}::uuid LIMIT 1`);
  if (paid.rows.length) return { ok: false, message: "This person has payments recorded on this project's expenses, so they stay on the team to keep the payment records complete." };
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

/** Sets or clears what a team member is to earn on the project (project currency). Audited as team.pay. */
export async function setMemberAgreedPay(_: Result, data: FormData): Promise<Result> {
  const ctx = await staffContext("projects_write");
  const parsed = z.object({ projectId: z.uuid(), memberId: z.uuid(), agreedAmount: z.union([money, z.literal("")]).default("") }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, message: "Enter the agreed pay using digits and up to two decimals, or leave it empty to clear it." };
  const { projectId, memberId, agreedAmount } = parsed.data;
  try {
    const result = await db.execute(sql`WITH old AS (SELECT m.id,m.agreed_amount FROM project_members m JOIN projects p ON p.organization_id=m.organization_id AND p.id=m.project_id
        WHERE m.organization_id=${ctx.organizationId} AND m.id=${memberId}::uuid AND m.project_id=${projectId}::uuid AND p.archived_at IS NULL FOR UPDATE OF m),
      changed AS (UPDATE project_members m SET agreed_amount=${agreedAmount || null}::numeric FROM old WHERE m.organization_id=${ctx.organizationId} AND m.id=old.id RETURNING m.id,old.agreed_amount AS before,m.agreed_amount AS after),
      audit AS (INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
        SELECT ${ctx.organizationId},${ctx.actor},'staff','team.pay','project',${projectId},jsonb_build_object('memberId',id,'before',before::text,'after',after::text),${randomUUID()} FROM changed WHERE before IS DISTINCT FROM after)
      SELECT id FROM changed`);
    if (!result.rows.length) return { ok: false, message: "Agreed pay could not be saved. Refresh and try again." };
    expireAdminData(ctx.organizationId);
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true, message: agreedAmount ? "Agreed pay saved." : "Agreed pay cleared." };
  } catch { return { ok: false, message: "Could not save the agreed pay. Please try again." }; }
}

/**
 * Administrators: sets the project's contract value (what the client pays, project currency), used for
 * profit and margin instead of the confirmed quotation total. Empty clears it. Audited.
 */
export async function setProjectContractValue(_: Result, data: FormData): Promise<Result> {
  const ctx = await staffContext("projects_write", "fresh");
  if (ctx.role !== "org:admin") return { ok: false, message: "Only an administrator can set the contract value." };
  const parsed = z.object({ projectId: z.uuid(), amount: z.union([money, z.literal("")]).default("") }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, message: "Enter the contract value using digits and up to two decimals, or leave it empty to use the quotation total." };
  const { projectId, amount } = parsed.data;
  try {
    const result = await db.execute(sql`WITH old AS (SELECT id,budget FROM projects WHERE organization_id=${ctx.organizationId} AND id=${projectId}::uuid AND archived_at IS NULL FOR UPDATE),
      changed AS (UPDATE projects p SET budget=${amount || null}::numeric,updated_at=now() FROM old WHERE p.organization_id=${ctx.organizationId} AND p.id=old.id RETURNING p.id,old.budget AS before,p.budget AS after),
      audit AS (INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
        SELECT ${ctx.organizationId},${ctx.actor},'staff','project.contract_value','project',id::text,jsonb_build_object('before',before::text,'after',after::text),${randomUUID()} FROM changed WHERE before IS DISTINCT FROM after)
      SELECT id FROM changed`);
    if (!result.rows.length) return { ok: false, message: "The contract value could not be saved. Refresh and try again." };
    expireAdminData(ctx.organizationId);
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true, message: amount ? "Contract value saved." : "Contract value cleared. The confirmed quotation total is used instead." };
  } catch { return { ok: false, message: "Could not save the contract value. Please try again." }; }
}
