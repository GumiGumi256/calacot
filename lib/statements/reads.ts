import "server-only";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { financeContext, type FinanceContext } from "@/lib/finance/context";
import { comparativeRange, comparisonModes, rangeFor, reportTypes, type ComparisonMode, type ReportType } from "@/lib/accounting/statements";

/*
 * Phase 2E reads. Authorize first (fs_read), organization from the verified Clerk context, never
 * cached. Every figure comes from the database reporting functions over POSTED journal lines; the
 * application never adds, nets or rounds ledger amounts itself.
 */

type Raw = Record<string, string | string[] | undefined>;
const one = (raw: Raw, k: string) => { const v = raw[k]; return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : ""; };
const isUuid = (v: string) => z.uuid().safeParse(v).success;
const isDate = (v: string) => z.iso.date().safeParse(v).success;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export function fsCan(ctx: FinanceContext) {
  return {
    adjust: ctx.can("fs_adjust_prepare"), review: ctx.can("fs_adjust_review"), approve: ctx.can("fs_approve"),
    closeStart: ctx.can("close_start"), closeApprove: ctx.can("close_approve"), reopen: ctx.can("close_reopen"), yearEnd: ctx.can("year_end_approve"),
  };
}
export async function fsContext() {
  const ctx = await financeContext(["fs_read"]);
  const me = (await db.execute<{ id: string }>(sql`SELECT id FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND clerk_user_id=${ctx.actor} AND status='active'`)).rows[0]?.id ?? null;
  return { ctx, me, can: fsCan(ctx) };
}
async function basics(org: string) {
  const r = await db.execute<{ today: string; currency: string | null; start_month: number | null; classification: number | null; proposal: number | null }>(sql`
    SELECT finance_kampala_today()::text AS today,(accounting_policy(${org})).functional_currency AS currency,(accounting_policy(${org})).fiscal_year_start_month AS start_month,
      (SELECT version FROM fs_classification_versions WHERE organization_id=${org} AND status='approved') AS classification,
      (SELECT version FROM fs_classification_versions WHERE organization_id=${org} AND status='proposed') AS proposal`);
  return r.rows[0];
}

export type StatementQuery = { report: ReportType; from: string; to: string; compare: ComparisonMode; division: string; comparative: { from: string; to: string } | null };
/** Validated report query with sensible defaults (financial year to date). Ranges are capped at 5 years. */
export function statementQuery(raw: Raw, today: string, startMonth: number): StatementQuery {
  const report = (Object.keys(reportTypes).includes(one(raw, "report")) ? one(raw, "report") : "income") as ReportType;
  const fy = rangeFor("year", today, startMonth);
  let from = isDate(one(raw, "from")) ? one(raw, "from") : fy.start;
  let to = isDate(one(raw, "to")) ? one(raw, "to") : today;
  if (from > to) [from, to] = [to, from];
  if (Date.parse(to) - Date.parse(from) > 5 * 366 * 86400000) from = fy.start;
  const compare = (Object.keys(comparisonModes).includes(one(raw, "compare")) ? one(raw, "compare") : "none") as ComparisonMode;
  const division = ["estates", "architecture", "painting", "interiors", "tech"].includes(one(raw, "division")) ? one(raw, "division") : "";
  return { report, from, to, compare, division, comparative: comparativeRange(from, to, compare) };
}

async function compute(org: string, q: { report: ReportType; division: string }, from: string, to: string): Promise<Json> {
  const div = q.division || null;
  const call = {
    income: sql`fs_income_statement(${org},${from}::date,${to}::date,${div},NULL)`,
    balance: sql`fs_balance_sheet(${org},${to}::date)`,
    cashflow: sql`fs_cash_flow(${org},${from}::date,${to}::date)`,
    equity: sql`fs_equity_changes(${org},${from}::date,${to}::date)`,
    trial: sql`fs_trial_balance(${org},${from}::date,${to}::date)`,
    divisions: sql`fs_division_report(${org},${from}::date,${to}::date)`,
    projects: sql`fs_project_report(${org},${from}::date,${to}::date)`,
  }[q.report];
  return (await db.execute<{ r: Json }>(sql`SELECT ${call} AS r`)).rows[0].r;
}

