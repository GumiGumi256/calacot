# Phase 1D verification: financial operations and expense management

Status: **implemented and verified locally; not production-ready.** No deployment, production migration, production data change, Clerk setting change or customer communication was performed. Authenticated browser acceptance and the production schema/journal comparison remain open (see the review update below).

## Review update — 18 November 2026 (finalization)

### Approved reference policy implemented (migration 0010)

Policy: a disbursement transaction reference is unique per **organization, payment method and, where applicable, verified provider/account**, using normalized references, with database-enforced concurrency protection.

- New `finance_accounts` registry: company bank accounts, mobile-money wallets and cheque accounts, with method, provider, account number, currency, label, and verification evidence (`verified_by_id`, `verified_at`, `verification_note`). Provider and account number are normalized (letters and digits, upper case), and duplicates within an organization and method are rejected. Identity fields are immutable (trigger); accounts can only be deactivated or reactivated, never deleted. Registration and status changes are audited.
- Registration requires a new permission, `finance_accounts_manage`. Only `org:admin` holds it by default; Finance staff do not, so the person recording payments does not also verify the accounts they pay from. It can be delegated deliberately through the Clerk custom permission `org:calacot:finance_accounts_manage`.
- `expense_disbursements.source_account_id` is required for bank transfer, mobile money and cheque, and must be empty for cash and "other". A database CHECK enforces this. A composite foreign key forces the account's method and currency to match the disbursement, and the function also requires the account to be active.
- The old `(organization, method, reference)` unique index is replaced by `expense_disbursements_account_reference_uq` on `(organization, method, coalesce(source account), normalized reference)` for non-void rows. Its unique-violation handler maps to `duplicate_disbursement_reference`.
- UI: a new **Payment accounts** page (`/admin/payment-accounts`) lets account managers register and deactivate accounts. The disbursement dialog lists only active verified accounts for the chosen method in the expense currency, and the disbursement table shows which account was used.

### Requirement review

| Requirement | Result |
|---|---|
| Expense creation, submission, approval, rejection, correction/resubmission, disbursement, reconciliation | Verified (PGlite workflow suite, real-PostgreSQL concurrency suite) |
| Approval never records payment | Verified: zero disbursements after approval, in both suites |
| Server-side permissions and no self-approval | Verified: action permission checks, the DB functions, and the `expenses_no_self_approval_check` constraint; also no self-disbursement and recorder ≠ reconciler |
| Duplicate prevention under genuinely overlapping transactions | **Verified on PostgreSQL 17.5** with two connections (details below) |
| Customer invoice and payment calculations unchanged | Verified: 0009/0010 reference no invoice, payment, allocation, credit-note, refund or `sales_*` object; no ledger file changed in this phase; ledger regression and `npm run test:sales` pass |
| Reports separate currencies and invoiced / collected / approved / paid amounts | Verified: report consistency checks per currency |
| Project-linked expenses and audit history | Verified: project division/organization validation, project summaries, history and immutability, project status untouched |
| TypeScript, lint, isolated tests, safe build | See test table |
| Migrations reviewed against active history | See "Migration compatibility" |

### Tests (finalization run)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Passed |
| `npx eslint` | 0 errors, 48 warnings (same pre-existing count) |
| `scripts/verify-finance-expenses.mjs` (PGlite, chain 0000–0010) | **16/16 groups passed**, including the new account-policy group: account required, same account and normalized reference rejected across expenses, wrong-currency or wrong-method account rejected, the same reference under another method or account accepted, inactive account rejected, cash accepted without an account, and the database CHECK blocking direct inserts that omit an account |
| `scripts/verify-finance-concurrency-postgres.mjs` | **Passed on a disposable local PostgreSQL 17.5** (`embedded-postgres`, installed outside the repository; recreated empty, chain 0000–0010 applied in one transaction). Each case holds transaction A open while B runs: same-key draft creation gives one expense; concurrent approve and reject gives one decision and the other is stale; a same-key disbursement retry gives one record; the same account and reference on two expenses has the second **blocked by the unique index, then rejected**; the same reference on different accounts proceeds without blocking and both commit; a void racing a reconcile leaves the reconciled record locked; overlapping partial payments cannot exceed the approved amount |
| `scripts/verify-finance-documents.mjs` | Passed |
| Phase 1C project suites (3), `verify-dashboard.ts`, `npm run test:sales`, `npm run test:org-routing` | Passed |
| `scripts/verify-sales-postgres.ts` | **Not run**: it uses the Neon HTTP driver and cannot connect to local PostgreSQL. Ledger regression is covered by the PGlite suite and `test:sales` |
| Isolated `next build --webpack` (`tmp/phase1b-build-isolated`: dummy database and Clerk, mocked fonts, stub CMS, no `.env` files) | **Exit 0**; all 45 pages built, including `/admin/payment-accounts` and every other Phase 1D route. An earlier attempt was interrupted when the session ended, and its rerun collided with the orphaned process ("Another next build process is already running"); the clean rerun passed. This is not a representative build with real development services. |

