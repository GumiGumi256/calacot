# Calacot sales and billing

## Rebuilt database and current migration commands

The owner authorized erasing and rebuilding the current production database. The active Drizzle history is now `drizzle-current/`: a complete schema baseline followed by a custom migration installing the sales SQL functions and triggers. The older `drizzle/` files remain as historical upgrade/test fixtures; do not replay them onto the rebuilt database or use `sales:migrate` for this new history.

For future schema changes, run `npx drizzle-kit generate`, review the generated SQL, then run `npx drizzle-kit migrate`. These commands load `.env.local` before `.env` and use `DATABASE_URL_UNPOOLED` (or `DATABASE_URL`). Application/UI changes do not require a database migration. SQL function/trigger changes require a new custom migration using `npx drizzle-kit generate --custom --name=<change>` and reviewed SQL; schema push does not install these services. Use the tracked migration commands for this database instead of `drizzle-kit push`.

The reset removes application records, including organization and staff membership mirrors. Configure the existing Clerk organization and recreate approved company identity/settings and staff mirrors before using sales features. Clerk identities are outside this database. Reset is a one-time operation, not a routine migration step.

Restore the required organization row with `npm run organization:setup -- "Approved legal company name"`. It uses the configured Clerk organization ID and the application's existing `DATABASE_URL`, preserves existing rows, and does not invent contact, address, tax or banking information. Missing organization setup now produces a specific error when saving a client.

The new workflow uses the existing App Router, Base UI shadcn components, TanStack Table **9**, Clerk Organizations, Drizzle/Neon HTTP, React PDF and WhatsApp transport. React Email 6 renders transactional HTML and plain text. `pdf-lib` stamps page numbers after React PDF layout because the installed renderer drops dynamic footer text. Existing purchase PDFs and provider adapters remain in place.

## Historical upgrade procedure (databases that were not reset)

The following upgrade and repair procedures describe the old migration history. They do not apply to the freshly rebuilt production database; use the Drizzle commands above there.

The public website and admin modules share the existing production database. No second database is required. Migration and diagnostic commands load `.env.local` before `.env`, prefer `DATABASE_URL_UNPOOLED`, and fall back to `DATABASE_URL`. Routine tests use local, disposable PGlite data rather than production client records. The optional remote concurrency test still requires an isolated target and should not be pointed at production.

1. Copy placeholders from `.env.example` into an appropriate local or deployment secret store. Configure `CALACOT_CLERK_ORG_ID` as the **exact** staff organization and select that organization in Clerk. Customer identities and `publicMetadata.role` grant no staff access. Until this is configured, signed-in users see a setup notice and cannot use admin services.
2. Review `drizzle/0010_sales_workflow.sql` and `drizzle/0011_client_departments.sql` and take a production backup/recovery point before applying them. `npm run sales:migrate` uses the existing application connection and requires `SALES_MIGRATION_APPROVED=true`. By default `SALES_MIGRATION_FILE=all` applies both in one transaction, assuming migration 0009 is present. The runner reconciles partially pushed schemas: matching tables/columns, named constraints/indexes and triggers are retained, and workflow functions are installed/replaced. Existing columns with incompatible types or required nullability stop the preflight. `npm run sales:migrate -- --check` performs read-only preflight. Repeated execution of the runner is tested; the original raw migration files themselves remain one-time DDL. Database functions are invoker functions, not privileged bypasses. Application authorization is checked on every entry point; restrict database credentials to trusted server deployments.
3. Seed the organization's approved legal name/contact/address/tax fields in `organizations`. No company identity or banking data is invented. Synchronize staff membership mirrors for project ownership and payment ledger actor FKs; these mirrors never authenticate users. Keep `SALES_NOTIFICATION_MODE=capture` while reviewing fixtures and historical relationships.
4. Run `npm run test:sales`, `npm run typecheck`, `npm run lint`, `npm run build`, and `node scripts/render-sales-pdfs.mjs`. Routine tests use actual PostgreSQL-compatible PGlite plus mocked providers. PGlite serializes its connection: repeated overlapping commands are tested, but this does **not** prove multi-connection row locking. `npm run test:sales:postgres` exercises independent concurrent PostgreSQL requests on a migrated isolated Neon test target. It requires `SALES_TEST_DATABASE_URL` and `SALES_TEST_DATABASE_APPROVED=true`, leaves a uniquely named fixture organization for inspection, and never uses `DATABASE_URL`. Discard the isolated database afterwards. This check has not been run without that explicit target.
5. Run `npm run sales:worker` against a local/isolated app. Preview messages are written to `tmp/sales-capture` and PDFs to `tmp/sales-private`, outside public assets. `captured` is distinct from sent/delivered. Capture mode does not change the separate pre-existing public purchase/customer-care notification modes.

