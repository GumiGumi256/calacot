# Phase 2C: Banking, cash management and bank reconciliation

**Status:** implemented and verified on isolated databases with synthetic data. **Not production-ready, not deployed, no migration run against any real database, no Clerk setting changed.**
**Date:** 22 November 2026 · **Branch:** `feat/accounting-ledger-integration` (uncommitted working tree)
**Related:** [CALACOT_BANK_RECONCILIATION_RULES.md](CALACOT_BANK_RECONCILIATION_RULES.md) · [CALACOT_CASH_MANAGEMENT_POLICY.md](CALACOT_CASH_MANAGEMENT_POLICY.md) · [PHASE_2A_ACCOUNTING_FOUNDATION.md](PHASE_2A_ACCOUNTING_FOUNDATION.md) · [PHASE_2B_AUTOMATED_ACCOUNTING.md](PHASE_2B_AUTOMATED_ACCOUNTING.md)

## 1. Phase 2A/2B prerequisite verification

Verified on the local codebase before implementation, by running the existing suites unchanged on the 0000–0020 chain:

| Requirement | Evidence | Result |
|---|---|---|
| Chart of accounts exists and is tested | `accounting_accounts`, two-person chart approval; `verify-accounting-db.mts` | PASS |
| Double-entry journals and general ledger | `accounting_journals` / `_lines`, posting gate in `accounting_journal_guard` (balance per currency, functional totals) | PASS |
| Periods and posting restrictions | `accounting_periods`, close/reopen, closed-period refusal | PASS |
| Automated posting integration | 0019 capture triggers, mappings, worker, shadow/isolated-test stages | PASS (`test:accounting:integration`, 5 + 20 + 7) |
| Stable source-event identities | `accounting_journals_source_event_uq`, event keys per invoice/payment/allocation/expense | PASS |
| Journal idempotency and reversal controls | idempotency keys, `accounting_journal_reverse` (exact mirror, once) | PASS |
| Posting exceptions visible and recoverable | blocked/failed events with codes, retry and re-date commands | PASS |

`test:accounting` 8 + 24 + 9 and `test:accounting:integration` 5 + 20 + 7 passed. **No blocker was found.** Phase 2C adds no parallel ledger: every book balance is read from posted `accounting_journal_lines`, and every cash operation posts an ordinary manual journal through the Phase 2A functions.

### State found in the working tree

An earlier, uncommitted start on Phase 2C existed: `drizzle-current/0021_bank_account_mappings.sql` (mappings keyed directly on `finance_accounts`, not in the migration journal), the pure helpers `lib/accounting/bank-reconciliation.ts` and `lib/accounting/statement-csv.ts`, and four test scripts. The mapping design was carried forward into the new `0021_banking_reconciliation.sql`, re-keyed on a banking-account register so cash, petty cash and clearing accounts are supported, and the draft file was removed. The pure helpers were extended. Two of the early scripts, `verify-bank-mapping-db.mts` and `verify-bank-mapping-concurrency-postgres.mjs`, target the removed draft and are superseded by the new suites. Deleting them was not permitted in this session, so they remain and **should be deleted**.

The working tree also contains a separate, uncommitted shared-documents feature (shared links, payment PDFs, migration 0020). Phase 2C does not depend on it and did not change it.

## 2. Features implemented

- **Banking account register:** bank and mobile-money accounts (wrapping one verified payment account each), cash, petty cash (custodian, approved float) and clearing accounts; deactivate/reactivate; custodian and float changes with reasons.
- **Ledger mappings:** one approved ledger account per banking account and vice versa, two-person approval, retire with a reason.
- **Category accounts** for bank charges, interest received and charged, cash shortages and overages, and staff advances (asset only), each with two-person approval.
- **Statement import (CSV):** upload, automatic column mapping from headers (editable), preview with totals, date range, running-balance derivation and duplicate flags; import in one transaction; original file kept privately by SHA-256; extension point for other formats.
- **Duplicate handling:** whole-file idempotency, exact-repeat skipping, ambiguous rows held for review, rows in finalized periods held.
- **Reconciliation engine:** exact and suggested matches (read-only suggestions confirmed by a person), manual matches (one-to-one, one-to-many, many-to-one), partial matches with explicit residuals, bank reversal pairs, ledger reversal pairs, opening-balance matching, cancellation with reasons.
- **Bank charges and interest:** classify an unmatched line, which prepares a draft adjustment journal. A second person approves and posts it, and it is matched to its line automatically.
- **Reconciliation periods:** contiguous periods, statement check, balance equation (deposits in transit, outstanding payments, unmatched bank lines, unexplained difference), submit, return, finalize (a different person), immutable snapshots, audited reopen, locks on finalized periods.
- **Cash management:** receipts, payments, transfers (one journal, duplicate-proof from both sides), petty cash replenishment against the float, staff advances and accountability (evidence, never over-accounted), cash counts with witness and denominations, shortage and overage adjustments with evidence; all with second-person approval and posting.
- **Reports:** book, statement and reconciled balances; reconciliation progress; unmatched totals; monthly cash movement; advances outstanding; count differences; transfers; charges, interest and cash differences recognized. Everything is per currency.
- **Workspace UI** under Accounting: new *Banking & cash* and *Reconciliation* tabs, with sub-sections Overview, Cash, Import statement, Reconciliation, Reports, and Accounts and mappings; an account workspace; and a reconciliation detail page.