export async function readStatements(raw: Raw) {
  const { ctx, me, can } = await fsContext();
  const org = ctx.organizationId;
  const b = await basics(org);
  const q = statementQuery(raw, b.today, b.start_month ?? 1);
  const [current, comparative, sets, periods] = await Promise.all([
    compute(org, q, q.from, q.to),
    q.comparative ? compute(org, q, q.comparative.from, q.comparative.to) : Promise.resolve(null),
    db.execute<{ id: string; kind: string; period_start: string; period_end: string; status: string; provisional: boolean; prepared_by: string; prepared_at: string; decided_by: string | null; stale: boolean }>(sql`
      SELECT s.id,s.kind,s.period_start::text,s.period_end::text,s.status,s.provisional,coalesce(p.display_name,p.clerk_user_id) AS prepared_by,s.prepared_at::text,
        coalesce(x.display_name,x.clerk_user_id) AS decided_by,s.ledger_fingerprint <> fs_ledger_fingerprint(s.organization_id,s.period_end) AS stale
      FROM fs_statement_sets s LEFT JOIN staff_memberships p ON p.organization_id=s.organization_id AND p.id=s.prepared_by_id LEFT JOIN staff_memberships x ON x.organization_id=s.organization_id AND x.id=s.decided_by_id
      WHERE s.organization_id=${org} ORDER BY s.prepared_at DESC LIMIT 20`),
    db.execute<{ open: number }>(sql`SELECT count(*)::int AS open FROM accounting_periods WHERE organization_id=${org} AND start_date<=${q.to}::date AND end_date>=${q.from}::date AND status<>'closed'`),
  ]);
  return { can, me, query: q, currency: b.currency ?? "UGX", policyReady: b.currency !== null, classificationVersion: b.classification, proposalVersion: b.proposal,
    current, comparative, sets: sets.rows, openPeriods: periods.rows[0].open, today: b.today };
}

/** Same computation as the screen, for CSV export. Requires fs_read. */
export async function readStatementForExport(raw: Raw) {
  const { ctx } = await fsContext();
  const b = await basics(ctx.organizationId);
  const q = statementQuery(raw, b.today, b.start_month ?? 1);
  const [current, comparative] = await Promise.all([compute(ctx.organizationId, q, q.from, q.to), q.comparative ? compute(ctx.organizationId, q, q.comparative.from, q.comparative.to) : null]);
  return { ctx, query: q, currency: b.currency ?? "UGX", current, comparative };
}

export async function readStatementSet(id: string) {
  if (!isUuid(id)) notFound();
  const { ctx, me, can } = await fsContext();
  const org = ctx.organizationId;
  const set = (await db.execute<{ id: string; kind: string; period_start: string; period_end: string; comparative_start: string | null; comparative_end: string | null; payload: Json; payload_sha256: string;
    status: string; provisional: boolean; prepared_by: string; prepared_by_id: string; prepared_at: string; decided_by: string | null; decided_at: string | null; decision_note: string | null; stale: boolean; classification_version: number | null }>(sql`
    SELECT s.id,s.kind,s.period_start::text,s.period_end::text,s.comparative_start::text,s.comparative_end::text,s.payload,s.payload_sha256,s.status,s.provisional,
      coalesce(p.display_name,p.clerk_user_id) AS prepared_by,s.prepared_by_id,s.prepared_at::text,coalesce(x.display_name,x.clerk_user_id) AS decided_by,s.decided_at::text,s.decision_note,
      s.ledger_fingerprint <> fs_ledger_fingerprint(s.organization_id,s.period_end) AS stale,c.version AS classification_version
    FROM fs_statement_sets s LEFT JOIN staff_memberships p ON p.organization_id=s.organization_id AND p.id=s.prepared_by_id LEFT JOIN staff_memberships x ON x.organization_id=s.organization_id AND x.id=s.decided_by_id
    LEFT JOIN fs_classification_versions c ON c.organization_id=s.organization_id AND c.id=s.classification_version_id
    WHERE s.organization_id=${org} AND s.id=${id}::uuid`)).rows[0];
  if (!set) notFound();
  return { can, me, set, events: await readFsEvents(org, "statement_set", id) };
}

