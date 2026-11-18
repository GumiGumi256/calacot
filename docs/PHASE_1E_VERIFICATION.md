# Phase 1E verification: staff management, roles, permissions and company settings

Status: **stabilized and accepted in an isolated development environment; not production-ready** (see "Stabilization pass" below). No deployment, production migration, production data change, production Clerk change or production environment change was performed. Sections 1–9 describe the original Phase 1E delivery; where they differ, the stabilization pass supersedes them (for example, `org:member` no longer receives access without approval, and the scheduled reconciliation route moved to `/api/staff-sync`).

## Stabilization pass — 18 November 2026

### Fixes implemented

1. **Employee eligibility (replaces automatic `org:member` access).** A new administrator-controlled `staff_memberships.employee_eligibility` field takes the values `pending` (default), `approved` or `revoked`, and records who decided and when. A Clerk `org:member` receives **no** permissions until an administrator approves them on their staff page. Approval requires a live Clerk membership: a local record is never treated as proof. Approval cannot be self-granted, can be revoked, is audited (`staff.eligibility_approve/revoke`) and is enforced server-side in `staffContext` (`effectiveGrants`). Suspended or removed employees are denied. Named roles (Admin, Sales, Finance, Project manager, Read-only) are explicit Clerk assignments and keep their existing workflows. The directory shows "Awaiting approval".
2. **Division availability enforced in the database.** A `division_guard` trigger on `expenses`, `projects`, `leads` and `staff_memberships` rejects new records in a division disabled by approved company settings, and moves into one (`division_disabled`, with a user message in every affected action). Existing records already in a disabled division stay editable. With no saved settings, every division is available. Client `department` is not covered.
3. **Sensitive reads re-verify Clerk.**
   - A set of sensitive permissions (finance, staff, settings, payment accounts, delivery operations) triggers a live membership check.
   - The check runs for any request that needs one of those permissions **or** whose session grants include one. That covers the dashboard, project workspace and client balances for finance/admin/viewer users.
   - A successful check is cached per server instance for 30 seconds. During a Clerk outage, reads accept a check up to 5 minutes old.
   - Mutations always re-check fresh and fail closed.
   - Membership changes made in the app invalidate the cache at once.
   - Sales, project-manager and employee sessions without sensitive grants make no extra Clerk calls; Sales holds `invoices_read`, so it does make one cached check.
4. **Development roles configured.** I reviewed `scripts/clerk-setup-roles.mjs` (refuses non-`sk_test_` keys, requires `--confirm`, idempotent). It failed at first because permission keys were passed where Clerk expects permission ids; that field is now omitted, and roles are added to the initial role set. It then created `org:sales`, `org:finance`, `org:project_manager` and `org:viewer` in the **development** instance. Assignment of `org:finance` was verified. Production Clerk was not touched.
5. **Defect found by browser acceptance: submit buttons that never submitted.** The Base UI `<Button>` defaults to `type="button"`. Forms that relied on `<Button name=… value=…>` without `type="submit"` silently did nothing. Affected:
   - **Phase 1C:** milestone create/save/submit/approve/reject.
   - **Phase 1D:** expense submit/withdraw/cancel/approve/return/reject; payment-account deactivate.
   - **Phase 1E:** settings approve/reject; invitation revoke.

   Fixed with an explicit `type="submit"`; guarded by `scripts/verify-phase1e-static.mjs`. Action-level tests could not detect this.
6. **Defect found by integration testing: scheduled reconciliation route unreachable.** The proxy's tenant pattern `/{slug}/admin/...` matched `/api/admin/staff-sync` (slug `api`) and redirected it to sign-in. The route moved to **`/api/staff-sync`**, guarded by the same static check.

