import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { loadPdf } from "@/lib/sales/storage";
export const runtime = "nodejs";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token))
    return new Response("Not found", { status: 404 });
  const hash = createHash("sha256").update(token).digest("hex");
  const d = (
    await db.execute<{ storage_key: string; sha256: string }>(
      sql`SELECT d.storage_key,d.sha256 FROM document_shares s JOIN documents d ON d.id=s.document_id AND d.organization_id=s.organization_id WHERE s.token_hash=${hash} AND s.expires_at>now() AND s.revoked_at IS NULL AND d.archived_at IS NULL`,
    )
  ).rows[0];
  if (!d) return new Response("Link expired or unavailable", { status: 404 });
  try {
    const b = await loadPdf(d.storage_key);
    if (createHash("sha256").update(b).digest("hex") !== d.sha256)
      throw new Error();
    return new Response(new Uint8Array(b), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=calacot-document.pdf",
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Document temporarily unavailable", { status: 503 });
  }
}
