import "server-only";
import { createHash, createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { renderCommercialPdf } from "./pdf";
import { storePdf, loadPdf } from "./storage";
import type { DocumentSnapshot } from "./document-model";
export async function finalArtifact(
  org: string,
  entity: "quotation" | "invoice",
  id: string,
  d: DocumentSnapshot,
) {
  const key = `commercial/${createHash("sha256").update(org).digest("hex").slice(0, 24)}/${entity}/${id}/calacot-commercial-v1.pdf`;
  let record = (
    await db.execute<{ id: string; sha256: string; storage_key: string }>(
      sql`SELECT id,sha256,storage_key FROM documents WHERE organization_id=${org} AND storage_key=${key}`,
    )
  ).rows[0];
  if (!record) {
    // Rendering is deterministic from immutable snapshots; an upload interrupted before registration is recovered by key.
    let bytes: Buffer;
    try {
      bytes = await loadPdf(key);
    } catch (e) {
      if (
        e instanceof Error &&
        !e.message.includes("artifact_missing") &&
        !("code" in e && e.code === "ENOENT")
      )
        throw e;
      bytes = await renderCommercialPdf(d);
      await storePdf(key, bytes);
    }
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const r = await db.execute<{
      id: string;
      sha256: string;
      storage_key: string;
    }>(
      sql`WITH doc AS (INSERT INTO documents(organization_id,name,kind,storage_key,mime_type,size_bytes,sha256,version) VALUES(${org},${d.number + ".pdf"},${entity},${key},'application/pdf',${bytes.length},${checksum},1) ON CONFLICT(organization_id,storage_key) DO UPDATE SET storage_key=excluded.storage_key RETURNING *), link AS (INSERT INTO document_links(organization_id,document_id,quotation_version_id,invoice_id) SELECT ${org},id,${entity === "quotation" ? id : null}::uuid,${entity === "invoice" ? id : null}::uuid FROM doc WHERE NOT EXISTS(SELECT 1 FROM document_links l WHERE l.organization_id=${org} AND l.document_id=doc.id)) SELECT id,sha256,storage_key FROM doc`,
    );
    record = r.rows[0];
  }
  const bytes = await loadPdf(record.storage_key);
  if (createHash("sha256").update(bytes).digest("hex") !== record.sha256)
    throw new Error("artifact_checksum_mismatch");
  return { id: record.id, bytes };
}
export async function artifactShare(
  org: string,
  docId: string,
  intentId: string,
  createdAt: string,
  recipient: string,
) {
  const secret = process.env.SALES_SHARE_SECRET;
  if (!secret || secret.length < 32) throw new Error("share_configuration");
  const token = createHmac("sha256", secret)
    .update(`sales-share/${org}/${docId}/${intentId}`)
    .digest("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const expires = new Date(new Date(createdAt).getTime() + 30 * 86400000);
  await db.execute(
    sql`INSERT INTO document_shares(organization_id,document_id,token_hash,recipient_email,expires_at) VALUES(${org},${docId}::uuid,${hash},${recipient},${expires.toISOString()}::timestamptz) ON CONFLICT(token_hash) DO NOTHING`,
  );
  const origin = new URL(
    process.env.CALACOT_APP_URL || "http://localhost:3000",
  );
  if (
    origin.protocol !== "https:" &&
    (process.env.SALES_NOTIFICATION_MODE || "capture") !== "capture"
  )
    throw new Error("share_configuration");
  return new URL(`/api/sales/share/${token}`, origin).toString();
}
