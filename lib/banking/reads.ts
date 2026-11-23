import "server-only";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { financeContext, type FinanceContext } from "@/lib/finance/context";
import { suggestMatches, toMinor } from "@/lib/accounting/bank-reconciliation";
import { maskIdentifier } from "./catalog";

/*
 * Phase 2C banking reads. Every read authorizes first (banking_read) and takes the organization from
 * the verified Clerk context. Not cached: balances and match state must always be current. Book
 * balances come only from POSTED journal lines; statement balances only from imported statements.
 * No external provider balance is available in this phase, so none is ever shown as confirmed.
 * Full account numbers are never returned (last four characters only).
 */

export type SearchParams = Record<string, string | string[] | undefined>;
const one = (raw: SearchParams, k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
const isDate = (v: string) => z.iso.date().safeParse(v).success;
const isUuid = (v: string) => z.uuid().safeParse(v).success;

export async function bankingContext() {
  const ctx = await financeContext(["banking_read"]);
  const me = (await db.execute<{ id: string }>(sql`SELECT id FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND clerk_user_id=${ctx.actor} AND status='active'`)).rows[0]?.id ?? null;
  return { ctx, me, can: bankingCan(ctx) };
}
export function bankingCan(ctx: FinanceContext) {
  return {
    manage: ctx.can("banking_manage"),
    approveMapping: ctx.can("accounting_policy_approve"),
    importStatements: ctx.can("banking_import"),
    match: ctx.can("banking_match"),
    reconcile: ctx.can("banking_reconcile"),
    finalize: ctx.can("banking_reconcile_approve"),
    reopen: ctx.can("banking_reconcile_reopen"),
    createCash: ctx.can("cash_create"),
    approveCash: ctx.can("cash_approve"),
  };
}
export type BankingCan = ReturnType<typeof bankingCan>;

async function today() {
  return (await db.execute<{ d: string }>(sql`SELECT finance_kampala_today()::text AS d`)).rows[0].d;
}

export type BankingAccountRow = {
  id: string; kind: string; label: string; currency: string; status: string; version: number; provider: string | null; identifier: string;
  custodian: string | null; custodian_id: string | null; float_amount: string | null;
  ledger_id: string | null; ledger_code: string | null; ledger_name: string | null; mapping_pending: boolean;
  book_balance: string; statement_balance: string | null; statement_date: string | null;
  reconciled_to: string | null; reconciled_balance: string | null; open_reconciliation_id: string | null; open_reconciliation_status: string | null;
  unmatched_count: number; unmatched_net: string; review_count: number; pending_cash: number;
};

/** Accounts with their three balances kept apart: book (posted ledger), statement (imported), reconciled (finalized). */
async function accountRows(org: string, where = sql`TRUE`) {
  const rows = (await db.execute<Omit<BankingAccountRow, "identifier"> & { account_normalized: string | null }>(sql`
    SELECT b.id,b.kind,b.label,b.currency,b.status,b.version,f.provider,f.account_normalized,coalesce(c.display_name,c.clerk_user_id) AS custodian,b.custodian_id,b.float_amount::text,
      a.id AS ledger_id,a.code AS ledger_code,a.name AS ledger_name,
      EXISTS(SELECT 1 FROM bank_account_mappings m WHERE m.organization_id=b.organization_id AND m.banking_account_id=b.id AND m.status='proposed') AS mapping_pending,
      banking_book_balance(b.organization_id,b.id,NULL)::text AS book_balance,
      sl.running_balance::text AS statement_balance,sl.txn_date::text AS statement_date,
      fin.period_end::text AS reconciled_to,fin.closing_statement_balance::text AS reconciled_balance,
      op.id AS open_reconciliation_id,op.status AS open_reconciliation_status,
      (SELECT count(*)::int FROM bank_statement_lines s WHERE s.organization_id=b.organization_id AND s.banking_account_id=b.id AND s.review_status='active' AND s.amount<>banking_matched(s.organization_id,s.id,NULL,NULL)) AS unmatched_count,
      (SELECT coalesce(sum(s.amount-banking_matched(s.organization_id,s.id,NULL,NULL)),0)::text FROM bank_statement_lines s WHERE s.organization_id=b.organization_id AND s.banking_account_id=b.id AND s.review_status='active') AS unmatched_net,
      (SELECT count(*)::int FROM bank_statement_lines s WHERE s.organization_id=b.organization_id AND s.banking_account_id=b.id AND s.review_status='needs_review') AS review_count,
      (SELECT count(*)::int FROM cash_transactions t JOIN accounting_journals j ON j.organization_id=t.organization_id AND j.id=t.journal_id AND j.status='submitted' WHERE t.organization_id=b.organization_id AND (t.banking_account_id=b.id OR t.counter_banking_account_id=b.id)) AS pending_cash
    FROM banking_accounts b
    LEFT JOIN finance_accounts f ON f.organization_id=b.organization_id AND f.id=b.finance_account_id
    LEFT JOIN staff_memberships c ON c.organization_id=b.organization_id AND c.id=b.custodian_id
    LEFT JOIN accounting_accounts a ON a.organization_id=b.organization_id AND a.id=banking_ledger(b.organization_id,b.id)
    LEFT JOIN LATERAL (SELECT s.running_balance,s.txn_date FROM bank_statement_lines s WHERE s.organization_id=b.organization_id AND s.banking_account_id=b.id AND s.review_status='active' AND s.running_balance IS NOT NULL ORDER BY s.txn_date DESC,s.created_at DESC,s.source_row DESC LIMIT 1) sl ON true
    LEFT JOIN LATERAL (SELECT r.period_end,r.closing_statement_balance FROM bank_reconciliations r WHERE r.organization_id=b.organization_id AND r.banking_account_id=b.id AND r.status='finalized' ORDER BY r.period_end DESC LIMIT 1) fin ON true
    LEFT JOIN LATERAL (SELECT r.id,r.status FROM bank_reconciliations r WHERE r.organization_id=b.organization_id AND r.banking_account_id=b.id AND r.status<>'finalized' LIMIT 1) op ON true
    WHERE b.organization_id=${org} AND ${where}
    ORDER BY b.status,b.currency,b.kind,b.label`)).rows;
  return rows.map(({ account_normalized, ...r }) => ({ ...r, identifier: maskIdentifier(account_normalized) })) as BankingAccountRow[];
}

export async function readBankingOverview() {
  const { ctx, me, can } = await bankingContext();
  const org = ctx.organizationId;
  const [accounts, pendingMappings, pendingCategories, pendingCash, submittedRecs, policy] = await Promise.all([
    accountRows(org),
    db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM bank_account_mappings WHERE organization_id=${org} AND status='proposed'`),
    db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM banking_category_accounts WHERE organization_id=${org} AND status='proposed'`),
    db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM cash_transactions t JOIN accounting_journals j ON j.organization_id=t.organization_id AND j.id=t.journal_id WHERE t.organization_id=${org} AND j.status='submitted'`),
    db.execute<{ id: string; label: string; period_end: string }>(sql`SELECT r.id,b.label,r.period_end::text FROM bank_reconciliations r JOIN banking_accounts b ON b.organization_id=r.organization_id AND b.id=r.banking_account_id WHERE r.organization_id=${org} AND r.status='submitted' ORDER BY r.period_end`),
    db.execute<{ manual_posting_enabled: boolean; functional_currency: string }>(sql`SELECT manual_posting_enabled,functional_currency FROM accounting_policy_versions WHERE organization_id=${org} AND status='approved'`),
  ]);
  return {
    can, me, accounts,
    attention: {
      pendingMappings: pendingMappings.rows[0].n, pendingCategories: pendingCategories.rows[0].n, pendingCash: pendingCash.rows[0].n,
      submittedReconciliations: submittedRecs.rows,
      unmapped: accounts.filter((a) => a.status === "active" && !a.ledger_id).length,
      review: accounts.reduce((s, a) => s + a.review_count, 0),
      unmatched: accounts.reduce((s, a) => s + a.unmatched_count, 0),
    },
    policy: policy.rows[0] ?? null,
  };
}

export type MappingRow = { id: string; banking_account_id: string; account_label: string; ledger_code: string; ledger_name: string; status: string; note: string; proposed_by: string; proposed_by_id: string; proposed_at: string; decided_by: string | null; decided_at: string | null; decision_note: string | null; retire_reason: string | null };
export type CategoryRow = { id: string; category: string; ledger_code: string; ledger_name: string; status: string; note: string; proposed_by: string; proposed_by_id: string; proposed_at: string; decided_by: string | null; decision_note: string | null };

export async function readBankingSetup() {
  const { ctx, me, can } = await bankingContext();
  const org = ctx.organizationId;
  const [accounts, finance, staff, ledgers, mappings, cats, catAccounts] = await Promise.all([
    accountRows(org),
    db.execute<{ id: string; method: string; provider: string; label: string; currency: string; account_normalized: string }>(sql`SELECT f.id,f.method,f.provider,f.label,f.currency,f.account_normalized FROM finance_accounts f
      WHERE f.organization_id=${org} AND f.status='active' AND f.method IN ('bank_transfer','mobile_money') AND NOT EXISTS(SELECT 1 FROM banking_accounts b WHERE b.organization_id=f.organization_id AND b.finance_account_id=f.id) ORDER BY f.method,f.provider,f.label`),
    db.execute<{ id: string; name: string }>(sql`SELECT id,coalesce(display_name,clerk_user_id) AS name FROM staff_memberships WHERE organization_id=${org} AND status='active' ORDER BY 2 LIMIT 200`),
    db.execute<{ id: string; code: string; name: string; currency: string | null }>(sql`SELECT a.id,a.code,a.name,a.currency FROM accounting_accounts a WHERE a.organization_id=${org} AND a.status='active' AND a.is_postable AND a.account_type='asset' AND NOT a.is_contra AND a.manual_posting_allowed
      AND NOT EXISTS(SELECT 1 FROM bank_account_mappings m WHERE m.organization_id=a.organization_id AND m.ledger_account_id=a.id AND m.status='approved') ORDER BY a.code`),
    db.execute<MappingRow>(sql`SELECT m.id,m.banking_account_id,b.label AS account_label,a.code AS ledger_code,a.name AS ledger_name,m.status,m.note,coalesce(p.display_name,p.clerk_user_id) AS proposed_by,m.proposed_by_id,m.proposed_at::text,
        coalesce(d.display_name,d.clerk_user_id) AS decided_by,m.decided_at::text,m.decision_note,m.retire_reason
      FROM bank_account_mappings m JOIN banking_accounts b ON b.organization_id=m.organization_id AND b.id=m.banking_account_id JOIN accounting_accounts a ON a.organization_id=m.organization_id AND a.id=m.ledger_account_id
      LEFT JOIN staff_memberships p ON p.organization_id=m.organization_id AND p.id=m.proposed_by_id LEFT JOIN staff_memberships d ON d.organization_id=m.organization_id AND d.id=m.decided_by_id
      WHERE m.organization_id=${org} ORDER BY (m.status='proposed') DESC,m.proposed_at DESC LIMIT 100`),
    db.execute<CategoryRow>(sql`SELECT c.id,c.category,a.code AS ledger_code,a.name AS ledger_name,c.status,c.note,coalesce(p.display_name,p.clerk_user_id) AS proposed_by,c.proposed_by_id,c.proposed_at::text,coalesce(d.display_name,d.clerk_user_id) AS decided_by,c.decision_note
      FROM banking_category_accounts c JOIN accounting_accounts a ON a.organization_id=c.organization_id AND a.id=c.ledger_account_id
      LEFT JOIN staff_memberships p ON p.organization_id=c.organization_id AND p.id=c.proposed_by_id LEFT JOIN staff_memberships d ON d.organization_id=c.organization_id AND d.id=c.decided_by_id
      WHERE c.organization_id=${org} ORDER BY (c.status='proposed') DESC,c.proposed_at DESC LIMIT 100`),
    db.execute<{ id: string; code: string; name: string; account_type: string }>(sql`SELECT a.id,a.code,a.name,a.account_type FROM accounting_accounts a WHERE a.organization_id=${org} AND a.status='active' AND a.is_postable AND a.manual_posting_allowed
      AND a.account_type IN ('asset','operating_expense','other_expense','other_income','income') AND NOT EXISTS(SELECT 1 FROM bank_account_mappings m WHERE m.organization_id=a.organization_id AND m.ledger_account_id=a.id AND m.status='approved') ORDER BY a.code`),
  ]);
  return {
    can, me, accounts,
    financeAccounts: finance.rows.map(({ account_normalized, ...f }) => ({ ...f, identifier: maskIdentifier(account_normalized) })),
    staff: staff.rows, ledgers: ledgers.rows, mappings: mappings.rows, categories: cats.rows, categoryAccounts: catAccounts.rows,
  };
}

export type StatementLineRow = {
  id: string; txn_date: string; description: string; reference: string | null; amount: string; running_balance: string | null; review_status: string; review_reason: string | null;
  duplicate_of_id: string | null; matched: string; residual: string; file_name: string; adjustment_status: string | null; source_row: number;
};
export type LedgerLineRow = { id: string; journal_id: string; number: string; entry_date: string; description: string; reference: string | null; amount: string; matched: string; residual: string };
export type MatchGroupRow = { id: string; kind: string; status: string; effective_date: string; partial: boolean; note: string | null; created_by: string; created_at: string; locked: boolean;
  items: { statementLineId: string | null; journalLineId: string | null; amount: string; label: string; date: string }[] };

export async function readBankingAccount(id: string, raw: SearchParams) {
  if (!isUuid(id)) notFound();
  const { ctx, me, can } = await bankingContext();
  const org = ctx.organizationId;
  const account = (await accountRows(org, sql`b.id=${id}::uuid`))[0];
  if (!account) notFound();
  const view = ["unmatched", "review", "all", "duplicates"].includes(one(raw, "view")) ? one(raw, "view") : "unmatched";
  const filter = view === "review" ? sql`s.review_status='needs_review'` : view === "duplicates" ? sql`s.review_status='duplicate'` : view === "all" ? sql`s.review_status<>'duplicate'`
    : sql`s.review_status='active' AND s.amount<>banking_matched(s.organization_id,s.id,NULL,NULL)`;
  const [lines, ledger, groups, imports, locked, recs, cats] = await Promise.all([
    db.execute<StatementLineRow>(sql`SELECT s.id,s.txn_date::text,s.description,s.reference,s.amount::text,s.running_balance::text,s.review_status,s.review_reason,s.duplicate_of_id,s.source_row,
        banking_matched(s.organization_id,s.id,NULL,NULL)::text AS matched,(s.amount-banking_matched(s.organization_id,s.id,NULL,NULL))::text AS residual,i.file_name,
        (SELECT j.status FROM cash_transactions t JOIN accounting_journals j ON j.organization_id=t.organization_id AND j.id=t.journal_id WHERE t.organization_id=s.organization_id AND t.statement_line_id=s.id AND j.status NOT IN ('rejected','discarded') LIMIT 1) AS adjustment_status
      FROM bank_statement_lines s JOIN bank_statement_imports i ON i.organization_id=s.organization_id AND i.id=s.import_id
      WHERE s.organization_id=${org} AND s.banking_account_id=${id}::uuid AND ${filter} ORDER BY s.txn_date DESC,s.created_at DESC,s.source_row LIMIT 200`),
    account.ledger_id ? db.execute<LedgerLineRow>(sql`SELECT l.id,j.id AS journal_id,j.number,j.entry_date::text,coalesce(l.description,j.description) AS description,j.reference,(l.debit-l.credit)::text AS amount,
        banking_matched(l.organization_id,NULL,l.id,NULL)::text AS matched,((l.debit-l.credit)-banking_matched(l.organization_id,NULL,l.id,NULL))::text AS residual
      FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id AND j.status='posted'
      WHERE l.organization_id=${org} AND l.account_id=${account.ledger_id}::uuid AND l.currency=${account.currency} ${view === "all" ? sql`` : sql`AND (l.debit-l.credit)<>banking_matched(l.organization_id,NULL,l.id,NULL)`}
      ORDER BY j.entry_date DESC,j.number DESC LIMIT 200`) : Promise.resolve({ rows: [] as LedgerLineRow[] }),
    db.execute<Omit<MatchGroupRow, "items" | "locked"> & { items: MatchGroupRow["items"] }>(sql`SELECT g.id,g.kind,g.status,g.effective_date::text,g.partial,g.note,coalesce(s.display_name,s.clerk_user_id) AS created_by,g.created_at::text,
        coalesce((SELECT jsonb_agg(jsonb_build_object('statementLineId',i.statement_line_id,'journalLineId',i.journal_line_id,'amount',i.amount::text,
          'label',coalesce(sl.description,coalesce(j.number,'')||' '||coalesce(jl.description,j.description)),'date',coalesce(sl.txn_date,j.entry_date)) ORDER BY i.created_at)
          FROM bank_match_items i LEFT JOIN bank_statement_lines sl ON sl.organization_id=i.organization_id AND sl.id=i.statement_line_id
          LEFT JOIN accounting_journal_lines jl ON jl.organization_id=i.organization_id AND jl.id=i.journal_line_id LEFT JOIN accounting_journals j ON j.organization_id=jl.organization_id AND j.id=jl.journal_id
          WHERE i.organization_id=g.organization_id AND i.group_id=g.id),'[]'::jsonb) AS items
      FROM bank_match_groups g LEFT JOIN staff_memberships s ON s.organization_id=g.organization_id AND s.id=g.created_by_id
      WHERE g.organization_id=${org} AND g.banking_account_id=${id}::uuid AND g.status='active' ORDER BY g.effective_date DESC,g.created_at DESC LIMIT 60`),
    db.execute<{ id: string; file_name: string; created_at: string; row_count: number; imported_count: number; duplicate_count: number; review_count: number; first_date: string; last_date: string; derived_opening_balance: string | null; derived_closing_balance: string | null; imported_by: string }>(sql`
      SELECT i.id,i.file_name,i.created_at::text,i.row_count,i.imported_count,i.duplicate_count,i.review_count,i.first_date::text,i.last_date::text,i.derived_opening_balance::text,i.derived_closing_balance::text,coalesce(s.display_name,s.clerk_user_id) AS imported_by
      FROM bank_statement_imports i LEFT JOIN staff_memberships s ON s.organization_id=i.organization_id AND s.id=i.imported_by_id WHERE i.organization_id=${org} AND i.banking_account_id=${id}::uuid ORDER BY i.created_at DESC LIMIT 20`),
    db.execute<{ d: string | null }>(sql`SELECT banking_locked_until(${org},${id}::uuid)::text AS d`),
    db.execute<{ id: string; period_start: string; period_end: string; status: string }>(sql`SELECT id,period_start::text,period_end::text,status FROM bank_reconciliations WHERE organization_id=${org} AND banking_account_id=${id}::uuid ORDER BY period_start DESC LIMIT 24`),
    db.execute<{ category: string }>(sql`SELECT category FROM banking_category_accounts WHERE organization_id=${org} AND status='approved'`),
  ]);
  const lockedUntil = locked.rows[0]?.d ?? null;
  // Suggestions are computed here and never written: a person confirms each one.
  const open = ledger.rows.filter((l) => l.residual !== "0.00");
  const suggestions = Object.fromEntries(lines.rows.filter((s) => s.review_status === "active" && s.residual !== "0.00" && !s.adjustment_status).map((s) => {
    const found = suggestMatches({ id: s.id, accountId: id, currency: account.currency, date: s.txn_date, amount: toMinor(s.residual), reference: s.reference },
      open.map((l) => ({ id: l.id, accountId: id, currency: account.currency, date: l.entry_date, amount: toMinor(l.residual), reference: l.reference, posted: true }))).slice(0, 3);
    return [s.id, found.map((f) => ({ ...f, ledger: open.find((l) => l.id === f.ledgerId)! }))];
  }).filter(([, v]) => (v as unknown[]).length > 0));
  return {
    can, me, account, view, lines: lines.rows, ledger: ledger.rows, suggestions,
    groups: groups.rows.map((g) => ({ ...g, locked: !!lockedUntil && g.effective_date <= lockedUntil })),
    imports: imports.rows, lockedUntil, reconciliations: recs.rows, today: await today(), approvedCategories: cats.rows.map((c) => c.category),
  };
}

export async function readImportPage() {
  const { ctx, can } = await bankingContext();
  if (!can.importStatements) notFound();
  const accounts = (await accountRows(ctx.organizationId, sql`b.status='active' AND b.kind IN ('bank','mobile_money')`));
  return { can, accounts };
}

export type ReconciliationRow = {
  id: string; banking_account_id: string; account_label: string; currency: string; period_start: string; period_end: string; status: string; version: number;
  opening_statement_balance: string; closing_statement_balance: string; prepared_by: string; prepared_by_id: string; submitted_by: string | null; submitted_by_id: string | null;
  finalized_by: string | null; finalized_at: string | null; review_note: string | null; reopened_by: string | null; reopened_at: string | null; reopen_reason: string | null; reopen_count: number;
};
const recSelect = (org: string) => sql`SELECT r.id,r.banking_account_id,b.label AS account_label,r.currency,r.period_start::text,r.period_end::text,r.status,r.version,
    r.opening_statement_balance::text,r.closing_statement_balance::text,coalesce(p.display_name,p.clerk_user_id) AS prepared_by,r.prepared_by_id,
    coalesce(s.display_name,s.clerk_user_id) AS submitted_by,r.submitted_by_id,coalesce(f.display_name,f.clerk_user_id) AS finalized_by,r.finalized_at::text,r.review_note,
    coalesce(o.display_name,o.clerk_user_id) AS reopened_by,r.reopened_at::text,r.reopen_reason,r.reopen_count
  FROM bank_reconciliations r JOIN banking_accounts b ON b.organization_id=r.organization_id AND b.id=r.banking_account_id
  LEFT JOIN staff_memberships p ON p.organization_id=r.organization_id AND p.id=r.prepared_by_id LEFT JOIN staff_memberships s ON s.organization_id=r.organization_id AND s.id=r.submitted_by_id
  LEFT JOIN staff_memberships f ON f.organization_id=r.organization_id AND f.id=r.finalized_by_id LEFT JOIN staff_memberships o ON o.organization_id=r.organization_id AND o.id=r.reopened_by_id
  WHERE r.organization_id=${org}`;

export type Figures = {
  currency: string; periodStart: string; periodEnd: string; firstPeriodStart: string; openingStatement: string; closingStatement: string; statementMovement: string; statementCheck: string;
  openingBook: string; closingBook: string; depositsInTransit: string; depositsInTransitCount: number; outstandingPayments: string; outstandingPaymentsCount: number;
  unmatchedStatementCount: number; unmatchedStatementNet: string; reviewPending: number; pendingJournals: number; adjustedStatement: string; difference: string; problems: string[]; balanced: boolean;
};

export async function readReconciliations(raw: SearchParams) {
  const { ctx, me, can } = await bankingContext();
  const org = ctx.organizationId;
  const account = isUuid(one(raw, "account")) ? one(raw, "account") : "";
  const [rows, accounts] = await Promise.all([
    db.execute<ReconciliationRow & { figures: Figures }>(sql`SELECT x.*,CASE WHEN x.status='finalized' THEN (SELECT figures FROM bank_reconciliation_snapshots s WHERE s.organization_id=${org} AND s.reconciliation_id=x.id ORDER BY sequence DESC LIMIT 1) ELSE bank_reconciliation_figures(${org},x.id) END AS figures
      FROM (${recSelect(org)} ${account ? sql`AND r.banking_account_id=${account}::uuid` : sql``} ORDER BY (r.status<>'finalized') DESC,r.period_end DESC LIMIT 100) x`),
    accountRows(org, sql`b.status='active' AND b.kind IN ('bank','mobile_money','clearing')`),
  ]);
  return { can, me, rows: rows.rows, accounts, account, today: await today() };
}

export async function readReconciliation(id: string) {
  if (!isUuid(id)) notFound();
  const { ctx, me, can } = await bankingContext();
  const org = ctx.organizationId;
  const r = (await db.execute<ReconciliationRow>(sql`${recSelect(org)} AND r.id=${id}::uuid`)).rows[0];
  if (!r) notFound();
  const [figures, snapshots, events, unmatched, outstanding, prev, later] = await Promise.all([
    db.execute<{ f: Figures }>(sql`SELECT bank_reconciliation_figures(${org},${id}::uuid) AS f`),
    db.execute<{ sequence: number; figures: Figures; finalized_at: string; finalized_by: string }>(sql`SELECT s.sequence,s.figures,s.finalized_at::text,coalesce(m.display_name,m.clerk_user_id) AS finalized_by FROM bank_reconciliation_snapshots s LEFT JOIN staff_memberships m ON m.organization_id=s.organization_id AND m.id=s.finalized_by_id WHERE s.organization_id=${org} AND s.reconciliation_id=${id}::uuid ORDER BY s.sequence DESC`),
    db.execute<{ id: string; action: string; note: string | null; actor: string; created_at: string }>(sql`SELECT e.id,e.action,e.note,coalesce(s.display_name,e.actor_clerk_user_id) AS actor,e.created_at::text FROM banking_events e LEFT JOIN staff_memberships s ON s.organization_id=e.organization_id AND s.id=e.actor_staff_id WHERE e.organization_id=${org} AND e.entity_type='reconciliation' AND e.entity_id=${id} ORDER BY e.created_at DESC LIMIT 50`),
    db.execute<{ id: string; txn_date: string; description: string; reference: string | null; residual: string; review_status: string }>(sql`SELECT s.id,s.txn_date::text,s.description,s.reference,(s.amount-banking_matched(s.organization_id,s.id,NULL,${r.period_end}::date))::text AS residual,s.review_status
      FROM bank_statement_lines s WHERE s.organization_id=${org} AND s.banking_account_id=${r.banking_account_id}::uuid AND s.review_status IN ('active','needs_review')
        AND s.txn_date BETWEEN (SELECT min(period_start) FROM bank_reconciliations WHERE organization_id=${org} AND banking_account_id=${r.banking_account_id}::uuid) AND ${r.period_end}::date
        AND (s.review_status='needs_review' OR s.amount<>banking_matched(s.organization_id,s.id,NULL,${r.period_end}::date)) ORDER BY s.txn_date LIMIT 200`),
    db.execute<{ id: string; number: string; entry_date: string; description: string; residual: string }>(sql`SELECT l.id,j.number,j.entry_date::text,coalesce(l.description,j.description) AS description,((l.debit-l.credit)-banking_matched(l.organization_id,NULL,l.id,${r.period_end}::date))::text AS residual
      FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id AND j.status='posted'
      WHERE l.organization_id=${org} AND l.account_id=banking_ledger(${org},${r.banking_account_id}::uuid) AND l.currency=${r.currency} AND j.entry_date<=${r.period_end}::date
        AND (l.debit-l.credit)<>banking_matched(l.organization_id,NULL,l.id,${r.period_end}::date) ORDER BY j.entry_date LIMIT 200`),
    db.execute<{ id: string }>(sql`SELECT id FROM bank_reconciliations WHERE organization_id=${org} AND banking_account_id=${r.banking_account_id}::uuid AND period_end<${r.period_start}::date ORDER BY period_end DESC LIMIT 1`),
    db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM bank_reconciliations WHERE organization_id=${org} AND banking_account_id=${r.banking_account_id}::uuid AND period_start>${r.period_start}::date`),
  ]);
  return {
    can, me, r, figures: figures.rows[0].f, snapshots: snapshots.rows, events: events.rows, unmatched: unmatched.rows, outstanding: outstanding.rows,
    previousId: prev.rows[0]?.id ?? null, hasLater: later.rows[0].n > 0, today: await today(),
  };
}