## 3. Files and migrations changed

**Migration (additive):** `drizzle-current/0021_banking_reconciliation.sql`, registered as journal entry 21. It creates 13 tables, 104 statements in total, and no `ALTER` of any existing table, constraint or function:
`banking_events`, `banking_accounts`, `bank_account_mappings`, `banking_category_accounts`, `bank_statement_imports`, `bank_statement_lines`, `bank_reconciliations`, `bank_reconciliation_snapshots`, `bank_match_groups`, `bank_match_items`, `banking_evidence`, `cash_counts`, `cash_transactions`, plus their guard triggers and command functions.

**New application code**

| Area | Files |
|---|---|
| Database access | `lib/banking/reads.ts`, `lib/banking/actions.ts`, `lib/banking/catalog.ts` |
| Pure logic | `lib/accounting/bank-reconciliation.ts` (suggestions, residuals, exact decimal ↔ minor units, difference formula), `lib/accounting/statement-csv.ts` (bounded CSV parser, mapping, header guessing, format registry) |
| Routes | `app/api/banking/statements/route.ts` (preview/import), `app/api/banking/evidence/route.ts` |
| Pages | `app/(admin)/admin/accounting/banking/{page, [id], setup, import, cash, reports}`, `app/(admin)/admin/accounting/reconciliation/{page, [id]}`, each with `loading.tsx` and `error.tsx` |
| Components | `components/banking/forms.tsx`, `components/banking/statement-import.tsx`, `components/banking/shared.tsx` |

**Changed:** `lib/sales/permissions.ts` (9 permissions, role grants, sensitive set), `lib/finance/context.ts` (messages for every new database code), `lib/ui/status.ts` (4 status domains), `lib/admin/breadcrumbs.ts`, `components/accounting/shared.tsx` (2 tabs), `drizzle-current/meta/_journal.json`, `package.json` (`test:banking`), `scripts/verify-design-system.ts` (new domains read from the 0021 CHECK constraints), `scripts/verify-accounting-db.mts` (one deliberate assertion change, §7).

**Tests:** `scripts/verify-banking-db.mts`, `scripts/verify-banking-actions.mjs`, `scripts/verify-banking-concurrency-postgres.mjs`; `scripts/verify-statement-csv.mts` and `scripts/verify-bank-reconciliation.mts` (kept and still passing).

**Docs:** this file, `CALACOT_BANK_RECONCILIATION_RULES.md`, `CALACOT_CASH_MANAGEMENT_POLICY.md`.

## 4. Banking account mappings

No mapping, account or posting is created by the migration. In production the register starts empty. The intended set-up, pending decisions (§8):

| Company account | Source | Proposed ledger account |
|---|---|---|
| Each verified bank account (UGX) | Payment accounts, `bank_transfer` | `1120-nn` sub-account per bank account |
| USD bank account | Payment accounts | `1121` (posting blocked until a multi-currency policy is approved) |
| MTN Mobile Money wallet | Payment accounts, `mobile_money` | `1130-01` |
| Airtel Money wallet | Payment accounts, `mobile_money` | `1130-02` |
| Office cash | Cash account with custodian | new `1115` or `1110-nn` |
| Head-office petty cash | Petty cash with custodian and float | `1110` or `1110-01` |
| Receipts not yet banked | Clearing account | `1140` (the Phase 2B receipt clearing account, see C2/C8) |

