import "server-only";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { financeContext, type FinanceContext } from "@/lib/finance/context";
import { maskIdentifier } from "@/lib/banking/catalog";
import { computeCalendar, type CalendarObligation } from "./catalog";

/*
 * Phase 2D tax reads. Authorize first (tax_read), organization from the verified Clerk context, never
 * cached. A liability is reported as "not determined" until an approved final computation or an
 * assessment exists: missing data is never displayed as a zero liability.
 */

const isUuid = (v: string) => z.uuid().safeParse(v).success;

export function taxCan(ctx: FinanceContext) {
  return {
    compute: ctx.can("tax_compute"), approve: ctx.can("tax_approve"), recordPayments: ctx.can("tax_payment_record"), managePolicy: ctx.can("tax_policy_manage"),
  };
}
export async function taxContext() {
  const ctx = await financeContext(["tax_read"]);
  const me = (await db.execute<{ id: string }>(sql`SELECT id FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND clerk_user_id=${ctx.actor} AND status='active'`)).rows[0]?.id ?? null;
  return { ctx, me, can: taxCan(ctx) };
}
async function today() { return (await db.execute<{ d: string }>(sql`SELECT finance_kampala_today()::text AS d`)).rows[0].d; }

export type ObligationRow = CalendarObligation & {
  id: string; version: number; status: string; taxpayer_name: string; taxpayer_tin: string | null; effective_from: string; effective_to: string | null; legal_basis: string; filing_frequency: string;
  calculation_rule_code: string | null; expense_account: string | null; liability_account: string | null; prepayment_account: string | null; evidence: string | null; note: string | null;
  proposed_by: string; proposed_by_id: string; proposed_at: string; decided_by: string | null; decided_at: string | null; decision_note: string | null;
};
const obligationSelect = (org: string) => sql`SELECT o.id,o.code,o.version,o.tax_type,o.name,o.registration_status,o.taxpayer_name,o.taxpayer_tin,o.effective_from::text,o.effective_to::text,o.legal_basis,
    o.period_basis,o.filing_frequency,o.deadline_rules,o.calculation_rule_code,o.processing_enabled,o.status,o.note,
    e.code||' '||e.name AS expense_account,l.code||' '||l.name AS liability_account,pp.code||' '||pp.name AS prepayment_account,d.name AS evidence,
    coalesce(p.display_name,p.clerk_user_id) AS proposed_by,o.proposed_by_id,o.proposed_at::text,coalesce(x.display_name,x.clerk_user_id) AS decided_by,o.decided_at::text,o.decision_note
  FROM tax_obligation_versions o
  LEFT JOIN accounting_accounts e ON e.organization_id=o.organization_id AND e.id=o.expense_account_id LEFT JOIN accounting_accounts l ON l.organization_id=o.organization_id AND l.id=o.liability_account_id
  LEFT JOIN accounting_accounts pp ON pp.organization_id=o.organization_id AND pp.id=o.prepayment_account_id LEFT JOIN documents d ON d.organization_id=o.organization_id AND d.id=o.evidence_document_id
  LEFT JOIN staff_memberships p ON p.organization_id=o.organization_id AND p.id=o.proposed_by_id LEFT JOIN staff_memberships x ON x.organization_id=o.organization_id AND x.id=o.decided_by_id
  WHERE o.organization_id=${org}`;

async function years(org: string) {
  return (await db.execute<{ fiscal_year: number; start: string; end: string }>(sql`SELECT fiscal_year,min(start_date)::text AS start,max(end_date)::text AS "end" FROM accounting_periods WHERE organization_id=${org} GROUP BY fiscal_year ORDER BY fiscal_year DESC LIMIT 6`)).rows;
}

