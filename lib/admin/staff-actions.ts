"use server";
import { clerkClient } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { expireAdminData } from "@/lib/cache-tags";
import { db } from "@/database/db";
import { financeMutation as adminMutation, type FinanceResult } from "@/lib/finance/context";
import { staffRoles, maskEmail, divisionsList } from "./roles";
import { syncStaffMember } from "./staff-sync";
import { invalidateLiveMembership } from "@/lib/sales/permissions";

const fields = (data: FormData) => Object.fromEntries([...data.entries()].filter(([, v]) => typeof v === "string"));
const invalid = (message: string): FinanceResult => ({ ok: false, message });
const audit = (org: string, actor: string, action: string, entityId: string, changes: Record<string, unknown>, correlation: string) =>
  db.execute(sql`INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) VALUES(${org},${actor},'staff',${action},'staff_membership',${entityId},${JSON.stringify(changes)}::jsonb,${correlation})`);
const refresh = () => { revalidatePath("/admin/staff", "layout"); revalidatePath("/", "layout"); expireAdminData(); };
const clerkUserId = z.string().regex(/^user_[A-Za-z0-9]{1,64}$/);

async function configuredRoles(clerk: Awaited<ReturnType<typeof clerkClient>>) {
  const list = await clerk.organizationRoles.getOrganizationRoleList({ limit: 100 });
  return new Set(list.data.map((r) => r.key));
}

/** Serializes membership changes made through this app so last-administrator checks cannot interleave. */
async function withMembershipLease<T>(org: string, holder: string, fn: () => Promise<T>) {
  const got = await db.execute<{ ok: boolean }>(sql`SELECT admin_lease_acquire(${org},'membership',${holder},30) AS ok`);
  if (!got.rows[0]?.ok) throw new Error("admin_operation_in_progress");
  try { return await fn(); } finally { await db.execute(sql`SELECT admin_lease_release(${org},'membership',${holder})`); }
}

async function liveMember(clerk: Awaited<ReturnType<typeof clerkClient>>, org: string, userId: string) {
  const r = await clerk.organizations.getOrganizationMembershipList({ organizationId: org, userId: [userId], limit: 1 });
  return r.data.find((m) => m.organization.id === org && m.publicUserData?.userId === userId) ?? null;
}

/** Active administrators: Clerk org:admin members who are not locally suspended. */
async function activeAdminIds(clerk: Awaited<ReturnType<typeof clerkClient>>, org: string) {
  const ids: string[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const page = await clerk.organizations.getOrganizationMembershipList({ organizationId: org, limit: 100, offset, role: ["org:admin"] });
    for (const m of page.data) if (m.organization.id === org && m.role === "org:admin" && m.publicUserData?.userId) ids.push(m.publicUserData.userId);
    if (page.data.length < 100) break;
  }
  if (!ids.length) return ids;
  const suspended = await db.execute<{ clerk_user_id: string }>(sql`SELECT clerk_user_id FROM staff_memberships WHERE organization_id=${org} AND status='suspended' AND clerk_user_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`,`)})`);
  const blocked = new Set(suspended.rows.map((r) => r.clerk_user_id));
  return ids.filter((i) => !blocked.has(i));
}

const inviteInput = z.object({ email: z.email().max(254), role: z.string(), division: z.union([z.enum(divisionsList), z.literal("")]).default("") });
export async function inviteStaff(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = inviteInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Enter a valid email address and choose a role.");
  const p = parsed.data;
  if (!staffRoles.some((r) => r.key === p.role)) return invalid("Choose one of the listed roles.");
  return adminMutation("staff_manage", async (ctx, correlation) => {
    if (p.role === "org:admin" && ctx.role !== "org:admin") throw new Error("admin_role_required");
    const clerk = await clerkClient();
    if (!(await configuredRoles(clerk)).has(p.role)) throw new Error("role_not_configured");
    let invitationId: string;
    try {
      const inv = await clerk.organizations.createOrganizationInvitation({ organizationId: ctx.organizationId, emailAddress: p.email.toLowerCase(), role: p.role, inviterUserId: ctx.actor, expiresInDays: 7, privateMetadata: { division: p.division || null } });
      invitationId = inv.id;
    } catch { throw new Error("invitation_failed"); }
    await audit(ctx.organizationId, ctx.actor, "staff.invite", invitationId, { email: maskEmail(p.email), role: p.role, division: p.division || null }, correlation);
    refresh();
    return { ok: true, id: invitationId, message: `Invitation sent to ${maskEmail(p.email)}. They join with this role after accepting.` };
  });
}

