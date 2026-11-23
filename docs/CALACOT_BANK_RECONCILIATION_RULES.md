# Calacot bank reconciliation rules

**Applies to:** Phase 2C banking (`drizzle-current/0021_banking_reconciliation.sql`, Admin → Accounting → Banking & cash / Reconciliation).
**Audience:** finance staff who import statements and match transactions, the reviewer who finalizes reconciliations, and the accountant who approves policy.

Every rule below is enforced by the database for every writer, including direct SQL, unless marked *(application)*. Nothing in this document is a guideline the system relies on people to remember.

## 1. Three balances, never mixed

| Balance | Source | Shown as |
|---|---|---|
| **Book balance** | Posted general-ledger lines on the account's approved ledger account, in the account currency | "Book balance (posted ledger)" |
| **Statement balance** | The running balance on the latest imported statement line | "Statement balance, imported statement, *date*" |
| **Reconciled balance** | The closing statement balance of the latest finalized reconciliation | "Reconciled balance, finalized to *date*" |

There is no provider-confirmed balance: Calacot has no bank or mobile-money API connection. The system never shows one and never labels an imported figure as confirmed. Balances in UGX and USD are never added together and no exchange rate is ever assumed.

## 2. Accounts and ledger mappings

1. A bank or mobile-money account must be a **verified** Phase 1D payment account (Admin → Payment accounts). Each can be registered for banking **once** (`UNIQUE (organization_id, finance_account_id)`).
2. Cash, petty cash and clearing accounts have no external number. They are unique by type, currency and normalized name (so "Head office petty cash" and "HEAD-OFFICE petty cash" are the same).
3. Full account numbers are never displayed or returned by any banking read: only the last four characters.
4. Each banking account is represented by exactly **one** general-ledger account, and each ledger account represents at most one banking account (two partial unique indexes on approved mappings). MTN and Airtel wallets therefore need separate sub-accounts (e.g. `1130-01`, `1130-02`).
5. A mapping is **proposed** by one person and **approved by a different person** with `accounting_policy_approve`. The ledger account must be an active, postable, non-contra **asset** that allows manual journals, in the same currency (or currency-neutral). Control accounts (receivables, payables) are refused.
6. Mappings are never edited or deleted. An approved mapping can be **retired** with a reason, but only when no active match and no unfinished reconciliation depends on it.

An account without an approved mapping cannot import statements, be matched, be reconciled, or be used in a cash transaction.

## 3. Statement imports

1. **Format.** CSV, UTF-8, at most 2 MB and 10,000 rows, header row required. Dates must be ISO `YYYY-MM-DD` (ambiguous local formats are refused, never guessed). Amounts are plain decimals with at most two decimal places and no thousands separators. Either one signed **Amount** column, or **Debit** and **Credit** columns (only one populated per row). Optional columns: reference, currency, running balance. Other formats must be converted first; the extension point is `statementFormats` in `lib/accounting/statement-csv.ts`.
2. **Preview first** *(application)*. The file is parsed and validated and possible duplicates are shown before anything is saved. Preview writes nothing.
3. **Currency.** A row whose currency differs from the account currency rejects the whole file.
4. **No journals.** Importing records the statement only. It never creates, changes or posts a journal (verified by test).
5. **Immutable source records.** The original file is kept in private storage under a content-addressed key with its SHA-256. Imported rows can never be edited or deleted; only their duplicate-review status can change, once.
6. **Spreadsheet formulas.** Statement text is stored exactly as received and never evaluated. Text such as `=HYPERLINK(...)` is inert data. Any future export to a spreadsheet must apply `spreadsheetSafeCell()`.
7. **Idempotency.** Re-submitting the same request key, or the same file (same SHA-256) for the same account, adds nothing and reports the earlier import.

## 4. Duplicates and overlapping statements

Each row gets a fingerprint: account, date, amount, normalized description, normalized reference and its **occurrence number** within the file (so two genuinely identical rows in one statement stay two transactions).

| Situation | Result |
|---|---|
| Same fingerprint already live from an earlier statement | **Duplicate**: kept for the record, never counted, linked to the original |
| Same account, date and amount as a live line from another statement, but different text | **Needs review**: excluded from matching and reconciliation until a person decides |
| Dated on or before a finalized reconciliation's end | **Needs review**: cannot be accepted until that reconciliation is reopened |
| Otherwise | **Active** |

A live fingerprint can exist only once per account (`bank_statement_lines_live_uq`), even under concurrent overlapping imports. Imports for an account are serialized, so an overlapping import classifies its rows against the import that finished first.

Reviewing a row requires a written reason. "Genuine transaction" makes it active; "It is a duplicate" links it to the original and excludes it permanently.

## 5. Matching

A **match** links bank statement lines and **posted** ledger lines on the account's mapped ledger account, each with an explicit amount. Debits (money in) are positive, credits negative.

| Kind | Contents | Must balance |
|---|---|---|
| Match | ≥ 1 bank line and ≥ 1 ledger line (one-to-one, one-to-many, many-to-one) | bank total = ledger total |
| Bank reversal pair | ≥ 2 bank lines, no ledger | bank total = 0 |
| Ledger reversal pair | ≥ 2 ledger lines (e.g. a journal and its reversal), no bank | ledger total = 0 |
| Opening balance | ledger lines dated before the account's first reconciliation period | = that period's opening statement balance |
| Bank adjustment | a bank line and the posted adjustment journal prepared for it (created automatically on posting) | bank = ledger |

