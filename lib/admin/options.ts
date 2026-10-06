export const leadStatuses = [
  "new",
  "contacted",
  "scheduled",
  "qualified",
  "closed_won",
  "closed_lost",
] as const;
export const leadTypes = [
  "scheduled_call",
  "project_request",
  "contact_inquiry",
] as const;
export const paymentStatuses = ["submitted", "confirmed", "rejected"] as const;
export const paymentMethods = [
  "mobile_money",
  "bank_transfer",
  "cash",
  "other",
] as const;
export const expenseStatuses = [
  "draft",
  "submitted",
  "approved",
  "paid",
  "rejected",
  "void",
] as const;
export const label = (s: string) => s.replaceAll("_", " ");
