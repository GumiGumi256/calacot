# Calacot opening balance reconciliation

**Status: NOT PERFORMED for Calacot.** No historical records were available, no cutoff has been decided, and no opening balance exists in any system. This document is the reconciliation **form** that must be completed and signed. Its controls were proven on a synthetic schedule (§3).
**Audience:** the accountant who prepares and signs the opening position, and the approver.

## 1. Header (to complete)

| Item | Value |
|---|---|
| Cutoff date | **Decision needed** |
| Source of records (accounting software / spreadsheet / accountant's schedule / audited statements / other) | **Decision needed** (QuickBooks is unverified) |
| Evidence reference (signed trial balance, audit file) | |
| Batch ID in Calacot (Accounting → Opening balances) | |
| Prepared by / date | |
| Approved by (a different person) / date | |
| Accountant sign-off / date | |

## 2. Reconciliation schedule (to complete from the approved batch)

Each line is checked by `migration_batch_validate`. A failed line blocks approval, and no difference is ever adjusted automatically.

| # | Balance | Source schedule | Trial balance | Difference | Explanation | Status |
|---|---|---|---|---|---|---|
| 1 | Trial balance debits = credits | – | | | | |
| 2 | Cash and bank (per statements or counts at cutoff, per account) | | | | | |
| 3 | Receivables (open invoices) = control account | | | | | |
| 4 | Customer deposits and advances | | | | | |
| 5 | Payables (unpaid supplier balances) = control account | | | | | |
| 6 | Supplier advances ≤ advances and prepayments | | | | | |
| 7 | Fixed assets: register cost and net book value | | | | | |
| 8 | Tax liabilities and prepayments (per URA evidence) | | | | | |
| 9 | Share capital (per register of members) | | | | | |
| 10 | Retained earnings (per last approved statements) | | | | | |
| 11 | Opening balance equity (3900): must be explained and cleared | | | | | |
| 12 | No ledger entries on or before the cutoff | | | | | |
| 13 | No pre-cutoff automatic-posting events pending or posted | | | | | |
| 14 | No post-cutoff Calacot invoice in opening receivables | | | | | |

## 3. Control proof on a synthetic schedule (not Calacot data)

`scripts/verify-migration-staging-db.mts` staged this synthetic position at a year-end cutoff:

| Account | Debit | Credit |
|---|---|---|
| 1120 Bank | 5,000,000.00 | |
| 1200 Receivables | 1,200,000.00 | |
| 1240 Prepayments | 100,000.00 | |
| 1540 Computers | 3,000,000.00 | |
| 1590 Accumulated depreciation | | 600,000.00 |
| 2110 Payables | | 700,000.00 |
| 2130 Customer deposits | | 400,000.00 |
| 2195 Income tax payable | | 300,000.00 |
| 3100 Share capital | | 5,000,000.00 |
| 3200 Retained earnings | | 2,300,000.00 |
| **Total** | **9,300,000.00** | **9,300,000.00** |

Each control was then exercised:

| Control | Result |
|---|---|
| Receivables schedule loaded at 1,100,000 against 1,200,000 in the trial balance | Failed with a difference of 100,000; submission refused; nothing adjusted |
| Every other schedule (payables, deposits, supplier advance, bank statement, tax, asset register at cost 3,000,000 and net 2,400,000) | Agreed |
| A USD row | Failed the functional-currency check; nothing converted |
| A journal awaiting approval dated before the cutoff | Failed the ledger check until that journal was rejected |
| Self-approval | Refused |
| Changes after submission | Refused, including by direct SQL |
| A second approval | Superseded the first; both kept |
| Ledger effect | **None.** No journal was created at any step. |

## 4. Sign-off

> I have reviewed the opening balances at the cutoff above, agreed each schedule to its evidence, and confirm the trial balance in the approved batch is the opening position of Calacot Group Uganda Ltd.
>
> Accountant: ______________________ Date: __________

**This sign-off has not been given.**
