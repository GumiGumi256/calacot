# Calacot accounting system: accountant review package

**Status:** prepared for review. **No accountant has reviewed or approved it.** Every figure in it comes from synthetic test data, not from Calacot's books.
**Audience:** the independent accountant engaged to review the system before it becomes Calacot's financial system of record.

## What you are asked to review

1. **Design:** whether the controls are adequate for Calacot (sections A–G).
2. **Policies:** the decisions in `CALACOT_ACCOUNTING_POLICY_REGISTER.md`. You advise and management approves.
3. **Configuration** (after policies are set): chart, classification, close policy, approval authorities.
4. **Opening balances:** `CALACOT_OPENING_BALANCE_RECONCILIATION.md` (form not yet completed).
5. **Parallel run:** `CALACOT_PARALLEL_ACCOUNTING_RESULTS.md`. The synthetic run is done; a month of real records is still to run.
6. **Outstanding exceptions:** `CALACOT_ACCOUNTING_RISK_REGISTER.md`.

## A. Chart of accounts

`docs/CALACOT_CHART_OF_ACCOUNTS.md`. The proposed chart is grouped as follows:

| Codes | Group |
|---|---|
| 1xxx | Assets. 1200 receivables is a control account. |
| 2xxx | Liabilities. 2110 payables and 2140 unallocated receipts are control accounts. |
| 3xxx | Equity. 3200 retained earnings; 3900 opening balance equity. |
| 4xxx | Revenue |
| 5xxx | Cost of sales |
| 6xxx | Operating expenses |
| 7xxx / 8xxx | Other income and expenses, including finance costs and income tax |

Every account is approved by a second person. Control accounts refuse manual journals.

## B. Ledger and journals

These rules are enforced by the database:

- One general ledger. Statements, closes and reports read only posted journal lines.
- Phase 2B shadow lines are a separate rehearsal table, never reported.
- Balanced journals (debits = credits per currency and in functional currency).
- Sequential numbering per financial year.
- Posting only into open periods.
- Preparer ≠ approver.
- Posted journals immutable. Corrections are linked reversals.
- Every change recorded in an append-only history.

**Sample journals:** see the synthetic year in `scripts/verify-accounting-parallel.mts`, which covers sales, accruals and their payment, depreciation, prepayment release, transfers, dividend and tax provision.

## C. Trial balance and financial statements

**Statements:**

- Trial balance: opening, movement and closing.
- General ledger with drill-down.
- Profit and loss, with gross profit, operating profit, profit before tax and net profit.
- Balance sheet: the equation is enforced and no balancing figure is ever added.
- Direct-method cash flow: internal transfers excluded; reconciled to closing cash.
- Changes in equity: capital, distributions, profit, prior-period corrections and year-end transfers.
- Division and project results.

**Snapshots:** approved snapshots are immutable and hashed, and marked stale if the ledger later changes. See `CALACOT_FINANCIAL_REPORTING_POLICY.md`.

**Synthetic year results** (independently recomputed, 0 differences):

| Figure | Amount |
|---|---|
| Net profit | 123,546,794.24 |
| Total assets | 282,995,420.34 |
| Closing cash | 274,662,086.97 |

**Known limitations:**

- Direct cash-flow method only.
- Functional currency only.
- Statements group by statement line, without parent-account subtotals.

## D. Reconciliations

| Area | Control |
|---|---|
| Bank and mobile money (Phase 2C) | Statement import with duplicate detection; matching; finalized reconciliations lock their period; cash counts with witness |
| Receivables, payables and unallocated receipts (Phase 2B) | Operational records reconciled to control accounts; differences classified as matched, explained or unexplained |
| Month-end close | Checklist of 15 checks; exceptions need a second person (`CALACOT_PERIOD_CLOSING_POLICY.md`) |

## E. Opening balance schedules

Staging-only batches reconcile the opening trial balance to the following schedules:

- receivables;
- payables;
- customer deposits;
- supplier advances;
- bank statements and cash counts;
- the asset register;
- tax evidence.

They also check for duplicates against the live system. No Calacot schedule has been staged.

## F. Tax treatment

- Income tax only from approved, evidenced rules and computations (Phase 2D).
- Accounting profit is not taxable income: capital allowances, add-backs and credits are separate.
- VAT, withholding tax, PAYE and NSSF cannot be activated in the current system.
- The year-end close requires an approved computation or an approved exception.

**Decisions needed:** registrations, rates and the provision process (tax adviser).

## G. Year-end evidence

All of the following were tested on synthetic data:

- one closing journal per year (income and expenses to retained earnings);
- approval by a second person;
- final period closed in the same step;
- opening balances carried forward with no copied journals;
- reopening reverses the closing entry and keeps history;
- duplicate attempts refused, also under concurrent attempts on real PostgreSQL.

See `CALACOT_YEAR_END_PROCEDURES.md`.

## Outstanding exceptions to be cleared before sign-off

1. Policies P1–P18 undecided.
2. No opening balances.
3. No real parallel run.
4. No browser acceptance.
5. Automatic posting not yet evaluated in shadow mode on real data.

## Reviewer conclusion (to complete)

> ☐ Approved ☐ Approved with conditions ☐ Not approved
>
> Conditions or findings: ______________________________________________
>
> Accountant: ______________________ Firm / registration: ______________ Date: __________
