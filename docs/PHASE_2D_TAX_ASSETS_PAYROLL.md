# Phase 2D: Tax management, fixed assets and payroll accounting foundation

**Status:** implemented and verified on isolated databases with synthetic data. **Not production-ready, not deployed, no migration run against any real database, no Clerk setting changed, no tax activated, no return filed, no payment made.**
**Date:** 22 November 2026 · **Branch:** `feat/accounting-ledger-integration` (uncommitted working tree)
**Policies:** [Income tax](CALACOT_INCOME_TAX_POLICY.md) · [Fixed assets](CALACOT_FIXED_ASSET_POLICY.md) · [Future tax readiness](CALACOT_FUTURE_TAX_READINESS.md) · [Payroll accounting](CALACOT_PAYROLL_ACCOUNTING_POLICY.md)

## 1. Phase 2A–2C prerequisite verification

Verified on the **local working tree**. Phases 2C and the shared-documents work are uncommitted; the remote default branch does not contain 2B–2D. Results before Phase 2D, on the 0000–0021 chain:

| Requirement | Evidence | Result |
|---|---|---|
| Chart of accounts | two-person approval; `verify-accounting-db` | PASS |
| Double-entry ledger and posting gate | balance per currency, functional totals, immutable posted journals | PASS |
| Periods and restrictions | close/reopen, closed-period refusal | PASS |
| Journal approvals and posting | preparer ≠ approver, stale approval refusal | PASS |
| Automated source-to-ledger integration | `test:accounting:integration` 5 + 20 + 7 | PASS |
| Banking and reconciliation | `test:banking` 18 + 7 (+ pure checks) | PASS |
| Reversals and audit trails | exact-mirror reversals; append-only events and `audit_logs` | PASS |

`test:accounting` 8 + 24 + 9 PASS. **No blocker.** Phase 2D adds no ledger: every financial effect is an ordinary manual journal through `accounting_journal_write_lines` / `accounting_journal_command` / `accounting_journal_reverse`, linked to its source in `ledger_source_links`.

## 2. Implemented tax functionality

- **Tax Settings:** versioned obligations with tax type, registration status (not registered / registered / applicable / exempt / pending verification / inactive), taxpayer and TIN, effective dates, legal basis, tax period basis, filing frequency, structured deadline rules, calculation rule, accounts, processing switch, evidence, notes and approval. Every version needs a second person with `tax_approve`.
- **Tax rules:** versioned, evidenced, approved parameters for income-tax rates (optional loss-offset limit), capital-allowance classes, PAYE bands, NSSF rates, VAT and withholding rates. Effective-dated, so superseded versions still apply to past dates. Nothing is hardcoded.
- **Income tax:**
  - Provisional, final and amended computations for the approved accounting year.
  - Accounting profit from posted journals, fixed at submission.
  - Taxable-income adjustments (non-deductible, add-backs, deductions, exempt income).
  - Imported depreciation add-back and capital allowances.
  - Losses brought forward with evidence, and credits with certificates.
  - Tax charge from the approved rule in force; two-person review.
  - Ledger-change detection between submission and approval.
  - Provision journals for the delta only.
- **Payments and filings:**
  - Filings recorded with acknowledgement evidence.
  - URA assessments, append-only with supersession.
  - Payments identified by PRN, duplicates refused, posted after approval to payable or prepaid tax and the paying bank, then reconcilable in 2C.
  - Per-year position: estimate, computed, assessed, in ledger, credits, paid, pending, outstanding or overpaid, with *not determined* when unknown.
- **Compliance calendar:** deadlines computed only from approved deadline rules and the approved accounting year. Each is done only when its evidence is recorded; overdue and due-soon items are flagged; required evidence is listed. Nothing is filed or paid automatically.

## 3. Active versus inactive tax modules

| Module | State |
|---|---|
| Corporate income tax | **Can be made operational** once an obligation with evidence, an approved rule and accounts is approved by a second person. Nothing is operational by default. |
| VAT | **Inactive and cannot be enabled** (CHECK). Treatment and EFRIS structures refuse writes. |
| EFRIS | **Inactive.** Status structure only; no client; no submissions. No existing integration was found to preserve. |
| Withholding tax | **Inactive and cannot be enabled** (CHECK). Records refuse writes. Customer WHT certificates can be claimed as income-tax credits only. |
| PAYE, NSSF | **Inactive and cannot be enabled** (CHECK). Payroll simulations report them as not operational. |
| Other taxes | Can be recorded; cannot be enabled. |

## 4. Fixed asset functionality