Ledger accounts must be active, postable, non-contra assets that allow manual journals, in the same currency. Control accounts are refused. One ledger account cannot represent two company accounts. Sub-accounts are created in the chart of accounts and approved by a second person before they can be mapped.

## 5. Import and reconciliation controls

| Control | Where enforced |
|---|---|
| File ≤ 2 MB, ≤ 10,000 rows, ≤ 100 columns, ≤ 2,000 characters per field; strict UTF-8; NUL bytes refused; RFC-4180 quoting; `.csv` only | `statement-csv.ts`, statement route |
| ISO dates only, no future dates; decimal amounts (≤ 2 dp, no separators); nonzero; currency = account currency | parser **and** `bank_statement_import()` (re-validated in SQL) |
| Formula-like text stored inert, never evaluated; `spreadsheetSafeCell()` for exports | parser; test asserts `=HYPERLINK(...)` is stored verbatim |
| Original file preserved (private storage, SHA-256, content-addressed key) | route + `bank_statement_imports` |
| Same file or same key imports once | `UNIQUE (account, file_sha256)`, idempotency key |
| A live statement transaction exists once, even under concurrent overlapping imports | per-account advisory lock + `bank_statement_lines_live_uq` |
| Ambiguous duplicates and rows in finalized periods wait for a reasoned review | `review_status`, `bank_statement_line_review()` |
| Import never creates journals | no journal code path; test counts journals before and after |
| Statement rows immutable (only review status changes, once) | `bank_statement_line_guard` |
| Matches only against POSTED lines on the mapped ledger account, same currency and sign, never beyond the available amount | `bank_match_item_guard` (per-account lock), `banking_match_insert()` |
| Groups must balance by kind; checked at commit for direct SQL | deferred constraint triggers `bank_match_*_checked` |
| Suggestions never written; a reference alone is never sufficient | `suggestMatches()` requires the same account, currency and amount; read-only |
| Finalize only when statement check = 0, difference = 0, no unmatched lines and no pending reviews; by someone who neither prepared nor submitted | `bank_reconciliation_command()` + CHECK constraint |
| Finalized figures preserved; reopen audited, latest period only | `bank_reconciliation_snapshots` (append-only), reopen rules |
| Matches and late lines locked by finalized periods | `bank_match_group_guard`, import classification, review function |
| Adjustments only through approved category accounts and a second person; no balancing entries | `cash_transaction_create()` / `cash_transaction_decide()` |

## 6. Cash management controls

| Control | Where enforced |
|---|---|
| One manual journal per cash transaction through the Phase 2A functions; preparer ≠ approver; posting gate (balance, open period, active accounts, policy) | `cash_transaction_create/decide` → `accounting_journal_command` |
| Receipts and payments cannot use company-account or staff-advance ledger accounts, or control accounts | `cash_transaction_create()` |
| Transfers: one record and one journal; same currency; reference required; duplicate refused from either side while live, even concurrently | advisory lock + duplicate check |
| Petty cash float cannot be exceeded by replenishment (posted + pending + new) | `cash_transaction_create()` |
| Advances post to the staff-advances asset; accountability needs evidence, a posted advance and expense-type accounts, and is never more than outstanding | `cash_transaction_create()`, `cash_advance_outstanding()` |
| Counts record the posted book balance and pending journals; witness ≠ counter; differences need an evidenced adjustment, once per count | `cash_count_record()`, `cash_transaction_create()` |
| Evidence content-sniffed (PDF/JPEG/PNG/WebP ≤ 10 MB), private storage | evidence route, `banking_evidence` |
| Records immutable; cancellation by the preparer and rejection by a reviewer, each with a reason | guard triggers, `cash_transaction_decide()` |

### Permissions and separation of duties

Nine permissions were added, re-verified live with Clerk on every mutation, refused from another origin, rate-limited, and requiring an *active* staff record (suspended staff are refused by the database).

| Permission | Admin | Finance | Viewer | Others |
|---|---|---|---|---|
| `banking_read` | ✓ | ✓ | ✓ | – |
| `banking_manage` | ✓ | ✓ | – | – |
| `banking_import` | ✓ | ✓ | – | – |
| `banking_match` | ✓ | ✓ | – | – |
| `banking_reconcile` | ✓ | ✓ | – | – |
| `banking_reconcile_approve` | ✓ | delegable | – | – |
| `banking_reconcile_reopen` | ✓ | delegable | – | – |
| `cash_create` | ✓ | ✓ | – | – |
| `cash_approve` | ✓ | delegable | – | – |

