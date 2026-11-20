import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { storePrivateObject } from "@/lib/sales/storage";
import { financeError, financeMessages } from "@/lib/finance/context";
import { canWriteLink, documentAccessPredicate, linkTypes, type LinkType } from "@/lib/documents/access";
import { detectDocumentType, documentMaxBytes, safeFileName } from "@/lib/documents/files";
import { uploadKinds } from "@/lib/documents/reads";

export const runtime = "nodejs";
const reply = (status: number, message: string, id?: string) => Response.json({ ok: status === 200, message, id }, { status, headers: { "Cache-Control": "no-store" } });
const messages: Record<string, string> = {
  financial_document_immutable: "Quotations, invoices, receipts and expense evidence are managed in their own workflows and cannot be revised or archived here.",
  document_revision_conflict: "Someone uploaded a newer version first. Refresh to see it before uploading another.",
  document_archived: "This document is archived and cannot be revised.",
  document_unavailable: "This document is unavailable.",
  document_link_unavailable: "The selected record is unavailable or archived.",
  document_link_required: "Choose the record this document belongs to.",
  invalid_document_kind: "Choose a document category.",
};

/** Upload a new document (with one relationship) or a new version of an existing one. */
export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof staffContext>>;
  try { ctx = await staffContext("documents_write", "fresh"); } catch { return reply(404, "Not found"); }
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  let originHost = "";
  try { originHost = origin ? new URL(origin).host : ""; } catch { /* rejected below */ }
  if (!origin || originHost !== host) return reply(403, financeMessages.origin_denied);
  if (Number(request.headers.get("content-length") || 0) > documentMaxBytes + 64 * 1024) return reply(413, "Files must be 20 MB or smaller.");
  let form: FormData;
  try { form = await request.formData(); } catch { return reply(400, "Upload could not be read."); }
  const file = form.get("file");
  const fields = z.object({
    documentId: z.uuid(), name: z.string().trim().max(200).default(""), supersedesId: z.union([z.uuid(), z.literal("")]).default(""),
    kind: z.union([z.enum(uploadKinds), z.literal("")]).default(""), linkType: z.union([z.enum(linkTypes), z.literal("")]).default(""), linkId: z.string().max(64).default(""),
  }).safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!(file instanceof File) || !fields.success) return reply(400, "Choose a file and complete the required fields.");
  const p = fields.data;
  if (file.size <= 0 || file.size > documentMaxBytes) return reply(400, "Files must be 20 MB or smaller.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = detectDocumentType(bytes, file.name);
  if (!mimeType) return reply(400, "Upload a PDF, JPEG, PNG, WebP, Word (.docx) or Excel (.xlsx) file. Macro-enabled and legacy formats are not accepted.");
  const org = ctx.organizationId;
  // Authorization before anything is written to storage; the database re-validates.
  if (p.supersedesId) {
    const fam = (await db.execute<{ root: string; record_type: string | null }>(sql`SELECT coalesce(d.family_id,d.id) AS root,(SELECT CASE WHEN l.client_id IS NOT NULL THEN 'client' WHEN l.project_id IS NOT NULL THEN 'project' WHEN l.task_id IS NOT NULL THEN 'task' WHEN l.milestone_id IS NOT NULL THEN 'milestone' WHEN l.staff_id IS NOT NULL THEN 'staff' WHEN l.company_record THEN 'company' END FROM document_links l WHERE l.organization_id=d.organization_id AND l.document_id=coalesce(d.family_id,d.id) ORDER BY l.created_at LIMIT 1) AS record_type FROM documents d WHERE d.id=${p.supersedesId}::uuid AND d.organization_id=${org}`)).rows[0];
    if (!fam) return reply(404, "Not found");
    const visible = await db.execute(sql`SELECT 1 WHERE ${documentAccessPredicate(ctx, sql`${fam.root}::uuid`)}`);
    if (!visible.rows.length) return reply(404, "Not found");
    if (!fam.record_type || !canWriteLink(ctx, fam.record_type as LinkType)) return reply(409, messages.financial_document_immutable);
  } else {
    if (!p.kind || !p.linkType) return reply(400, "Choose a category and the record this document belongs to.");
    if (!canWriteLink(ctx, p.linkType)) return reply(404, "Not found");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  // Content-addressed key, and never write storage for an id that already exists (in any
  // organization): an existing version's stored bytes can never be replaced.
  const storageKey = `documents/${p.documentId}/${sha256}`;
  const existing = (await db.execute<{ organization_id: string; sha256: string | null; version: number }>(sql`SELECT organization_id,sha256,version FROM documents WHERE id=${p.documentId}::uuid`)).rows[0];
  if (existing) {
    if (existing.organization_id === org && existing.sha256 === sha256) return reply(200, "Already uploaded.", p.documentId);
    return reply(409, "This upload conflicts with an existing document. Refresh and try again.");
  }
  const name = safeFileName(p.name || file.name, mimeType);
  const correlation = randomUUID();
  try {
    await storePrivateObject(storageKey, bytes, mimeType, documentMaxBytes);
    const r = await db.execute<{ result: { id: string; version: number; already: boolean } }>(sql`SELECT document_upload(${org},${ctx.actor},${JSON.stringify({ documentId: p.documentId, name, kind: p.kind, linkType: p.linkType, linkId: p.linkType === "company" ? "" : p.linkId, supersedesId: p.supersedesId, storageKey, mimeType, sizeBytes: bytes.length, sha256 })}::jsonb,${correlation}) AS result`);
    revalidatePath("/admin/documents", "layout");
    const result = r.rows[0].result;
    return reply(200, result.already ? "Already uploaded." : result.version > 1 ? `Version ${result.version} uploaded.` : "Document uploaded.", result.id);
  } catch (e) {
    const code = financeError(e) ?? Object.keys(messages).find((k) => String(e instanceof Error ? `${e.message} ${e.cause instanceof Error ? e.cause.message : ""}` : e).includes(k));
    console.error("document_upload_failed", { correlation, code: code ?? "unexpected" });
    const message = code ? messages[code] ?? financeMessages[code] : undefined;
    return reply(message ? 409 : 500, message ?? "The document could not be stored. Try again.");
  }
}
