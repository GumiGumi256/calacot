# Calacot WhatsApp customer care

## Repository findings

The application uses Next.js 16.2.1 App Router, TypeScript, Zod 4, Clerk, Neon/Postgres through Drizzle, Sanity, and existing shadcn/Base UI components. Next.js was not upgraded. The existing Meta integration in `lib/whatsapp` already verifies signatures, parses inbound messages, tracks opt-outs and service windows, sends order templates, and reconciles delivery receipts. Purchases and manual payment verification remain owned by the existing purchase workflow.

No dedicated scheduler or queue hosting configuration was present. This implementation adds a Postgres queue and an authenticated worker endpoint, suitable for an external scheduler or a persistent worker host. It does not assume a particular deployment provider or create remote infrastructure.

## Response safety

Automated replies are deterministic; inbound customer text is never sent to a language model. A new conversation or unrecognized message receives a WhatsApp interactive list containing Calacot service, order-status, support-status and team-handoff choices. Only an exact menu choice produces a response.

Service choices return the matching description from the published, approved `customerCareCompanyProfile` singleton. The text passes the reviewed-content validator and may include only an approved Calacot website link. Order and support status use the existing account-link authorization flow and database records. “Talk to our team” records a staff handoff. Arbitrary or unrelated text returns the menu without being answered. Unsupported media get a fixed response.

The automated flow does not use Gemini or `customerCareKnowledge` entries. Staff may use approved knowledge entries for reviewed replies in the inbox. Automated service replies are English and limited to the topics present in the menu.

## Information sources

1. The published and approved `customerCareCompanyProfile` singleton is loaded during every classified enquiry. It supplies company overview, verified locations, contacts, units, tone, hours and version. An absent or invalid profile routes to staff. Draft preparation uses existing repository service descriptions, the verified website URL and “We sell possibility.” Contacts, hours and geographic commitments must be verified by a reviewer; none are invented.
2. `customerCareKnowledge` retrieval requires published, approved, active entries with a review date, and matches both business unit and topic. Invalid entries are discarded. Up to eight relevant entries are supplied to the selection stage. Prices, availability, orders and support status bypass FAQs.
3. Design prices, package inclusions and availability use current published Sanity data with CDN and fetch caching disabled. Property results use current published available records. The repository has no individual property detail route, so results link to the real estate page. Payment instructions use the existing verified server configuration in `lib/company.ts`. Order status uses owned Postgres records; support status uses the current conversation's requests. Neither is inferred from FAQ text or the model.

## Account authorisation

Phone matching in the legacy webhook can associate an inbound message with a purchase for staff convenience. That association is **not** permission to reveal order status.

For private status enquiries, the worker generates a random 256-bit link token, stores only its SHA-256 hash and sets a 15-minute expiry. The WhatsApp recipient signs into Clerk and explicitly approves the link on `/account/customer-care/link`. A GET never consumes a token. The POST consumes it atomically once and records an audit entry. The linked session expires after 24 hours.

Every order lookup joins the linked Clerk ID against `design_purchases.clerk_user_id`, checks expiry, and matches the requested reference. The reference must also appear in the current inbound message. Only purchase and payment status are returned; email, payment references, invoice details and downloadable files are never exposed. A missing or other customer's order gets the same generic response.

Treat account links as sensitive: approve only your own WhatsApp conversation, do not forward them, and redact `token` query parameters from access logs and analytics. The link route sets `Referrer-Policy: no-referrer` and disables caching. Send `unlink account` to revoke a linked session, or let staff unlink it in the inbox. Staff must also revoke links after suspected phone reassignment. New customers need no purchase or account to browse services and submit enquiries.

## Database and processing

`0007_customer_care.sql` adds `care_conversations`, `care_jobs`, `care_requests`, `care_link_tokens` and `care_audit`. It preserves existing tables. It is idempotent and is registered in the migration journal. The dedicated migration command requires the existing purchase/WhatsApp migrations to have been applied already.

When `CUSTOMER_CARE_ENABLED=true`, the signed webhook saves the inbound event using the existing atomic query, ensures a conversation exists and inserts a unique job. It acknowledges Meta only after those writes succeed. A failure returns 503. A replay heals a partially completed enqueue and never creates duplicate jobs. A Next.js `after()` callback immediately starts a bounded worker after the webhook response, so new messages do not wait for a scheduler tick. The durable queue and scheduled worker remain necessary for interrupted work and retries. Status-only events continue to use the original receipt handler. Greetings and unrecognized text receive the interactive menu; exact service selections return only the approved matching profile description.

