# Phase 2B: Automated Accounting Integration

**Status:** implemented and verified on isolated databases with synthetic data. **Not production-ready, not deployed, not activated.**

- No migration was run against any shared or production database. No production record, Clerk setting or external service was changed. Nothing was deployed.
- Real production posting is impossible in this phase: the rollout stage `active` is refused by a database `CHECK` constraint, and the `isolated_test` stage posts only on a database explicitly marked as a test database.
- With the migration applied and no stage approved, integration is **disabled**: nothing is captured or posted, and invoices, payments, credit notes, expenses and disbursements behave exactly as before.
- Phase 2A is still uncommitted in the working tree (see the git status at the start of this phase). Phase 2B builds on it and is also uncommitted.

Related documents: `docs/CALACOT_ACCOUNTING_EVENT_MAPPINGS.md` (events and mappings), `docs/CALACOT_ACCOUNTING_RECONCILIATION.md` (reconciliation), `docs/PHASE_2A_ACCOUNTING_FOUNDATION.md`, `docs/CALACOT_ACCOUNTING_POLICY_DECISIONS.md`.

---

## 1. Phase 2A prerequisite results

Inspected: the three Phase 2A documents, the migration history (journal 0000–0018), `0018_accounting_foundation.sql` (tables, guards, commands), `lib/accounting/*`, and the Phase 2A tests. Re-run before any Phase 2B change:

| Suite | Result |
|---|---|
| `verify-accounting-engine.mts` | PASS, 8 checks |
| `verify-accounting-db.mts` (PGlite, 0000–0018) | PASS, 24 checks |
| `verify-accounting-actions.mjs` | PASS, 9 checks |

Confirmed present and enforced in PostgreSQL: chart of accounts with two-person activation; journals with draft → submitted → approved → posted lifecycle; balanced posting gate (per currency and functional); gapless numbering inside the posting transaction; immutable posted journals; reversal journals (exact mirror, once); periods with close/reopen and closed-period refusal; two-person policy approval; append-only `accounting_events` + `audit_logs`; organization isolation by composite keys; `system` journal type and a unique source-identity index reserved for this phase. **No blocker was found.**

After Phase 2B, all Phase 2A suites still pass on the 0000–0019 chain (one Phase 2A assertion was updated deliberately, see §3), including the Phase 2A real-PostgreSQL concurrency suite (§6).

## 2. Architecture

```
 business transaction (sales_payment, sales_invoice_command, quotation confirm, expense_command, expense_disburse, ...)
   └─ AFTER trigger ─► accounting_capture_safely()  ──(same transaction)──► accounting_integration_events  (outbox, unique event_key)
                          stage 'disabled' → no-op;  error → accounting_integration_capture_failures (business tx still commits)

 operator (accounting_integration_operate) ─► processIntegrationQueue ─► accounting_integration_process(org, actor, batch)   [one transaction]
   claim: FOR UPDATE SKIP LOCKED, ordered by posting date
   per event (sub-transaction):  dependencies → policy → functional currency → open period
        correction  → accounting_journal_reverse(original)                       → posted (reversal)
        otherwise   → resolve approved mapping (most specific, then priority)    → no_effect | blocked
                    → build lines → shadow stage: accounting_shadow_lines        → shadowed
                                  → isolated test: system journal → Phase 2A posting gate → posted
        any raise   → blocked (known code, explained) | failed (unexpected; retried 1, 2, 4, 8 min)
   append-only accounting_integration_attempts row for every attempt; dependents released on success

 reads: lib/accounting/integration.ts → /admin/accounting/integration (workspace, event detail, mappings, reconciliation)
```

**Rollout stages** (`accounting_integration_settings`, proposed by one person, approved by another, versioned):

| Stage | Captures | Writes the general ledger | Where it can run |
|---|---|---|---|
| `disabled` (default) | No | No | Anywhere |
| `shadow` | Yes | **No**: proposed journals go to `accounting_shadow_lines` and are reconciled | Anywhere, including production after review |
| `isolated_test` | Yes | Yes (system journals) | **Only** on a database whose owner ran `ALTER DATABASE … SET calacot.accounting_test_database = 'on'` |
| `active` | — | — | **Refused** by `CHECK (stage <> 'active')`; lifting it is a reviewed migration after accountant sign-off |

Leaving shadow re-queues shadowed events and discards their previews (the ledger was never touched). Historical records can be captured at any enabled stage with an idempotent backfill.

## 3. Files and migrations changed