- **Category policies** (two-person): useful life, residual percentage, straight-line method, partial-period convention, capitalization threshold, six accounts, and an optional tax capital-allowance class.
- **Register:**
  - Sequential numbers; company-owned vs hired (custody only).
  - Supplier, linked approved expense (never exceeded, so no duplication), source document.
  - Division, project, custodian, location, serial number; derived state and carrying amount.
- **Capitalization:** from an expense reclassification, a direct credit, or an opening balance (with opening accumulated depreciation).
- **Depreciation:**
  - Straight-line under three conventions, catching up missed months.
  - One pending run at a time; never twice for the same months.
  - Posted by division and project.
  - SQL and an exact TypeScript model cross-checked.
- **Impairment / write-down:** limited to the carrying amount above residual value.
- **Disposal:**
  - Final partial depreciation, carrying amount, gain or loss and proceeds (company account or receivable) computed by the system.
  - Reversible.
- **Transfers:** custody, location, division and project changes, non-financial and audited.
- **Reversal guards:** nothing that later entries depend on can be reversed.
- **Capital allowances:** computed per asset from approved rules and tax written-down values. Imported only into income-tax computations; never posted.

## 5. Payroll foundation

- **Profiles:** explicit, approved by a second person, never inferred from the staff directory.
- **Engagement:** contractors are separated and excluded from payroll.
- **Sensitive data:** payment accounts stored as the last four characters only; TIN and NSSF numbers shown only as recorded or missing.
- **Pay structure:** components (salary, allowances, bonuses, deductions, employer contributions, statutory placeholders) and versioned salary structures, each approved by a second person.
- **Runs:** simulations only, with immutable payslip artifacts. The run status can only be `simulated`, so approval, payment and posting are impossible (CHECK).
- **Access:** `payroll_admin` / `payroll_approve`; general staff, accounting, banking and tax permissions never reveal salaries.

## 6. Files and migrations

**Migration (additive, journal entry 22):** `drizzle-current/0022_tax_assets_payroll.sql`. It adds 27 tables, 141 tables/functions/indexes/triggers, and no `ALTER` of any existing object:
`tax_events`, `ledger_source_links`, `tax_rule_versions`, `tax_obligation_versions`, `income_tax_computations`, `income_tax_adjustments`, `income_tax_credits`, `tax_filings`, `tax_assessments`, `tax_payments`, `asset_category_versions`, `asset_counters`, `fixed_assets`, `asset_depreciation_runs`, `asset_depreciation_lines`, `asset_impairments`, `asset_disposals`, `asset_transfers`, `asset_tax_allowances`, `vat_document_treatments`, `efris_documents`, `withholding_tax_records`, `payroll_profiles`, `payroll_components`, `payroll_salary_structures`, `payroll_runs`, `payroll_payslips`.

**New code**

| Area | Files |
|---|---|
| Tax | `lib/tax/{catalog,reads,actions}.ts` |
| Assets | `lib/assets/{depreciation,states,reads,actions}.ts` |
| Payroll | `lib/payroll/{reads,actions}.ts` |
| Components | `components/tax/{controls,forms,shared}.tsx`, `components/assets/forms.tsx`, `components/payroll/forms.tsx` |
| Pages (each with `loading`/`error`) | `accounting/tax/{page, income, income/[id], obligations, payments, settings}`, `accounting/assets/{page, [id], depreciation, disposals}`, `accounting/payroll` |

**Changed:**
- `lib/sales/permissions.ts`: 9 permissions, grants, sensitive set.
- `lib/finance/context.ts`: messages for all new codes.
- `lib/ui/status.ts`: 3 domains.
- `lib/admin/breadcrumbs.ts`.
- `components/accounting/shared.tsx`: `AccountingNav` now shows Tax, Fixed assets and Payroll tabs only to permitted users.
- `drizzle-current/meta/_journal.json`, `package.json` (`test:tax-assets`).
- `scripts/verify-design-system.ts` (new domains from 0022), `scripts/verify-banking-db.mts` (asserts 0021 is present rather than last).

**Tests:** `scripts/verify-tax-assets-db.mts`, `scripts/verify-tax-assets-actions.mjs`, `scripts/verify-tax-assets-concurrency-postgres.mjs`, `scripts/verify-depreciation-model.mts`.

**Docs:** this report and the four policies.

## 7. Security and accounting controls

| Permission | Admin | Finance | Viewer / Sales / PM |
|---|---|---|---|
| `tax_read`, `tax_compute`, `tax_payment_record`, `tax_policy_manage` | ✓ | ✓ | – |
| `tax_approve` | ✓ | delegable | – |
| `assets_manage` | ✓ | ✓ | – |
| `depreciation_approve` | ✓ | delegable | – |
| `payroll_admin`, `payroll_approve` | ✓ | delegable | – |

