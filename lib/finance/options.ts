// Client-safe constants for Phase 1D financial operations.
export const expenseStatuses = ["draft", "submitted", "returned", "approved", "paid", "rejected", "void"] as const;
export type ExpenseStatus = (typeof expenseStatuses)[number];

export const expenseStatusLabels: Record<string, string> = {
  draft: "Draft",
  submitted: "Pending review",
  returned: "Returned for correction",
  approved: "Approved",
  paid: "Paid",
  rejected: "Rejected",
  void: "Cancelled",
};

export const expenseStatusHelp: Record<string, string> = {
  draft: "Not yet submitted. Only the requester can see and change it.",
  submitted: "Waiting for a reviewer. The requester cannot approve their own request.",
  returned: "The reviewer asked for corrections. The requester can edit and resubmit.",
  approved: "Spending is authorized. No money has moved until finance records a disbursement.",
  paid: "Disbursements recorded for the full approved amount. Reconciliation is tracked separately.",
  rejected: "Declined by a reviewer. This is final.",
  void: "Cancelled by the requester before approval.",
};

// Suggestions only; the category field accepts other short labels.
export const expenseCategories = [
  "Materials",
  "Subcontractor",
  "Labour",
  "Transport",
  "Equipment hire",
  "Permits and fees",
  "Professional services",
  "Office and administration",
  "Software and subscriptions",
  "Marketing",
  "Travel",
  "Utilities",
  "Other",
] as const;

export const disbursementMethods = ["bank_transfer", "mobile_money", "cash", "cheque", "other"] as const;
export const disbursementMethodLabels: Record<string, string> = {
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

export const evidenceTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const evidenceMaxBytes = 10 * 1024 * 1024;

export const expenseViews = ["mine", "review", "payable", "verified", "all"] as const;

/** Staff and verified source accounts an administrator can use when recording a verified expense as paid. */
export type VerifiedPaymentOptions = { staff: { id: string; name: string }[]; accounts: { id: string; method: string; currency: string; label: string }[]; me: string };
export type ExpenseView = (typeof expenseViews)[number];

export function formatAmount(currency: string, value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: currency === "USD" ? 2 : 0, maximumFractionDigits: 2 })}`;
}