**Migration:** `drizzle-current/0019_accounting_integration.sql` (hand-written, like 0016–0018; journal entry 19). Additive except for three reviewed changes to Phase 2A objects:

1. `accounting_journal_insert_guard` and `accounting_journal_guard` are replaced. Manual-journal behaviour is unchanged. `system` journals (and reversals of them) now pass only through the integration gate (`accounting_integration_posting_allowed`: isolated-test stage + marked test database + worker transaction flag) and must match a captured, not-yet-posted event. Draft → posted is allowed for `system` (as for `reversal`); submit/discard is manual-only.
2. `accounting_events.entity_type` CHECK gains `integration_setting`, `event_mapping`, `integration_event`.
3. Eight `AFTER` capture triggers on `invoices`, `credit_notes`, `payments`, `payment_allocations`, `payment_refunds`, `payment_allocation_reversals`, `expenses`, `expense_disbursements`. They only append outbox rows and only when a stage is enabled. Phase 2A's test asserted "no accounting trigger on operational tables"; it now pins exactly these eight and asserts nothing is captured while disabled.

The `accounting_policy_versions.automatic_posting_enabled` and `multi_currency_posting_enabled` CHECKs are **unchanged** (still forced off).

New tables: `accounting_integration_settings`, `accounting_event_mappings`, `accounting_integration_events`, `accounting_integration_attempts`, `accounting_integration_capture_failures`, `accounting_shadow_lines`. New functions: catalogue, capture, process/apply, event command (retry, redate), backfill, settings propose/decide, mapping validate/propose/decide, reconciliation.

**New files**

- `lib/accounting/integration-catalog.ts` (client-safe catalogue, validator, guidance), `lib/accounting/integration.ts` (reads), `lib/accounting/integration-actions.ts` (server actions)
- `components/accounting/integration-forms.tsx`
- `app/(admin)/admin/accounting/integration/` — `page.tsx` (exception workspace), `[id]/page.tsx` (event detail), `mappings/page.tsx`, `reconciliation/page.tsx`, each with `loading.tsx` and `error.tsx`
- Tests: `scripts/verify-accounting-integration-engine.mts`, `scripts/verify-accounting-integration-db.mts`, `scripts/verify-accounting-integration-actions.mjs`, `scripts/verify-accounting-integration-concurrency-postgres.mjs`
- The three Phase 2B documents

**Modified files**

| File | Change |
|---|---|
| `drizzle-current/meta/_journal.json` | Entry 19 |
| `lib/sales/permissions.ts` | `accounting_integration_operate` (Admin, Finance; sensitive) |
| `lib/admin/roles.ts` | Finance role description |
| `lib/admin/breadcrumbs.ts` | Integration labels |
| `lib/ui/status.ts` | `integrationEvent`, `integrationStage`, `reconciliation` statuses |
| `lib/finance/context.ts` | Plain-language messages for every new error code |
| `components/accounting/shared.tsx` | "Integration" section tab |
| `components/accounting/admin-forms.tsx` | Exports the existing dialog helpers (no behaviour change) |
| `app/(admin)/admin/accounting/policy/page.tsx` | The Phase 2A "mappings (not active)" card is relabelled as a reference and points to the new mappings page |
| `scripts/verify-accounting-db.mts` | Trigger assertion updated (see above) |
| `scripts/verify-design-system.ts` | Status coverage also read from 0019 |
| `package.json` | `test:accounting:integration` |

No invoice, payment, expense, disbursement, sales or report code was changed. Invoice totals and PDF snapshots are never written.

**Permissions**

| Action | Permission | Default holders |
|---|---|---|
| View workspace, events, mappings, reconciliation | `accounting_read` | Admin, Finance, Viewer |
| Process queue, retry, re-date, capture history | `accounting_integration_operate` (new) | Admin, Finance |
| Propose rollout stage or mapping | `accounting_manage` | Admin, Finance |
| Approve/reject stage; approve/reject/retire mapping | `accounting_policy_approve` | Admin; delegable to the accountant |

Sales, project managers and members have no access. The database additionally requires an active staff mirror and refuses self-approval.

## 4. Accounting event mappings implemented

Twelve event types (nine mappable, three mechanical corrections), versioned as `calacot.event/v1` and `calacot.mapping/v1`. Details, resolution rules and the proposed (unapproved) mappings for the accountant are in `docs/CALACOT_ACCOUNTING_EVENT_MAPPINGS.md`. Key boundaries:

