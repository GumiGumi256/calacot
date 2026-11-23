# Calacot accounting policy approval register

**Status: no policy in this register has been approved.** The system enforces a safe default for each, and none was approved on Calacot's behalf.
**Audience:** Calacot management (approvers) and the external accountant (adviser and reviewer).

**How to approve:**

1. Fill in the decision, evidence, approver and date for each item.
2. Record it in the system where a system record exists. Two people are always required: one proposes, another approves.
3. Keep this register signed in the accounting file.

| # | Policy | Decision required | System record | Safe default until approved | Decision | Evidence | Approved by / date |
|---|---|---|---|---|---|---|---|
| P1 | Financial year | Start month and year labelling, confirmed from the company's registration or URA records | Accounting policy version (`fiscal_year_start_month`) | No periods; nothing posts | | | |
| P2 | Functional and presentation currency | UGX or USD; presentation currency if different | Accounting policy (`functional_currency`); presentation currency = functional | No policy → no posting | | | |
| P3 | Accounting framework | IFRS for SMEs, full IFRS or another basis; disclosures | Document only | Statements state "internal management information, not audited" | | | |
| P4 | Revenue recognition | When revenue arises: at invoice, on completion or over time for contract works; Estates principal or agent; design plan sales | Phase 2B posting rules (versioned, two-person) | No automatic posting | | | |
| P5 | Customer deposits | Liability until earned (2130), or revenue on receipt | Posting rules and classification (`customer_advances`) | Not posted | | | |
| P6 | Supplier advances | Prepayment (1240) until goods or services are received | Classification and posting rules | Not posted | | | |
| P7 | Work in progress | Whether contract assets or unbilled work (1260) are recognised, and how they are measured | Chart account 1260; posting rules | Not recognised | | | |
| P8 | Fixed-asset capitalization | Threshold per category; what counts as an asset | Asset category versions (Phase 2D) | Nothing can be capitalized | | | |
| P9 | Depreciation | Method, useful lives, residual values, partial-period convention per category | Asset category versions | No depreciation | | | |
| P10 | Tax provisions | Corporate income-tax obligation, rate rule, provisional and final computation process; adviser review | Tax obligation and rule versions (Phase 2D) | "Not determined"; year-end tax check fails | | | |
| P11 | Exchange rates | Rate source (Bank of Uganda or bank), date rule, revaluation, exchange differences | Rate approvals; multi-currency posting is **blocked by a database constraint** | USD activity cannot be posted | | | |
| P12 | Division and project allocation | Whether shared costs are allocated; basis and shares | Overhead allocation versions (Phase 2E) | Shown as not allocated | | | |
| P13 | Statement classification | Line and cash-flow class for every account; retained earnings account | Classification versions (Phase 2E) | All statements provisional | | | |
| P14 | Period-close policy | Close calendar, required evidence, bank and cash requirements, clearing tolerance, exception materiality | Close policy versions (Phase 2E) | Uncontrolled Phase 2A close; no checklist | | | |
| P15 | Finance approval authorities | Who holds `accounting_journal_approve`, `fs_approve`, `fs_adjust_review`, `close_approve`, `close_reopen`, `year_end_approve`, `tax_approve`, `depreciation_approve`, `migration_approve`; delegation limits | Clerk custom permissions `org:calacot:<permission>` | Administrators only | | | |
| P16 | Opening balances and cutoff | Cutoff date, source records and signed opening trial balance | Opening-balance batches (Phase 2F) | No opening balances | | | |
| P17 | Automatic posting | Whether source transactions post automatically; go-live stage | Integration settings (Phase 2B) | Disabled; production can never be in the test stage | | | |
| P18 | Bank account mapping | Each verified bank or mobile-money account to its ledger account | Bank mappings (Phase 2C) | Unmapped; cannot reconcile | | | |

**Rule:** a policy is approved only when this register is signed **and** the system record is approved by two people. An unapproved item is a production blocker (see `docs/CALACOT_ACCOUNTING_GO_LIVE_CHECKLIST.md`).