export type CashRow = {
  id: string; kind: string; txn_date: string; amount: string; currency: string; description: string; reference: string | null; account: string | null; to_account: string | null;
  counter: string | null; staff: string | null; category: string | null; status: string; number: string | null; prepared_by: string; prepared_by_id: string; journal_id: string; evidence: boolean; outstanding: string | null;
};

export async function readCashPage(raw: SearchParams) {
  const { ctx, me, can } = await bankingContext();
  const org = ctx.organizationId;
  const status = ["submitted", "posted", "rejected", "discarded"].includes(one(raw, "status")) ? one(raw, "status") : "";
  const kind = ["receipt", "payment", "transfer", "advance", "accountability", "count_adjustment", "bank_adjustment"].includes(one(raw, "kind")) ? one(raw, "kind") : "";
  const where = [sql`t.organization_id=${org}`];
  if (status) where.push(sql`j.status=${status}`);
  if (kind) where.push(sql`t.kind=${kind}`);
  const [rows, accounts, counters, expenses, staff, advances, counts, cats, td] = await Promise.all([
    db.execute<CashRow>(sql`SELECT t.id,t.kind,t.txn_date::text,t.amount::text,t.currency,t.description,t.reference,b.label AS account,c.label AS to_account,a.code||' '||a.name AS counter,
        coalesce(s.display_name,s.clerk_user_id) AS staff,t.category,j.status,j.number,coalesce(p.display_name,p.clerk_user_id) AS prepared_by,t.prepared_by_id,t.journal_id,t.evidence_id IS NOT NULL AS evidence,
        CASE WHEN t.kind='advance' AND j.status='posted' THEN cash_advance_outstanding(t.organization_id,t.id)::text END AS outstanding
      FROM cash_transactions t JOIN accounting_journals j ON j.organization_id=t.organization_id AND j.id=t.journal_id
      LEFT JOIN banking_accounts b ON b.organization_id=t.organization_id AND b.id=t.banking_account_id LEFT JOIN banking_accounts c ON c.organization_id=t.organization_id AND c.id=t.counter_banking_account_id
      LEFT JOIN accounting_accounts a ON a.organization_id=t.organization_id AND a.id=t.counter_account_id LEFT JOIN staff_memberships s ON s.organization_id=t.organization_id AND s.id=t.staff_id
      LEFT JOIN staff_memberships p ON p.organization_id=t.organization_id AND p.id=t.prepared_by_id
      WHERE ${sql.join(where, sql` AND `)} ORDER BY (j.status='submitted') DESC,t.txn_date DESC,t.created_at DESC LIMIT 200`),
    accountRows(org, sql`b.status='active'`),
    db.execute<{ id: string; code: string; name: string; account_type: string; currency: string | null }>(sql`SELECT a.id,a.code,a.name,a.account_type,a.currency FROM accounting_accounts a WHERE a.organization_id=${org} AND a.status='active' AND a.is_postable AND a.manual_posting_allowed
      AND NOT EXISTS(SELECT 1 FROM bank_account_mappings m WHERE m.organization_id=a.organization_id AND m.ledger_account_id=a.id AND m.status='approved')
      AND NOT EXISTS(SELECT 1 FROM banking_category_accounts c WHERE c.organization_id=a.organization_id AND c.ledger_account_id=a.id AND c.status='approved' AND c.category='staff_advances') ORDER BY a.code`),
    db.execute<{ id: string; code: string; name: string }>(sql`SELECT id,code,name FROM accounting_accounts WHERE organization_id=${org} AND status='active' AND is_postable AND manual_posting_allowed AND account_type IN ('cost_of_sales','operating_expense','other_expense') ORDER BY code`),
    db.execute<{ id: string; name: string }>(sql`SELECT id,coalesce(display_name,clerk_user_id) AS name FROM staff_memberships WHERE organization_id=${org} AND status='active' ORDER BY 2 LIMIT 200`),
    db.execute<{ id: string; staff: string; staff_id: string; txn_date: string; amount: string; currency: string; outstanding: string; reference: string | null; description: string }>(sql`SELECT t.id,coalesce(s.display_name,s.clerk_user_id) AS staff,t.staff_id,t.txn_date::text,t.amount::text,t.currency,cash_advance_outstanding(t.organization_id,t.id)::text AS outstanding,t.reference,t.description
      FROM cash_transactions t JOIN accounting_journals j ON j.organization_id=t.organization_id AND j.id=t.journal_id AND j.status='posted' LEFT JOIN staff_memberships s ON s.organization_id=t.organization_id AND s.id=t.staff_id
      WHERE t.organization_id=${org} AND t.kind='advance' AND cash_advance_outstanding(t.organization_id,t.id)>0 ORDER BY t.txn_date`),
    db.execute<{ id: string; account: string; currency: string; count_date: string; counted_amount: string; book_balance: string; difference: string; pending_journals: number; counted_by: string; witness: string | null; adjustment_status: string | null; note: string | null }>(sql`
      SELECT c.id,b.label AS account,c.currency,c.count_date::text,c.counted_amount::text,c.book_balance::text,c.difference::text,c.pending_journals,coalesce(s.display_name,s.clerk_user_id) AS counted_by,coalesce(w.display_name,w.clerk_user_id) AS witness,c.note,
        (SELECT j.status FROM cash_transactions t JOIN accounting_journals j ON j.organization_id=t.organization_id AND j.id=t.journal_id WHERE t.organization_id=c.organization_id AND t.cash_count_id=c.id AND j.status NOT IN ('rejected','discarded') LIMIT 1) AS adjustment_status
      FROM cash_counts c JOIN banking_accounts b ON b.organization_id=c.organization_id AND b.id=c.banking_account_id LEFT JOIN staff_memberships s ON s.organization_id=c.organization_id AND s.id=c.counted_by_id LEFT JOIN staff_memberships w ON w.organization_id=c.organization_id AND w.id=c.witness_id
      WHERE c.organization_id=${org} ORDER BY c.count_date DESC,c.created_at DESC LIMIT 30`),
    db.execute<{ category: string }>(sql`SELECT category FROM banking_category_accounts WHERE organization_id=${org} AND status='approved'`),
    today(),
  ]);
  return {
    can, me, rows: rows.rows, filters: { status, kind }, accounts: accounts.filter((a) => a.ledger_id), allAccounts: accounts,
    counters: counters.rows, expenses: expenses.rows, staff: staff.rows, advances: advances.rows, counts: counts.rows,
    approvedCategories: cats.rows.map((c) => c.category), today: td,
  };
}

