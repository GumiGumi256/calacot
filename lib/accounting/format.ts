/**
 * Ledger amounts are shown exactly as stored (2 decimal places, grouped), never rounded for
 * display: a trial balance must add up on screen. Works on decimal strings, not floats.
 */
export function ledgerAmount(value: string | null | undefined, options: { blankZero?: boolean } = {}) {
  if (value === null || value === undefined || value === "") return options.blankZero ? "" : "—";
  const v = value.trim();
  const negative = v.startsWith("-");
  const [whole, fraction = ""] = (negative ? v.slice(1) : v).split(".");
  const cleanWhole = whole.replace(/^0+(?=\d)/, "");
  if (options.blankZero && /^0*$/.test(cleanWhole) && /^0*$/.test(fraction)) return "";
  const grouped = cleanWhole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}${grouped}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

export const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const journalActionLabels: Record<string, string> = {
  created: "Draft created", updated: "Draft edited", submit: "Submitted for approval", withdraw: "Withdrawn to draft", discard: "Discarded",
  approve: "Approved", return: "Returned to preparer", reject: "Rejected", post: "Posted", posted: "Posted (reversal)", reversed: "Reversed",
  activate: "Approved and activated", deactivate: "Deactivated", reactivate: "Reactivated", close: "Closed", reopen: "Reopened",
};
