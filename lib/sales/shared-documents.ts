import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { storePdf, loadPdf } from "./storage";
import { renderPaymentPdf } from "./payment-pdf";
import { finalArtifact } from "./artifacts";
import type { DocumentSnapshot } from "./document-model";

export type ShareKind = "invoice" | "receipt";
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export function shareOrigin() {
  const url = new URL(process.env.CALACOT_APP_URL || "http://localhost:3000");
  const local = process.env.NODE_ENV !== "production" && (process.env.SALES_NOTIFICATION_MODE || "capture") === "capture" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("share_configuration");
  return url.origin;
}

export async function createSharedDocument(org: string, kind: ShareKind, id: string, actor: string) {
  const origin = shareOrigin();
  let documentId: string;
  if (kind === "invoice") {
    const invoice = (await db.execute<{ document_snapshot: DocumentSnapshot | null }>(sql`SELECT document_snapshot FROM invoices WHERE organization_id=${org} AND id=${id}::uuid AND status='issued'`)).rows[0];
    if (!invoice?.document_snapshot) throw new Error("document_unavailable");
    documentId = (await finalArtifact(org, "invoice", id, invoice.document_snapshot)).id;
  } else {
    const p = (await db.execute<{ client_id: string; client: string; receipt_number: string; amount: string; currency: string; method: string; reference: string | null; received_at: string; refunded: string }>(sql`SELECT p.client_id,c.display_name AS client,p.receipt_number,p.amount::text,p.currency,p.method,p.reference,p.received_at::text,coalesce((SELECT sum(f.amount) FROM payment_refunds f WHERE f.organization_id=p.organization_id AND f.payment_id=p.id AND f.status='completed'),0)::text AS refunded FROM payments p JOIN clients c ON c.id=p.client_id AND c.organization_id=p.organization_id WHERE p.organization_id=${org} AND p.id=${id}::uuid AND p.status='confirmed' AND p.receipt_number IS NOT NULL`)).rows[0];
    if (!p) throw new Error("document_unavailable");
    const bytes = await renderPaymentPdf("Payment receipt", [`Receipt: ${p.receipt_number}`, `Received from: ${p.client}`, `Amount received: ${p.currency} ${p.amount}`, `Received: ${p.received_at.slice(0, 10)}`, `Method: ${p.method.replaceAll("_", " ")}`, `Reference: ${p.reference || "-"}`, `Completed refunds: ${p.currency} ${p.refunded}`, "This receipt confirms the original payment received. Refunds shown are current as of generation."]);
    const key = `shared-receipts/${id}/${randomUUID()}.pdf`;
    await storePdf(key, bytes);
    const document = (await db.execute<{ id: string }>(sql`WITH d AS (INSERT INTO documents(organization_id,name,kind,storage_key,mime_type,size_bytes,sha256,version,created_by_clerk_user_id) VALUES(${org},${p.receipt_number + ".pdf"},'receipt',${key},'application/pdf',${bytes.length},${digest(bytes)},1,${actor}) RETURNING id), l AS (INSERT INTO document_links(organization_id,document_id,client_id) SELECT ${org},id,${p.client_id}::uuid FROM d) SELECT id FROM d`)).rows[0];
    if (!document) throw new Error("document_unavailable");
    documentId = document.id;
  }
  const token = randomBytes(32).toString("hex");
  await db.execute(sql`WITH s AS (INSERT INTO document_shares(organization_id,document_id,token_hash,expires_at) VALUES(${org},${documentId}::uuid,${digest(token)},now()+interval '7 days') RETURNING id), a AS (INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) SELECT ${org},${actor},'staff','document_share.create',${kind},${id},jsonb_build_object('shareId',id,'expiresInDays',7),${randomUUID()} FROM s) SELECT id FROM s`);
  return `${origin}/shared/${token}`;
}