export async function readBankingReports(raw: SearchParams) {
  const { ctx, can } = await bankingContext();
  const org = ctx.organizationId;
  const td = await today();
  const to = isDate(one(raw, "to")) && one(raw, "to") <= td ? one(raw, "to") : td;
  const from = isDate(one(raw, "from")) && one(raw, "from") <= to ? one(raw, "from") : `${to.slice(0, 4)}-01-01`;
  const [accounts, movement, advances, counts, transfers, recognized, progress] = await Promise.all([
    db.execute<{ id: string; label: string; kind: string; currency: string; book: string; statement: string | null; statement_date: string | null; reconciled_to: string | null; reconciled_balance: string | null; unmatched_count: number; unmatched_net: string; mapped: boolean }>(sql`
      SELECT b.id,b.label,b.kind,b.currency,banking_book_balance(b.organization_id,b.id,${to}::date)::text AS book,
        (SELECT s.running_balance::text FROM bank_statement_lines s WHERE s.organization_id=b.organization_id AND s.banking_account_id=b.id AND s.review_status='active' AND s.running_balance IS NOT NULL AND s.txn_date<=${to}::date ORDER BY s.txn_date DESC,s.created_at DESC,s.source_row DESC LIMIT 1) AS statement,
        (SELECT max(s.txn_date)::text FROM bank_statement_lines s WHERE s.organization_id=b.organization_id AND s.banking_account_id=b.id AND s.review_status='active' AND s.running_balance IS NOT NULL AND s.txn_date<=${to}::date) AS statement_date,
        (SELECT max(r.period_end)::text FROM bank_reconciliations r WHERE r.organization_id=b.organization_id AND r.banking_account_id=b.id AND r.status='finalized') AS reconciled_to,
        (SELECT r.closing_statement_balance::text FROM bank_reconciliations r WHERE r.organization_id=b.organization_id AND r.banking_account_id=b.id AND r.status='finalized' ORDER BY r.period_end DESC LIMIT 1) AS reconciled_balance,
        (SELECT count(*)::int FROM bank_statement_lines s WHERE s.organization_id=b.organization_id AND s.banking_account_id=b.id AND s.review_status='active' AND s.txn_date<=${to}::date AND s.amount<>banking_matched(s.organization_id,s.id,NULL,NULL)) AS unmatched_count,
        (SELECT coalesce(sum(s.amount-banking_matched(s.organization_id,s.id,NULL,NULL)),0)::text FROM bank_statement_lines s WHERE s.organization_id=b.organization_id AND s.banking_account_id=b.id AND s.review_status='active' AND s.txn_date<=${to}::date) AS unmatched_net,
        banking_ledger(b.organization_id,b.id) IS NOT NULL AS mapped
      FROM banking_accounts b WHERE b.organization_id=${org} ORDER BY b.currency,b.kind,b.label`),
    db.execute<{ month: string; label: string; currency: string; inflow: string; outflow: string }>(sql`
      SELECT to_char(j.entry_date,'YYYY-MM') AS month,b.label,b.currency,coalesce(sum(l.debit),0)::text AS inflow,coalesce(sum(l.credit),0)::text AS outflow
      FROM banking_accounts b JOIN accounting_journal_lines l ON l.organization_id=b.organization_id AND l.account_id=banking_ledger(b.organization_id,b.id) AND l.currency=b.currency
      JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id AND j.status='posted'
      WHERE b.organization_id=${org} AND j.entry_date BETWEEN ${from}::date AND ${to}::date GROUP BY 1,2,3 ORDER BY 3,1,2`),
    db.execute<{ staff: string; currency: string; count: number; outstanding: string; oldest: string }>(sql`
      SELECT coalesce(s.display_name,s.clerk_user_id) AS staff,t.currency,count(*)::int AS count,sum(cash_advance_outstanding(t.organization_id,t.id))::text AS outstanding,min(t.txn_date)::text AS oldest
      FROM cash_transactions t JOIN accounting_journals j ON j.organization_id=t.organization_id AND j.id=t.journal_id AND j.status='posted' LEFT JOIN staff_memberships s ON s.organization_id=t.organization_id AND s.id=t.staff_id
      WHERE t.organization_id=${org} AND t.kind='advance' AND cash_advance_outstanding(t.organization_id,t.id)>0 GROUP BY 1,2 ORDER BY 2,1`),
    db.execute<{ account: string; currency: string; count_date: string; counted_amount: string; book_balance: string; difference: string }>(sql`
      SELECT b.label AS account,c.currency,c.count_date::text,c.counted_amount::text,c.book_balance::text,c.difference::text FROM cash_counts c JOIN banking_accounts b ON b.organization_id=c.organization_id AND b.id=c.banking_account_id
      WHERE c.organization_id=${org} AND c.count_date BETWEEN ${from}::date AND ${to}::date ORDER BY c.count_date DESC`),
    db.execute<{ txn_date: string; from_label: string; to_label: string; currency: string; amount: string; reference: string | null; status: string }>(sql`
      SELECT t.txn_date::text,b.label AS from_label,c.label AS to_label,t.currency,t.amount::text,t.reference,j.status FROM cash_transactions t JOIN accounting_journals j ON j.organization_id=t.organization_id AND j.id=t.journal_id
      JOIN banking_accounts b ON b.organization_id=t.organization_id AND b.id=t.banking_account_id JOIN banking_accounts c ON c.organization_id=t.organization_id AND c.id=t.counter_banking_account_id
      WHERE t.organization_id=${org} AND t.kind='transfer' AND t.txn_date BETWEEN ${from}::date AND ${to}::date ORDER BY t.txn_date DESC LIMIT 200`),
    db.execute<{ category: string; currency: string; count: number; total: string }>(sql`
      SELECT t.category,t.currency,count(*)::int AS count,sum(t.amount)::text AS total FROM cash_transactions t JOIN accounting_journals j ON j.organization_id=t.organization_id AND j.id=t.journal_id AND j.status='posted'
      WHERE t.organization_id=${org} AND t.kind IN ('bank_adjustment','count_adjustment') AND t.txn_date BETWEEN ${from}::date AND ${to}::date GROUP BY 1,2 ORDER BY 2,1`),
    db.execute<{ status: string; n: number }>(sql`SELECT status,count(*)::int AS n FROM bank_reconciliations WHERE organization_id=${org} GROUP BY status`),
  ]);
  return {
    can, from, to, today: td, accounts: accounts.rows, movement: movement.rows, advances: advances.rows, counts: counts.rows, transfers: transfers.rows,
    recognized: recognized.rows, progress: Object.fromEntries(progress.rows.map((p) => [p.status, p.n])) as Record<string, number>,
  };
}
