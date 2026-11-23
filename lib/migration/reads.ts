import "server-only";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { financeContext } from "@/lib/finance/context";

/* Phase 2F migration staging reads: migration_prepare or migration_approve, organization from the verified session. */

async function migrationContext() {
  const ctx = await financeContext(["migration_prepare", "migration_approve"]);
  const me = (await db.execute<{ id: string }>(sql`SELECT id FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND clerk_user_id=${ctx.actor} AND status='active'`)).rows[0]?.id ?? null;
  return { ctx, me, can: { prepare: ctx.can("migration_prepare"), approve: ctx.can("migration_approve") } };
}

export type BatchRow = { id: string; source_system: string; source_description: string; cutoff_date: string; evidence_reference: string; status: string; version: number;
  prepared_by: string; prepared_by_id: string; submitted_by_id: string | null; decided_by: string | null; decision_note: string | null; rows: number; prepared_at: string };

export async function readMigration() {
  const { ctx, me, can } = await migrationContext();
  const batches = await db.execute<BatchRow>(sql`
    SELECT b.id,b.source_system,b.source_description,b.cutoff_date::text,b.evidence_reference,b.status,b.version,coalesce(p.display_name,p.clerk_user_id) AS prepared_by,b.prepared_by_id,b.submitted_by_id,
      coalesce(x.display_name,x.clerk_user_id) AS decided_by,b.decision_note,(SELECT count(*)::int FROM migration_rows r WHERE r.organization_id=b.organization_id AND r.batch_id=b.id) AS rows,b.prepared_at::text
    FROM migration_batches b LEFT JOIN staff_memberships p ON p.organization_id=b.organization_id AND p.id=b.prepared_by_id LEFT JOIN staff_memberships x ON x.organization_id=b.organization_id AND x.id=b.decided_by_id
    WHERE b.organization_id=${ctx.organizationId} ORDER BY b.prepared_at DESC LIMIT 50`);
  return { can, me, batches: batches.rows };
}

export async function readMigrationBatch(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const { ctx, me, can } = await migrationContext();
  const org = ctx.organizationId;
  const batch = (await db.execute<BatchRow & { validation: unknown }>(sql`
    SELECT b.id,b.source_system,b.source_description,b.cutoff_date::text,b.evidence_reference,b.status,b.version,coalesce(p.display_name,p.clerk_user_id) AS prepared_by,b.prepared_by_id,b.submitted_by_id,
      coalesce(x.display_name,x.clerk_user_id) AS decided_by,b.decision_note,0 AS rows,b.prepared_at::text,b.validation
    FROM migration_batches b LEFT JOIN staff_memberships p ON p.organization_id=b.organization_id AND p.id=b.prepared_by_id LEFT JOIN staff_memberships x ON x.organization_id=b.organization_id AND x.id=b.decided_by_id
    WHERE b.organization_id=${org} AND b.id=${id}::uuid`)).rows[0];
  if (!batch) notFound();
  const [rows, live, events] = await Promise.all([
    db.execute<{ row_kind: string; source_ref: string; source_account: string | null; code: string | null; name: string | null; counterparty: string | null; document_number: string | null; currency: string; amount: string }>(sql`
      SELECT r.row_kind,r.source_ref,r.source_account,a.code,a.name,r.counterparty,r.document_number,r.currency,r.amount::text FROM migration_rows r
      LEFT JOIN accounting_accounts a ON a.organization_id=r.organization_id AND a.id=r.account_id WHERE r.organization_id=${org} AND r.batch_id=${id}::uuid ORDER BY r.row_kind,r.source_ref LIMIT 2000`),
    db.execute<{ r: unknown }>(sql`SELECT migration_batch_validate(${org},${id}::uuid) AS r`),
    db.execute<{ id: string; action: string; note: string | null; actor: string; created_at: string }>(sql`SELECT e.id,e.action,e.note,coalesce(s.display_name,e.actor_clerk_user_id) AS actor,e.created_at::text
      FROM migration_events e LEFT JOIN staff_memberships s ON s.organization_id=e.organization_id AND s.id=e.actor_staff_id WHERE e.organization_id=${org} AND e.batch_id=${id}::uuid ORDER BY e.created_at DESC`),
  ]);
  return { can, me, batch, rows: rows.rows, validation: live.rows[0].r as { checks: { key: string; label: string; status: string; count: number; detail: unknown[] }[]; ready: boolean }, events: events.rows };
}
