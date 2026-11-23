# Phase 2F: accounting migration, parallel verification and production certification

**Conclusion: NOT READY FOR PRODUCTION.**

The software controls are implemented and verified on isolated databases. They pass every automated suite, every concurrency suite and an independent parallel recomputation with zero differences. But the evidence required to make it Calacot's system of record does not exist yet:

- no approved accounting policies;
- no verified opening balances or known historical source;
- no browser acceptance;
- no parallel run on Calacot's own records;
- no independent accountant review.

These cannot be produced by engineering alone. The path to activation is `CALACOT_ACCOUNTING_GO_LIVE_CHECKLIST.md`.

Nothing was deployed. No production migration was run. No production data, settings or Clerk configuration was touched, and no posting was activated.

**Audience:** management, the accountant and engineering reviewers.

## 1. Implementation audit (Phase 2A–2E)

| Area | Implementation verified | Evidence |
|---|---|---|
| Chart of accounts | Two-person approval; control accounts refuse manual journals | `test:accounting` (8 + 24 + 9) |
| Double-entry ledger | Balanced per currency and functional currency; sequential numbers; immutable posted journals; reversals only | `test:accounting`; concurrency 13 |
| Source-to-ledger posting | Event capture, rules, shadow and isolated-test stages; production can never post automatically (stage constraint) | `test:accounting:integration` (5 + 20 + 7); concurrency 7 |
| Banking reconciliation | Imports, duplicate detection, matching, finalized periods, cash counts | `test:banking` (18 + 7); concurrency 8 |
| Tax and fixed assets | Evidenced rules, computations, provisions; categories, depreciation (SQL cross-checked against a TS model), disposals | `test:tax-assets` (12 + 5 + model); concurrency 5 |
| Financial statements | Posted lines only; classification policy; snapshots | `test:statements` (13 + 6) |
| Period closing / year-end | Checklist, exceptions, separation of duties, atomic close, idempotent year-end, reopen | `test:statements`; concurrency 7 |
| Reversals and audit | Append-only event tables plus `audit_logs` on every command | All suites |

**One authoritative general ledger:** confirmed.

- Every statement, close, year-end and migration check reads `accounting_journal_lines` of posted journals only.
- `accounting_shadow_lines` (Phase 2B shadow stage) is never read by any report. It appears only per event on the integration screen.
- The opening-balance staging tables never write to the ledger.

**Migration chain:** all 25 migrations (0000–0024) apply in one transaction on PostgreSQL 17, rehearsed in 1.6 s on an empty database. Migrations 0018–0024 are additive; 0024 is new in this phase.

## 2. Regressions resolved

| Item | Root cause | Fix |
|---|---|---|
| `verify-phase1e-static` | **Real UI defect:** "Confirm removal" in the project-team form had no `type="submit"`. Base UI buttons default to `button`, so removal never submitted. | `components/admin/project-team-actions.tsx`: added `type="submit"` |
| `verify-project-workspace-db`, `verify-project-workspace` | Test harness did not stub `next/cache`, which `lib/projects/workspace.ts` uses since caching was added | Stub added; assertions unchanged |
| `verify-project-manager-assignment` | Harness stubbed `./permissions` but not the `@/lib/sales/permissions` alias imported by `lib/admin/clerk-auth.ts` | Stub extended to the alias; assertions unchanged |
| `verify-fresh-sales` | Hard-coded 55 tables and 9 sales triggers for the *whole* chain. Both were true only through `0008`; the test was already failing on the committed HEAD. | Now asserts exactly 55 tables and the 9 named sales triggers at `0008`, that the full chain applies, and that all 9 triggers survive it |
| `test:shared-documents` | Harness storage stub lacked `loadPdf` | Stub added |
| Design-system radius check | `components/sales/share-document.tsx` used raw `rounded-lg border` | Design tokens applied |
| `/shared/[token]` build failure | Request-time params and database read outside a Suspense boundary (`cacheComponents`) | Content moved into a Suspense boundary, matching `/verify/[reference]` |
| Phase 2E report performance (found in this phase) | `fs_account_balances` evaluated a per-line lookup inside a per-account join (quadratic) | Rewritten set-based. 0023 had never been applied outside test databases, so it was corrected in place. |