export async function readTaxOverview() {
  const { ctx, me, can } = await taxContext();
  const org = ctx.organizationId;
  const td = await today();
  const [obligations, ys, filings, payments, pending, policy] = await Promise.all([
    db.execute<ObligationRow>(sql`${obligationSelect(org)} AND o.status='approved' ORDER BY o.tax_type,o.code`),
    years(org),
    db.execute<{ obligation_code: string; fiscal_year: number; kind: string }>(sql`SELECT obligation_code,fiscal_year,kind FROM tax_filings WHERE organization_id=${org}`),
    db.execute<{ obligation_code: string; fiscal_year: number; kind: string; amount: string }>(sql`SELECT p.obligation_code,p.fiscal_year,p.kind,p.amount::text FROM tax_payments p JOIN ledger_source_links l ON l.organization_id=p.organization_id AND l.purpose='tax_payment' AND l.source_id=p.id WHERE p.organization_id=${org} AND ledger_journal_live(p.organization_id,l.journal_id)`),
    db.execute<{ kind: string; n: number }>(sql`
      SELECT 'rules' AS kind,count(*)::int AS n FROM tax_rule_versions WHERE organization_id=${org} AND status='proposed'
      UNION ALL SELECT 'obligations',count(*)::int FROM tax_obligation_versions WHERE organization_id=${org} AND status='proposed'
      UNION ALL SELECT 'computations',count(*)::int FROM income_tax_computations WHERE organization_id=${org} AND status='submitted'
      UNION ALL SELECT 'journals',count(*)::int FROM ledger_source_links l JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id WHERE l.organization_id=${org} AND l.purpose IN ('tax_provision','tax_payment') AND j.status='submitted'`),
    db.execute<{ fiscal_year_start_month: number }>(sql`SELECT fiscal_year_start_month FROM accounting_policy_versions WHERE organization_id=${org} AND status='approved'`),
  ]);
  const cit = obligations.rows.filter((o) => o.tax_type === "corporate_income_tax");
  const positions = cit.length ? (await Promise.all(cit.flatMap((o) => ys.map(async (y) => ({ code: o.code, name: o.name, ...(await db.execute<{ p: Record<string, unknown> }>(sql`SELECT income_tax_position(${org},${o.code},${y.fiscal_year}) AS p`)).rows[0].p }))))) : [];
  const calendar = computeCalendar(obligations.rows, [...ys].reverse(), filings.rows, payments.rows, td);
  return {
    can, me, today: td, obligations: obligations.rows, positions, calendar, policy: policy.rows[0] ?? null,
    pending: Object.fromEntries(pending.rows.map((r) => [r.kind, r.n])) as Record<string, number>,
  };
}

export async function readTaxSettings() {
  const { ctx, me, can } = await taxContext();
  const org = ctx.organizationId;
  const [obligations, rules, documents, accounts] = await Promise.all([
    db.execute<ObligationRow>(sql`${obligationSelect(org)} ORDER BY o.code,o.version DESC LIMIT 200`),
    db.execute<{ id: string; rule_code: string; version: number; rule_kind: string; description: string; parameters: Record<string, unknown>; effective_from: string; effective_to: string | null; legal_basis: string; evidence: string; status: string;
      proposed_by: string; proposed_by_id: string; decided_by: string | null; decision_note: string | null }>(sql`
      SELECT r.id,r.rule_code,r.version,r.rule_kind,r.description,r.parameters,r.effective_from::text,r.effective_to::text,r.legal_basis,d.name AS evidence,r.status,
        coalesce(p.display_name,p.clerk_user_id) AS proposed_by,r.proposed_by_id,coalesce(x.display_name,x.clerk_user_id) AS decided_by,r.decision_note
      FROM tax_rule_versions r LEFT JOIN documents d ON d.organization_id=r.organization_id AND d.id=r.evidence_document_id
      LEFT JOIN staff_memberships p ON p.organization_id=r.organization_id AND p.id=r.proposed_by_id LEFT JOIN staff_memberships x ON x.organization_id=r.organization_id AND x.id=r.decided_by_id
      WHERE r.organization_id=${org} ORDER BY r.rule_code,r.version DESC LIMIT 200`),
    evidenceDocuments(org),
    db.execute<{ id: string; code: string; name: string; account_type: string; is_contra: boolean }>(sql`SELECT id,code,name,account_type,is_contra FROM accounting_accounts WHERE organization_id=${org} AND status='active' AND is_postable AND manual_posting_allowed ORDER BY code`),
  ]);
  return { can, me, obligations: obligations.rows, rules: rules.rows, documents, accounts: accounts.rows };
}

/** Live company documents usable as evidence (uploaded through Documents). */
export async function evidenceDocuments(org: string) {
  return (await db.execute<{ id: string; name: string; created_at: string }>(sql`SELECT id,name,created_at::text FROM documents WHERE organization_id=${org} AND archived_at IS NULL ORDER BY created_at DESC LIMIT 150`)).rows;
}

export type ComputationRow = { id: string; obligation_code: string; fiscal_year: number; kind: string; status: string; version: number; period_start: string; period_end: string;
  prepared_by: string; prepared_by_id: string; submitted_by_id: string | null; approved_by: string | null; figures: Record<string, unknown> | null; review_note: string | null; note: string | null; rule: string };
const computationSelect = (org: string) => sql`SELECT c.id,c.obligation_code,c.fiscal_year,c.kind,c.status,c.version,c.period_start::text,c.period_end::text,c.review_note,c.note,
    coalesce(p.display_name,p.clerk_user_id) AS prepared_by,c.prepared_by_id,c.submitted_by_id,coalesce(a.display_name,a.clerk_user_id) AS approved_by,c.figures,r.rule_code||' v'||r.version AS rule
  FROM income_tax_computations c JOIN tax_rule_versions r ON r.organization_id=c.organization_id AND r.id=c.rule_version_id
  LEFT JOIN staff_memberships p ON p.organization_id=c.organization_id AND p.id=c.prepared_by_id LEFT JOIN staff_memberships a ON a.organization_id=c.organization_id AND a.id=c.approved_by_id
  WHERE c.organization_id=${org}`;