Rules:

1. **Availability.** The amounts matched against any line can never exceed the line, and must have the same sign. This is checked under a per-account lock by the matching function and again by a trigger on every inserted item, so two people cannot match the same amount at the same time (verified on real PostgreSQL with overlapping connections).
2. **Partial matches** leave an explicit residual on the line. A residual stays visible as unmatched until matched later. Partial matches, reversal pairs and opening balances require a written explanation.
3. **Suggestions are not matches.** The system suggests posted ledger lines on the same account with the same amount and currency within 7 days, scoring date closeness and an equal reference. An "exact match" means the same amount, the same date and the same reference. Suggestions are computed when the page is read and never stored; each one must be confirmed by a person with `banking_match`. **A matching reference alone is never treated as proof**: a suggestion requires the same account, currency and amount.
4. **Matching never changes the ledger.** Matches are a separate record; posted journals are immutable.
5. Matches are never edited or deleted. A wrong match is **cancelled** with a reason (the history is kept) and the lines become unmatched again.
6. A match counts *as at* a date only when every line in it is dated on or before that date. Its effective date is the latest of its lines' dates.

## 6. Bank charges, interest and corrections

1. An unmatched bank line that is a **bank charge**, **interest received** or **interest charged** is classified by a person with `banking_match`. The direction must fit: interest received is money in; charges and interest charged are money out.
2. Classification prepares a **draft manual journal** against the approved category account (§ Cash policy C-2) and the bank's ledger account, submitted for approval. It changes nothing until a **different person** with `cash_approve` approves and posts it. Posting is subject to the accounting policy and an open accounting period.
3. When posted, the journal is matched to its bank line automatically, in the same transaction.
4. One live adjustment per bank line. Lines that are already matched cannot be classified.
5. **Anything else is not an adjustment.** A missing receipt or payment is recorded as the real transaction (cash receipt/payment or the source workflow). A bank error is raised with the bank and resolved as a bank reversal pair when corrected. The system has no "balancing" or suspense adjustment and never creates one.

## 7. Reconciliation periods

1. **One unfinished period per account.** Periods are contiguous: a new period starts the day after the previous one ended, and its opening statement balance must equal the previous closing statement balance. The first period's opening balance is whatever the statement shows; ledger lines before it are matched to it with an *opening balance* match (§5) or remain listed as timing differences.
2. **Statement check:** opening statement balance + active statement lines dated in the period − closing statement balance = **0**.
3. **Balance equation** (as at the period end):

   closing statement balance
   \+ deposits in transit *(posted ledger money-in not matched as at the end)*
   − outstanding payments *(posted ledger money-out not matched as at the end)*
   − unmatched bank lines *(statement lines from the first period start to the end, not matched as at the end)*
   − closing book balance
   = **unexplained difference**, which must be **0**.

4. A period can be **submitted** (by someone with `banking_reconcile`) only when the statement check is 0, the difference is 0, **no bank line is unmatched** and **no line awaits duplicate review**. There is no materiality tolerance: every exception must be resolved by a match, an approved adjustment, or a duplicate decision.
5. A period is **finalized** by someone with `banking_reconcile_approve` who neither prepared nor submitted it. All figures are recomputed at that moment and must still reconcile. The reviewer can instead **return** it with a reason.
6. On finalization the complete figures are written to an **append-only snapshot**. Finalized periods lock their matches: no match dated on or before the end can be created or cancelled, and late statement lines dated in the period wait for review and cannot be accepted.
7. **Reopening** requires `banking_reconcile_reopen` and a reason, is allowed only for the latest period of the account, and is audited. Earlier snapshots are kept; each later finalization adds another.
8. Unposted journals on the account dated in or before the period are listed as a warning (they are not part of the book balance).
9. **After finalization**, the reconciliation page still recomputes the live figures. If someone later posts or reverses an entry dated inside a finalized period (the accounting period may still be open), the page shows the period as no longer reconciling, so the drift is visible and is corrected by an audited reopen. Closing the accounting period after reconciling prevents this.

## 8. Separation of duties summary

| Action | Permission | Second person required |
|---|---|---|
| View balances, statements, reconciliations | `banking_read` | No |
| Register accounts, propose ledger and category mappings | `banking_manage` | No |
| Approve, reject or retire mappings | `accounting_policy_approve` | **Yes**, not the proposer |
| Import statements | `banking_import` | No |
| Resolve duplicates, match, cancel matches, classify bank lines | `banking_match` | No (matching never changes the ledger) |
| Approve and post bank adjustments | `cash_approve` | **Yes**, not the preparer |
| Start, edit and submit reconciliations | `banking_reconcile` | No |
| Return or finalize reconciliations | `banking_reconcile_approve` | **Yes**, neither the preparer nor the submitter |
| Reopen a finalized reconciliation | `banking_reconcile_reopen` | Reason required; audited |

Every command is re-verified live with Clerk, refused from another origin, and refused for suspended or removed staff (the database requires an *active* staff record). Every command writes an append-only `banking_events` entry and an `audit_logs` entry.