The worker claims jobs using `FOR UPDATE SKIP LOCKED`, a per-phone ordering guard, a lease token and a three-minute lease. Different phones may run concurrently, but messages for one phone remain serial. Infrastructure errors use bounded exponential retry, up to five claims; exhausted jobs become dead and pause the bot. Rate limits route busy conversations to staff. Model/CMS failures produce a reviewed failure response and a staff handoff rather than repeated AI attempts.

Replies are persisted in the existing WhatsApp outbox with a unique job key before sending. Atomic `queued` to `sending` claims prevent concurrent sends. A successful send or receipt is reconciled with the original delivery tracking. A timeout, ambiguous provider result or crashed `sending` attempt is never automatically resent. Staff see the uncertain status and should inspect the WhatsApp conversation/provider before sending a reviewed follow-up. Exactly-once delivery across Meta and Postgres cannot be guaranteed; avoiding ambiguous retries is intentional.

Opt-outs and the 24-hour customer-service window are checked at processing and immediately before sending. `STOP` uses the existing global opt-out behavior; subsequent ordinary messages do not silently undo that opt-out. Customer care does not send unsolicited template re-engagement outside the window. Existing order-confirmation template behavior is preserved. Bot takeover is fenced again at outbound claim time. A send already started before takeover may finish.

Handoff records are idempotent per job. Staff use the inbox to manage these separately from purchases. Customer text is not used to generate replies or stored as model output.

## Configuration and activation

Keep these values server-side; never use `NEXT_PUBLIC_` for credentials:

```dotenv
# Start disabled; enable only after migration and content review.
CUSTOMER_CARE_ENABLED=true
CUSTOMER_CARE_WORKER_SECRET=at-least-32-random-characters
CUSTOMER_CARE_WORKER_URL=https://calacot.com/api/customer-care/worker
SANITY_API_WRITE_TOKEN=server-token-for-draft-preparation
```

Existing `DATABASE_URL`, Clerk, Sanity project/dataset and WhatsApp access token, number ID, business account ID, app secret and webhook verification token remain unchanged. The existing payment configuration remains the source for company payment instructions. See the purchase documentation for those settings.

1. Review the code and migration, then apply `npm run customer-care:migrate` against the intended environment. For a fresh database, apply all repository migrations through the normal migration workflow first. Do not run both migration methods indiscriminately: the dedicated script does not modify Drizzle's applied-migrations ledger.
2. Use a least-privilege Sanity write token only if draft preparation is needed. Open `/admin/customer-care/knowledge`, prepare or edit the profile, enter verified facts for each menu service, set `approvalStatus` to `approved`, and publish the exact singleton ID `customerCareCompanyProfile`.
3. Configure a scheduler to POST `/api/customer-care/worker` once per minute with `Authorization: Bearer <CUSTOMER_CARE_WORKER_SECRET>`. The one-shot `npm run customer-care:worker` command makes this authenticated call and can be run by a host scheduler. The endpoint processes two jobs per invocation and allows a 180-second execution budget. Ensure the host actually supports that duration. Increase invocation frequency/concurrent invocations for multiple phones after measuring queue age and provider quotas. Do not depend on Next.js `after()` for durable execution.
4. Set `CUSTOMER_CARE_ENABLED=true`, deploy, and run the staging acceptance checklist below. Keep the existing Meta webhook URL and number; there is no second webhook to register.

Gemini configuration is not required or read by the customer-care reply flow. If the published profile or a selected service description is missing or invalid, the job creates a staff handoff instead of generating a reply. Disabling the feature stops enqueue and worker processing without changing legacy webhook persistence or order notifications. Review pending jobs before re-enabling; messages outside their own service window are skipped.

## Admin and knowledge preparation

Clerk `publicMetadata.role === "admin"` is required by the admin layout, pages, and every server action. `/admin/customer-care` shows conversations, recent messages, support requests, service-window eligibility and queue errors. Staff can take over, assign themselves, resume the bot, close conversations, revoke account links, update request status and send a reviewed catalogue or approved knowledge answer. Replies are replay-safe and always recheck opt-out/window rules. The existing purchase admin links to the inbox.

