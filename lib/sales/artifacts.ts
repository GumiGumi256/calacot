import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { renderCommercialPdf } from "./pdf";
import { storePdf, loadPdf } from "./storage";
import type { DocumentSnapshot } from "./document-model";
import { embeddedReference, verificationEmbedEnabled } from "@/lib/documents/verification-config";
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const missing = (e: unknown) =>
  e instanceof Error &&
  (e.message.includes("artifact_missing") || ("code" in e && e.code === "ENOENT"));
async function loadIfPresent(key: string) {
  try {
    return await loadPdf(key);
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}
/**
 * The immutable commercial PDF for an issued quotation version or invoice. An existing artifact
 * (v1 unembedded, or v2 with an embedded verification reference) is always reused and never
 * regenerated. New artifacts embed the reference and QR only when verification embedding is
 * enabled and the record carries issuance audit evidence; otherwise the v1 behaviour is unchanged.
 */
export async function finalArtifact(
  org: string,
  entity: "quotation" | "invoice",
  id: string,
  d: DocumentSnapshot,
) {
  const base = `commercial/${createHash("sha256").update(org).digest("hex").slice(0, 24)}/${entity}/${id}/`;
  const key = `${base}calacot-commercial-v1.pdf`;
  const find = async () =>
    (
      await db.execute<{ id: string; sha256: string; storage_key: string }>(
        sql`SELECT id,sha256,storage_key FROM documents WHERE organization_id=${org} AND (storage_key=${key} OR (left(storage_key,${base.length})=${base} AND storage_key ~ '/calacot-commercial-v2-[0-9a-f]{16}[.]pdf$')) ORDER BY (storage_key=${key}) DESC,created_at,id LIMIT 1`,
      )
    ).rows[0];
  let record = await find();
  if (!record) {
    // An unembedded upload interrupted before registration is recovered by key, never replaced.
    let bytes = await loadIfPresent(key);
    if (!bytes && verificationEmbedEnabled()) {
      const eligible = (
        await db.execute<{ ok: boolean }>(
          sql`SELECT EXISTS(SELECT 1 FROM verification_embedded_candidate(${org},${entity},${id}::uuid)) AS ok`,
        )
      ).rows[0]?.ok;
      if (eligible) {
        const v = embeddedReference(org, entity, id);
        const embeddedKey = `${base}calacot-commercial-v2-${v.digest.slice(0, 16)}.pdf`;
        // Crash-safe: the reference is re-derived, the write is create-only, and the digest is
        // always taken from the bytes read back from storage, so concurrent or resumed runs agree.
        let stored = await loadIfPresent(embeddedKey);
        if (!stored) {
          await storePdf(embeddedKey, await renderCommercialPdf(d, false, { reference: v.reference, url: v.url }));
          stored = await loadPdf(embeddedKey);
        }
        await db.execute(
          sql`SELECT verification_finalize_embedded(${org},${entity},${id}::uuid,${embeddedKey},${d.number + ".pdf"},${stored.length},${sha256(stored)},${v.digest},${randomUUID()})`,
        );
        record = await find();
        if (!record) throw new Error("artifact_registration_failed");
      }
    }
    if (!record) {
      if (!bytes) {
        await storePdf(key, await renderCommercialPdf(d));
        bytes = await loadPdf(key);
      }
      const checksum = sha256(bytes);
      const r = await db.execute<{
        id: string;
        sha256: string;
        storage_key: string;
      }>(
        sql`WITH doc AS (INSERT INTO documents(organization_id,name,kind,storage_key,mime_type,size_bytes,sha256,version) VALUES(${org},${d.number + ".pdf"},${entity},${key},'application/pdf',${bytes.length},${checksum},1) ON CONFLICT(organization_id,storage_key) DO UPDATE SET storage_key=excluded.storage_key RETURNING *), link AS (INSERT INTO document_links(organization_id,document_id,quotation_version_id,invoice_id) SELECT ${org},id,${entity === "quotation" ? id : null}::uuid,${entity === "invoice" ? id : null}::uuid FROM doc WHERE NOT EXISTS(SELECT 1 FROM document_links l WHERE l.organization_id=${org} AND l.document_id=doc.id)) SELECT id,sha256,storage_key FROM doc`,
      );
      record = r.rows[0];
    }
  }
  const bytes = await loadPdf(record.storage_key);
  if (sha256(bytes) !== record.sha256)
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
