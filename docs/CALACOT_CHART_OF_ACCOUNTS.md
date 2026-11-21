# Calacot Chart of Accounts (proposed)

**Status: PROPOSAL — not approved.** Nothing in this chart is active in any database. It needs review and approval by Calacot's accountant before use.

The data lives in `lib/accounting/chart.ts`, and this document is generated from that file. The system loads exactly this chart, so if the two ever disagree, the code is authoritative.

## How the chart is organised

- **Accounts are company-wide and classified by nature:** cash, receivables, revenue type, expense type.
- **Divisions are dimensions, not accounts.** Painting, Architecture, Interiors, Estates and Technology are *not* separate accounts. Every journal line may carry a **division** and a **project**, and choosing a project fills in its division automatically. Division and project results come from the same accounts, filtered by dimension. This keeps the chart small, avoids duplicating every revenue and expense account five times, and lets a project's figures be read directly.
- **Codes have four digits by range:** 1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx income, 5xxx cost of sales, 6xxx operating expenses, 7xxx other income, 8xxx other expenses. A suffix such as `1120-01` can split one account into specific bank accounts.
- **Header accounts** (in bold) group sub-accounts and cannot receive entries.
- **Contra accounts** carry the opposite normal balance to their type, for example accumulated depreciation, or credit notes against revenue.
- **Control accounts** (1200 Trade receivables, 2110 Trade payables, 2140 Unallocated customer receipts) are refused in manual journals by the database. They must only change through the sub-ledger postings that a later phase will introduce, so their balances always reconcile to invoices, payments and suppliers.
- **Currency restrictions:** 1121 Bank – USD accepts only USD lines. While multi-currency posting is disabled, USD lines cannot be posted at all.

## How it is approved and activated

1. Someone with Finance rights opens **Accounting → Chart of accounts** and selects **Load proposed Calacot chart**. Every account is created with status *proposed*. Existing codes are never overwritten.
2. The accountant reviews the chart: edits, renames or removes (by not approving) accounts, and adds any missing ones while they are still *proposed*.
3. A person holding `accounting_policy_approve` approves the chart. The approver must be a different person from whoever proposed each account; the database enforces this. Parents are activated before children.
4. Once active, an account's code, type, parent and posting status are fixed. Only its name, description, reporting classification, control flag and currency restriction can change, and every change is recorded.
5. An account can only be deactivated when its posted balance is zero and no journal awaiting approval uses it. Accounts are never deleted.

## Proposed accounts

