import "server-only";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { financeContext } from "@/lib/finance/context";
import { evidenceDocuments, ledgerLinks } from "@/lib/tax/reads";

/*
 * Phase 2D fixed-asset reads. Authorize first (assets_manage, depreciation_approve or accounting_read),
 * organization from the verified context, never cached. Carrying amounts come only from effective
 * (posted, not reversed) journals.
 */

const isUuid = (v: string) => z.uuid().safeParse(v).success;
export async function assetsContext() {
  const ctx = await financeContext(["assets_manage", "depreciation_approve", "accounting_read"]);
  const me = (await db.execute<{ id: string }>(sql`SELECT id FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND clerk_user_id=${ctx.actor} AND status='active'`)).rows[0]?.id ?? null;
  return { ctx, me, can: { manage: ctx.can("assets_manage"), approve: ctx.can("depreciation_approve") } };
}

export type AssetRow = {
  id: string; asset_number: string; name: string; ownership: string; category: string | null; acquisition_date: string; capitalization_date: string | null; cost: string; currency: string;
  residual_value: string; useful_life_months: number | null; accumulated: string | null; net_book_value: string | null; state: string; custodian: string | null; location: string | null;
  division: string | null; project: string | null; serial_number: string | null; supplier: string | null; hire_reference: string | null; version: number;
};
const assetSelect = (org: string) => sql`SELECT f.id,f.asset_number,f.name,f.ownership,c.code||' '||c.name AS category,f.acquisition_date::text,f.capitalization_date::text,f.cost::text,f.currency,f.residual_value::text,
    f.useful_life_months,CASE WHEN f.ownership='owned' THEN fixed_asset_accumulated(f.organization_id,f.id)::text END AS accumulated,
    CASE WHEN f.ownership='owned' THEN (f.cost-fixed_asset_accumulated(f.organization_id,f.id))::text END AS net_book_value,
    CASE WHEN f.ownership='hired' THEN 'hired' WHEN fixed_asset_disposed(f.organization_id,f.id) THEN CASE WHEN EXISTS(SELECT 1 FROM asset_disposals x JOIN ledger_source_links l ON l.organization_id=x.organization_id AND l.purpose='asset_disposal' AND l.source_id=x.id WHERE x.organization_id=f.organization_id AND x.asset_id=f.id AND ledger_journal_effective(f.organization_id,l.journal_id)) THEN 'disposed' ELSE 'disposal_pending' END
      WHEN fixed_asset_capitalized(f.organization_id,f.id) THEN CASE WHEN f.cost-fixed_asset_accumulated(f.organization_id,f.id)<=f.residual_value THEN 'fully_depreciated' ELSE 'in_service' END
      WHEN fixed_asset_capitalization_live(f.organization_id,f.id) THEN 'capitalization_pending' ELSE 'draft' END AS state,
    coalesce(s.display_name,s.clerk_user_id) AS custodian,f.location,f.division,p.name AS project,f.serial_number,su.name AS supplier,f.hire_reference,f.version
  FROM fixed_assets f LEFT JOIN asset_category_versions c ON c.organization_id=f.organization_id AND c.id=f.category_version_id
  LEFT JOIN staff_memberships s ON s.organization_id=f.organization_id AND s.id=f.custodian_id LEFT JOIN projects p ON p.organization_id=f.organization_id AND p.id=f.project_id
  LEFT JOIN suppliers su ON su.organization_id=f.organization_id AND su.id=f.supplier_id
  WHERE f.organization_id=${org}`;

