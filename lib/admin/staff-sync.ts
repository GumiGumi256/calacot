import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { invalidateLiveMembership } from "@/lib/sales/permissions";

type Clerk = Awaited<ReturnType<typeof clerkClient>>;

/**
 * Clerk-authoritative sync of one user's mirror. Always re-reads Clerk, so duplicate or
 * out-of-order triggers converge on the current state; the database clock captured before
 * the read stops an older observation overwriting a newer one. A local suspension is kept.
 */
export async function syncStaffMember(clerk: Clerk, org: string, userId: string, actor: string, correlation: string) {
  const stamp = await db.execute<{ observed: string }>(sql`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed`);
  const observed = stamp.rows[0]?.observed;
  if (!observed) throw new Error("sync_clock_unavailable");
  const response = await clerk.organizations.getOrganizationMembershipList({ organizationId: org, userId: [userId], limit: 1 });
  const member = response.data.find((m) => m.organization.id === org && m.publicUserData?.userId === userId);
  const before = (await db.execute<{ id: string; clerk_role: string | null; status: string }>(sql`SELECT id,clerk_role,status FROM staff_memberships WHERE organization_id=${org} AND clerk_user_id=${userId}`)).rows[0];
  let changed: Record<string, unknown> | null = null;
  if (member?.publicUserData) {
    const name = [member.publicUserData.firstName, member.publicUserData.lastName].filter(Boolean).join(" ") || null;
    const email = member.publicUserData.identifier || null;
    const r = await db.execute<{ id: string }>(sql`INSERT INTO staff_memberships(organization_id,clerk_user_id,display_name,email,clerk_role,status,last_synced_at) VALUES(${org},${userId},${name},${email},${member.role},'active',${observed}::timestamptz)
      ON CONFLICT(organization_id,clerk_user_id) DO UPDATE SET display_name=EXCLUDED.display_name,email=EXCLUDED.email,clerk_role=EXCLUDED.clerk_role,
        status=CASE WHEN staff_memberships.status='suspended' THEN 'suspended' ELSE 'active' END,last_synced_at=EXCLUDED.last_synced_at,updated_at=now()
      WHERE staff_memberships.last_synced_at IS NULL OR staff_memberships.last_synced_at<=EXCLUDED.last_synced_at RETURNING id`);
    if (r.rows[0] && (!before || before.clerk_role !== member.role || before.status === "removed")) changed = { id: r.rows[0].id, action: before ? "staff.sync_role" : "staff.sync_added", from: before?.clerk_role ?? null, to: member.role };
  } else if (before) {
    const r = await db.execute<{ id: string }>(sql`UPDATE staff_memberships SET status=CASE WHEN status='suspended' THEN 'suspended' ELSE 'removed' END,last_synced_at=${observed}::timestamptz,updated_at=now()
      WHERE organization_id=${org} AND clerk_user_id=${userId} AND (last_synced_at IS NULL OR last_synced_at<=${observed}::timestamptz) RETURNING id`);
    if (r.rows[0] && before.status === "active") changed = { id: r.rows[0].id, action: "staff.sync_removed", from: before.clerk_role, to: null };
  }
  // Any detected change (or absence) clears this instance's cached live verification.
  if (changed || !member) invalidateLiveMembership(org, userId);
  if (changed) {
    await db.execute(sql`INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) VALUES(${org},${actor === "system" ? null : actor},${actor === "system" ? "system" : "staff"},${String(changed.action)},'staff_membership',${String(changed.id)},${JSON.stringify({ roleFrom: changed.from, roleTo: changed.to, source: "clerk" })}::jsonb,${correlation})`);
  }
  return { present: !!member, role: member?.role ?? null };
}

/** Full reconciliation: every Clerk member plus every local mirror is re-checked. */
export async function reconcileOrganization(clerk: Clerk, org: string, actor: string, correlation: string) {
  const listed = new Set<string>();
  const pageSize = 100, maxMembers = 500;
  for (let offset = 0; offset < maxMembers; offset += pageSize) {
    const page = await clerk.organizations.getOrganizationMembershipList({ organizationId: org, limit: pageSize, offset });
    if (page.totalCount > maxMembers) throw new Error("organization_too_large");
    for (const member of page.data) {
      if (member.organization.id !== org || !member.publicUserData?.userId) throw new Error("invalid_clerk_response");
      listed.add(member.publicUserData.userId);
    }
    if (page.data.length < pageSize) break;
  }
  const local = await db.execute<{ clerk_user_id: string }>(sql`SELECT clerk_user_id FROM staff_memberships WHERE organization_id=${org} LIMIT 1001`);
  if (local.rows.length > 1000) throw new Error("organization_too_large");
  const candidates = new Set([...listed, ...local.rows.map((r) => r.clerk_user_id)]);
  for (const userId of candidates) await syncStaffMember(clerk, org, userId, actor, correlation);
  return candidates.size;
}