- **Live permissions:** every mutation re-verifies Clerk live, refuses other origins, rate-limits, and requires an active staff record (suspended staff refused by the database).
- **No self-approval:** applies to rules, obligations, computations (preparer and submitter), every tax or asset journal, category policies and payroll set-up.
- **Separated journal decisions:** the tax action refuses asset journals, and vice versa.
- **No unauthorized rate change:** rules are immutable versions requiring evidence and approval; direct SQL updates are refused.
- **Immutability and isolation:**
  - Events, filings, assessments, payments, runs, lines, disposals, impairments, transfers, snapshots and payslips are append-only.
  - Approved computations and versions are immutable.
  - Organization isolation is enforced by composite keys.
- **Audit:** every command writes `tax_events` and `audit_logs` (counts verified equal).
- **Ledger:** only manual journals through the Phase 2A gate (balance, open period, approved policy, active accounts); trial balance verified balanced.
- **No tax activation:** VAT, WHT, PAYE and NSSF are blocked by CHECK constraints; readiness tables refuse writes; payroll cannot post.

## 8. Test results

All runs used disposable databases (in-memory PGlite 17; a throwaway PostgreSQL 17.5 from `embedded-postgres` in a scratch folder, its data deleted afterwards) and synthetic data only.

| Suite | Result |
|---|---|
| `verify-depreciation-model.mts` | **PASS**: three conventions, catch-up, cap, residual value |
| `verify-tax-assets-db.mts` (0000–0022) | **PASS, 12 checks + migration**, listed below |
| `verify-tax-assets-actions.mjs` (real permission module, actions and reads) | **PASS, 5 checks**: least privilege; payroll privacy (staff admin + accounting + banking still no salary access; last four characters only); unauthorized rule approval and self-approval refused; VAT cannot be enabled through the app; *not determined* (never zero) before computation; computation workflow; tax and asset journal decisions cannot be crossed; cross-organization, cross-origin and revoked sessions write nothing |
| `verify-tax-assets-concurrency-postgres.mjs` (real PostgreSQL, overlapping connections) | **PASS, 5 checks + migration**: concurrent obligation approvals (one wins); concurrent computation approvals (one approval, one snapshot); the same PRN at once (one payment); two depreciation runs at once (one run); posted journals balanced |
| Phase 2A–2C on 0000–0022 | `test:accounting` 8+24+9, `test:accounting:integration` 5+20+7, `test:banking` 18+7 (+ pure) PASS; concurrency 2A (13), 2B (7), 2C (8 + migration) PASS |
| Regressions | PASS: `test:sales`, `test:verification`, `test:whatsapp-consent`, `test:org-routing`, `test:customer-care`, finance expenses and documents, documents reports, staff admin, Phase 1E history, quotation catalogue, project team, task create, lead assignment and management, dashboard |
| `tsc --noEmit` | **PASS** |
| ESLint (all Phase 2D files) | **PASS** (0 errors, 0 warnings) |
| `test:design-system` | Phase 2D passes (new domains match the 0022 CHECK constraints); the only failure is the pre-existing `components/sales/share-document.tsx` from the separate shared-documents work |
| Production build | **PASS**, 117/117 pages, on an isolated copy with no `.env` files (dummy database URL and Clerk keys, public Sanity identifiers only). All 11 new pages are partially prerendered like the other accounting pages. The unrelated `/shared/[token]` page, which fails independently, was excluded from the copy. |

**`verify-tax-assets-db.mts` checks:**

