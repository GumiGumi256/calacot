/**
 * Phase 2C banking vocabulary shared by server and client code. Labels and help text only; every
 * rule they describe is enforced in drizzle-current/0021_banking_reconciliation.sql.
 */

export const bankingKinds = ["bank", "mobile_money", "cash", "petty_cash", "clearing"] as const;
export type BankingKind = (typeof bankingKinds)[number];
export const bankingKindLabels: Record<BankingKind, string> = {
  bank: "Bank account",
  mobile_money: "Mobile money wallet",
  cash: "Cash",
  petty_cash: "Petty cash",
  clearing: "Clearing account",
};
export const bankingKindHelp: Record<BankingKind, string> = {
  bank: "Uses a verified bank account from Payment accounts. Statements can be imported.",
  mobile_money: "Uses a verified MTN Mobile Money or Airtel Money wallet from Payment accounts. Statements can be imported.",
  cash: "Physical cash held by a named custodian. Checked by cash counts.",
  petty_cash: "An imprest float held by a named custodian, topped up by transfers up to its approved float.",
  clearing: "Money in transit between accounts, such as receipts not yet banked.",
};

export const categories = ["bank_fee", "interest_income", "interest_expense", "cash_shortage", "cash_overage", "staff_advances"] as const;
export type Category = (typeof categories)[number];
export const categoryLabels: Record<Category, string> = {
  bank_fee: "Bank and mobile-money charges",
  interest_income: "Interest received",
  interest_expense: "Interest charged",
  cash_shortage: "Cash shortages",
  cash_overage: "Cash overages",
  staff_advances: "Staff advances (asset)",
};
export const categoryHelp: Record<Category, string> = {
  bank_fee: "An expense account, e.g. 6910 Bank and mobile-money charges.",
  interest_income: "An income account, e.g. 7100 Interest income.",
  interest_expense: "An expense account, e.g. 8100 Interest and finance costs.",
  cash_shortage: "An expense account for unexplained cash shortages.",
  cash_overage: "An income account for unexplained cash overages.",
  staff_advances: "An asset account, e.g. 1230 Staff advances and imprests. Never an expense.",
};
/** Which statement categories can be prepared from an unmatched bank line, by direction. */
export const adjustmentCategories = { out: ["bank_fee", "interest_expense"], in: ["interest_income"] } as const;

export const cashKinds = ["receipt", "payment", "transfer", "advance", "accountability", "count_adjustment", "bank_adjustment"] as const;
export type CashKind = (typeof cashKinds)[number];
export const cashKindLabels: Record<CashKind, string> = {
  receipt: "Cash receipt",
  payment: "Cash payment",
  transfer: "Transfer between accounts",
  advance: "Staff advance",
  accountability: "Advance accountability",
  count_adjustment: "Cash count adjustment",
  bank_adjustment: "Bank charge or interest",
};

/** Journal status as seen from a cash transaction. */
export const cashStatusLabels: Record<string, string> = {
  draft: "Draft", submitted: "Awaiting approval", approved: "Approved, not posted", posted: "Posted", rejected: "Rejected", discarded: "Cancelled",
};

export const reviewReasonLabels: Record<string, string> = {
  exact_duplicate: "Already imported from an earlier statement",
  possible_duplicate: "Same date and amount as a line from another statement",
  in_finalized_period: "Dated in a finalized reconciliation",
};

export const matchKindLabels: Record<string, string> = {
  match: "Match",
  statement_offset: "Bank reversal pair",
  ledger_offset: "Ledger reversal pair",
  opening_balance: "Opening balance",
  adjustment: "Bank adjustment",
};

export const problemLabels: Record<string, string> = {
  banking_mapping_required: "The account has no approved ledger account.",
  statement_balance_mismatch: "Opening balance plus statement lines does not equal the closing statement balance.",
  statement_review_pending: "Statement lines are awaiting duplicate review.",
  unmatched_statement_items: "Bank lines are not matched to the books.",
  reconciliation_difference: "Unexplained difference between the bank and the books.",
};

/** Never show a full account number: last four characters only. */
export function maskIdentifier(normalized: string | null | undefined) {
  if (!normalized) return "";
  return normalized.length <= 4 ? "••••" : `•••• ${normalized.slice(-4)}`;
}