export type FsEvent = { id: string; action: string; note: string | null; changes: Record<string, unknown>; actor: string; created_at: string; entity_type: string };
async function readFsEvents(org: string, type: string, id: string | string[]) {
  const ids = Array.isArray(id) ? id : [id];
  if (!ids.length) return [];
  return (await db.execute<FsEvent>(sql`SELECT e.id,e.action,e.note,e.changes,e.entity_type,coalesce(s.display_name,e.actor_clerk_user_id) AS actor,e.created_at::text
    FROM fs_events e LEFT JOIN staff_memberships s ON s.organization_id=e.organization_id AND s.id=e.actor_staff_id
    WHERE e.organization_id=${org} AND ((e.entity_type=${type} AND e.entity_id = ANY(string_to_array(${ids.join(",")}, ',')))
      OR (e.entity_type='close_exception' AND e.changes->>'closeId' = ANY(string_to_array(${ids.join(",")}, ','))))
    ORDER BY e.created_at DESC LIMIT 200`)).rows;
}

// ---------------------------------------------------------------------------------------------
// General ledger detail
// ---------------------------------------------------------------------------------------------

export async function readGeneralLedger(raw: Raw) {
  const { ctx } = await fsContext();
  const org = ctx.organizationId;
  const b = await basics(org);
  const fy = rangeFor("year", b.today, b.start_month ?? 1);
  let from = isDate(one(raw, "from")) ? one(raw, "from") : fy.start;
  let to = isDate(one(raw, "to")) ? one(raw, "to") : b.today;
  if (from > to) [from, to] = [to, from];
  const account = isUuid(one(raw, "account")) ? one(raw, "account") : "";
  const page = Math.max(1, Math.min(2000, Number(one(raw, "page")) || 1));
  const size = 100;
  const acctFilter = account ? sql`AND l.account_id=${account}::uuid` : sql``;
  // Opening balance (debit positive) of the selected account; the running balance starts from it.
  const openingBalance = account ? (await db.execute<{ v: string }>(sql`SELECT coalesce(sum(l.functional_debit-l.functional_credit),0)::text AS v FROM accounting_journal_lines l
    JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id AND j.status='posted'
    WHERE l.organization_id=${org} AND l.account_id=${account}::uuid AND j.entry_date<${from}::date`)).rows[0].v : null;
  const [rows, totals, accounts] = await Promise.all([
    db.execute<{ journal_id: string; number: string; entry_date: string; description: string; line_description: string | null; code: string; name: string; account_id: string;
      debit: string; credit: string; division: string | null; project: string | null; running: string | null }>(sql`
      SELECT * FROM (
        SELECT j.id AS journal_id,j.number,j.entry_date::text,j.description,l.description AS line_description,a.code,a.name,a.id AS account_id,
          l.functional_debit::text AS debit,l.functional_credit::text AS credit,l.division,p.code AS project,
          ${account ? sql`(${openingBalance}::numeric + sum(l.functional_debit-l.functional_credit) OVER (ORDER BY j.entry_date,j.number,l.line_number))::text` : sql`NULL`} AS running,
          row_number() OVER (ORDER BY j.entry_date,j.number,l.line_number) AS rn
        FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id AND j.status='posted'
        JOIN accounting_accounts a ON a.organization_id=l.organization_id AND a.id=l.account_id LEFT JOIN projects p ON p.organization_id=l.organization_id AND p.id=l.project_id
        WHERE l.organization_id=${org} AND j.entry_date BETWEEN ${from}::date AND ${to}::date ${acctFilter}
      ) x WHERE rn > ${(page - 1) * size} ORDER BY rn LIMIT ${size}`),
    db.execute<{ n: number; debit: string; credit: string }>(sql`SELECT count(*)::int AS n,coalesce(sum(l.functional_debit),0)::text AS debit,coalesce(sum(l.functional_credit),0)::text AS credit
      FROM accounting_journal_lines l JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id AND j.status='posted'
      WHERE l.organization_id=${org} AND j.entry_date BETWEEN ${from}::date AND ${to}::date ${acctFilter}`),
    db.execute<{ id: string; code: string; name: string }>(sql`SELECT id,code,name FROM accounting_accounts WHERE organization_id=${org} AND is_postable ORDER BY code`),
  ]);
  return { from, to, account, page, size, lines: rows.rows, totals: totals.rows[0], accounts: accounts.rows, openingBalance, currency: b.currency ?? "UGX" };
}