export async function revokeInvitation(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = z.object({ invitationId: z.string().regex(/^orginv_[A-Za-z0-9]{1,64}$/) }).safeParse(fields(data));
  if (!parsed.success) return invalid("Refresh the page and try again.");
  return adminMutation("staff_manage", async (ctx, correlation) => {
    const clerk = await clerkClient();
    try { await clerk.organizations.revokeOrganizationInvitation({ organizationId: ctx.organizationId, invitationId: parsed.data.invitationId, requestingUserId: ctx.actor }); }
    catch { throw new Error("clerk_unavailable"); }
    await audit(ctx.organizationId, ctx.actor, "staff.invite_revoke", parsed.data.invitationId, {}, correlation);
    refresh();
    return { ok: true, message: "Invitation revoked." };
  });
}

const roleInput = z.object({ userId: clerkUserId, role: z.string(), reason: z.string().trim().min(5).max(1000) });
export async function changeStaffRole(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = roleInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Choose a role and give a reason (at least 5 characters).");
  const p = parsed.data;
  if (!staffRoles.some((r) => r.key === p.role)) return invalid("Choose one of the listed roles.");
  return adminMutation("staff_manage", async (ctx, correlation) => {
    if (p.userId === ctx.actor) throw new Error("self_administration_denied");
    const clerk = await clerkClient();
    return withMembershipLease(ctx.organizationId, correlation, async () => {
      const member = await liveMember(clerk, ctx.organizationId, p.userId);
      if (!member) throw new Error("membership_not_found");
      if (member.role === p.role) return { ok: true, message: "The employee already has this role." };
      // Only administrators may grant or take away administrator access.
      if ((p.role === "org:admin" || member.role === "org:admin") && ctx.role !== "org:admin") throw new Error("admin_role_required");
      if (!(await configuredRoles(clerk)).has(p.role)) throw new Error("role_not_configured");
      if (member.role === "org:admin" && !(await activeAdminIds(clerk, ctx.organizationId)).some((id) => id !== p.userId)) throw new Error("last_admin_protected");
      try { await clerk.organizations.updateOrganizationMembership({ organizationId: ctx.organizationId, userId: p.userId, role: p.role }); }
      catch { throw new Error("clerk_unavailable"); }
      await syncStaffMember(clerk, ctx.organizationId, p.userId, ctx.actor, correlation);
      invalidateLiveMembership(ctx.organizationId, p.userId);
      const sid = (await db.execute<{ id: string }>(sql`SELECT id FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND clerk_user_id=${p.userId}`)).rows[0]?.id ?? p.userId;
      await audit(ctx.organizationId, ctx.actor, "staff.role_change", sid, { from: member.role, to: p.role, reason: p.reason }, correlation);
      refresh();
      return { ok: true, message: "Role updated in Clerk. Access changes take effect on the employee's next request." };
    });
  });
}

const removeInput = z.object({ userId: clerkUserId, reason: z.string().trim().min(5).max(1000) });
export async function removeStaffMember(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = removeInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Give a reason (at least 5 characters).");
  const p = parsed.data;
  return adminMutation("staff_manage", async (ctx, correlation) => {
    if (p.userId === ctx.actor) throw new Error("self_administration_denied");
    const clerk = await clerkClient();
    return withMembershipLease(ctx.organizationId, correlation, async () => {
      const member = await liveMember(clerk, ctx.organizationId, p.userId);
      if (!member) throw new Error("membership_not_found");
      if (member.role === "org:admin" && ctx.role !== "org:admin") throw new Error("admin_role_required");
      if (member.role === "org:admin" && !(await activeAdminIds(clerk, ctx.organizationId)).some((id) => id !== p.userId)) throw new Error("last_admin_protected");
      try { await clerk.organizations.deleteOrganizationMembership({ organizationId: ctx.organizationId, userId: p.userId }); }
      catch { throw new Error("clerk_unavailable"); }
      await syncStaffMember(clerk, ctx.organizationId, p.userId, ctx.actor, correlation);
      invalidateLiveMembership(ctx.organizationId, p.userId);
      const sid = (await db.execute<{ id: string }>(sql`SELECT id FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND clerk_user_id=${p.userId}`)).rows[0]?.id ?? p.userId;
      await audit(ctx.organizationId, ctx.actor, "staff.remove", sid, { role: member.role, reason: p.reason }, correlation);
      refresh();
      return { ok: true, message: "Removed from the organization in Clerk. Their history and records are kept." };
    });
  });
}

