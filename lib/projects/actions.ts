"use server";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";

const input = z.object({
  projectId: z.uuid(), taskId: z.uuid(), title: z.string().trim().min(1).max(200),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  assigneeId: z.union([z.uuid(), z.literal("")]),
  dueDate: z.union([z.iso.date(), z.literal("")]),
  mandatory: z.enum(["true", "false"]).default("true"),
});
export async function createProjectTask(_: { ok: boolean; message: string }, data: FormData) {
  const ctx = await staffContext("projects_write");
  const result = input.safeParse(Object.fromEntries(data));
  if (!result.success) return { ok: false, message: "Check the task title, priority and due date." };
  const p = result.data;
  const due = p.dueDate ? new Date(`${p.dueDate}T23:59:59+03:00`).toISOString() : null;
  try {
    if (p.assigneeId) {
      const staff = await db.execute<{ clerk_user_id: string }>(sql`SELECT clerk_user_id FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND id=${p.assigneeId}::uuid AND status='active'`);
      if (!staff.rows[0]) return { ok: false, message: "The selected employee is not available." };
      const clerk = await clerkClient();
      const members = await clerk.organizations.getOrganizationMembershipList({ organizationId: ctx.organizationId, userId: [staff.rows[0].clerk_user_id], limit: 1 });
      if (!members.data.some(m => m.organization.id === ctx.organizationId && m.publicUserData?.userId === staff.rows[0].clerk_user_id)) return { ok: false, message: "The selected employee is no longer a member of this organization." };
    }
    const correlation = randomUUID();
    const inserted = await db.execute(sql`WITH created AS (
      INSERT INTO tasks(id,organization_id,project_id,title,priority,assignee_id,due_at,mandatory)
      SELECT ${p.taskId}::uuid,${ctx.organizationId},p.id,${p.title},${p.priority},${p.assigneeId || null}::uuid,${due}::timestamptz,${p.mandatory === "true"}
      FROM projects p WHERE p.id=${p.projectId}::uuid AND p.organization_id=${ctx.organizationId} AND p.status IN ('planned','active','on_hold') AND p.archived_at IS NULL
      AND (${p.assigneeId || null}::uuid IS NULL OR EXISTS(SELECT 1 FROM staff_memberships s WHERE s.id=${p.assigneeId || null}::uuid AND s.organization_id=p.organization_id AND s.status='active'))
      ON CONFLICT (id) DO NOTHING RETURNING id
    ), audit AS (
      INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
      SELECT ${ctx.organizationId},${ctx.actor},'staff','task.create','project',${p.projectId},${JSON.stringify({ taskId: p.taskId, title: p.title, priority: p.priority, assigneeId: p.assigneeId || null, dueAt: due, mandatory: p.mandatory === "true" })}::jsonb,${correlation} FROM created
    ) SELECT id FROM created`);
    if (!inserted.rows.length) {
      const existing = await db.execute(sql`SELECT id FROM tasks WHERE id=${p.taskId}::uuid AND organization_id=${ctx.organizationId} AND project_id=${p.projectId}::uuid AND title=${p.title} AND priority=${p.priority} AND assignee_id IS NOT DISTINCT FROM ${p.assigneeId || null}::uuid AND due_at IS NOT DISTINCT FROM ${due}::timestamptz AND mandatory=${p.mandatory === "true"}`);
      if (!existing.rows.length) return { ok: false, message: "Task could not be created. Check the project and refresh before trying again." };
    }
    revalidatePath("/", "layout");
    return { ok: true, message: "Task created." };
  } catch {
    return { ok: false, message: "Task could not be saved or the employee could not be verified. Please try again." };
  }
}

