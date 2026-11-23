# Calacot migration consistency report (0018–0024)

**Result: consistent.** Verified by `npm run test:migration-chain` (`scripts/verify-migration-chain.mjs`), which reads files and applies the chain in memory. It uses no environment variables and no network.
**Audience:** engineers and reviewers preparing the accounting migrations for production.

## 1. Journal

`drizzle-current/meta/_journal.json` has 25 entries, idx 0–24.

| Check | Result |
|---|---|
| idx contiguous from 0; tag prefix matches idx | Pass |
| Tags unique; timestamps strictly increasing | Pass |
| A `.sql` file for every entry; no `.sql` file outside the journal | Pass (25 / 25) |
| Committed history (git `HEAD`, entries 0000–0019) unchanged | Pass: all 20 committed entries and all 20 committed `.sql` files byte-identical (line endings normalized) |
| Chain applies to an empty database | Pass: 131 tables (PGlite). Also rehearsed on PostgreSQL 17 in one transaction: 1.6 s. |

## 2. Accounting migrations

| Migration | Committed? | Purpose | Destructive statements | Redefines earlier functions |
|---|---|---|---|---|
| 0018_accounting_foundation | Yes (HEAD) | Ledger, chart, periods, journals | None | — |
| 0019_accounting_integration | Yes (HEAD) | Source-to-ledger integration | None. Drops and re-adds `accounting_events_entity_type_check` under the same name to widen it. | `accounting_journal_insert_guard`, `accounting_journal_guard` (from 0018, by design) |
| 0020_whatsapp_receipt_notifications | No | Receipt notification queue (sales, not accounting) | None. `DROP TRIGGER IF EXISTS` for its own trigger, re-created immediately (idempotent). | — |
| 0021_banking_reconciliation | No | Banking, statements, reconciliation, cash | None | — |
| 0022_tax_assets_payroll | No | Tax, fixed assets, payroll foundation | None | — |
| 0023_financial_statements_closing | No | Statements, period close, year-end | None. Adds two triggers to existing tables (period control, year-end journal control). | — |
| 0024_opening_balance_staging | No | Staging-only opening balances | None | — |

0021–0024 are purely additive. They create tables, indexes, functions and triggers, and never replace an earlier function.

0023 was corrected in place during Phase 2F (performance of `fs_account_balances`). This was safe because it has **never been applied to any database except throwaway test databases**. Once it is committed and applied anywhere persistent, it must never be edited again: changes then need a new migration.

## 3. Points for review

1. **Drizzle snapshots** exist only up to `0015_snapshot.json`. Migrations 0016–0024 are hand-written SQL, as were the already-committed 0016–0019. Running `drizzle-kit generate` would diff against the 0015 snapshot and propose unwanted changes. **Do not run `drizzle-kit generate` or `push` against this chain.** Keep the hand-written, reviewed workflow.
2. **0020 belongs to the WhatsApp receipt feature**, not accounting, but it sits between accounting migrations in the journal. It must be committed (or the journal re-sequenced before anything is applied) together with the accounting migrations. Otherwise the journal on GitHub would reference a missing file.
3. **Production application order** is journal order. No migration depends on data; all are schema and functions. The rollback approach is in `PHASE_2E_FINANCIAL_STATEMENTS.md` §10 and `CALACOT_ACCOUNTING_GO_LIVE_CHECKLIST.md`.
4. The **year-end and period-control triggers** in 0023 change behaviour of existing tables only once a close policy is approved or a year-end exists. Before that they are inert, which is verified by the unchanged Phase 2A–2D suites.
