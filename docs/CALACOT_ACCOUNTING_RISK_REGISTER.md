# Calacot accounting risk register

**Audience:** management, the accountant and engineering. **Updated:** Phase 2F post-implementation stabilization (R3, R17 and R18 revised; R20–R25 added). **Ratings:** likelihood and impact are each rated L, M or H.

**Status:**

- **Open:** nothing addresses the risk yet.
- **Mitigated in code:** a test-verified control exists, but the risk still needs an operational step.
- **Blocker:** the risk must be resolved before production activation.

| # | Risk | L | I | Mitigation in place (verified) | Remaining action | Status |
|---|---|---|---|---|---|---|
| R1 | Accounting policies not approved: framework, revenue recognition, financial year and others | H | H | Safe defaults: nothing posts without an approved policy, classification and close policy | Approve the policy register | **Blocker** |
| R2 | No verified opening balances; historical source unknown (QuickBooks unverified) | H | H | Staging-only batches reconcile to schedules, refuse duplicates and need two-person approval | Inventory the records; signed opening trial balance; approve a batch; build and review the opening-journal step | **Blocker** |
| R3 | No browser acceptance; UI defects not found by tests | M | H | Tooling ready and tested: isolated-env checker, migration applier, synthetic user setup and isolated dev launcher; full checklist (`CALACOT_ACCOUNTING_BROWSER_ACCEPTANCE_CHECKLIST.md`) | An account owner creates the Clerk development instance and Neon branch; run the checklist on 3 viewports | **Blocker** |
| R4 | No real parallel run against independently prepared records | H | H | Synthetic parallel run against an independent reference model: 0 differences | Parallel-run one month of real (or sanitized) records against the accountant's figures | **Blocker** |
| R5 | No independent accountant review | H | H | Review package prepared | An authorized accountant reviews and signs off | **Blocker** |
| R6 | Double counting between opening balances and automatic posting of pre-cutoff transactions | M | H | Batch fails if journals or source events exist on or before the cutoff, or post-cutoff invoices are in the schedule | Mark pre-cutoff source events *no effect* during activation | Mitigated in code |
| R7 | Statement figures wrong due to misclassification | M | H | Classification is versioned and two-person approved; unclassified accounts make statements provisional and block approval; type-line rules are enforced | The accountant reviews the classification line by line | Open (policy) |
| R8 | Posting into a closed period, or closing with a posting in flight | L | H | Row locks plus a re-check inside the close transaction (real PostgreSQL concurrency tests) | Monitor | Mitigated in code |
| R9 | Retained earnings transferred twice | L | H | Unique live year-end per year; advisory lock; concurrency-tested | — | Mitigated in code |
| R10 | Approved statements silently outdated by later corrections | M | M | Ledger fingerprint: stale sets are labelled; approval refused when stale; re-approval supersedes | Close periods before approving final statements | Mitigated in code |
| R11 | Self-approval or excessive privilege | M | H | Database refuses self-approval everywhere; sensitive permissions re-verified live with Clerk; approvals admin-only by default | Assign delegated approvers deliberately (P15) | Mitigated in code |
| R12 | Report performance degrades with volume | M | M | Benchmarked (see results doc) | Re-benchmark on a production-sized branch before activation; optimize anything over target | Open |
| R13 | Migration failure in production | L | H | Chain rehearsed in one transaction on PostgreSQL 17; all migrations additive; rollback documented | Rehearse on a Neon branch of production; take a snapshot first | Open |
| R14 | Foreign-currency transactions mishandled | M | M | Multi-currency posting impossible (database CHECK); foreign rows fail staging and close checks | Exchange-rate policy before any USD activity | Open (policy) |
| R15 | Tax liability misstated | M | H | Tax only from approved rules and computations; year-end check requires an approved computation or an approved exception | Tax adviser confirms obligations and rates | Open (policy) |
| R16 | Operational records (invoices, payments) diverge from ledger after go-live | M | H | Phase 2B reconciliation; close check fails on unexplained differences | Daily reconciliation monitoring during limited activation | Open (operational) |
| R17 | Live services reached from development or tests | L | H | `npm run test:safe` refuses live credentials and runs every suite with a scrubbed environment; env-file loaders are skipped automatically; every local fixture suite refuses non-local hosts; isolated tooling refuses live Clerk keys, production database hosts and live messaging (self-tested by `verify-test-safety.mjs`) | Use only `start-isolated-dev.mjs` from a separate worktree for acceptance | Mitigated in code |
| R18 | Obsolete test scripts cause confusion | L | L | Removed: `scripts/verify-bank-mapping-db.mts` and `scripts/verify-bank-mapping-concurrency-postgres.mjs`. Confirmed unused: they targeted a migration file that never existed, were never committed or referenced, and their coverage is in `verify-banking-*`. | — | Closed |
| R19 | Shared-document links expose documents | L | M | Token hashing, expiry and revocation (separate feature, tests pass) | Security review of the shared-documents feature before release | Open |
| R20 | Older Phase 1 PostgreSQL suites create fixture databases on a hard-coded remote Neon endpoint (`ep-mute-mode-…`) that may share compute with production | M | H | Not run by any tooling (excluded by `test:safe`) | Confirm the endpoint is not production; move these suites to the local throwaway server or an isolated branch | Open |
| R21 | Accounting work and two unrelated features (shared documents, WhatsApp receipts) were mixed in one uncommitted working tree | M | M | Committed as separate commits on `dev/accounting-phase-2c-2f` (see the Git synchronization report); not pushed and not merged | Review per commit; push only when preview deployments are confirmed isolated | Open |
| R22 | `next dev` silently loads `.env.local` (live) alongside test settings | M | H | `start-isolated-dev.mjs` refuses to start where any `.env`/`.env.local` exists; acceptance runs in a separate worktree | — | Mitigated in code |
| R23 | Drizzle snapshots stop at 0015; `drizzle-kit generate`/`push` would propose unwanted schema changes | L | H | Documented in the migration consistency report; the chain is hand-written and verified by `test:migration-chain` | Never run `drizzle-kit generate`/`push` on this chain | Open |
| R24 | Pushing the branch may trigger a Vercel preview deployment that uses production-scoped environment variables | M | H | Branch not pushed | Confirm the Vercel preview environment points at isolated services (or disable preview builds for this branch) before pushing | Open |
| R25 | `.env` was modified on 23 Nov 2026 outside this work (git-ignored, not inspected) | L | M | Not committed; ignored by `.gitignore` | Owner confirms the change was intended | Open |