- **Rules:** validation, evidence (including another organization's document refused), self-approval, immutability, versions in force by date.
- **Obligations:**
  - VAT, WHT, PAYE and NSSF cannot be enabled (functions and direct SQL).
  - Evidence is required for registration claims.
  - Processing prerequisites; self-approval and cross-organization refused.
- **Asset policy and register:** categories need the right account types and two people; hired equipment is never capitalized; threshold; expense-linked assets cannot exceed the expense; financial fields lock.
- **Depreciation:** daily proration equals the TypeScript model; one pending run; never twice; immutable lines.
- **Impairment and disposal:** impairment limit; disposal gain/loss exact and balanced; already-disposed refused; disposed assets not depreciated; capitalization reversal blocked by later entries; disposal reversal restores the asset.
- **Income tax computation:** blocked while not operational; estimate required; missing periods; profit from the ledger; accounting depreciation added back from the ledger and capital allowances from the approved rule (never posted); loss evidence; adjustments, loss relief and credits computed exactly.
- **Income tax review:** schedules lock at submission; self-approval refused; a ledger change after submission blocks approval; return, resubmit, approve; approved figures immutable.
- **Provision, payment, filing, assessment:**
  - Provision for the delta: pending and up-to-date refusals.
  - PRN duplicates refused; paying is not filing.
  - Duplicate final return refused; filing for an unregistered obligation refused.
  - Assessment overrides the computation; an objection decision creates an overpayment.
  - The tax payment reconciles against a bank statement line through 2C matching.
  - Append-only tables.
- **Periods and readiness:** closed accounting period refuses tax payments; VAT, EFRIS and WHT structures refuse writes and invoices are unchanged.
- **Payroll:** last four characters only; self-approval refused; contractors excluded; statutory lines cannot be typed in; simulation posts nothing; runs cannot be approved or posted.
- **Access and ledger:** suspended staff and cross-organization refused; all Phase 2D journals manual; trial balance balanced; tax payable = provision; events = audit logs.

**Defect found and fixed during testing:** the *full month from capitalization* convention prorated the first month by days. The concurrency suite caught it, and the SQL function and TypeScript model were both corrected, with a regression test.

**Not run: authenticated browser acceptance.** Safe development Clerk users were not available in this session. The repository's dev server loads `.env.local`, which points at the live database and Calacot's Clerk application, so it was not started. The pages were verified by type-checking, lint, the design-system check, action and read tests, and the production build, but not visually.

## 9. Tax-policy decisions requiring approval

1. **Corporate income tax:** registration evidence; applicable regime and rate (as an approved rule with legal basis); any loss-offset limit or expiry; the confirmed provisional and final deadlines and instalment pattern.
2. **Tax year:** follows the approved accounting policy's financial year; confirm it (Phase 2A policy is still to be approved).
3. **Tax accounts:** 8900 / 2195, and whether instalments go to a prepaid-tax asset.
4. **Opening tax position:** past computations, returns, assessments, payments and losses, entered only from evidence.
5. **Asset policies:** categories, useful lives, residual values, conventions, thresholds; opening asset register at cut-over.
6. **Capital-allowance classes and rates**, confirmed by the tax adviser.
7. **VAT / EFRIS / WHT:** actual registration and obligations (Future tax readiness R-4); treatment of customer WHT certificates.
8. **Payroll:** who is employed on payroll; PAYE and NSSF registration and rules; pay calendar and approval chain.
9. **Approval authority:** who besides administrators holds `tax_approve`, `depreciation_approve`, `payroll_approve`.

## 10. Production blockers

1. Phase 2A–2C blockers still apply: approved accounting policy with manual posting, periods, approved chart; Phase 2C storage configuration.
2. Rehearse 0016–0022 on a Neon branch of production; rerun every suite there, including all four concurrency suites.
3. Authenticated browser acceptance of all Tax, Fixed asset and Payroll pages per role (admin, finance, viewer, delegated approver, payroll admin), desktop and mobile, with a Clerk development instance.
4. The policy decisions in §9, entered and approved by two people with evidence.
5. Evidence documents must be uploaded through Documents (private storage) before obligations and rules can be approved.
6. Housekeeping before commit: resolve the shared-documents failures (build `/shared/[token]`, its test and the design-system check); the superseded Phase 2C `verify-bank-mapping-*` scripts were deleted in the Phase 2F stabilization pass.

**Phase 2D is not production-ready.** Ledger integrity, tax computation and access controls are verified on isolated databases, but browser workflows, the production rehearsal and the accounting and tax policies above are outstanding. Phase 2E has not been started.

## 11. Rollback and recovery

- **Code rollback:** revert the Phase 2D files (§6). Nothing else depends on them; the earlier phases are unchanged. `AccountingNav` reverts to its previous static tabs.
- **Database rollback before any Phase 2D data exists:** drop the 27 tables listed in §6 (with `CASCADE` on the readiness and payroll tables first, then the tax and asset tables, then `ledger_source_links` and `tax_events`) and the 0022 functions, inside one transaction, after verifying every table is empty. Then remove the drizzle migration record if drizzle-kit recorded it.
- **Once data exists:** do not drop anything. Records are append-only evidence, and posted journals are part of the ledger. Revoke the Phase 2D permissions or revert the code; the tables stay inert.
- **Retries:** every command is idempotent by request key and returns the original result.
- **Crashes:** every command is one transaction, so a crash leaves nothing behind.
- **Corrections:**
  - Unapproved work is returned, rejected or cancelled with a reason.
  - Posted journals are reversed (latest first; guards prevent reversing entries others depend on).
  - Computations are corrected by an amended computation; assessments by a superseding assessment; filings by an amended return.
  - A wrong rule or obligation is replaced by a new approved version, or retired.