Migration `drizzle-current/0012_staff_eligibility_divisions.sql` (follows 0011; additive): eligibility columns with CHECKs (`pending` default, decision fields), `staff_set_eligibility`, `division_enabled`, `division_guard` and four triggers.

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Passed |
| `npx eslint` | 0 errors, 48 warnings (unchanged pre-existing) |
| `verify-staff-admin.mjs` | **17/17**: adds eligibility (unapproved member denied, cannot self-approve, approval grants only staff capabilities, revocation, an approved local record without Clerk membership refused, cannot approve a non-member), disabled divisions (expense, project, lead and staff rejected; historical records editable), and live read verification (stale finance claim refused, no Clerk calls for non-sensitive staff, one cached call across finance reads, outage grace for reads with mutations failing closed, removal invalidates at once) |
| `verify-clerk-webhook-signature.mjs` (**real** `@clerk/nextjs/webhooks` `verifyWebhook`, Standard Webhooks signatures) | Passed: valid accepted, tampered body, wrong secret and stale timestamp rejected (and not recorded), duplicate delivery acknowledged without reprocessing, 503 when unconfigured |
| `verify-phase1e-history.mjs` | Passed: 0000–0010 plus synthetic historical staff/projects/expenses, then 0011–0012: rows preserved, safe defaults, legacy suspension valid, historical disabled-division records editable |
| `verify-phase1e-static.mjs` | Passed (submit buttons; API routes clear of the proxy tenant pattern) |
| **Real Neon PostgreSQL** (`phase1e_acceptance_fixture` in the separate `calacot-phase1b-test` project) | Chain **0000–0012** applied in one transaction on an empty database |
| Real local PostgreSQL 17.5 two-connection suites (admin and finance concurrency) | Passed (earlier in this phase, chain through 0011) |
| `verify-finance-expenses` 17/17, `verify-finance-documents`, `verify-staff-reconciliation`, `verify-lead-assignment`, `verify-project-manager-assignment`, Phase 1C project suites, `verify-dashboard`, `verify-lead-management`, `npm run test:sales` (6), `npm run test:customer-care` (exit 0), `npm run test:org-routing` | Passed. `verify-finance-expenses`' mock was updated to honor the fresh live-check mode |
| Isolated `next build --webpack` (dummy configuration) | Exit 0, 49/49 pages, including `/api/staff-sync` |

### Browser acceptance (isolated development environment)

Environment:
- Local dev server on port 3123, run from the isolated source copy (another developer server was already running from the main folder and was not touched).
- **Neon fixture** database (`phase1e_acceptance_fixture`).
- **Development Clerk instance** with a new test organization, "Calacot Phase 1E Acceptance (test)" (`p1e-acceptance-…`).
- Synthetic users with `+clerk_test` addresses: admin A, admin B, finance, employee and outsider.
- Each user used a separate `*.localhost` host, so the user's own development session on `localhost` was not affected.
- Outbound email and WhatsApp were disabled (capture modes, empty provider keys).
- Recording: `phase1e-staff-acceptance.gif` (browser download).