**Final state:**

- 55 of 55 runnable `verify-*` scripts pass.
- The full design-system check passes.
- `tsc` is clean; ESLint has 0 errors (45 pre-existing warnings).
- The isolated production build passes with **138 routes, nothing excluded**.
- All five concurrency suites pass on real PostgreSQL.

**Not run, by design:** `verify-private-storage` and `verify-care-menu` load `.env.local` and contact live storage and the live database.

**Removed in the stabilization pass:** the obsolete drafts `verify-bank-mapping-db.mts` and `verify-bank-mapping-concurrency-postgres.mjs` (they targeted a migration that never shipped; coverage lives in `verify-banking-*`).

## 3. Browser acceptance: NOT PERFORMED (blocker)

No isolated development environment exists:

- the only local environment file (`.env.local`) points at live services;
- no development Clerk identities exist;
- WhatsApp and email are not sandboxed.

Running the app would have risked production data and real messages.

**To perform it:**

1. Provide `.env.development.isolated` with: a Neon **branch** URL; a Clerk **development** instance's keys, with test users for Finance, Administrator, Reviewer (an admin delegated `close_approve` / `fs_approve`) and Viewer; email and WhatsApp disabled or sandboxed; storage pointed at a test bucket.
2. Walk through the scripted scenario: chart, policy, manual journal, integration events in shadow, statement import and reconciliation, tax computation, asset capitalization and depreciation, statements, monthly close and year-end.
3. Do this at 390 px (phone), 820 px (tablet) and 1440 px (desktop).

## 4. Accounting policies

The approval register is `CALACOT_ACCOUNTING_POLICY_REGISTER.md`, items P1–P18. **None is approved.** Nothing was approved silently: the system's safe defaults hold until two people record each decision.

## 5. Historical migration

**Finding:** the repository holds no historical accounting records. The QuickBooks source assumed in Phase 2A is unverified.

**Built (staging only), migration `0024_opening_balance_staging`:**

- batches recording their source type and evidence;
- a CSV template that keeps original identifiers;
- account mapping that refuses unknown codes;
- a 19-check reconciliation (17 blocking, 2 information-only) of the trial balance against the receivables, payables, deposit, supplier-advance, bank, asset and tax schedules;
- protection against double counting: the ledger must be empty up to the cutoff, no source events may exist before the cutoff, and no post-cutoff invoices may appear;
- two-person approval with re-validation and a row hash;
- immutable history.

There is **no function that posts staged balances.** That step is deliberately deferred to activation. Plan: `CALACOT_ACCOUNTING_MIGRATION_PLAN.md`. Evidence: `scripts/verify-migration-staging-db.mts` (5 checks).

**App:** Accounting → Opening balances. Finance prepares (`migration_prepare`); approval is administrator-only by default (`migration_approve`).

## 6. Parallel verification

**Synthetic year:** 258 journals through the real workflow, 12 controlled closes and a year-end. Every trial balance, ledger, P&L, balance sheet, cash flow, division, balance-type, retained earnings and carry-forward figure was compared with an independent TypeScript model. **0 differences.**

**Real records: not performed** (blocker). Details are in `CALACOT_PARALLEL_ACCOUNTING_RESULTS.md`.

## 7. Closing and year-end verification

| Requirement | Verified by |
|---|---|
| All journals accounted for | Parallel run (516 lines) |
| Period checks complete | Statements DB suite; parallel run |
| Unreconciled balances visible | Banking interplay test; cash-flow provisional flag |
| Material exceptions block approval | Close checklist and exception tests |
| Unique closing journals | Statements DB suite; concurrency suite (double prepare and double approve) |
| Retained earnings correct | Parallel run against the independent model |
| Reopening preserves history | Year-end reopen test (reversal kept; earlier records kept) |
| Superseded statements after corrections | Parallel run: the approved set is marked stale, then superseded on re-approval |
| Closed-period changes need authority | `close_reopen` with a reason; postings refused in closed periods (concurrency-tested) |

## 8. Performance and migration rehearsal

Throwaway PostgreSQL 17, **20,000 posted journals (40,000 lines)** loaded through the posting gate. `scripts/bench-accounting-postgres.mjs`; results in `tmp/bench-results.json`.

