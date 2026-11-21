/**
 * Phase 2B source-to-ledger integration: client-safe catalogue. It mirrors
 * accounting_event_catalog() in drizzle-current/0019_accounting_integration.sql (the database is
 * authoritative; scripts/verify-accounting-integration-engine.mts checks the two stay identical).
 * No I/O: used by pages, forms, server actions and tests.
 */

export const integrationStages = ["disabled", "isolated_test", "shadow", "active"] as const;
export type IntegrationStage = (typeof integrationStages)[number];

export const stageInfo: Record<IntegrationStage, { label: string; summary: string }> = {
  disabled: { label: "Disabled", summary: "Nothing is captured or posted. Invoices, payments and expenses work exactly as before." },
  isolated_test: { label: "Isolated test posting", summary: "Events post real journals, but only on a database explicitly marked as a test database. Production databases refuse this stage." },
  shadow: { label: "Shadow reconciliation", summary: "Events are captured and the journal each would produce is previewed and reconciled. The general ledger is never touched." },
  active: { label: "Accountant-reviewed activation", summary: "Not available in Phase 2B. A reviewed migration must lift the database constraint after the accountant signs off." },
};

export const integrationEventStatuses = ["pending", "posted", "no_effect", "shadowed", "blocked", "failed"] as const;
export type IntegrationEventStatus = (typeof integrationEventStatuses)[number];

export type EventStage = "recognition" | "correction" | "cash" | "settlement" | "approval" | "evidence";
export type EventDefinition = {
  type: string; label: string; stage: EventStage; requiresMapping: boolean; amountKeys: readonly string[]; conditionKeys: readonly string[];
  reverses: string | null; taxable: boolean; source: string; when: string;
};

export const integrationEvents: readonly EventDefinition[] = [
  { type: "invoice_issued", label: "Invoice issued", stage: "recognition", requiresMapping: true, amountKeys: ["total", "net", "tax"], conditionKeys: ["currency", "division", "billingKind", "taxTreatment"], reverses: null, taxable: true, source: "invoices", when: "An invoice is issued (legal number assigned, amounts frozen)." },
  { type: "invoice_voided", label: "Invoice voided", stage: "correction", requiresMapping: false, amountKeys: [], conditionKeys: [], reverses: "invoice_issued", taxable: false, source: "invoices", when: "An issued invoice is voided. Its original entry is reversed exactly." },
  { type: "credit_note_issued", label: "Credit note issued", stage: "recognition", requiresMapping: true, amountKeys: ["total", "net", "tax"], conditionKeys: ["currency", "division", "billingKind", "taxTreatment"], reverses: null, taxable: true, source: "credit_notes", when: "A credit note is issued against an invoice." },
  { type: "credit_note_voided", label: "Credit note voided", stage: "correction", requiresMapping: false, amountKeys: [], conditionKeys: [], reverses: "credit_note_issued", taxable: false, source: "credit_notes", when: "An issued credit note is voided (no workflow does this today)." },
  { type: "payment_confirmed", label: "Customer payment confirmed", stage: "cash", requiresMapping: true, amountKeys: ["amount"], conditionKeys: ["currency", "method"], reverses: null, taxable: false, source: "payments", when: "Staff confirm a customer payment with evidence. This is not proof of bank settlement." },
  { type: "payment_allocated", label: "Payment allocated to invoice", stage: "settlement", requiresMapping: true, amountKeys: ["amount"], conditionKeys: ["currency", "division", "billingKind"], reverses: null, taxable: false, source: "payment_allocations", when: "Confirmed funds are applied to an invoice." },
  { type: "refund_completed", label: "Refund completed", stage: "cash", requiresMapping: true, amountKeys: ["amount"], conditionKeys: ["currency"], reverses: null, taxable: false, source: "payment_refunds", when: "A refund is completed (no application workflow creates refunds yet)." },
  { type: "allocation_reversed", label: "Allocation reversed", stage: "settlement", requiresMapping: true, amountKeys: ["amount"], conditionKeys: ["currency", "division", "billingKind"], reverses: null, taxable: false, source: "payment_allocation_reversals", when: "Part of an allocation is reversed because its refund completed." },
  { type: "expense_approved", label: "Expense request approved", stage: "approval", requiresMapping: false, amountKeys: ["total", "net", "tax"], conditionKeys: ["currency", "division", "category", "taxTreatment", "supplierLinked"], reverses: null, taxable: true, source: "expenses", when: "An expense request is approved. Authorization only: no entry unless an approved recognition mapping says otherwise." },
  { type: "disbursement_recorded", label: "Disbursement recorded", stage: "cash", requiresMapping: true, amountKeys: ["amount"], conditionKeys: ["currency", "division", "category", "method", "financeAccountId", "expenseRecognized", "taxTreatment"], reverses: null, taxable: true, source: "expense_disbursements", when: "Money is paid against an approved expense." },
  { type: "disbursement_voided", label: "Disbursement voided", stage: "correction", requiresMapping: false, amountKeys: [], conditionKeys: [], reverses: "disbursement_recorded", taxable: false, source: "expense_disbursements", when: "A recorded disbursement is voided. Its original entry is reversed exactly." },
  { type: "disbursement_reconciled", label: "Disbursement reconciled", stage: "evidence", requiresMapping: false, amountKeys: ["amount"], conditionKeys: ["currency", "method", "financeAccountId"], reverses: null, taxable: false, source: "expense_disbursements", when: "A second person matches a disbursement to a statement. Evidence only unless mapped." },
];
export const mappableEvents = integrationEvents.filter((e) => !e.reverses);
export const eventLabel = (t: string) => integrationEvents.find((e) => e.type === t)?.label ?? t.replaceAll("_", " ");