### Historical migration caveat

### Drizzle push dependency error

The approved production constraint repair has now been committed. A subsequent read-only check verified all 47 planned constraints present and validated (13 uniqueness constraints and 34 foreign keys). No rows were deleted or changed. PostgreSQL-shortened identifier names are handled by verification. Sales migrations 0010/0011 were not executed as part of this repair.

If `drizzle-kit push` tries to drop `staff_memberships_org_id_uq` and PostgreSQL reports dependent foreign keys, stop the push. `npm run sales:diagnose` performs catalog-only inspection using the existing application connection; it prints constraint definitions and sales feature presence without connection credentials or client data.

The latest inspected database is missing 13 baseline uniqueness constraints and 34 baseline foreign keys, including the staff organization keys and all 14 staff references. Sales extension columns and workflow functions are also absent. The earlier intact-constraint report no longer describes the current connected schema. No database objects were changed during inspection. Do not use `DROP ... CASCADE`: it removes relationship checks. Use reviewed SQL rather than schema push; push alone also cannot install the custom workflow functions.

`npm run sales:plan-repair` compares the current catalog with the 0009 baseline and writes `docs/sales-constraint-repair.sql` and its JSON inventory. It performs no database writes. The prepared repair adds missing constraints only, restores referenced unique keys before foreign keys, validates existing data, and uses one transaction with bounded lock/statement timeouts. A duplicate or orphan causes failure and rollback; no rows are deleted or silently corrected. Existing named constraints are left untouched. The 47-constraint repair and repeated execution passed on a disposable local PGlite baseline (`npx tsx scripts/verify-sales-repair.ts`). Review the SQL, take a recovery point, and obtain explicit production execution approval before applying it. Restore baseline integrity before migrations 0010/0011; do not rerun 0009 or use CASCADE.

For the existing production database containing the 0009 commercial schema, set `SALES_MIGRATION_APPROVED=true` and `SALES_MIGRATION_FILE=all`, then run `npm run sales:migrate` when production execution is approved. This applies 0010 and 0011 together without dropping the staff constraint. Inspect any partial changes from earlier push attempts before executing. For an environment with 0010 already applied, select only 0011 as described above. No separate migration database URL is required.

The pre-existing custom migrations 0005–0007 overlap the generated migration 0008. Replaying the entire journal on an empty database fails on duplicate WhatsApp tables. No historical migration has been edited. Tests use the generated baseline 0000–0004,0008,0009. Audit and test the actual deployed migration ledger before any rollout; do not blindly replay 0008 over the custom schema.

Stage 1 adds nullable quotation project relationships and a trigger requiring projects on all new/changed quotation relationships immediately. Historical unlinked quotations cannot be sent or confirmed. Review unmatched rows using:

```sql
SELECT q.id,q.organization_id,q.client_id,q.title
FROM quotations q WHERE q.project_id IS NULL;
SELECT i.id,i.organization_id,i.client_id,i.project_id
FROM invoices i LEFT JOIN projects p ON p.organization_id=i.organization_id AND p.id=i.project_id
WHERE i.project_id IS NOT NULL AND p.client_id IS DISTINCT FROM i.client_id;
```

