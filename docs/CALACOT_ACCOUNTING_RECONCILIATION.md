# Calacot Source-to-Ledger Reconciliation (Phase 2B)

`accounting_integration_reconciliation(org, as_of, mode)` (in `drizzle-current/0019_accounting_integration.sql`) compares the operational records with the ledger. The page is **Accounting → Integration → Reconciliation**.

- **Scope:** one organization (from the verified Clerk context), one date (`as_of`, any date; the page offers recent period ends), and each currency separately. UGX and USD are never added together.
- **Mode:** `ledger` compares with posted journals. `shadow` compares with the shadow preview (the journals that *would* be posted), so the accountant can review a mapping set on historical data before anything reaches the ledger.
- **Never balanced away:** the function only reports. Nothing creates a balancing journal, and a difference stays visible until its cause is fixed.

## Checks

Control-account checks run only for accounts named in the approved integration stage (`control_accounts`). Traced checks always run.

| Check | Operational side (as at the date) | Ledger side |
|---|---|---|
| `receivables` | Issued invoices not voided by the date − issued credit notes not voided − allocations of confirmed payments + allocation reversals of completed refunds | Balance of the receivables control account (debit − credit) |
| `unallocatedReceipts` | Confirmed payments − allocations − completed refunds + allocation reversals | Balance of the unallocated-receipts account (credit − debit) |
| `payables` | Totals of expenses whose approval produced a journal (recognized), less non-void disbursements against them | Balance of the payables account (credit − debit) |
| `outputTax` | Tax on issued invoices not voided − tax on issued credit notes | Balance of the output-tax account (credit − debit) |
| `disbursements` (traced) | Non-void disbursements with `paid_on` by the date | Amounts of posted disbursement entries, less posted void reversals |
| `refunds` (traced) | Completed refunds | Amounts of posted refund entries |

Dates use the same basis as the captured events (Kampala dates of the source timestamps; `paid_on` for disbursements; `received_at` for payments), so a matched reconciliation means the ledger and the sub-ledger agree on what happened and when. The operational formulas for receivables and unallocated funds are the same ones the sales ledger uses for invoice balances and available payment funds (`sales_payment`, `lib/finance/receivables.ts`).

## Statuses

| Status | Meaning |
|---|---|
| **Matched** | Operational = ledger. |
| **Explained** | The difference equals the signed total of events that are captured but not posted by that date: pending, blocked (for example missing mapping, closed period, foreign currency), or re-dated into a later period. Each one is listed in the exception workspace. |
| **Unexplained** | Something is not captured or not traceable. Typical causes: records created while integration was disabled (run *Capture historical records*), a capture failure (shown on the workspace), or a manual journal on a non-control account such as 2120. |

Foreign-currency (USD) balances always show as *explained* while FX policy is unapproved: the events are captured but blocked `fx_policy_unapproved`, and the ledger side is zero.

## Investigation workflow

1. Open the unexplained row's currency and date.
2. In the integration workspace, filter by status *Needs attention* and by the relevant event types. Fix mappings, periods or dependencies, retry, and process.
3. If the workspace shows capture failures, or the business period predates enabling integration, run *Capture historical records* (idempotent: existing events are untouched).
4. Re-run the reconciliation. If a difference remains, look for manual journals on the account (Phase 2A manual journals are refused on control accounts 1200, 2110 and 2140, but not on 2120 or 2180).

## Limitations

- **Payables** covers only liabilities recognized by an approved accrual mapping. Under the cash basis (the default), there is no payable and this check does not appear unless a payables account is configured, in which case both sides are zero.
- **Bank and mobile-money balances are not reconciled.** There is no bank data source (policy C8). The 1140 clearing account will accumulate confirmed receipts until bank reconciliation exists.
- **Deposit releases** (2130 → revenue) are not automated, so there is no deposit check yet.
- Exchange differences are not calculated (policy D3).
- The `unposted` amount for `payables` and the explanation for re-dated tax lines are approximate: those rows report the difference but treat it as unexplained rather than guessing.

## Verified behaviour (isolated databases)

`scripts/verify-accounting-integration-db.mts` checks, on synthetic data: shadow reconciliation matches before any posting; after isolated-test posting, receivables, unallocated funds, refunds, output tax, disbursements and payables all match; a blocked tech-division invoice and a USD invoice are *explained*; a redated invoice is *explained* as at the closed period end and *matched* today; an uncaptured invoice is *unexplained* until a backfill makes it *explained*; no balancing journal is ever created.
