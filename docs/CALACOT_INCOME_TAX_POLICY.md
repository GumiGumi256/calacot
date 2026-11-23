# Calacot income tax policy (system controls)

**Status:** controls implemented in Phase 2D (`drizzle-current/0022_tax_assets_payroll.sql`); nothing is active in production. Items marked **Decision needed** require the company accountant and management.
**Audience:** the company accountant, finance staff who prepare tax work, and the approvers.

This document describes how the system handles corporate income tax. It states no tax rate, deadline or registration for Calacot: those exist in the system only as evidenced, approved records entered by the accountant. **[enforced]** marks a rule enforced by the database for every writer.

## IT-1 Nothing is assumed

1. Calacot's registration status is not inferred from anything. It exists only as an approved obligation version backed by evidence (for example the URA registration certificate). Statuses: not registered, registered, applicable, exempt, pending verification, inactive. **[enforced]**
2. No rate is hardcoded. A rate exists only as an approved **tax rule version** with a legal basis, evidence and an effective date. Computations use the rule in force at the end of the tax year. Superseded versions remain in force for earlier dates. **[enforced]**
3. The tax year is the **approved accounting year** (the accounting periods generated from the approved accounting policy), never a calendar or incorporation-date assumption. **[enforced]**
4. Missing data is never shown as zero. Until a final computation is approved or URA has assessed, the liability shows as **not determined**. **[enforced in the position calculation and UI]**

## IT-2 Making income tax operational

An obligation becomes operational only when a version is approved, by someone other than its proposer, with **[enforced]**:

- registration status *registered* or *applicable*, with evidence;
- an approved income-tax-rate rule (`calculation_rule_code`);
- a tax expense account (expense type) and a tax payable account (liability), both active and allowing manual journals, plus an optional prepaid-tax account (asset) for instalments;
- *processing enabled*.

Deadline rules (provisional returns, instalments, final return) are part of the obligation version and must be confirmed by the accountant. **Decision needed:** the confirmed statutory deadlines and instalment pattern for Calacot's tax year.

## IT-3 Computation

1. **Accounting profit before tax** is read from posted journals in the tax year: income less cost of sales and expenses, excluding income-tax expense accounts. Unposted journals and pending or blocked source events in the year are reported as problems that block submission. **[enforced]**
2. **Adjustments** turn accounting profit into chargeable income: non-deductible expenses and other add-backs (increase); allowable deductions, exempt income and other decreases (decrease). Each line has a description and optional evidence. **[enforced]**
3. **Accounting depreciation is added back and capital allowances deducted**, both imported from the asset schedules (§ Fixed asset policy FA-7). They are never typed in and never mixed: depreciation comes from the ledger; capital allowances come from approved capital-allowance rules applied to the asset register. **[enforced]**
4. **Losses brought forward** require evidence. They are used against adjusted profit up to the rule's optional `lossOffsetLimit`. Unused losses and new losses are carried forward and shown. **Decision needed:** whether a loss-offset limit or expiry applies to Calacot, recorded in the rule.
5. **Credits** (customer withholding tax certificates, foreign tax and other credits) require certificate evidence and reduce the net payable. Customer withholding credits are claimed here; they are not yet recorded against customer receivable balances (see Future tax readiness WHT-3).
6. **Provisional computations** use an entered estimate of chargeable profit and are kept separate from final computations.
7. Tax charge = chargeable income × the rule's rate, rounded to cents. Net payable = tax charge − credits − posted instalments (negative means overpaid).

## IT-4 Review and approval

1. A computation is prepared and submitted by one person. **Accounting profit is fixed at submission.** **[enforced]**
2. It is approved, returned or rejected by a different person with `tax_approve`, who is neither the preparer nor the submitter. **[enforced]**
3. If posted entries in the year change after submission, approval is refused and the computation must be returned and resubmitted. **[enforced]**
4. Approved figures are snapshotted and immutable. An amended computation supersedes the final one; history is kept. **[enforced]**
5. Approval posts nothing.

## IT-5 Provision (the ledger)

1. The tax charge reaches the ledger only through a **provision journal** prepared from an approved final or amended computation: Dr tax expense, Cr tax payable. Its amount is the difference between the approved charge and what is already provided for the year, so over-provision reverses automatically and the same charge is never provided twice. **[enforced]**
2. The journal is approved and posted by a different person. All Phase 2A posting rules apply: open period, approved policy with manual posting enabled, active accounts, balance. **[enforced]**
3. Provisions and payments can only be corrected by reversal, never edited. **[enforced]**

## IT-6 Filings, assessments and payments are different things

| Record | Means | Evidence | Ledger effect |
|---|---|---|---|
| Computation (approved) | What Calacot computes | Schedules | None until provisioned |
| Filing | A return was actually filed with URA | Return and acknowledgement | None |
| Assessment | URA assessed an amount (original, additional, amended, objection decision, penalty, interest) | Notice | None (liability follows it in the position) |
| Payment | Money actually paid, identified by its PRN | Payment slip and bank evidence | Journal after approval |

1. A payment never marks a return as filed; a filing never implies payment. **[enforced]**
2. One final (and one provisional) return per year; corrections are amended returns. **[enforced]**
3. Assessments are append-only; a correction supersedes an earlier assessment. **[enforced]**
4. **A PRN can be recorded once.** A second payment with the same PRN is refused while the first is live, even when two people record it at the same moment. **[enforced, verified on real PostgreSQL]**
5. A payment journal debits tax payable (or prepaid tax for provisional instalments, if configured) and credits the paying bank account. Once posted it reconciles against the bank statement like any payment (Phase 2C).
6. The system never submits returns to URA and never initiates payments.

## IT-7 Position per year

Liability = the latest non-superseded assessment plus later additional assessments, penalties and interest; otherwise the approved final computation's tax charge; otherwise **not determined**. Outstanding = liability − credits − posted payments; any excess is shown as an overpayment (refundable or available for offset, subject to URA). Pending payments are shown separately.

## IT-8 Approval authority

| Action | Permission | Default holders |
|---|---|---|
| View tax | `tax_read` | Administrators, Finance |
| Propose rules and obligations | `tax_policy_manage` | Administrators, Finance |
| Prepare computations and provisions | `tax_compute` | Administrators, Finance |
| Record filings, assessments, payments | `tax_payment_record` | Administrators, Finance |
| Approve rules, obligations, computations, tax journals | `tax_approve` | Administrators (delegable to the accountant via `org:calacot:tax_approve`) |

## IT-9 Decisions needed before use

1. Confirm Calacot's corporate income tax registration and record it with the certificate.
2. The applicable regime and rate (and any loss rules), as an approved rule with its legal basis.
3. The tax year (it follows the approved accounting year) and the confirmed provisional and final deadlines.
4. Tax accounts: 8900 Income tax expense, 2195 Income tax payable, and whether instalments go to a prepaid-tax asset.
5. Opening position: past returns, assessments, payments and losses must be entered from evidence; **nothing is invented**.
