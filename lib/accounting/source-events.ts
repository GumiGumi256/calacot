import { fromMinor, toMinor } from "./engine";

/**
 * Source-to-journal mapping architecture (Phase 2A: prepared, NOT active).
 *
 * Each operational event that may one day create a ledger entry is listed here with what it
 * actually represents. Three different things are kept apart:
 *   - approval:     someone authorized something (no accounting effect by itself);
 *   - recognition:  an accounting event (revenue, receivable, liability, expense) occurs;
 *   - cash:         money actually moved in or out of a company account.
 *
 * Proposed treatments are suggestions for the accountant. Nothing here is wired to invoices,
 * payments or expenses, and the database refuses automatic posting in this phase.
 */
export type SourceStage = "approval" | "recognition" | "settlement" | "cash";

export type SourceEventDefinition = {
  type: SourceType;
  label: string;
  record: string;
  stage: SourceStage;
  authoritative: string;
  proposedTreatment: string;
  amountKeys: readonly string[];
  openQuestions: readonly string[];
};

export const sourceTypes = [
  "invoice_issued",
  "payment_confirmed",
  "payment_allocated",
  "credit_note_issued",
  "refund_completed",
  "expense_approved",
  "disbursement_recorded",
  "disbursement_voided",
  "bank_transaction",
] as const;
export type SourceType = (typeof sourceTypes)[number];

export const sourceEvents: SourceEventDefinition[] = [
  {
    type: "invoice_issued",
    label: "Invoice issued",
    record: "invoices (status issued; immutable after issue)",
    stage: "recognition",
    authoritative: "Yes. Issue assigns the legal invoice number and freezes the amounts.",
    proposedTreatment: "Dr 1200 Trade receivables / Cr revenue account by division (4100-4600). Tax lines only after a tax policy is approved.",
    amountKeys: ["total", "subtotal", "discount", "tax"],
    openQuestions: ["Is revenue recognized at invoice, on delivery, or over time for contract works?", "How are deposits invoiced before work starts treated?"],
  },
  {
    type: "payment_confirmed",
    label: "Customer payment confirmed",
    record: "payments (status confirmed, with receipt number)",
    stage: "cash",
    authoritative: "Yes for cash received, after staff verification. Not a bank-reconciled settlement.",
    proposedTreatment: "Dr bank or mobile-money account / Cr 2140 Unallocated customer receipts.",
    amountKeys: ["amount"],
    openQuestions: ["Which ledger account receives each payment method when no verified receiving account is recorded on the payment?"],
  },
  {
    type: "payment_allocated",
    label: "Payment allocated to invoice",
    record: "payment_allocations",
    stage: "settlement",
    authoritative: "Yes. Allocation is what reduces an invoice balance today.",
    proposedTreatment: "Dr 2140 Unallocated customer receipts / Cr 1200 Trade receivables.",
    amountKeys: ["amount"],
    openQuestions: [],
  },
  {
    type: "credit_note_issued",
    label: "Credit note issued",
    record: "credit_notes (status issued)",
    stage: "recognition",
    authoritative: "Yes. Reduces the invoice balance.",
    proposedTreatment: "Dr 4900 Sales discounts and credit notes / Cr 1200 Trade receivables.",
    amountKeys: ["total"],
    openQuestions: ["Should credit notes reverse the original revenue account instead of a contra account?"],
  },
  {
    type: "refund_completed",
    label: "Refund completed",
    record: "payment_refunds (status completed)",
    stage: "cash",
    authoritative: "Schema exists but no application workflow creates refunds yet.",
    proposedTreatment: "Dr 2140 Unallocated customer receipts (or 1200) / Cr bank or mobile-money account.",
    amountKeys: ["amount"],
    openQuestions: ["Refund workflow must exist before mapping can be confirmed."],
  },
  {
    type: "expense_approved",
    label: "Expense request approved",
    record: "expenses (status approved)",
    stage: "approval",
    authoritative: "Internal authorization to spend only. It is not a supplier invoice and moves no money.",
    proposedTreatment: "No journal by default. If the accountant chooses accrual on approval: Dr expense account / Cr 2120 Accrued expenses.",
    amountKeys: ["total", "net", "tax"],
    openQuestions: ["Recognize expenses on approval (accrual) or on disbursement (cash basis)?", "How do expense categories map to accounts?"],
  },
  {
    type: "disbursement_recorded",
    label: "Disbursement recorded",
    record: "expense_disbursements (status recorded)",
    stage: "cash",
    authoritative: "Manually recorded payment; becomes stronger evidence after reconciliation.",
    proposedTreatment: "Cash basis: Dr expense account by category / Cr source bank, mobile-money or petty cash account. Accrual basis: Dr 2120 Accrued expenses / Cr source account.",
    amountKeys: ["amount"],
    openQuestions: ["Post on recording or only after reconciliation?", "Mapping of each verified finance account to a ledger account."],
  },
  {
    type: "disbursement_voided",
    label: "Disbursement voided",
    record: "expense_disbursements (status void)",
    stage: "cash",
    authoritative: "Yes. Cancels a recorded disbursement.",
    proposedTreatment: "Reversal journal of the original disbursement posting (never an edit).",
    amountKeys: ["amount"],
    openQuestions: [],
  },
  {
    type: "bank_transaction",
    label: "Bank transaction",
    record: "None yet (no bank feed or statement import exists)",
    stage: "cash",
    authoritative: "Not available.",
    proposedTreatment: "To be designed with bank reconciliation in a later phase.",
    amountKeys: ["amount"],
    openQuestions: ["Source of bank data (statement import, bank API)."],
  },
];