// ---------------------------------------------------------------------------------------------
// Period closing and year-end
// ---------------------------------------------------------------------------------------------

export async function readClosing(raw: Raw) {
  const { ctx, me, can } = await fsContext();
  const org = ctx.organizationId;
  const years = (await db.execute<{ fiscal_year: number }>(sql`SELECT DISTINCT fiscal_year FROM accounting_periods WHERE organization_id=${org} ORDER BY fiscal_year DESC`)).rows.map((r) => r.fiscal_year);
  const b = await basics(org);
  const fyParam = Number(one(raw, "year"));
  const fy = years.includes(fyParam) ? fyParam : (years.find((y) => y <= Number(b.today.slice(0, 4))) ?? years[0] ?? null);
  const [periods, policy, yearEnds, sets] = await Promise.all([
    fy === null ? Promise.resolve({ rows: [] }) : db.execute<{ id: string; name: string; start_date: string; end_date: string; status: string; close_id: string | null; close_status: string | null; exceptions: number }>(sql`
      SELECT p.id,p.name,p.start_date::text,p.end_date::text,p.status,c.id AS close_id,c.status AS close_status,
        (SELECT count(*)::int FROM period_close_exceptions e WHERE e.organization_id=p.organization_id AND e.close_id=c.id AND e.status='proposed') AS exceptions
      FROM accounting_periods p LEFT JOIN LATERAL (SELECT id,status FROM period_closes WHERE organization_id=p.organization_id AND period_id=p.id ORDER BY started_at DESC LIMIT 1) c ON true
      WHERE p.organization_id=${org} AND p.fiscal_year=${fy} ORDER BY p.start_date`),
    readClosePolicies(org),
    fy === null ? Promise.resolve({ rows: [] }) : db.execute<{ id: string; status: string; net_result: string; journal_number: string | null; journal_id: string | null; prepared_by: string; prepared_by_id: string; prepared_at: string;
      decided_by: string | null; decided_at: string | null; reopen_reason: string | null; reversal_number: string | null }>(sql`
      SELECT y.id,y.status,y.net_result::text,j.number AS journal_number,y.journal_id,coalesce(p.display_name,p.clerk_user_id) AS prepared_by,y.prepared_by_id,y.prepared_at::text,
        coalesce(x.display_name,x.clerk_user_id) AS decided_by,y.decided_at::text,y.reopen_reason,r.number AS reversal_number
      FROM year_end_closes y LEFT JOIN accounting_journals j ON j.organization_id=y.organization_id AND j.id=y.journal_id LEFT JOIN accounting_journals r ON r.organization_id=y.organization_id AND r.id=y.reversal_journal_id
      LEFT JOIN staff_memberships p ON p.organization_id=y.organization_id AND p.id=y.prepared_by_id LEFT JOIN staff_memberships x ON x.organization_id=y.organization_id AND x.id=y.decided_by_id
      WHERE y.organization_id=${org} AND y.fiscal_year=${fy} ORDER BY y.prepared_at DESC`),
    fy === null ? Promise.resolve({ rows: [] }) : db.execute<{ id: string; period_start: string; period_end: string }>(sql`
      SELECT s.id,s.period_start::text,s.period_end::text FROM fs_statement_sets s WHERE s.organization_id=${org} AND s.kind='year' AND s.status='approved'
        AND s.period_start=(SELECT min(start_date) FROM accounting_periods WHERE organization_id=${org} AND fiscal_year=${fy})
        AND s.period_end=(SELECT max(end_date) FROM accounting_periods WHERE organization_id=${org} AND fiscal_year=${fy})
        AND s.ledger_fingerprint=fs_ledger_fingerprint(s.organization_id,s.period_end)`),
  ]);
  return { can, me, years, fy, periods: periods.rows, policy, yearEnds: yearEnds.rows, annualSets: sets.rows, today: b.today };
}

