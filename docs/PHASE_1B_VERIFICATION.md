# Phase 1B verification — 17 November 2026

**Decision: not ready for rollout.** This report covers verification only; it does not authorize a release or production data changes.

## PostgreSQL concurrency

Created a fresh Neon project `calacot-phase1b-test` (`nameless-surf-37984380`), separate from the Calacot project, with synthetic rows and a minimal schema. Installed the actual local `lead_convert` and `sales_client` functions; the fixture uses a no-op audit function and a synthetic delay on client insertion. This was not a test of the full application schema or Clerk.

- Two same-lead calls returned the same client ID. This supports the row-lock/idempotency design for this fixture.
- Two different-lead calls with the same synthetic customer produced one client and one `possible_duplicate` rejection in both attempted runs. However, connector request dispatch did not establish that PostgreSQL executed the calls concurrently. Even a 12-second insertion delay did not prove overlap. These are not passing concurrency tests.
- Source review identifies a race: `lead_convert` locks each source lead separately, then checks for a duplicate before creating the client. Two different leads do not share a lock or unique identity constraint. Under concurrent transactions, both can observe no matching committed client. Reproduce with two independent PostgreSQL connections and an explicit barrier, then review an appropriate serialization and duplicate identity strategy. Repeat against the full migrated schema. Also test concurrent direct client creation, and matching on name, email and normalized phone. The present exact matching rules are not a uniqueness guarantee.

The test project was left in the account; a suspend request was accepted with `pending_state=idle`. Changing automatic suspension was rejected by the provider account. Confirm the endpoint is idle and decide separately whether to delete the project; no deletion was attempted.

## Assignment and Clerk

`lead_update` checks the assignee against an active `staff_memberships` row in the same organization; the lead page lists at most 100 such rows. The only application write found for the mirror is in `lib/sales/actions.ts`, in the payment-verification path. This does not establish timely synchronization when a Clerk membership is added, removed or suspended. No production database or Clerk membership was queried. Verify a dedicated test Clerk organization and mirror synchronization lifecycle, including removals and unsynced staff, before relying on assignment. Server actions do check the acting user's Clerk session and permissions, but authenticated negative tests were not run.

## Authenticated workflow and UX

Not run: no isolated Clerk test organization, test users or safely configured local authenticated app was established. Assignment, follow-up, status, new-client conversion, linking, project navigation, error/loading feedback and organization-isolation behavior therefore remain unverified in a browser. Existing PGlite tests cover SQL behavior but not authenticated user interaction. The conversion form only presents up to five duplicate matches, and the UI's generic error does not distinguish a duplicate race from other failures; verify and address as appropriate.

## Migration review

`drizzle-current/meta/_journal.json` lists 0005 and 0006 after 0004. The generated changes add nullable ownership, lead activity, follow-up fields, trigger and functions; historical ownership is not backfilled. Earlier isolated PGlite checks applied the active chain, but the actual deployment journal/schema and PostgreSQL migration path have not been checked. The migration introduces foreign keys but does not enforce a composite organization/lead or organization/assignee relationship at the database constraint level; the supplied application function enforces these checks. Review direct database privileges and alternate write paths. The activity table is append-only only by application convention.

A rollback to old application code after migration is not automatically safe: old code can write unowned records or omit the new access filters. Do not automatically drop fields, activity or CRM links. See `LEAD_OWNERSHIP_ROLLOUT.md` for the proposed evidence-based reconciliation, deployment sequencing and rollback gates.

## Isolated build

Two builds ran in a copied local workspace with a minimal dummy-only environment, capture notification modes and no repository `.env` files. First attempt failed fetching Google Fonts in the network-restricted sandbox and because the copied workspace omitted `sanity.config.ts`. After copying that local file and replacing font network responses with local mocks, Turbopack failed resolving its mocked Google font CSS module. Neither result establishes a production build outcome. A safe complete build using a correctly isolated toolchain and development-only service configuration remains required. No production service was intentionally contacted.

## Required before rollout

1. Fix or rule out the cross-lead duplicate race with independent simultaneous PostgreSQL transactions and repeat all relevant tests.
2. Verify membership synchronization and real server-side authorization using a dedicated test Clerk organization and synthetic users.
3. Run the complete authenticated desktop/mobile workflow, failure paths and cross-organization negative cases against isolated data.
4. Run the full migration chain on a disposable real PostgreSQL database, compare with the deployment schema/journal using an approved read-only process, and complete a safe build.
5. Review and approve a record-by-record historical ownership reconciliation and a release/rollback procedure; leave ambiguous records unassigned.

## Stabilization update — 17 November 2026

The user confirmed there is **no approved client identity rule** yet. The existing exact-name-or-email-or-phone condition is a possible-match heuristic and cannot safely be promoted to a uniqueness rule for legitimate people who share contact details. No concurrency remedy was introduced pending an approved identity policy.

The full `drizzle-current` 0000–0006 chain was applied to the newly created, empty `phase1b_stabilization_fixture` database in the separate Neon project `nameless-surf-37984380`, using its direct PostgreSQL connection. It created 55 tables. A synthetic historical lead inserted before 0005 retained NULL ownership. A rolled-back transaction confirmed `crm_source_links` rejects a duplicate source and rejects a destination client from a different organization. This was not a comparison with the production journal or data.

