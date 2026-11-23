# Phase 2E: financial statements, period closing and year-end

**Status:** implemented and verified on isolated databases with synthetic data. **Not deployed. No migration has been run against production. Not production-ready** (see §9).
**Audience:** engineers and reviewers of the accounting system, and the accountant.

Policies: [CALACOT_FINANCIAL_REPORTING_POLICY.md](CALACOT_FINANCIAL_REPORTING_POLICY.md), [CALACOT_PERIOD_CLOSING_POLICY.md](CALACOT_PERIOD_CLOSING_POLICY.md), [CALACOT_YEAR_END_PROCEDURES.md](CALACOT_YEAR_END_PROCEDURES.md).

## 1. Prerequisites (verified before starting)

All Phase 2A–2D suites pass on the current tree:

- chart of accounts, double-entry ledger, immutable posting and reversals, periods;
- source-to-ledger integration and reconciliation;
- banking and cash reconciliation;
- fixed assets and depreciation;
- income-tax computation and provisions;
- permissions.

No prerequisite was missing. Phase 2E builds on the Phase 2A ledger only. There is no second ledger.

## 2. Migration `drizzle-current/0023_financial_statements_closing.sql` (additive)

**New tables:**

| Area | Tables |
|---|---|
| Audit history | `fs_events` (append-only) |
| Policies | `fs_classification_versions`, `overhead_allocation_versions`, `period_close_policy_versions` |
| Statement snapshots | `fs_statement_sets` (immutable once approved; payload hash checked on insert) |
| Adjustments | `adjustment_entries` |
| Period close | `period_closes`, `period_close_evidence`, `period_close_exceptions` |
| Year-end | `year_end_closes` |

**New functions:**

| Area | Functions |
|---|---|
| Balances and fingerprint | `fs_account_balances`, `fs_ledger_fingerprint` |
| Statements | `fs_trial_balance`, `fs_income_statement`, `fs_balance_sheet`, `fs_cash_flow`, `fs_equity_changes` |
| Segment reports | `fs_division_report`, `fs_project_report` |
| Statement sets | `fs_statement_payload`, `fs_statement_set_create`, `fs_statement_set_decide` |
| Policies | `fs_classification_propose`, `overhead_allocation_propose`, `period_close_policy_propose`, `fs_policy_decide` |
| Adjustments | `fs_adjustment_create`, `fs_adjustment_command`, `fs_adjustment_reverse` |
| Period close | `period_close_checks`, `period_close_start`, `period_close_evidence_add`, `period_close_exception_raise`, `period_close_exception_decide`, `period_close_assign`, `period_close_command` |
| Year-end | `year_end_prepare`, `year_end_decide`, `year_end_reopen` |

**Changes to existing objects:**

- No existing table, column, constraint or function is altered.
- Two triggers are **added** to existing tables:
  - `accounting_periods_close_control`: once a close policy is approved, a period's status changes only inside the controlled close and year-end functions, which set a transaction-local flag.
  - `accounting_journals_year_end_control`: year-end closing journals and their reversals change status only inside the year-end functions.
- Both triggers are inert for organizations with no approved close policy or year-end. All 2A–2D tests pass unchanged.

## 3. Application

| Layer | Files |
|---|---|
| Pure logic | `lib/accounting/statements.ts`: statement lines, `lineFits` (mirrors the SQL), classification proposal, date and comparative ranges, export flattening, check labels |
| Reads | `lib/statements/reads.ts`: all behind `fs_read` and the verified organization |
| Actions | `lib/statements/actions.ts`: each calls one database function inside `financeMutation` (live Clerk re-check, same-origin check, rate limit, idempotency key) |
| Export | `app/api/accounting/statements/route.ts`: CSV export, audited, `no-store`, formula-safe |
| Components | `components/statements/{report,forms,shared}.tsx` |

**Pages** (all under `app/(admin)/admin/accounting/`, each with loading and error states):

- `statements`: report selector, period, comparison, division filter, CSV export, print or PDF, statement sets
- `statements/[id]`: snapshot view and approval
- `statements/adjustments`
- `statements/classification`: classification and overhead allocation
- `ledger`: general ledger
- `closing`: close policy, periods, year-end
- `closing/[id]`: checklist, next action, evidence, exceptions, reviewer assignment, approval history

The accounting navigation now runs: Overview, Chart of accounts, Journals, General ledger, Banking & cash, Reconciliation, Fixed assets, Tax management, Financial statements, Period closing, then the existing tabs.

**Shared files changed:**

- `lib/sales/permissions.ts`
- `lib/finance/context.ts` (messages)
- `lib/ui/status.ts` (domains `statementSet`, `periodClose`, `closeCheck`, `yearEnd`, `fsPolicy`)
- `lib/admin/breadcrumbs.ts`
- `components/accounting/shared.tsx`
- `scripts/verify-design-system.ts`
- `scripts/verify-tax-assets-db.mts`: the last-migration assertion now checks presence
- `package.json` (`test:statements`)

