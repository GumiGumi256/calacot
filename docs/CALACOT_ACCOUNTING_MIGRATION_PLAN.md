# Calacot accounting migration plan

**Status:** process and staging tooling built and tested on synthetic data. **No Calacot historical records have been inspected, staged or migrated.** No opening balance exists in the system.
**Audience:** the accountant, management, and the people who will prepare and approve the opening position.

## M-1 What records exist (finding)

The repository contains **no historical accounting records**: no accounting-software export, spreadsheet or trial balance.

Earlier documents (Phase 2A) assumed Calacot used QuickBooks. **That is unverified.** The migration does not depend on any particular package. The source of every batch is recorded as one of the following:

- accounting software export;
- spreadsheet records;
- accountant's opening schedule;
- audited or filed financial statements;
- other documented source.

Calacot's **operational** records (invoices, payments, expenses) live in the production database. They were not read in this phase.

**Decision needed (M-1):** management must state what records exist for the years before the cutoff, who holds them and whether they were reviewed by an accountant or auditor.

## M-2 Approach: opening balances, not full history

The recommended approach is to **migrate opening balances at a cutoff date**, supported by schedules. Full historical transactions are **not** re-entered: re-keying history would duplicate effects and cannot be reconciled better than the signed opening position. History stays in the source records and is referenced through each row's `source_ref`.

**Cutoff:** the last day before the first Calacot accounting period, normally the end of a financial year. The system requires the cutoff to be the day before a period starts.

## M-3 Process (staging only)

| Step | Who | System support |
|---|---|---|
| 1. Source inventory | Management and accountant | Batch records source type, description and evidence reference |
| 2. Extract | Finance | CSV template (`kind, source_ref, source_account, account_code, counterparty, document_number, document_date, currency, amount, cost, accumulated, acquired`) |
| 3. Map | Finance and accountant | Each source account is mapped to a Calacot account code. The original label is kept in `source_account`. Unknown codes are refused. |
| 4. Load | Finance (`migration_prepare`) | **Accounting → Opening balances**. The browser checks the shape; the database checks mapping and duplicates. |
| 5. Reconcile | System | `migration_batch_validate`: see M-4 |
| 6. Submit | Finance | Only when every check passes. The validation and a SHA-256 of the rows are stored. |
| 7. Approve | Different person (`migration_approve`) | The batch is re-validated at approval and the row hash must be unchanged. The approver must differ from the preparer and submitter. |
| 8. Opening journal | **Not built** (activation step) | See M-6 |

Rows can change only while the batch is a draft, and only through the loader. Batches and events cannot be edited or deleted. A newer approval supersedes the older batch, and both are kept.

## M-4 Reconciliation checks (all must pass)

| Check | Rule |
|---|---|
| Trial balance present and balanced | Debits = credits |
| Functional currency | Every row is in the approved functional currency. Nothing is converted. |
| Accounts | Every mapped account is approved, active, postable and classified for the statements |
| Ledger empty to cutoff | No journal is submitted, approved or posted on or before the cutoff. Otherwise the opening balances would duplicate it. |
| Cutoff boundary | The day after the cutoff starts an accounting period |
| Receivables | Open invoices = receivables control account |
| Payables | Unpaid supplier balances = payables control account |
| Customer advances | Deposit schedule = customer-advance liability accounts |
| Supplier advances | Supplier advances ≤ advances and prepayments |
| Bank and cash | Every cash or bank balance has a statement or count at the cutoff, and they agree |
| Tax | Tax liability and prepayment schedules agree with their accounts |
| Fixed assets | Register cost and net book value = ledger cost and cost less accumulated depreciation |
| Invoices after cutoff | No opening receivable is a Calacot invoice issued after the cutoff |
| Source events before cutoff | No automatic-posting event dated on or before the cutoff is pending or posted. Pre-cutoff transactions are represented by the opening balances only. |
| Information only | Overlap with the currently approved batch; amount left in opening balance equity (3900), which must be explained and cleared |

**Differences are shown, never adjusted.** There is no balancing row and no automatic plug to 3900.

## M-5 Preventing double counting

1. **Ledger:** the batch fails if any journal is dated on or before the cutoff.
2. **Operational records:** a pre-cutoff invoice still open at the cutoff is in the opening receivables schedule. Its Phase 2B source event must therefore be marked *no effect* before automatic posting goes live, and the check fails until that is done.
3. **Post-cutoff invoices** in the opening schedule are refused.
4. **Each source record** appears once per kind per batch.
5. **One approved batch** exists at a time.

## M-6 From approved batch to ledger (activation step, not built)

The opening journal will be created in a separately reviewed change:

- one journal dated the cutoff + 1 (the first day of the first period), or the cutoff in a dedicated opening period;
- built only from an approved batch whose hash still matches;
- posted through the Phase 2A posting gate with two-person approval;
- linked to the batch;
- at most once per organization, enforced by a unique link like `year_end_closes`.

Fixed-asset register records will be created through the Phase 2D opening-capitalization source ("opening balance at cut-over"), not re-entered by hand. This step is deliberately absent so that nothing can reach the ledger before the policies (`docs/CALACOT_ACCOUNTING_POLICY_REGISTER.md`) are approved.

## M-7 Rollback

- **Before approval:** reject the batch (it stays in history).
- **After approval and before the opening journal:** approve a corrected batch, which supersedes the earlier one.
- **After the opening journal (future):** reverse it with a linked reversal; never delete it.

## M-8 Sign-off record

The migration file kept by finance must contain:

- the source inventory;
- the signed trial balance at the cutoff;
- each schedule (receivables, payables, deposits, supplier advances, bank statements and counts, asset register, tax evidence);
- the account mapping;
- the approved batch with its validation and row hash;
- the accountant's sign-off.