`verify-lead-concurrency-postgres.cjs` drove two independent PostgreSQL connections against that full migrated fixture. For a single lead, the second transaction was observed waiting for the first to commit and returned the same client ID. For two different leads containing the same synthetic identity, both conversion calls completed before either transaction committed; both then committed and two distinct clients were recorded. This **confirms a real concurrency defect**, not just a suspected race. The script intentionally exits nonzero when the defect is observed; the fixture is not reset. Its fixed host/database guard rejects other targets. No production migrations or data were touched.

As a partial staff safety improvement, `updateLead` now checks the selected active local staff record against Clerk's current organization membership immediately before assignment, and fails closed on missing membership or Clerk errors. `scripts/verify-lead-assignment.mjs` passed with mocked actor denial, missing local record, removed Clerk membership, provider outage, and an active membership. This does not implement synchronization, addition/removal or role-change reconciliation, handle out-of-order events, eliminate the cross-service time-of-check/time-of-use window, or prove behavior with a real Clerk development organization. The assignee list can still be stale or omit new members. The membership-sync gate remains open.

An isolated copy built with webpack and test-only Google Font mocks plus a stubbed Sanity client, exiting successfully, but emitted a handled initial design-collection error caused by the simplistic CMS fixture. It is a **fixture-assisted build**, not verification against real fonts or CMS, nor a full production deployment test. TypeScript passed; ESLint passed with 47 warnings and no errors. No authenticated test Clerk organization or users were available, so browser acceptance was not run.

Still required: approve identity semantics that preserve shared contact details, implement and review cross-lead serialization for those semantics at the relevant transaction boundary, rerun the coordinated test including client creation and conflicts, implement a reliable Clerk-authoritative synchronization/reconciliation strategy, test it with an isolated Clerk organization, run authenticated acceptance, and verify build using representative isolated CMS and fonts. Do not deploy while these gates remain open.

## Approved identity policy and coordination update — 17 November 2026

Calacot approved client identity as an existing client ID or an explicit authorized staff decision. A matching name, email or phone is a **possible match**, not proof of identity; shared contact details remain permitted. This supersedes the earlier statement that no policy was approved.

The new local migration `0007_client_creation_coordination.sql` replaces the shared `sales_client` function used by both direct creation and `lead_convert`. A transaction-scoped advisory lock serializes new client creation per organization. After acquiring it, the function recomputes the full set of possible matches using trimmed/case-folded display names and emails and exact phone values; app validation normalizes input phone numbers to E.164. Legacy stored phone formatting may still differ and needs a separate data-quality review. If the set differs from the one staff reviewed, creation fails with `client_matches_changed`. If matches exist, staff must explicitly confirm a distinct client; the client-creation audit records the reviewed IDs and decision. There is no uniqueness constraint on contact details and no automatic merge or overwrite. Edits to existing clients and writes outside the shared function do not acquire this creation lock; assess those paths and database privileges before rollout. The per-organization lock is intentionally broad and its throughput should be measured under representative load.

The prior full real-PostgreSQL fixture had already received 0000–0006. The new migration was then applied only to that isolated fixture. Two independent connections coordinated with explicit open transactions showed: same-lead retry waits and returns the same client; different leads wait and the second receives a changed-match conflict after the first commits; direct creation and lead conversion likewise coordinate; explicit distinct-client confirmation succeeds and is audited; existing-client linking, organization denial, rollback and retry passed. These tests use synthetic data and do not substitute for authenticated browser acceptance, runtime permission review, or production verification. Full-chain PGlite, existing isolated sales tests, mocked organization routing and TypeScript passed. ESLint passed with 47 warnings and no errors.

A read-only schema inspection of the default database in the Neon project named `calacot` found that `leads` does not have the ownership/assignment columns, `lead_activity`, `lead_convert`, and `client_possible_matches` are absent, and client/contact/source-link organization constraints and the unique source-lead constraint are present. A Drizzle migration journal table exists; its entries and deployment mapping were not verified. This inspection did not read customer rows or mutate the database. Migrations 0005–0007 remain subject to deployment review; none was applied to that database.

Membership reconciliation for additions, role changes, removals and missed events is **not implemented**. The previous live-Clerk assignment check remains in place, but is not sufficient to keep the selectable mirror current. An isolated Clerk development organization and users are still unavailable, so authenticated browser tests remain unperformed. The test-only webpack build uses mocked Google fonts and a stubbed Sanity client; it is not representative of real CMS/font integrations. No production rollout is approved until these gates and a reviewed deployed-journal comparison pass.

The latest isolated webpack build, using the current coordination UI/actions in the copied fixture workspace, exited 0 with mocked fonts and a stub Sanity client. It logged a handled design-collection error due to the stub's response shape; therefore it does not verify representative CMS content or production service integration. The mocked existing Clerk assignment safeguard test still passes. The isolated Neon test compute was returned to idle; the synthetic fixture remains for review and was not reset or deleted.