A first concurrency attempt failed on a defect **in the test script**: it expected the same reference on different accounts to block, but that case correctly does not block. The case was rewritten to assert non-blocking. No application defect was found.

### Migration compatibility

- Active history: local `0000`–`0008`, plus the new `0009_financial_operations` and `0010_disbursement_account_policy`. The deployed database inspected during Phase 1C recorded only `0000` and `0001`. `0002`–`0008` must be deployed and verified first.
- 0009 and 0010 are additive. They never rewrite existing rows; the only replaced objects are their own Phase 1D index, trigger function and `expense_disburse` function. The status CHECK change only widens the allowed values.
- **Deploy 0009 and 0010 together.** 0010's new CHECK is validated, so it intentionally fails if 0009 was ever used to record bank, mobile-money or cheque disbursements without an account. Such rows would need a reviewed forward fix rather than being grandfathered.
- 0009 and 0010 have only been applied to disposable PGlite and local PostgreSQL databases.

### Remaining defects and gaps

- No application defects are open from this review.
- Authenticated browser acceptance (desktop and mobile, each role) was **not run**. Clerk is a development instance, but the application's Neon HTTP driver needs a Neon fixture database, and creating one in the `calacot-phase1b-test` project was denied by the session permission policy. Running the dev server against `.env.local` would use the live database, so I did not do that.
- The accounts registry offers single-step verification by an account manager. A second-person verification step is not implemented.
- Previously listed gaps remain: no durable storage in capture mode, orphaned objects after failed uploads, no batch payments or statement import, approver may also record the payment, and pre-existing mis-encoded characters on the project page.

### Production rollout blockers

1. Phase 1B/1C gates, including the deployed-database mapping and the rollout of 0002–0008.
2. Authenticated browser acceptance against an approved Neon fixture database with development Clerk users.
3. A rehearsal of 0000–0010 on a representative copy of production data, plus `verify-sales-postgres.ts` against an approved Neon fixture.
4. Configure private object storage (non-capture mode).
5. Business sign-off on the role mapping, `finance_accounts_manage` holders and exception thresholds; register verified accounts before Finance records any bank, mobile-money or cheque payment.
6. Restrict direct execution of the finance functions to the application role.

## 1. Existing features reused

- `expenses` and `suppliers` tables (baseline 0000) remain the single expense record. No parallel request table was created.
- `documents` + `document_links.expense_id` and the `expense_receipt` document kind (already in the baseline) hold receipts and payment evidence.
- The private storage adapter in `lib/sales/storage.ts` (S3 SigV4 or local capture mode). It gained a content-type parameter (defaults to PDF, so existing PDF behaviour is unchanged) and `storePrivateObject`/`loadPrivateObject`.
- Invoice balances come only from `balanceExpression` and the overdue rule from `listBase(org, "invoices")` in `lib/sales/queries.ts`. Unallocated customer funds mirror the available-funds check already in `sales_payment()` (amount minus allocations minus completed refunds). No invoice or payment balance rule was changed.
- `staffContext()` (Clerk session, organization and role checks), `staff_memberships`, `audit_logs`, the `sales_rate_limits` table and the PL/pgSQL-per-transaction pattern used by the Neon HTTP driver.
- Existing list UI (`FilterBar`, `Pager`, tables, cards, dialogs, field components).

## 2. New functionality

