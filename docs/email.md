# Resend enquiry email setup

All four forms save to the existing database first. Next.js after() sends a team notification and, when an email address was supplied, a customer acknowledgement. Customer messages use fixed copy; submitted content appears only in the team notification. Call requests require staff confirmation and do not create calendar bookings.

Add these variables privately to .env.local and to your deployment environment, then restart/redeploy:

```dotenv
RESEND_API_KEY=
RESEND_FROM_EMAIL=hello@contact.calacot.com
ENQUIRY_TEAM_EMAIL=info@calacot.com
```

RESEND_FROM_EMAIL must be an email address on the verified contact.calacot.com domain, without a display name. The application adds the Calacot display name. ENQUIRY_TEAM_EMAIL must be one monitored mailbox; customer replies go there. Team notifications have the customer's address as replyTo where supplied. Missing configuration is logged with the saved record reference, without exposing customer details or credentials.

Verify contact.calacot.com in the Resend dashboard and publish its required DNS records before enabling delivery. Check the Resend dashboard for acceptance, delivery, bounce and suppression events; an accepted API response is not proof of inbox delivery.

Each saved record and recipient role has a separate idempotency key passed as the second SDK argument. Rate limit/server errors and network failures receive up to three attempts with the same payload/key. Permanent errors are logged without retry. An email failure never rolls back an enquiry. Contact-form duplicate submissions do not enqueue another email; other forms retain their existing submission behaviour.

This is bounded delivery after the response, not a durable queue. A process termination or exhausted retries requires operator follow-up from the saved enquiry. Resend keys deduplicate for 24 hours; do not assume they prevent duplicates indefinitely. Monitor server logs for �Enquiry email� failures and check saved leads regularly. No database migrations or live test emails were performed.

Run offline verification with `npx tsx scripts/verify-email.ts`. It mocks delivery and uses Resend's test recipient. For an intentional live delivery test, use delivered@resend.dev and a verified sender; do not submit invented customer mailboxes. Public form abuse controls at your hosting layer should be enabled before exposing automated confirmations at scale.

Official references:
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/dashboard/emails/idempotency-keys
