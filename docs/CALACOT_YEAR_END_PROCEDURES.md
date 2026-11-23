# Calacot year-end procedures

**Status:** implemented and tested on synthetic data only. No real year has been closed.
**Audience:** the accountant, the person preparing year-end, and the year-end approver.

## YE-1 Before year-end

1. Close periods 1 to n−1 of the financial year through Period closing.
2. Post final adjustments for the year: accruals, depreciation, tax provision and corrections (Adjustments page). Each one is reviewed by a second person.
3. Review the tax provision. The final period's checklist requires an approved income-tax computation for the year (Phase 2D), or an approved exception explaining why not.
4. Start the close of the **final period**, record its evidence and **submit** it. Do not approve it separately: the year-end approval closes it.
5. Prepare a **financial year** statement set covering exactly the financial year, and have a different person approve it. It must be free of provisional items and must match the current ledger.

## YE-2 Preparing the year-end (`close_start`)

`year_end_prepare` checks the following. **[enforced]**

- An approved classification exists.
- Every other period of the year is closed and the final period is open.
- The final period's close is submitted.
- The chosen annual statement set is approved, covers exactly the year and still matches the ledger.
- No earlier year-end is pending.

It then builds the **closing journal**, dated the last day of the year:

- Every income and expense account is closed to zero at its cumulative balance. Results of any earlier year that was never closed are therefore transferred too.
- The net result is posted to the retained earnings account named in the classification.

The journal is submitted for approval. Year-end journals (and their reversals) can only change status inside the year-end functions. The ordinary journal screens are refused (`year_end_journal_controlled`). **[enforced]**

**Idempotency:** each financial year can have only one live year-end (`prepared` or `closed`). This is enforced by a unique index plus an advisory lock. Retrying with the same key returns the same record, and a second preparation is refused. **[enforced]**

## YE-3 Approval (`year_end_approve`)

The approver must be a different person from the preparer, and from the final close's preparer and submitter. In **one transaction**, the database does the following. **[enforced]**

1. Confirms that nothing has been posted to the year since preparation (ledger fingerprint) and that the annual statements are still approved.
2. Approves and posts the closing journal.
3. Re-runs the final period's checklist and closes it.
4. Marks the year-end closed.

Two simultaneous approvals produce one closing. The other is refused, and retained earnings receive the result exactly once (verified on real PostgreSQL). A rejection with a reason rejects the closing journal, and the year can then be prepared again.

## YE-4 Opening balances of the next year

There is no opening-balance journal and nothing is copied. Balance-sheet accounts carry forward because the ledger is cumulative. Income and expense accounts start the new year at zero because of the closing journal. The new year's trial balance shows the opening debits and credits (verified: retained earnings open with the prior year's result). Historical journals are never reset or deleted. **[enforced]**

The closing journal is excluded from period results. The year's income statement and comparatives are therefore unchanged by closing, and the transfer appears in the statement of changes in equity as a movement within equity. **[enforced]**

## YE-5 Reopening a year (`close_reopen`)

`year_end_reopen` needs a reason of at least 10 characters and is refused if a later year is prepared or closed. In one transaction it does the following. **[enforced]**

1. Reopens the final period.
2. Marks its close as reopened.
3. Reverses the closing journal with a linked reversal dated the year end. Both entries stay in the ledger.
4. Marks the year-end as reopened.

A new year-end then needs a new final-period close and a newly approved annual statement set. The earlier set is now stale and is superseded on the new approval.

## YE-6 Decisions needed

1. Calacot's financial year and the first year to close in this system (cut-over from QuickBooks).
2. Approved opening balances at cut-over, from evidence. They are never invented.
3. Who approves year-end, and whether the external accountant reviews the annual statements before approval.
4. Policy on prior-period corrections after a year is closed: either reopen the year, or record a prior-period correction in the current year.
