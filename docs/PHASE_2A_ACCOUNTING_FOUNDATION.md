# Phase 2A: Accounting Foundation and Double-Entry General Ledger

**Status:** implemented and verified on isolated databases. **Not production-ready, not deployed and not activated.**

- No migration was run against any shared or production database.
- No production record, Clerk setting or external service was changed.
- Nothing posts automatically. Invoices, payments, credit notes, refunds, expenses and disbursements behave exactly as before.

Passing isolated tests does not make this engine production-ready. See [Production activation risks](#10-production-activation-risks).

Related documents:

- `docs/CALACOT_CHART_OF_ACCOUNTS.md`: the proposed chart.
- `docs/CALACOT_ACCOUNTING_POLICY_DECISIONS.md`: every decision that needs the accountant's approval.

---

## 1. Existing financial architecture (review)

Each existing record is classified below by whether it is an **authoritative financial event** (something a ledger should reflect) or **operational** (workflow state only).

| Record | Table(s) | What it represents | Classification |
|---|---|---|---|
| Invoice | `invoices`, `invoice_items` | Drafts are editable. Issuing assigns the legal number (`CAL-I-YYYY-nnnnnn` via `document_counters`) and freezes amounts (`sales_immutable_invoice`). Void is allowed only with no allocations or credits. | **Issued = authoritative** (billing/recognition event). Draft = operational. |
| Credit note | `credit_notes`, `credit_note_items` | Issued by `sales_invoice_command('credit')` against an issued invoice with no allocated payments. | **Issued = authoritative.** |
| Customer payment | `payments` | `submitted` (customer or staff report) → `confirmed` by staff with evidence and a receipt number (`sales_payment`), or `rejected`. | **Confirmed = authoritative cash receipt**, staff-verified but not bank-reconciled. Submitted = operational. |
| Allocation | `payment_allocations` | Links confirmed funds to an invoice; this is what reduces invoice balances (`invoiceBalancesSql`, `balanceExpression`). | **Authoritative settlement.** |
| Refund | `payment_refunds`, `payment_allocation_reversals` | The schema and balance logic exist; **no application workflow creates refunds.** | Authoritative when completed (none exist). |
| Expense request | `expenses`, `expense_events` | Draft → submitted → approved/returned/rejected, with no self-approval. Approval authorizes spending; it is not a supplier invoice. | **Approval = operational authorization**, not an accounting event by itself. |
| Disbursement | `expense_disbursements` | A manual record of money paid against an approved expense, from a verified finance account, with an optional reconciliation by a second person. Void only, never edited. | **Authoritative cash payment**; stronger evidence once reconciled. |
| Supplier | `suppliers` | Name and contact only. No bills or payables ledger. | Operational master data. |
| Finance account | `finance_accounts` | Verified company bank, mobile-money and cheque accounts used as disbursement sources. | Master data (future mapping to ledger accounts). |
| Projects | `projects` | Division, client and currency; invoices and expenses link to projects. | Analytical dimension. |
| Operational reports | `lib/finance/reports.ts`, `lib/finance/receivables.ts` | Management reports by currency from the records above. They state explicitly that they are not accounting statements. | Reporting only. |
| Audit | `audit_logs`, `expense_events` | Append-only history. | Audit. |
| Permissions | `lib/sales/permissions.ts` | Clerk role grants plus `org:calacot:*` custom permissions; live re-verification on sensitive reads and every mutation. | Authorization. |
| Migrations | `drizzle-current/` journal 0000–0017 | Hand-written PL/pgSQL functions, one transaction per call (Neon HTTP driver). Snapshots exist only up to 0015; 0016 and 0017 were hand-written. | — |

**Existing accounting implementation:** none. The financial reports page itself states "no general ledger". Phase 2A adds no second invoice, payment or expense system. The ledger is a separate layer that will reference these records by source identity in later phases.

## 2. New accounting architecture

```
            Clerk session ──► staffContext / financeMutation (permission, origin, rate limit, live re-check)
                                         │
        app/(admin)/admin/accounting/*   │  server actions: lib/accounting/actions.ts
        reads: lib/accounting/reads.ts   ▼
                         ┌──────────── PostgreSQL (one function call = one transaction) ────────────┐
                         │ accounting_* command functions (save / command / reverse / decide)       │
                         │ guard triggers: posting gate, line lock, account, period, history        │
                         │ tables: policy versions · accounts · periods · counters · exchange rates │
                         │         journals · journal lines · posting rules · events (+ audit_logs) │
                         └──────────────────────────────────────────────────────────────────────────┘
   Pure engine (no I/O, used by the form, actions and tests): lib/accounting/engine.ts, chart.ts, source-events.ts
```

- **Ownership:** every table carries the Clerk `organization_id`. All foreign keys are composite `(organization_id, id)`, so a row can never point at another organization's account, journal, period, project, rate or staff record. Functions take the organization from the verified server context only.
- **Accounts vs dimensions:** accounts are company-wide. `division` and `project_id` on each journal line are analytical dimensions. A project supplies its division, and a mismatch is refused.
- **Journal lifecycle:** `draft → submitted → approved → posted`, with `withdraw`, `return`, `reject` and `discard`. Posted is final; corrections are **reversal journals** (`journal_type = 'reversal'`). A third type, `system`, is reserved for future automatic postings and is refused while automatic posting is off.
- **Numbering:** gapless `JE-<fiscal year>-000001`, assigned *inside the posting transaction* from `accounting_counters` (never `MAX()+1`). A failed or rolled-back posting releases its number.
- **Multi-currency representation:** each line stores the transaction currency and amount. Lines in another currency also store the approved exchange rate (`exchange_rate`, `exchange_rate_id`, `rate_date`, `rate_source`) and the functional amounts. A `CHECK` requires functional = round(amount × rate, 2). Without an approved rate, the line is treated as already in the functional currency (rate 1), and the posting gate verifies that against the policy. Exchange differences are not calculated (policy item D3).
- **Policy gate:** posting requires an approved policy version (functional currency, financial-year start, manual posting enabled). The policy is proposed by one person and approved by another. `multi_currency_posting_enabled` and `automatic_posting_enabled` are pinned to `false` by `CHECK` constraints.
- **Integration preparation:** `lib/accounting/source-events.ts` catalogues every source event and labels it *approval*, *recognition*, *settlement* or *cash*, with a proposed treatment and open questions. Versioned rule definitions (`accounting_posting_rules`, two-person approval) and a pure `buildSourceJournal()` produce deterministic previews. Each preview has a source identity `(source_type, source_id, source_event)`, which a unique index guarantees can only ever create one journal. Nothing calls these from invoice, payment or expense code.
- **Independent testability:** the engine modules have no database or framework dependency. The database rules are exercised directly with SQL, and the server actions with Clerk and Next stubbed.

## 3. Schema and files changed

**Migration:** `drizzle-current/0018_accounting_foundation.sql`, which is additive. It creates nine tables and their indexes, triggers and functions, adds one journal entry, and alters no existing object. Following 0016/0017, it is hand-written SQL with no Drizzle TypeScript schema or snapshot (see §9).

| Table | Purpose |
|---|---|
| `accounting_policy_versions` | Versioned, two-person-approved policy: functional currency, financial-year start, manual posting switch, and two hard-off switches |
| `accounting_accounts` | Chart of accounts: code, name, type, contra flag, normal balance, reporting class, parent, postable/header, control flag, currency restriction, status `proposed/active/inactive` |
| `accounting_periods` | Periods with dates, status, closing and reopening authority, timestamps and reasons; no overlaps |
| `accounting_counters` | Gapless journal numbering |
| `accounting_exchange_rates` | Human-entered rates, second-person approval, one approved rate per pair and day |
| `accounting_journals` | Header: status, dates, period, totals, approvals, reversal link, source identity |
| `accounting_journal_lines` | Debit and credit lines with transaction and functional amounts, rate data, division, project |
| `accounting_posting_rules` | Versioned source-to-journal mapping definitions (inactive) |
| `accounting_events` | Append-only history of every accounting command (each event is also written to `audit_logs`) |

**New application files:**

- `lib/accounting/{engine,chart,source-events,format,reads,actions}.ts`
- `components/accounting/{shared,journal-table,journal-form,journal-actions,admin-forms}.tsx`
- `app/(admin)/admin/accounting/` pages, each with `loading.tsx` and `error.tsx`: overview, `journals`, `journals/new`, `journals/[id]`, `journals/[id]/edit`, `accounts`, `accounts/[id]`, `periods`, `trial-balance`, `policy`
- Tests:
  - `scripts/verify-accounting-engine.mts`
  - `scripts/verify-accounting-db.mts`
  - `scripts/verify-accounting-actions.mjs`
  - `scripts/verify-accounting-concurrency-postgres.mjs`
- The three documents.

**Modified files:**

| File | Change |
|---|---|
| `lib/sales/permissions.ts` | Nine new permissions; Finance and Viewer grants; added to `sensitivePermissions` |
| `lib/admin/roles.ts` | Role descriptions |
| `lib/admin/navigation.ts` | Accounting navigation entry |
| `lib/admin/breadcrumbs.ts` | Accounting labels |
| `lib/ui/status.ts` | `journal`, `account`, `period` and `accountingProposal` statuses |
| `lib/finance/context.ts` | Plain-language messages for every accounting error code |
| `scripts/verify-design-system.ts` | Status coverage now read from the 0018 `CHECK` constraints |
| `package.json` | `test:accounting` |
| `drizzle-current/meta/_journal.json` | Entry 18 |

**Permissions:**

| Permission | Default holders | Grants |
|---|---|---|
| `accounting_read` | Admin, Finance, Viewer | All accounting pages |
| `accounting_manage` | Admin, Finance | Propose accounts, load the chart, deactivate; propose policy and rates; create financial years |
| `accounting_journal_prepare` | Admin, Finance | Create and edit own drafts; submit, withdraw, discard |
| `accounting_journal_post` | Admin, Finance | Post *approved* journals |
| `accounting_journal_approve` | Admin (delegable) | Approve, return or reject journals prepared by someone else |
| `accounting_journal_reverse` | Admin (delegable) | Reverse posted journals |
| `accounting_period_close` | Admin (delegable) | Close periods |
| `accounting_period_reopen` | Admin (delegable) | Reopen periods, with a reason |
| `accounting_policy_approve` | Admin (delegable) | Approve the policy, chart accounts, exchange rates and posting rules |

"Delegable" means granting `org:calacot:<permission>` in Clerk. The intended recipient is the company accountant. Sales and project managers receive no accounting access.

## 4. Chart of accounts proposal

There are 88 accounts: 76 can receive entries and 12 are headers. They cover all eight account types, and 20 are marked *To confirm*. Division activity for Painting, Architecture, Interiors, Estates and Technology comes from line dimensions, not separate accounts. Three control accounts (1200, 2110, 2140) refuse manual journals. Full table and open questions: `docs/CALACOT_CHART_OF_ACCOUNTS.md`.

Loading the chart creates *proposed* accounts. Activation needs a second person with `accounting_policy_approve`.

## 5. Posting and reversal controls

Every rule below is enforced **in PostgreSQL**, so it holds for direct SQL as well as for the application.

| Control | Enforcement |
|---|---|
| Balanced journals | The posting gate (`accounting_journal_guard`, a `BEFORE UPDATE` trigger) requires at least two lines, total functional debits = credits > 0, and debits = credits **within each transaction currency**. Submission and approval run the same check earlier. |
| One-sided, positive, 2-dp lines | `CHECK` constraints; `numeric(17,2)` everywhere; the TypeScript engine uses `bigint` minor units with rounding identical to PostgreSQL `round()` (tested). |
| No partial postings | Each command is one function call, which is one transaction. Number, period, totals and status are set together in the trigger. |
| Immutable posted entries | Any `UPDATE` or `DELETE` of a posted journal raises `posted_journal_immutable`. Lines are writable only while their journal is a draft; the line guard takes `FOR SHARE` on the journal, so it waits for and then sees a concurrent posting. `TRUNCATE` is blocked on all accounting tables. |
| Reversal instead of deletion | `accounting_journal_reverse` posts a new mirror journal (sides swapped, same accounts, dimensions and rates), dated in an open period and not before the original. The gate verifies the mirror exactly. Each journal can be reversed once (unique index); a reversal cannot be reversed. The original row is never touched. |
| Approval and segregation | Approver ≠ preparer (`CHECK` plus function). Approval records `approved_version`; any later edit returns the journal to draft and clears approval. Posting requires `version = approved_version` and an approver who is still active (`stale_approval`). |
| Closed periods | Posting, submission and reversal into a closed period are refused. Closing is refused while journals in the period await approval or posting. Posting takes `FOR SHARE` on the period, so a concurrent close waits. Reopening needs a separate permission and a reason. |
| Invalid account combinations | Header accounts, inactive accounts, control accounts in manual journals, currency-restricted accounts, project/division mismatch, and other-organization accounts are all refused. Posting re-checks that every account is active and takes `FOR SHARE` on them, so a concurrent deactivation cannot slip through. |
| Account deactivation | Requires a reason, a zero posted balance, no submitted or approved journals using the account, and no active sub-accounts. Accounts are never deleted. Code, type and position are fixed once approved. |
| Duplicates and idempotent retries | Unique idempotency keys on journals, accounts, periods, rates, rules and events. A retried command returns the original result; reusing a key for a different command raises `idempotency_conflict`. Source events have a unique `(source_type, source_id, source_event)`. |
| Cross-organization | Composite foreign keys on every reference; every function filters by organization; reads take the organization from Clerk. |
| Unauthorized access | Server actions run through `financeMutation`: a fresh live Clerk membership check for the specific permission, same-origin check, rate limit, and active staff mirror. Database functions also require an active staff mirror (`finance_staff`). |
| Audit | Every command writes `accounting_events` (append-only) and `audit_logs`, with actor, before/after status, version, note and correlation id. |
| Historical balances | Balances are computed only from posted lines, which can never change. Corrections are new dated entries, and closed-period trial balances are verified stable after a reversal. |

## 6. Accounting policies requiring approval

See `docs/CALACOT_ACCOUNTING_POLICY_DECISIONS.md`. The main ones are:

- functional currency and financial-year start (not assumed);
- whether to enable manual posting;
- who approves;
- revenue recognition;
- expense recognition (accrual or cash);
- mappings from finance accounts and expense categories to ledger accounts;
- exchange-rate source and exchange differences;
- tax treatment;
- the period-close process;
- the QuickBooks cut-over and opening balances.

## 7. Test results

All runs were on disposable databases: in-memory PGlite (PostgreSQL 17), and a throwaway local PostgreSQL 17.5 (`embedded-postgres`, installed in a temporary folder outside the repository, data deleted afterwards). No environment variables or real databases were used.

| Suite | Result |
|---|---|
| `scripts/verify-accounting-engine.mts` (pure engine) | **PASS, 8 checks.** Decimal parsing and limits; normal balances; conversion rounding identical to PostgreSQL across 7 cases; per-currency balance; validation stages; reversal lines; chart validity (divisions are dimensions); mapping previews (identity, routing, balance, rejection). |
| `scripts/verify-accounting-db.mts` (PGlite, chain 0000–0018) | **PASS, 24 checks.** Disabled-by-default; hard-off switches cannot be enabled; chart load (idempotent, never overwrites); account rules, hierarchy, cycles, delete denial; two-person chart approval; policy approval and history; period generation and overlap; unbalanced drafts allowed but not submittable; invalid lines; self-approval and stale versions; posting disabled by policy; posting (numbering, period, totals, immutability, idempotency); direct SQL cannot post unbalanced, stale or pre-numbered journals; stale approvals; deactivation rules; reversal; closed periods (no submit, post or reverse; balances stable; reopen with reason); missing period; multi-currency boundaries; cross-organization denial; trial balance; posting rules; append-only history; no operational table touched. |
| `scripts/verify-accounting-actions.mjs` (real server actions and permission module; Clerk and Next stubbed) | **PASS, 9 checks.** Role permissions (Viewer read-only, Sales none, Finance cannot approve, reverse or close, Admin all); readiness checklist; chart through actions; delegated Clerk permission still cannot self-approve; full workflow draft → post → reverse with trial balance; friendly errors and not-found for unknown or other-org records; cross-origin and revoked-membership refusal; period permissions; expense workflow unaffected and nothing auto-posted. |
| `scripts/verify-accounting-concurrency-postgres.mjs` (real PostgreSQL 17.5, two overlapping connections; each blocking case asserts the second transaction is actually blocked) | **PASS, 13 checks.** Chain applied in one transaction; same-key creation gives one journal; double posting of one journal gives one posting; concurrent postings are serialized and gapless; a rolled-back posting leaves no gap; posting vs close (close waits); close vs reversal (reversal waits, then refused); concurrent reversals give one; line insert vs posting (waits, then refused); approve vs return (one decision); posting vs deactivation (waits, then refused for balance); an unrelated deactivation does not block; trial balance balanced afterwards. |
| Regressions on the 0000–0018 chain | **PASS:** `test:sales`, `test:verification`, `verify-finance-expenses`, `verify-finance-documents`, `verify-documents-reports`, `verify-staff-admin`, `verify-phase1e-history`, `verify-quotation-catalogue`, `test:org-routing`, `test:whatsapp-consent`, `test:customer-care`, `test:design-system`. |
| Pre-existing failures (not caused by this phase) | `verify-phase1e-static.mjs` flags `components/admin/project-team-actions.tsx` (a solid destructive button). `verify-project-workspace-db.mjs` calls Next `cacheLife()` outside Next. **Both fail identically on a clean checkout of `HEAD` (6a6bf60)** and were left unchanged. |
| `tsc --noEmit` | **PASS** (0 errors). |
| ESLint (all new and changed files) | **PASS** (0 errors, 0 warnings). |
| Production build | **PASS** on an isolated copy with no `.env` files (no Sentry upload, unreachable dummy database, dummy Clerk key, public Sanity values only): compiled, 92/92 pages, all 10 `/admin/accounting/*` routes present. |

`npm run test:accounting` runs the engine, database and action suites. The concurrency suite needs an empty database named `phase2a_accounting_fixture`:
`echo "<url>" | node scripts/verify-accounting-concurrency-postgres.mjs`

**Not run:**

- Authenticated browser acceptance (desktop and mobile, per role). The application's Neon HTTP driver needs a Neon fixture database and development Clerk users. Running the dev server against `.env.local` would use the live database, so it was not done.
- The pages were therefore verified by type-checking, the build, and the action and read tests, not visually.

## 8. Remaining limitations

- **No automatic postings.** Mappings are prepared and inactive; no invoice, payment, credit note, refund, expense or disbursement creates journals. Rules need policy decisions (section C of the policy document).
- **Multi-currency posting is disabled** by constraint. Exchange differences, revaluation and settlement differences are not implemented.
- **No financial statements.** Only the trial balance exists, by design. There is no year-end close to retained earnings and no budget.
- **No sub-ledgers.** Receivables and payables control accounts are not yet fed from invoices or suppliers. The operational invoice balances remain the source of truth for customer balances.
- **No bank reconciliation** or bank data source.
- **No opening balances or QuickBooks migration.**
- **Reads are not cached**, so the ledger is always live. Large ledgers may later need pagination on the trial balance and indexes beyond those added.
- **The account activity running balance** starts at the first line in the selected range; the opening balance is shown separately.
- **Database privileges:** the database enforces segregation by *identity*, such as approver ≠ preparer and an active staff member. It cannot know Clerk permissions. Direct write access to the database must be restricted to the application role, as for earlier phases.
- **Drizzle schema/snapshot:** as with 0016/0017, there is no TypeScript schema or snapshot for 0018. Running `drizzle-kit generate` would not see these tables. Reconcile the snapshots before the next generated migration.

## 9. Migration requirements

1. Review `0018_accounting_foundation.sql`. It is additive and creates only `accounting_*` objects, but it is long and security-relevant.
2. Confirm 0016 and 0017 are applied in the target environment, and compare the deployed journal and schema read-only. 0017 is recorded as not yet applied anywhere.
3. Back up or branch the production database, and rehearse 0016–0018 on a representative copy.
4. Run `npm run test:accounting`, then the concurrency suite on an isolated real PostgreSQL. Ideally also run it on a Neon branch, because production uses Neon.
5. Apply through the approved deployment process. Nothing activates on migration: with no policy, the ledger cannot create periods or post.
6. Rollback: redeploy the previous application build. The new tables are unused by older code. Do not drop accounting tables once any journal is posted.

## 10. Production activation risks

| Risk | Mitigation |
|---|---|
| Posting before policies are agreed | Posting needs an approved policy, which needs two people. Keep manual posting **off** in the first approved policy and rehearse with it off. |
| A wrong functional currency or financial year | Both lock once used: functional currency after the first posting, the start month after the first period. Get them in writing from the accountant first. |
| Approving the chart without review | Approval is a second-person action that should be held by the accountant. Unreviewed accounts stay proposed. |
| Manual journals drifting from operational records | Control accounts refuse manual journals. Until sub-ledger postings exist, the ledger is **not** a complete record of invoices and payments. Do not use it for statutory reporting yet. |
| Treating the trial balance as financial statements | The page states it is a working report. Statements are out of scope until mappings and policies are approved. |
| Role misconfiguration in Clerk | Approve, reverse, close and reopen default to administrators. Delegate deliberately and review the staff page. |
| Concurrency on Neon | Verified on PostgreSQL 17.5 with real overlapping transactions; not yet on Neon. Re-run the concurrency suite on a Neon branch. |
| UI not acceptance-tested | Run authenticated browser acceptance per role, desktop and mobile, on a fixture database before enabling the navigation for staff. |
| Direct database writes | Restrict database credentials. Triggers stop invalid accounting states but cannot check Clerk permissions. |

**Phase 2B is not started.**
