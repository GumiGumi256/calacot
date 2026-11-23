# Calacot cash management policy

**Status:** implemented controls (Phase 2C) plus policy decisions that still need approval (marked **Decision needed**). Nothing here is active in production.
**Audience:** finance staff who prepare cash transactions, custodians of cash and petty cash, approvers, and the accountant.

Rules marked **[enforced]** are enforced by the database (`drizzle-current/0021_banking_reconciliation.sql`) for every writer. The rest are working practice.

## C-1 Principles

1. **One ledger.** Every cash operation produces one ordinary manual journal through the Phase 2A journal functions. There is no separate cash book: balances come from posted journal lines. **[enforced]**
2. **Two people.** The person who prepares a cash transaction cannot approve or post it. Approval and posting happen together, by a different person with `cash_approve`. **[enforced]**
3. **Nothing posts without an open period and the approved accounting policy.** Posting into a closed or missing accounting period, or while manual posting is disabled, is refused. **[enforced]**
4. **Same currency only.** Every line of a cash journal is in the account's currency. Only the functional currency (UGX) can post until a multi-currency policy is approved. No exchange rate is ever assumed. **[enforced]**
5. **Immutable records.** Cash transactions, cash counts and evidence are never edited or deleted. A mistake that was not yet approved is cancelled by its preparer or rejected by a reviewer, with a reason. A mistake that was posted is corrected by reversing the journal. **[enforced]**
6. **Suspended or removed staff lose access immediately.** Every command checks the Clerk membership live and requires an active staff record. **[enforced]**

## C-2 Accounts and categories

1. Every account used for cash must be registered under Banking & cash and have an **approved ledger mapping** (two people). **[enforced]**
2. Category accounts decide where non-transfer amounts post. Each is proposed by one person and approved by another. Required types: **[enforced]**

| Category | Ledger account type | Suggested account | Decision needed |
|---|---|---|---|
| Bank and mobile-money charges | Expense | 6910 Bank and mobile-money charges | Confirm |
| Interest received | Income | 7100 Interest income | Confirm |
| Interest charged | Expense | 8100 Interest and finance costs | Confirm |
| Cash shortages | Expense | 6990 General and administrative, or a new 69xx "Cash shortages" | **Choose** |
| Cash overages | Income | 7900 Sundry income | Confirm |
| Staff advances | **Asset** (never an expense) | 1230 Staff advances and imprests | Confirm |

3. **Decision needed:** ledger sub-accounts per company account (for example `1120-01` Stanbic UGX, `1130-01` MTN, `1130-02` Airtel, `1110-01` head-office petty cash), because one ledger account can represent only one company account.

## C-3 Cash receipts and payments

1. A receipt or payment moves money between a company account and an **outside** party, against an active ledger account that allows manual journals. **[enforced]**
2. **Customer invoice payments are not recorded here.** They follow the invoice payment workflow, which keeps invoice balances and allocations unchanged.
3. A receipt or payment cannot use another company account's ledger account (use a transfer) or the staff advances account (use an advance). **[enforced]**
4. Control accounts (trade receivables, payables, unallocated receipts) cannot be used. **[enforced]**
5. Dates cannot be in the future. Amounts are positive with at most two decimals. **[enforced]**
6. Attach evidence (receipt, invoice, mobile-money confirmation) whenever one exists.

## C-4 Transfers between company accounts

1. A transfer is **one** record and **one** journal: debit the receiving account, credit the sending account. It is never income or expense. **[enforced]**
2. Both accounts must be active, mapped, different, and in the same currency. **[enforced]**
3. A transfer reference is required. The same transfer (same pair of accounts in either direction, same date, amount and normalized reference) cannot be recorded twice while the first is live, even when two people submit it at the same moment from opposite sides. **[enforced, verified with concurrent connections]**
4. When the transfer appears on both bank statements, each statement line is matched to its side of the single journal.
5. Moving money to or from an outside party is never a transfer.

## C-5 Petty cash (imprest)

1. Each petty cash account has a named **custodian** (an active employee) and may have an **approved float**. **[enforced]**
2. Replenishment is a transfer into petty cash. It is refused if the posted petty cash balance plus pending replenishments plus the new amount would exceed the float. **[enforced]**
3. Spending from petty cash is recorded as a cash payment from the petty cash account, with evidence.
4. Changing the custodian or the float requires a written reason and is audited. **[enforced]**
5. **Decision needed:** float amounts per location, the maximum single payment from petty cash, and whether replenishment requires the custodian's spending to be posted first.

## C-6 Staff advances and accountability

1. An advance is cash given to an employee for company spending. It is posted to the **staff advances asset account**, never to an expense. **[enforced]**
2. Advances can only be given to active employees. **[enforced]**
3. The employee accounts for the advance with **evidence**: spending lines charged to expense or cost-of-sales accounts, and any unspent cash returned into a company account. **[enforced]**
4. An advance must be posted before it can be accounted for. The total accounted can never exceed the amount still outstanding, counting accountabilities awaiting approval. A rejected or cancelled accountability releases its amount. **[enforced]**
5. The expense is recognized only when the accountability is approved and posted.
6. Outstanding advances are reported by employee with the oldest date.
7. **Decision needed:** maximum outstanding per employee, the deadline for accountability (for example 14 days), and the treatment of unaccounted balances (deduction from pay requires HR and legal approval; nothing is automated).

## C-7 Cash counts, shortages and overages

1. Count cash and petty cash at least monthly, at custodian handover, and at year end. **Decision needed:** confirm the frequency.
2. A count records the account, date, amount counted, optional denominations, an optional witness (who must not be the counter) and optional evidence. The system records the posted book balance on that date and the difference. It also records how many journals for the account were not yet posted at the time, so a difference caused by unposted work is visible. **[enforced]**
3. **Decision needed:** whether a witness is mandatory for every count.
4. A non-zero difference needs an **adjustment** to the approved shortage or overage account, with **evidence** and a written explanation, approved by a different person. One live adjustment per count. **[enforced]**
5. Repeated or material shortages are escalated to management. The system reports every difference; it does not decide materiality.

## C-8 Bank charges and interest

See the reconciliation rules (§6). Charges and interest are recognized only through a classified statement line, an approved category account and a second person's approval. Unexplained balancing entries do not exist in the system.

## C-9 Evidence

1. Evidence files are PDF, JPEG, PNG or WebP, up to 10 MB. The type is detected from the content, not the file name. Files are stored privately and never served publicly. **[enforced]**
2. Evidence is required for advance accountability and cash count adjustments, and recommended for every receipt and payment. **[enforced for the first two]**

## C-10 Reporting

The Banking & cash reports page shows, per currency (never combined): book, statement and reconciled balances; reconciliation progress; unmatched bank lines; cash movement by month; advances outstanding; cash count differences; transfers; and bank charges, interest and cash differences recognized. Provider-confirmed balances are not available.

## C-11 Approval authority

| Permission | Default holders | Delegation |
|---|---|---|
| `cash_create` (prepare transactions, counts, evidence) | Administrators, Finance | Clerk custom permission `org:calacot:cash_create` |
| `cash_approve` (approve and post cash and bank adjustments) | Administrators only | `org:calacot:cash_approve` (for example to the company accountant) |
| `banking_manage` (register accounts, propose mappings) | Administrators, Finance | `org:calacot:banking_manage` |
| `accounting_policy_approve` (approve mappings and category accounts) | Administrators only | `org:calacot:accounting_policy_approve` |

**Decision needed:** who outside the administrators approves cash (`cash_approve`), and whether amounts above a threshold need a second approver. Approval thresholds are not implemented.