**Expense requests** (`/admin/expenses`, `/new`, `/[id]`, `/[id]/edit`): authorized staff create drafts with division, optional project (filtered to the division), category, supplier (existing or new, deduplicated by name), description, business purpose, currency, amount before tax, tax and expense date. Drafts can be edited, have receipts attached, be submitted, withdrawn from review, or cancelled. Views: My requests, Needs review, Approved awaiting payment, All. Requests returned for correction show the reviewer's note and can be edited and resubmitted.

**Workflow states.** Request lifecycle uses the existing `status` column, widened with `returned`: draft, submitted (shown as "Pending review"), returned, approved, paid, rejected, void (shown as "Cancelled"). Payment and reconciliation are separate dimensions held on `expense_disbursements`; "Paid" is set only when recorded disbursements equal the approved total, and "Reconciled" is derived when every recorded disbursement is matched to a statement. Approval never creates a disbursement.

**Disbursement recording**: amount (fixed to the expense currency), method (bank transfer, mobile money, cash, cheque, other), transaction reference, payment date, responsible employee, optional evidence document and notes. Partial disbursements are supported. Disbursements can be voided with a reason before reconciliation and reconciled against a statement reference. The UI states that these are manual records, not payouts or verified bank settlements.

**Payments and Invoices pages**: a shared overview shows outstanding and overdue invoice balances per currency, payments awaiting verification, confirmed-but-unallocated funds, the most overdue invoices and the oldest unallocated payments, plus an exceptions list (verification pending more than 7 days, unallocated funds, overdue invoices). The Payments table now shows the unallocated amount and links to the client and each allocated invoice.

**Financial reports** (`/admin/financial-reports`): filters for date range (Kampala dates, capped at about 3 years), division, project and currency. Sections: confirmed receipts, completed refunds, invoices issued, credit notes, outstanding and overdue balances (as of today), approved versus paid expenses (pending review, approved/committed, approved not yet paid, disbursed, reconciled, legacy paid without records), expenses by division/category/project, lifetime project summaries and monthly activity. UGX and USD are never combined. The page states that these are operational reports, not accounting statements or profit; "recognized revenue" is explicitly shown as unavailable because there is no revenue-recognition policy or general ledger. With a division/project filter, receipts include only confirmed allocations to that scope's invoices.

**Project workspace**: per-currency pending, approved, paid, outstanding-approved and reconciled expenditure; each expense with status, paid amount and document count; and the most recent 30 financial events. Visible only with `expenses_read`. Nothing in the expense workflow changes project status, milestones or invoices.

**Exceptions on the expense list** (finance roles): paid expenses without disbursement records (legacy), disbursements unreconciled after 30 days, cash disbursements with neither reference nor evidence, and requests pending review over 7 days.

## 3. Files changed

New: `database/schema/finance.ts`, `drizzle-current/0009_financial_operations.sql`, `drizzle-current/meta/0009_snapshot.json`, `lib/finance/{options,context,actions,expenses,receivables,reports}.ts`, `components/finance/{expense-form,expense-actions,expense-status,project-expenses,receivables-panel}.tsx`, `app/(admin)/admin/expenses/new/page.tsx`, `app/(admin)/admin/expenses/[id]/{page,loading,error}.tsx`, `app/(admin)/admin/expenses/[id]/edit/page.tsx`, `app/(admin)/admin/financial-reports/{page,loading,error}.tsx`, `app/api/finance/expenses/[id]/documents/route.ts`, `app/api/finance/documents/[id]/route.ts`, `scripts/verify-finance-expenses.mjs`, `scripts/verify-finance-documents.mjs`, `scripts/verify-finance-concurrency-postgres.mjs`, this document.

Modified: `database/schema/expenses.ts`, `database/schema/index.ts`, `drizzle-current/meta/_journal.json`, `lib/sales/permissions.ts`, `lib/sales/storage.ts`, `lib/admin/{navigation,options,reads}.ts`, `lib/projects/workspace.ts`, `components/app-sidebar.tsx`, `components/admin/list-controls.tsx` (optional hidden fields), `components/sales/list-page.tsx` (optional `before` slot), `app/(admin)/admin/{expenses,payments,invoices}/page.tsx`, `app/(admin)/admin/projects/[id]/page.tsx`, `scripts/verify-project-workspace.mjs` (expected query count 9 → 11 for the two new permission-gated reads).

## 4. Database migration: `0009_financial_operations.sql`

