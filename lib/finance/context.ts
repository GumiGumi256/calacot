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
  // Phase 2A accounting (codes raised by drizzle-current/0018_accounting_foundation.sql).
  accounting_policy_required: "Accounting is not enabled yet. An accounting policy (functional currency and financial year) must be proposed and approved by a second person first.",
  posting_disabled: "Posting is turned off by the approved accounting policy. Nothing was posted.",
  automatic_posting_disabled: "Automatic posting from invoices, payments and expenses is not enabled in this phase.",
  multi_currency_posting_disabled: "Only lines in the functional currency can be posted. Multi-currency posting is not enabled yet.",
  invalid_accounting_policy: "Choose UGX or USD, a starting month and whether manual posting is allowed.",
  accounting_note_required: "Explain the proposal (at least 5 characters).",
  accounting_policy_proposal_pending: "A policy proposal is already awaiting a decision. Approve or reject it first.",
  accounting_policy_proposal_unavailable: "This policy proposal is no longer awaiting a decision. Refresh the page.",
  accounting_self_approval_denied: "You cannot approve something you prepared or proposed. Another authorized person must approve it.",
  functional_currency_locked: "The functional currency cannot change after journals have been posted.",
  fiscal_year_locked: "The financial-year start cannot change after periods have been created.",
  account_code_exists: "An account with this code already exists.",
  invalid_account_code: "Use a 3-8 digit account code, optionally followed by a suffix such as 1120-01.",
  invalid_account_type: "Choose an account type.",
  invalid_account: "Check the account name (up to 120 characters) and description.",
  invalid_reporting_class: "The reporting classification does not match the account type.",
  parent_account_invalid: "The parent must be an active or proposed header account of the same type, and cannot create a loop.",
  parent_account_inactive: "Approve the parent account first.",
  account_structure_locked: "An approved account's code, type and position are fixed. Only its name and description can change.",
  account_unavailable: "This account is unavailable.",
  stale_account: "This account changed since you opened it. Refresh and try again.",
  account_has_balance: "This account has a posted balance. Clear the balance with a journal before deactivating it.",
  account_in_pending_journals: "Journals awaiting approval or posting use this account. Resolve them first.",
  account_has_active_children: "Deactivate the sub-accounts first.",
  account_not_active: "One of the accounts is not active (it is proposed or deactivated).",
  account_not_postable: "Header accounts group other accounts and cannot receive entries. Choose a sub-account.",
  account_manual_posting_denied: "This is a control account maintained from invoices, payments or suppliers. It cannot be used in a manual journal.",
  account_currency_mismatch: "This account only accepts its own currency.",
  invalid_account_transition: "That action is not available for this account's current status. Refresh the page.",
  deactivation_reason_required: "Give a reason (at least 5 characters) for deactivating the account.",
  period_overlap: "These dates overlap an existing period, or the period name is already used.",
  invalid_period: "Check the period name and dates (end on or after start, at most about one year).",
  period_unavailable: "This period is unavailable.",
  stale_period: "This period changed since you opened it. Refresh and try again.",
  period_has_pending_journals: "Journals dated in this period are awaiting approval or posting. Post, return or reject them before closing.",
  period_missing: "No accounting period covers the entry date. Create the period first.",
  period_closed: "The accounting period for this date is closed. Use a date in an open period, or ask for the period to be reopened.",
  reopen_reason_required: "Give a reason (at least 5 characters) for reopening a closed period.",
  invalid_period_transition: "That action is not available for this period's current status. Refresh the page.",
  period_dates_locked: "Period dates cannot be changed after creation.",
  journal_unavailable: "This journal is unavailable.",
  stale_journal: "This journal changed since you opened it (it may have been edited or reviewed). Refresh and review the latest version.",
  journal_not_editable: "Only drafts can be edited. Withdraw or ask for the journal to be returned first.",
  not_preparer: "Only the person who prepared this journal can edit, submit, withdraw or discard it.",
  invalid_journal_transition: "That action is not available for this journal's current status. Refresh the page.",
  journal_unbalanced: "Debits and credits do not balance. Each currency must balance on its own.",
  journal_lines_required: "A journal needs at least two lines (up to 200).",
  invalid_journal_line: "Each line needs one positive amount, as either a debit or a credit, with at most two decimal places.",
  journal_lines_locked: "Lines cannot change once a journal has been submitted.",
  posted_journal_immutable: "Posted journals cannot be changed or deleted. Reverse the journal instead.",
  journal_already_posted: "This journal has already been posted.",
  stale_approval: "The approval is no longer valid (the journal changed or the approver is no longer active). Return it for a fresh approval.",
  journal_not_posted: "Only posted journals can be reversed.",
  journal_already_reversed: "This journal has already been reversed.",
  reversal_of_reversal_denied: "A reversal cannot itself be reversed. Prepare a new journal instead.",
  reversal_date_before_original: "The reversal date cannot be before the original journal's date.",
  reversal_reason_required: "Give a reason (5 to 300 characters) for the reversal.",
  invalid_reversal: "The reversal does not exactly mirror the original journal.",
  journal_description_required: "Enter a description (up to 500 characters).",
  invalid_entry_date: "Enter the accounting date.",
  journal_delete_denied: "Journals are never deleted. Discard the draft instead.",
  exchange_rate_unavailable: "The exchange rate is not approved or does not match the line currency.",
  exchange_rate_exists: "An approved rate already exists for this currency pair and date.",
  invalid_exchange_rate: "Enter a positive rate (up to 10 decimal places), a date that is not in the future, and its source.",
  invalid_posting_rule: "The posting rule definition is not valid.",
  posting_rule_unavailable: "This posting rule is no longer awaiting that decision.",
  posting_rule_invalid_account: "The rule names an account that is not active and postable.",
  accounting_history_immutable: "Accounting history cannot be changed.",
  // Phase 2B accounting integration (codes raised by drizzle-current/0019_accounting_integration.sql).
  integration_disabled: "Accounting integration is disabled for this organization. Nothing is captured or posted.",
  production_activation_unavailable: "Real production posting is not available in this phase. Use shadow reconciliation.",
  invalid_integration_stage: "Choose disabled, shadow or isolated test.",
  isolated_test_requires_test_database: "Isolated test posting only works on a database marked as a test database. Use shadow reconciliation here.",
  invalid_control_accounts: "Each control account must be the code of an existing postable account.",
  integration_proposal_pending: "A stage proposal is already awaiting a decision. Approve or reject it first.",
  integration_proposal_unavailable: "This stage proposal is no longer awaiting a decision. Refresh the page.",
  invalid_mapping_event: "Choose a business event that can be mapped. Voids and other corrections reverse the original entry automatically.",
  invalid_mapping_conditions: "One of the conditions is not valid for this event.",
  invalid_mapping_definition: "Check the mapping lines: at least one debit and one credit, a valid amount and account for each.",
  mapping_unavailable: "This mapping is no longer awaiting that decision. Refresh the page.",
  integration_event_unavailable: "This accounting event is unavailable.",
  integration_event_not_blocked: "Only blocked or failed events can be retried or re-dated.",
  integration_event_immutable: "Accounting events and their history cannot be edited or deleted.",
  integration_event_final: "This event is already posted or recorded as having no accounting effect.",
  redate_not_applicable: "Re-dating is only for events blocked by a closed or missing period.",
  redate_reason_required: "Give a reason (at least 5 characters) for posting in a later period.",
  backdating_denied: "An entry can only be moved forward to a later open period, never backdated.",
  invalid_batch_size: "Choose between 1 and 500 events per run.",
  system_journal_reversal_denied: "Automatic entries are corrected through their source document (void the invoice or disbursement), not reversed by hand.",
  source_event_required: "An automatic journal must come from a captured business event.",
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
