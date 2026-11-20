import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { loadPrivateObject } from "@/lib/sales/storage";
import { documentAccessPredicate } from "@/lib/documents/access";
import { inlineTypes, safeFileName } from "@/lib/documents/files";

export const runtime = "nodejs";

/**
 * Streams one document version to a user who may read every record it is linked to.
 * Membership is re-verified with Clerk on every download (no cache), so removed, demoted or
 * suspended staff lose access immediately; downloads fail closed while Clerk is unreachable.
 * Downloads are audited; responses are private, never cached and sandboxed.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  let ctx: Awaited<ReturnType<typeof staffContext>>;
  // Fresh live check on every download: removal or demotion takes effect immediately.
  try { ctx = await staffContext("documents_read", "fresh"); } catch { return new Response("Not found", { status: 404 }); }
  const org = ctx.organizationId;
  const doc = (await db.execute<{ id: string; root: string; storage_key: string; mime_type: string; name: string; version: number }>(sql`SELECT d.id,coalesce(d.family_id,d.id) AS root,d.storage_key,d.mime_type,d.name,d.version FROM documents d WHERE d.id=${id}::uuid AND d.organization_id=${org} AND ${documentAccessPredicate(ctx, sql`coalesce(d.family_id,d.id)`)}`)).rows[0];
  if (!doc) return new Response("Not found", { status: 404 });
  let bytes: Buffer;
  try { bytes = await loadPrivateObject(doc.storage_key); } catch { return new Response("Document unavailable", { status: 404 }); }
  await db.execute(sql`INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) VALUES(${org},${ctx.actor},'staff','document.download','document',${doc.root},${JSON.stringify({ documentId: doc.id, version: doc.version })}::jsonb,${randomUUID()})`);
  const name = safeFileName(doc.name, doc.mime_type);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mime_type,
      "Content-Disposition": `${inlineTypes.has(doc.mime_type) ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
