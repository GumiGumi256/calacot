import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { staffRoles } from "./roles";

export type StaffEntry = {
  userId: string; staffId: string | null; name: string; email: string; role: string | null; status: "active" | "suspended" | "removed";
  division: string | null; jobTitle: string | null; responsibilities: string | null; version: number; lastSyncedAt: string | null; suspensionReason: string | null; eligibility: string;
};
export type InvitationEntry = { id: string; email: string; role: string; status: string; createdAt: number; expiresAt: number | null };
type Raw = Record<string, string | string[] | undefined>;
const one = (raw: Raw, k: string) => (typeof raw[k] === "string" ? (raw[k] as string).slice(0, 200) : "");

/**
 * Directory = live Clerk memberships and invitations merged with local operational profiles.
 * If Clerk cannot be reached, the last synced local data is shown read-only.
 */
export async function readStaffDirectory(raw: Raw) {
  const ctx = await staffContext("staff_manage");
  const org = ctx.organizationId;
  const local = (await db.execute<{ id: string; clerk_user_id: string; display_name: string | null; email: string | null; clerk_role: string | null; status: string; division: string | null; job_title: string | null; responsibilities: string | null; profile_version: number; last_synced_at: string | null; suspension_reason: string | null; employee_eligibility: string }>(
    sql`SELECT id,clerk_user_id,display_name,email,clerk_role,status,division,job_title,responsibilities,profile_version,last_synced_at::text AS last_synced_at,suspension_reason,employee_eligibility FROM staff_memberships WHERE organization_id=${org} ORDER BY display_name NULLS LAST,id LIMIT 1000`)).rows;
  const byUser = new Map(local.map((r) => [r.clerk_user_id, r]));
  let clerkAvailable = true;
  const entries = new Map<string, StaffEntry>();
  let invitations: InvitationEntry[] = [];
  let configuredRoles: string[] = [];
  try {
    const clerk = await clerkClient();
    for (let offset = 0; offset < 500; offset += 100) {
      const page = await clerk.organizations.getOrganizationMembershipList({ organizationId: org, limit: 100, offset });
      for (const m of page.data) {
        const userId = m.publicUserData?.userId;
        if (!userId || m.organization.id !== org) continue;
        const l = byUser.get(userId);
        entries.set(userId, {
          userId, staffId: l?.id ?? null, name: [m.publicUserData?.firstName, m.publicUserData?.lastName].filter(Boolean).join(" ") || l?.display_name || m.publicUserData?.identifier || userId,
          email: m.publicUserData?.identifier ?? l?.email ?? "", role: m.role, status: l?.status === "suspended" ? "suspended" : "active",
          division: l?.division ?? null, jobTitle: l?.job_title ?? null, responsibilities: l?.responsibilities ?? null, version: l?.profile_version ?? 1, lastSyncedAt: l?.last_synced_at ?? null, suspensionReason: l?.suspension_reason ?? null, eligibility: l?.employee_eligibility ?? "pending",
        });
      }
      if (page.data.length < 100) break;
    }
    const inv = await clerk.organizations.getOrganizationInvitationList({ organizationId: org, status: ["pending", "accepted", "revoked", "expired"], limit: 100 });
    invitations = inv.data.map((i) => ({ id: i.id, email: i.emailAddress, role: i.role, status: i.status ?? "pending", createdAt: i.createdAt, expiresAt: i.expiresAt ?? null }));
    configuredRoles = (await clerk.organizationRoles.getOrganizationRoleList({ limit: 100 })).data.map((r) => r.key);
  } catch {
    clerkAvailable = false;
  }
  // Local records with no live membership: removed (or everything, if Clerk is unavailable).
  for (const l of local) {
    if (entries.has(l.clerk_user_id)) continue;
    entries.set(l.clerk_user_id, {
      userId: l.clerk_user_id, staffId: l.id, name: l.display_name ?? l.email ?? l.clerk_user_id, email: l.email ?? "", role: l.clerk_role,
      status: clerkAvailable ? (l.status === "suspended" ? "suspended" : "removed") : (l.status as StaffEntry["status"]),
      division: l.division, jobTitle: l.job_title, responsibilities: l.responsibilities, version: l.profile_version, lastSyncedAt: l.last_synced_at, suspensionReason: l.suspension_reason, eligibility: l.employee_eligibility,
    });
  }
  const search = one(raw, "search").toLowerCase();
  const status = ["active", "suspended", "removed", "invited"].includes(one(raw, "status")) ? one(raw, "status") : "";
  const role = staffRoles.some((r) => r.key === one(raw, "role")) ? one(raw, "role") : "";
  const division = ["estates", "architecture", "painting", "interiors", "tech"].includes(one(raw, "division")) ? one(raw, "division") : "";
  const rows = [...entries.values()].filter((e) =>
    (!search || `${e.name} ${e.email} ${e.jobTitle ?? ""}`.toLowerCase().includes(search)) && (!status || e.status === status) && (!role || e.role === role) && (!division || e.division === division))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pending = invitations.filter((i) => i.status === "pending" && (!role || i.role === role) && (!search || i.email.toLowerCase().includes(search)));
  return {
    rows: status === "invited" ? [] : rows, invitations: status && status !== "invited" ? [] : pending, recentInvitations: invitations.filter((i) => i.status !== "pending").slice(0, 20),
    counts: { awaitingApproval: [...entries.values()].filter((e) => e.status === "active" && e.role === "org:member" && e.eligibility !== "approved").length, active: [...entries.values()].filter((e) => e.status === "active").length, suspended: [...entries.values()].filter((e) => e.status === "suspended").length, invited: invitations.filter((i) => i.status === "pending").length },
    clerkAvailable, configuredRoles, actor: ctx.actor, actorRole: ctx.role, filters: { search: one(raw, "search"), status, role, division },
  };
}

export async function readStaffActivity(org: string, staffId: string) {
  return (await db.execute<{ action: string; actor: string | null; created_at: string; changes: Record<string, unknown> }>(sql`SELECT a.action,coalesce(s.display_name,a.actor_clerk_user_id,'System') AS actor,a.created_at::text AS created_at,a.changes FROM audit_logs a LEFT JOIN staff_memberships s ON s.organization_id=a.organization_id AND s.clerk_user_id=a.actor_clerk_user_id WHERE a.organization_id=${org} AND a.entity_type='staff_membership' AND a.entity_id=${staffId} ORDER BY a.created_at DESC,a.id LIMIT 30`)).rows;
}