**Report and close times (median of 3):**

| Measure | Result |
|---|---|
| Trial balance, full year | 50 ms |
| Income statement, full year / one month / one division | 38 / 92 / 17 ms |
| Balance sheet | 104 ms |
| Cash flow, full year | 123 ms |
| Changes in equity | 201 ms |
| Division report | 201 ms |
| Statement set (all statements plus comparative) | 857 ms |
| Period-close checklist, including Phase 2B receivables reconciliation | 301 ms |
| Period-close approval (re-check plus close) | 324 ms |
| General-ledger page (100 lines at offset 5,000, running balance) | 42 ms |

**Posting and contention:**

| Measure | Result |
|---|---|
| Posting through the gate (bulk load) | 7.7 ms per journal |
| Year-end control trigger overhead | 0.17 ms per posted journal |
| 8 concurrent connections | 887 journals/s; p50 6.8 ms; p95 14 ms; max 84 ms |
| Postings into another period during a close approval | p50 6.8 ms; max 15.7 ms (no contention) |

**Migration timings** (empty database): chain 1.6 s; 0018–0024 between 31 and 262 ms each.

**Rollback:** every migration is additive. Before use, drop the new objects. After use, recover forward with reversals. See `PHASE_2E_FINANCIAL_STATEMENTS.md` §10 and the go-live checklist.

**Still to measure:** production-sized data on a Neon branch.

## 9. Accountant review

The package is `CALACOT_ACCOUNTANT_REVIEW_PACKAGE.md`. **No accountant has reviewed or approved anything.**

## 10. Production activation plan

Eight gated stages are set out in `CALACOT_ACCOUNTING_GO_LIVE_CHECKLIST.md`, with rollback and recovery. Live accounting is **not** activated.

## 11. Files changed in Phase 2F

**New:**

- `drizzle-current/0024_opening_balance_staging.sql` (journal idx 24)
- `lib/accounting/migration.ts`
- `lib/migration/{actions,reads}.ts`
- `components/migration/forms.tsx`
- `app/(admin)/admin/accounting/migration/{page,[id]/page,loading,error}.tsx`
- `scripts/verify-migration-staging-db.mts`, `scripts/verify-accounting-parallel.mts`, `scripts/bench-accounting-postgres.mjs`
- `docs/`: this file, `CALACOT_ACCOUNTING_MIGRATION_PLAN.md`, `CALACOT_OPENING_BALANCE_RECONCILIATION.md`, `CALACOT_PARALLEL_ACCOUNTING_RESULTS.md`, `CALACOT_ACCOUNTING_GO_LIVE_CHECKLIST.md`, `CALACOT_ACCOUNTING_RISK_REGISTER.md`, `CALACOT_ACCOUNTING_POLICY_REGISTER.md`, `CALACOT_ACCOUNTANT_REVIEW_PACKAGE.md`

**Changed:**

- `drizzle-current/0023_financial_statements_closing.sql` (`fs_account_balances` performance; not applied anywhere outside tests)
- `drizzle-current/meta/_journal.json`
- `lib/sales/permissions.ts` (`migration_prepare`, `migration_approve`)
- `lib/finance/context.ts`, `lib/ui/status.ts`, `lib/admin/breadcrumbs.ts`, `components/accounting/shared.tsx`
- `components/admin/project-team-actions.tsx`, `components/sales/share-document.tsx`, `app/shared/[token]/page.tsx`
- Test harnesses: `verify-project-workspace{,-db}.mjs`, `verify-project-manager-assignment.mjs`, `verify-shared-documents.mjs`, `verify-fresh-sales.ts`, `verify-design-system.ts`
- `package.json` (`test:migration`)

## 12. Conditions to change the conclusion

The conclusion moves to **READY AFTER SPECIFIED CONDITIONS** once browser acceptance passes and policies P1–P18 are approved.

It moves to **READY FOR CONTROLLED PRODUCTION ACTIVATION** only after all of the following:

- approved opening balances;
- a real parallel month with all material differences resolved;
- a migration rehearsal on a production branch;
- independent accountant sign-off.

Even then, activation follows the gated stages. **The system must not be described as a QuickBooks (or other) replacement until the independent accountant signs.**
