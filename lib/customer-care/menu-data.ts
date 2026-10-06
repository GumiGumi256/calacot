import "server-only";
import { sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/database/db";
import { artifactShare, finalArtifact } from "@/lib/sales/artifacts";
import type { DocumentSnapshot } from "@/lib/sales/document-model";
import { balanceExpression } from "@/lib/sales/queries";
export type Identity = { user: string; clientId: string | null };
export async function identity(
  phone: string,
  org: string,
): Promise<Identity | null> {
  const r = await db.execute<{ user: string; client_id: string | null }>(
    sql`SELECT c.clerk_user_id AS "user", cl.id AS client_id FROM care_conversations c LEFT JOIN clients cl ON cl.clerk_user_id=c.clerk_user_id AND cl.organization_id=${org} AND cl.archived_at IS NULL WHERE c.phone=${phone} AND c.organization_id=${org} AND c.clerk_user_id IS NOT NULL AND c.linked_until>now() AND EXISTS(SELECT 1 FROM whatsapp_contacts wc WHERE wc.phone=c.phone AND wc.opted_out_at IS NULL)`,
  );
  return r.rows[0]
    ? { user: r.rows[0].user, clientId: r.rows[0].client_id }
    : null;
}
export async function verificationLink(phone: string) {
  const base = new URL(
    process.env.CALACOT_APP_URL || "https://www.calacot.com",
  );
  if (
    base.protocol !== "https:" &&
    process.env.CUSTOMER_CARE_NOTIFICATION_MODE !== "capture"
  )
    throw new Error("care_link_configuration");
  const count = await db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM care_link_tokens WHERE phone=${phone} AND expires_at>now()-interval '15 minutes'`,
  );
  if (count.rows[0].count >= 5)
    return "Account verification is temporarily limited. Please try again later or contact our team.";
  const token = randomBytes(32).toString("hex");
  await db.execute(
    sql`INSERT INTO care_link_tokens(hash,phone,expires_at) VALUES(${createHash("sha256").update(token).digest("hex")},${phone},now()+interval '15 minutes')`,
  );
  return `Verify ownership by signing into your Calacot account and approving this WhatsApp link. A typed reference or email cannot verify ownership.\n${new URL(`/account/customer-care/link?token=${token}`, base)}`;
}
export type Quote = {
  version: number;
  id: string;
  quotation_id: string;
  number: string;
  status: string;
  currency: string;
  total: string;
  valid_until: string;
  accepted_at: string | null;
  document_snapshot: DocumentSnapshot;
  revision: number;
};
export async function quotes(
  org: string,
  user: string,
  page = 0,
  versionId?: string,
) {
  const r = await db.execute<Quote>(
    sql`SELECT v.id,v.version,v.quotation_id,q.number,v.status,v.currency,v.total::text,v.valid_until::text,v.accepted_at::text,v.document_snapshot,v.revision FROM quotations q JOIN quotation_versions v ON v.quotation_id=q.id AND v.organization_id=q.organization_id JOIN clients c ON c.id=q.client_id AND c.organization_id=q.organization_id WHERE q.organization_id=${org} AND c.clerk_user_id=${user} AND c.archived_at IS NULL AND v.sent_at IS NOT NULL AND ${versionId ? sql`v.id=${versionId}::uuid` : sql`true`} ORDER BY v.sent_at DESC,v.id DESC LIMIT ${versionId ? 1 : 6} OFFSET ${versionId ? 0 : Math.min(100, Math.max(0, page)) * 5}`,
  );
  return r.rows;
}
export async function documentLink(
  org: string,
  entity: "quotation" | "invoice",
  id: string,
  snapshot: DocumentSnapshot,
  jobId: string,
) {
  const artifact = await finalArtifact(org, entity, id, snapshot);
  return artifactShare(
    org,
    artifact.id,
    jobId,
    new Date().toISOString(),
    snapshot.customer.email,
  );
}
export async function invoices(org: string, user: string, outstanding = false) {
  return (
    await db.execute<{
      id: string;
      number: string;
      currency: string;
      total: string;
      balance: string;
      document_snapshot: DocumentSnapshot;
    }>(
      sql`SELECT i.id,i.number,i.currency,i.total::text,i.document_snapshot,(${balanceExpression})::text AS balance FROM invoices i JOIN clients c ON c.id=i.client_id AND c.organization_id=i.organization_id WHERE i.organization_id=${org} AND c.clerk_user_id=${user} AND c.archived_at IS NULL AND i.status='issued' AND ${outstanding ? sql`(${balanceExpression})>0` : sql`true`} ORDER BY i.issued_at DESC,i.id DESC LIMIT ${outstanding ? 3 : 1}`,
    )
  ).rows;
}
export async function purchase(
  phone: string,
  user: string,
  reference?: string,
) {
  return (
    await db.execute<{
      purchase_reference: string;
      purchase_status: string;
      payment_status: string;
    }>(
      sql`SELECT purchase_reference,purchase_status,payment_status FROM design_purchases WHERE clerk_user_id=${user} AND ${reference ? sql`purchase_reference=${reference}` : sql`true`} AND EXISTS(SELECT 1 FROM care_conversations WHERE phone=${phone} AND clerk_user_id=${user} AND linked_until>now()) ORDER BY created_at DESC,id DESC LIMIT 1`,
    )
  ).rows[0];
}