Additive and follows local 0000–0008 (0002–0008 are themselves not yet confirmed in the deployed database; see Phase 1C notes).

- `expenses`: new nullable columns `purpose`, `requested_by_id`, `submitted_at`, `reviewed_by_id`, `reviewed_at`, `review_note`, `idempotency_key`; `version integer NOT NULL DEFAULT 1`. Status CHECK widened to add `returned` (drop and re-add in one migration transaction; no existing value becomes invalid). New: unique `(organization_id,id,currency)`, organization-scoped staff FKs, `expenses_no_self_approval_check`, `expenses_returned_check`, version check, partial unique idempotency index, requester index. The unique key was moved before the dependent FK by hand because drizzle-kit emitted it afterwards.
- New `expense_disbursements` (composite FK to the expense **and its currency**, generated `reference_normalized`, partial unique index on `(organization_id, method, reference_normalized)` for non-void rows, idempotency key unique, void/reconciliation/segregation checks) and `expense_events` (append-only history with idempotency keys).
- Triggers: `expense_events` blocks UPDATE/DELETE/TRUNCATE; `expense_disbursements` blocks DELETE/TRUNCATE and any change except one-time void or reconciliation; `expenses` locks financial fields once a request leaves draft/returned and prevents changing the requester.
- Functions (INVOKER): `finance_staff`, `finance_kampala_today`, `expense_event`, `expense_replay`, `expense_save`, `expense_command`, `expense_disburse`, `expense_disbursement_command`, `expense_attach_document`. Each also writes `audit_logs`.

Legacy rows keep `requested_by_id` NULL, so they cannot be approved through the workflow (`requester_unknown`) and are reported as "paid without disbursement record" where applicable. No existing data is rewritten.

## 5. Financial controls

- **Permissions** (new in `lib/sales/permissions.ts`): `expenses_create`, `expenses_submit`, `expenses_review` (return/reject), `expenses_approve`, `expenses_disburse` (record/void, finance evidence), `expenses_reconcile`, `finance_reports`. Built-in mapping: `org:sales` create/submit; `org:finance` all of them; `org:viewer` none of the new ones; `org:admin` everything. Clerk custom permissions `org:calacot:<name>` are honoured if configured; no Clerk settings were changed.
- **Least privilege on reads**: without `expenses_read`, staff see and download only their own requests. Reports require `finance_reports`. Every query is filtered by the session organization.
- **Segregation of duties** enforced in the database: no self-review/approval (also a CHECK constraint), no recording a disbursement against your own request, reconciler must differ from the recorder. There is no exception mechanism; adding one requires a separately approved design.
- **Concurrency and idempotency**: every command locks the expense row (lock order expense → disbursement), checks the expected version (`stale_review` / `stale_expense`) and replays completed idempotency keys from `expense_events` or the unique disbursement key. Duplicate transaction references are blocked by a pre-check and the partial unique index (race-safe).
- **Duplicate reference policy (needs business sign-off)**: references are normalized (letters and digits, upper case); one active disbursement per organization, method and reference. Cash may omit a reference. One bank transaction paying several expenses is therefore **not** supported yet.
- **Server-only writes**: browser code calls server actions or the upload route; all writes go through the functions above. Mutations check request origin and a per-user rate limit. Staff mirrors are created for verified members if missing but suspended/removed mirrors are never reactivated (unlike the older ledger helper).
- **Evidence**: PDF/JPEG/PNG/WebP detected by file signature (not the declared type), 10 MB limit, SHA-256 stored, storage key fixed to `finance/expenses/<expense>/<document>`, private no-store download with `nosniff` and a sandbox CSP.

