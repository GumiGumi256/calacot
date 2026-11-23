# Calacot accounting browser acceptance checklist

**Status: not yet executed.** It needs the isolated environment in `CALACOT_ISOLATED_DEVELOPMENT_ENVIRONMENT.md`.
**Audience:** the person running acceptance, and the reviewer who signs it.

**Roles:** **F** = Finance, **R** = Reviewer, **A** = Administrator, **V** = Read-only.

**Viewports:** run every section at **desktop 1440×900**. Repeat the sections marked † at **tablet 820×1180** and **phone 390×844**. On every page check:

- no horizontal page scroll;
- tables scroll inside their card;
- dialogs fit the screen;
- buttons stay reachable;
- status is shown as text, not colour alone;
- keyboard focus is visible.

**Record for each step:** pass or fail, a screenshot for any failure, and the journal or record number. **Stop and report** on any data that looks real, any outbound message attempt (check `tmp/sales-capture` only), or any error page.

## 0. Environment sanity

- [ ] 0.1 `node scripts/check-isolated-env.mjs .env.isolated` passes, and `start-isolated-dev.mjs` started the server.
- [ ] 0.2 Signing in as each synthetic user works with code 424242. The organization shown is the acceptance organization.
- [ ] 0.3 V sees the Accounting tabs it may read: Overview, Chart, Journals, General ledger, Banking, Reconciliation, Fixed assets, Financial statements, Period closing. It does **not** see Tax (no `tax_read`), Payroll or Opening balances. It sees no action buttons anywhere.
- [ ] 0.4 R sees approval controls only. F sees preparation controls only. A sees both.

## 1. Chart of accounts and policy †

- [ ] 1.1 F loads the proposed chart. A approves it. F cannot approve their own load.
- [ ] 1.2 F proposes an accounting policy: UGX, the financial-year start month, manual posting on. R approves it. F's self-approval is refused.
- [ ] 1.3 F generates the financial-year periods. Names and dates match the start month. A second generation is refused.
- [ ] 1.4 Control accounts (1200, 2110, 2140) cannot be chosen on manual journal lines.

## 2. Manual journals and postings †

- [ ] 2.1 F creates a balanced two-line journal (draft). An unbalanced journal shows a clear message and cannot be submitted.
- [ ] 2.2 F submits. F has no Approve button. R approves; A or R posts. The journal number `JE-<year>-000001` appears.
- [ ] 2.3 The posted journal cannot be edited or deleted. A reversal with a reason creates a linked journal. The original is unchanged.
- [ ] 2.4 The General ledger shows the posted lines only; drafts and submitted journals are absent. The account filter gives a running balance. Selecting a journal number opens the journal.
- [ ] 2.5 R returns a journal with a reason; F edits and resubmits; R rejects another with a reason. History shows every step and actor.

## 3. Automated accounting events (isolated-test stage)

- [ ] 3.1 F proposes integration settings with stage **isolated test** and control accounts. R approves. The stage is accepted only because this database carries the test flag.
- [ ] 3.2 Create a synthetic client, issue an invoice and confirm a payment in the isolated database. Events appear in Integration. Process them: system journals post to 1200 / revenue / 2140.
- [ ] 3.3 The receivables reconciliation shows *matched*. A blocked event shows its reason and can be resolved.
- [ ] 3.4 No message was sent: only `tmp/sales-capture` files exist.

## 4. Banking and cash †

- [ ] 4.1 F registers a verified bank account and proposes the mapping to 1120. R approves.
- [ ] 4.2 F imports a synthetic CSV statement: preview, then import. Re-importing the same file adds nothing. A duplicate line is flagged for review.
- [ ] 4.3 F matches statement lines to posted ledger lines. Suggested matches are sensible. Unmatched items stay visible.
- [ ] 4.4 F prepares a reconciliation and submits it. R finalizes it. The difference is zero, or each reconciling item is explained. Edits inside the finalized period are refused.
- [ ] 4.5 Cash: F records a petty-cash transaction. R approves. A cash count with a witness records any difference.

## 5. Tax †