const statusInput = z.object({
  projectId: z.uuid(), taskId: z.uuid(), updatedAt: z.iso.datetime(),
  status: z.enum(["todo", "in_progress", "blocked", "completed", "cancelled"]),
});
export async function updateProjectTaskStatus(_: { ok: boolean; message: string }, data: FormData) {
  const ctx = await staffContext("projects_write");
  const parsed = statusInput.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, message: "Check the task status and try again." };
  const p = parsed.data;
  try {
    const result = await db.execute(sql`WITH changed AS (
      UPDATE tasks t SET status=${p.status},completed_at=CASE WHEN ${p.status}='completed' THEN now() ELSE NULL END,updated_at=now()
      WHERE t.id=${p.taskId}::uuid AND t.organization_id=${ctx.organizationId} AND t.project_id=${p.projectId}::uuid AND t.updated_at=${p.updatedAt}::timestamptz
      AND t.status<>${p.status} AND EXISTS (SELECT 1 FROM projects p WHERE p.id=t.project_id AND p.organization_id=t.organization_id AND p.status IN ('planned','active','on_hold') AND p.archived_at IS NULL)
      RETURNING t.id
    ), audit AS (
      INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
      SELECT ${ctx.organizationId},${ctx.actor},'staff','task.status','project',${p.projectId},${JSON.stringify({ taskId: p.taskId, status: p.status })}::jsonb,${randomUUID()} FROM changed
    ) SELECT id FROM changed`);
    if (!result.rows.length) {
      const current = await db.execute(sql`SELECT t.id FROM tasks t JOIN projects p ON p.organization_id=t.organization_id AND p.id=t.project_id WHERE t.id=${p.taskId}::uuid AND t.organization_id=${ctx.organizationId} AND t.project_id=${p.projectId}::uuid AND t.status=${p.status} AND p.status IN ('planned','active','on_hold') AND p.archived_at IS NULL`);
      if (!current.rows.length) return { ok: false, message: "The task or project changed. Refresh before trying again." };
    }
    revalidatePath("/", "layout");
    return { ok: true, message: "Task status saved." };
  } catch {
    return { ok: false, message: "Task status could not be saved. Please try again." };
  }
}

export async function editProjectTask(_: { ok: boolean; message: string }, data: FormData) {
  const ctx = await staffContext("projects_write");
  const parsed = input.extend({ updatedAt: z.iso.datetime() }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, message: "Check the task details and try again." };
  const p = parsed.data;
  const due = p.dueDate ? new Date(`${p.dueDate}T23:59:59+03:00`).toISOString() : null;
  try {
    if (p.assigneeId) {
      const staff = await db.execute<{ clerk_user_id: string }>(sql`SELECT clerk_user_id FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND id=${p.assigneeId}::uuid AND status='active'`);
      if (!staff.rows[0]) return { ok: false, message: "The selected employee is not available." };
      const clerk = await clerkClient();
      const members = await clerk.organizations.getOrganizationMembershipList({ organizationId: ctx.organizationId, userId: [staff.rows[0].clerk_user_id], limit: 1 });
      if (!members.data.some(m => m.organization.id === ctx.organizationId && m.publicUserData?.userId === staff.rows[0].clerk_user_id)) return { ok: false, message: "The selected employee is no longer a member of this organization." };
    }
    const result = await db.execute(sql`WITH changed AS (
      UPDATE tasks t SET title=${p.title},priority=${p.priority},assignee_id=${p.assigneeId || null}::uuid,due_at=${due}::timestamptz,mandatory=${p.mandatory === "true"},updated_at=now()
      WHERE t.id=${p.taskId}::uuid AND t.organization_id=${ctx.organizationId} AND t.project_id=${p.projectId}::uuid AND t.updated_at=${p.updatedAt}::timestamptz
      AND EXISTS(SELECT 1 FROM projects pr WHERE pr.id=t.project_id AND pr.organization_id=t.organization_id AND pr.status IN ('planned','active','on_hold') AND pr.archived_at IS NULL)
      AND (${p.assigneeId || null}::uuid IS NULL OR EXISTS(SELECT 1 FROM staff_memberships s WHERE s.id=${p.assigneeId || null}::uuid AND s.organization_id=t.organization_id AND s.status='active'))
      RETURNING t.id
    ), audit AS (
      INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
      SELECT ${ctx.organizationId},${ctx.actor},'staff','task.edit','project',${p.projectId},${JSON.stringify({ taskId: p.taskId, title: p.title, priority: p.priority, assigneeId: p.assigneeId || null, dueAt: due, mandatory: p.mandatory === "true" })}::jsonb,${randomUUID()} FROM changed
    ) SELECT id FROM changed`);
    if (!result.rows.length) {
      const same = await db.execute(sql`SELECT t.id FROM tasks t JOIN projects pr ON pr.organization_id=t.organization_id AND pr.id=t.project_id WHERE t.id=${p.taskId}::uuid AND t.organization_id=${ctx.organizationId} AND t.project_id=${p.projectId}::uuid AND t.title=${p.title} AND t.priority=${p.priority} AND t.assignee_id IS NOT DISTINCT FROM ${p.assigneeId || null}::uuid AND t.due_at IS NOT DISTINCT FROM ${due}::timestamptz AND t.mandatory=${p.mandatory === "true"} AND pr.status IN ('planned','active','on_hold') AND pr.archived_at IS NULL`);
      if (!same.rows.length) return { ok: false, message: "The task or project changed. Refresh before trying again." };
    }
    revalidatePath("/", "layout");
    return { ok: true, message: "Task details saved." };
  } catch {
    return { ok: false, message: "Task could not be saved or the employee could not be verified. Please try again." };
  }
}