/** Create or recover the receipt snapshot for one delivery intent. */
export async function receiptDeliveryArtifact(org: string, paymentId: string, intentId: string) {
  const p = (await db.execute<{ client_id: string; client: string; receipt_number: string; amount: string; currency: string; method: string; reference: string | null; received_at: string; refunded: string }>(sql`SELECT p.client_id,c.display_name AS client,p.receipt_number,p.amount::text,p.currency,p.method,p.reference,p.received_at::text,coalesce((SELECT sum(f.amount) FROM payment_refunds f WHERE f.organization_id=p.organization_id AND f.payment_id=p.id AND f.status='completed'),0)::text AS refunded FROM payments p JOIN clients c ON c.id=p.client_id AND c.organization_id=p.organization_id WHERE p.organization_id=${org} AND p.id=${paymentId}::uuid AND p.status='confirmed' AND p.receipt_number IS NOT NULL`)).rows[0];
  if (!p) throw new Error("document_unavailable");
  const key = `shared-receipts/${paymentId}/${intentId}.pdf`;
  const bytes = await renderPaymentPdf("Payment receipt", [`Receipt: ${p.receipt_number}`, `Received from: ${p.client}`, `Amount received: ${p.currency} ${p.amount}`, `Received: ${p.received_at.slice(0, 10)}`, `Method: ${p.method.replaceAll("_", " ")}`, `Reference: ${p.reference || "-"}`, `Completed refunds: ${p.currency} ${p.refunded}`, "This receipt confirms the original payment received. Refunds shown are current as of generation."]);
  await storePdf(key, bytes);
  const stored = await loadPdf(key);
  const row = (await db.execute<{ id: string; sha256: string }>(sql`WITH d AS (INSERT INTO documents(organization_id,name,kind,storage_key,mime_type,size_bytes,sha256,version) VALUES(${org},${p.receipt_number + ".pdf"},'receipt',${key},'application/pdf',${stored.length},${digest(stored)},1) ON CONFLICT(organization_id,storage_key) DO UPDATE SET storage_key=excluded.storage_key RETURNING id,sha256), l AS (INSERT INTO document_links(organization_id,document_id,client_id) SELECT ${org},id,${p.client_id}::uuid FROM d WHERE NOT EXISTS(SELECT 1 FROM document_links WHERE organization_id=${org} AND document_id=d.id AND client_id=${p.client_id}::uuid)) SELECT id,sha256 FROM d`)).rows[0];
  if (!row || row.sha256 !== digest(stored)) throw new Error("artifact_checksum_mismatch");
  return row.id;
}

/** The token is a bearer credential. Resolve it on every request, including PDF requests. */
export async function sharedDocument(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await db.execute<{ kind: ShareKind; name: string; storage_key: string; sha256: string; expires_at: string; number: string; client: string; currency: string; amount: string }>(sql`SELECT d.kind,d.name,d.storage_key,d.sha256,s.expires_at::text,coalesce(i.number,p.receipt_number) AS number,c.display_name AS client,coalesce(i.currency,p.currency) AS currency,coalesce(i.total,p.amount)::text AS amount FROM document_shares s JOIN documents d ON d.id=s.document_id AND d.organization_id=s.organization_id LEFT JOIN document_links l ON l.organization_id=d.organization_id AND l.document_id=d.id LEFT JOIN invoices i ON d.kind='invoice' AND i.id=l.invoice_id AND i.organization_id=d.organization_id AND i.status='issued' LEFT JOIN payments p ON d.kind='receipt' AND d.storage_key LIKE 'shared-receipts/%' AND p.id::text=split_part(d.storage_key,'/',2) AND p.organization_id=d.organization_id AND p.status='confirmed' AND p.receipt_number IS NOT NULL LEFT JOIN clients c ON c.organization_id=d.organization_id AND c.id=coalesce(i.client_id,p.client_id) WHERE s.token_hash=${digest(token)} AND s.expires_at>now() AND s.revoked_at IS NULL AND d.archived_at IS NULL AND ((d.kind='invoice' AND i.id IS NOT NULL) OR (d.kind='receipt' AND p.id IS NOT NULL AND l.client_id=p.client_id)) LIMIT 1`);
  return rows.rows[0] || null;
}

export async function revokeSharedDocuments(org: string, kind: ShareKind, id: string, actor: string) {
  const condition = kind === "invoice" ? sql`EXISTS(SELECT 1 FROM document_links l JOIN documents d ON d.id=l.document_id AND d.organization_id=l.organization_id WHERE l.organization_id=s.organization_id AND l.document_id=s.document_id AND l.invoice_id=${id}::uuid AND d.kind='invoice')` : sql`EXISTS(SELECT 1 FROM documents d WHERE d.organization_id=s.organization_id AND d.id=s.document_id AND d.kind='receipt' AND split_part(d.storage_key,'/',1)='shared-receipts' AND split_part(d.storage_key,'/',2)=${id})`;
  await db.execute(sql`WITH changed AS (UPDATE document_shares s SET revoked_at=now() WHERE s.organization_id=${org} AND s.revoked_at IS NULL AND ${condition} RETURNING s.id), audit AS (INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) SELECT ${org},${actor},'staff','document_share.revoke_all',${kind},${id},jsonb_build_object('count',count(*)),${randomUUID()} FROM changed) SELECT count(*) FROM changed`);
}
