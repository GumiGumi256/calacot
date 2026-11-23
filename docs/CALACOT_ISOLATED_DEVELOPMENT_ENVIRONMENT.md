# Isolated development environment for browser acceptance

**Status:** tooling ready and tested; the environment itself **does not exist yet**. It needs a Clerk development instance and a Neon branch created by an account owner. No such resource was created in this phase.
**Audience:** the engineer or administrator who will set up and run browser acceptance.

## 1. Why a separate environment

- The working copy's `.env.local` points at live services.
- `next dev` loads `.env`, `.env.local` and `.env.development*` automatically. Any live value not explicitly overridden would leak into a test session, and a stray action could then reach production data or send real messages.

Acceptance therefore runs:

- from a **separate git worktree** that contains only `.env.isolated`;
- against a **Clerk development instance**;
- against a **Neon branch** (or local PostgreSQL);
- with **all messaging in capture mode**.

## 2. Clerk development instance

1. In the Clerk dashboard, use (or create) the application's **Development** instance. Keys must start with `pk_test_` and `sk_test_`; the tooling refuses anything else.
2. Enable **Organizations**. Create one organization, for example "Calacot Acceptance", and note its id (`org_…`).
3. Do **not** configure production domains or webhooks on it. Leave the Clerk webhook unset; staff records are seeded directly in step 5.
4. Synthetic users and roles are created by `scripts/setup-isolated-acceptance.mjs` (section 5). Their addresses use `+clerk_test@example.com`: Clerk development instances send **no email** to these and accept the verification code **424242**.

## 3. Neon test database

1. In the Neon project, create a **branch** for acceptance, preferably from an **empty** parent or schema-only, not from production data. Alternatively use a separate Neon project.
2. Note its host (`ep-…neon.tech`). Note the **production** host(s) too: the tooling refuses those.
3. Apply the migration chain to the branch only, with `node scripts/apply-isolated-migrations.mjs .env.isolated` (after step 4). It validates the isolated file, refuses production hosts and non-empty databases, and applies the whole chain in one transaction.
4. Optionally use a local PostgreSQL instead (`localhost`), which needs no allow-list.

## 4. `.env.isolated` (in the acceptance worktree only; never committed)

```
CALACOT_ENVIRONMENT=isolated-test
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CALACOT_CLERK_ORG_ID=org_...                      # the development organization
DATABASE_URL=postgresql://...@ep-<branch>.neon.tech/neondb?sslmode=require
CALACOT_ISOLATED_DATABASE_HOSTS=ep-<branch>.neon.tech
CALACOT_PRODUCTION_DATABASE_HOSTS=ep-<production>.neon.tech   # refused if DATABASE_URL matches
CALACOT_APP_URL=http://localhost:3000
SALES_NOTIFICATION_MODE=capture                   # messages written to tmp/sales-capture, never sent
CUSTOMER_CARE_NOTIFICATION_MODE=capture
# Leave EMPTY: WHATSAPP_ACCESS_TOKEN, RESEND_API_KEY, META_APP_SECRET, SALES_SEND_ALLOWLIST,
# SANITY_API_WRITE_TOKEN, CLERK_WEBHOOK_SIGNING_SECRET, SALES_RESEND_WEBHOOK_SECRET
# Storage: leave SALES_STORAGE_* empty, or point at a test bucket listed in CALACOT_ISOLATED_STORAGE_BUCKETS.
```

Check it with `node scripts/check-isolated-env.mjs .env.isolated`. Only variable names are printed, never values. The checker refuses to open `.env` or `.env.local`.

## 5. Procedure

```
git worktree add ../calacot-acceptance dev/accounting-phase-2c-2f     # no .env files are copied
cd ../calacot-acceptance && npm ci
# create .env.isolated here (section 4)
node scripts/check-isolated-env.mjs .env.isolated
node scripts/apply-isolated-migrations.mjs .env.isolated              # empty branch only
node scripts/setup-isolated-acceptance.mjs .env.isolated              # dry run: prints the plan
node scripts/setup-isolated-acceptance.mjs .env.isolated --confirm    # creates users, roles, staff rows
node scripts/start-isolated-dev.mjs                                   # refuses if any .env/.env.local exists here
```

Synthetic user credentials are written to `tmp/acceptance-users.json`, which is git-ignored. Delete the worktree and branch when acceptance is finished.

## 6. Synthetic users

| Role | Email | Clerk role | Purpose |
|---|---|---|---|
| Administrator | calacot.admin+clerk_test@example.com | `org:admin` | All permissions; second approver where the reviewer prepared |
| Finance | calacot.finance+clerk_test@example.com | `org:finance` | Prepares journals, adjustments, statement sets, closes, migration batches, bank imports, tax computations, asset records |
| Reviewer | calacot.reviewer+clerk_test@example.com | `org:accounting_reviewer` (custom role) | Approves only. Its custom permissions are the read permissions (`accounting_read`, `banking_read`, `tax_read`, `fs_read`) and approval permissions `accounting_journal_approve`, `accounting_journal_post`, `accounting_policy_approve`, `fs_adjust_review`, `fs_approve`, `close_approve`, `year_end_approve`, `banking_reconcile_approve`, `cash_approve`, `tax_approve`, `depreciation_approve`, `migration_approve`. |
| Read-only | calacot.readonly+clerk_test@example.com | `org:viewer` | Reads accounting, banking and statements; must see no action buttons and no payroll |

Separation of duties is exercised by Finance preparing and Reviewer approving. The Administrator covers approvals of the Reviewer's own work.

## 7. How tests are kept away from production

| Path | Safeguard |
|---|---|
| Automated suites (`npm run test:safe`) | Refuses to start if the shell has live Clerk keys, messaging secrets or a remote `DATABASE_URL`. Runs each script with a scrubbed environment and skips any script that loads env files. |
| Real-PostgreSQL suites (`*-postgres.mjs`) | Each refuses any database not named its fixture **and** any host other than `localhost` |
| Isolated environment | `check-isolated-env.mjs`, `setup-isolated-acceptance.mjs` and `start-isolated-dev.mjs` all apply `scripts/test-safety.mjs`: development Clerk keys only, allow-listed non-production database host, capture-mode messaging, no live secrets |
| Scripts that load `.env.local` by design | `verify-care-menu.ts`, `verify-private-storage.mjs`, `clerk-setup-roles.mjs` and the operational `diagnose-*`, `migrate-*`, `repair-*` scripts: never run by the tooling; do not run them during acceptance |
| Older Phase 1 suites with a hard-coded remote Neon host | `verify-project-closure-postgres.mjs`, `verify-project-history-postgres.mjs`, `verify-project-task-postgres.mjs`, `verify-lead-concurrency-postgres.cjs`, `verify-client-coordination-postgres.cjs` create fixture databases on `ep-mute-mode-…neon.tech`. Not run. Confirm that this endpoint is not production before using them (risk register R20). |