const profileInput = z.object({ staffId: z.uuid(), version: z.string().regex(/^\d{1,9}$/), division: z.union([z.enum(divisionsList), z.literal("")]).default(""), jobTitle: z.string().trim().max(120).default(""), responsibilities: z.string().trim().max(2000).default("") });
export async function saveStaffProfile(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = profileInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Check the division, job title (120 characters) and responsibilities (2,000 characters).");
  const p = parsed.data;
  return adminMutation("staff_manage", async (ctx, correlation) => {
    await db.execute(sql`SELECT staff_profile_save(${ctx.organizationId},${ctx.actor},${p.staffId}::uuid,${Number(p.version)},${JSON.stringify(p)}::jsonb,${correlation})`);
    refresh();
    return { ok: true, message: "Profile saved." };
  });
}

const statusInput = z.object({ staffId: z.uuid(), version: z.string().regex(/^\d{1,9}$/), status: z.enum(["active", "suspended"]), reason: z.string().trim().min(5).max(1000) });
export async function setStaffStatus(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = statusInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Give a reason (at least 5 characters).");
  const p = parsed.data;
  return adminMutation("staff_manage", async (ctx, correlation) => {
    const target = (await db.execute<{ clerk_user_id: string }>(sql`SELECT clerk_user_id FROM staff_memberships WHERE id=${p.staffId}::uuid AND organization_id=${ctx.organizationId}`)).rows[0];
    if (!target) throw new Error("staff_unavailable");
    if (target.clerk_user_id === ctx.actor) throw new Error("self_administration_denied");
    const run = () => db.execute(sql`SELECT staff_set_status(${ctx.organizationId},${ctx.actor},${p.staffId}::uuid,${p.status},${p.reason},${Number(p.version)},${correlation})`);
    if (p.status === "suspended") {
      const clerk = await clerkClient();
      await withMembershipLease(ctx.organizationId, correlation, async () => {
        const member = await liveMember(clerk, ctx.organizationId, target.clerk_user_id);
        if (member?.role === "org:admin" && ctx.role !== "org:admin") throw new Error("admin_role_required");
        if (member?.role === "org:admin" && !(await activeAdminIds(clerk, ctx.organizationId)).some((id) => id !== target.clerk_user_id)) throw new Error("last_admin_protected");
        await run();
      });
    } else await run();
    refresh();
    return { ok: true, message: p.status === "suspended" ? "Access suspended. The employee is refused on their next request." : "Suspension lifted. Access again follows their Clerk role." };
  });
}

const eligibilityInput = z.object({ staffId: z.uuid(), version: z.string().regex(/^\d{1,9}$/), eligibility: z.enum(["approved", "revoked"]), reason: z.string().trim().min(5).max(1000) });
/** Approves or revokes a Clerk `org:member` as an eligible employee (Staff/Employee capabilities). */
export async function setEmployeeEligibility(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const parsed = eligibilityInput.safeParse(fields(data));
  if (!parsed.success) return invalid("Give a reason (at least 5 characters).");
  const p = parsed.data;
  return adminMutation("staff_manage", async (ctx, correlation) => {
    const target = (await db.execute<{ clerk_user_id: string }>(sql`SELECT clerk_user_id FROM staff_memberships WHERE id=${p.staffId}::uuid AND organization_id=${ctx.organizationId}`)).rows[0];
    if (!target) throw new Error("staff_unavailable");
    if (p.eligibility === "approved") {
      // Approval requires a current Clerk membership; a local record alone is not proof.
      const member = await liveMember(await clerkClient(), ctx.organizationId, target.clerk_user_id);
      if (!member) throw new Error("membership_not_found");
    }
    await db.execute(sql`SELECT staff_set_eligibility(${ctx.organizationId},${ctx.actor},${p.staffId}::uuid,${p.eligibility},${p.reason},${Number(p.version)},${correlation})`);
    invalidateLiveMembership(ctx.organizationId, target.clerk_user_id);
    refresh();
    return { ok: true, message: p.eligibility === "approved" ? "Approved as an employee. Staff capabilities apply on their next request." : "Employee approval revoked. Staff capabilities are removed on their next request." };
  });
}
