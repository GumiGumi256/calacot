# Calacot payroll accounting policy (foundation)

**Status:** foundation only. **No live payroll:** nothing is approved for payment, paid or posted, and no statutory deduction is calculated in Phase 2D.
**Audience:** management, the payroll administrator, the accountant, and engineers planning payroll activation.

## P-1 Who is on payroll

1. A payroll profile is an explicit record created by a payroll administrator and approved by a different person (`payroll_approve`). **Being in the staff directory, or holding an admin role, never puts anyone on payroll.** A profile may link to a staff record, but the link is optional and never inferred. **[enforced]**
2. **Employees vs contractors vs suppliers:** contractors may be recorded for reference but can never receive a salary structure or appear in a payroll run; they are paid as suppliers through expenses. **[enforced]**
3. Only the last four characters of a payment account are stored. TIN and NSSF numbers are stored but shown only as "recorded" or "missing". **[enforced]**

## P-2 Pay structure

1. **Components** (basic salary, allowances, bonuses, deductions, employer contributions) are approved by a second person. Each carries a taxable flag and optional expense and liability accounts. **[enforced]**
2. **Statutory components** (PAYE, employee and employer NSSF) are placeholders: they can never be typed into a salary structure. They will be computed only from approved PAYE/NSSF rule versions (`paye_bands`, `nssf_rates`) of an operational obligation, which cannot exist in this phase. **[enforced]**
3. **Salary structures** are versioned by effective date and approved by a second person. **[enforced]**

## P-3 Runs and payslips

1. A payroll run is a **simulation**: gross pay, non-statutory deductions, employer contributions and net before statutory deductions, per employee, from approved structures. **[enforced]**
2. Each simulation stores an immutable payslip artifact structure: employee, period, lines, statutory section marked "not configured", totals, and a simulation flag. **[enforced]**
3. The run status can only be `simulated`. Approval, payment and posting are impossible until a reviewed migration enables them. **[enforced]**

## P-4 Future accounting (design)

When activated in a later phase, an approved run would post one journal through the existing engine:

- Dr salaries and wages (6100) and employer contributions;
- Cr net pay payable, PAYE payable (2160) and NSSF payable (2170).

Net pay would be paid from approved company accounts and reconciled against bank statements (Phase 2C). Statutory remittances would be recorded as `tax_payments` against the PAYE and NSSF obligations with their PRNs.

## P-5 Access

Salary data requires `payroll_admin` (set-up and simulation) or `payroll_approve` (approvals). Both are administrator-only by default and delegable. Staff-administration, accounting, banking and tax permissions never reveal payroll data (verified by test). The Payroll tab is shown only to people with payroll permissions. **[enforced]**

## P-6 Decisions needed before activation

1. Who is employed on payroll (from employment contracts, not the staff directory).
2. PAYE bands and NSSF rates as approved, evidenced rules, and PAYE/NSSF registration evidence.
3. Pay calendar, cut-off, approval chain and payment method.
4. Payroll accounts (net pay payable account, employer NSSF expense).
5. Payslip delivery and retention policy.