| Code | Account | Type | Classification | Normal balance | Notes |
|---|---|---|---|---|---|
| 1000 | **Assets** | Asset | — | debit | Header |
| 1100 | &nbsp;&nbsp;&nbsp;&nbsp;**Current assets** | Asset | — | debit | Header |
| 1110 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Petty cash | Asset | Current asset | debit |  |
| 1120 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Bank - UGX operating account | Asset | Current asset | debit | UGX only |
| 1121 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Bank - USD account | Asset | Current asset | debit | USD only. To confirm: Requires approved exchange-rate policy before use. |
| 1130 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Mobile money wallets | Asset | Current asset | debit | UGX only |
| 1140 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Cash in transit / undeposited receipts | Asset | Current asset | debit |  |
| 1200 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Trade receivables | Asset | Current asset | debit | Control account (no manual journals) |
| 1210 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Allowance for expected credit losses | Asset | Current asset | credit | Contra. To confirm: Impairment policy required. |
| 1220 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Other receivables | Asset | Current asset | debit |  |
| 1230 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Staff advances and imprests | Asset | Current asset | debit |  |
| 1240 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Prepayments and deposits paid | Asset | Current asset | debit |  |
| 1250 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Materials and supplies inventory | Asset | Current asset | debit | To confirm: Inventory costing method required. |
| 1255 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Property held for sale | Asset | Current asset | debit | To confirm: Confirm whether Estates holds property as inventory, investment property or agent only. |
| 1260 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Contract assets and unbilled work | Asset | Current asset | debit | To confirm: Revenue-recognition policy required. |
| 1270 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;VAT recoverable (input VAT) | Asset | Current asset | debit | To confirm: Tax adviser to confirm VAT registration and treatment. No tax is computed. |
| 1280 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Withholding tax receivable | Asset | Current asset | debit | To confirm: Tax adviser to confirm. No tax is computed. |
| 1500 | &nbsp;&nbsp;&nbsp;&nbsp;**Non-current assets** | Asset | — | debit | Header |
| 1510 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Land and buildings | Asset | Non-current asset | debit |  |
| 1520 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Motor vehicles | Asset | Non-current asset | debit |  |
| 1530 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Furniture and office equipment | Asset | Non-current asset | debit |  |
| 1540 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Computer equipment | Asset | Non-current asset | debit |  |
| 1550 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Tools and site equipment | Asset | Non-current asset | debit |  |
| 1590 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Accumulated depreciation | Asset | Non-current asset | credit | Contra. To confirm: Depreciation policy required. |
| 1610 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Software and intangible assets | Asset | Non-current asset | debit |  |
| 1690 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Accumulated amortisation | Asset | Non-current asset | credit | Contra |
| 2000 | **Liabilities** | Liability | — | credit | Header |
| 2100 | &nbsp;&nbsp;&nbsp;&nbsp;**Current liabilities** | Liability | — | credit | Header |
| 2110 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Trade payables | Liability | Current liability | credit | Control account (no manual journals) |
| 2120 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Accrued expenses | Liability | Current liability | credit |  |
| 2130 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Customer deposits and advances | Liability | Current liability | credit | To confirm: Revenue-recognition policy required. |
| 2140 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Unallocated customer receipts | Liability | Current liability | credit | Control account (no manual journals) |
| 2150 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Staff reimbursements payable | Liability | Current liability | credit |  |
| 2160 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;PAYE payable | Liability | Current liability | credit | To confirm: Payroll is outside this system; confirm before use. |
| 2170 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;NSSF payable | Liability | Current liability | credit | To confirm: Payroll is outside this system; confirm before use. |
| 2180 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;VAT payable (output VAT) | Liability | Current liability | credit | To confirm: Tax adviser to confirm VAT registration and treatment. No tax is computed. |
| 2190 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Withholding tax payable | Liability | Current liability | credit | To confirm: Tax adviser to confirm. No tax is computed. |
| 2195 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Income tax payable | Liability | Current liability | credit | To confirm: Tax adviser to confirm. |
| 2200 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Short-term borrowings | Liability | Current liability | credit |  |
| 2500 | &nbsp;&nbsp;&nbsp;&nbsp;**Non-current liabilities** | Liability | — | credit | Header |
| 2510 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Long-term borrowings | Liability | Non-current liability | credit |  |
| 2520 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Shareholder and director loans | Liability | Non-current liability | credit |  |
| 3000 | **Equity** | Equity | — | credit | Header |
| 3100 | &nbsp;&nbsp;&nbsp;&nbsp;Share capital | Equity | Equity | credit |  |
| 3200 | &nbsp;&nbsp;&nbsp;&nbsp;Retained earnings | Equity | Equity | credit |  |
| 3300 | &nbsp;&nbsp;&nbsp;&nbsp;Dividends and owner drawings | Equity | Equity | debit | Contra |
| 3900 | &nbsp;&nbsp;&nbsp;&nbsp;Opening balance equity | Equity | Equity | credit | To confirm: Use only for accountant-approved migration balances. |
| 4000 | **Income** | Income | — | credit | Header |
| 4100 | &nbsp;&nbsp;&nbsp;&nbsp;Design and consultancy fees | Income | Operating revenue | credit |  |
| 4200 | &nbsp;&nbsp;&nbsp;&nbsp;Contract and installation works | Income | Operating revenue | credit | To confirm: Revenue-recognition policy for contracts (point in time vs over time) required. |
| 4300 | &nbsp;&nbsp;&nbsp;&nbsp;Design plan sales | Income | Operating revenue | credit |  |
| 4400 | &nbsp;&nbsp;&nbsp;&nbsp;Property sales | Income | Operating revenue | credit | To confirm: Confirm whether Estates sells property as principal. |
| 4410 | &nbsp;&nbsp;&nbsp;&nbsp;Agency and brokerage commissions | Income | Operating revenue | credit |  |
| 4500 | &nbsp;&nbsp;&nbsp;&nbsp;Property management and rental income | Income | Operating revenue | credit |  |
| 4600 | &nbsp;&nbsp;&nbsp;&nbsp;Technology services and software | Income | Operating revenue | credit |  |
| 4900 | &nbsp;&nbsp;&nbsp;&nbsp;Sales discounts and credit notes | Income | Operating revenue | debit | Contra |
| 5000 | **Cost of sales** | Cost of sales | — | debit | Header |
| 5100 | &nbsp;&nbsp;&nbsp;&nbsp;Direct materials and supplies | Cost of sales | Cost of sales | debit |  |
| 5200 | &nbsp;&nbsp;&nbsp;&nbsp;Subcontractors and direct labour | Cost of sales | Cost of sales | debit |  |
| 5300 | &nbsp;&nbsp;&nbsp;&nbsp;Site and project expenses | Cost of sales | Cost of sales | debit |  |
| 5400 | &nbsp;&nbsp;&nbsp;&nbsp;Cost of property sold | Cost of sales | Cost of sales | debit |  |
| 5500 | &nbsp;&nbsp;&nbsp;&nbsp;Software, hosting and licences (direct) | Cost of sales | Cost of sales | debit |  |
| 6000 | **Operating expenses** | Operating expense | — | debit | Header |
| 6100 | &nbsp;&nbsp;&nbsp;&nbsp;Salaries and wages | Operating expense | Operating expense | debit |  |
| 6110 | &nbsp;&nbsp;&nbsp;&nbsp;Staff benefits and employer NSSF | Operating expense | Operating expense | debit |  |
| 6200 | &nbsp;&nbsp;&nbsp;&nbsp;Rent and utilities | Operating expense | Operating expense | debit |  |
| 6300 | &nbsp;&nbsp;&nbsp;&nbsp;Marketing and advertising | Operating expense | Operating expense | debit |  |
| 6400 | &nbsp;&nbsp;&nbsp;&nbsp;Transport and travel | Operating expense | Operating expense | debit |  |
| 6500 | &nbsp;&nbsp;&nbsp;&nbsp;Communication and internet | Operating expense | Operating expense | debit |  |
| 6600 | &nbsp;&nbsp;&nbsp;&nbsp;Professional fees | Operating expense | Operating expense | debit |  |
| 6700 | &nbsp;&nbsp;&nbsp;&nbsp;Office supplies and stationery | Operating expense | Operating expense | debit |  |
| 6800 | &nbsp;&nbsp;&nbsp;&nbsp;Repairs and maintenance | Operating expense | Operating expense | debit |  |
| 6900 | &nbsp;&nbsp;&nbsp;&nbsp;Depreciation and amortisation | Operating expense | Operating expense | debit |  |
| 6910 | &nbsp;&nbsp;&nbsp;&nbsp;Bank and mobile-money charges | Operating expense | Operating expense | debit |  |
| 6920 | &nbsp;&nbsp;&nbsp;&nbsp;Insurance | Operating expense | Operating expense | debit |  |
| 6930 | &nbsp;&nbsp;&nbsp;&nbsp;Licences, permits and subscriptions | Operating expense | Operating expense | debit |  |
| 6940 | &nbsp;&nbsp;&nbsp;&nbsp;Expected credit losses and bad debts | Operating expense | Operating expense | debit |  |
| 6990 | &nbsp;&nbsp;&nbsp;&nbsp;General and administrative expenses | Operating expense | Operating expense | debit |  |
| 7000 | **Other income** | Other income | — | credit | Header |
| 7100 | &nbsp;&nbsp;&nbsp;&nbsp;Interest income | Other income | Other income | credit |  |
| 7200 | &nbsp;&nbsp;&nbsp;&nbsp;Foreign exchange gains | Other income | Other income | credit | To confirm: Exchange-difference policy required. |
| 7300 | &nbsp;&nbsp;&nbsp;&nbsp;Gain on disposal of assets | Other income | Other income | credit |  |
| 7900 | &nbsp;&nbsp;&nbsp;&nbsp;Sundry income | Other income | Other income | credit |  |
| 8000 | **Other expenses** | Other expense | — | debit | Header |
| 8100 | &nbsp;&nbsp;&nbsp;&nbsp;Interest and finance costs | Other expense | Finance cost | debit |  |
| 8200 | &nbsp;&nbsp;&nbsp;&nbsp;Foreign exchange losses | Other expense | Other expense | debit | To confirm: Exchange-difference policy required. |
| 8300 | &nbsp;&nbsp;&nbsp;&nbsp;Loss on disposal of assets | Other expense | Other expense | debit |  |
| 8900 | &nbsp;&nbsp;&nbsp;&nbsp;Income tax expense | Other expense | Income tax expense | debit | To confirm: Tax adviser to confirm. |

