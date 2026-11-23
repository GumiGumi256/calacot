# Git synchronization report (Phase 2F stabilization)

**Audience:** the repository owner and reviewers preparing the accounting work for review on GitHub.

## 1. Starting state

- **Branch:** `feat/accounting-ledger-integration`. HEAD `9faf682`: "feat(accounting): double-entry ledger and automated source-to-ledger integration", which contains Phase 2A–2B and migrations 0018–0019.
- **Remote:** `origin` → `github.com/GumiGumi256/calacot`. The branch has **not** been pushed by this work.
- **Uncommitted:** 108 paths (27 modified tracked files, the rest untracked), from **four** streams of work:

| Stream | Content |
|---|---|
| Sales: shareable documents and WhatsApp receipts | Migration 0020; secure `/shared/[token]` invoice and receipt pages and API; receipt and payment-statement PDFs; Sentry scrubbing of shared URLs; WhatsApp receipt template queue (`lib/sales/worker.ts`, `config.ts`); `verify-shared-documents.mjs`; `verify-sales.ts` additions |
| Accounting Phase 2C–2F | Migrations 0021–0024; banking, reconciliation, tax, assets, payroll, statements, closing, year-end, opening-balance staging; pages, components, libraries, tests, policy documents |
| Regression repairs (Phase 2F) | `project-team-actions.tsx` submit-button defect; test harness fixes in `verify-fresh-sales`, `verify-project-manager-assignment`, `verify-project-workspace{,-db}` |
| Stabilization (this pass) | Test-safety tooling, isolated-environment tooling, migration-chain checker, local-host guards on PostgreSQL suites, reports and checklists |

## 2. Hygiene checks before committing

| Check | Result |
|---|---|
| Secrets in candidate files: Clerk live/test secret keys, Neon `npg_` passwords, connection strings with credentials, AWS / Resend / Meta / GitHub / Slack / Twilio tokens, private keys, webhook secrets | **None found.** The only pattern hit is an unchanged, already-committed minified Sanity bundle in `dist/` (false positive). The Sentry DSN in the Sentry configs is already committed and public by design. |
| Environment files | `.env`, `.env.local`, `.env.sentry-build-plugin` are git-ignored and untracked; none can be committed. `.env` was modified on 23 Nov 2026 outside this work; it was not inspected (risk R25). |
| Generated files | `tmp/` (test bundles, benchmark and parallel-run evidence, captures) and `.next/` are ignored. No generated output is staged. |
| Obsolete files | `scripts/verify-bank-mapping-db.mts` and `scripts/verify-bank-mapping-concurrency-postgres.mjs` deleted after confirming they were unused. `database/document-verification-draft.sql` (marked by its author as superseded by migration 0017 and deletable) is **left untracked and uncommitted** for the owner to delete. |
| Migration history | Committed migrations 0000–0019 and their journal entries are byte-identical to HEAD (`npm run test:migration-chain`). |

## 3. Dedicated branch and commits

Branch **`dev/accounting-phase-2c-2f`**, created from `feat/accounting-ledger-integration` at `9faf682`. Commits, in order:

1. **`feat(sales): shareable invoice and receipt documents, WhatsApp receipt notifications`.** The sales stream, with the journal and `package.json` limited to that stream: journal entries through 0020 and `test:shared-documents`.
2. **`fix: project-team removal submit button and stale regression-test harnesses`.**
3. **`feat(accounting): Phase 2C–2F banking, tax and assets, statements, closing and opening-balance staging`.** Migrations 0021–0024, the full journal, application code, tests and documents.
4. **`chore(accounting): Phase 2F stabilization tooling and reports`.** Safety tooling, isolated-environment tooling, local-host guards, and these reports.

Each commit is limited to its own stream. The final tree is the verified tree:

- every safe suite passes (`npm run test:safe`);
- all nine local-fixture PostgreSQL suites pass;
- the full production build passes;
- `tsc` is clean.

Intermediate commits were not individually built.

## 4. Not done, by design

- **Nothing pushed.** Pushing creates a GitHub branch and may start a Vercel preview build with whatever environment the preview scope uses (risk R24). To publish for review, once preview isolation is confirmed:

  ```
  git push -u origin dev/accounting-phase-2c-2f
  ```

  Then open a pull request **into `feat/accounting-ledger-integration` or `main`, as a draft**. Do not merge.
- **Not merged** into `main` or any other branch. **No deployment** was triggered.

## 5. Files that must be committed for a reviewable accounting change

The minimum is commits 1 and 3. The journal references migration 0020, so the sales stream must be present, or the journal re-sequenced, before the accounting migrations can be reviewed or applied. Commits 2 and 4 are needed for the test suites and safety tooling to pass on the reviewed branch.
