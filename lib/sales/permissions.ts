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
  // Administrators only: record an expense that is approved at once (and optionally paid) without a
  // second reviewer. Every step is still written to the expense history (migration 0027).
  "expenses_record_verified",
  "finance_reports",
  // Register/verify company payment source accounts. Administrators only by default
  // (grant org:calacot:finance_accounts_manage in Clerk to delegate deliberately).
  "finance_accounts_manage",
  // Phase 1E administration. Administrators only by default.
  "staff_manage",
  "settings_manage",
  // Phase 1F documents. Record-level checks additionally require read access to every
  // business record a document is linked to (lib/documents/access.ts).
  "documents_read",
  "documents_write",
  "documents_archive",
  // Administrator-only by default; explicitly delegate through Clerk if required.
  "verification_issue",
  "verification_revoke",
  // Quotation item catalogue. Reading/selecting items follows quotation access; managing the
  // catalogue and overriding catalogue prices are administrator-only by default and can be
  // delegated per user with the Clerk custom permissions org:calacot:catalogue_manage and
  // org:calacot:quotation_price_override.
  "catalogue_read",
  "catalogue_manage",
  "quotation_price_override",
  // Phase 2A accounting. Record-level rules (balance, no self-approval, closed periods,
  // immutability) are enforced in drizzle-current/0018_accounting_foundation.sql. Approval,
  // reversal, period closing/reopening and policy approval are administrator-only by default;
  // delegate them to the company accountant with org:calacot:<permission> in Clerk.
  "accounting_read",
  "accounting_manage",
  "accounting_journal_prepare",
  "accounting_journal_post",
  "accounting_journal_approve",
  "accounting_journal_reverse",
  "accounting_period_close",
  "accounting_period_reopen",
  "accounting_policy_approve",
  // Phase 2B accounting integration. Operating the source-to-ledger queue (process, retry,
  // re-date into an open period, backfill) is Admin and Finance. Proposing rollout settings and
  // event mappings uses accounting_manage; approving them uses accounting_policy_approve. Every
  // record-level rule is enforced in drizzle-current/0019_accounting_integration.sql.
  "accounting_integration_operate",
  // Phase 2C banking and cash. Viewing, importing, matching, preparing reconciliations and preparing
  // cash transactions are Finance; registering accounts and proposing ledger/category mappings is
  // banking_manage (Finance proposes, accounting_policy_approve decides). Approving cash and bank
  // adjustments, finalizing and reopening reconciliations are administrator-only by default; delegate
  // with org:calacot:<permission>. Record-level rules (no self-approval, availability, locks) are in
  // drizzle-current/0021_banking_reconciliation.sql.
  "banking_read",
  "banking_manage",
  "banking_import",
  "banking_match",
  "banking_reconcile",
  "banking_reconcile_approve",
  "banking_reconcile_reopen",
  "cash_create",
  "cash_approve",
  // Phase 2D tax, fixed assets and payroll. Finance prepares (computations, policy proposals, payments,
  // asset records); approvals (tax_approve, depreciation_approve) are administrator-only by default and
  // delegable with org:calacot:<permission>. Payroll is administrator-only by default: salary data is
  // never visible through staff-directory or accounting permissions. Record-level rules are in
  // drizzle-current/0022_tax_assets_payroll.sql.
  "tax_read",
  "tax_compute",
  "tax_approve",
  "tax_payment_record",
  "tax_policy_manage",
  "assets_manage",
  "depreciation_approve",
  "payroll_admin",
  "payroll_approve",
  // Phase 2E financial statements, period closing and year-end. Finance views statements, prepares
  // adjustments, statement sets and policy proposals, and starts closes; reviewing adjustments,
  // approving statements, approving closes, reopening and approving year-end are administrator-only
  // by default and delegable with org:calacot:<permission>. Record-level rules (no self-approval,
  // stale ledgers, checklists) are in drizzle-current/0023_financial_statements_closing.sql.
  "fs_read",
  "fs_adjust_prepare",
  "fs_adjust_review",
  "fs_approve",
  "close_start",
  "close_approve",
  "close_reopen",
  "year_end_approve",
  // Phase 2F staging-only historical migration: finance prepares opening-balance batches; approval is
  // administrator-only by default and delegable. Nothing in staging posts to the ledger.
  "migration_prepare",
  "migration_approve",
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
      "catalogue_read",
      "invoices_read",
      "leads_read",
      "leads_write",
      "documents_read",
      "documents_write",
    ],
    "org:finance": [
      "clients_read",
      "projects_read",
      "quotations_read",
      "quotations_confirm",
      "catalogue_read",
      "invoices_read",
      "invoices_issue",
      "invoices_void",
      "payments_verify",
      "notifications_manage",
      "payments_read",
      "expenses_read",
      "expenses_disburse",
      "expenses_reconcile",
      "finance_reports",
      "documents_read",
      "documents_write",
      "accounting_read",
      "accounting_manage",
      "accounting_journal_prepare",
      "accounting_journal_post",
      "accounting_integration_operate",
      "banking_read",
      "banking_manage",
      "banking_import",
      "banking_match",
      "banking_reconcile",
      "cash_create",
      "tax_read",
      "tax_compute",
      "tax_payment_record",
      "tax_policy_manage",
      "assets_manage",
      "fs_read",
      "fs_adjust_prepare",
      "close_start",
      "migration_prepare",
    ],
    "org:viewer": [
      "clients_read",
      "projects_read",
      "quotations_read",
      "catalogue_read",
      "invoices_read",
      "leads_read",
      "payments_read",
      "expenses_read",
      "documents_read",
      "accounting_read",
      "banking_read",
      "fs_read",
    ],
    // Phase 1E. org:project_manager must exist in Clerk before it can be assigned.
    "org:project_manager": [
      "clients_read",
      "projects_read",
      "projects_write",
      "quotations_read",
      "catalogue_read",
      "leads_read",
      "documents_read",
      "documents_write",
    ],
    "org:member": [],
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
  "expenses_read", "expenses_create", "expenses_submit", "expenses_review", "expenses_approve", "expenses_disburse", "expenses_reconcile", "expenses_record_verified",
  "finance_reports", "finance_accounts_manage", "staff_manage", "settings_manage", "notifications_manage",
  "documents_read", "documents_write", "documents_archive",
  "verification_issue", "verification_revoke",
  "catalogue_manage", "quotation_price_override",
  "accounting_read", "accounting_manage", "accounting_journal_prepare", "accounting_journal_post", "accounting_journal_approve",
  "accounting_journal_reverse", "accounting_period_close", "accounting_period_reopen", "accounting_policy_approve",
  "accounting_integration_operate",
  "banking_read", "banking_manage", "banking_import", "banking_match", "banking_reconcile", "banking_reconcile_approve", "banking_reconcile_reopen", "cash_create", "cash_approve",
  "tax_read", "tax_compute", "tax_approve", "tax_payment_record", "tax_policy_manage", "assets_manage", "depreciation_approve", "payroll_admin", "payroll_approve",
  "fs_read", "fs_adjust_prepare", "fs_adjust_review", "fs_approve", "close_start", "close_approve", "close_reopen", "year_end_approve",
  "migration_prepare", "migration_approve",
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
    if (role !== "org:admin" && (["expenses_create", "expenses_submit", "expenses_review", "expenses_approve", "expenses_record_verified"] as Permission[]).includes(p)) return false;
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
