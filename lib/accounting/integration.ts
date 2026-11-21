import "server-only";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { accountingContext, type SearchParams } from "./reads";
import { integrationEventStatuses, integrationEvents } from "./integration-catalog";

/*
 * Phase 2B accounting integration reads. Every read authorizes first (accounting_read) and takes the
 * organization from the verified Clerk context. Not cached: queue state and ledger balances must be
 * current. Writes go through lib/accounting/integration-actions.ts only.
 */

const one = (raw: SearchParams, k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
const isDate = (v: string) => z.iso.date().safeParse(v).success;

async function integrationCan() {
  const ctx = await accountingContext();
  const me = (await db.execute<{ id: string }>(sql`SELECT id FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND clerk_user_id=${ctx.actor} AND status='active'`)).rows[0]?.id ?? null;
  return {
    ctx, me,
    can: {
      operate: ctx.can("accounting_integration_operate"),
      propose: ctx.can("accounting_manage"),
      approve: ctx.can("accounting_policy_approve"),
    },
  };
}

export type SettingsRow = {
  id: string; version: number; stage: string; control_accounts: Record<string, string>; status: string; note: string;
  proposed_by: string; proposed_by_id: string; proposed_at: string; decided_by: string | null; decided_at: string | null; decision_note: string | null;
};
export type EventListRow = {
  id: string; event_type: string; event_key: string; source_id: string; status: string; currency: string; amount: string; effective_date: string; posting_date: string | null;
  attempts: number; last_error_code: string | null; journal_id: string | null; journal_number: string | null; document: string | null; created_at: string; payload: Record<string, unknown>;
};

async function settings(org: string) {
  return (await db.execute<SettingsRow>(sql`SELECT s.id,s.version,s.stage,s.control_accounts,s.status,s.note,coalesce(p.display_name,p.clerk_user_id) AS proposed_by,s.proposed_by_id,s.proposed_at::text,
      coalesce(d.display_name,d.clerk_user_id) AS decided_by,s.decided_at::text,s.decision_note
    FROM accounting_integration_settings s
    LEFT JOIN staff_memberships p ON p.organization_id=s.organization_id AND p.id=s.proposed_by_id
    LEFT JOIN staff_memberships d ON d.organization_id=s.organization_id AND d.id=s.decided_by_id
    WHERE s.organization_id=${org} ORDER BY s.version DESC LIMIT 30`)).rows;
}

export async function readIntegrationWorkspace(raw: SearchParams) {
  const { ctx, me, can } = await integrationCan();
  const org = ctx.organizationId;
  const status = (integrationEventStatuses as readonly string[]).includes(one(raw, "status")) ? one(raw, "status") : "";
  const type = integrationEvents.some((e) => e.type === one(raw, "type")) ? one(raw, "type") : "";
  const attention = !status && one(raw, "view") !== "all";
  const page = Math.max(1, Math.min(1000, Number(one(raw, "page")) || 1));
  const where = [sql`e.organization_id=${org}`];
  if (status) where.push(sql`e.status=${status}`);
  else if (attention) where.push(sql`e.status IN ('blocked','failed','pending')`);
  if (type) where.push(sql`e.event_type=${type}`);
  const [hist, counts, codes, events, failures, policy, testDb] = await Promise.all([
    settings(org),
    db.execute<{ status: string; n: number }>(sql`SELECT status,count(*)::int AS n FROM accounting_integration_events WHERE organization_id=${org} GROUP BY status`),
    db.execute<{ code: string; n: number }>(sql`SELECT last_error_code AS code,count(*)::int AS n FROM accounting_integration_events WHERE organization_id=${org} AND status IN ('blocked','failed') GROUP BY last_error_code ORDER BY n DESC`),
    db.execute<EventListRow>(sql`SELECT e.id,e.event_type,e.event_key,e.source_id,e.status,e.currency,e.amount::text,e.effective_date::text,e.posting_date::text,e.attempts,e.last_error_code,
        e.journal_id,j.number AS journal_number,coalesce(e.payload->>'number',e.payload->>'receiptNumber',e.payload->>'invoiceNumber') AS document,e.created_at::text,e.payload
      FROM accounting_integration_events e LEFT JOIN accounting_journals j ON j.organization_id=e.organization_id AND j.id=e.journal_id
      WHERE ${sql.join(where, sql` AND `)} ORDER BY e.effective_date DESC, e.seq DESC LIMIT 51 OFFSET ${(page - 1) * 50}`),
    db.execute<{ id: string; event_type: string; source_id: string; error_code: string; created_at: string }>(sql`SELECT id,event_type,source_id,error_code,created_at::text FROM accounting_integration_capture_failures WHERE organization_id=${org} AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 20`),
    db.execute<{ version: number; functional_currency: string }>(sql`SELECT version,functional_currency FROM accounting_policy_versions WHERE organization_id=${org} AND status='approved'`),
    db.execute<{ t: boolean }>(sql`SELECT accounting_integration_test_database() AS t`),
  ]);
  const current = hist.find((s) => s.status === "approved") ?? null;
  return {
    can, me, current, proposal: hist.find((s) => s.status === "proposed") ?? null, history: hist,
    stage: (current?.stage ?? "disabled") as string,
    counts: Object.fromEntries(counts.rows.map((c) => [c.status, c.n])) as Record<string, number>,
    blockedCodes: codes.rows, events: events.rows.slice(0, 50), hasMore: events.rows.length > 50, page,
    filters: { status, type, attention },
    captureFailures: failures.rows, policy: policy.rows[0] ?? null, testDatabase: !!testDb.rows[0]?.t,
  };
}

export async function readIntegrationEvent(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const { ctx, can } = await integrationCan();
  const org = ctx.organizationId;
  const r = await db.execute<EventListRow & { source_table: string; occurred_at: string; depends_on: string[]; captured_by: string; capture_stage: string; last_error_detail: string | null;
    next_attempt_at: string | null; mapping_id: string | null; mapping_version: number | null; mapping_description: string | null; policy_version: number | null; resolution_note: string | null; processed_at: string | null; journal_entry_date: string | null }>(
    sql`SELECT e.id,e.event_type,e.event_key,e.source_id,e.source_table,e.status,e.currency,e.amount::text,e.effective_date::text,e.posting_date::text,e.occurred_at::text,e.attempts,
        e.last_error_code,e.last_error_detail,e.next_attempt_at::text,e.journal_id,j.number AS journal_number,j.entry_date::text AS journal_entry_date,
        coalesce(e.payload->>'number',e.payload->>'receiptNumber',e.payload->>'invoiceNumber') AS document,e.created_at::text,e.payload,e.depends_on,e.captured_by,e.capture_stage,
        e.mapping_id,e.mapping_version,m.description AS mapping_description,e.policy_version,e.resolution_note,e.processed_at::text
      FROM accounting_integration_events e
      LEFT JOIN accounting_journals j ON j.organization_id=e.organization_id AND j.id=e.journal_id
      LEFT JOIN accounting_event_mappings m ON m.organization_id=e.organization_id AND m.id=e.mapping_id
      WHERE e.organization_id=${org} AND e.id=${id}::uuid`);
  const event = r.rows[0];
  if (!event) notFound();
  const [attempts, deps, shadow, periods] = await Promise.all([
    db.execute<{ id: string; action: string; attempt: number; from_status: string | null; to_status: string | null; error_code: string | null; note: string | null; actor: string | null; worker: string | null; created_at: string }>(
      sql`SELECT a.id,a.action,a.attempt,a.from_status,a.to_status,a.error_code,a.note,coalesce(s.display_name,a.actor_clerk_user_id) AS actor,a.worker,a.created_at::text
        FROM accounting_integration_attempts a LEFT JOIN staff_memberships s ON s.organization_id=a.organization_id AND s.id=a.actor_staff_id
        WHERE a.organization_id=${org} AND a.event_id=${id}::uuid ORDER BY a.created_at,a.id`),
    db.execute<{ id: string; event_key: string; event_type: string; status: string; last_error_code: string | null }>(
      sql`SELECT d.id,d.event_key,d.event_type,d.status,d.last_error_code FROM accounting_integration_events e
        JOIN accounting_integration_events d ON d.organization_id=e.organization_id AND d.event_key = ANY(e.depends_on)
        WHERE e.organization_id=${org} AND e.id=${id}::uuid`),
    db.execute<{ line_number: number; account_code: string; debit: string; credit: string; entry_date: string; reversal: boolean }>(
      sql`SELECT line_number,account_code,debit::text,credit::text,entry_date::text,reversal FROM accounting_shadow_lines WHERE organization_id=${org} AND event_id=${id}::uuid ORDER BY line_number`),
    db.execute<{ start_date: string; end_date: string; name: string }>(sql`SELECT start_date::text,end_date::text,name FROM accounting_periods WHERE organization_id=${org} AND status='open' AND end_date>=${event.effective_date}::date ORDER BY start_date LIMIT 24`),
  ]);
  return { can, event, attempts: attempts.rows, dependencies: deps.rows, shadowLines: shadow.rows, openPeriods: periods.rows };
}

export type MappingRow = {
  id: string; event_type: string; version: number; status: string; description: string; conditions: Record<string, string>; treatment: string;
  definition: { lines?: { side: string; account: { code?: string; byDivision?: Record<string, string>; fallback?: string }; amount: string; memo?: string }[] };
  priority: number; policy_version: number | null; effective_from: string; proposed_by: string; proposed_by_id: string; proposed_at: string; decided_by: string | null; decided_at: string | null; decision_note: string | null;
};

export async function readMappingsPage() {
  const { ctx, me, can } = await integrationCan();
  const org = ctx.organizationId;
  const [mappings, accounts, today] = await Promise.all([
    db.execute<MappingRow>(sql`SELECT m.id,m.event_type,m.version,m.status,m.description,m.conditions,m.treatment,m.definition,m.priority,m.policy_version,m.effective_from::text,
        coalesce(p.display_name,p.clerk_user_id) AS proposed_by,m.proposed_by_id,m.proposed_at::text,coalesce(d.display_name,d.clerk_user_id) AS decided_by,m.decided_at::text,m.decision_note
      FROM accounting_event_mappings m
      LEFT JOIN staff_memberships p ON p.organization_id=m.organization_id AND p.id=m.proposed_by_id
      LEFT JOIN staff_memberships d ON d.organization_id=m.organization_id AND d.id=m.decided_by_id
      WHERE m.organization_id=${org} ORDER BY m.event_type, CASE m.status WHEN 'proposed' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, m.version DESC`),
    db.execute<{ code: string; name: string; status: string }>(sql`SELECT code,name,status FROM accounting_accounts WHERE organization_id=${org} AND is_postable ORDER BY code`),
    db.execute<{ d: string }>(sql`SELECT finance_kampala_today()::text AS d`),
  ]);
  return { can, me, mappings: mappings.rows, accounts: accounts.rows, today: today.rows[0].d };
}

export type ReconciliationRow = { check_key: string; currency: string; account_code: string | null; operational: string; ledger: string; unposted: string; difference: string; status: string };

export async function readReconciliationPage(raw: SearchParams) {
  const { ctx } = await integrationCan();
  const org = ctx.organizationId;
  const today = (await db.execute<{ d: string }>(sql`SELECT finance_kampala_today()::text AS d`)).rows[0].d;
  const stage = (await db.execute<{ s: string }>(sql`SELECT accounting_integration_stage(${org}) AS s`)).rows[0].s;
  const asOf = isDate(one(raw, "asOf")) ? one(raw, "asOf") : today;
  const mode = one(raw, "mode") === "shadow" || one(raw, "mode") === "ledger" ? one(raw, "mode") : stage === "shadow" ? "shadow" : "ledger";
  const [rows, controls, periods] = await Promise.all([
    db.execute<ReconciliationRow>(sql`SELECT check_key,currency,account_code,operational::text,ledger::text,unposted::text,difference::text,status FROM accounting_integration_reconciliation(${org},${asOf}::date,${mode})`),
    db.execute<{ c: Record<string, string> | null }>(sql`SELECT control_accounts AS c FROM accounting_integration_settings WHERE organization_id=${org} AND status='approved'`),
    db.execute<{ name: string; end_date: string; status: string }>(sql`SELECT name,end_date::text,status FROM accounting_periods WHERE organization_id=${org} AND end_date<=${today}::date ORDER BY end_date DESC LIMIT 12`),
  ]);
  return { asOf, mode, stage, today, rows: rows.rows, controls: controls.rows[0]?.c ?? {}, periods: periods.rows };
}