async function readClosePolicies(org: string) {
  const r = await db.execute<{ id: string; version: number; status: string; require_bank_reconciliation: boolean; require_cash_count: boolean; clearing_tolerance: string; evidence_items: string[];
    note: string; proposed_by: string; proposed_by_id: string; proposed_at: string; decided_by: string | null; decision_note: string | null }>(sql`
    SELECT v.id,v.version,v.status,v.require_bank_reconciliation,v.require_cash_count,v.clearing_tolerance::text,v.evidence_items,v.note,coalesce(p.display_name,p.clerk_user_id) AS proposed_by,v.proposed_by_id,
      v.proposed_at::text,coalesce(x.display_name,x.clerk_user_id) AS decided_by,v.decision_note
    FROM period_close_policy_versions v LEFT JOIN staff_memberships p ON p.organization_id=v.organization_id AND p.id=v.proposed_by_id LEFT JOIN staff_memberships x ON x.organization_id=v.organization_id AND x.id=v.decided_by_id
    WHERE v.organization_id=${org} ORDER BY v.version DESC LIMIT 10`);
  return { current: r.rows.find((x) => x.status === "approved") ?? null, proposal: r.rows.find((x) => x.status === "proposed") ?? null, history: r.rows };
}

export async function readPeriodClose(periodId: string) {
  if (!isUuid(periodId)) notFound();
  const { ctx, me, can } = await fsContext();
  const org = ctx.organizationId;
  const period = (await db.execute<{ id: string; name: string; start_date: string; end_date: string; status: string; fiscal_year: number; version: number }>(sql`
    SELECT id,name,start_date::text,end_date::text,status,fiscal_year,version FROM accounting_periods WHERE organization_id=${org} AND id=${periodId}::uuid`)).rows[0];
  if (!period) notFound();
  const [closes, checks, policy] = await Promise.all([
    db.execute<{ id: string; status: string; version: number; prepared_by: string; prepared_by_id: string; submitted_by: string | null; submitted_by_id: string | null; approved_by: string | null; approved_at: string | null;
      started_at: string; note: string | null; reopen_reason: string | null; assigned_reviewer_id: string | null; assigned_reviewer: string | null }>(sql`
      SELECT c.id,c.status,c.version,coalesce(p.display_name,p.clerk_user_id) AS prepared_by,c.prepared_by_id,coalesce(s.display_name,s.clerk_user_id) AS submitted_by,c.submitted_by_id,
        c.assigned_reviewer_id,(SELECT coalesce(r.display_name,r.clerk_user_id) FROM staff_memberships r WHERE r.organization_id=c.organization_id AND r.id=c.assigned_reviewer_id) AS assigned_reviewer,
        coalesce(a.display_name,a.clerk_user_id) AS approved_by,c.approved_at::text,c.started_at::text,c.note,c.reopen_reason
      FROM period_closes c LEFT JOIN staff_memberships p ON p.organization_id=c.organization_id AND p.id=c.prepared_by_id LEFT JOIN staff_memberships s ON s.organization_id=c.organization_id AND s.id=c.submitted_by_id
      LEFT JOIN staff_memberships a ON a.organization_id=c.organization_id AND a.id=c.approved_by_id
      WHERE c.organization_id=${org} AND c.period_id=${periodId}::uuid ORDER BY c.started_at DESC`),
    db.execute<{ r: Json }>(sql`SELECT period_close_checks(${org},${periodId}::uuid) AS r`),
    readClosePolicies(org),
  ]);
  const live = closes.rows.find((c) => ["in_progress", "submitted", "closed"].includes(c.status)) ?? null;
  const ids = closes.rows.map((c) => c.id);
  const [evidence, exceptions, events, yearEnd, staff] = await Promise.all([
    live ? db.execute<{ id: string; item: string; reference: string; note: string | null; added_by: string; created_at: string }>(sql`
      SELECT e.id,e.item,e.reference,e.note,coalesce(s.display_name,s.clerk_user_id) AS added_by,e.created_at::text FROM period_close_evidence e LEFT JOIN staff_memberships s ON s.organization_id=e.organization_id AND s.id=e.added_by_id
      WHERE e.organization_id=${org} AND e.close_id=${live.id}::uuid ORDER BY e.created_at`) : Promise.resolve({ rows: [] }),
    live ? db.execute<{ id: string; check_key: string; explanation: string; status: string; proposed_by: string; proposed_by_id: string; decided_by: string | null; decision_note: string | null }>(sql`
      SELECT e.id,e.check_key,e.explanation,e.status,coalesce(p.display_name,p.clerk_user_id) AS proposed_by,e.proposed_by_id,coalesce(x.display_name,x.clerk_user_id) AS decided_by,e.decision_note
      FROM period_close_exceptions e LEFT JOIN staff_memberships p ON p.organization_id=e.organization_id AND p.id=e.proposed_by_id LEFT JOIN staff_memberships x ON x.organization_id=e.organization_id AND x.id=e.decided_by_id
      WHERE e.organization_id=${org} AND e.close_id=${live.id}::uuid ORDER BY e.proposed_at`) : Promise.resolve({ rows: [] }),
    readFsEvents(org, "period_close", ids),
    db.execute<{ id: string; status: string }>(sql`SELECT id,status FROM year_end_closes WHERE organization_id=${org} AND fiscal_year=${period.fiscal_year} AND status IN ('prepared','closed')`),
    db.execute<{ id: string; name: string }>(sql`SELECT id,coalesce(display_name,clerk_user_id) AS name FROM staff_memberships WHERE organization_id=${org} AND status='active' ORDER BY 2`),
  ]);
  const isFinal = (await db.execute<{ last: boolean }>(sql`SELECT ${period.end_date}::date = max(end_date) AS last FROM accounting_periods WHERE organization_id=${org} AND fiscal_year=${period.fiscal_year}`)).rows[0].last;
  return { can, me, period, closes: closes.rows, live, checks: checks.rows[0].r, policy: policy.current, evidence: evidence.rows, exceptions: exceptions.rows, events, yearEnd: yearEnd.rows[0] ?? null, isFinal, staff: staff.rows };
}

