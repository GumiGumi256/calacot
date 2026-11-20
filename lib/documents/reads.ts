import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { notFound } from "next/navigation";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { literalSearch, parseQuery } from "@/lib/sales/contracts";
import { canWriteLink, documentAccessPredicate, linkTypes, type DocumentContext, type LinkType } from "./access";
import { cacheKeyContext, adminCache } from "@/lib/cache-tags";

type Raw = Record<string, string | string[] | undefined>;
const one = (raw: Raw, k: string) => (typeof raw[k] === "string" ? (raw[k] as string).slice(0, 200) : "");
export const documentKinds = ["contract", "drawing", "brief", "property_document", "other", "permit", "photo", "report", "policy", "staff_record", "quotation", "invoice", "receipt", "expense_receipt"] as const;
export const uploadKinds = ["contract", "drawing", "brief", "permit", "photo", "report", "policy", "staff_record", "property_document", "other"] as const;

/** Label and admin URL of the record a family root is linked to. */
const recordColumns = sql`
  CASE WHEN l.client_id IS NOT NULL THEN 'client' WHEN l.project_id IS NOT NULL THEN 'project' WHEN l.task_id IS NOT NULL THEN 'task'
       WHEN l.milestone_id IS NOT NULL THEN 'milestone' WHEN l.staff_id IS NOT NULL THEN 'staff' WHEN l.company_record THEN 'company'
       WHEN l.expense_id IS NOT NULL THEN 'expense' WHEN l.invoice_id IS NOT NULL THEN 'invoice' WHEN l.quotation_version_id IS NOT NULL THEN 'quotation'
       WHEN l.property_id IS NOT NULL THEN 'property' ELSE 'none' END AS record_type,
  coalesce(c.display_name, p.code||' '||p.name, tk.title||' ('||tp.code||')', ms.title||' ('||mp.code||')', coalesce(st.display_name,st.email,st.clerk_user_id), CASE WHEN l.company_record THEN 'Company records' END,
           ex.description, iv.number, qv_q.number, 'Unlinked') AS record_label,
  CASE WHEN l.client_id IS NOT NULL THEN '/admin/clients/'||l.client_id WHEN l.project_id IS NOT NULL THEN '/admin/projects/'||l.project_id
       WHEN l.task_id IS NOT NULL THEN '/admin/projects/'||tk.project_id WHEN l.milestone_id IS NOT NULL THEN '/admin/projects/'||ms.project_id
       WHEN l.staff_id IS NOT NULL THEN '/admin/staff/'||st.clerk_user_id WHEN l.company_record THEN '/admin/settings'
       WHEN l.expense_id IS NOT NULL THEN '/admin/expenses/'||l.expense_id WHEN l.invoice_id IS NOT NULL THEN '/admin/invoices/'||l.invoice_id
       WHEN l.quotation_version_id IS NOT NULL THEN '/admin/quotations/'||qv.quotation_id END AS record_href`;
const recordJoins = (org: string) => sql`
  LEFT JOIN LATERAL (SELECT * FROM document_links dl WHERE dl.organization_id=${org} AND dl.document_id=f.root ORDER BY dl.created_at,dl.id LIMIT 1) l ON true
  LEFT JOIN clients c ON c.id=l.client_id AND c.organization_id=${org}
  LEFT JOIN projects p ON p.id=l.project_id AND p.organization_id=${org}
  LEFT JOIN tasks tk ON tk.id=l.task_id AND tk.organization_id=${org} LEFT JOIN projects tp ON tp.id=tk.project_id AND tp.organization_id=${org}
  LEFT JOIN project_milestones ms ON ms.id=l.milestone_id AND ms.organization_id=${org} LEFT JOIN projects mp ON mp.id=ms.project_id AND mp.organization_id=${org}
  LEFT JOIN staff_memberships st ON st.id=l.staff_id AND st.organization_id=${org}
  LEFT JOIN expenses ex ON ex.id=l.expense_id AND ex.organization_id=${org}
  LEFT JOIN invoices iv ON iv.id=l.invoice_id AND iv.organization_id=${org}
  LEFT JOIN quotation_versions qv ON qv.id=l.quotation_version_id AND qv.organization_id=${org} LEFT JOIN quotations qv_q ON qv_q.id=qv.quotation_id AND qv_q.organization_id=${org}`;

/** Latest version of each document family the user may read. */
function familiesBase(ctx: DocumentContext) {
  const org = ctx.organizationId;
  return sql`SELECT f.*,${recordColumns},coalesce(u.display_name,u.email,f.created_by_clerk_user_id,'System') AS uploader,document_is_financial(${org},f.root) AS financial,
      (SELECT count(*)::int FROM documents v WHERE v.organization_id=${org} AND coalesce(v.family_id,v.id)=f.root) AS versions,
      coalesce(p.id,tk.project_id,ms.project_id) AS project_id
    FROM (SELECT DISTINCT ON (coalesce(d.family_id,d.id)) d.id,coalesce(d.family_id,d.id) AS root,d.name,d.kind,d.mime_type,d.size_bytes::text AS size_bytes,d.version,
            d.created_at,d.created_by_clerk_user_id,d.archived_at,d.archive_reason
          FROM documents d WHERE d.organization_id=${org} ORDER BY coalesce(d.family_id,d.id),d.version DESC,d.created_at DESC) f
    ${recordJoins(org)}
    LEFT JOIN staff_memberships u ON u.organization_id=${org} AND u.clerk_user_id=f.created_by_clerk_user_id
    WHERE ${documentAccessPredicate(ctx, sql`f.root`)}`;
}