**Totals:** 88 accounts, of which 76 can receive entries and 12 are headers. 20 accounts are marked *To confirm*.

## Items the accountant must confirm

1. **Revenue recognition.** Accounts 4200 (contract works), 1260 (contract assets) and 2130 (customer deposits) depend on whether contract revenue is recognised at invoice, on completion or over time.
2. **Estates.** Does Estates sell property as principal (4400 sales, 5400 cost of sales, 1255 property held for sale)? Does it act only as an agent (4410 commissions)? Does it hold investment property? Remove the accounts that do not apply.
3. **Tax accounts** (1270, 1280, 2160–2195, 8900) are placeholders only. Phase 2A computes no tax. VAT registration, withholding tax and PAYE treatment must be confirmed by a tax adviser before any rule uses them.
4. **Bank and mobile-money accounts.** Decide whether each verified payment account (Finance → Payment accounts) gets its own ledger account, for example `1120-01`, or whether accounts are pooled.
5. **Inventory (1250).** Decide whether materials are held as stock or expensed on purchase, and the costing method if held.
6. **Depreciation (1590, 6900)**, **impairment (1210, 6940)** and **exchange differences (7200, 8200)** need policies before use.
7. **Opening balance equity (3900)** is reserved for the approved QuickBooks migration. No opening balances are created in Phase 2A.
8. **Expense categories.** Map the free-text categories on existing expense requests to the 5xxx and 6xxx accounts. This mapping is a prerequisite for automatic posting of disbursements.