Mapping and category approval reuse `accounting_policy_approve`. "Delegable" means granting the Clerk custom permission `org:calacot:<name>`; no Clerk setting was changed.

## 7. Test results

All runs used disposable databases (in-memory PGlite 17 and a throwaway PostgreSQL 17.5 from `embedded-postgres` installed in a scratch folder outside the repository, whose data was deleted afterwards) and synthetic data only. No environment files or real databases were used.

| Suite | Result |
|---|---|
| `verify-statement-csv.mts`, `verify-bank-reconciliation.mts` | PASS |
| `verify-banking-db.mts` (PGlite, 0000–0021) | **PASS, 18 checks + migration.** Account register uniqueness, normalization, custodians, suspended and cross-org refusal, immutability. Mappings: two people, one per side, currency, account type, control accounts. Category account types. Receipts and payments through the journal workflow with self-approval denied and idempotent approval. Transfers: balanced, duplicate from the other side refused, retries, float. Import: immutable rows, same key and same file idempotent, running-balance derivation, no journals. Currency, account, date and amount mismatches; overlapping imports (exact duplicate, ambiguous review, identical rows in one file); a direct-SQL duplicate refused. Exact match idempotent, no double matching, ledger unchanged. Finalization needs the equation, adjustments and an independent reviewer; snapshot immutable. Finalized-period locks, late line, audited reopen, re-finalization with a second snapshot. Partial, one-to-many, many-to-one, statement and ledger reversal pairs, explicit residuals, availability; direct-SQL unbalanced and over-allocated groups refused at commit. Unexplained difference blocks with no auto-balance. Advances and accountability. Counts with evidence and independent approval, once per count. Closed periods refuse cash and adjustments. Suspended approver, cross-org denial, preparer cancellation. GL agreement: banking journals are ordinary manual journals, balanced; trial balance balances; book = ledger; every command audited; payments and allocations untouched. |
| `verify-banking-actions.mjs` (real actions, reads, permission module and statement route; Clerk and Next stubbed) | **PASS, 7 checks.** Role matrix; sales and project managers have no access. Set-up with friendly refusals and delegated approver self-denial. Full account numbers never returned. Cash approval needs `cash_approve` and a different person. Route: preview writes nothing, import idempotent, formula text inert, 2 MB limit, wrong extension, bad dates, cash account refused, viewer 404. Suggestions confirmed by a person; finalize needs a different person. Cross-origin and revoked sessions write nothing; other organization sees nothing. Reports per currency. |
| `verify-banking-concurrency-postgres.mjs` (real PostgreSQL 17.5, overlapping connections) | **PASS, 8 checks + migration**, see §7a |
| Phase 2A/2B on 0000–0021 | `test:accounting` 8 + 24 + 9 PASS; `test:accounting:integration` 5 + 20 + 7 PASS; `verify-accounting-concurrency-postgres.mjs` PASS (13); `verify-accounting-integration-concurrency-postgres.mjs` PASS (7) |
| Regressions on 0000–0021 | PASS: `test:sales`, `test:verification`, `test:whatsapp-consent`, `test:org-routing`, `test:customer-care`, `verify-finance-expenses`, `verify-finance-documents`, `verify-documents-reports`, `verify-staff-admin`, `verify-phase1e-history`, `verify-quotation-catalogue`, `verify-project-team`, `verify-project-task-create`, `verify-lead-assignment`, `verify-lead-management`, `verify-dashboard` |
| Pre-existing failures (unchanged) | `verify-phase1e-static`, `verify-project-workspace-db`, `verify-project-manager-assignment`, documented in the Phase 2B report as failing identically on a clean `HEAD` |
| Failures in the separate shared-documents work (not Phase 2C) | `test:shared-documents` (its esbuild storage stub lacks `loadPdf`); design-system "card radius" check flags `components/sales/share-document.tsx`; the production build fails to prerender `/shared/[token]` (uncached data outside `<Suspense>`) |
| `tsc --noEmit` | **PASS** (0 errors) |
| ESLint, all new and changed Phase 2C files | **PASS** (0 errors, 0 warnings) |
| `test:design-system` | Phase 2C files pass, including the new status domains checked against the 0021 CHECK constraints. The only failure is the shared-documents file above. |
| Production build | **PASS** (`next build`, Turbopack, 106/106 pages) on an isolated copy with no `.env` files: dummy database URL and Clerk keys, public Sanity identifiers only, telemetry off. The shared-documents page `/shared/[token]` was removed from that copy because it fails independently (above). All 8 new banking and reconciliation pages are partially prerendered like the other accounting pages, and both `/api/banking/*` routes are dynamic. |

