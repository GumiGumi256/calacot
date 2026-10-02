# Calacot WhatsApp customer care

## Repository findings

The application uses Next.js 16.2.1 App Router, TypeScript, Zod 4, Clerk, Neon/Postgres through Drizzle, Sanity, and existing shadcn/Base UI components. Next.js was not upgraded. The existing Meta integration in `lib/whatsapp` already verifies signatures, parses inbound messages, tracks opt-outs and service windows, sends order templates, and reconciles delivery receipts. Purchases and manual payment verification remain owned by the existing purchase workflow.

No dedicated scheduler or queue hosting configuration was present. This implementation adds a Postgres queue and an authenticated worker endpoint, suitable for an external scheduler or a persistent worker host. It does not assume a particular deployment provider or create remote infrastructure.

## Response safety

Customer replies never use `response.text` as prose. The official Google SDK produces a strict Zod-validated classification/action object. The server maps intent to permitted capabilities. A second validated selection stage is used only for relevant approved knowledge; it cannot change scope, intent, business unit or capability. This avoids depending on combined function calling and structured output support.

The model has no search, URL retrieval, code execution, arbitrary SQL, payment mutations or access-granting capability. It cannot confirm payments, amend purchases, issue refunds, share download URLs or grant design access. Customer fields are internal enquiry data, not response placeholders. Even a misclassified prompt can produce only reviewed catalogue text or validated authoritative facts, never a general-purpose answer to the unrelated request.

The immutable rules define all six business areas and the prohibited topics. `permittedAction` enforces scope, intent/action compatibility, clarification and professional handoff. Out-of-scope requests receive exactly:

> I can help with Calacot’s architectural designs, real estate, painting, interiors, software services, and customer support. What would you like help with?

Mixed requests use only the extracted Calacot portion. Ambiguous enquiries clarify. Structural calculations and professional advice hand off. Unsupported media are not fetched, transcribed or interpreted. Language requests hand off until reviewed translations are added. The initial response catalogue is English.

The renderer validates plain display fields, prices, status enums and links. Only HTTPS links on `calacot.com` or `www.calacot.com` are allowed, with no credentials, custom ports or fragments. Approved answer fields prohibit embedded URLs; use the separately reviewed `displayLink` field. Invalid display content fails closed.

## Information sources

1. The published and approved `customerCareCompanyProfile` singleton is loaded during every classified enquiry. It supplies company overview, verified locations, contacts, units, tone, hours and version. An absent or invalid profile routes to staff. Draft preparation uses existing repository service descriptions, the verified website URL and “We sell possibility.” Contacts, hours and geographic commitments must be verified by a reviewer; none are invented.
2. `customerCareKnowledge` retrieval requires published, approved, active entries with a review date, and matches both business unit and topic. Invalid entries are discarded. Up to eight relevant entries are supplied to the selection stage. Prices, availability, orders and support status bypass FAQs.
3. Design prices, package inclusions and availability use current published Sanity data with CDN and fetch caching disabled. Property results use current published available records. The repository has no individual property detail route, so results link to the real estate page. Payment instructions use the existing verified server configuration in `lib/company.ts`. Order status uses owned Postgres records; support status uses the current conversation's requests. Neither is inferred from FAQ text or the model.

## Account authorisation

Phone matching in the legacy webhook can associate an inbound message with a purchase for staff convenience. That association is **not** permission for AI order access.

For private status enquiries, the worker generates a random 256-bit link token, stores only its SHA-256 hash and sets a 15-minute expiry. The WhatsApp recipient signs into Clerk and explicitly approves the link on `/account/customer-care/link`. A GET never consumes a token. The POST consumes it atomically once and records an audit entry. The linked session expires after 24 hours.

Every order lookup joins the linked Clerk ID against `design_purchases.clerk_user_id`, checks expiry, and matches the requested reference. The reference must also appear in the current inbound message. Only purchase and payment status are returned; email, payment references, invoice details and downloadable files are never exposed. A missing or other customer's order gets the same generic response.

Treat account links as sensitive: approve only your own WhatsApp conversation, do not forward them, and redact `token` query parameters from access logs and analytics. The link route sets `Referrer-Policy: no-referrer` and disables caching. Send `unlink account` to revoke a linked session, or let staff unlink it in the inbox. Staff must also revoke links after suspected phone reassignment. New customers need no purchase or account to browse services and submit enquiries.

## Database and processing

`0007_customer_care.sql` adds `care_conversations`, `care_jobs`, `care_requests`, `care_link_tokens` and `care_audit`. It preserves existing tables. It is idempotent and is registered in the migration journal. The dedicated migration command requires the existing purchase/WhatsApp migrations to have been applied already.