`/admin/customer-care/knowledge` prepares drafts from selected published `design`, `property`, or `designPackage` documents. These approved entries are for staff-assisted replies only; automated menu replies use the company profile. The importer takes structured descriptions/inclusions, records its source and import time, and creates a new draft every time. Optional revisions reference an existing approved entry. It never changes an approved record, approves its output, or publishes. Review facts and remove stale pricing, URLs, unsupported claims and unrelated text before publication.

No arbitrary website fetcher was added. The optional import requirement is fulfilled through existing CMS content. This avoids URL/redirect/private-network exposure altogether. Neither the customer agent nor the admin importer follows customer-provided links or performs general search. If a website importer is added later, it needs a separately reviewed allowlist, redirect checks, DNS/address pinning, size limits and timeout policy before use.

## Verification

```powershell
npm run test:customer-care
npm run customer-care:diagnose
npx tsx scripts/verify-design-purchases.ts
npx tsx scripts/verify-email.ts
npx tsc --noEmit
npm run build
```

The customer care suite uses isolated PGlite, never your configured database. It verifies menu bounds and selection, out-of-scope fallback, interactive webhook parsing and delivery, replay dedupe, independent phone leases, lease recovery, token expiry/replay, ownership isolation, parameterized reference lookup, opt-outs, window expiry, takeover fencing, uncertain-send protection, receipt ordering and strict rendering.

Staging acceptance:

- Send “Hi” from a new number and confirm the interactive menu appears.
- Select each service and confirm only its published, approved profile description is returned. Remove one description and confirm that selection creates a staff handoff.
- Send arbitrary questions, unrelated topics, mixed requests and attempts to change the rules; confirm each returns the menu and no free-form answer.
- Select order status and support status; test account linking, expiry, ownership isolation, and references from another account.
- Select “Talk to our team” and confirm a handoff is recorded and the bot stops replying until staff resumes it.
- Ask for an order before linking, approve your own link, and check your order. Try a different user's reference, an expired token, a replayed token and an unlinked session.
- Repeat a signed webhook, run simultaneous workers, simulate a crashed send, opt out and attempt a staff reply outside the window. Check duplicate protection and inbox status.
- Create and pay for a test design through the existing workflow; confirm existing email, order WhatsApp templates and receipt tracking still work.

## Operations

For delivery troubleshooting, run `npx tsx scripts/diagnose-notifications.ts` and `npx tsx scripts/diagnose-delivery-endpoints.ts`. These inspect configuration, delivery records, recent Resend events, endpoint reachability and empty signed webhook authentication without sending notifications. An accepted email timestamp is not by itself a delivery receipt; inspect the provider's last event. A repeated checkout reuses an open order and does not duplicate already accepted confirmations. If no new purchase/reference appears, inspect checkout validation and server-action logs before retrying notifications.

Use `https://www.calacot.com/api/whatsapp/webhook` as the public Meta callback on the current deployment: the bare domain redirects to `www`. Verify that callback in Meta and subscribe the app/account to `messages` events. A successful empty signed authentication probe validates the route and app secret, but does not prove that Meta subscriptions, phone IDs, deployment environment variables or worker scheduling are configured. The local environment and the deployed environment must be checked separately. A published company profile with `approvalStatus: draft` is intentionally excluded; a reviewer must set it to approved and publish before substantive automated answers can work.

Monitor ready-job count, oldest ready job age, dead jobs, uncertain outbound messages and staff requests. The inbox exposes recent failures; query Postgres for longer-range metrics. Alerts should contain job IDs and error codes, not raw customer messages, credentials or model output. Provide staff coverage before enabling automated handoff. No response-time SLA is invented.

Restrict access to message transcripts, link tokens and internal enquiry data. Establish the company's approved retention period and remove expired token rows on that schedule. Before deleting conversations, account for their job/request foreign keys and any legacy purchase message retention requirements. Do not delete purchase or payment records as part of customer care housekeeping. Revoke linked sessions promptly when an account is compromised or a phone is reassigned. Rollback is `CUSTOMER_CARE_ENABLED=false`; keep the additive tables and original WhatsApp integration intact.