Backfill only a separately reviewed relationship map. Do not infer clients from shared phone/email, invent projects, create payments, or send notifications during backfills. Then apply `docs/sales-stage-two.sql` to enforce NOT NULL and validate staged constraints. Migrations retain purchase invoice numbers, intake rows, WhatsApp records, credit notes and allocations. New commercial numbers use `CAL-Q/I/P/R/C-YYYY-NNNNNN` with locked organization/type/year counters, a namespace distinct from existing purchase `CAL-INV-YYYY-random` identities. Existing purchase issuance retains its random numbering scheme; consolidation of that issuer is an explicit rollout concern, not a renumbering migration.

## Permissions

### Organization URLs and login

Sign-in/sign-up default to `/auth/redirect`. This server page checks the user's Clerk memberships, prefers the configured Calacot organization, then the active organization, then the first membership with a slug. Members navigate to `/<slug>/admin`; users without a membership navigate to `/account/designs`. Signed-in visits to `/` also enter this routing flow. Existing `/admin/...` links redirect to the current organization's slug while preserving query parameters.

Clerk's `organizationSyncOptions` activates the organization from `/<slug>/admin/...`. The proxy rejects a slug that does not match the verified active organization, including failed activation attempts, and internally rewrites to the existing admin pages. Sidebar links include the slug. The existing `CALACOT_CLERK_ORG_ID` and staff permission checks still apply: membership in another organization does not grant Calacot staff access. `npm run test:org-routing` exercises redirects, rewrites and tenant-mismatch rejection with mocked verified sessions.

Authorization derives actor/organization/role from verified Clerk server context. Reads and mutations are independently checked; hidden buttons are only presentation.

| Clerk role | Default access |
| --- | --- |
| `org:admin` | All sales permissions and legacy staff administration |
| `org:sales` | Clients/projects read-write; quote create/edit/send; invoice read |
| `org:finance` | Client/project/quote read; quote confirm; invoice read/issue/void; payment verify; notification management |
| `org:viewer` | Read clients/projects/quotes/invoices |
| Unknown / customer / basic member | None |

Optional granular custom Clerk grants use `org:calacot:<permission>` with names from `lib/sales/permissions.ts`. Configure Clerk custom permissions and relevant organization plan/features before relying on `has()`. Grant companion read permissions for forms/pickers. All counts, rows, exports and PDF queries use the verified organization. Server Actions use Next.js origin protection plus a same-host check and a durable 30 mutations/minute actor/permission limit.

## Commercial behavior

The client form separates individuals (full name and personal email/phone) from companies (required legal name, optional trading name/DBA, optional tax identifier and company contacts). A required department selector offers Estates, Architecture, Painting, Interiors and Tech. The existing display name is the trading name when supplied, otherwise the legal name for companies. Billing address is optional and collapsed. Phone fields use the installed `react-phone-number-input` country selector, defaulting to Uganda, with server validation and international normalization.

Manual internal notes and WhatsApp consent source/time fields have been removed. Historical notes and existing consent are retained by the migration; client edits preserve consent only for an unchanged phone number and clear it when the phone changes. New contacts receive no implied consent. WhatsApp confirmations continue to skip contacts without separately verified permission. Historical departments remain unassigned until staff select one; migration 0011 does not invent assignments or change issued snapshots.

Create a client with contacts, then a planned project. New quotes must use that client's eligible project with matching currency/division. Draft saves use revision compare-and-swap plus a parent lock. Tax comes only from `CALACOT_APPROVED_TAX_RATE` (default **0**, meaning no approved charge configured). NUMERIC strings and BigInt arithmetic round half away from zero per line to 2 decimal places; totals sum rounded lines and PostgreSQL independently verifies item arithmetic. Quantities allow 4 places. Both UGX and USD retain the schema's 2-place precision. Payment schedules must sum exactly to the total. The server ignores submitted totals.

Send freezes customer, issuer, scope, items, recipient, terms, brand image bytes/checksum/template, due-period and billing policy; it assigns a number and writes the email intent in the same transaction. `sent` means finalized and sending requested. Delivery is separate. Draft previews have a watermark. Accepted versions/items and issued invoices/items have database immutability guards. Later client/settings edits cannot change finalized documents.

