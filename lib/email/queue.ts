import "server-only";
import { after } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { deliverEnquiryEmails, type EnquiryEmail } from "./enquiry";

export function queueEnquiryEmails(enquiry: EnquiryEmail) {
  after(async () => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL?.trim();
    const team = process.env.ENQUIRY_TEAM_EMAIL?.trim();
    // Sender is an address (without a display name); Calacot is added below.
    if (!apiKey || !z.email().safeParse(from).success || !z.email().safeParse(team).success || !from?.endsWith("@contact.calacot.com")) {
      console.error("Enquiry email configuration missing or invalid", { reference: enquiry.id });
      return;
    }
    const resend = new Resend(apiKey);
    await deliverEnquiryEmails(enquiry, `Calacot <${from}>`, team!, async (payload, options) => {
      const { data, error } = await resend.emails.send(payload, options);
      return { data, error };
    });
  });
}