| Scenario | Result |
|---|---|
| Administrator invitation (UI, masked confirmation) | Pass |
| Staff acceptance (the employee accepted via Clerk's own client API; outcome "accepted" shown) | Pass |
| Employee eligibility: unapproved member gets 404 on Dashboard and Expenses; after admin approval sees only Expenses ("My requests") and can save a draft; refused on Projects, Payments, Staff, Settings and Reports | Pass |
| Role change Finance → Read-only (Clerk updated, audited as change and sync); Financial reports refused immediately, viewer reads still allowed | Pass |
| Revocation: removed user, still signed in, gets 404 on Payments and Expenses at once | Pass |
| Suspension: suspended employee (still a Clerk member) gets 404 | Pass |
| Unauthorized access: outsider (signed in, not a member) gets 404 on dashboard/staff/settings with no data leaked; `/admin` redirects to organization selection | Pass |
| Company settings: non-payment change applied immediately as version 1 (only changed sections recorded); payment change became a proposal; the proposer sees no approve control; **the second administrator approved it** (after the button fix) as version 2 | Pass |
| Concurrent changes: two administrators editing settings from the same version; the second is told the settings changed | Pass |
| Audit history (staff page and settings history) shows actor, time, reason and before/after | Pass |
| Scheduled reconciliation on real Clerk and Neon: no secret 401, wrong secret 401, valid secret `{"ok":true,"reconciled":4}` | Pass (after moving the route) |
| Desktop rendering | Pass |
| Mobile, measured in a 375px same-origin frame (the window could not be resized): no page-level horizontal overflow on Staff, Staff member, Settings or Expenses; wide tables scroll in their container | Pass. A few text links and checkboxes are under 24px tall (WCAG 2.5.8 target size), a minor follow-up |

### Remaining blockers and observations

- **Real Clerk → webhook delivery was not exercised.** That needs a public URL, a Clerk webhook endpoint and its signing secret. Signature validation was tested with real signatures, and idempotency/failure recovery with the route code.
- **Soft 404s:** routes with `loading.tsx` (Staff, Settings, Financial reports, Payment accounts, expense/project detail) answer denied requests with HTTP 200 and render the not-found page (`noindex`, no data). That is a Next.js streaming behavior. Moving the authorization check into a route `layout.tsx` would give a 404 status.
- The read-verification cache is per server instance: a change made directly in the Clerk dashboard can take up to 30 seconds to reach reads on other instances (mutations are immediate). Webhook delivery would shorten this.
- Assignment pickers (leads, tasks) list active staff without checking employee eligibility; unapproved members can still be assigned work, though they cannot sign in to see it.
- The production Clerk instance's roles were not inspected. The production roles, webhook and secrets are still to be configured.

### Required Clerk configuration (production, via an approved change)

1. Create roles `org:sales`, `org:finance`, `org:project_manager` and `org:viewer` (no system permissions required) and include them in the organization's role set.
2. Add a webhook endpoint `https://<domain>/api/webhooks/clerk` for `organizationMembership.created`, `organizationMembership.updated` and `organizationMembership.deleted`; set `CLERK_WEBHOOK_SIGNING_SECRET`.
3. Set `STAFF_SYNC_SECRET` (32+ characters) and schedule `POST /api/staff-sync` (for example every 15 minutes) with `Authorization: Bearer <secret>`.

### Production rollout precautions

- Close the Phase 1B–1D gates first; deploy 0002–0012 in order after a rehearsal on a production copy, plus a verified backup.
- **Before** deploying, review all `org:member` users. After deployment they have no access until approved; previously they also had none, so nobody loses access. Approve real employees deliberately.
- Disabling a division takes effect immediately for new records across expenses, projects, leads and staff assignments.
- Keep at least two administrators, so payment-instruction proposals can be approved.
- Rollback: older code ignores eligibility, suspension and division triggers. Remove or suspend people in Clerk before any rollback, and leave the additive columns, functions and triggers in place (the triggers keep enforcing divisions for any writer).

### Access-pending holding page (added after the stabilization pass)

Invited members who cannot use the admin system yet now land on **`/access-pending`** instead of a bare 404.
- **Awaiting approval:** a Clerk `org:member` not yet approved as an employee.
- **Awaiting a role:** a Clerk role with no admin access.
- **Access paused:** suspended, or employee approval revoked.

The page shows only the visitor's own name, email and status, a "What happens next" list, **Check again** (re-runs `/auth/redirect`) and **Sign out**. It sits outside the admin layout, so it never renders admin navigation or data, and the marketing footer is hidden on it.

Routing: `staffAccessStatus()` (`lib/sales/permissions.ts`) classifies the visitor and the admin layout redirects only these two states. A session that already grants access is resolved without a Clerk call. Anything else is verified live. Non-members, other organizations, stale sessions of removed members and Clerk outages are told nothing and still receive a plain 404. Signed-out visitors are sent to sign-in. Users who now have access are forwarded to the admin area.

Verification: `verify-staff-admin.mjs` adds a routing group (**18/18 pass**). In the browser on the isolated development environment:
- an unapproved test member opening the admin dashboard landed on "Your account is awaiting approval";
- "Check again" returned to the same page;
- the suspended test employee saw "Your access is paused";
- neither response contained admin data;
- signed-out visitors were redirected to sign-in.

TypeScript, ESLint (0 errors), the static guard and the isolated build (exit 0) pass. Screenshot: `C:\Users\Gumis\AppData\Local\Temp\claude-chrome-screenshots-D4gbCo\screenshot-1795032958484-0.jpg`. The synthetic "outsider" test user was added to the development test organization as an unapproved `org:member` for this check.

### Development test artifacts left in place (no production impact)

- Neon database `phase1e_acceptance_fixture` (test project).
- Development Clerk organization "Calacot Phase 1E Acceptance (test)" and five `+clerk_test` users; their sessions were revoked.
- The four development roles.
- Removing them is a separate, explicit decision.

## 1. Features implemented

**Staff directory** (`/admin/staff`): live Clerk memberships merged with local profiles, with search and filters for status, role and division; counts of active, suspended and invited staff; pending invitations with revoke; and recent invitation outcomes (accepted, revoked, expired). Status shows as Active, Suspended (local denial), Removed (no longer a Clerk member) or Invited. If Clerk is unreachable, the last synced list is shown read-only and every action is disabled.

**Staff member page** (`/admin/staff/[userId]`): profile (division, job title, responsibilities) with optimistic concurrency; role change (with a required reason); suspend or lift suspension (reason required); removal from the organization (confirmation dialog and reason); and the most recent 30 administrative events. A user's own record is read-only.

**Invitation through Clerk only**: `createOrganizationInvitation` (7-day expiry). No local accounts or passwords are created; people join by accepting the Clerk invitation and signing in with Clerk.

**Membership synchronization**:
- Shared Clerk-authoritative sync core (`lib/admin/staff-sync.ts`) used by the manual refresh, the webhook and scheduled reconciliation. Every trigger re-reads Clerk, and a database-clock observation guard prevents an older read from overwriting a newer one. Detected additions, role changes and removals are audited.
- Clerk webhook `/api/webhooks/clerk` (Svix-verified via `verifyWebhook`) for `organizationMembership.created/updated/deleted`. Delivery ids are stored in `clerk_webhook_events`: processed duplicates are acknowledged without reprocessing, and failures return 500 so Svix retries. A delivery stuck in `processing` for over 2 minutes is retried. Other organizations are ignored. Event order never decides state, because Clerk is re-read.
- Scheduled reconciliation `/api/staff-sync` (Bearer `STAFF_SYNC_SECRET`, at least 32 characters) recovers missed or failed deliveries. It returns 503 until configured.

**Company settings** (`/admin/settings`): legal and trading name, TIN, business email and phone, physical address, operating division names and availability, approved payment instructions (bank and mobile money) and the default currency for new expense requests. Settings are stored as append-only versions (`company_settings_versions`):
- Changes other than payment take effect immediately. They update the `organizations` issuer source for **new** documents; issued quotation and invoice snapshots are never touched.
- **Payment-instruction changes become proposals that a different administrator must approve** (enforced in the function and by a CHECK constraint). Only one proposal can be open at a time, and other changes pause until it is decided.
- Approved instructions are used by sales quotation confirmation, the customer-care WhatsApp menu and the design-purchase page through `approvedPaymentInstructions()`. With no saved settings, the existing environment configuration is used unchanged.
- The approved tax rate, invoice due days and billing policy are shown **read-only**.
- No secret, key, database or webhook value is part of the schema, the UI or any audit event.

**Operational defaults applied**: the expense request form uses the enabled divisions (with their display names) and the default currency.

## 2. Files changed

New: `database/schema/administration.ts`, `drizzle-current/0011_staff_administration.sql` and its snapshot, `lib/admin/{roles,clerk-auth,staff-sync,staff,staff-actions,settings,settings-schema,settings-actions}.ts`, `components/admin/{staff-forms,settings-form}.tsx`, `app/(admin)/admin/staff/{page,loading,error}.tsx`, `app/(admin)/admin/staff/[userId]/{page,loading,error}.tsx`, `app/(admin)/admin/settings/{page,loading,error}.tsx`, `app/(admin)/admin/payment-accounts/{loading,error}.tsx`, `app/api/webhooks/clerk/route.ts`, `app/api/staff-sync/route.ts`, `scripts/verify-staff-admin.mjs`, `scripts/verify-admin-concurrency-postgres.mjs`, `scripts/clerk-setup-roles.mjs` (prepared, **not run**), and this document.

Modified:
- `database/schema/organization.ts`, `database/schema/index.ts`, `drizzle-current/meta/_journal.json`
- `lib/sales/permissions.ts` (new permissions, roles and local suspension denial)
- `lib/admin/staff-reconciliation.ts` (uses the shared sync core; same behavior)
- `lib/admin/navigation.ts`, `components/app-sidebar.tsx`
- `lib/finance/context.ts` (live Clerk verification on every mutation; new messages)
- `lib/finance/expenses.ts`, `components/finance/expense-form.tsx` and the expense new/edit pages (settings defaults)
- `lib/company.ts` (`approvedPaymentInstructions`)
- One-line consumer switches in `lib/sales/actions.ts`, `lib/customer-care/menu-flow.ts` and `app/account/designs/[purchaseId]/page.tsx`
- Test harness updates: `scripts/verify-staff-reconciliation.mjs` (stub for `server-only`), `scripts/verify-finance-expenses.mjs` and `scripts/verify-finance-documents.mjs` (mocks for the live membership check; a new revocation check)

## 3. Reused Clerk and staff functionality

Clerk organization membership remains the only authorization authority (`staffContext`: session, configured organization `CALACOT_CLERK_ORG_ID`, route slug, role grants and `org:calacot:*` custom permissions). The existing role mapping, `staff_memberships` mirror, observation-timestamp reconciliation (Phase 1B/1C), live Clerk checks on lead/task/manager assignment, `finance_staff()` active-mirror requirement and `audit_logs` are all reused. No competing authorization system was added.

## 4. Permissions and security controls

| Role | Clerk key | Access |
|---|---|---|
| Administrator | `org:admin` | Everything, including the new `staff_manage`, `settings_manage` and `finance_accounts_manage` |
| Sales | `org:sales` | Unchanged; plus expense requests (Phase 1D) |
| Finance | `org:finance` | Unchanged Phase 1D finance duties. **No** staff, settings or payment-account management |
| Project manager | `org:project_manager` (new mapping) | Clients/quotations/leads read, projects read/write, expense requests |
| Staff/employee | `org:member` (Clerk built-in) | Own expense requests only |
| Read-only | `org:viewer` | Unchanged read access |

- **Server-side enforcement**: every page and action calls `staffContext` with the required permission. Every staff, settings and finance **mutation** also re-reads the actor's Clerk membership (`liveStaffContext`), so a removed or demoted user is refused even while their session token is valid. It fails closed if Clerk is unreachable.
- **Local records never grant access.** A `suspended` mirror only denies (checked in `staffContext` on every request). Removed or stale mirrors have no authorization effect, and assignment remains limited to active mirrors with a live Clerk check.
- **No self-administration**: you cannot change your own role, suspend yourself or remove yourself (checked in the app and in the database).
- **No unauthorized role changes**: only administrators can grant, change or remove administrator access, even if `staff_manage` is delegated. A role must exist in Clerk before it can be assigned.
- **Last administrator protected**: demoting, removing or suspending the last active administrator is refused. Membership changes are serialized with a database lease, so two administrators demoting each other cannot both succeed.
- **Finance separation preserved**: Phase 1D no-self-approval, no-self-disbursement and recorder ≠ reconciler rules are unchanged. Payment-account registration (admin) and payment-instruction changes (two administrators) are kept away from Finance.
- **No implicit customer-care or finance-administration access**: customer care stays `org:admin`-only, and the new roles carry no finance or customer-care grants.
- **Audit**: invitation (email masked, e.g. `n***@example.com`), revocation, role change (from/to, reason), removal, suspension and reactivation (reason), profile and division changes, Clerk-detected additions/role changes/removals, and every settings update, proposal, decision and supersession. Each records the actor, entity, timestamp and request id, without secrets or unnecessary personal data.

## 5. Migrations

`drizzle-current/0011_staff_administration.sql` (follows 0000–0010) is additive:
- `staff_memberships`: nullable `job_title`, `responsibilities`, `suspended_at`, `suspended_by`, `suspension_reason`; `profile_version` (default 1); and two CHECKs that existing rows satisfy (legacy suspended rows have no `suspended_at`).
- New tables `clerk_webhook_events`, `admin_operation_leases` and `company_settings_versions` (append-only trigger; two-person CHECK for payment changes; one open proposal).
- Functions: `admin_lease_acquire/release`, `staff_profile_save`, `staff_set_status`, `company_settings_current/apply/propose/decide`, and the history guard.

No existing row is rewritten until an administrator saves settings. That first save writes the `organizations` identity fields used for future documents only.

## 6. Test results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Passed |
| `npx eslint` | 0 errors, 48 warnings (unchanged pre-existing count) |
| `scripts/verify-staff-admin.mjs` (PGlite, chain 0000–0011, stateful fake Clerk organization; real actions, routes, SQL) | **14/14 groups passed**: role matrix and duty separation; invitation, role limits, unconfigured role, masked audit, revoke; role change, Clerk update, mirror sync, audit; no escalation by stale or under-privileged sessions; last-admin protection including **concurrent mutual demotion** (separate sessions; exactly one succeeds); immediate suspension denial and self-suspension refusal; removal revokes access while the session is still valid, with history kept; lead assignment refuses suspended or removed staff; concurrent profile edits; webhook signature, duplicates, out-of-order, failure/retry, other organizations ignored; scheduled reconciliation and its secret; cross-organization denial; settings, including two-person payment approval, database-level self-approval block, Finance denied, snapshot preserved and immutable history; directory fallback when Clerk is down |
| `scripts/verify-admin-concurrency-postgres.mjs` (**real PostgreSQL 17.5**, two overlapping connections, disposable local server) | **Passed**: chain 0000–0011 applied in one transaction; overlapping settings saves on the same version leave the second stale; overlapping approve/reject leaves one decision; overlapping profile edits leave the second stale; concurrent lease acquisition gives exactly one holder |
| `scripts/verify-finance-concurrency-postgres.mjs` (real PostgreSQL, rerun on 0000–0011) | Passed (8) |
| `scripts/verify-finance-expenses.mjs` | 17/17 passed, including the new "revoked membership refused on financial mutations" check |
| `verify-finance-documents`, `verify-staff-reconciliation`, `verify-lead-assignment`, `verify-project-manager-assignment`, `verify-lead-management`, Phase 1C project suites, `verify-dashboard`, `npm run test:sales`, `npm run test:org-routing` | Passed |
| `npm run test:customer-care` (all 5 scripts) | Passed (exit 0). Its two `menu_preparation_failed` log lines also occur with the Phase 1E change reverted, so they are pre-existing test noise |
| Isolated `next build --webpack` (`tmp/phase1b-build-isolated`: dummy database and Clerk, mocked fonts, stub CMS, no `.env` files) | **Exit 0**; 49/49 pages, including `/admin/staff`, `/admin/staff/[userId]`, `/admin/settings`, `/api/webhooks/clerk` and `/api/staff-sync`. One earlier attempt ran out of memory while the disposable PostgreSQL server was running, and a later one was interrupted; the clean rerun passed. Not a representative build with real development services. |

**Defects found and fixed during verification**:
1. `company_settings_decide` had a parameter named `note` that clashed with the `note` column, so every approval or rejection failed. The parameter was renamed.
2. The same function raised an error after marking a stale proposal superseded, which rolled the update back. It now persists the outcome and returns `superseded`.

Two test-script defects (a too-short reason string and a shared mock session in the concurrency case) were also corrected.

## 7. Remaining limitations

- **Browser acceptance not run.** It needs an isolated Clerk development organization, test users and an isolated Neon database. The app's Neon HTTP driver cannot use local PostgreSQL, creating a Neon fixture database was denied by session policy, and running against `.env.local` would use the live database. Invitation emails, real webhook delivery and session refresh were therefore verified only against a fake Clerk.
- The development Clerk instance defines only `org:admin` and `org:member`. `org:sales`, `org:finance`, `org:project_manager` and `org:viewer` must be created in Clerk (dev: `node scripts/clerk-setup-roles.mjs --confirm`, which refuses live keys). Until they exist, the UI marks them "not configured in Clerk" and the server refuses to assign them. The production instance's roles were not inspected.
- **`org:member` now has access**: it receives expense-request access (Staff/Employee). Confirm that every `org:member` in the production organization is an employee before rollout.
- **Read-only pages** still rely on the Clerk session token (refreshed about every 60 seconds), so a revoked user may view pages briefly. All mutations are checked live. Lead/task/project actions from earlier phases check the actor through the session, not live; only assignees are checked live.
- Disabling a division only hides it in the expense form. Server-side rejection of disabled divisions and their use in other forms are not implemented. Document branding is limited to the issuer name, contacts and address; the logo and PDF template are unchanged.
- Webhook signing and scheduled reconciliation need `CLERK_WEBHOOK_SIGNING_SECRET`, `STAFF_SYNC_SECRET` and a scheduler (for example Vercel Cron). None are configured.
- Reconciliation handles up to 500 members per run.

## 8. Production rollout requirements

1. Close the Phase 1B–1D gates, including the deployed-database mapping and the ordered rollout of 0002–0010.
2. Create the required roles in the production Clerk instance through an approved change; review `org:member` holders.
3. Configure the Clerk webhook endpoint and its signing secret, `STAFF_SYNC_SECRET` and a reconciliation schedule; confirm `/api/webhooks/clerk` is reachable through the proxy.
4. Run browser acceptance with isolated Clerk users on an approved Neon fixture: invitation and acceptance, each role, removal, suspension, settings proposal and approval, on desktop and mobile.
5. Rehearse 0000–0011 on a representative production copy and run a manual reconciliation.
6. Agree who holds `org:admin` (at least two people, so payment-instruction changes can be approved) and record the first settings version deliberately.
7. Restrict direct execution of the new SQL functions to the application role.

## 9. Rollback considerations

- Application rollback is safe: older code ignores the new columns and tables. However, older code does **not** honor local suspension, so suspended staff would regain access through their Clerk role. Remove them in Clerk first.
- Approved payment instructions in the database would be ignored by older code, which reads environment variables. Keep the environment values identical before rolling back.
- Do not drop `company_settings_versions`, `clerk_webhook_events` or the new staff columns once used: they hold audit history. A database rollback needs a separately reviewed plan and the verified backup.
- Clerk changes made through the new UI (invitations, roles, removals) are not reversed by any code rollback.

Phase 1E stops here; no further phase was started.
