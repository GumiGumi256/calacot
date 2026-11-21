# Calacot Accounting Event Mappings (Phase 2B)

**Status:** the mapping *system* is implemented and verified on isolated databases. **No mapping is approved or created by the migration.** Every mapping below marked *proposed* is a suggestion for the accountant, not a decision. Until a mapping is approved by two people, every recognition, cash and settlement event waits in the exception queue (`mapping_missing`). Nothing is guessed.

Related: `docs/PHASE_2B_AUTOMATED_ACCOUNTING.md`, `docs/CALACOT_ACCOUNTING_RECONCILIATION.md`, `docs/CALACOT_ACCOUNTING_POLICY_DECISIONS.md`, `docs/CALACOT_CHART_OF_ACCOUNTS.md`.

## 1. Business events (`calacot.event/v1`)

Each event is one authoritative change to one source record. It is captured by an `AFTER` trigger **in the same transaction** as the business change, so it exists if and only if the change committed. Its identity is `event_key = <event_type>:<source id>` (unique per organization), and the journal it produces carries the same identity in `accounting_journals (source_type, source_id, source_event)`, which also has a unique index. One event can never produce two journals.

The single source of truth is `accounting_event_catalog()` in `drizzle-current/0019_accounting_integration.sql`. `lib/accounting/integration-catalog.ts` mirrors it, and `scripts/verify-accounting-integration-engine.mts` fails if they differ.

| Event | Source record and trigger | Kind | Accounting date | Depends on | Needs a mapping? |
|---|---|---|---|---|---|
| `invoice_issued` | `invoices` status → `issued` | recognition | Kampala date of `issued_at` | — | Yes |
| `invoice_voided` | `invoices` `issued` → `void` | correction | `voided_at` | `invoice_issued` | No: exact reversal |
| `credit_note_issued` | `credit_notes` → `issued` | recognition | `issued_at` | `invoice_issued` of its invoice | Yes |
| `credit_note_voided` | `credit_notes` `issued` → `void` (no workflow today) | correction | `voided_at` | `credit_note_issued` | No: exact reversal |
| `payment_confirmed` | `payments` → `confirmed` | cash | `received_at` (when the customer paid) | — | Yes |
| `payment_allocated` | `payment_allocations` insert | settlement | `created_at` | `payment_confirmed`, `invoice_issued` | Yes |
| `refund_completed` | `payment_refunds` → `completed` (no workflow today) | cash | `completed_at` | `payment_confirmed` | Yes |
| `allocation_reversed` | `payment_allocation_reversals`, once its refund is completed | settlement | later of refund completion and reversal | `payment_allocated` | Yes |
| `expense_approved` | `expenses` `submitted` → `approved` | **approval** | `approved_at` | — | **No.** Without an approved mapping it is recorded as *no accounting effect* |
| `disbursement_recorded` | `expense_disbursements` insert | cash | `paid_on` | `expense_approved` | Yes |
| `disbursement_voided` | `expense_disbursements` → `void` | correction | `voided_at` | `disbursement_recorded` | No: exact reversal |
| `disbursement_reconciled` | `expense_disbursements.reconciled_at` set | evidence | `reconciled_at` | `disbursement_recorded` | No. No mapping means no effect |

Not captured (operational only): draft and submitted invoices, submitted and rejected payments, draft, submitted, returned and rejected expenses, quotation events.

**Event payload.** A snapshot taken at capture: document number, client, project, division (from the project for sales documents, from the expense for costs), billing kind, subtotal, discount, net, tax, total, tax treatment, payment method, verified finance account, expense category (lower-cased), supplier link and references. The snapshot never changes. Issued invoices are immutable in the sales schema, so the snapshot equals the issued document; invoice totals and PDF snapshots are never modified.

**Billing kind.** `deposit` = an invoice with a billing schedule and purpose `initial` (the deposit invoice raised on quotation confirmation); `milestone` = any other scheduled invoice; `standard` = no schedule.

## 2. Mapping definition (`calacot.mapping/v1`)

A mapping is stored in `accounting_event_mappings`:

| Field | Meaning |
|---|---|
| `event_type` | One of the nine mappable events (corrections are never mapped). |
| `conditions` | Exact-match facts, all of which must match. Allowed keys per event are in §1 of the catalogue: `currency`, `division`, `billingKind`, `taxTreatment` (`none`/`taxed`), `method`, `financeAccountId`, `category`, `supplierLinked`, `expenseRecognized` (`yes`/`no`, computed when processing). Empty conditions match any event of the type. |
| `treatment` | `journal`, or `no_entry` (a recorded decision that the event has no accounting effect). |
| `definition.lines` | 2 to 20 lines: `side` (debit/credit), `amount` (an amount key of the event: `total`, `net`, `tax` or `amount`), `account` as `{ "code": "1200" }` or `{ "byDivision": { "painting": "4200", ... }, "fallback": "4100" }`, optional `memo`. |
| `priority` | 0–1000, tie-breaker between equally specific mappings. |
| `policy_version` | Optional: applies only while that accounting policy version is in effect. |
| `effective_from` | Applies to events whose posting date is on or after this date. |

**Resolution.** Only *approved* mappings whose every condition matches are considered. The one with the most conditions wins, then the highest priority. Two equally specific mappings with the same priority → `mapping_ambiguous` (blocked). No match → `mapping_missing` (blocked), except approval and evidence events, which become *no effect*. A matched line with a division but no account for that division and no fallback → `mapping_account_missing`. The resolved mapping id and version, and the policy version, are stored on the event.

**Safety rules applied at processing.**

