/**
 * Calacot Admin Design System V1: status presentation registry.
 * Maps every workflow status to a human label and a semantic tone. Presentation only:
 * how a status is *derived* (e.g. an expired quotation) stays in the domain libraries.
 * Labels reuse the business wording already shown in the admin (e.g. accepted -> "Confirmed").
 */

export type StatusTone = "success" | "warning" | "destructive" | "info" | "neutral";
export type StatusEntry = { label: string; tone: StatusTone };

const s = (label: string, tone: StatusTone): StatusEntry => ({ label, tone });

export const statusRegistry = {
  lead: {
    new: s("New", "info"),
    contacted: s("Contacted", "neutral"),
    scheduled: s("Scheduled", "info"),
    qualified: s("Qualified", "warning"),
    closed_won: s("Won", "success"),
    closed_lost: s("Lost", "neutral"),
  },
  client: {
    active: s("Active", "success"),
    archived: s("Archived", "neutral"),
  },
  project: {
    planned: s("Planned", "info"),
    active: s("Active", "success"),
    on_hold: s("On hold", "warning"),
    completed: s("Completed", "neutral"),
    cancelled: s("Cancelled", "neutral"),
  },
  task: {
    todo: s("To do", "neutral"),
    in_progress: s("In progress", "info"),
    blocked: s("Blocked", "destructive"),
    completed: s("Completed", "success"),
    cancelled: s("Cancelled", "neutral"),
  },
  quotation: {
    draft: s("Draft", "neutral"),
    sent: s("Sent", "info"),
    accepted: s("Confirmed", "success"),
    declined: s("Declined", "destructive"),
    expired: s("Expired", "warning"),
    superseded: s("Superseded", "neutral"),
  },
  invoice: {
    draft: s("Draft", "neutral"),
    issued: s("Issued", "info"),
    void: s("Void", "neutral"),
  },
  invoicePayment: {
    paid: s("Paid", "success"),
    unpaid: s("Unpaid", "neutral"),
    partial: s("Part paid", "warning"),
    overdue: s("Overdue", "destructive"),
  },
  payment: {
    submitted: s("Awaiting verification", "warning"),
    confirmed: s("Confirmed", "success"),
    rejected: s("Rejected", "destructive"),
  },
  expense: {
    draft: s("Draft", "neutral"),
    submitted: s("Pending review", "warning"),
    returned: s("Returned for correction", "warning"),
    approved: s("Approved", "info"),
    paid: s("Paid", "success"),
    rejected: s("Rejected", "destructive"),
    void: s("Cancelled", "neutral"),
  },
  delivery: {
    queued: s("Queued", "neutral"),
    processing: s("Processing", "info"),
    provider_accepted: s("Accepted by provider", "info"),
    delivered: s("Delivered", "success"),
    read: s("Read", "success"),
    failed: s("Failed", "destructive"),
    blocked: s("Blocked", "destructive"),
    suppressed: s("Suppressed", "warning"),
    uncertain: s("Uncertain", "warning"),
    captured: s("Captured (test)", "neutral"),
    skipped: s("Skipped", "neutral"),
  },
  staff: {
    active: s("Active", "success"),
    invited: s("Invited", "info"),
    suspended: s("Suspended", "destructive"),
    removed: s("Removed", "neutral"),
  },
  journal: {
    draft: s("Draft", "neutral"),
    submitted: s("Awaiting approval", "warning"),
    approved: s("Approved, not posted", "info"),
    posted: s("Posted", "success"),
    rejected: s("Rejected", "destructive"),
    discarded: s("Discarded", "neutral"),
  },
  account: {
    proposed: s("Proposed", "warning"),
    active: s("Active", "success"),
    inactive: s("Inactive", "neutral"),
  },
  period: {
    open: s("Open", "success"),
    closed: s("Closed", "neutral"),
  },
  accountingProposal: {
    proposed: s("Awaiting approval", "warning"),
    approved: s("Approved", "success"),
    rejected: s("Rejected", "destructive"),
    superseded: s("Superseded", "neutral"),
    retired: s("Retired", "neutral"),
  },
  integrationEvent: {
    pending: s("Waiting to process", "info"),
    posted: s("Posted", "success"),
    no_effect: s("No accounting effect", "neutral"),
    shadowed: s("Previewed (shadow)", "info"),
    blocked: s("Needs attention", "warning"),
    failed: s("Failed", "destructive"),
  },
  integrationStage: {
    disabled: s("Disabled", "neutral"),
    isolated_test: s("Isolated test posting", "warning"),
    shadow: s("Shadow reconciliation", "info"),
    active: s("Active", "success"),
  },
  reconciliation: {
    matched: s("Matched", "success"),
    explained: s("Explained by unposted events", "warning"),
    unexplained: s("Unexplained difference", "destructive"),
  },
  designPurchase: {
    awaiting_payment: s("Awaiting payment", "neutral"),
    awaiting_contact: s("Awaiting Calacot", "warning"),
    payment_submitted: s("Payment under review", "warning"),
    completed: s("Purchased", "success"),
    cancelled: s("Cancelled", "neutral"),
  },
} as const satisfies Record<string, Record<string, StatusEntry>>;

export type StatusDomain = keyof typeof statusRegistry;

const humanize = (value: string) => {
  const text = value.replaceAll("_", " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "Unknown";
};

/** Unknown statuses still render (humanised, neutral) so new enum values never break a page. */
export function resolveStatus(domain: StatusDomain, status: string | null | undefined): StatusEntry {
  const entry = status ? (statusRegistry[domain] as Record<string, StatusEntry>)[status] : undefined;
  return entry ?? { label: status ? humanize(status) : "Unknown", tone: "neutral" };
}