**Deliberate change to a Phase 2A assertion:** `verify-accounting-db.mts` expected `TRUNCATE accounting_journal_lines` to fail with `accounting_history_immutable`. Because `bank_match_items` now references journal lines, PostgreSQL refuses the truncate on the foreign key before the trigger runs. Truncation is still impossible; the assertion now accepts either error.

### 7a. PostgreSQL concurrency results (PostgreSQL 17.5)

| Scenario | Result |
|---|---|
| Two connections approve the same mapping with the same key | The second waits, then returns "already"; one decision and one audit entry |
| Overlapping statements imported concurrently (days 1–10 and 6–15) | The second waits; then 5 new and 5 exact duplicates; 15 live lines, 15 distinct fingerprints |
| Backend terminated mid-import (`pg_terminate_backend`) | Nothing persisted; the retry imports once; a further retry returns "already" |
| Two people match the same ledger entry to different bank lines at once | The second waits, then `match_exceeds_available`; matched total = the entry amount |
| The same transfer submitted from both sides at once | The second waits, then `duplicate_transfer`; one transfer |
| The same cash request retried concurrently with the same key | One cash transaction and one journal; the concurrent duplicate fails; a later retry returns the original |
| Finalizing a period while someone matches in it | The match waits, then is refused; status finalized; one snapshot |
| After all of the above | Every posted journal balanced; book balance = ledger lines |

### 7b. Not run: authenticated browser acceptance

Browser acceptance with isolated Clerk test users was **not run**. A browser session needs a Clerk instance with test users and a migrated database. The repository's dev server loads `.env.local`, which points at the live database and Calacot's Clerk application, so running it was not safe. The pages were verified by type-checking, lint, the design-system check, the action, read and route tests, and the production build, but not visually. This is a production blocker (§9).

## 8. Remaining policy decisions

1. **Ledger sub-accounts** per bank account, wallet, cash box and petty cash float (§4), proposed and approved in the chart of accounts.
2. **Category accounts:** confirm 6910, 7100, 8100, 7900 and 1230; choose the cash-shortage expense account.
3. **Approval authority:** who besides administrators holds `cash_approve`, `banking_reconcile_approve` and `banking_reconcile_reopen` (for example the company accountant); whether high-value cash needs a second approver (not implemented).
4. **Materiality:** the system has no tolerance; every difference must be resolved. Confirm, or approve a documented tolerance policy (would need a reviewed change).
5. **Cut-over:** the first reconciliation date per account and the QuickBooks opening balances (ties to Phase 2B G1–G4). Opening balance journals should equal the reconciled statement balance at cut-over, with outstanding items brought in as separate lines.
6. **Receipts clearing (2B C2/C8):** staff-verified customer receipts post to 1140 when integration is active. Decide the routine for moving them to bank (a transfer from the clearing account) and its frequency.
7. **Petty cash:** floats per location, maximum single payment, replenishment routine.
8. **Advances:** maximum outstanding per employee, deadline for accountability, treatment of unaccounted balances.
9. **Cash counts:** frequency; whether a witness is mandatory.
10. **Closing accounting periods after reconciliation**, so that entries cannot later be backdated into a reconciled period (drift is otherwise only detected, §7 rule 9 of the rules document).
11. **Disbursement reconciliation (Phase 1D):** `expense_disbursements.reconciled_at` is a separate, older notion of "reconciled". Decide whether it should be set from bank matching in a later phase.
12. **Statement formats and provider data:** CSV only; OFX/CAMT.053/MT940 or bank and mobile-money APIs (which would allow provider-confirmed balances) are future work.
13. **USD accounts:** usable for statements and matching only after a multi-currency posting policy (2A D1–D4).

## 9. Production blockers