- Lines with a zero amount are skipped; the journal must still balance and have at least two lines (`mapping_unbalanced`).
- **Tax:** a document with tax may only use a mapping that has the condition `taxTreatment = taxed` (`tax_treatment_unapproved` otherwise). No tax is computed; the captured tax amount is posted where the approved mapping says.
- **Currency:** only events in the policy's functional currency are applied. Others are blocked `fx_policy_unapproved`. Nothing is converted and no rate is invented.
- **Accounts:** every account must exist, be active, be postable and accept the currency. Control accounts (1200, 2110, 2140) refuse manual journals but accept these system journals.
- **No double counting of costs:** a disbursement's `expenseRecognized` fact is `yes` only when the expense's approval event produced a journal. An accrual mapping on approval plus a settlement mapping with `expenseRecognized = yes` therefore posts the cost once.

**Governance.** Proposing needs `accounting_manage` (Finance, Admin). Approving, rejecting or retiring needs `accounting_policy_approve` (Admin; delegable to the accountant as `org:calacot:accounting_policy_approve`). The approver must differ from the proposer (database `CHECK`), every named account must be active and postable at approval, and an accounting policy must be approved. Proposals are immutable; approving a mapping with the same conditions and priority as an approved one retires the old version. Every proposal and decision is written to `accounting_events` and `audit_logs`. Sales, project managers and viewers cannot change mappings.

Approving a mapping does not reprocess anything by itself: blocked events are retried by an authorized operator (the event page explains this).

## 3. Proposed mappings for the accountant's review (none approved)

These follow the Phase 2A treatments (`lib/accounting/source-events.ts`) and the proposed chart. Each needs the decision noted (see `docs/CALACOT_ACCOUNTING_POLICY_DECISIONS.md`).

| Event | Conditions | Proposed lines | Decision needed |
|---|---|---|---|
| `invoice_issued` | `billingKind = standard`, `taxTreatment = none` | Dr 1200 Trade receivables (total) / Cr revenue by division: architecture and interiors 4100, painting 4200, estates 4410, tech 4600 (net) | C1: is revenue earned at invoice for each division? Contract works may need over-time recognition (1260 contract assets) instead. |
| `invoice_issued` | `billingKind = deposit` | Dr 1200 (total) / Cr 2130 Customer deposits and advances (total) | C1: deposits are not revenue until work is delivered. A later release from 2130 to revenue is **not** automated in Phase 2B. |
| `invoice_issued` | `billingKind = milestone` | As standard, or to 2130, per contract | C1 |
| `invoice_issued` | `taxTreatment = taxed` (with billing kind) | Dr 1200 (total) / Cr revenue (net) / Cr 2180 VAT payable (tax) | E: tax adviser must confirm VAT registration. Until then taxed invoices stay blocked. |
| `credit_note_issued` | `taxTreatment = none` | Dr 4900 Sales discounts and credit notes (total) / Cr 1200 (total) | C4: contra-revenue, or reverse the original revenue account (`byDivision`). Deposit credits may need Dr 2130 instead (condition `billingKind = deposit`). |
| `payment_confirmed` | `method = bank_transfer`, `mobile_money`, `cash`, `other` (one each) | Dr 1140 Cash in transit / undeposited receipts / Cr 2140 Unallocated customer receipts | C2: staff verification is not bank settlement, so receipts go to the 1140 clearing account, not directly to a bank account. Clearing 1140 to banks needs bank reconciliation (C8, later phase). |
| `payment_allocated` | — | Dr 2140 / Cr 1200 | C3. Deposit invoices are allocated the same way (1200 was debited at issue). |
| `refund_completed` | — | Dr 2140 / Cr 1140 | C5: the refund workflow does not exist yet. |
| `allocation_reversed` | — | Dr 1200 / Cr 2140 | C5 |
| `expense_approved` | (none) | **No mapping** = cash basis: no entry on approval | C6. If accrual is chosen: e.g. `category = materials` → Dr 5100 / Cr 2110 Trade payables (supplier-linked) or 2120 Accrued expenses. |
| `disbursement_recorded` | `expenseRecognized = no` (+ `method`/`financeAccountId`, `category`, `division`) | Dr expense account by category (5xxx/6xxx) / Cr source: 1110 petty cash (cash), 1120 or a per-account 1120-nn (bank, by `financeAccountId`), 1130 (mobile money) | C7: post on recording or after reconciliation; map each verified finance account and each category. |
| `disbursement_recorded` | `expenseRecognized = yes` | Dr 2110 or 2120 (whichever the approval credited) / Cr source account | C6/C7. Never Dr expense again. |
| `disbursement_reconciled` | (none) | No effect | C7. If the accountant posts on recording to a clearing account, map reconciliation to move clearing → bank. |
| Advances and prepayments | — | Not represented by any workflow. An expense category such as `advance` could map to 1230 Staff advances or 1240 Prepayments | Needs a policy and, later, a settlement workflow. |

Categories are free text today (`lib/finance/options.ts` only suggests values). A category mapping matches the lower-cased, trimmed text exactly; unmapped categories are blocked rather than sent to a default account. A fallback can be expressed as a less specific mapping (e.g. `expenseRecognized = no` only → 6990 General and administrative), but only if the accountant approves that fallback.

## 4. Corrections

Corrections never edit a posted journal:

- `invoice_voided`, `credit_note_voided`, `disbursement_voided`: a reversal journal (`journal_type = 'reversal'`) mirrors the original exactly, dated at the void (never before the original). If the original had no accounting effect, the void has none either.
- Allocation reversals and refunds are their own mapped events.
- A system journal cannot be reversed by hand (`system_journal_reversal_denied`); it is corrected through its source document so the ledger and the sub-ledger stay in step.
- Events blocked by a closed period may be **re-dated forward** into an open period by an authorized operator with a recorded reason. The original source date is kept on the event. Backdating is refused (`backdating_denied`).