// ---------------------------------------------------------------------------------------------
// Settings: classification, overhead allocation; adjustments
// ---------------------------------------------------------------------------------------------

export async function readStatementSettings() {
  const { ctx, me, can } = await fsContext();
  const org = ctx.organizationId;
  const [accounts, classifications, overhead, closePolicies] = await Promise.all([
    db.execute<{ id: string; code: string; name: string; account_type: string; is_contra: boolean; is_postable: boolean; reporting_class: string | null; status: string }>(sql`
      SELECT id,code,name,account_type,is_contra,is_postable,reporting_class,status FROM accounting_accounts WHERE organization_id=${org} AND is_postable ORDER BY code`),
    db.execute<{ id: string; version: number; status: string; mappings: Record<string, { line: string; cashflow: string | null; clearing?: boolean }>; retained_earnings_account_id: string; note: string;
      proposed_by: string; proposed_by_id: string; proposed_at: string; decided_by: string | null; decision_note: string | null }>(sql`
      SELECT v.id,v.version,v.status,v.mappings,v.retained_earnings_account_id,v.note,coalesce(p.display_name,p.clerk_user_id) AS proposed_by,v.proposed_by_id,v.proposed_at::text,
        coalesce(x.display_name,x.clerk_user_id) AS decided_by,v.decision_note
      FROM fs_classification_versions v LEFT JOIN staff_memberships p ON p.organization_id=v.organization_id AND p.id=v.proposed_by_id LEFT JOIN staff_memberships x ON x.organization_id=v.organization_id AND x.id=v.decided_by_id
      WHERE v.organization_id=${org} ORDER BY v.version DESC LIMIT 10`),
    db.execute<{ id: string; version: number; status: string; shares: Record<string, string>; effective_from: string; note: string; proposed_by: string; proposed_by_id: string; decided_by: string | null }>(sql`
      SELECT v.id,v.version,v.status,v.shares,v.effective_from::text,v.note,coalesce(p.display_name,p.clerk_user_id) AS proposed_by,v.proposed_by_id,coalesce(x.display_name,x.clerk_user_id) AS decided_by
      FROM overhead_allocation_versions v LEFT JOIN staff_memberships p ON p.organization_id=v.organization_id AND p.id=v.proposed_by_id LEFT JOIN staff_memberships x ON x.organization_id=v.organization_id AND x.id=v.decided_by_id
      WHERE v.organization_id=${org} ORDER BY v.version DESC LIMIT 10`),
    readClosePolicies(org),
  ]);
  const c = classifications.rows;
  return { can, me, accounts: accounts.rows, classification: { current: c.find((x) => x.status === "approved") ?? null, proposal: c.find((x) => x.status === "proposed") ?? null, history: c },
    overhead: { current: overhead.rows.find((x) => x.status === "approved") ?? null, proposal: overhead.rows.find((x) => x.status === "proposed") ?? null, history: overhead.rows }, closePolicies };
}