export async function addProjectTaskComment(_: { ok: boolean; message: string }, data: FormData) {
  const ctx = await staffContext("projects_write");
  const parsed = z.object({ projectId: z.uuid(), taskId: z.uuid(), commentId: z.uuid(), body: z.string().trim().min(1).max(4000) }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, message: "Enter a comment of up to 4,000 characters." };
  const p = parsed.data;
  try {
    const result = await db.execute(sql`WITH created AS (
      INSERT INTO task_comments(id,organization_id,task_id,author_id,body)
      SELECT ${p.commentId}::uuid,${ctx.organizationId},t.id,s.id,${p.body}
      FROM tasks t JOIN projects pr ON pr.id=t.project_id AND pr.organization_id=t.organization_id
      JOIN staff_memberships s ON s.organization_id=t.organization_id AND s.clerk_user_id=${ctx.actor} AND s.status='active'
      WHERE t.id=${p.taskId}::uuid AND t.project_id=${p.projectId}::uuid AND t.organization_id=${ctx.organizationId} AND pr.status IN ('planned','active','on_hold') AND pr.archived_at IS NULL
      ON CONFLICT (id) DO NOTHING RETURNING id
    ), audit AS (
      INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
      SELECT ${ctx.organizationId},${ctx.actor},'staff','task.comment','project',${p.projectId},${JSON.stringify({taskId: p.taskId, commentId: p.commentId})}::jsonb,${randomUUID()} FROM created
    ) SELECT id FROM created`);
    if (!result.rows.length) {
      const existing = await db.execute(sql`SELECT c.id FROM task_comments c JOIN staff_memberships s ON s.organization_id=c.organization_id AND s.id=c.author_id JOIN tasks t ON t.organization_id=c.organization_id AND t.id=c.task_id WHERE c.id=${p.commentId}::uuid AND c.organization_id=${ctx.organizationId} AND c.task_id=${p.taskId}::uuid AND t.project_id=${p.projectId}::uuid AND s.clerk_user_id=${ctx.actor} AND c.body=${p.body}`);
      if (!existing.rows.length) return { ok: false, message: "The task is unavailable or your staff membership is not synchronized." };
    }
    revalidatePath("/", "layout");
    return { ok: true, message: "Comment added." };
  } catch {
    return { ok: false, message: "Comment could not be saved. Please try again." };
  }
}