// ---------------------------------------------------------------------------------------------
// Versioned rule definitions and the pure journal builder.
// ---------------------------------------------------------------------------------------------

export type RuleAccount = { code: string } | { byDivision: Record<string, string>; fallback?: string };
export type RuleLine = { side: "debit" | "credit"; account: RuleAccount; amount: string; memo?: string };
export type RuleDefinition = { schema: 1; lines: RuleLine[] };

export type SourceEvent = {
  sourceType: SourceType;
  sourceId: string;
  /** Distinguishes several accounting events from one record, e.g. "issue" or "allocation:<id>". */
  eventKey: string;
  date: string;
  currency: string;
  division?: string | null;
  projectId?: string | null;
  description: string;
  amounts: Record<string, string>;
};

export type ProposedLine = { accountCode: string; debit: string; credit: string; currency: string; division: string | null; projectId: string | null; description: string };

export type BuildResult =
  | { ok: true; identity: { sourceType: SourceType; sourceId: string; sourceEvent: string }; lines: ProposedLine[] }
  | { ok: false; errors: string[] };

export function validateRuleDefinition(sourceType: SourceType, def: unknown): string[] {
  const errors: string[] = [];
  const known = sourceEvents.find((e) => e.type === sourceType);
  if (!known) return ["unknown_source_type"];
  const d = def as RuleDefinition;
  if (!d || d.schema !== 1 || !Array.isArray(d.lines)) return ["invalid_definition"];
  if (d.lines.length < 2) errors.push("rule_needs_two_lines");
  if (!d.lines.some((l) => l.side === "debit") || !d.lines.some((l) => l.side === "credit")) errors.push("rule_needs_both_sides");
  d.lines.forEach((l, i) => {
    if (l.side !== "debit" && l.side !== "credit") errors.push(`line_${i + 1}_side`);
    if (!known.amountKeys.includes(l.amount)) errors.push(`line_${i + 1}_amount_${l.amount}`);
    const acc = l.account as Partial<{ code: string; byDivision: Record<string, string> }>;
    if (!acc || (!acc.code && !acc.byDivision)) errors.push(`line_${i + 1}_account`);
  });
  return errors;
}

/**
 * Builds the journal a rule WOULD produce for a source event. Deterministic and side-effect
 * free; the source identity is what the database's unique index uses to prevent duplicates.
 * Zero-amount lines are omitted. Fails if the result would not balance.
 */
export function buildSourceJournal(rule: { sourceType: SourceType; definition: RuleDefinition }, event: SourceEvent): BuildResult {
  if (rule.sourceType !== event.sourceType) return { ok: false, errors: ["source_type_mismatch"] };
  const errors = validateRuleDefinition(rule.sourceType, rule.definition);
  if (errors.length) return { ok: false, errors };
  if (!["UGX", "USD"].includes(event.currency)) return { ok: false, errors: ["invalid_currency"] };
  const lines: ProposedLine[] = [];
  let debit = BigInt(0);
  let credit = BigInt(0);
  for (const l of rule.definition.lines) {
    const raw = event.amounts[l.amount];
    if (raw === undefined) return { ok: false, errors: [`missing_amount_${l.amount}`] };
    let minor: bigint;
    try { minor = toMinor(raw); } catch { return { ok: false, errors: [`invalid_amount_${l.amount}`] }; }
    if (minor === BigInt(0)) continue;
    let code: string | undefined;
    if ("code" in l.account) code = l.account.code;
    else code = (event.division && l.account.byDivision[event.division]) || l.account.fallback;
    if (!code) return { ok: false, errors: [`no_account_for_division_${event.division ?? "none"}`] };
    const amount = fromMinor(minor);
    lines.push({
      accountCode: code,
      debit: l.side === "debit" ? amount : "0.00",
      credit: l.side === "credit" ? amount : "0.00",
      currency: event.currency,
      division: event.division ?? null,
      projectId: event.projectId ?? null,
      description: l.memo ?? event.description,
    });
    if (l.side === "debit") debit += minor; else credit += minor;
  }
  if (lines.length < 2 || debit !== credit) return { ok: false, errors: ["journal_unbalanced"] };
  return { ok: true, identity: { sourceType: event.sourceType, sourceId: event.sourceId, sourceEvent: event.eventKey }, lines };
}

/** Example definitions used in tests and documentation. Not approved, not stored, not active. */
export const exampleRules: Partial<Record<SourceType, RuleDefinition>> = {
  invoice_issued: {
    schema: 1,
    lines: [
      { side: "debit", account: { code: "1200" }, amount: "total" },
      { side: "credit", account: { byDivision: { architecture: "4100", interiors: "4100", painting: "4200", estates: "4410", tech: "4600" }, fallback: "4100" }, amount: "total" },
    ],
  },
  payment_allocated: {
    schema: 1,
    lines: [
      { side: "debit", account: { code: "2140" }, amount: "amount" },
      { side: "credit", account: { code: "1200" }, amount: "amount" },
    ],
  },
};
