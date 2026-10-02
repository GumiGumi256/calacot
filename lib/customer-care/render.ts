import { z } from "zod";

export const OUT_OF_SCOPE =
  "I can help with Calacot’s architectural designs, real estate, painting, interiors, software services, and customer support. What would you like help with?";
export const templates = {
  welcome:
    "Welcome to Calacot. We sell possibility. How can we help with architecture, real estate, painting, interiors, software services, or an existing enquiry?",
  clarify:
    "Which Calacot service or customer enquiry would you like help with?",
  missing:
    "I don’t have approved information for that yet. Would you like our team to help?",
  details:
    "Please share your project location, requirements, budget range, and preferred timeline so our team can review your enquiry.",
  lead: "Your enquiry has been recorded for the Calacot team to review.",
  callback:
    "Your callback request has been recorded. Our team will review your preferred time and contact details.",
  handoff:
    "Your enquiry has been passed to the Calacot team for personal assistance.",
  attachment:
    "I can’t review attachments here. Please describe your Calacot enquiry in a text message, or ask for our team’s help.",
  failure:
    "Customer care is temporarily unavailable. Please try again shortly or ask for our team’s help.",
  no_results:
    "No matching published listings were found. Would you like our team to help with your requirements?",
  order_missing:
    "I couldn’t find that order in your linked Calacot account. Please check the reference or ask our team for help.",
  linked:
    "Your Calacot account is linked for customer care. Send your Calacot purchase reference to check its status.",
  reference: "Please send your Calacot purchase reference to check its status.",
  support_missing:
    "No support requests were found for your linked WhatsApp conversation. Would you like our team to help?",
} as const;
export type StaticTemplate = keyof typeof templates | "refuse";
export function renderStatic(id: StaticTemplate) {
  return id === "refuse" ? OUT_OF_SCOPE : templates[id];
}

// These values come only from published, approved CMS or successful authoritative tools.
// No interpolation path accepts model prose or customer message content.
export const displayText = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine((v) => !/[\p{Cc}\p{Cf}<>`*_[\]\\]|https?:|www\./iu.test(v));
export const approvedAnswer = z
  .string()
  .trim()
  .min(1)
  .max(2400)
  .refine(
    (v) =>
      !/[\p{Cc}\p{Cf}<>]/u.test(v.replace(/\n/g, "")) &&
      !/(https?:|www\.|wa\.me)/i.test(v),
    "Use reviewed link fields instead of embedded URLs",
  );
export function safeLink(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !["calacot.com", "www.calacot.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    throw new Error("Unapproved display URL");
  return url.toString();
}
export function renderKnowledge(answer: string, link?: string | null) {
  return `${approvedAnswer.parse(answer)}${link ? `\n${safeLink(link)}` : ""}`;
}
const prices = z.number().positive().finite().max(1e14);
export function renderListings(
  rows: { title: string; price: number | null; url: string; detail: string }[],
) {
  if (!rows.length) return templates.no_results;
  return rows
    .slice(0, 3)
    .map(
      (r) =>
        `${displayText.parse(r.title)}\n${displayText.parse(r.detail)}${r.price == null ? "" : ` · UGX ${prices.parse(r.price).toLocaleString("en-UG")}`}\n${safeLink(r.url)}`,
    )
    .join("\n\n");
}
const purchaseLabels: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  awaiting_contact: "Awaiting contact",
  payment_submitted: "Payment submitted for review",
  completed: "Completed",
  cancelled: "Cancelled",
};
const paymentLabels: Record<string, string> = {
  pending: "Pending",
  submitted: "Submitted for review",
  confirmed: "Confirmed",
  rejected: "Rejected",
};
export function renderOrder(row: {
  purchaseReference: string;
  purchaseStatus: string;
  paymentStatus: string;
}) {
  const purchase = purchaseLabels[row.purchaseStatus],
    payment = paymentLabels[row.paymentStatus];
  if (!purchase || !payment) throw new Error("Unknown order state");
  return `Calacot order ${displayText.parse(row.purchaseReference)}\nOrder: ${purchase}\nPayment: ${payment}`;
}
export function renderAccountLink(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error("Invalid account link token");
  return `To check private order information, sign in to your Calacot account and approve this WhatsApp link. The link expires in 15 minutes.\n${safeLink(`https://calacot.com/account/customer-care/link?token=${token}`)}`;
}
export function renderSupport(rows: { kind: string; status: string }[]) {
  const kinds: Record<string, string> = {
    lead: "Project enquiry",
    callback: "Callback request",
    handoff: "Customer care request",
  };
  const statuses: Record<string, string> = {
    new: "Awaiting team review",
    contacted: "Team contact recorded",
    closed: "Closed",
  };
  if (!rows.length) return templates.support_missing;
  return rows
    .slice(0, 3)
    .map((r) => {
      if (!kinds[r.kind] || !statuses[r.status])
        throw new Error("Unknown support state");
      return `${kinds[r.kind]}: ${statuses[r.status]}`;
    })
    .join("\n");
}
export function renderPayment(instructions: {
  mobile: {
    network: string;
    number: string;
    account: string;
    currency: string;
  } | null;
  bank: {
    name: string;
    number: string;
    account: string;
    swift: string;
    currency: string;
  } | null;
}) {
  const lines: string[] = [];
  if (instructions.mobile) {
    const m = instructions.mobile;
    if (!/^\+?[\d ()-]{7,24}$/.test(m.number))
      throw new Error("Invalid configured payment number");
    lines.push(
      `Mobile money: ${displayText.parse(m.network)}\nNumber: ${displayText.parse(m.number)}\nAccount: ${displayText.parse(m.account)}\nCurrency: ${displayText.parse(m.currency)}`,
    );
  }
  if (instructions.bank) {
    const b = instructions.bank;
    lines.push(
      `Bank: ${displayText.parse(b.name)}\nAccount number: ${displayText.parse(b.number)}\nAccount name: ${displayText.parse(b.account)}\nCurrency: ${displayText.parse(b.currency)}`,
    );
  }
  return lines.length
    ? `${lines.join("\n\n")}\n\nInclude your Calacot purchase reference. Payment remains subject to team verification.`
    : templates.missing;
}
