import { sendEmailWithRetry, type EmailSend } from "./delivery";
import { renderEnquiryTemplate } from "./template";
import type { CreateEmailOptions } from "resend";

export type EnquiryEmail = {
  id: string;
  kind: "project" | "call" | "estate" | "property";
  email?: string | null;
  details: Record<string, unknown>;
};

const names = { project: "Project request", call: "Consultation request", estate: "Property enquiry", property: "Property listing enquiry" };
const labels: Record<string, string> = {
  fullName: "Name", email: "Email", phone: "Phone", service: "Service",
  projectLocation: "Project location", estimatedBudget: "Estimated budget", timeline: "Timeline",
  projectOverview: "Project overview", preferredDate: "Requested date", preferredTime: "Requested time",
  intent: "Enquiry type", propertyType: "Property type", location: "Location", currency: "Currency",
  budgetMin: "Minimum budget", budgetMax: "Maximum budget", askingPrice: "Asking price",
  relationship: "Relationship to property", notes: "Notes", contactMethod: "Preferred contact method",
  submissionType: "Submission type", details: "Property details",
};

export function buildEnquiryEmails(enquiry: EnquiryEmail, from: string, team: string) {
  const reference = `${enquiry.kind}-${enquiry.id}`;
  const heading = names[enquiry.kind];
  const detailRows: Array<[string, string]> = Object.entries(enquiry.details)
    .filter(([key, value]) => labels[key] && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => [labels[key], value instanceof Date ? value.toISOString().slice(0, 10) : String(value)]);
  const details = detailRows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const message = (subject: string, text: string, to: string, replyTo: string, html: string): CreateEmailOptions => ({
    from, to, replyTo, subject,
    text,
    html,
  });
  const emails = [{
    key: `enquiry-team/${reference}`,
    payload: message(`New ${heading.toLowerCase()} | Calacot`, `A new enquiry has been saved.\nReference: ${reference}\n\n${details}`, team, enquiry.email || team, renderEnquiryTemplate({ audience: "team", heading, reference, details: detailRows })),
  }];
  if (enquiry.email) {
    const next = enquiry.kind === "call"
      ? "We have received your preferred call time. Our team will contact you to confirm availability. This is an acknowledgement, not a confirmed appointment."
      : "Our team will review your enquiry and contact you using the details you provided.";
    // Do not echo arbitrary submitted text into mail sent to an unverified address.
    emails.push({
      key: `enquiry-customer/${reference}`,
      payload: message(`Your ${heading.toLowerCase()} has been received`, `Thank you for contacting Calacot.\n\n${next}\n\nReference: ${reference}\n\nIf you did not submit this enquiry, you can ignore this email.`, enquiry.email, team, renderEnquiryTemplate({ audience: "customer", heading, reference, next })),
    });
  }
  return emails;
}

export async function deliverEnquiryEmails(
  enquiry: EnquiryEmail, from: string, team: string, send: EmailSend,
  pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
) {
  for (const { key, payload } of buildEnquiryEmails(enquiry, from, team)) {
    await sendEmailWithRetry(payload, key, send, pause);
  }
}