- **Revenue:** issuing an invoice posts nothing until an approved mapping says what it is. Deposit and milestone invoices are distinguished (`billingKind`) so deposits can go to customer deposits (2130) instead of revenue.
- **Payments:** receipt (`payment_confirmed`, Dr clearing / Cr unallocated receipts) is separate from allocation (`payment_allocated`, Dr unallocated / Cr receivables). Paying an invoice never recognizes revenue again. Overpayments remain in unallocated receipts. A confirmed payment is mapped to a clearing account by method, never assumed to be in the bank.
- **Expenses:** approval is authorization only; without an approved recognition mapping it is recorded as *no accounting effect*. Disbursements post the cost on the cash basis, or settle the liability when the approval was recognized (`expenseRecognized`), so costs are never counted twice.
- **Tax:** taxed documents require a mapping explicitly approved for taxed items.
- **Currencies:** only functional-currency events can apply; others are blocked `fx_policy_unapproved`.

## 5. Posting controls

| Control | Enforcement (database) |
|---|---|
| Balanced double entry | Phase 2A posting gate (per currency and functional); builder refuses unbalanced or single-line output |
| Organization isolation | Every table carries `organization_id`; composite foreign keys; every function filters by the verified organization |
| Immutable posted records | Phase 2A guards; system journals cannot be reversed by hand (`system_journal_reversal_denied`) |
| Valid posting periods | Gate takes `FOR SHARE` on the period; closed → `period_closed`; missing → `period_missing`; re-dating only forward with a reason (`backdating_denied`) |
| Approved mappings only | Two-person approval, accounts verified active at approval and at posting, ambiguity refused |
| Idempotent processing | Unique `event_key`; unique journal source identity; unique journal idempotency key `integration:<event_key>`; ON CONFLICT capture; replayable commands |
| Safe concurrent workers | `FOR UPDATE SKIP LOCKED` claims; per-event sub-transactions; counter row lock keeps numbering gapless |
| Proper reversal journals | Voids reverse the original system journal exactly through `accounting_journal_reverse` |
| Separation of duties | Proposer ≠ approver for stages and mappings; operator permission separate from approval permission; DB-level active staff check |
| Source traceability | Journal `(source_type, source_id, source_event)` = event identity; event stores journal id, mapping id and version, policy version; the gate refuses a system journal without a matching captured event |
| Unauthorized posting | System journal insert or posting outside the worker → `automatic_posting_disabled`; events editable only inside the worker; events, attempts and history cannot be deleted or truncated |

## 6. Exception handling

Statuses: `pending`, `posted`, `no_effect`, `shadowed`, `blocked` (needs attention, with a code), `failed` (unexpected; retried automatically 4 times with backoff, then needs a person). Nothing is ever discarded: events cannot be deleted, and a failed capture is recorded and recoverable by backfill.

The workspace (**Accounting → Integration**) shows counts by status, a "needs attention" panel grouping blocked codes with what each means and which authorized action resolves it, unresolved capture failures, and a filterable event list with links to the source document and the journal. The event page shows the captured snapshot, dependencies, shadow preview, the posted journal, mapping and policy versions, and the full append-only history (capture, every attempt, retries, re-dates, replays) with actor and worker. Actions: process waiting events, capture historical records, retry, and post in a later open period.

Dependencies are explicit (`depends_on`): an allocation waits for its receipt and invoice; a void waits for its original; a disbursement waits for its expense approval. A dependent blocked on a blocked dependency is released automatically when the dependency posts.

## 7. Test results

All on disposable databases: in-memory PGlite (PostgreSQL 17) and a throwaway PostgreSQL 17.5 (`embedded-postgres`, installed in a scratch folder outside the repository, data deleted after each run). No environment variables or real databases were used.