export async function readAdjustments() {
  const { ctx, me, can } = await fsContext();
  const org = ctx.organizationId;
  const [rows, accounts, today] = await Promise.all([
    db.execute<{ id: string; kind: string; reason: string; evidence_reference: string; auto_reverse_on: string | null; prior_period: boolean; journal_id: string; journal_status: string; journal_version: number;
      number: string | null; entry_date: string; description: string; total: string | null; prepared_by: string; prepared_by_id: string; reversal_number: string | null; replaces_number: string | null }>(sql`
      SELECT x.id,x.kind,x.reason,x.evidence_reference,x.auto_reverse_on::text,x.prior_period,j.id AS journal_id,j.status AS journal_status,j.version AS journal_version,j.number,j.entry_date::text,j.description,
        coalesce(j.total_debit,(SELECT sum(functional_debit) FROM accounting_journal_lines WHERE organization_id=j.organization_id AND journal_id=j.id))::text AS total,
        coalesce(p.display_name,p.clerk_user_id) AS prepared_by,x.prepared_by_id,r.number AS reversal_number,rp.number AS replaces_number
      FROM adjustment_entries x JOIN accounting_journals j ON j.organization_id=x.organization_id AND j.id=x.journal_id
      LEFT JOIN accounting_journals r ON r.organization_id=x.organization_id AND r.id=x.reversal_journal_id LEFT JOIN accounting_journals rp ON rp.organization_id=x.organization_id AND rp.id=x.replaces_journal_id
      LEFT JOIN staff_memberships p ON p.organization_id=x.organization_id AND p.id=x.prepared_by_id
      WHERE x.organization_id=${org} ORDER BY x.created_at DESC LIMIT 200`),
    db.execute<{ id: string; code: string; name: string }>(sql`SELECT id,code,name FROM accounting_accounts WHERE organization_id=${org} AND is_postable AND status='active' AND manual_posting_allowed ORDER BY code`),
    db.execute<{ d: string }>(sql`SELECT finance_kampala_today()::text AS d`),
  ]);
  return { can, me, adjustments: rows.rows, accounts: accounts.rows, today: today.rows[0].d };
}
