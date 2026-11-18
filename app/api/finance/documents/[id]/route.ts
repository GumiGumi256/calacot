import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { loadPrivateObject } from "@/lib/sales/storage";

export const runtime = "nodejs";

/** Streams an expense document to staff who may read that expense. Never public or cached. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  let ctx: Awaited<ReturnType<typeof staffContext>>;
  try { ctx = await staffContext(); } catch { return new Response("Not found", { status: 404 }); }
  const canReadAll = ctx.permissions.includes("expenses_read");
  const r = await db.execute<{ storage_key: string; mime_type: string; name: string }>(sql`SELECT doc.storage_key,doc.mime_type,doc.name FROM documents doc
    JOIN document_links l ON l.document_id=doc.id AND l.organization_id=doc.organization_id AND l.expense_id IS NOT NULL
    JOIN expenses e ON e.id=l.expense_id AND e.organization_id=l.organization_id
    WHERE doc.id=${id}::uuid AND doc.organization_id=${ctx.organizationId} AND doc.archived_at IS NULL
      AND (${canReadAll} OR e.requested_by_id=(SELECT s.id FROM staff_memberships s WHERE s.organization_id=${ctx.organizationId} AND s.clerk_user_id=${ctx.actor} AND s.status='active'))`);
  const doc = r.rows[0];
  if (!doc) return new Response("Not found", { status: 404 });
  try {
    const bytes = await loadPrivateObject(doc.storage_key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": doc.mime_type,
        "Content-Disposition": `inline; filename="${doc.name.replace(/[^\w .()-]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return new Response("Document unavailable", { status: 404 });
  }
}