- [ ] 5.1 F proposes an income-tax rule and obligation with uploaded evidence. R approves. VAT, PAYE and NSSF cannot be made operational.
- [ ] 5.2 F creates an income-tax computation for the year. Accounting profit is imported from the ledger; add-backs and allowances are shown separately. R approves. The provision journal is prepared, approved and posted.
- [ ] 5.3 A tax payment is recorded with its reference and reconciles to the liability.
- [ ] 5.4 The Overview never shows zero liability where it is not determined.

## 6. Fixed assets †

- [ ] 6.1 F proposes an asset category. R approves.
- [ ] 6.2 F registers an asset above the threshold and capitalizes it. R approves the capitalization journal. A hired asset cannot be capitalized.
- [ ] 6.3 F prepares month-end depreciation. R approves. A second run for the same month is refused.
- [ ] 6.4 Disposal shows the gain or loss; R approves; reversing the disposal works.

## 7. Financial statements †

- [ ] 7.1 Before classification approval, every statement says **PROVISIONAL**, with unclassified accounts listed.
- [ ] 7.2 F proposes a classification (review the suggested lines). R approves.
- [ ] 7.3 Income statement, balance sheet, cash flow, changes in equity, trial balance, division and project reports load for month, quarter and year, with and without comparison.
- [ ] 7.4 Every figure agrees with a hand calculation from the journals posted in sections 2–6. The balance sheet shows no difference. The cash flow reconciles, and the petty-cash float is shown as an internal transfer.
- [ ] 7.5 Drill-down works: statement line → account ledger → journal.
- [ ] 7.6 CSV download opens in a spreadsheet with **DRAFT — NOT APPROVED** at the top. Print to PDF shows the status banner without navigation.
- [ ] 7.7 F prepares a statement set; R approves it. Posting a later correction in that period marks it **ledger changed since**. A new approval supersedes it.
- [ ] 7.8 Adjustments: F creates an accrual with a reason, evidence and automatic reversal date. R approves and posts it. The scheduled reversal posts once.

## 8. Period closing †

- [ ] 8.1 F proposes a close policy (bank reconciliation required, evidence "Bank statements"). R approves it. The Periods page close button now refuses with a message pointing to Period closing.
- [ ] 8.2 F starts the January close. The checklist shows failures, for example missing evidence or a draft journal. Each failure shows its detail.
- [ ] 8.3 F records evidence and raises an exception for an exceptable failure. R accepts it. Non-exceptable checks offer no exception.
- [ ] 8.4 F submits. F has no Approve. F assigns R as reviewer; A's approval is then refused; R approves. The period shows **Closed**.
- [ ] 8.5 Posting a journal dated in January is refused with "period closed".
- [ ] 8.6 Reopen January is refused while February is closed. A reopens February with a reason of at least 10 characters. History is kept.

## 9. Year-end

- [ ] 9.1 Close periods 1–11. Submit the period-12 close; the tax-provision check requires an approved computation or exception.
- [ ] 9.2 F prepares and R approves the annual statement set. F prepares the year-end: the closing journal shows the result to retained earnings.
- [ ] 9.3 Approving the closing journal from Journals is refused. Period-12 approval directly is refused (year-end pending).
- [ ] 9.4 R approves the year-end. Period 12 closes. Income and expense balances are zero. The next year's trial balance opens with the prior result in retained earnings. The year's income statement is unchanged.
- [ ] 9.5 A second year-end is refused. A reopens the year with a reason: the closing journal is reversed and both stay. Re-closing transfers the result once.

## 10. Opening balances (staging only)

- [ ] 10.1 F creates a batch (source type, cutoff, evidence) and loads the synthetic template.
- [ ] 10.2 A schedule mismatch is shown with its difference. Submit is unavailable.
- [ ] 10.3 After correction, F submits; R approves. **No journal was created.**

## 11. Security spot checks

- [ ] 11.1 Each user opening a URL for another organization's record gets "not found".
- [ ] 11.2 Removing R's membership in Clerk mid-session: R's next approval is refused.
- [ ] 11.3 V opening an action URL directly (for example a statement-set page) sees no form. Exports work only for permitted reports.

## Sign-off

| Viewport | Sections passed | Failures (with ids) | Tester | Date |
|---|---|---|---|---|
| Desktop | | | | |
| Tablet | | | | |
| Phone | | | | |