Staff confirmation requires exact current version, valid quote, accepted-by identity, actual time, verified acceptance source and evidence/reference. It accepts that version, links the existing project, creates one initial invoice and two independent channel intents in one transaction. Repeated confirmation returns that invoice. Execution stays planned; an explicit start action records team/deposit approval evidence. No customer GET route accepts quotations; the customer acceptance portal is deferred.

Initial billing defaults to full agreed amount. Deposit mode bills the first accepted schedule entry and preserves accepted scope and items in the snapshot. Taxable deposits are blocked until an approved allocation policy is implemented; they never silently discard tax. Subsequent milestone issuance is not exposed by this release: finance must implement explicit accepted schedule keys and remaining-value caps before enabling it. Full invoices never permit automatic additional milestone billing. Payments are submitted then independently verified and allocated, with locked invoice/payment rows, currency/client relationships and available-funds checks. Balances subtract issued credits/confirmed allocations and restore completed refund reversals. Void is blocked when allocations/credits exist. Credit actions currently require an unallocated invoice; paid-document corrections require a separately reviewed refund/reversal process.

Lists use bounded server pagination (10/25/50/100), stable ID tiebreakers, literal case-insensitive substring search (`%`, `_`, `\` are escaped), allowlisted SQL identifiers, identical row/count/summary predicates and per-currency summaries. Search URLs survive refresh/navigation. Exports are bounded to 1,000 matching records and escape spreadsheet formula prefixes. Clients show possible duplicate warnings; shared contact information is not merged automatically. No bulk financial transition is enabled.

## Delivery and storage

Staging requires `SALES_SEND_ALLOWLIST` for email/phone recipients; live sends require an explicit mode change at rollout. Resend needs a verified sender/domain, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and approved `CALACOT_REPLY_TO_EMAIL`. Set provider-supplied SPF/DKIM records and an approved DMARC policy; implementation does not modify DNS. Register `/api/sales/resend-webhook` with `SALES_RESEND_WEBHOOK_SECRET`; signature verification uses raw bytes and durable, deduplicated ingestion before acknowledgement. Existing `/api/whatsapp/webhook` retains Meta signature/account validation and now durably records sales delivery events as well.

Final artifacts have deterministic private object keys, SHA-256, MIME, size and template version in existing `documents`/`document_links`. Live/staging storage uses S3 SigV4 with an HTTPS S3-compatible endpoint, private bucket and GetObject/PutObject credentials limited to `commercial/`. Capture uses local disk. Do not publish the bucket or expose object keys to clients. Share links use high-entropy derived capabilities, stored as hashes in `document_shares`, expire after 30 days, and are revocable. Keep `SALES_SHARE_SECRET` stable; rotate it only with a recovery plan. Admin PDF downloads reauthorize; clients receive PDF attachments and secure links. PDFs over 10 MiB use the explicit link fallback; total render/upload size is capped at 20 MiB. Regeneration requires a new artifact version/review; never overwrite a registered final artifact.

WhatsApp uses existing contacts/messages/transport and callback IDs. Configure and obtain approval for a utility template with four ordered body variables: client name, project name, quotation number, invoice number. Set template name, language and `WHATSAPP_PROJECT_TEMPLATE_APPROVED=true` only after approval. The copy must describe agreement confirmation/invoice availability without claiming email delivery, payment, a work start or a promised date. Consent source/time comes from the selected contact; worker rechecks global opt-out immediately before dispatch. Missing consent/phone/template produces skipped/blocked with a reason, while email continues. No free-form business-initiated fallback is used. Read Meta's current [business policy](https://whatsappbusiness.com/policy/) during provider setup.

## Worker schedule and recovery

`deployment/sales-worker.cron` invokes `npm run sales:worker` every minute. Install it or an equivalent external authenticated schedule during rollout. GET/POST `/api/sales/worker` require `SALES_WORKER_SECRET` (32+ characters). A batch claims at most 10 jobs, starts work for at most 45 seconds, and leases each job for 5 minutes using `FOR UPDATE SKIP LOCKED` and a fencing token. Providers/storage run outside business transactions. Leases are renewed before submission. Failed transient jobs use exponential jitter/backoff and Retry-After; 8 attempts exhaust to dead-letter. Periodic polling recovers missed triggers. Keep external request/runtime limits sufficient for a bounded PDF render and submission; do not rely on an after hook.

Resend submissions reuse the exact saved HTML/text/attachment/recipient payload and deterministic intent key. Application history remains authoritative beyond Resend's [24-hour key window](https://resend.com/docs/dashboard/emails/idempotency-keys). Ambiguous email attempts older than 23 hours become uncertain/manual resolution. WhatsApp ambiguous submission is never automatically repeated. Provider accepted/delivered/read are distinct; webhook ranks do not regress delivery. Bounces and complaints are separately retained and suppress future email dispatch.

| Incident | Recovery |
| --- | --- |
| Provider outage/rate limit | Let pending/failed jobs back off. Check credentials and provider status. Retry the original failed intent when safe. Do not reconfirm a quotation. |
| Missing sender/storage/share settings | Fix configuration, then use Retry failed delivery. No delivery is claimed while blocked. |
| Expired worker lease | Poller reclaims it with a new fence. A stale process cannot complete the new owner's lease. Inspect ambiguous submission markers before retrying. |
| Remote accepted / local crash | Reuse Resend payload/key within its safe window; reconcile webhook/provider IDs. WhatsApp becomes uncertain. Do not blindly retry after deduplication expiry. |
| Uncertain send | Reconcile using provider dashboard/message ID/webhook evidence. If unresolved, explicit Send again with a reason creates a new audited intent and acknowledges duplicate risk. |
| Uploaded PDF, registration interrupted | Deterministic key recovers stored bytes; registration/checksum survives retries. A checksum mismatch blocks delivery and requires operator inspection. |
| Corrected recipient | Send again with corrected email and reason creates a fresh payload and share. Retry never changes the original recipient. |
| Bounce/complaint | Inspect delivery history; correct contact under authorization. Suppression remains in force; do not bypass opt-out by retry. |

The worker emits structured `sales_delivery_result` and `sales_outbox_metrics`; mutations emit redacted error/correlation codes, PDFs emit failure IDs, webhooks emit ingestion failure codes. Configure deployment log alerts for dead/uncertain jobs, oldest pending age over 10 minutes, PDF/config failures and bounce/complaint spikes. No staff notifications or DNS changes occur during development. `/admin/deliveries` is the staff queue and per-document panels expose attempts/recovery actions. Keep raw provider errors and tokens out of UI/logs.

## Rollout gates and limits

### Verification in this workspace

`npm run test:sales` passed using isolated PGlite and captured/mocked sends. It covers relationship failures, exact rounding and query validation, draft conflicts, immutable snapshots, repeated confirmation, separate payment verification and partial balance, lease fencing, early/out-of-order webhooks, private PDF reuse and independent channel processing. PDF fixtures (one-page invoice, nine-page invoice, draft quotation) were rendered and visually inspected; invoice email HTML was inspected at desktop and 390px mobile widths. Typecheck, lint and production build passed; lint retains pre-existing warnings.

No approved isolated remote database or staff browser session was supplied. The independent PostgreSQL concurrency script is implemented but unexecuted. Live S3/provider delivery, representative deployed historical backfills, staff forms/navigation and paid-credit/refund scenarios need isolated integration validation. The legacy public purchase issuer still uses its existing random number namespace; a coordinated allocator/linking audit remains necessary before declaring the entire requested workflow complete. No production migration, deployment or live client message was performed.

Production deployment, production migration, real-client sends and provider/DNS/template configuration are separate rollout actions. Real provider/S3 integration, a selected staff Clerk organization, browser staff-session validation and true concurrent PostgreSQL tests need isolated credentials/environment. Passing a build/PGlite suite alone is not production-readiness evidence. Preserve legacy purchase numbers/links; do not reissue them during CRM reconciliation. Customer acceptance links, automatic paid-invoice replacements/refunds and change orders remain outside automatic confirmation.
