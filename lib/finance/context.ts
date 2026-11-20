import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/database/db";
import { sensitivePermissions, staffContext, type Permission } from "@/lib/sales/permissions";
import { liveStaffContext } from "@/lib/admin/clerk-auth";

export type FinanceContext = Awaited<ReturnType<typeof staffContext>> & { can: (p: Permission) => boolean };

/** Authenticated staff context that requires at least one of the listed permissions. */
export async function financeContext(anyOf: Permission[]): Promise<FinanceContext> {
  // Financial and administrative reads re-verify membership live (cached briefly).
  const ctx = await staffContext(undefined, anyOf.some((p) => sensitivePermissions.has(p)) ? "cached" : "session");
  if (!anyOf.some((p) => ctx.permissions.includes(p))) notFound();
  return { ...ctx, can: (p: Permission) => ctx.permissions.includes(p) };
}

/** Local staff id of the signed-in user, or null when no active mirror exists. Never reactivates. */
export async function actorStaffId(org: string, actor: string) {
  const r = await db.execute<{ id: string }>(sql`SELECT id FROM staff_memberships WHERE organization_id=${org} AND clerk_user_id=${actor} AND status='active'`);
  return r.rows[0]?.id ?? null;
}

/**
 * Creates a mirror for a Clerk-verified member that has none yet. Unlike the legacy ledger
 * helper, an existing suspended/removed mirror is left untouched, so finance actions fail closed.
 */
async function ensureStaffMirror(org: string, actor: string, role: string) {
  if (await actorStaffId(org, actor)) return;
  const user = await currentUser();
  await db.execute(sql`INSERT INTO staff_memberships(organization_id,clerk_user_id,display_name,email,clerk_role,status,last_synced_at) VALUES(${org},${actor},${user?.fullName ?? null},${user?.primaryEmailAddress?.emailAddress ?? null},${role},'active',now()) ON CONFLICT(organization_id,clerk_user_id) DO NOTHING`);
}

export const financeMessages: Record<string, string> = {
  staff_mirror_required: "Your staff record is missing or inactive. Ask an administrator to refresh staff from Clerk.",
  idempotency_key_required: "This form is missing its request key. Refresh the page and try again.",
  idempotency_conflict: "This request key was already used for a different change. Refresh and try again.",
  invalid_division: "Select a valid division.",
  invalid_currency: "Select UGX or USD.",
  invalid_category: "Enter a category (up to 100 characters).",
  invalid_description: "Enter a short description (up to 500 characters).",
  purpose_required: "Explain the business purpose (at least 5 characters).",
  invalid_amount: "Enter a positive amount with at most two decimal places.",
  invalid_expense_date: "Enter the expense date.",
  future_expense_date: "The expense date cannot be in the future.",
  project_division_mismatch: "The selected project belongs to a different division. Choose the project's division or another project.",
  project_unavailable: "The selected project is unavailable or archived.",
  supplier_unavailable: "The selected supplier is unavailable. Choose another or enter a new supplier name.",
  expense_unavailable: "This expense is unavailable.",
  not_requester: "Only the employee who requested this expense can change, submit or cancel it.",
  expense_not_editable: "This request can no longer be edited. Only drafts and requests returned for correction can change.",
  expense_locked: "Approved, submitted and closed expenses cannot be changed.",
  stale_expense: "This request changed since you opened it. Refresh to see the latest version.",
  stale_review: "This request changed after you opened it (it may have been corrected or already reviewed). Refresh and review the latest version.",
  invalid_expense_transition: "That action is not available in the request's current status. Refresh the page.",
  requester_unknown: "This older expense has no recorded requester, so it cannot be approved through the controlled workflow.",
  self_review_denied: "You cannot review or approve your own expense request.",
  review_reason_required: "Give a reason (at least 5 characters) when returning or rejecting a request.",
  note_too_long: "The note is too long (4,000 characters maximum).",
  expense_not_approved: "Only approved expenses can receive disbursements or payment evidence.",
  expense_fully_disbursed: "The full approved amount has already been disbursed.",
  self_disbursement_denied: "You cannot record a disbursement for your own expense request.",
  currency_mismatch: "Disbursements must use the expense currency. No conversion is applied.",
  invalid_method: "Select a payment method.",
  transaction_reference_required: "Enter the bank, mobile-money or cheque transaction reference.",
  invalid_reference: "The reference or notes are too long.",
  invalid_payment_date: "Enter the payment date.",
  future_payment_date: "The payment date cannot be in the future.",
  disbursement_exceeds_approved: "The amount exceeds the approved amount still outstanding.",
  responsible_unavailable: "Select an active employee responsible for this payment.",
  evidence_unavailable: "The selected evidence document is not attached to this expense.",
  duplicate_disbursement_reference: "A disbursement with this method, source account and transaction reference is already recorded. Check the existing record instead of recording it again.",
  source_account_required: "Select the verified company account the payment was made from.",
  source_account_unavailable: "The selected source account is inactive, unverified, or does not match the payment method and expense currency.",
  source_account_not_applicable: "Cash and other payments do not use a source account.",
  finance_account_exists: "This provider and account are already registered for this payment method.",
  invalid_finance_account: "Check the provider, account number and label.",
  account_verification_required: "Record how the account was verified (at least 5 characters).",
  finance_account_immutable: "Verified account details cannot be changed. Deactivate it and register the correct account.",
  disbursement_unavailable: "This disbursement is unavailable or already voided.",
  reconciled_disbursement_locked: "Reconciled disbursements cannot be changed.",
  void_reason_required: "Give a reason (at least 5 characters) for voiding this disbursement.",
  self_reconciliation_denied: "The employee who recorded a disbursement cannot reconcile it.",
  reconciliation_reference_required: "Enter the statement line or reference used to reconcile this payment.",
  invalid_document_type: "Upload a PDF, JPEG, PNG or WebP file.",
  document_size_limit: "Files must be 10 MB or smaller.",
  invalid_storage_key: "The upload could not be linked. Try again.",
  invalid_document: "The file name or contents are invalid.",
  invalid_command: "That action is not available.",
  rate_limited: "Too many changes. Wait a minute and try again.",
  // Phase 1E administration.
  staff_unavailable: "This staff record is unavailable.",
  archive_reason_required: "Give a reason for archiving (at least 5 characters).",
  document_unavailable: "This document is unavailable.",
  division_disabled: "That division is not currently enabled in company settings. Choose an enabled division.",
  employee_not_approved: "This employee has not been approved yet.",
  stale_staff_record: "This staff record changed since you opened it. Refresh and try again.",
  invalid_staff_profile: "Job title (120 characters) or responsibilities (2,000 characters) are too long.",
  self_administration_denied: "You cannot change your own role, status or membership. Ask another administrator.",
  invalid_staff_transition: "That status change is not available for this employee. Refresh the page.",
  status_reason_required: "Give a reason (at least 5 characters).",
  last_admin_protected: "This would leave the organization without an active administrator.",
  admin_role_required: "Only an administrator can grant or change administrator access.",
  role_not_configured: "That role is not configured in Clerk yet. An administrator must create it in Clerk first.",
  admin_operation_in_progress: "Another membership change is in progress. Wait a moment and try again.",
  membership_not_found: "This person is no longer a member of the organization. Refresh the staff list.",
  invitation_failed: "Clerk could not create the invitation. Check the email address and whether this person is already a member or invited.",
  clerk_unavailable: "Clerk could not be reached. No change was made; try again.",
  stale_settings: "Company settings changed since you opened this page. Refresh and review the latest version.",
  settings_proposal_pending: "A payment-instruction change is awaiting approval. Approve or reject it first.",
  settings_note_required: "Explain the change (at least 5 characters).",
  invalid_settings: "Check the company settings and try again.",
  settings_unchanged: "Nothing has changed.",
  settings_proposal_unavailable: "This proposal is no longer pending.",
  self_approval_denied: "You cannot approve your own payment-instruction change. Another administrator must approve it.",
  origin_denied: "Request origin is not permitted.",
  catalogue_conflict: "This catalogue item was changed by someone else. Refresh to see the latest version, then reapply your change.",
  catalogue_item_unavailable: "This catalogue item is unavailable.",
  services_active_item_uq: "An active catalogue item with this name, unit and currency already exists in this division.",
  catalogue_invalid: "Check the item name, division, type, unit, category and price.",
};