1. **Private storage for statements and evidence.** Originals are stored through `storePrivateObject`. With `SALES_NOTIFICATION_MODE=capture` (the default), files go to `tmp/sales-private` on the local disk, which is ephemeral on Vercel. Production must use the private S3/R2 bucket (`SALES_STORAGE_*`, non-capture mode) before any statement is imported.
2. **Rehearse 0021 on a Neon branch of production** (with 0016–0020), rerun every suite there, including the three concurrency suites, and test a 10,000-row import over the Neon HTTP driver for time limits.
3. **Authenticated browser acceptance** of every banking page per role (admin, finance, viewer, delegated approver), on desktop and mobile, using a Clerk development instance and a Neon branch.
4. **The Phase 2A/2B activation blockers still apply:** an approved accounting policy with manual posting enabled, periods, and an approved chart (including the new sub-accounts).
5. **Approved policy decisions** §8 items 1–3 and 5, then mappings and category accounts entered by one person and approved by another.
6. **Clerk:** create the custom permissions only if delegation is decided. No production Clerk change was made.
7. **Housekeeping before commit:** done in the Phase 2F stabilization pass (superseded `verify-bank-mapping-*` scripts deleted). Resolve or separate the shared-documents failures (§7), which also block a clean production build of this branch.

**Phase 2C is not production-ready.** The essential verification passed on isolated databases, but browser acceptance, the production rehearsal and the policy decisions above are outstanding. Phase 2D has not been started.

## 10. Rollback and recovery

**Code rollback:** revert the Phase 2C files listed in §3. The banking pages, routes and actions disappear. Phase 2A/2B, invoices, payments, allocations and expenses are unaffected: 0021 changes none of their objects, and invoice balances and payment allocation rules are untouched.

**Database rollback before any banking data exists** (verify every table is empty first):

```sql
BEGIN;
DROP TABLE cash_transactions, cash_counts, banking_evidence, bank_match_items, bank_match_groups,
  bank_reconciliation_snapshots, bank_reconciliations, bank_statement_lines, bank_statement_imports,
  banking_category_accounts, bank_account_mappings, banking_accounts, banking_events;
DROP FUNCTION banking_event, banking_replay, banking_money, banking_date, banking_norm, banking_account_guard,
  banking_account_register, banking_account_command, banking_ledger_eligible, bank_mapping_guard, bank_mapping_propose,
  bank_mapping_decide, banking_ledger, banking_ledger_required, banking_book_balance, banking_category_eligible,
  banking_category_guard, banking_category_propose, banking_category_decide, banking_category_ledger,
  bank_statement_import_guard, bank_statement_line_guard, banking_line_key, bank_reconciliation_guard, banking_locked_until,
  bank_match_group_guard, banking_ledger_line, bank_match_item_guard, bank_match_group_check, bank_match_group_checked,
  bank_match_item_checked, banking_matched, banking_match_insert, bank_match_create, bank_match_cancel, bank_statement_import,
  bank_statement_line_review, bank_reconciliation_figures, bank_reconciliation_create, bank_reconciliation_update,
  bank_reconciliation_command, banking_evidence_record, cash_transaction_live, cash_advance_outstanding,
  banking_account_for_cash, cash_transaction_create, cash_transaction_decide, cash_count_record;
DELETE FROM drizzle.__drizzle_migrations WHERE hash = '<hash of 0021>';  -- only if recorded by drizzle-kit
COMMIT;
```

**Once banking data exists**, do not drop anything. The records are append-only evidence and posted cash journals are part of the general ledger. To stop using Phase 2C, revert the code or remove the banking permissions; the tables remain inert. Posted cash journals stay in the ledger and are corrected only by reversal.

**Recovery:**

- **Retries:** every command is idempotent by request key. A retried import, match, cash transaction, approval or reconciliation command returns the original result.
- **Crashes:** each command is one transaction. A crash before commit leaves nothing (verified with a terminated backend); the retry completes once.
- **Wrong match:** cancel it with a reason (not possible inside a finalized period until it is reopened).
- **Wrong cash transaction:** before approval, the preparer cancels or a reviewer rejects it. After posting, reverse the journal (`accounting_journal_reverse`), then match the journal and its reversal as a ledger reversal pair.
- **Wrong duplicate decision:** the decision is final. If a genuine line was marked duplicate, re-import a statement containing it after the source is corrected. If a duplicate was accepted and matched, cancel the match; the line then stays an unmatched exception that blocks finalization until resolved with the bank.
- **Wrong finalized reconciliation:** reopen it with a reason (latest period first), correct it, and finalize again. Earlier snapshots are kept.
- **Wrong mapping:** retire it (once nothing depends on it) and approve the correct one.
