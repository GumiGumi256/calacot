# Calacot transactional notifications

All four public enquiry forms require an email address and send separate customer and Calacot emails after saving. Design checkout sends both an acknowledgement/invoice and a team alert. Payment-reference submissions, assistance requests, payment confirmation, rejection and cancellation also notify both recipients. These are transactional acknowledgements, not marketing subscriptions.

## Email configuration

Set these in the deployment environment (local Next.js loads .env.local before .env):

```dotenv
RESEND_API_KEY=
RESEND_FROM_EMAIL=hello@contact.calacot.com
ENQUIRY_TEAM_EMAIL=info@calacot.com
```

The sender must be a bare email address on a domain verified in Resend. The app adds the Calacot display name. Customer replies go to ENQUIRY_TEAM_EMAIL; team replies go to the customer.

Reusable HTML lives in lib/email/template.ts, using renderNotificationTemplate. It provides escaped content, mobile styles, a hosted PNG wordmark with live-text fallback, presentation tables and an optional HTTPS action. Enquiry messages are built in lib/email/enquiry.ts; purchase messages in lib/design-purchases/email-messages.ts. Plain-text alternatives are included. Customer enquiry acknowledgements do not echo arbitrary submitted content.

Run `npx tsx scripts/preview-email.ts` to create customer and team HTML previews under docs/email-previews. No messages are sent.

## Sending and recovery

Next.js after() performs bounded delivery after the response. A shared sender retries network failures, HTTP 429 and 5xx errors up to three times with an unchanged payload/key. Permanent errors are logged without retry; one recipient's failure does not block the other. PDF failures fall back to an account link.

Invoice and payment-confirmation acceptance timestamps are tracked separately for customer and team. Apply drizzle/0006_purchase_team_emails.sql before deploying this code; `npx tsx scripts/migrate-notification-tracking.ts` applies only those two additive columns to the database loaded by Next.js. The migration was applied to the locally configured database during this repair. Apply it separately for deployments using a different database.

Admins can retry missing invoice/confirmation emails from the purchase page. Existing purchases with recorded customer sends can receive the missing team email without resending to the customer. Payment submissions and assistance/review events use the saved revision in their idempotency keys.

An API acceptance timestamp does not prove inbox delivery. Check Resend delivery/bounce/suppression events. Resend keys expire after 24 hours; see [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys). This is not a durable background queue: process termination or exhausted retries still requires operator follow-up. Enquiry and intermediate purchase-event emails do not have persistent delivery timestamps.

## WhatsApp configuration

```dotenv
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_API_VERSION=v23.0
WHATSAPP_TEMPLATE_PURCHASE_CREATED=calacot_purchase_created
WHATSAPP_TEMPLATE_LANGUAGE=en_US
WHATSAPP_VERIFY_TOKEN=
META_APP_SECRET=
CALACOT_APP_URL=https://calacot.com
CALACOT_WHATSAPP_NUMBER=
```

Outbound delivery uses Meta Cloud API, not the wa.me link. CALACOT_WHATSAPP_NUMBER only controls the customer-initiated chat link. API version defaults to v23.0 when omitted; explicitly configure the supported version for your Meta app.

Every new design checkout requires explicit consent to receive transactional WhatsApp purchase and payment updates, and validates the number before saving the consent timestamp. The preferred contact method remains a separate follow-up preference. Existing purchases without a consent timestamp are not messaged. Opted-out contacts are not messaged.

The approved template must match the configured name and language. Its body takes five positional text parameters: customer name, design title, package, formatted amount, purchase reference. URL button 0 must use https://calacot.com/account/designs/{{1}}, with the purchase UUID as its dynamic suffix. Use the corresponding production origin if different. See [Meta's template API reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/).

Configure the app's webhook as https://calacot.com/api/whatsapp/webhook, verify it with WHATSAPP_VERIFY_TOKEN, and subscribe to messages for the configured business account. META_APP_SECRET validates webhook signatures. The callback identifier is the outbound message UUID, allowing receipts to reconcile an uncertain send.

The admin purchase page shows WhatsApp state and offers a retry. Definite failures without a provider message ID can be claimed again; sent, delivered, read, in-flight and uncertain messages are not automatically resent. For an old uncertain message, inspect Meta delivery logs before changing its status or retrying. Never clear uncertain records in bulk just to force sends.

## Findings and verification

Read-only checks during this repair found a verified Resend sender domain and successful customer invoice/payment-confirmation deliveries. The old purchase code had no team email. Payment-reference and assistance submissions had no email hooks. Two property forms permitted missing email addresses.

WhatsApp API version was missing. Old code validated configuration inside the send attempt, recorded setup exceptions as uncertain, used the purchase ID instead of message ID for callback reconciliation, and never retried an existing failed row. Three existing messages were recorded as uncertain/delivery_exception. They were left unchanged.

Meta sender/template checks timed out both inside and outside the sandbox. Token validity, template approval, sender readiness and actual WhatsApp delivery remain unverified. No live emails or WhatsApp messages were sent by the repair.

Checks:

- `npx tsx scripts/verify-email.ts`: mocked notifications, required email fields, retry isolation, PDF fallback, template escaping, WhatsApp phone/template/transport.
- `npx tsx scripts/verify-design-purchases.ts`: isolated database migrations, purchase transitions, concurrency, access and PDF generation.
- `npx tsx scripts/diagnose-notifications.ts`: read-only configuration/provider checks and aggregate database status; no recipient details or credentials printed.

Deploy/restart the application with the environment settings above, then verify a real authorized submission and both inboxes. Historical missing team notifications can be retried from the admin purchase page.