When `CUSTOMER_CARE_ENABLED=true`, the signed webhook saves the inbound event using the existing atomic query, ensures a conversation exists and inserts a unique job. It acknowledges Meta only after those writes succeed. A failure returns 503. A replay heals a partially completed enqueue and never creates duplicate jobs. A Next.js `after()` callback immediately starts a bounded worker after the webhook response, so new messages do not wait for a scheduler tick. The durable queue and scheduled worker remain necessary for interrupted work and retries. Status-only events continue to use the original receipt handler. Exact greetings can use the reviewed welcome template without a model call; substantive questions still require approved content.

The worker claims jobs using `FOR UPDATE SKIP LOCKED`, a per-phone ordering guard, a lease token and a three-minute lease. Different phones may run concurrently, but messages for one phone remain serial. Infrastructure errors use bounded exponential retry, up to five claims; exhausted jobs become dead and pause the bot. Rate limits route busy conversations to staff. Model/CMS failures produce a reviewed failure response and a staff handoff rather than repeated AI attempts.

Replies are persisted in the existing WhatsApp outbox with a unique job key before sending. Atomic `queued` to `sending` claims prevent concurrent sends. A successful send or receipt is reconciled with the original delivery tracking. A timeout, ambiguous provider result or crashed `sending` attempt is never automatically resent. Staff see the uncertain status and should inspect the WhatsApp conversation/provider before sending a reviewed follow-up. Exactly-once delivery across Meta and Postgres cannot be guaranteed; avoiding ambiguous retries is intentional.

Opt-outs and the 24-hour customer-service window are checked at processing and immediately before sending. `STOP` uses the existing global opt-out behavior; subsequent ordinary messages do not silently undo that opt-out. Customer care does not send unsolicited template re-engagement outside the window. Existing order-confirmation template behavior is preserved. Bot takeover is fenced again at outbound claim time. A send already started before takeover may finish.

Enquiry, callback and handoff records are idempotent per job. Staff use the inbox to manage these records separately from purchases. The model's structured project fields are untrusted notes for staff review, not verified promises or authorisation. Decision records retain scope, intent, action and source versions, without raw model output or API keys.

## Configuration and activation

Keep these values server-side; never use `NEXT_PUBLIC_` for credentials:

```dotenv
# Start disabled; enable only after migration and content review.
CUSTOMER_CARE_ENABLED=true
GEMINI_API_KEY=your-server-side-key
GEMINI_MODEL=gemini-3.8-flash
CUSTOMER_CARE_WORKER_SECRET=at-least-32-random-characters
CUSTOMER_CARE_WORKER_URL=https://calacot.com/api/customer-care/worker
SANITY_API_WRITE_TOKEN=server-token-for-draft-preparation
```

Google's [current model catalogue](https://ai.google.dev/gemini-api/docs/models) lists `gemini-3.8-flash` as stable. This is a documented configuration example, not a hard-coded runtime default. Select a stable model available to your account and run the access/structured-output check before enabling. The installed SDK is `@google/genai` 2.26.0; implementation follows the [SDK GenerateContentConfig reference](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html) and [structured-output guide](https://ai.google.dev/gemini-api/docs/structured-output). No claim of account-specific model availability is made without an API check.

Existing `DATABASE_URL`, Clerk, Sanity project/dataset and WhatsApp access token, number ID, business account ID, app secret and webhook verification token remain unchanged. The existing payment configuration remains the source for company payment instructions. See the purchase documentation for those settings.

1. Review the code and migration, then apply `npm run customer-care:migrate` against the intended environment. For a fresh database, apply all repository migrations through the normal migration workflow first. Do not run both migration methods indiscriminately: the dedicated script does not modify Drizzle's applied-migrations ledger.
2. Configure Gemini credentials and a stable model, then run `npm run customer-care:check-model`. It verifies account access, structured output and several scope examples. It makes AI requests but sends no WhatsApp messages. Local tests require no live credentials.
3. Configure a Sanity write token only if draft preparation is needed. Use a least-privilege token and Sanity roles appropriate to your dataset. Open `/admin/customer-care/knowledge`, prepare a profile draft, then complete and approve it in Studio. The exact singleton document ID must be `customerCareCompanyProfile`. Publish it. Add knowledge entries, verify answers and sources, set a review date and version, approve, activate and publish.
4. Configure a scheduler to POST `/api/customer-care/worker` once per minute with `Authorization: Bearer <CUSTOMER_CARE_WORKER_SECRET>`. The one-shot `npm run customer-care:worker` command makes this authenticated call and can be run by a host scheduler. The endpoint processes two jobs per invocation and allows a 180-second execution budget. Ensure the host actually supports that duration. Increase invocation frequency/concurrent invocations for multiple phones after measuring queue age and provider quotas. Do not depend on Next.js `after()` for durable execution.
5. Set `CUSTOMER_CARE_ENABLED=true`, deploy, and run the staging acceptance checklist below. Keep the existing Meta webhook URL and number; there is no second webhook to register.