| Suite | Result |
|---|---|
| `verify-accounting-integration-engine.mts` | **PASS, 5 checks.** TS catalogue = SQL catalogue; TS and SQL validators agree on 15 valid and invalid mappings; guidance exists for every blocking code; source links. |
| `verify-accounting-integration-db.mts` (PGlite, 0000–0019, real sales and expense functions) | **PASS, 19 checks + migration.** Disabled by default with workflows unchanged; stage rules (two people, `active` impossible, test-database requirement, other org refused); mapping validation, versioning, immutability, two-person approval; shadow backfill of history with matched shadow reconciliation and an untouched ledger; replay into isolated test and posting exactly once with full traceability and attempt history; receipts vs allocations, partial payments, overpayment, unallocated funds, retried payment commands, no second revenue; deposit → deferred income; credit note and invoice void reversal; refund and allocation reversal with missing mapping → approve → retry; dependency release; tax requiring a taxed mapping; missing division account, USD blocked, closed period blocked, backdating refused, forward re-date with closed-period trial balance unchanged; cash-basis expenses (approval posts nothing, disbursement once, void reversal, reconciliation no effect); accrual recognition without double counting; direct-SQL attacks (forged system journal, manual reversal of a system journal, event edits and deletes, duplicate source journal inside a worker transaction, unknown staff); crash before commit (rollback) then single posting; capture failure injected → business transaction still commits → unexplained difference → backfill → posted; cross-organization denial; final sweep: every event ended posted, no-effect or a visible exception, every automatic journal traces to one event, all posted journals balanced. Outcomes: 27 posted, 2 no effect, 2 blocked (USD, missing tech account). |
| `verify-accounting-integration-actions.mjs` (real server actions and permission module; Clerk and Next stubbed) | **PASS, 7 checks.** Viewer read-only; sales and project managers no access; finance operates and proposes but cannot approve; admin all; delegated accountant approves but never their own proposal; friendly validation; disabled explanation; `active` and isolated test refused in the app; shadow workspace, event detail, reconciliation; unknown/other-org not found; cross-origin and revoked sessions write nothing; expense approval posts nothing. |
| `verify-accounting-integration-concurrency-postgres.mjs` (real PostgreSQL 17.5, overlapping connections) | **PASS, 6 checks + migration** — see §8. |
| Phase 2A suites on 0000–0019 | `test:accounting` PASS (8 + 24 + 9); `verify-accounting-concurrency-postgres.mjs` PASS (12 + migration). |
| Regressions on 0000–0019 | **PASS:** `test:sales`, `test:verification`, `verify-finance-expenses`, `verify-finance-documents`, `verify-documents-reports`, `verify-staff-admin`, `verify-phase1e-history`, `verify-quotation-catalogue`, `verify-project-team`, `verify-project-task-create`, `verify-lead-assignment`, `verify-lead-management`, `verify-dashboard`, `test:org-routing`, `test:whatsapp-consent`, `test:customer-care`, `test:design-system`. |
| Pre-existing failures (unchanged) | `verify-phase1e-static.mjs` (a submit button in `components/admin/project-team-actions.tsx`), `verify-project-workspace-db.mjs` (`cacheLife()` outside Next) and `verify-project-manager-assignment.mjs` (its Clerk fixture lacks `auth`). **All three fail identically on a clean checkout of `HEAD` (6a6bf60).** |
| `tsc --noEmit` | **PASS** (0 errors) |
| ESLint (all new and changed files) | **PASS** (0 errors, 0 warnings) |
| Production build | See §7a. |

`npm run test:accounting:integration` runs the engine, database and action suites. The concurrency suite needs an empty database named `phase2b_accounting_fixture` (it marks only that database as a test database):
`echo "<url>" | node scripts/verify-accounting-integration-concurrency-postgres.mjs`

### 7a. Build

**PASS** (`next build`, Turbopack) on an isolated copy of the working tree with no `.env` files: unreachable dummy database URL, dummy Clerk keys, public Sanity identifiers only, telemetry off, no Sentry upload. Compiled successfully; 96/96 pages generated; all 14 `/admin/accounting/*` routes present, including the four new integration routes, with the same rendering and cache profile as the Phase 2A accounting pages.

**Not run:** authenticated browser acceptance of the new pages (desktop and mobile, per role). Running the dev server would use `.env.local`, which points at the live database. The pages were verified by type-checking, lint, the design-system check, the action/read tests and the build, not visually.

## 8. PostgreSQL concurrency results (PostgreSQL 17.5)

| Scenario | Result |
|---|---|
| Business transaction open while a worker runs | The uncommitted outbox row is invisible; after commit the event is processed once |
| Two overlapping workers, 20 events | Worker B skips A's 10 locked events and claims the other 10; B then waits **only** on A (the journal-number counter row, by design for gapless numbering); after A commits, B posts; 20 journals, no duplicates, numbering gapless |
| Duplicate delivery on two connections | One event row; both re-deliveries are no-ops |
| Crash before commit (`pg_terminate_backend` on the worker) | No journal survives; event still `pending` with 0 attempts; the next run posts it once |
| Crash after commit (lost acknowledgement) | Re-running the worker and re-capturing create nothing |
| Posting vs period close | Close waits for the in-flight posting, then closes; a later event for that period is blocked `period_closed`, not backdated; trial balance balanced |

Consequence of the numbering lock: concurrent workers do not post in parallel; they serialize at the counter. Throughput is bounded by one posting transaction at a time per organization and financial year. This is the Phase 2A design choice (gapless legal numbering) and is acceptable for Calacot's volumes.