export async function readIncomeTax() {
  const { ctx, me, can } = await taxContext();
  const org = ctx.organizationId;
  const [rows, ys, operational] = await Promise.all([
    db.execute<ComputationRow>(sql`${computationSelect(org)} ORDER BY c.fiscal_year DESC,c.created_at DESC LIMIT 100`),
    years(org),
    db.execute<{ code: string; name: string }>(sql`SELECT code,name FROM tax_obligation_versions WHERE organization_id=${org} AND status='approved' AND processing_enabled AND tax_type='corporate_income_tax'`),
  ]);
  return { can, me, rows: rows.rows, years: ys, operational: operational.rows };
}

export async function readComputation(id: string) {
  if (!isUuid(id)) notFound();
  const { ctx, me, can } = await taxContext();
  const org = ctx.organizationId;
  const c = (await db.execute<ComputationRow & { loss_brought_forward: string; estimated_profit: string | null }>(sql`SELECT x.*,ic.loss_brought_forward::text,ic.estimated_profit::text FROM (${computationSelect(org)} AND c.id=${id}::uuid) x JOIN income_tax_computations ic ON ic.id=x.id`)).rows[0];
  if (!c) notFound();
  const [figures, adjustments, credits, allowances, journals, events, documents] = await Promise.all([
    db.execute<{ f: Record<string, unknown> }>(sql`SELECT income_tax_figures(${org},${id}::uuid) AS f`),
    db.execute<{ id: string; line_number: number; kind: string; description: string; amount: string; source: string; evidence: string | null; evidence_document_id: string | null }>(sql`SELECT a.id,a.line_number,a.kind,a.description,a.amount::text,a.source,d.name AS evidence,a.evidence_document_id FROM income_tax_adjustments a LEFT JOIN documents d ON d.organization_id=a.organization_id AND d.id=a.evidence_document_id WHERE a.organization_id=${org} AND a.computation_id=${id}::uuid ORDER BY a.line_number`),
    db.execute<{ id: string; kind: string; certificate_reference: string; counterparty: string | null; amount: string; evidence: string; evidence_document_id: string }>(sql`SELECT c.id,c.kind,c.certificate_reference,c.counterparty,c.amount::text,d.name AS evidence,c.evidence_document_id FROM income_tax_credits c JOIN documents d ON d.organization_id=c.organization_id AND d.id=c.evidence_document_id WHERE c.organization_id=${org} AND c.computation_id=${id}::uuid ORDER BY c.line_number`),
    db.execute<{ asset_number: string; name: string; rule: string; tax_value_before: string; amount: string }>(sql`SELECT f.asset_number,f.name,r.rule_code||' v'||r.version AS rule,t.tax_value_before::text,t.amount::text FROM asset_tax_allowances t JOIN fixed_assets f ON f.organization_id=t.organization_id AND f.id=t.asset_id JOIN tax_rule_versions r ON r.organization_id=t.organization_id AND r.id=t.rule_version_id WHERE t.organization_id=${org} AND t.computation_id=${id}::uuid ORDER BY f.asset_number`),
    ledgerLinks(org, sql`l.purpose='tax_provision' AND l.source_id=${id}::uuid`),
    db.execute<{ id: string; action: string; note: string | null; actor: string; created_at: string }>(sql`SELECT e.id,e.action,e.note,coalesce(s.display_name,e.actor_clerk_user_id) AS actor,e.created_at::text FROM tax_events e LEFT JOIN staff_memberships s ON s.organization_id=e.organization_id AND s.id=e.actor_staff_id WHERE e.organization_id=${org} AND e.entity_type='income_tax_computation' AND e.entity_id=${id} ORDER BY e.created_at DESC LIMIT 50`),
    evidenceDocuments(org),
  ]);
  return { can, me, c, figures: figures.rows[0].f, adjustments: adjustments.rows, credits: credits.rows, allowances: allowances.rows, journals, events: events.rows, documents };
}

export type LinkRow = { id: string; purpose: string; source_id: string; amount: string; journal_id: string; number: string | null; status: string; reversed: boolean; prepared_by: string; prepared_by_id: string; description: string; entry_date: string };
export async function ledgerLinks(org: string, where: ReturnType<typeof sql>) {
  return (await db.execute<LinkRow>(sql`SELECT l.id,l.purpose,l.source_id,l.amount::text,l.journal_id,j.number,j.status,j.description,j.entry_date::text,
      EXISTS(SELECT 1 FROM accounting_journals r WHERE r.organization_id=j.organization_id AND r.reverses_journal_id=j.id AND r.status='posted') AS reversed,
      coalesce(s.display_name,s.clerk_user_id) AS prepared_by,l.prepared_by_id
    FROM ledger_source_links l JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id LEFT JOIN staff_memberships s ON s.organization_id=l.organization_id AND s.id=l.prepared_by_id
    WHERE l.organization_id=${org} AND ${where} ORDER BY l.created_at DESC LIMIT 200`)).rows;
}

