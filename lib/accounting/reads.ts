import "server-only";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { financeContext, type FinanceContext } from "@/lib/finance/context";
import type { Permission } from "@/lib/sales/permissions";
import { accountTypes } from "./engine";

/*
 * Accounting workspace reads (Phase 2A). Every read authorizes first and takes the organization
 * from the verified Clerk context. Ledger reads are deliberately not cached: posted balances must
 * always reflect the latest committed journals. Balances come only from POSTED journals.
 */

export type SearchParams = Record<string, string | string[] | undefined>;
const one = (raw: SearchParams, k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
const isDate = (v: string) => z.iso.date().safeParse(v).success;
const isUuid = (v: string) => z.uuid().safeParse(v).success;

export async function accountingContext(anyOf: Permission[] = ["accounting_read"]) {
  return financeContext(anyOf);
}

export function accountingCan(ctx: FinanceContext) {
  return {
    read: ctx.can("accounting_read"),
    manage: ctx.can("accounting_manage"),
    prepare: ctx.can("accounting_journal_prepare"),
    approve: ctx.can("accounting_journal_approve"),
    post: ctx.can("accounting_journal_post"),
    reverse: ctx.can("accounting_journal_reverse"),
    close: ctx.can("accounting_period_close"),
    reopen: ctx.can("accounting_period_reopen"),
    approvePolicy: ctx.can("accounting_policy_approve"),
  };
}
export type AccountingCan = ReturnType<typeof accountingCan>;

async function today() {
  return (await db.execute<{ d: string }>(sql`SELECT finance_kampala_today()::text AS d`)).rows[0].d;
}
async function myStaffId(org: string, actor: string) {
  return (await db.execute<{ id: string }>(sql`SELECT id FROM staff_memberships WHERE organization_id=${org} AND clerk_user_id=${actor} AND status='active'`)).rows[0]?.id ?? null;
}

export type PolicyRow = {
  id: string; version: number; functional_currency: string; fiscal_year_start_month: number; manual_posting_enabled: boolean;
  status: string; note: string; proposed_by: string; proposed_by_id: string; proposed_at: string; decided_by: string | null; decided_at: string | null; decision_note: string | null;
};

/** Effective policy, open proposal and the readiness checklist that explains why posting is (not) possible. */
export async function readPostingReadiness(org: string, date?: string) {
  const d = date ?? (await today());
  const [policies, counts, period] = await Promise.all([
    db.execute<PolicyRow>(sql`SELECT p.id,p.version,p.functional_currency,p.fiscal_year_start_month,p.manual_posting_enabled,p.status,p.note,
        coalesce(s.display_name,s.clerk_user_id) AS proposed_by,p.proposed_by_id,p.proposed_at::text,coalesce(x.display_name,x.clerk_user_id) AS decided_by,p.decided_at::text,p.decision_note
      FROM accounting_policy_versions p
      LEFT JOIN staff_memberships s ON s.organization_id=p.organization_id AND s.id=p.proposed_by_id
      LEFT JOIN staff_memberships x ON x.organization_id=p.organization_id AND x.id=p.decided_by_id
      WHERE p.organization_id=${org} ORDER BY p.version DESC LIMIT 50`),
    db.execute<{ active: number; proposed: number; inactive: number }>(sql`SELECT count(*) FILTER (WHERE status='active')::int AS active,count(*) FILTER (WHERE status='proposed')::int AS proposed,count(*) FILTER (WHERE status='inactive')::int AS inactive FROM accounting_accounts WHERE organization_id=${org}`),
    db.execute<{ id: string; name: string; status: string }>(sql`SELECT id,name,status FROM accounting_periods WHERE organization_id=${org} AND ${d}::date BETWEEN start_date AND end_date`),
  ]);
  const policy = policies.rows.find((p) => p.status === "approved") ?? null;
  const proposal = policies.rows.find((p) => p.status === "proposed") ?? null;
  const c = counts.rows[0];
  const currentPeriod = period.rows[0] ?? null;
  const checklist = [
    { key: "policy", done: !!policy, label: "Accounting policy approved", help: "Functional currency and financial-year start, proposed by one person and approved by another." },
    { key: "posting", done: !!policy?.manual_posting_enabled, label: "Manual posting enabled by the policy", help: "The approved policy must explicitly allow manual posting." },
    { key: "chart", done: c.active > 0, label: "Chart of accounts approved", help: `${c.active} active, ${c.proposed} awaiting approval.` },
    { key: "period", done: currentPeriod?.status === "open", label: "Open period for today", help: currentPeriod ? `${currentPeriod.name} is ${currentPeriod.status}.` : "No period covers today's date." },
  ];
  return { policy, proposal, history: policies.rows, accounts: c, currentPeriod, checklist, postingReady: checklist.every((x) => x.done), today: d };
}

export async function readOverview() {
  const ctx = await accountingContext();
  const org = ctx.organizationId;
  const readiness = await readPostingReadiness(org);
  const [status, recent, tb] = await Promise.all([
    db.execute<{ status: string; count: number }>(sql`SELECT status,count(*)::int AS count FROM accounting_journals WHERE organization_id=${org} GROUP BY status`),
    db.execute<JournalListRow>(sql`${journalListSelect(org)} ORDER BY j.updated_at DESC, j.id LIMIT 8`),
    readTrialBalanceRows(org, readiness.today, null),
  ]);
  const counts = Object.fromEntries(status.rows.map((r) => [r.status, r.count]));
  return { can: accountingCan(ctx), readiness, counts, recent: recent.rows, trialBalance: summarizeTrialBalance(tb) };
}

// ---------------------------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------------------------

export type AccountRow = {
  id: string; code: string; name: string; description: string | null; account_type: string; is_contra: boolean; normal_balance: string; reporting_class: string | null;
  parent_id: string | null; is_postable: boolean; manual_posting_allowed: boolean; currency: string | null; status: string; version: number; depth: number;
  created_by_id: string; debit: string; credit: string; functional_currency: string | null;
};

export async function readAccounts(raw: SearchParams) {
  const ctx = await accountingContext();
  const org = ctx.organizationId;
  const filters = {
    search: one(raw, "search").slice(0, 100),
    type: (accountTypes as readonly string[]).includes(one(raw, "type")) ? one(raw, "type") : "",
    status: ["proposed", "active", "inactive"].includes(one(raw, "status")) ? one(raw, "status") : "",
  };
  const rows = await db.execute<AccountRow>(sql`WITH RECURSIVE tree AS (
      SELECT a.*, 0 AS depth, a.code AS path FROM accounting_accounts a WHERE a.organization_id=${org} AND a.parent_id IS NULL
      UNION ALL
      SELECT c.*, t.depth + 1, t.path || '/' || c.code FROM accounting_accounts c JOIN tree t ON c.organization_id=t.organization_id AND c.parent_id=t.id
    ), bal AS (
      SELECT l.account_id,j.functional_currency,sum(l.functional_debit) AS debit,sum(l.functional_credit) AS credit
      FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id
      WHERE l.organization_id=${org} AND j.status='posted' GROUP BY l.account_id,j.functional_currency
    )
    SELECT t.id,t.code,t.name,t.description,t.account_type,t.is_contra,t.normal_balance,t.reporting_class,t.parent_id,t.is_postable,t.manual_posting_allowed,t.currency,t.status,t.version,t.depth,t.created_by_id,
      coalesce(b.debit,0)::text AS debit,coalesce(b.credit,0)::text AS credit,b.functional_currency
    FROM tree t LEFT JOIN bal b ON b.account_id=t.id
    WHERE true
      ${filters.search ? sql`AND (t.code ILIKE ${"%" + filters.search + "%"} OR t.name ILIKE ${"%" + filters.search + "%"})` : sql``}
      ${filters.type ? sql`AND t.account_type=${filters.type}` : sql``}
      ${filters.status ? sql`AND t.status=${filters.status}` : sql``}
    ORDER BY t.path LIMIT 1000`);
  const parents = await db.execute<{ id: string; code: string; name: string; account_type: string }>(sql`SELECT id,code,name,account_type FROM accounting_accounts WHERE organization_id=${org} AND NOT is_postable AND status<>'inactive' ORDER BY code`);
  const me = await myStaffId(org, ctx.actor);
  const totals = await db.execute<{ proposed: number; total: number }>(sql`SELECT count(*) FILTER (WHERE status='proposed')::int AS proposed,count(*)::int AS total FROM accounting_accounts WHERE organization_id=${org}`);
  return { can: accountingCan(ctx), filters, rows: rows.rows, parents: parents.rows, me, totals: totals.rows[0] };
}

export async function readAccount(id: string, raw: SearchParams) {
  if (!isUuid(id)) notFound();
  const ctx = await accountingContext();
  const org = ctx.organizationId;
  const account = (await db.execute<AccountRow & { parent_code: string | null; parent_name: string | null; created_by: string; activated_by: string | null; activated_at: string | null; deactivation_reason: string | null }>(sql`
    SELECT a.*,0 AS depth,'0' AS debit,'0' AS credit,NULL AS functional_currency,p.code AS parent_code,p.name AS parent_name,
      coalesce(s.display_name,s.clerk_user_id) AS created_by,coalesce(x.display_name,x.clerk_user_id) AS activated_by,a.activated_at::text
    FROM accounting_accounts a
    LEFT JOIN accounting_accounts p ON p.organization_id=a.organization_id AND p.id=a.parent_id
    LEFT JOIN staff_memberships s ON s.organization_id=a.organization_id AND s.id=a.created_by_id
    LEFT JOIN staff_memberships x ON x.organization_id=a.organization_id AND x.id=a.activated_by_id
    WHERE a.organization_id=${org} AND a.id=${id}::uuid`)).rows[0];
  if (!account) notFound();
  const t = await today();
  let from = isDate(one(raw, "from")) ? one(raw, "from") : `${t.slice(0, 4)}-01-01`;
  let to = isDate(one(raw, "to")) ? one(raw, "to") : t;
  if (from > to) [from, to] = [to, from];
  const page = Math.max(1, Math.min(1000, Number(one(raw, "page")) || 1));
  const size = 50;
  const [opening, activity, count, events] = await Promise.all([
    db.execute<{ currency: string; debit: string; credit: string }>(sql`SELECT j.functional_currency AS currency,coalesce(sum(l.functional_debit),0)::text AS debit,coalesce(sum(l.functional_credit),0)::text AS credit
      FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id
      WHERE l.organization_id=${org} AND l.account_id=${id}::uuid AND j.status='posted' AND j.entry_date<${from}::date GROUP BY j.functional_currency`),
    // Running balance in the account's normal direction, from posted lines only.
    db.execute<{ journal_id: string; number: string; entry_date: string; description: string; line_description: string | null; journal_type: string; currency: string; debit: string; credit: string; functional_debit: string; functional_credit: string; division: string | null; project: string | null; running: string }>(sql`
      SELECT * FROM (
        SELECT j.id AS journal_id,j.number,j.entry_date::text,j.description,l.description AS line_description,j.journal_type,l.currency,l.debit::text,l.credit::text,
          l.functional_debit::text,l.functional_credit::text,l.division,p.code AS project,
          (sum(CASE WHEN ${account.normal_balance}='debit' THEN l.functional_debit-l.functional_credit ELSE l.functional_credit-l.functional_debit END)
            OVER (ORDER BY j.entry_date,j.number,l.line_number))::text AS running,
          row_number() OVER (ORDER BY j.entry_date,j.number,l.line_number) AS rn
        FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id
        LEFT JOIN projects p ON p.organization_id=l.organization_id AND p.id=l.project_id
        WHERE l.organization_id=${org} AND l.account_id=${id}::uuid AND j.status='posted' AND j.entry_date BETWEEN ${from}::date AND ${to}::date
      ) x WHERE rn > ${(page - 1) * size} ORDER BY rn LIMIT ${size}`),
    db.execute<{ n: number; debit: string; credit: string }>(sql`SELECT count(*)::int AS n,coalesce(sum(l.functional_debit),0)::text AS debit,coalesce(sum(l.functional_credit),0)::text AS credit FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id
      WHERE l.organization_id=${org} AND l.account_id=${id}::uuid AND j.status='posted' AND j.entry_date BETWEEN ${from}::date AND ${to}::date`),
    readEvents(org, "account", id),
  ]);
  const [me, parents] = await Promise.all([
    myStaffId(org, ctx.actor),
    db.execute<{ id: string; code: string; name: string; account_type: string }>(sql`SELECT id,code,name,account_type FROM accounting_accounts WHERE organization_id=${org} AND NOT is_postable AND status<>'inactive' AND id<>${id}::uuid ORDER BY code`),
  ]);
  return { can: accountingCan(ctx), account, from, to, page, size, opening: opening.rows, activity: activity.rows, totals: count.rows[0], events, me, parents: parents.rows };
}

// ---------------------------------------------------------------------------------------------
// Journals
// ---------------------------------------------------------------------------------------------

export type JournalListRow = {
  id: string; number: string | null; journal_type: string; status: string; entry_date: string; description: string; reference: string | null;
  total: string; currencies: string[] | null; prepared_by: string; updated_at: string; reversed_by: string | null;
};

function journalListSelect(org: string) {
  return sql`SELECT j.id,j.number,j.journal_type,j.status,j.entry_date::text,j.description,j.reference,
      coalesce(j.total_debit,(SELECT sum(functional_debit) FROM accounting_journal_lines l WHERE l.organization_id=j.organization_id AND l.journal_id=j.id),0)::text AS total,
      (SELECT array_agg(DISTINCT currency) FROM accounting_journal_lines l WHERE l.organization_id=j.organization_id AND l.journal_id=j.id) AS currencies,
      coalesce(s.display_name,s.clerk_user_id) AS prepared_by,j.updated_at::text,
      (SELECT r.number FROM accounting_journals r WHERE r.organization_id=j.organization_id AND r.reverses_journal_id=j.id) AS reversed_by
    FROM accounting_journals j LEFT JOIN staff_memberships s ON s.organization_id=j.organization_id AND s.id=j.prepared_by_id
    WHERE j.organization_id=${org}`;
}

export const journalStatuses = ["draft", "submitted", "approved", "posted", "rejected", "discarded"] as const;
export const journalViews = ["all", "mine", "review", "ready"] as const;

export async function readJournals(raw: SearchParams) {
  const ctx = await accountingContext();
  const org = ctx.organizationId;
  const me = await myStaffId(org, ctx.actor);
  const filters = {
    view: (journalViews as readonly string[]).includes(one(raw, "view")) ? one(raw, "view") : "all",
    search: one(raw, "search").slice(0, 100),
    status: (journalStatuses as readonly string[]).includes(one(raw, "status")) ? one(raw, "status") : "",
    type: ["manual", "reversal"].includes(one(raw, "type")) ? one(raw, "type") : "",
    from: isDate(one(raw, "from")) ? one(raw, "from") : "",
    to: isDate(one(raw, "to")) ? one(raw, "to") : "",
  };
  const page = Math.max(1, Math.min(1000, Number(one(raw, "page")) || 1));
  const size = 25;
  const where = sql`
    ${filters.view === "mine" ? sql`AND j.prepared_by_id=${me}::uuid` : sql``}
    ${filters.view === "review" ? sql`AND j.status='submitted' AND j.prepared_by_id IS DISTINCT FROM ${me}::uuid` : sql``}
    ${filters.view === "ready" ? sql`AND j.status='approved'` : sql``}
    ${filters.search ? sql`AND (j.number ILIKE ${"%" + filters.search + "%"} OR j.description ILIKE ${"%" + filters.search + "%"} OR j.reference ILIKE ${"%" + filters.search + "%"})` : sql``}
    ${filters.status ? sql`AND j.status=${filters.status}` : sql``}
    ${filters.type ? sql`AND j.journal_type=${filters.type}` : sql``}
    ${filters.from ? sql`AND j.entry_date>=${filters.from}::date` : sql``}
    ${filters.to ? sql`AND j.entry_date<=${filters.to}::date` : sql``}`;
  const [rows, total, counts] = await Promise.all([
    db.execute<JournalListRow>(sql`${journalListSelect(org)} ${where} ORDER BY j.entry_date DESC, j.number DESC NULLS FIRST, j.created_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`),
    db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM accounting_journals j WHERE j.organization_id=${org} ${where}`),
    db.execute<{ review: number; ready: number }>(sql`SELECT count(*) FILTER (WHERE status='submitted' AND prepared_by_id IS DISTINCT FROM ${me}::uuid)::int AS review,count(*) FILTER (WHERE status='approved')::int AS ready FROM accounting_journals WHERE organization_id=${org}`),
  ]);
  return { can: accountingCan(ctx), filters, rows: rows.rows, total: total.rows[0].n, page, size, counts: counts.rows[0] };
}

export type JournalLineRow = {
  id: string; line_number: number; account_id: string; code: string; name: string; account_status: string; description: string | null; currency: string;
  debit: string; credit: string; exchange_rate: string; exchange_rate_id: string | null; rate_date: string | null; rate_source: string | null;
  functional_debit: string; functional_credit: string; division: string | null; project_id: string | null; project: string | null;
};

export async function readJournal(id: string) {
  if (!isUuid(id)) notFound();
  const ctx = await accountingContext();
  const org = ctx.organizationId;
  const journal = (await db.execute<{
    id: string; number: string | null; journal_type: string; status: string; entry_date: string; description: string; reference: string | null; version: number;
    period: string | null; functional_currency: string | null; total_debit: string | null; total_credit: string | null; reverses_journal_id: string | null; reverses_number: string | null;
    reversal_reason: string | null; prepared_by_id: string; prepared_by: string; prepared_at: string; submitted_at: string | null; approved_by: string | null; approved_at: string | null;
    reviewed_by: string | null; review_note: string | null; posted_by: string | null; posted_at: string | null; reversal_id: string | null; reversal_number: string | null;
  }>(sql`SELECT j.id,j.number,j.journal_type,j.status,j.entry_date::text,j.description,j.reference,j.version,p.name AS period,j.functional_currency,j.total_debit::text,j.total_credit::text,
      j.reverses_journal_id,o.number AS reverses_number,j.reversal_reason,j.prepared_by_id,coalesce(sp.display_name,sp.clerk_user_id) AS prepared_by,j.prepared_at::text,j.submitted_at::text,
      coalesce(sa.display_name,sa.clerk_user_id) AS approved_by,j.approved_at::text,coalesce(sr.display_name,sr.clerk_user_id) AS reviewed_by,j.review_note,
      coalesce(so.display_name,so.clerk_user_id) AS posted_by,j.posted_at::text,r.id AS reversal_id,r.number AS reversal_number
    FROM accounting_journals j
    LEFT JOIN accounting_periods p ON p.organization_id=j.organization_id AND p.id=j.period_id
    LEFT JOIN accounting_journals o ON o.organization_id=j.organization_id AND o.id=j.reverses_journal_id
    LEFT JOIN accounting_journals r ON r.organization_id=j.organization_id AND r.reverses_journal_id=j.id
    LEFT JOIN staff_memberships sp ON sp.organization_id=j.organization_id AND sp.id=j.prepared_by_id
    LEFT JOIN staff_memberships sa ON sa.organization_id=j.organization_id AND sa.id=j.approved_by_id
    LEFT JOIN staff_memberships sr ON sr.organization_id=j.organization_id AND sr.id=j.reviewed_by_id
    LEFT JOIN staff_memberships so ON so.organization_id=j.organization_id AND so.id=j.posted_by_id
    WHERE j.organization_id=${org} AND j.id=${id}::uuid`)).rows[0];
  if (!journal) notFound();
  const [lines, events, readiness, me] = await Promise.all([
    readJournalLines(org, id),
    readEvents(org, "journal", id),
    readPostingReadiness(org, journal.entry_date),
    myStaffId(org, ctx.actor),
  ]);
  const can = accountingCan(ctx);
  const mine = !!me && journal.prepared_by_id === me;
  const manual = journal.journal_type === "manual";
  const actions = {
    edit: manual && mine && can.prepare && journal.status === "draft",
    submit: manual && mine && can.prepare && journal.status === "draft",
    discard: manual && mine && can.prepare && journal.status === "draft",
    withdraw: manual && mine && can.prepare && journal.status === "submitted",
    review: manual && !mine && can.approve && journal.status === "submitted",
    returnApproved: manual && !mine && can.approve && journal.status === "approved",
    post: manual && can.post && journal.status === "approved",
    reverse: can.reverse && journal.status === "posted" && journal.journal_type !== "reversal" && !journal.reversal_id,
  };
  return { can, journal, lines, events, readiness, mine, actions, today: readiness.today };
}

async function readJournalLines(org: string, id: string) {
  return (await db.execute<JournalLineRow>(sql`SELECT l.id,l.line_number,l.account_id,a.code,a.name,a.status AS account_status,l.description,l.currency,l.debit::text,l.credit::text,
      l.exchange_rate::text,l.exchange_rate_id,l.rate_date::text,l.rate_source,l.functional_debit::text,l.functional_credit::text,l.division,l.project_id,p.code||' '||p.name AS project
    FROM accounting_journal_lines l JOIN accounting_accounts a ON a.organization_id=l.organization_id AND a.id=l.account_id
    LEFT JOIN projects p ON p.organization_id=l.organization_id AND p.id=l.project_id
    WHERE l.organization_id=${org} AND l.journal_id=${id}::uuid ORDER BY l.line_number`)).rows;
}

/** Options for the journal form: postable accounts, projects, approved rates and (when editing) the draft. */
export async function readJournalForm(id?: string) {
  const ctx = await accountingContext(["accounting_journal_prepare"]);
  const org = ctx.organizationId;
  const [accounts, projects, rates, readiness] = await Promise.all([
    db.execute<{ id: string; code: string; name: string; status: string; currency: string | null; manual_posting_allowed: boolean }>(sql`SELECT id,code,name,status,currency,manual_posting_allowed FROM accounting_accounts WHERE organization_id=${org} AND is_postable AND status<>'inactive' AND manual_posting_allowed ORDER BY code`),
    db.execute<{ id: string; label: string; division: string }>(sql`SELECT id,code||' '||name AS label,division FROM projects WHERE organization_id=${org} AND archived_at IS NULL ORDER BY code LIMIT 300`),
    db.execute<{ id: string; from_currency: string; to_currency: string; rate: string; rate_date: string; source: string }>(sql`SELECT id,from_currency,to_currency,rate::text,rate_date::text,source FROM accounting_exchange_rates WHERE organization_id=${org} AND status='approved' ORDER BY rate_date DESC LIMIT 60`),
    readPostingReadiness(org),
  ]);
  let draft = null;
  if (id) {
    if (!isUuid(id)) notFound();
    const me = await myStaffId(org, ctx.actor);
    const j = (await db.execute<{ id: string; status: string; version: number; entry_date: string; description: string; reference: string | null; prepared_by_id: string; journal_type: string }>(sql`SELECT id,status,version,entry_date::text,description,reference,prepared_by_id,journal_type FROM accounting_journals WHERE organization_id=${org} AND id=${id}::uuid`)).rows[0];
    if (!j || j.journal_type !== "manual" || j.status !== "draft" || j.prepared_by_id !== me) notFound();
    draft = { ...j, lines: await readJournalLines(org, id) };
  }
  return { accounts: accounts.rows, projects: projects.rows, rates: rates.rows, readiness, draft };
}

// ---------------------------------------------------------------------------------------------
// Periods, trial balance, policy, history
// ---------------------------------------------------------------------------------------------

export async function readPeriods() {
  const ctx = await accountingContext();
  const org = ctx.organizationId;
  const [periods, readiness] = await Promise.all([
    db.execute<{ id: string; fiscal_year: number; name: string; start_date: string; end_date: string; status: string; version: number; closed_by: string | null; closed_at: string | null; reopened_by: string | null; reopened_at: string | null; reopen_reason: string | null; posted: number; pending: number }>(sql`
      SELECT p.id,p.fiscal_year,p.name,p.start_date::text,p.end_date::text,p.status,p.version,coalesce(c.display_name,c.clerk_user_id) AS closed_by,p.closed_at::text,
        coalesce(r.display_name,r.clerk_user_id) AS reopened_by,p.reopened_at::text,p.reopen_reason,
        (SELECT count(*)::int FROM accounting_journals j WHERE j.organization_id=p.organization_id AND j.period_id=p.id AND j.status='posted') AS posted,
        (SELECT count(*)::int FROM accounting_journals j WHERE j.organization_id=p.organization_id AND j.status IN ('submitted','approved') AND j.entry_date BETWEEN p.start_date AND p.end_date) AS pending
      FROM accounting_periods p
      LEFT JOIN staff_memberships c ON c.organization_id=p.organization_id AND c.id=p.closed_by_id
      LEFT JOIN staff_memberships r ON r.organization_id=p.organization_id AND r.id=p.reopened_by_id
      WHERE p.organization_id=${org} ORDER BY p.start_date DESC LIMIT 240`),
    readPostingReadiness(org),
  ]);
  return { can: accountingCan(ctx), periods: periods.rows, readiness };
}

export type TrialBalanceRow = { account_id: string; code: string; name: string; account_type: string; normal_balance: string; currency: string; opening_debit: string; opening_credit: string; period_debit: string; period_credit: string; closing_debit: string; closing_credit: string };

async function readTrialBalanceRows(org: string, asOf: string, from: string | null) {
  return (await db.execute<TrialBalanceRow>(sql`
    SELECT a.id AS account_id,a.code,a.name,a.account_type,a.normal_balance,j.functional_currency AS currency,
      coalesce(sum(l.functional_debit) FILTER (WHERE ${from}::date IS NOT NULL AND j.entry_date<${from}::date),0)::text AS opening_debit,
      coalesce(sum(l.functional_credit) FILTER (WHERE ${from}::date IS NOT NULL AND j.entry_date<${from}::date),0)::text AS opening_credit,
      coalesce(sum(l.functional_debit) FILTER (WHERE ${from}::date IS NULL OR j.entry_date>=${from}::date),0)::text AS period_debit,
      coalesce(sum(l.functional_credit) FILTER (WHERE ${from}::date IS NULL OR j.entry_date>=${from}::date),0)::text AS period_credit,
      greatest(sum(l.functional_debit)-sum(l.functional_credit),0)::text AS closing_debit,
      greatest(sum(l.functional_credit)-sum(l.functional_debit),0)::text AS closing_credit
    FROM accounting_journal_lines l
    JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id
    JOIN accounting_accounts a ON a.organization_id=l.organization_id AND a.id=l.account_id
    WHERE l.organization_id=${org} AND j.status='posted' AND j.entry_date<=${asOf}::date
    GROUP BY a.id,a.code,a.name,a.account_type,a.normal_balance,j.functional_currency
    ORDER BY j.functional_currency,a.code`)).rows;
}

const minor = (v: string) => BigInt(v.replace(".", "").replace(/^(-?)0+(?=\d)/, "$1"));
const dec = (m: bigint) => { const neg = m < BigInt(0); const a = neg ? -m : m; return `${neg ? "-" : ""}${a / BigInt(100)}.${(a % BigInt(100)).toString().padStart(2, "0")}`; };

const tbColumns = ["opening_debit", "opening_credit", "period_debit", "period_credit", "closing_debit", "closing_credit"] as const;
type TbColumn = (typeof tbColumns)[number];
export type TrialBalanceTotal = Record<TbColumn, string> & { currency: string; accounts: number; balanced: boolean };

/** Column totals per currency, computed with exact integer arithmetic. Currencies never combine. */
export function summarizeTrialBalance(rows: TrialBalanceRow[]): TrialBalanceTotal[] {
  const by = new Map<string, { sums: Record<TbColumn, bigint>; accounts: number }>();
  for (const r of rows) {
    const t = by.get(r.currency) ?? { sums: Object.fromEntries(tbColumns.map((k) => [k, BigInt(0)])) as Record<TbColumn, bigint>, accounts: 0 };
    for (const k of tbColumns) t.sums[k] += minor(r[k]);
    t.accounts += 1;
    by.set(r.currency, t);
  }
  return [...by.entries()].map(([currency, { sums, accounts }]) => ({
    currency,
    accounts,
    ...(Object.fromEntries(tbColumns.map((k) => [k, dec(sums[k])])) as Record<TbColumn, string>),
    balanced: sums.closing_debit === sums.closing_credit && sums.period_debit === sums.period_credit && sums.opening_debit === sums.opening_credit,
  }));
}

export async function readTrialBalance(raw: SearchParams) {
  const ctx = await accountingContext();
  const org = ctx.organizationId;
  const t = await today();
  const asOf = isDate(one(raw, "asOf")) ? one(raw, "asOf") : t;
  const from = isDate(one(raw, "from")) && one(raw, "from") <= asOf ? one(raw, "from") : null;
  const rows = await readTrialBalanceRows(org, asOf, from);
  const unposted = await db.execute<{ status: string; count: number }>(sql`SELECT status,count(*)::int AS count FROM accounting_journals WHERE organization_id=${org} AND status IN ('draft','submitted','approved') AND entry_date<=${asOf}::date GROUP BY status`);
  return { can: accountingCan(ctx), asOf, from, rows, totals: summarizeTrialBalance(rows), unposted: unposted.rows, today: t };
}

export async function readPolicyPage() {
  const ctx = await accountingContext();
  const org = ctx.organizationId;
  const [readiness, rates, rules, me] = await Promise.all([
    readPostingReadiness(org),
    db.execute<{ id: string; from_currency: string; to_currency: string; rate: string; rate_date: string; source: string; status: string; entered_by_id: string; entered_by: string; decided_by: string | null; decision_note: string | null }>(sql`SELECT r.id,r.from_currency,r.to_currency,r.rate::text,r.rate_date::text,r.source,r.status,r.entered_by_id,
        coalesce(e.display_name,e.clerk_user_id) AS entered_by,coalesce(d.display_name,d.clerk_user_id) AS decided_by,r.decision_note
      FROM accounting_exchange_rates r LEFT JOIN staff_memberships e ON e.organization_id=r.organization_id AND e.id=r.entered_by_id LEFT JOIN staff_memberships d ON d.organization_id=r.organization_id AND d.id=r.decided_by_id
      WHERE r.organization_id=${org} ORDER BY r.rate_date DESC,r.entered_at DESC LIMIT 100`),
    db.execute<{ id: string; source_type: string; version: number; status: string; description: string; effective_from: string }>(sql`SELECT id,source_type,version,status,description,effective_from::text FROM accounting_posting_rules WHERE organization_id=${org} ORDER BY source_type,version DESC`),
    myStaffId(org, ctx.actor),
  ]);
  return { can: accountingCan(ctx), readiness, rates: rates.rows, rules: rules.rows, me };
}

export type EventRow = { id: string; action: string; from_status: string | null; to_status: string | null; version: number | null; note: string | null; changes: Record<string, unknown>; actor: string; created_at: string };

async function readEvents(org: string, type: string, id: string) {
  return (await db.execute<EventRow>(sql`SELECT e.id,e.action,e.from_status,e.to_status,e.version,e.note,e.changes,coalesce(s.display_name,e.actor_clerk_user_id) AS actor,e.created_at::text
    FROM accounting_events e LEFT JOIN staff_memberships s ON s.organization_id=e.organization_id AND s.id=e.actor_staff_id
    WHERE e.organization_id=${org} AND e.entity_type=${type} AND e.entity_id=${id} ORDER BY e.created_at,e.id LIMIT 200`)).rows;
}