## 9. Reconciliation results

Implemented checks: invoice receivables, unallocated customer funds, recognized supplier liabilities, output tax, disbursements (traced), refunds (traced), each by organization, currency and date, against the ledger or the shadow preview. Statuses matched / explained (by listed unposted events) / unexplained. Never auto-balanced. On the synthetic data every check matched or was explained, and an injected uncaptured record was correctly reported as unexplained. See `docs/CALACOT_ACCOUNTING_RECONCILIATION.md`.

## 10. Remaining accounting-policy decisions

All Phase 2A decisions remain open (`docs/CALACOT_ACCOUNTING_POLICY_DECISIONS.md`). Phase 2B makes these concrete; each blocks the related mappings:

1. **C1 revenue recognition** per division and billing kind; treatment of deposits and milestones; how and when 2130 deposits are released to revenue (not automated).
2. **C2 receipt accounts:** confirm 1140 clearing for staff-verified receipts by method, and the later clearing to bank accounts (needs C8).
3. **C3 allocation** clearing 2140 → 1200 (proposed).
4. **C4 credit notes:** 4900 contra-revenue vs reversing the division revenue; deposit credits.
5. **C5 refunds:** a refund workflow must exist before refunds occur in production.
6. **C6 expense recognition:** cash basis (default: approval has no effect) or accrual by category/supplier, and to which liability (2110 vs 2120).
7. **C7 disbursements:** post on recording vs on reconciliation; map every verified finance account (consider sub-accounts 1120-nn) and every expense category; a category fallback, if any.
8. **Tax (E):** VAT registration and treatment; until then taxed documents stay blocked.
9. **D1–D4 multi-currency:** rate source, rate date, exchange differences, enabling multi-currency posting. Until then USD events stay blocked.
10. **Accounting dates:** confirm payment receipts use `received_at`, expense recognition uses the approval date, and disbursements use `paid_on`.
11. **G1–G4 cut-over:** which historical records to backfill vs carry as opening balances; how the backfill interacts with QuickBooks opening balances (avoid double counting).
12. **Advances and prepayments:** no workflow exists; decide categories and accounts.

## 11. Production activation blockers

1. Every decision in §10 that applies to an event type must be approved and entered as mappings by two people.
2. A reviewed migration must lift `accounting_integration_no_activation` (and decide whether `automatic_posting_enabled` in the policy becomes the switch), with its own tests. The isolated-test gate deliberately refuses production databases.
3. Shadow reconciliation must run on approved historical data in production and be signed off by the accountant (no unexplained differences, reviewed exceptions).
4. Apply and rehearse 0016–0019 on a production copy (Neon branch); re-run both concurrency suites on Neon.
5. Authenticated browser acceptance of the accounting pages per role, desktop and mobile.
6. Decide who operates the queue and how often (button today; a scheduled worker needs a service identity with an active staff mirror and `accounting_integration_operate`).
7. Drizzle snapshots: 0016–0019 have no TypeScript schema or snapshot; reconcile before the next generated migration.
8. Restrict direct database write access to the application role (triggers cannot check Clerk permissions).
9. Monitoring: alert on blocked/failed counts and unresolved capture failures.

## 12. Rollback and recovery

- **Before any posting:** revert to `disabled` by approving a `disabled` stage (two people). Capture stops immediately; captured events and shadow lines remain as history and do nothing.
- **Code rollback:** redeploy the previous build. The older code never reads the new tables. The capture triggers keep running only if a stage is enabled; set `disabled` first.
- **Schema rollback:** only before any system journal is posted. Drop the eight capture triggers first (that alone fully detaches operational tables), then the 0019 objects, and restore the 0018 versions of `accounting_journal_insert_guard` and `accounting_journal_guard`. Never drop accounting tables once journals exist.
- **Wrong mapping discovered after posting (test databases):** retire the mapping and approve a corrected version. Already-posted entries are corrected through the source document (void → reversal) or a manual adjusting journal on non-control accounts with approval; posted journals are never edited.
- **Worker crash:** nothing to do. The transaction rolls back; events stay pending; the next run continues. Re-running is always safe.
- **Capture failure:** the business transaction succeeded; run *Capture historical records* (idempotent).
- **Closed period:** re-date forward with a reason, or reopen the period through the Phase 2A reopen control.

**Phase 2B is not production-ready.** The essential verification passed on isolated databases, but activation is blocked by unapproved policies and the items above. Phase 2C has not been started.
