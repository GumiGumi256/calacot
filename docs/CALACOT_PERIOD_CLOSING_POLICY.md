# Calacot period closing policy (system controls)

**Status:** controls implemented in Phase 2E; no real period has been closed. **[enforced]** marks rules the database enforces. **Decision needed** marks policy that management must set.
**Audience:** the accountant, finance staff who prepare closes, and close approvers.

## PC-1 Close policy

1. A versioned close policy, proposed by one person (`close_start`) and approved by another (`close_approve`), sets the following. **[enforced]**
   - Whether bank and mobile-money reconciliations must be finalized to the period end.
   - Whether cash and petty cash must be counted in the period.
   - The tolerance for clearing accounts.
   - The list of required evidence items.
2. **Once any close policy has been approved, periods can only be closed or reopened through Period closing.** The old Periods command is refused (`period_close_controlled`), and so is direct SQL. Before a policy is approved, the Phase 2A behaviour is unchanged. **[enforced]**
3. The financial year comes from the approved accounting policy's start month. Nothing assumes January or July. Periods cannot overlap and their dates cannot change after creation (Phase 2A). **[enforced]** **Decision needed:** Calacot's adopted financial year.

## PC-2 Workflow

| Step | Who | Rule |
|---|---|---|
| Start | `close_start` | The period is open and has ended, a close policy is approved, and there is one live close per period. **[enforced]** |
| Evidence | `close_start` | Each item records what it is and where it is kept. Evidence cannot be edited or deleted. **[enforced]** |
| Exception | Raised with `close_start`; decided with `close_approve` | The explanation must be at least 20 characters. The decider must be a different person. Some checks cannot be excepted (PC-3). **[enforced]** |
| Assign reviewer (optional) | `close_start` | The reviewer cannot be the preparer or submitter. Once assigned, only that person can approve. **[enforced]** |
| Submit | `close_start` | Every check must pass or carry an approved exception, and no exception may still be pending. The checklist is saved with the submission. **[enforced]** |
| Return | `close_approve` | A reason is required. **[enforced]** |
| Approve | `close_approve` | The approver differs from both the preparer and the submitter. Approval locks the period, re-runs every check on the committed ledger and closes the period, all in **one transaction**. **[enforced]** |
| Reopen | `close_reopen` | A reason of at least 10 characters is required. Later periods of the year must be reopened first. A year whose year-end is closed must have the year-end reopened first. **[enforced]** |

A crash at any step rolls the whole transaction back, so a period can never be left half-closed. **[enforced]** Every action is recorded in `fs_events` and `audit_logs`, and also in the Phase 2A period history. **[enforced]**

## PC-3 Month-end checklist (computed live)

| Check | Can be excepted? |
|---|---|
| Earlier periods of the financial year are closed | No |
| No journals awaiting approval or posting in the period | No |
| Trial balance agrees | No |
| No draft journals dated in the period | Yes |
| Source transactions processed (no pending, blocked or failed integration events) | Yes |
| Receivables, payables and receipts reconcile to their control accounts (Phase 2B reconciliation; no unexplained difference) | Yes |
| Bank and mobile-money reconciliations finalized to the period end (if the policy requires) | Yes |
| Cash and petty cash counted in the period (if the policy requires) | Yes |
| Depreciation posted for the period (Phase 2D preview is zero) | Yes |
| No tax or asset journals awaiting approval | Yes |
| Clearing and suspense accounts within tolerance | Yes |
| Every account with activity is classified | Yes |
| No foreign-currency postings | Yes |
| Required evidence recorded | Yes |
| **Final period only:** an approved income-tax computation for the year (tax provision reviewed) | Yes |

A posting that races an approval either waits for the close and is then refused, or commits first and is seen by the re-run checks. Both cases are verified on real PostgreSQL. **[enforced]**

## PC-4 Adjusting and reversing entries

1. Adjustments (accrual, prepayment, deferral, provision, depreciation correction, reclassification, correction, prior-period correction) are ordinary manual journals. They need a reason of at least 10 characters and an evidence reference, and are submitted for review on creation. **[enforced]**
2. Approval and posting follow the Phase 2A rules: the journal must balance, be dated in an open period, and be approved by someone other than the preparer. Posted entries are immutable. **[enforced]** Reviewers use `fs_adjust_review` on the Adjustments page. The underlying journal can also be approved from Journals with `accounting_journal_approve`, under the same separation of duties.
3. An optional automatic reversal date must fall after the entry date. The reversal is posted on or after that date through the Phase 2A reversal engine, once only. **[enforced]**
4. A correction may name the posted journal it corrects. That journal itself is reversed through Journals. **[enforced: linked; reversal via the Phase 2A engine]**
5. Prior-period corrections must touch retained earnings and are shown separately in the statement of changes in equity. Closed periods are never posted into: corrections are dated in an open period. **[enforced]**

## PC-5 Decisions needed

1. Close calendar: how many working days after month end, and who prepares and who approves.
2. Required evidence list and clearing tolerance.
3. Whether bank reconciliation and cash counts are mandatory every month. The system default is yes.
4. Materiality for accepting exceptions.
5. Who besides administrators holds `close_approve`, `close_reopen` and `year_end_approve`.