const milestoneInput = z.object({ projectId: z.uuid(), milestoneId: z.uuid(), title: z.string().trim().min(1).max(200), deliverable: z.string().trim().min(1).max(4000), dueDate: z.union([z.iso.date(), z.literal("")]), assigneeId: z.union([z.uuid(), z.literal("")]), mandatory: z.enum(["true", "false"]) });
export async function createProjectMilestone(_: {ok: boolean; message: string}, data: FormData) {
  const ctx = await staffContext("projects_write");
  const parsed = milestoneInput.safeParse(Object.fromEntries(data));
  if (!parsed.success) return {ok: false, message: "Enter a title and deliverable, and check the target date."};
  const p = parsed.data;
  const due = p.dueDate ? new Date(`${p.dueDate}T23:59:59+03:00`).toISOString() : null;
  try {
    if (p.assigneeId) {
      const staff = await db.execute<{clerk_user_id:string}>(sql`SELECT clerk_user_id FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND id=${p.assigneeId}::uuid AND status='active'`);
      if (!staff.rows[0]) return {ok:false,message:"The selected employee is not available."};
      const clerk = await clerkClient();
      const members = await clerk.organizations.getOrganizationMembershipList({organizationId:ctx.organizationId,userId:[staff.rows[0].clerk_user_id],limit:1});
      if (!members.data.some(m=>m.organization.id===ctx.organizationId && m.publicUserData?.userId===staff.rows[0].clerk_user_id)) return {ok:false,message:"The selected employee is no longer a member of this organization."};
    }
    const result = await db.execute(sql`WITH created AS (
      INSERT INTO project_milestones(id,organization_id,project_id,title,deliverable,due_at,responsible_staff_id,mandatory,position)
      SELECT ${p.milestoneId}::uuid,${ctx.organizationId},pr.id,${p.title},${p.deliverable},${due}::timestamptz,${p.assigneeId || null}::uuid,${p.mandatory === "true"},(SELECT coalesce(max(position),-1)+1 FROM project_milestones WHERE organization_id=pr.organization_id AND project_id=pr.id)
      FROM projects pr WHERE pr.id=${p.projectId}::uuid AND pr.organization_id=${ctx.organizationId} AND pr.status IN ('planned','active','on_hold') AND pr.archived_at IS NULL
      AND (${p.assigneeId || null}::uuid IS NULL OR EXISTS(SELECT 1 FROM staff_memberships s WHERE s.id=${p.assigneeId || null}::uuid AND s.organization_id=pr.organization_id AND s.status='active'))
      ON CONFLICT (id) DO NOTHING RETURNING id
    ), audit AS (INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) SELECT ${ctx.organizationId},${ctx.actor},'staff','milestone.create','project',${p.projectId},${JSON.stringify({milestoneId:p.milestoneId,title:p.title,deliverable:p.deliverable,assigneeId:p.assigneeId || null,dueAt:due,mandatory:p.mandatory === "true"})}::jsonb,${randomUUID()} FROM created) SELECT id FROM created`);
    if (!result.rows.length) {
      const same=await db.execute(sql`SELECT id FROM project_milestones WHERE id=${p.milestoneId}::uuid AND organization_id=${ctx.organizationId} AND project_id=${p.projectId}::uuid AND title=${p.title} AND deliverable=${p.deliverable} AND due_at IS NOT DISTINCT FROM ${due}::timestamptz AND responsible_staff_id IS NOT DISTINCT FROM ${p.assigneeId || null}::uuid AND mandatory=${p.mandatory === "true"}`);
      if (!same.rows.length) return {ok:false,message:"The milestone or project is unavailable. Refresh and try again."};
    }
    revalidatePath("/", "layout"); return {ok:true,message:"Milestone created."};
  } catch { return {ok:false,message:"Milestone could not be saved. Refresh and try again."}; }
}