// Longest code first so that e.g. invalid_document_type wins over invalid_document.
const codes = Object.keys(financeMessages).sort((a, b) => b.length - a.length);
export function financeError(e: unknown) {
  const text = e instanceof Error ? `${e.message} ${e.cause instanceof Error ? e.cause.message : ""}` : String(e);
  return codes.find((k) => text.includes(k));
}

export type FinanceResult = { ok: boolean; message: string; id?: string };

/** Shared guard for every financial mutation: permission, origin, rate limit, staff mirror. */
export async function financeMutation(
  permission: Permission,
  fn: (ctx: FinanceContext, correlation: string) => Promise<FinanceResult>,
): Promise<FinanceResult> {
  // Phase 1E: re-verify the actor's membership and role with Clerk on every mutation, so a
  // revoked or demoted user is refused even while their session token is still valid.
  const live = await liveStaffContext(permission);
  const ctx: FinanceContext = { ...live, can: (p: Permission) => live.permissions.includes(p) };
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") || h.get("host");
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { /* invalid origin */ }
    if (originHost !== host) return { ok: false, message: financeMessages.origin_denied };
  }
  const correlation = randomUUID();
  try {
    const key = `${ctx.organizationId}/${ctx.actor}/finance`;
    const rate = await db.execute<{ count: number }>(sql`INSERT INTO sales_rate_limits(key,count,expires_at) VALUES(${key},1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN sales_rate_limits.expires_at<now() THEN 1 ELSE sales_rate_limits.count+1 END,expires_at=CASE WHEN sales_rate_limits.expires_at<now() THEN now()+interval '1 minute' ELSE sales_rate_limits.expires_at END RETURNING count`);
    if ((rate.rows[0]?.count ?? 0) > 30) return { ok: false, message: financeMessages.rate_limited };
    await ensureStaffMirror(ctx.organizationId, ctx.actor, ctx.role);
    return await fn(ctx, correlation);
  } catch (e) {
    const code = financeError(e);
    console.error("finance_mutation_failed", { correlation, permission, code: code || "unexpected", detail: e instanceof Error ? e.message.split("\n")[0] : String(e) });
    return { ok: false, message: code ? financeMessages[code] : "The change could not be completed. Refresh and try again." };
  }
}
