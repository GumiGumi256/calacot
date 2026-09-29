import "server-only";
import { after } from "next/server";
import { getEmailClient, getTeamEmail } from "./client";
import { deliverEnquiryEmails, type EnquiryEmail } from "./enquiry";

export function queueEnquiryEmails(enquiry: EnquiryEmail) {
  after(async () => {
    const email = getEmailClient();
    const team = getTeamEmail();
    if (!email || !team) {
      console.error("Enquiry email configuration missing or invalid", {
        reference: enquiry.id,
      });
      return;
    }
    await deliverEnquiryEmails(
      enquiry,
      email.from,
      team,
      async (payload, options) => {
        const { data, error } = await email.client.emails.send(
          payload,
          options,
        );
        return { data, error };
      },
    );
  });
}
