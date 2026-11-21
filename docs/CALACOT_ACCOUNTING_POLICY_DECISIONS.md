# Calacot Accounting Policy Decisions (Phase 2A)

**Status:** every item below is **open**. None has been approved. The system stays in its safe default until an authorized person records each decision.

This document is for Calacot's accountant and administrators. Each decision shows:

- what needs deciding;
- what the system does until it is decided;
- where the decision is recorded or enforced.

Decisions made inside the application need two people, the **proposer** and a different **approver**, and they are kept as permanent history.

## A. Decisions that switch the ledger on

These are recorded in **Accounting → Policy and rates**, as an accounting policy version.

| # | Decision | Safe default until decided | Enforced by |
|---|---|---|---|
| A1 | **Functional (reporting) currency.** UGX or USD. The system does not assume UGX. | No policy, so no periods can be created and nothing can be posted. | `accounting_policy_versions`; posting gate in `accounting_journal_guard` |
| A2 | **Financial-year start month.** Calacot's financial year has not been verified. Confirm it from the company's registration or tax records. | No periods. | `accounting_period_generate_year` uses the approved month. The month cannot change after periods exist (`fiscal_year_locked`). |
| A3 | **Allow manual journal posting.** | Off. A policy can be approved with posting still off, so the workflow can be rehearsed. | `manual_posting_enabled`; posting gate (`posting_disabled`) |
| A4 | **Who approves.** By default administrators hold `accounting_journal_approve`, `accounting_journal_reverse`, `accounting_period_close`, `accounting_period_reopen` and `accounting_policy_approve`. Delegate them to the accountant by adding the Clerk custom permission `org:calacot:<name>` to that person. | Administrators only. | Clerk custom permissions; `lib/sales/permissions.ts` |
| A5 | **Can the preparer also post** once someone else has approved? Currently allowed. Approval is the segregation control. | Allowed. | `accounting_journal_command` (post) |
| A6 | **Financial-year labelling.** Periods are labelled by the calendar year in which the financial year *starts*, for example FY2026 P01. Confirm, or choose end-year labelling. | Start-year labels. | Period names and journal numbers (`JE-<year>-000001`) |

Changing the functional currency after anything has been posted is refused (`functional_currency_locked`). It would restate history and must be planned as a migration.

## B. Chart of accounts

These are recorded by approving accounts in **Accounting → Chart of accounts**. See `docs/CALACOT_CHART_OF_ACCOUNTS.md`.

| # | Decision | Safe default |
|---|---|---|
| B1 | Approve, amend or remove each proposed account. | All proposed; none can receive postings. |
| B2 | One ledger account per bank or mobile-money account, or pooled accounts. | One placeholder per currency and channel. |
| B3 | Which accounts are control accounts. Proposed: 1200, 2110 and 2140. | Those three refuse manual journals. |
| B4 | Estates model: principal sales, agency or investment property. | All candidate accounts proposed; confirm before approval. |

## C. Recognition policies (needed before automatic posting)

These are recorded as versioned posting rules once accepted, and approved by a second person. Automatic posting stays disabled in Phase 2A by a database constraint, so approving a rule posts nothing.

| # | Business event | Decision needed | Current behaviour |
|---|---|---|---|
| C1 | Invoice issued | Is revenue recognised at invoice, at delivery or completion, or over time for contract works? How are deposit invoices treated? | Nothing posted. |
| C2 | Customer payment confirmed | Which ledger account receives each payment method? Confirmed payments do not record a verified receiving account today. | Nothing posted. |
| C3 | Payment allocated to invoice | Confirm the clearing approach (2140 → 1200). | Nothing posted. |
| C4 | Credit note issued | Contra-revenue (4900) or reversal of the original revenue account? | Nothing posted. |
| C5 | Refund completed | The refund workflow does not exist yet (table only). | Nothing posted. |
| C6 | Expense approved | **Approval only.** Recognise on approval (accrual) or on disbursement (cash basis)? | Nothing posted. Approval is not a supplier invoice. |
| C7 | Disbursement recorded | Post on recording or only after reconciliation? Map each verified finance account to a ledger account. Map expense categories to expense accounts. | Nothing posted. |
| C8 | Bank transactions | Source of bank data (statement import or bank API). | No source exists. |

**Approval, recognition and cash are different events.**

- *Approval* authorizes something, such as an expense request. On its own it has no accounting effect.
- *Recognition* is when revenue, expense, an asset or a liability is recorded, such as an issued invoice.
- *Cash* is money actually moving, such as a confirmed payment or a recorded disbursement.

The source-event catalogue (`lib/accounting/source-events.ts`) labels every event with one of these.

## D. Multi-currency

| # | Decision | Safe default |
|---|---|---|
| D1 | **Approved exchange-rate source**, for example the Bank of Uganda mid-rate or the bank's actual rate. | Rates are entered by a person and approved by a second person. Nothing is fetched or estimated. |
| D2 | **Rate date rule**: transaction date, or the closest prior business day. | The preparer chooses an approved rate on the line. |
| D3 | **Exchange differences** on settlement and revaluation of foreign balances at period end. | Not calculated. Accounts 7200 and 8200 are proposed. |
| D4 | **Enable multi-currency posting.** | **Impossible in Phase 2A.** A `CHECK` constraint holds it off; a reviewed migration must lift it. Foreign-currency lines can be drafted with an approved rate but cannot be posted. |

Different currencies are never added together. A journal must balance in every transaction currency on its own and in functional currency.

## E. Tax

No tax rule exists or is computed anywhere in the accounting engine. VAT, withholding tax, PAYE and income-tax accounts in the proposed chart are placeholders only (see `docs/CALACOT_CHART_OF_ACCOUNTS.md`, item 3). A tax adviser must confirm registration status and treatment before any rule uses them.

## F. Period close

| # | Decision | Current behaviour |
|---|---|---|
| F1 | Close timing, for example within 10 working days of month end, and the checklist. | Closing is manual. It is refused while journals dated in the period await approval or posting. |
| F2 | Who may reopen, and when. | `accounting_period_reopen`, administrators by default. A reason is required and recorded. Corrections to a closed month should normally be reversals dated in an open period. |
| F3 | Year-end close to retained earnings. | Not implemented in Phase 2A. |

## G. Migration from QuickBooks

| # | Decision |
|---|---|
| G1 | Cut-over date, and whether to migrate opening balances only or full history. |
| G2 | Account mapping from the QuickBooks chart to the Calacot chart. |
| G3 | Opening balances: source report, approval and reconciliation. Use account 3900 only for the approved balancing figure. |
| G4 | How existing open invoices, unallocated payments and unpaid approved expenses are represented on day one. |

No opening balances are created or invented in Phase 2A.
