import "server-only";
import { after } from "next/server";
import { getEmailClient } from "./client";
import { z } from "zod";
import { deliverEnquiryEmails, type EnquiryEmail } from "./enquiry";

export function queueEnquiryEmails(enquiry: EnquiryEmail) {
  after(async () => {
    const email = getEmailClient();
    const team = process.env.ENQUIRY_TEAM_EMAIL?.trim();
    // Sender is an address (without a display name); Calacot is added below.
    if (!email || !z.email().safeParse(team).success) {
      console.error("Enquiry email configuration missing or invalid", { reference: enquiry.id });
      return;
    }
    await deliverEnquiryEmails(enquiry, email.from, team!, async (payload, options) => {
      const { data, error } = await email.client.emails.send(payload, options);
      return { data, error };
    });
  });
}