export async function reviewProjectMilestone(_: {ok:boolean;message:string}, data:FormData) {
  const ctx=await staffContext("projects_write");
  const parsed=z.object({projectId:z.uuid(),milestoneId:z.uuid(),updatedAt:z.iso.datetime(),decision:z.enum(["submit","approve","reject"]),note:z.string().trim().max(4000)}).safeParse(Object.fromEntries(data));
  if (!parsed.success) return {ok:false,message:"Check the milestone action and feedback."};
  const p=parsed.data;
  if (p.decision!=="submit" && ctx.role!=="org:admin") return {ok:false,message:"Only an administrator can review milestones."};
  if ((p.decision==="submit" || p.decision==="reject") && !p.note) return {ok:false,message:p.decision==="submit" ? "Provide completion evidence." : "Provide feedback before rejecting."};
  const target=p.decision==="submit" ? "awaiting_approval" : p.decision==="approve" ? "completed" : "in_progress";
  try {
    const changed=await db.execute(sql`WITH changed AS (UPDATE project_milestones m SET status=${target},completion_evidence=CASE WHEN ${p.decision}='submit' THEN ${p.note} ELSE m.completion_evidence END,review_feedback=CASE WHEN ${p.decision}='submit' THEN NULL ELSE ${p.note || null} END,reviewed_by=CASE WHEN ${p.decision}='submit' THEN NULL ELSE ${ctx.actor} END,reviewed_at=CASE WHEN ${p.decision}='submit' THEN NULL ELSE now() END,completed_at=CASE WHEN ${p.decision}='approve' THEN now() ELSE NULL END,updated_at=now() WHERE m.organization_id=${ctx.organizationId} AND m.project_id=${p.projectId}::uuid AND m.id=${p.milestoneId}::uuid AND m.updated_at=${p.updatedAt}::timestamptz AND ((${p.decision}='submit' AND m.status IN ('pending','in_progress')) OR (${p.decision}<>'submit' AND m.status='awaiting_approval')) RETURNING m.id), audit AS (INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) SELECT ${ctx.organizationId},${ctx.actor},'staff','milestone.' || ${p.decision},'project',${p.projectId},${JSON.stringify({milestoneId:p.milestoneId,decision:p.decision,note:p.note})}::jsonb,${randomUUID()} FROM changed) SELECT id FROM changed`);
    if (!changed.rows.length) {
      const same = await db.execute(sql`SELECT id FROM project_milestones WHERE organization_id=${ctx.organizationId} AND project_id=${p.projectId}::uuid AND id=${p.milestoneId}::uuid AND status=${target} AND ((${p.decision}='submit' AND completion_evidence=${p.note}) OR (${p.decision}<>'submit' AND reviewed_by=${ctx.actor} AND review_feedback IS NOT DISTINCT FROM ${p.note || null}))`);
      if (!same.rows.length) return {ok:false,message:"The milestone changed or is unavailable. Refresh before trying again."};
    }
    revalidatePath("/", "layout"); return {ok:true,message:"Milestone updated."};
  } catch { return {ok:false,message:"Milestone could not be updated. Please refresh and try again."}; }
}

export async function transitionProject(_: {ok:boolean;message:string}, data:FormData) {
  const ctx=await staffContext("projects_write");
  if (ctx.role!=="org:admin") return {ok:false,message:"Only an administrator can change the project lifecycle."};
  const parsed=z.object({projectId:z.uuid(),target:z.enum(["active","on_hold","completed","cancelled"]),reason:z.string().trim().max(4000)}).safeParse(Object.fromEntries(data));
  if (!parsed.success) return {ok:false,message:"Check the requested transition and exception reason."};
  const p=parsed.data;
  try {
    await db.execute(sql`SELECT project_execution_transition(${ctx.organizationId},${ctx.actor},${p.projectId}::uuid,${p.target},${p.reason},${randomUUID()})`);
    revalidatePath("/", "layout"); return {ok:true,message:"Project status updated."};
  } catch (error) {
    const detail = error instanceof Error ? `${error.message} ${String(error.cause || "")}` : String(error);
    if (detail.includes("project_exception_required")) return {ok:false,message:"Required work remains. Record an exception of at least 10 characters to close this project."};
    if (detail.includes("confirmed_quotation_required")) return {ok:false,message:"A confirmed quotation is required for this transition."};
    return {ok:false,message:"The transition is unavailable or the project changed. Refresh and try again."};
  }
}

