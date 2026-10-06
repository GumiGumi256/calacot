# WhatsApp menu assistant

The customer-care worker now supports a deterministic nested menu. No model generates replies or guesses intent. Service information comes from the published, approved Sanity company profile; absent or oversized summaries give an honest explanation and team assistance. Website/admin layout and purchase notifications are preserved.

## Setup

The customer-care inbox displays the latest 80 messages in a shadcn message scroller and refreshes every 15 seconds. Staff can send a text reply of up to 4,096 characters. Sending takes over the conversation, clears the menu session, and pauses automated replies until staff resume the bot. The server checks administrator access, opt-out and the 24-hour reply window; repeated submissions reuse their saved message ID. Provider acceptance, delivery, failure and uncertain delivery remain visible in the thread. Do not repeat an uncertain send without checking WhatsApp.

For delivery troubleshooting, run `npx tsx scripts/check-whatsapp-delivery.ts`. The read-only check verifies the public webhook challenge, attempts to read Meta app subscriptions and reports aggregate message outcomes without customer message content. Production `whatsapp_webhook_unknown_format` warnings now include rejection counts for account mismatch, number mismatch, invalid payloads and unsupported fields. No Gemini credentials are used by this menu assistant.

The scheduled worker runner reads exactly `CUSTOMER_CARE_WORKER_URL=https://www.calacot.com/api/customer-care/worker`. A misspelled variable or HTTP URL prevents that runner from invoking the worker. Setting the variable alone does not create a scheduler.

Private quotation and purchase requests require a linked account before database records are returned. In live/staging mode, `CALACOT_APP_URL` must use HTTPS so the verification link is reachable by the customer. Invalid verification configuration or a lookup/document preparation failure commits a deduplicated human handoff and a plain-text acknowledgement through the same leased outbox. Staff can inspect the request in the inbox; customer replies never contain internal error details. No-result lookups return an explicit message with a team-assistance option.

1. Review and apply the additive active Drizzle migrations `0002_care_menu_state`, `0003_care_capture_status`, and `0004_care_menu_commands` with `npx drizzle-kit migrate`. They add persistent state and invoker commands to the existing unified database. They have been tested locally but have not been applied to production during this refactor. `customer-care:migrate` is the historical installer, not the command for this new history.
2. Configure the menu rollout separately from sales notifications:

```env
CUSTOMER_CARE_ENABLED=true
CUSTOMER_CARE_MODE=menu
CUSTOMER_CARE_NOTIFICATION_MODE=capture
CUSTOMER_CARE_SESSION_MINUTES=30
CUSTOMER_CARE_SEND_ALLOWLIST=
```

`capture` persists payloads under private `tmp/customer-care-capture` and marks them captured, never sent. `staging` records payloads and permits only the listed test phone numbers; `live` permits eligible customers. Purchase notifications use their existing transport/configuration. Sales invoice/confirmation notifications retain their independent `SALES_NOTIFICATION_MODE`; capture of conversational replies does not override the sales worker's send mode.

3. Set the exact existing `CALACOT_CLERK_ORG_ID`, verified `WHATSAPP_BUSINESS_ACCOUNT_ID`, transport/webhook settings, and public HTTPS `CALACOT_APP_URL`. Keep the existing authenticated customer-care worker schedule running. Interactive messages are sent only within the verified inbound service window; outside it, care replies stop rather than use an unapproved template. Existing approved sales/purchase template workflows remain separate.
4. In Sanity's Customer care company profile → Business units, add optional **Approved WhatsApp menu summary** text, at most 650 characters, without embedded URLs. Review and publish the profile with `approvalStatus=approved`. Existing descriptions of 650 characters or less are used as a fallback. Publishing the schema alone does not approve or publish content. No Sanity content was invented or published by this refactor.

## Menus and ownership

The six top-level options lead to services, project enquiry, quotations, invoices, purchases and human assistance. Each submenu has Back and Main menu; text `menu`, `back` and `cancel` navigate. Free text is accepted only during name, project-brief and purchase-reference steps. Project enquiries use the existing `care_requests` lead intake and staff queue, with job uniqueness; they do not create an agreed project or quotation. Outstanding invoices show up to three matching records and use the existing allocation/credit/completed-refund ledger expression.

All private records require the existing authenticated account link, valid for 24 hours. Unknown/shared numbers receive no private data until an account owner explicitly approves the short-lived link. A phone, email, name or document reference alone is never ownership proof. Verification-link issuance is bounded; unlink revokes access. Sales clients must have a separately verified `clients.clerk_user_id` relationship to that account; phone/email matching does not populate it. Purchases retain their existing Clerk ownership checks.

Latest quotations are ordered by actual sent time and stable version ID, including the newest unavailable version rather than silently falling back to an older one. Drafts are excluded. Each review exposes the exact private version's PDF/scope/terms, and creates opaque options stored in server-side conversation state. The explicit Confirm this quote selection is bound to that version, authenticated account, session revision and five-minute expiry. Generic “yes”, PDF viewing and menu opening cannot accept a quote.

`care_menu_commit` locks the conversation and leased job, checks context/revision/inbound order, and commits state, any enquiry/handoff, customer acceptance and durable conversational reply together. `care_customer_confirm` rechecks customer ownership and calls the existing commercial confirmation command with a customer audit actor, server timestamp and inbound reference. It does not impersonate staff. Existing quotation locks and invoice uniqueness make staff/customer acceptance converge on one initial invoice; email and WhatsApp outbox intents remain independent. It never claims email delivery, payment receipt, work commencement or a start date.

State survives worker restarts and multiple instances. Duplicate jobs reuse their existing outbound intent; older provider timestamps cannot overwrite newer state. Within equal timestamps, persisted receipt time and ID break ties. Opaque obsolete/forged IDs are rejected. Persistent human handling does not expire back to bot. Customers may send `resume` only before a staff member is assigned; an assigned staff member must explicitly use Resume bot. Handoff reasons appear in the existing staff request fields. Bot replies stop during human handling, apart from the initial acknowledgement. Status webhooks never enqueue care jobs.

Native lists are bounded to ten rows, row titles to 24 characters and bodies to 1024 characters; quote pagination reserves navigation rows. Acceptance uses an explicit interactive list selection. Provider submission uses existing transport and message records; rate-limit rejection retries are bounded, while ambiguous sends are marked uncertain and handed off instead of repeated.

## Verification

`npm run test:customer-care` exercises the actual worker with disposable PGlite and mocked providers, plus real SQL confirmation/lease/state guards. `npm run test:sales` checks preservation of the commercial pipeline and independent channels. Typecheck, lint and production build are required.

These local checks passed on 6 October 2026: customer-care tests, sales tests, typecheck, lint (quiet error check), and production build. Acceptance tests reject forged/typed/expired actions and superseded versions. Real Meta reference pages were unavailable during lookup; menus enforce conservative limits from Meta's published [interactive object reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/InteractiveObject/). Actual device/provider rendering remains part of the pending allowlisted validation.

PGlite serializes its connection, so it is not proof of independent row locking. `npm run test:customer-care:postgres` uses independent Neon HTTP requests to race staff and customer confirmation on a migrated, approved isolated target. Set `CARE_TEST_DATABASE_URL` and `CARE_TEST_DATABASE_APPROVED=true`; it never defaults to the application URL, rejects the same application endpoint, and leaves a uniquely named fixture organization/phone for inspection. This remote check and live interactive sends have not been run without an isolated target and authorized test recipient. No production migration, deployment or real customer send occurred during the refactor.