export const conditionValues: Record<string, readonly string[] | "uuid" | "text"> = {
  currency: ["UGX", "USD"],
  division: ["estates", "architecture", "painting", "interiors", "tech"],
  billingKind: ["standard", "deposit", "milestone"],
  taxTreatment: ["none", "taxed"],
  supplierLinked: ["yes", "no"],
  expenseRecognized: ["yes", "no"],
  method: ["mobile_money", "bank_transfer", "cash", "cheque", "other"],
  financeAccountId: "uuid",
  category: "text",
};
export const conditionLabels: Record<string, string> = {
  currency: "Currency", division: "Division", billingKind: "Billing kind", taxTreatment: "Tax treatment", supplierLinked: "Supplier linked",
  expenseRecognized: "Expense already recognized", method: "Payment method", financeAccountId: "Verified finance account", category: "Expense category",
};

const accountCode = /^[0-9]{3,8}(-[0-9A-Z]{1,6})?$/;
export type MappingLine = { side: "debit" | "credit"; account: { code: string } | { byDivision: Record<string, string>; fallback?: string }; amount: string; memo?: string };

/** Mirrors accounting_mapping_validate(). Returns error codes (empty when valid). */
export function validateMapping(eventType: string, conditions: Record<string, unknown>, treatment: string, definition: { lines?: MappingLine[] } | Record<string, never>): string[] {
  const ev = integrationEvents.find((e) => e.type === eventType);
  if (!ev || ev.reverses) return ["invalid_mapping_event"];
  for (const [k, v] of Object.entries(conditions)) {
    const allowed = conditionValues[k];
    if (!ev.conditionKeys.includes(k) || typeof v !== "string" || v.length < 1 || v.length > 100) return ["invalid_mapping_conditions"];
    if (Array.isArray(allowed) && !allowed.includes(v)) return ["invalid_mapping_conditions"];
    if (allowed === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return ["invalid_mapping_conditions"];
  }
  if (treatment === "no_entry") return Object.keys(definition).length ? ["invalid_mapping_definition"] : [];
  const lines = (definition as { lines?: MappingLine[] }).lines;
  if (treatment !== "journal" || !Array.isArray(lines) || lines.length < 2 || lines.length > 20 || Object.keys(definition).some((k) => k !== "lines")) return ["invalid_mapping_definition"];
  for (const l of lines) {
    if (!l || (l.side !== "debit" && l.side !== "credit") || !ev.amountKeys.includes(l.amount) || (l.memo?.length ?? 0) > 200) return ["invalid_mapping_definition"];
    const a = l.account as Partial<{ code: string; byDivision: Record<string, string>; fallback: string }>;
    if (a?.code !== undefined) { if (!accountCode.test(a.code)) return ["invalid_mapping_definition"]; }
    else if (a?.byDivision && typeof a.byDivision === "object") {
      if (Object.entries(a.byDivision).some(([d, c]) => !(conditionValues.division as readonly string[]).includes(d) || !accountCode.test(c))) return ["invalid_mapping_definition"];
      if (a.fallback !== undefined && !accountCode.test(a.fallback)) return ["invalid_mapping_definition"];
    } else return ["invalid_mapping_definition"];
  }
  if (!lines.some((l) => l.side === "debit") || !lines.some((l) => l.side === "credit")) return ["invalid_mapping_definition"];
  return [];
}

/** What a blocked or failed event needs, and which authorized action resolves it. */
export const blockGuidance: Record<string, { problem: string; resolve: string }> = {
  mapping_missing: { problem: "No approved mapping matches this event, so the ledger accounts are unknown. Nothing is guessed.", resolve: "Propose a mapping for this event type and conditions; a second person approves it; then retry." },
  mapping_ambiguous: { problem: "Two approved mappings match equally well.", resolve: "Retire one of them or give one a higher priority (new version), then retry." },
  mapping_account_missing: { problem: "The matching mapping has no account for this event's division (and no fallback), or names an account that does not exist.", resolve: "Approve a new mapping version that covers this division, then retry." },
  mapping_unbalanced: { problem: "The mapping would produce an unbalanced or empty journal for these amounts.", resolve: "Correct the mapping (new version) so debits equal credits, then retry." },
  tax_treatment_unapproved: { problem: "The document carries tax, but the matching mapping was not approved for taxed items.", resolve: "After the tax adviser confirms treatment, approve a mapping with condition Tax treatment = taxed; then retry." },
  fx_policy_unapproved: { problem: "The event is not in the functional currency. Exchange-rate source and FX policy are not approved, so it cannot be converted or posted.", resolve: "Stays blocked until multi-currency posting is approved in a later phase. Never mixed with the functional currency." },
  accounting_policy_required: { problem: "No accounting policy is approved.", resolve: "Approve the accounting policy, then retry." },
  period_missing: { problem: "No accounting period covers this date.", resolve: "Create the financial year, then retry; or re-date forward into an open period with a reason." },
  period_closed: { problem: "The accounting period for this date is closed. The entry is not backdated into it.", resolve: "Re-date forward into an open period with a recorded reason, or have the period reopened by an authorized person; then retry." },
  reversal_date_before_original: { problem: "The correction is dated before the entry it reverses.", resolve: "Re-date the correction forward (on or after the original posting date)." },
  account_not_active: { problem: "A mapped account is not active.", resolve: "Activate the account or approve a mapping version that uses an active account; then retry." },
  account_not_postable: { problem: "A mapped account is a header account.", resolve: "Approve a mapping version that uses a postable sub-account; then retry." },
  account_currency_mismatch: { problem: "A mapped account is restricted to another currency.", resolve: "Approve a mapping version with an account for this currency; then retry." },
  dependency_pending: { problem: "An earlier event for the same records has not been processed yet.", resolve: "Retried automatically on the next run." },
  dependency_blocked: { problem: "An earlier event for the same records is blocked (for example the invoice or payment this depends on).", resolve: "Resolve the earlier event first. This one is released automatically when it posts." },
  dependency_missing: { problem: "The earlier event this depends on was never captured (it happened while integration was disabled, or its capture failed).", resolve: "Run a backfill to capture historical records, then retry." },
  original_not_posted: { problem: "The entry this correction would reverse has not been posted.", resolve: "Resolve the original event first, then retry." },
  isolated_test_requires_test_database: { problem: "Posting is only possible on a database explicitly marked as a test database.", resolve: "Expected in production. Use shadow stage there." },
  automatic_posting_disabled: { problem: "Automatic posting is not enabled for this organization.", resolve: "Expected outside the isolated-test stage." },
  source_unavailable: { problem: "The source record is no longer in the state this event describes.", resolve: "Check the source document. Report to an administrator if this persists." },
  project_division_mismatch: { problem: "The project's division differs from the record's division.", resolve: "Correct the source record if appropriate, then retry." },
  journal_unbalanced: { problem: "The journal does not balance.", resolve: "Correct the mapping (new version), then retry." },
  journal_lines_required: { problem: "The mapping produced fewer than two non-zero lines for these amounts.", resolve: "Correct the mapping (new version), then retry." },
  multi_currency_posting_disabled: { problem: "Only functional-currency lines can be posted.", resolve: "Stays blocked until multi-currency posting is approved." },
  unexpected_error: { problem: "An unexpected error occurred. The event is retried automatically a few times.", resolve: "If it keeps failing, report the event to an administrator with its reference." },
};
export const guidanceFor = (code: string | null) => (code && blockGuidance[code]) || { problem: code ? `The event could not be applied (${code}).` : "", resolve: "Fix the cause, then retry." };

/** Admin page for an event's source document. Payments have no detail page; use the invoice. */
export function sourceHref(eventType: string, sourceId: string, payload: Record<string, unknown>): string | null {
  const s = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : null);
  switch (eventType) {
    case "invoice_issued": case "invoice_voided": return `/admin/invoices/${sourceId}`;
    case "credit_note_issued": case "credit_note_voided": case "payment_allocated": case "allocation_reversed": return s("invoiceId") ? `/admin/invoices/${s("invoiceId")}` : null;
    case "payment_confirmed": case "refund_completed": return "/admin/payments";
    case "expense_approved": return `/admin/expenses/${sourceId}`;
    default: return s("expenseId") ? `/admin/expenses/${s("expenseId")}` : null;
  }
}

export const reconciliationChecks: Record<string, { label: string; describe: string }> = {
  receivables: { label: "Invoice receivables", describe: "Issued invoices less credit notes and allocations (plus completed allocation reversals) vs the receivables control account." },
  unallocatedReceipts: { label: "Unallocated customer funds", describe: "Confirmed payments not yet allocated or refunded vs the unallocated-receipts clearing account." },
  payables: { label: "Supplier liabilities (recognized)", describe: "Expenses whose approval created a liability, less disbursements against them, vs the payables account." },
  outputTax: { label: "Output tax", describe: "Tax on issued invoices less credit notes vs the output-tax account." },
  disbursements: { label: "Expense disbursements", describe: "Recorded (non-void) disbursements vs the entries posted for them." },
  refunds: { label: "Refunds", describe: "Completed refunds vs the entries posted for them." },
};