export async function readTaxPayments() {
  const { ctx, me, can } = await taxContext();
  const org = ctx.organizationId;
  const [payments, filings, assessments, obligations, accounts, documents, ys, computations] = await Promise.all([
    db.execute<{ id: string; obligation_code: string; fiscal_year: number; kind: string; amount: string; currency: string; paid_on: string; prn: string; account: string; evidence: string; link_id: string; journal_id: string; number: string | null; status: string; reversed: boolean; prepared_by_id: string }>(sql`
      SELECT p.id,p.obligation_code,p.fiscal_year,p.kind,p.amount::text,p.currency,p.paid_on::text,p.prn,b.label AS account,d.name AS evidence,l.id AS link_id,j.id AS journal_id,j.number,j.status,l.prepared_by_id,
        EXISTS(SELECT 1 FROM accounting_journals r WHERE r.organization_id=j.organization_id AND r.reverses_journal_id=j.id AND r.status='posted') AS reversed
      FROM tax_payments p JOIN ledger_source_links l ON l.organization_id=p.organization_id AND l.purpose='tax_payment' AND l.source_id=p.id JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id
      JOIN banking_accounts b ON b.organization_id=p.organization_id AND b.id=p.banking_account_id JOIN documents d ON d.organization_id=p.organization_id AND d.id=p.evidence_document_id
      WHERE p.organization_id=${org} ORDER BY p.paid_on DESC,p.created_at DESC LIMIT 200`),
    db.execute<{ id: string; obligation_code: string; fiscal_year: number; kind: string; filed_on: string; filing_reference: string; acknowledgement_reference: string | null; evidence: string }>(sql`
      SELECT f.id,f.obligation_code,f.fiscal_year,f.kind,f.filed_on::text,f.filing_reference,f.acknowledgement_reference,d.name AS evidence FROM tax_filings f JOIN documents d ON d.organization_id=f.organization_id AND d.id=f.evidence_document_id
      WHERE f.organization_id=${org} ORDER BY f.filed_on DESC LIMIT 200`),
    db.execute<{ id: string; obligation_code: string; fiscal_year: number; kind: string; assessment_reference: string; assessed_on: string; amount: string; supersedes: string | null; superseded: boolean; evidence: string; note: string | null }>(sql`
      SELECT a.id,a.obligation_code,a.fiscal_year,a.kind,a.assessment_reference,a.assessed_on::text,a.amount::text,s.assessment_reference AS supersedes,d.name AS evidence,a.note,
        EXISTS(SELECT 1 FROM tax_assessments x WHERE x.organization_id=a.organization_id AND x.supersedes_id=a.id) AS superseded
      FROM tax_assessments a LEFT JOIN tax_assessments s ON s.organization_id=a.organization_id AND s.id=a.supersedes_id JOIN documents d ON d.organization_id=a.organization_id AND d.id=a.evidence_document_id
      WHERE a.organization_id=${org} ORDER BY a.assessed_on DESC LIMIT 200`),
    db.execute<{ code: string; name: string; tax_type: string; registration_status: string; processing_enabled: boolean; period_basis: string }>(sql`SELECT code,name,tax_type,registration_status,processing_enabled,period_basis FROM tax_obligation_versions WHERE organization_id=${org} AND status='approved' ORDER BY code`),
    db.execute<{ id: string; label: string; currency: string; account_normalized: string | null }>(sql`SELECT b.id,b.label,b.currency,f.account_normalized FROM banking_accounts b LEFT JOIN finance_accounts f ON f.organization_id=b.organization_id AND f.id=b.finance_account_id WHERE b.organization_id=${org} AND b.status='active' AND banking_ledger(b.organization_id,b.id) IS NOT NULL ORDER BY b.label`),
    evidenceDocuments(org),
    years(org),
    db.execute<{ id: string; obligation_code: string; fiscal_year: number; kind: string }>(sql`SELECT id,obligation_code,fiscal_year,kind FROM income_tax_computations WHERE organization_id=${org} AND status='approved' ORDER BY fiscal_year DESC`),
  ]);
  return {
    can, me, payments: payments.rows, filings: filings.rows, assessments: assessments.rows, obligations: obligations.rows,
    accounts: accounts.rows.map(({ account_normalized, ...a }) => ({ ...a, identifier: maskIdentifier(account_normalized) })), documents, years: ys, computations: computations.rows, today: await today(),
  };
}