## 6. Automated tests and results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Passed |
| `npx eslint` (whole repo) | 0 errors, 48 warnings (unchanged from before Phase 1D); changed files lint clean |
| `node scripts/verify-finance-expenses.mjs` (PGlite, full 0000–0009 chain, real actions/reads) | **Passed, 15 groups**: draft creation and retries, validation, origin check, suspended staff fail closed, submission and requester-only edits, self-approval denial (app and DB constraint), stale review after a correction cycle, simultaneous approvals produce one approval, rejection is final, unauthorized and self disbursement denied, disbursement currency/limit/reference/future-date/stale/retry rules, duplicate references across expenses, reconciliation segregation, void and immutability triggers, cross-organization denial, requester-only visibility, currency separation and report consistency, and ledger regression (balances, `sales_payment` verify/allocate, receipts, project summaries, project status untouched) |
| `node scripts/verify-finance-documents.mjs` | Passed: origin, content sniffing, eligibility, ownership, permissions, cross-organization isolation, private headers |
| `npm run test:sales` | Passed |
| `npx tsx scripts/verify-dashboard.ts` | Passed (including every navigation route having a page) |
| Phase 1C suites `verify-project-workspace-db.mjs`, `verify-project-workspace.mjs`, `verify-project-task-create.mjs` | Passed |
| Isolated `next build --webpack` (`tmp/phase1b-build-isolated`, dummy database/Clerk, mocked fonts, stub CMS) | Exit 0; all new routes compiled. Not a representative build. |
| `scripts/verify-finance-concurrency-postgres.mjs` (two real PostgreSQL connections) | **Not run.** Creating the isolated `phase1d_finance_fixture` database in the separate `calacot-phase1b-test` Neon project was blocked by the session's permission policy. |

PGlite is real PostgreSQL but single-connection: the "simultaneous approvals" test proves version/idempotency logic, not lock waiting. The prepared two-connection script covers reviews racing, same-key retries, duplicate references on different expenses and void-versus-reconcile races. It refuses any database not named `phase1d_finance_fixture` and migrates only an empty database.

## 7. Remaining integration gaps

- Real two-connection PostgreSQL concurrency run (above).
- Authenticated browser acceptance on desktop and mobile with isolated Clerk development users for each role (requester, reviewer, approver, finance, reconciler, viewer, cross-organization). Not run: no such identities were available.
- Storage: in `capture` mode files go to `tmp/sales-private` on local disk, which is not durable or writable on serverless hosting. Production needs `SALES_NOTIFICATION_MODE` not equal to `capture` and the private bucket configured, plus a retention policy. If the database call fails after upload, the stored object is orphaned (no cleanup job).
- Batch payments (one transaction covering several expenses), expense edits after approval, supplier management screens, report export, pagination of history beyond 100 events, and an approval-limit/threshold policy are not implemented.
- Reconciliation is a manual attestation against a statement reference; there is no bank or mobile-money statement import.
- The project page still shows pre-existing mis-encoded separator characters (from earlier phases) outside the expenditure card.
- Approver and disbursement recorder may be the same person; confirm whether the business requires that separation too.
- Phase 1B/1C open gates (staff reconciliation, deployed-database mapping, 0002–0008 rollout) still apply and come first.

## 8. Production deployment requirements

1. Close the Phase 1B and 1C gates and identify the deployed database and its journal read-only.
2. Business sign-off: role mapping above, the duplicate-reference policy, the "no self-approval, no exception" rule, the 7-day and 30-day exception thresholds and whether legacy unapproved expenses should be re-entered through the workflow.
3. Run `verify-finance-concurrency-postgres.mjs` on an approved isolated database, and rehearse 0000–0009 on a representative copy of production data (legacy expense statuses, existing documents).
4. Configure private object storage for non-capture mode and verify upload/download with a test file.
5. Complete authenticated desktop/mobile acceptance with isolated Clerk users, including accessibility checks of dialogs and forms.
6. Restrict direct database execution of the new functions to the application role.
7. Take a verified backup, apply reviewed migrations in order, then 0009, then deploy compatible application code during an approved window, and verify with authorized test records.

## 9. Rollback considerations

- Application-only rollback is safe: older code ignores the new columns and tables, and the widened status CHECK accepts all old values. Older code has no expense write path, so it cannot bypass the new triggers.
- Do not drop `expense_events`, `expense_disbursements` or the new columns once real records exist: they are the financial audit trail. Any database rollback needs a separately reviewed plan and the verified backup.
- If 0009 must be reverted before any real use, the reverse order is: functions and triggers, `expense_events`, `expense_disbursements`, then the new `expenses` constraints, indexes and columns, restoring the original status CHECK only if no row is `returned`.
- The triggers change write behaviour for any other writer to `expenses` (financial fields lock after submission). Inventory direct SQL writers before deploying.

Phase 1D stops here. The next phase was not started.