export type DocumentRow = { id: string; root: string; name: string; kind: string; mime_type: string; size_bytes: string; version: number; created_at: string; archived_at: string | null; archive_reason: string | null; record_type: string; record_label: string; record_href: string | null; uploader: string; financial: boolean; versions: number; project_id: string | null };

export async function readDocuments(raw: Raw) {
  const ctx = await staffContext("documents_read");
  return cachedReadDocuments(cacheKeyContext(ctx), raw);
}
/** Cached per organization, caller context and inputs; expired on writes (lib/cache-tags.ts). */
async function cachedReadDocuments(ctx: Awaited<ReturnType<typeof staffContext>>, raw: Raw) {
  "use cache: remote";
  adminCache(ctx.organizationId);
  const q = parseQuery(raw);
  const kind = documentKinds.includes(one(raw, "kind") as never) ? one(raw, "kind") : "";
  const record = [...linkTypes, "expense", "invoice", "quotation"].includes(one(raw, "record")) ? one(raw, "record") : "";
  const status = ["active", "archived"].includes(one(raw, "status")) ? one(raw, "status") : "active";
  const projectId = z.uuid().safeParse(one(raw, "projectId")).success ? one(raw, "projectId") : "";
  const where: SQL[] = [];
  if (q.search) where.push(sql`(b.name ILIKE ${literalSearch(q.search)} OR b.record_label ILIKE ${literalSearch(q.search)})`);
  if (kind) where.push(sql`b.kind=${kind}`);
  if (record) where.push(sql`b.record_type=${record}`);
  if (projectId) where.push(sql`b.project_id=${projectId}::uuid`);
  where.push(status === "archived" ? sql`b.archived_at IS NOT NULL` : sql`b.archived_at IS NULL`);
  if (q.from) where.push(sql`b.created_at>=${q.from}::date`);
  if (q.to) where.push(sql`b.created_at<${q.to}::date+interval '1 day'`);
  const filtered = sql`SELECT * FROM (${familiesBase(ctx)}) b WHERE ${sql.join(where, sql` AND `)}`;
  const total = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM (${filtered}) x`)).rows[0]?.n ?? 0;
  const page = Math.min(q.page, Math.max(1, Math.ceil(total / q.size)));
  const rows = await db.execute<DocumentRow>(sql`${filtered} ORDER BY b.created_at DESC,b.id LIMIT ${q.size} OFFSET ${(page - 1) * q.size}`);
  return { rows: rows.rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })), total, page, size: q.size, filters: { search: q.search, kind, record, status, projectId, from: q.from, to: q.to }, can: { write: ctx.permissions.includes("documents_write"), archive: ctx.permissions.includes("documents_archive") } };
}

export async function readDocumentDetail(id: string) {
  const ctx = await staffContext("documents_read");
  if (!z.uuid().safeParse(id).success) notFound();
  const org = ctx.organizationId;
  const doc = (await db.execute<{ root: string }>(sql`SELECT coalesce(family_id,id) AS root FROM documents WHERE id=${id}::uuid AND organization_id=${org}`)).rows[0];
  if (!doc) notFound();
  const fam = (await db.execute<DocumentRow>(sql`SELECT * FROM (${familiesBase(ctx)}) b WHERE b.root=${doc.root}::uuid`)).rows[0];
  if (!fam) notFound(); // not permitted for this user
  const [versions, history] = await Promise.all([
    db.execute<{ id: string; version: number; name: string; size_bytes: string; mime_type: string; sha256: string | null; created_at: string; uploader: string }>(sql`SELECT d.id,d.version,d.name,d.size_bytes::text AS size_bytes,d.mime_type,d.sha256,d.created_at::text AS created_at,coalesce(u.display_name,u.email,d.created_by_clerk_user_id,'System') AS uploader FROM documents d LEFT JOIN staff_memberships u ON u.organization_id=d.organization_id AND u.clerk_user_id=d.created_by_clerk_user_id WHERE d.organization_id=${org} AND coalesce(d.family_id,d.id)=${doc.root}::uuid ORDER BY d.version DESC,d.created_at DESC LIMIT 100`),
    db.execute<{ action: string; actor: string; created_at: string; changes: Record<string, unknown> }>(sql`SELECT a.action,coalesce(s.display_name,a.actor_clerk_user_id,'System') AS actor,a.created_at::text AS created_at,a.changes FROM audit_logs a LEFT JOIN staff_memberships s ON s.organization_id=a.organization_id AND s.clerk_user_id=a.actor_clerk_user_id WHERE a.organization_id=${org} AND a.entity_type='document' AND (a.entity_id=${doc.root} OR a.entity_id IN (SELECT id::text FROM documents WHERE organization_id=${org} AND coalesce(family_id,id)=${doc.root}::uuid)) ORDER BY a.created_at DESC LIMIT 50`),
  ]);
  const linkType = fam.record_type as LinkType;
  const writable = (linkTypes as readonly string[]).includes(fam.record_type) && canWriteLink(ctx, linkType);
  // Only when the feature (and therefore migration 0017) is enabled. Never exposes the reference.
  const verification = process.env.CALACOT_VERIFICATION_ENABLED === "true" && ["quotation", "invoice"].includes(fam.kind)
    ? (await db.execute<{ kind: "legacy" | "embedded"; status: string; registered_at: string; pdf_sha256: string; document_number: string }>(sql`
        SELECT v.registration_kind AS kind,(SELECT e.status FROM verification_status_events e WHERE e.organization_id=v.organization_id AND e.issuance_id=v.id ORDER BY e.sequence DESC LIMIT 1) AS status,
          v.registered_at::text AS registered_at,v.pdf_sha256,v.document_number
        FROM verification_issuances v JOIN documents d ON d.id=v.document_id AND d.organization_id=v.organization_id
        WHERE v.organization_id=${org} AND coalesce(d.family_id,d.id)=${doc.root}::uuid ORDER BY v.registered_at DESC LIMIT 1`)).rows[0] ?? null
    : undefined;
  return { verification, doc: { ...fam, created_at: new Date(fam.created_at).toISOString() }, versions: versions.rows, history: history.rows, can: { revise: !fam.financial && !fam.archived_at && !!writable, archive: !fam.financial && !fam.archived_at && ctx.permissions.includes("documents_archive"), verificationIssue: ctx.permissions.includes("verification_issue"), verificationRevoke: ctx.permissions.includes("verification_revoke") } };
}

/** Records a user may attach a new document to (bounded lists). */
export async function uploadTargets() {
  const ctx = await staffContext("documents_write");
  const org = ctx.organizationId;
  const allowed = Object.fromEntries(linkTypes.map((t) => [t, canWriteLink(ctx, t)])) as Record<LinkType, boolean>;
  const empty = Promise.resolve({ rows: [] as { id: string; label: string }[] });
  const [clients, projects, tasks, milestones, staff] = await Promise.all([
    allowed.client ? db.execute<{ id: string; label: string }>(sql`SELECT id,display_name AS label FROM clients WHERE organization_id=${org} AND archived_at IS NULL ORDER BY display_name,id LIMIT 300`) : empty,
    allowed.project ? db.execute<{ id: string; label: string }>(sql`SELECT id,code||' '||name AS label FROM projects WHERE organization_id=${org} AND archived_at IS NULL ORDER BY code,id LIMIT 300`) : empty,
    allowed.task ? db.execute<{ id: string; label: string }>(sql`SELECT t.id,p.code||': '||t.title AS label FROM tasks t JOIN projects p ON p.id=t.project_id AND p.organization_id=t.organization_id WHERE t.organization_id=${org} AND p.archived_at IS NULL AND t.status NOT IN ('completed','cancelled') ORDER BY p.code,t.title,t.id LIMIT 300`) : empty,
    allowed.milestone ? db.execute<{ id: string; label: string }>(sql`SELECT m.id,p.code||': '||m.title AS label FROM project_milestones m JOIN projects p ON p.id=m.project_id AND p.organization_id=m.organization_id WHERE m.organization_id=${org} AND p.archived_at IS NULL ORDER BY p.code,m.position,m.id LIMIT 300`) : empty,
    allowed.staff ? db.execute<{ id: string; label: string }>(sql`SELECT id,coalesce(display_name,email,clerk_user_id) AS label FROM staff_memberships WHERE organization_id=${org} ORDER BY label,id LIMIT 300`) : empty,
  ]);
  return { allowed, targets: { client: clients.rows, project: projects.rows, task: tasks.rows, milestone: milestones.rows, staff: staff.rows, company: allowed.company ? [{ id: "company", label: "Company records" }] : [] } };
}

/** Documents linked to one record (or a project's tasks/milestones), for business workspaces. */
export async function documentsForRecord(ctx: DocumentContext, type: "client" | "project", id: string) {
  if (!ctx.permissions.includes("documents_read")) return null;
  const match = type === "client" ? sql`b.record_type='client' AND b.record_href=${"/admin/clients/" + id}` : sql`b.project_id=${id}::uuid`;
  return (await db.execute<DocumentRow>(sql`SELECT * FROM (${familiesBase(ctx)}) b WHERE b.archived_at IS NULL AND ${match} ORDER BY b.created_at DESC LIMIT 50`)).rows;
}
