import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
export const permissions = [
  "clients_read",
  "clients_write",
  "projects_read",
  "projects_write",
  "quotations_read",
  "quotations_create",
  "quotations_edit",
  "quotations_send",
  "quotations_confirm",
  "invoices_read",
  "invoices_issue",
  "invoices_void",
  "payments_verify",
  "notifications_manage",
  "leads_read",
  "leads_write",
  "payments_read",
  "expenses_read",
  // Phase 1D financial operations. Record-level rules (requester ownership, no
  // self-approval, segregation of disbursement and reconciliation) are enforced in
  // the database functions in drizzle-current/0009_financial_operations.sql.
  "expenses_create",
  "expenses_submit",
  "expenses_review",
  "expenses_approve",
  "expenses_disburse",
  "expenses_reconcile",
  "finance_reports",
  // Register/verify company payment source accounts. Administrators only by default
  // (grant org:calacot:finance_accounts_manage in Clerk to delegate deliberately).
  "finance_accounts_manage",
  // Phase 1E administration. Administrators only by default.
  "staff_manage",
  "settings_manage",
] as const;
export type Permission = (typeof permissions)[number];
export function roleAllows(role: string | null | undefined, p: Permission) {
  if (role === "org:admin") return true;
  const grants: Record<string, readonly Permission[]> = {
    "org:sales": [
      "clients_read",
      "clients_write",
      "projects_read",
      "projects_write",
      "quotations_read",
      "quotations_create",
      "quotations_edit",
      "quotations_send",
      "invoices_read",
      "leads_read",
      "leads_write",
      "expenses_create",
      "expenses_submit",
    ],
    "org:finance": [
      "clients_read",
      "projects_read",
      "quotations_read",
      "quotations_confirm",
      "invoices_read",
      "invoices_issue",
      "invoices_void",
      "payments_verify",
      "notifications_manage",
      "payments_read",
      "expenses_read",
      "expenses_create",
      "expenses_submit",
      "expenses_review",
      "expenses_approve",
      "expenses_disburse",
      "expenses_reconcile",
      "finance_reports",
    ],
    "org:viewer": [
      "clients_read",
      "projects_read",
      "quotations_read",
      "invoices_read",
      "leads_read",
      "payments_read",
      "expenses_read",
    ],
    // Phase 1E. org:project_manager must exist in Clerk before it can be assigned.
    "org:project_manager": [
      "clients_read",
      "projects_read",
      "projects_write",
      "quotations_read",
      "leads_read",
      "expenses_create",
      "expenses_submit",
    ],
    // Clerk's built-in member role = Staff/Employee: request expenses only.
    "org:member": ["expenses_create", "expenses_submit"],
  };
  return grants[role || ""]?.includes(p) ?? false;
}

/**
 * Permissions whose pages expose financial, staff, settings or administrative-history data.
 * Requests needing them re-verify the Clerk membership live (cached briefly per instance),
 * so a revoked or demoted user cannot keep reading through a stale session token.
 */
export const sensitivePermissions: ReadonlySet<Permission> = new Set<Permission>([
  "payments_read", "payments_verify", "invoices_read", "invoices_issue", "invoices_void",
  "expenses_read", "expenses_review", "expenses_approve", "expenses_disburse", "expenses_reconcile",
  "finance_reports", "finance_accounts_manage", "staff_manage", "settings_manage", "notifications_manage",
]);

type LocalAccess = { status: string; eligibility: string } | null;
// The local mirror can only NARROW access (suspension, unapproved employee). It is never
// proof of membership: every grant starts from the verified Clerk session or live membership.
const localAccess = cache(async (organizationId: string, userId: string): Promise<LocalAccess> => {
  const r = await db.execute<{ status: string; employee_eligibility: string }>(sql`SELECT status,employee_eligibility FROM staff_memberships WHERE organization_id=${organizationId} AND clerk_user_id=${userId} LIMIT 1`);
  const row = r.rows[0];
  return row ? { status: row.status, eligibility: row.employee_eligibility } : null;
});

/**
 * Effective grants. Named staff roles (admin, sales, finance, project manager, viewer) are
 * explicit administrator assignments in Clerk. Clerk's default `org:member` role is not:
 * such members receive nothing until an administrator approves them as an active employee.
 */
export function effectiveGrants(role: string | null | undefined, hasCustom: (p: Permission) => boolean, local: LocalAccess) {
  const approvedEmployee = local?.status === "active" && local.eligibility === "approved";
  return permissions.filter((p) => {
    if (!roleAllows(role, p) && !hasCustom(p)) return false;
    return role === "org:member" ? approvedEmployee : true;
  });
}