## 4. Permissions

| Permission | Finance | Viewer | Admin | Used for |
|---|---|---|---|---|
| `fs_read` | ✓ | ✓ | ✓ | Statements, general ledger, period closing (read), CSV |
| `fs_adjust_prepare` | ✓ | – | ✓ | Adjustments, statement sets, classification and allocation proposals, scheduled reversals |
| `fs_adjust_review` | – | – | ✓ (delegable) | Approve, return, reject and post adjustments |
| `fs_approve` | – | – | ✓ (delegable) | Approve statement sets, classification and allocation policy |
| `close_start` | ✓ | – | ✓ | Close policy proposal, start, evidence, exceptions, reviewer assignment, submit, year-end preparation |
| `close_approve` | – | – | ✓ (delegable) | Approve close policy, exceptions and closes |
| `close_reopen` | – | – | ✓ (delegable) | Reopen periods and years |
| `year_end_approve` | – | – | ✓ (delegable) | Approve year-end |

All eight are sensitive: requests re-verify Clerk membership live. Self-approval is refused by the database, as is acting in another organization.

## 5. Tests

| Suite | Result |
|---|---|
| `scripts/verify-statements-db.mts` (PGlite, full chain 0000–0023) | 13 checks |
| `scripts/verify-statements-actions.mjs` (real permission module, actions, reads, CSV route; fake Clerk) | 6 checks |
| `scripts/verify-statements-concurrency-postgres.mjs` (embedded PostgreSQL 17, two independent connections) | 7 checks |
| Regressions: `test:accounting`, `test:accounting:integration`, `test:banking`, `test:tax-assets`, plus 2A–2D concurrency (13 + 7 + 8 + 5) | All pass |
| `tsc`, ESLint on all changed files | Clean |
| Isolated production build (no `.env` files, dummy keys) | Passes; 8 new routes |

**What the DB suite covers:**

- Hand-computed P&L, balance sheet, cash flow (including an internal transfer), equity and trial balance.
- Drafts and submitted journals excluded.
- Comparative months.
- Division filter and allocation memo.
- Provisional when unclassified.
- Snapshots: hash, immutability, staleness.
- Close policy taking over from the legacy close.
- Checklist and exceptions: the bank-reconciliation failure is shown when a bank account exists.
- Posting denied after close.
- Reopen order.
- Reviewer assignment.
- Year-end, duplicate retry, reopen and re-close, with retained earnings credited once.
- Opening carry-forward.
- Scheduled reversal.
- Prior-period correction.

**What the concurrency suite covers:**

- A posting racing a close: refused.
- A close racing a posting in flight: waits, then re-checks.
- Double close approval.
- Double year-end preparation.
- Double year-end approval.
- A statement approval racing a posting: refused as stale.
- Double scheduled reversal.

## 6. Pre-existing failures (not introduced here)

- The design-system radius check flags `components/sales/share-document.tsx`, part of the separate uncommitted shared-documents work.
- `app/shared` is excluded from the isolated build because it fails independently.
- `verify-phase1e-static`, `verify-project-workspace-db` and `verify-project-manager-assignment` failed before this phase.

## 7. Browser acceptance

Not performed. No isolated Clerk development accounts exist, and `.env.local` points at live services, so the dev server was not run. Acceptance on a disposable database branch with test Clerk users is still required.

## 8. Known limitations

- The cash flow uses the **direct method** only. An indirect-method reconciliation is not implemented.
- Statements are in the functional currency only (multi-currency posting cannot be enabled in Phase 2A).
- Account hierarchy is kept in the chart; statements group by statement line and show account codes, not parent subtotals.
- Allocation supports fixed shares only.
- Adjustments can also be approved from Journals with `accounting_journal_approve`, under the same separation of duties.
- The receivables/payables check uses the Phase 2B reconciliation. While automatic posting is off, operational balances not yet in the ledger appear as unexplained differences and need an approved exception.

## 9. Production blockers

1. Approve the policies listed in the policy documents: financial year, classification, close policy, allocation, revenue recognition, opening balances from evidence.
2. Load the cut-over opening balances (QuickBooks) with evidence and two-person approval.
3. Go live with 2B source posting, or accept documented exceptions for it.
4. Have an independent accountant review the statements produced on a copy of real data.
5. Browser acceptance with test Clerk users.
6. A reviewed production migration plan (§10).

## 10. Migration and rollback

- The migration is additive and runs as one transaction in tests. Apply it to a database branch first.
- **Rollback before use:** drop the two added triggers (`accounting_periods_close_control`, `accounting_journals_year_end_control`), then the new functions and tables. No existing data is touched.
- **After use:** posted closing and adjustment journals live in the Phase 2A tables and must not be deleted. Roll forward with reversals instead. Once any close policy is approved, removing the period-control trigger would re-enable uncontrolled closes, so treat it as permanent.
- The two triggers add a lookup to every period update and journal insert or update. This was measured as negligible at test scale. Check it on a production-sized branch.