Missing Gemini configuration never initializes an SDK client during normal purchases, notifications or unrelated page loads. Enabled care messages fail closed into staff assistance if Gemini is unavailable. Disabling the feature stops enqueue and worker processing without changing legacy webhook persistence or order notifications. Review pending jobs before re-enabling; messages outside their own service window are skipped.

## Admin and knowledge preparation

Clerk `publicMetadata.role === "admin"` is required by the admin layout, pages, and every server action. `/admin/customer-care` shows conversations, recent messages, support requests, service-window eligibility and queue errors. Staff can take over, assign themselves, resume the bot, close conversations, revoke account links, update request status and send a reviewed catalogue or approved knowledge answer. Replies are replay-safe and always recheck opt-out/window rules. The existing purchase admin links to the inbox.

`/admin/customer-care/knowledge` prepares drafts from selected published `design`, `property`, or `designPackage` documents. The importer takes structured descriptions/inclusions, records its source and import time, and creates a new draft every time. Optional revisions reference an existing approved entry. It never changes an approved record, approves its output, or publishes. Review facts and remove stale pricing, URLs, unsupported claims and unrelated text before publication.

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

The customer care suite uses isolated PGlite, never your configured database. It verifies replay dedupe, new customers without purchases, independent phone leases, lease recovery, token expiry/replay, ownership isolation, parameterized reference lookup, opt-outs, window expiry, takeover fencing, uncertain-send protection, receipt ordering and strict rendering. Policy tests exercise every proposed action under out-of-scope input. Live model evaluations are separate and require credentials; no finite evaluation proves semantic classification perfect. The hard response boundary remains enforced even when classification is wrong.

Staging acceptance:

- Send greetings, service enquiries, a new project enquiry, callback requests and unsupported media from a number with no purchase.
- Publish an approved matching FAQ and confirm its exact answer appears; switch it to inactive/draft and confirm it cannot appear. Unpublish the profile and confirm handoff.
- Change a package price or property availability and confirm the next result uses the live value.
- Try football predictions, coding tutorials, “for Calacot research” prompts and attempts to override rules. Confirm refusal, reviewed clarification or handoff, with no answer to the unrelated topic.
- Try a mixed design enquiry and betting request; inspect that only business results appear.
- Ask for an order before linking, approve your own link, and check your order. Try a different user's reference, an expired token, a replayed token and an unlinked session.
- Repeat a signed webhook, run simultaneous workers, simulate a crashed send, opt out and attempt a staff reply outside the window. Check duplicate protection and inbox status.
- Create and pay for a test design through the existing workflow; confirm existing email, order WhatsApp templates and receipt tracking still work.

## Operations

For delivery troubleshooting, run `npx tsx scripts/diagnose-notifications.ts` and `npx tsx scripts/diagnose-delivery-endpoints.ts`. These inspect configuration, delivery records, recent Resend events, endpoint reachability and empty signed webhook authentication without sending notifications. An accepted email timestamp is not by itself a delivery receipt; inspect the provider's last event. A repeated checkout reuses an open order and does not duplicate already accepted confirmations. If no new purchase/reference appears, inspect checkout validation and server-action logs before retrying notifications.

Use `https://www.calacot.com/api/whatsapp/webhook` as the public Meta callback on the current deployment: the bare domain redirects to `www`. Verify that callback in Meta and subscribe the app/account to `messages` events. A successful empty signed authentication probe validates the route and app secret, but does not prove that Meta subscriptions, phone IDs, deployment environment variables or worker scheduling are configured. The local environment and the deployed environment must be checked separately. A published company profile with `approvalStatus: draft` is intentionally excluded; a reviewer must set it to approved and publish before substantive automated answers can work.

Monitor ready-job count, oldest ready job age, dead jobs, uncertain outbound messages and staff requests. The inbox exposes recent failures; query Postgres for longer-range metrics. Alerts should contain job IDs and error codes, not raw customer messages, credentials or model output. Provide staff coverage before enabling automated handoff. No response-time SLA is invented.

Restrict access to message transcripts, link tokens and internal enquiry data. Establish the company's approved retention period and remove expired token rows on that schedule. Before deleting conversations, account for their job/request foreign keys and any legacy purchase message retention requirements. Do not delete purchase or payment records as part of customer care housekeeping. Revoke linked sessions promptly when an account is compromised or a phone is reassigned. Rollback is `CUSTOMER_CARE_ENABLED=false`; keep the additive tables and original WhatsApp integration intact.