type LiveEntry = { at: number; role: string; custom: string[] };
const liveCache = new Map<string, LiveEntry>();
const LIVE_TTL_MS = 30_000;          // reuse a successful verification for 30 seconds
const LIVE_OUTAGE_GRACE_MS = 300_000; // during a Clerk outage, accept a verification up to 5 minutes old (reads only)
export function invalidateLiveMembership(organizationId: string, userId: string) {
  liveCache.delete(`${organizationId}:${userId}`);
}
/** Live Clerk membership. `fresh` bypasses the cache and fails closed (used for mutations). */
export async function liveMembership(organizationId: string, userId: string, fresh: boolean): Promise<LiveEntry | null> {
  const key = `${organizationId}:${userId}`;
  const cached = liveCache.get(key);
  if (!fresh && cached && Date.now() - cached.at < LIVE_TTL_MS) return cached;
  try {
    const clerk = await clerkClient();
    const list = await clerk.organizations.getOrganizationMembershipList({ organizationId, userId: [userId], limit: 1 });
    const member = list.data.find((m) => m.organization.id === organizationId && m.publicUserData?.userId === userId);
    if (!member) { liveCache.delete(key); return null; }
    const entry = { at: Date.now(), role: member.role, custom: member.permissions ?? [] };
    liveCache.set(key, entry);
    return entry;
  } catch (e) {
    if (!fresh && cached && Date.now() - cached.at < LIVE_OUTAGE_GRACE_MS) return cached;
    throw e;
  }
}

/**
 * mode: "session" trusts the Clerk session token; "cached" adds a live membership check
 * (30s cache, 5-minute outage grace); "fresh" always re-reads Clerk and fails closed.
 * Requests that need a sensitive permission are upgraded to "cached" automatically.
 */
export async function staffContext(required?: Permission, mode: "session" | "cached" | "fresh" = "session") {
  const session = await auth();
  if (!session.userId)
    return session.redirectToSignIn({ returnBackUrl: "/admin/clients" });
  const configured = process.env.CALACOT_CLERK_ORG_ID?.trim();
  if (!configured || session.orgId !== configured || !session.orgRole)
    notFound();
  const routeSlug = (await headers()).get("x-calacot-org-slug");
  if (routeSlug && routeSlug !== session.orgSlug) notFound();
  const local = await localAccess(configured, session.userId);
  if (local?.status === "suspended") notFound();
  let role: string = session.orgRole;
  let grants: Permission[] = effectiveGrants(role, (p) => session.has({ permission: `org:calacot:${p}` }), local);
  // Any page reachable with sensitive grants (finance, staff, settings, history) re-verifies
  // live; staff without such grants (sales, project managers, employees) stay session-only.
  if (mode === "session" && ((required && sensitivePermissions.has(required)) || grants.some((p) => sensitivePermissions.has(p)))) mode = "cached";
  if (mode !== "session") {
    let live: LiveEntry | null;
    try { live = await liveMembership(configured, session.userId, mode === "fresh"); } catch { notFound(); }
    if (!live) notFound();
    role = live.role;
    const custom = new Set(live.custom);
    grants = effectiveGrants(role, (p) => custom.has(`org:calacot:${p}`), local);
  }
  if (!grants.length || (required && !grants.includes(required))) notFound();
  return {
    organizationId: configured,
    actor: session.userId,
    role,
    permissions: grants,
  };
}

export type StaffAccessStatus =
  | { kind: "signed_out" }
  | { kind: "not_member" }
  | { kind: "granted" }
  | { kind: "awaiting_assignment"; organizationId: string; userId: string; role: string }
  | { kind: "paused"; organizationId: string; userId: string; reason: "suspended" | "approval_revoked" };

/**
 * Non-throwing classification used to route signed-in users. Only confirmed members of the
 * configured organization (live Clerk check) are told anything about their access; everyone
 * else is "not_member" and keeps getting a plain 404 from the admin area.
 */
export async function staffAccessStatus(): Promise<StaffAccessStatus> {
  const session = await auth();
  if (!session.userId) return { kind: "signed_out" };
  const configured = process.env.CALACOT_CLERK_ORG_ID?.trim();
  if (!configured) return { kind: "not_member" };
  // Fast path (no Clerk call): a session that already grants access is routed normally;
  // staffContext then applies its own session/live checks.
  if (session.orgId === configured && session.orgRole) {
    const sessionLocal = await localAccess(configured, session.userId);
    if (sessionLocal?.status !== "suspended" && effectiveGrants(session.orgRole, (p) => session.has({ permission: `org:calacot:${p}` }), sessionLocal).length) return { kind: "granted" };
  }
  let live: Awaited<ReturnType<typeof liveMembership>>;
  try { live = await liveMembership(configured, session.userId, false); } catch { return { kind: "not_member" }; }
  if (!live) return { kind: "not_member" };
  const local = await localAccess(configured, session.userId);
  if (local?.status === "suspended") return { kind: "paused", organizationId: configured, userId: session.userId, reason: "suspended" };
  const custom = new Set(live.custom);
  if (effectiveGrants(live.role, (p) => custom.has(`org:calacot:${p}`), local).length) return { kind: "granted" };
  if (live.role === "org:member" && local?.eligibility === "revoked") return { kind: "paused", organizationId: configured, userId: session.userId, reason: "approval_revoked" };
  return { kind: "awaiting_assignment", organizationId: configured, userId: session.userId, role: live.role };
}