async function formOptions(org: string) {
  const [categories, staff, projects, suppliers, expenses, accounts, documents] = await Promise.all([
    db.execute<{ id: string; code: string; version: number; name: string; useful_life_months: number; residual_percent: string; period_convention: string; capitalization_threshold: string; status: string;
      policy_basis: string; proposed_by: string; proposed_by_id: string; decided_by: string | null; cost: string; accumulated: string; expense: string; tax_allowance_rule_code: string | null }>(sql`
      SELECT c.id,c.code,c.version,c.name,c.useful_life_months,c.residual_percent::text,c.period_convention,c.capitalization_threshold::text,c.status,c.policy_basis,c.tax_allowance_rule_code,
        coalesce(p.display_name,p.clerk_user_id) AS proposed_by,c.proposed_by_id,coalesce(d.display_name,d.clerk_user_id) AS decided_by,a1.code AS cost,a2.code AS accumulated,a3.code AS expense
      FROM asset_category_versions c JOIN accounting_accounts a1 ON a1.organization_id=c.organization_id AND a1.id=c.cost_account_id JOIN accounting_accounts a2 ON a2.organization_id=c.organization_id AND a2.id=c.accumulated_account_id
      JOIN accounting_accounts a3 ON a3.organization_id=c.organization_id AND a3.id=c.expense_account_id
      LEFT JOIN staff_memberships p ON p.organization_id=c.organization_id AND p.id=c.proposed_by_id LEFT JOIN staff_memberships d ON d.organization_id=c.organization_id AND d.id=c.decided_by_id
      WHERE c.organization_id=${org} ORDER BY c.code,c.version DESC`),
    db.execute<{ id: string; name: string }>(sql`SELECT id,coalesce(display_name,clerk_user_id) AS name FROM staff_memberships WHERE organization_id=${org} AND status='active' ORDER BY 2 LIMIT 200`),
    db.execute<{ id: string; name: string }>(sql`SELECT id,name FROM projects WHERE organization_id=${org} AND archived_at IS NULL ORDER BY name LIMIT 300`),
    db.execute<{ id: string; name: string }>(sql`SELECT id,name FROM suppliers WHERE organization_id=${org} AND archived_at IS NULL ORDER BY name LIMIT 300`),
    db.execute<{ id: string; label: string; net_amount: string; currency: string }>(sql`SELECT id,description||' ('||category||', '||to_char(incurred_at,'YYYY-MM-DD')||')' AS label,net_amount::text,currency FROM expenses WHERE organization_id=${org} AND status IN ('approved','paid') ORDER BY incurred_at DESC LIMIT 200`),
    db.execute<{ id: string; code: string; name: string; account_type: string; is_contra: boolean }>(sql`SELECT id,code,name,account_type,is_contra FROM accounting_accounts WHERE organization_id=${org} AND status='active' AND is_postable AND manual_posting_allowed ORDER BY code`),
    evidenceDocuments(org),
  ]);
  return { categories: categories.rows, staff: staff.rows, projects: projects.rows, suppliers: suppliers.rows, expenses: expenses.rows, accounts: accounts.rows, documents };
}

export async function readAssetRegister(raw: Record<string, string | string[] | undefined>) {
  const { ctx, me, can } = await assetsContext();
  const org = ctx.organizationId;
  const state = typeof raw.state === "string" ? raw.state : "";
  const search = typeof raw.search === "string" ? raw.search.trim().slice(0, 100) : "";
  const [rows, options] = await Promise.all([
    db.execute<AssetRow>(sql`SELECT * FROM (${assetSelect(org)}) x WHERE (${state} = '' OR x.state = ${state}) AND (${search} = '' OR x.name ILIKE ${"%" + search.replace(/[%_\\]/g, "\\$&") + "%"} OR x.asset_number ILIKE ${"%" + search.replace(/[%_\\]/g, "\\$&") + "%"} OR coalesce(x.serial_number,'') ILIKE ${"%" + search.replace(/[%_\\]/g, "\\$&") + "%"}) ORDER BY x.asset_number DESC LIMIT 300`),
    formOptions(org),
  ]);
  return { can, me, rows: rows.rows, filters: { state, search }, ...options };
}

