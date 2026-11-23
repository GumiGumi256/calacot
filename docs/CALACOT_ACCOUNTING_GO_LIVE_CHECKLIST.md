# Calacot accounting go-live checklist and activation plan

**Status:** stage 1 is partially complete; nothing has been activated. **Do not activate live accounting until every item of a stage is signed.**
**Audience:** management, the accountant, and the engineer running the release.

Each stage has an owner, an evidence requirement and a gate. A stage starts only when the previous gate is signed.

## Stage 1: Production prerequisites verified

- [x] All accounting migrations (0018–0024) are additive and apply in one transaction on PostgreSQL 17 (rehearsed).
- [x] Automated suites pass: Phase 2A–2F database and action suites, real-PostgreSQL concurrency suites, and the full regression sweep (see `PHASE_2F_ACCOUNTING_CERTIFICATION.md`).
- [x] The production build passes with every route, including `/shared/[token]`.
- [ ] Browser acceptance: Finance, Administrator, Reviewer and Read-only users; desktop, tablet and mobile; on an isolated database with test Clerk identities and outbound email and WhatsApp disabled.
- [ ] Security review of the shared-documents feature.
- [x] The obsolete scripts `verify-bank-mapping-*` are removed (stabilization pass).
- **Gate:** engineering lead and management sign.

## Stage 2: Accounting configuration approved

- [ ] Every policy in `CALACOT_ACCOUNTING_POLICY_REGISTER.md` is decided, signed, and approved in the system by two people.
- [ ] The chart of accounts is approved; control accounts are confirmed.
- [ ] Statement classification is approved after line-by-line review by the accountant.
- [ ] The close policy is approved.
- [ ] Bank and mobile-money accounts are mapped (Phase 2C).
- [ ] Tax obligations and rules are approved, with evidence (Phase 2D).
- [ ] Approval authorities are assigned in Clerk.
- **Gate:** management and the accountant sign.

## Stage 3: Migration rehearsal approved

- [ ] Create a Neon **branch** of production; never use the production database.
- [ ] Apply migrations 0018–0024 to the branch, timing each one. The rollback is to delete the branch.
- [ ] Re-run the benchmark (`scripts/bench-accounting-postgres.mjs`) at production volume; check the targets in the results document.
- [ ] Take a production snapshot and document how to restore it.
- **Gate:** engineering lead signs.

## Stage 4: Opening balances verified

- [ ] Record the source inventory and cutoff (`CALACOT_ACCOUNTING_MIGRATION_PLAN.md`).
- [ ] Stage the opening batch on the branch; every reconciliation check passes; a different person approves it.
- [ ] The accountant signs `CALACOT_OPENING_BALANCE_RECONCILIATION.md`.
- [ ] Build and review the opening-journal step (not yet built), with two-person posting.
- **Gate:** the accountant and management sign.

## Stage 5: Shadow accounting verification

- [ ] Run Phase 2B in **shadow** mode on the branch, or on production with posting disabled, for at least one full month.
- [ ] The Phase 2B shadow reconciliation shows no unexplained difference.
- [ ] The accountant prepares that month independently, and differences are classified in `CALACOT_PARALLEL_ACCOUNTING_RESULTS.md`.
- [ ] Every material difference is resolved; none is forced by an adjustment.
- **Gate:** the accountant signs the parallel-run results.

## Stage 6: Limited live accounting activation

- [ ] Apply the migrations to production through the normal reviewed release, after the snapshot.
- [ ] Approve the policies and configuration in production (two people each).
- [ ] Post the opening journal.
- [ ] Enable **manual** posting only. Automatic posting stays off.
- [ ] The existing system of record (current books) continues in parallel.
- **Gate:** management signs.

## Stage 7: Reconciliation and monitoring

- [ ] Daily: integration event queue, blocked or failed events, receivables and payables reconciliation.
- [ ] Monthly: bank reconciliations finalized, cash counts, the period-close checklist, statements prepared and approved.
- [ ] Error budget: no unexplained ledger difference; every close exception approved.
- [ ] After two clean monthly closes, decide whether to enable automatic posting. This needs a separate reviewed change, because the stage constraint forbids it today.
- **Gate:** the accountant signs two consecutive clean closes.

## Stage 8: Full system-of-record cutover

- [ ] One more clean month with automatic posting.
- [ ] The independent accountant signs that the Calacot ledger is the system of record.
- [ ] Retire the old books: export and archive them read-only.
- **Gate:** management and the independent accountant sign.

## Rollback and recovery

| Situation | Action |
|---|---|
| A migration fails in production | The transaction rolls back. Fix forward with a new reviewed migration. |
| Accounting must be paused after activation | Withdraw `manual_posting_enabled` through a new approved policy version. The existing books continue as the system of record (stages 6 and 7 run in parallel). |
| A wrong journal is posted | Reverse it with a linked reversal; never edit or delete. |
| A wrong close or year-end | Authorized reopen with a reason; history is preserved. |
| Data corruption | Restore the snapshot to a new branch, compare, and replay only the verified journals. Production writes pause during recovery. |
| Opening balances found wrong | Reverse the opening journal and approve a corrected batch (it supersedes the earlier one). |

**Never:** reset the database, delete posted journals, alter applied migrations, or activate automatic posting without a reviewed change.
