import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { matchesDigest, referenceDigest } from "@/lib/documents/verification-crypto";

const response = (data: object, status = 200) => Response.json(data, { status, headers: {
  "Cache-Control": "no-store, private, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
} });

/**
 * Files never leave the visitor's device: the page hashes the PDF locally (any size) and sends only
 * its SHA-256. Request bodies are refused so documents cannot be uploaded here by mistake.
 */
async function hasBody(request: Request) {
  const declared = request.headers.get("content-length");
  if ((declared !== null && declared !== "0") || request.headers.has("transfer-encoding")) {
    await request.body?.cancel().catch(() => {});
    return true;
  }
  if (!request.body) return false;
  const reader = request.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return false;
      if (value?.length) { await reader.cancel().catch(() => {}); return true; }
    }
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  // The client IP must come from a header the edge overwrites: Vercel's x-real-ip (only when the
  // function actually runs on Vercel), or Cloudflare's cf-connecting-ip behind a Cloudflare-only origin.
  const secret = process.env.CALACOT_VERIFICATION_RATE_SECRET;
  const ip = process.env.CALACOT_VERIFICATION_TRUST_VERCEL === "true" && process.env.VERCEL === "1" ? request.headers.get("x-real-ip")
    : process.env.CALACOT_VERIFICATION_TRUST_CLOUDFLARE === "true" ? request.headers.get("cf-connecting-ip") : null;
  if (process.env.CALACOT_VERIFICATION_ENABLED !== "true" || !secret || secret.length < 32 || !ip || !isIP(ip))
    return response({ error: "unavailable" }, 503);
  try {
    const key = "verification/ip/" + createHmac("sha256", secret).update(ip).digest("hex");
    const counts = await db.execute<{ key: string; count: number }>(sql`
      INSERT INTO sales_rate_limits(key,count,expires_at) VALUES (${key},1,now()+interval '1 minute'),('verification/global',1,now()+interval '1 minute')
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN sales_rate_limits.expires_at<now() THEN 1 ELSE sales_rate_limits.count+1 END,
        expires_at=CASE WHEN sales_rate_limits.expires_at<now() THEN now()+interval '1 minute' ELSE sales_rate_limits.expires_at END
      RETURNING key,count`);
    if (counts.rows.some((r) => r.count > (r.key === "verification/global" ? 600 : 30))) return response({ error: "rate_limited" }, 429);
    if (await hasBody(request)) return response({ error: "body_not_accepted" }, 413);
    const fileDigest = request.headers.get("x-verification-sha256");
    if (fileDigest !== null && !/^[0-9a-f]{64}$/.test(fileDigest)) return response({ error: "invalid_digest" }, 400);
    const digest = referenceDigest(request.headers.get("x-verification-reference") || "");
    if (!digest) return response({ found: false });
    const rows = await db.execute<{ document_type: string; document_number: string; issuer_name: string; issued_at: string; pdf_sha256: string; status: string | null; source_status: string | null; valid_until: string | null }>(sql`
      SELECT v.document_type,v.document_number,v.issuer_name,v.issued_at::text,v.pdf_sha256,
        (SELECT e.status FROM verification_status_events e WHERE e.organization_id=v.organization_id AND e.issuance_id=v.id ORDER BY e.sequence DESC LIMIT 1) AS status,
        CASE v.document_type WHEN 'invoice' THEN i.status ELSE q.status END AS source_status,q.valid_until::text
      FROM verification_issuances v
      LEFT JOIN document_links l ON l.document_id=v.document_id AND l.organization_id=v.organization_id
      LEFT JOIN invoices i ON i.id=l.invoice_id AND i.organization_id=l.organization_id
      LEFT JOIN quotation_versions q ON q.id=l.quotation_version_id AND q.organization_id=l.organization_id
      WHERE v.reference_hash=${digest} AND ((v.document_type='invoice' AND i.id IS NOT NULL) OR (v.document_type='quotation' AND q.id IS NOT NULL)) LIMIT 1`);
    const record = rows.rows[0];
    if (!record) return response({ found: false });
    if (!record.status || !record.source_status) throw new Error("invalid_issuance_state");
    let status = record.status;
    if (status === "issued") {
      if (record.source_status === "void") status = "voided";
      else if (record.source_status === "superseded") status = "superseded";
      else if (record.source_status === "declined") status = "withdrawn";
      else if (record.source_status === "expired" || (record.source_status === "sent" && record.valid_until && new Date(record.valid_until).getTime() <= Date.now())) status = "expired";
      else if (!["issued", "sent", "accepted"].includes(record.source_status)) throw new Error("invalid_source_status");
    }
    return response({ found: true, type: record.document_type, number: record.document_number, issuer: record.issuer_name, issuedAt: record.issued_at, status,
      integrity: fileDigest ? (matchesDigest(fileDigest, record.pdf_sha256) ? "match" : "mismatch") : "not_checked" });
  } catch {
    return response({ error: "unavailable" }, 503);
  }
}