export async function readAsset(id: string) {
  if (!isUuid(id)) notFound();
  const { ctx, me, can } = await assetsContext();
  const org = ctx.organizationId;
  const a = (await db.execute<AssetRow>(sql`${assetSelect(org)} AND f.id=${id}::uuid`)).rows[0];
  if (!a) notFound();
  const [links, depreciation, transfers, events, options, banks] = await Promise.all([
    ledgerLinks(org, sql`((l.purpose='asset_capitalization' AND l.source_id=${id}::uuid) OR (l.purpose='asset_impairment' AND l.source_id IN (SELECT id FROM asset_impairments WHERE organization_id=${org} AND asset_id=${id}::uuid))
      OR (l.purpose='asset_disposal' AND l.source_id IN (SELECT id FROM asset_disposals WHERE organization_id=${org} AND asset_id=${id}::uuid)))`),
    db.execute<{ period_end: string; amount: string; accumulated_before: string; number: string | null; status: string; effective: boolean }>(sql`SELECT r.period_end::text,d.amount::text,d.accumulated_before::text,j.number,j.status,ledger_journal_effective(${org},j.id) AS effective
      FROM asset_depreciation_lines d JOIN asset_depreciation_runs r ON r.organization_id=d.organization_id AND r.id=d.run_id JOIN ledger_source_links l ON l.organization_id=r.organization_id AND l.purpose='asset_depreciation' AND l.source_id=r.id
      JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id WHERE d.organization_id=${org} AND d.asset_id=${id}::uuid ORDER BY r.period_end DESC`),
    db.execute<{ transfer_date: string; before: Record<string, string | null>; after: Record<string, string | null>; reason: string; recorded_by: string }>(sql`SELECT t.transfer_date::text,t.before,t.after,t.reason,coalesce(s.display_name,s.clerk_user_id) AS recorded_by FROM asset_transfers t LEFT JOIN staff_memberships s ON s.organization_id=t.organization_id AND s.id=t.recorded_by_id WHERE t.organization_id=${org} AND t.asset_id=${id}::uuid ORDER BY t.created_at DESC`),
    db.execute<{ id: string; action: string; note: string | null; actor: string; created_at: string }>(sql`SELECT e.id,e.action,e.note,coalesce(s.display_name,e.actor_clerk_user_id) AS actor,e.created_at::text FROM tax_events e LEFT JOIN staff_memberships s ON s.organization_id=e.organization_id AND s.id=e.actor_staff_id WHERE e.organization_id=${org} AND e.entity_type='fixed_asset' AND e.entity_id=${id} ORDER BY e.created_at DESC LIMIT 50`),
    formOptions(org),
    db.execute<{ id: string; label: string }>(sql`SELECT id,label FROM banking_accounts WHERE organization_id=${org} AND status='active' AND banking_ledger(organization_id,id) IS NOT NULL ORDER BY label`),
  ]);
  return { can, me, a, links, depreciation: depreciation.rows, transfers: transfers.rows, events: events.rows, banks: banks.rows, ...options };
}

export async function readDepreciation() {
  const { ctx, me, can } = await assetsContext();
  const org = ctx.organizationId;
  const [periods, runs] = await Promise.all([
    db.execute<{ id: string; name: string; start_date: string; end_date: string; status: string; preview_total: string; assets: number }>(sql`SELECT p.id,p.name,p.start_date::text,p.end_date::text,p.status,
        (SELECT coalesce(sum(amount),0)::text FROM asset_depreciation_preview(${org},p.id)) AS preview_total,(SELECT count(*)::int FROM asset_depreciation_preview(${org},p.id)) AS assets
      FROM accounting_periods p WHERE p.organization_id=${org} AND p.end_date <= finance_kampala_today() AND p.end_date >= finance_kampala_today() - 400 ORDER BY p.start_date DESC LIMIT 14`),
    ledgerLinks(org, sql`l.purpose='asset_depreciation'`),
  ]);
  return { can, me, periods: periods.rows, runs };
}

export async function readDisposals() {
  const { ctx, me, can } = await assetsContext();
  const org = ctx.organizationId;
  const [disposals, impairments, transfers] = await Promise.all([
    db.execute<{ id: string; asset_number: string; name: string; disposal_date: string; kind: string; proceeds: string; net_book_value: string; gain_or_loss: string; currency: string; link_id: string; number: string | null; status: string; reversed: boolean; prepared_by_id: string }>(sql`
      SELECT x.id,f.asset_number,f.name,x.disposal_date::text,x.kind,x.proceeds::text,x.net_book_value::text,x.gain_or_loss::text,f.currency,l.id AS link_id,j.number,j.status,l.prepared_by_id,
        EXISTS(SELECT 1 FROM accounting_journals r WHERE r.organization_id=j.organization_id AND r.reverses_journal_id=j.id AND r.status='posted') AS reversed
      FROM asset_disposals x JOIN fixed_assets f ON f.organization_id=x.organization_id AND f.id=x.asset_id JOIN ledger_source_links l ON l.organization_id=x.organization_id AND l.purpose='asset_disposal' AND l.source_id=x.id
      JOIN accounting_journals j ON j.organization_id=l.organization_id AND j.id=l.journal_id WHERE x.organization_id=${org} ORDER BY x.disposal_date DESC LIMIT 200`),
    ledgerLinks(org, sql`l.purpose IN ('asset_impairment','asset_capitalization')`),
    db.execute<{ asset_number: string; name: string; transfer_date: string; before: Record<string, string | null>; after: Record<string, string | null>; reason: string }>(sql`SELECT f.asset_number,f.name,t.transfer_date::text,t.before,t.after,t.reason FROM asset_transfers t JOIN fixed_assets f ON f.organization_id=t.organization_id AND f.id=t.asset_id WHERE t.organization_id=${org} ORDER BY t.created_at DESC LIMIT 200`),
  ]);
  return { can, me, disposals: disposals.rows, links: impairments, transfers: transfers.rows };
}