export async function editProjectMilestone(_: {ok:boolean;message:string}, data:FormData) {
  const ctx=await staffContext("projects_write");
  const parsed=milestoneInput.extend({updatedAt:z.iso.datetime()}).safeParse(Object.fromEntries(data));
  if (!parsed.success) return {ok:false,message:"Check the milestone details and target date."};
  const p=parsed.data;
  const due=p.dueDate ? new Date(`${p.dueDate}T23:59:59+03:00`).toISOString() : null;
  try {
    if (p.assigneeId) {
      const staff=await db.execute<{clerk_user_id:string}>(sql`SELECT clerk_user_id FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND id=${p.assigneeId}::uuid AND status='active'`);
      if (!staff.rows[0]) return {ok:false,message:"The selected employee is not available."};
      const clerk=await clerkClient();
      const members=await clerk.organizations.getOrganizationMembershipList({organizationId:ctx.organizationId,userId:[staff.rows[0].clerk_user_id],limit:1});
      if (!members.data.some(m=>m.organization.id===ctx.organizationId && m.publicUserData?.userId===staff.rows[0].clerk_user_id)) return {ok:false,message:"The selected employee is no longer a member of this organization."};
    }
    const result=await db.execute(sql`WITH changed AS (
      UPDATE project_milestones m SET title=${p.title},deliverable=${p.deliverable},due_at=${due}::timestamptz,responsible_staff_id=${p.assigneeId || null}::uuid,mandatory=${p.mandatory === "true"},updated_at=now()
      WHERE m.id=${p.milestoneId}::uuid AND m.organization_id=${ctx.organizationId} AND m.project_id=${p.projectId}::uuid AND m.updated_at=${p.updatedAt}::timestamptz AND m.status IN ('pending','in_progress')
      AND EXISTS(SELECT 1 FROM projects pr WHERE pr.id=m.project_id AND pr.organization_id=m.organization_id AND pr.status IN ('planned','active','on_hold') AND pr.archived_at IS NULL)
      AND (${p.assigneeId || null}::uuid IS NULL OR EXISTS(SELECT 1 FROM staff_memberships s WHERE s.id=${p.assigneeId || null}::uuid AND s.organization_id=m.organization_id AND s.status='active')) RETURNING m.id
    ), audit AS (INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) SELECT ${ctx.organizationId},${ctx.actor},'staff','milestone.edit','project',${p.projectId},${JSON.stringify({milestoneId:p.milestoneId,title:p.title,deliverable:p.deliverable,assigneeId:p.assigneeId || null,dueAt:due,mandatory:p.mandatory === "true"})}::jsonb,${randomUUID()} FROM changed) SELECT id FROM changed`);
    if (!result.rows.length) {
      const same=await db.execute(sql`SELECT id FROM project_milestones WHERE organization_id=${ctx.organizationId} AND project_id=${p.projectId}::uuid AND id=${p.milestoneId}::uuid AND status IN ('pending','in_progress') AND title=${p.title} AND deliverable=${p.deliverable} AND due_at IS NOT DISTINCT FROM ${due}::timestamptz AND responsible_staff_id IS NOT DISTINCT FROM ${p.assigneeId || null}::uuid AND mandatory=${p.mandatory === "true"} AND EXISTS(SELECT 1 FROM projects pr WHERE pr.id=${p.projectId}::uuid AND pr.organization_id=${ctx.organizationId} AND pr.status IN ('planned','active','on_hold') AND pr.archived_at IS NULL)`);
      if (!same.rows.length) return {ok:false,message:"The milestone changed or is unavailable. Refresh before trying again."};
    }
    revalidatePath("/","layout"); return {ok:true,message:"Milestone saved."};
  } catch { return {ok:false,message:"Milestone could not be saved or the employee could not be verified."}; }
}
