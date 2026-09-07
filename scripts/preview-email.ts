import { mkdirSync, writeFileSync } from "node:fs";
import { buildEnquiryEmails } from "../lib/email/enquiry";

mkdirSync("docs/email-previews", { recursive: true });
const messages = buildEnquiryEmails({
  id: "3d218f80-30af-4bc1-9d02-aec641c93578", kind: "property", email: "delivered@resend.dev",
  details: { fullName: "Sample property owner", propertyType: "Apartment", location: "Kampala, Uganda", submissionType: "individual", details: "An apartment block with 10 units, available for listing and sale.", email: "delivered@resend.dev" },
}, "Calacot <hello@contact.calacot.com>", "info@calacot.com");
for (const [index, message] of messages.entries()) {
  writeFileSync(`docs/email-previews/${index === 0 ? "team" : "customer"}.html`, message.payload.html!);
}
console.log("Created customer and team HTML previews. No emails sent.");
