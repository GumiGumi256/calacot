"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { liveStaffContext } from "@/lib/admin/clerk-auth";
import { loadPdf } from "@/lib/sales/storage";
import { documentAccessPredicate } from "./access";
import { matchesPdfDigest, referenceDigest } from "./verification-crypto";
import { legacyReference } from "./verification-config";

async function permittedOrigin() {
  const h = await headers();
  const origin = h.get("origin"), host = h.get("x-forwarded-host") || h.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

/** Explicit legacy registration only: never accepts a public upload as issuance evidence. */
export async function registerLegacyVerification(input: { documentId: string; evidence: string }) {
  const ctx = await liveStaffContext("verification_issue");
  const parsed = z.object({ documentId: z.uuid(), evidence: z.string().trim().min(10).max(2000) }).safeParse(input);
  const secret = process.env.CALACOT_VERIFICATION_REFERENCE_SECRET;
  if (process.env.CALACOT_VERIFICATION_ENABLED !== "true" || !secret || secret.length < 32 || !(await permittedOrigin()) || !parsed.success)
    return { ok: false as const, message: "Registration is unavailable or the request is invalid." };
  try {
    const { documentId, evidence } = parsed.data;
    const row = (await db.execute<{ storage_key: string; sha256: string; kind: string; size_bytes: string }>(sql`
      SELECT d.storage_key,d.sha256,d.kind,d.size_bytes::text FROM documents d WHERE d.id=${documentId}::uuid AND d.organization_id=${ctx.organizationId}
      AND ${documentAccessPredicate(ctx, sql`coalesce(d.family_id,d.id)`)} AND d.kind IN ('quotation','invoice') AND d.sha256 IS NOT NULL`)).rows[0];
    if (!row || Number(row.size_bytes) > 20 * 1024 * 1024 || !ctx.permissions.includes(row.kind === "invoice" ? "invoices_read" : "quotations_read")) throw new Error("unavailable");
    const rateKey = `verification/staff/${ctx.organizationId}/${ctx.actor}`;
    const rate = await db.execute<{ count: number }>(sql`INSERT INTO sales_rate_limits(key,count,expires_at) VALUES(${rateKey},1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN sales_rate_limits.expires_at<now() THEN 1 ELSE sales_rate_limits.count+1 END,expires_at=CASE WHEN sales_rate_limits.expires_at<now() THEN now()+interval '1 minute' ELSE sales_rate_limits.expires_at END RETURNING count`);
    if ((rate.rows[0]?.count ?? 31) > 30) throw new Error("rate_limited");
    const bytes = await loadPdf(row.storage_key);
    if (bytes.length > 20 * 1024 * 1024 || !matchesPdfDigest(bytes, row.sha256)) throw new Error("artifact_mismatch");
    // Derivation permits safe retry and recovery without storing the bearer reference.
    // Changing this secret invalidates recovery of existing legacy references.
    const reference = legacyReference(ctx.organizationId, documentId);
    await db.execute(sql`SELECT verification_register_legacy(${ctx.organizationId},${documentId}::uuid,${referenceDigest(reference)},${row.sha256},${ctx.actor},${evidence},${randomUUID()})`);
    return { ok: true as const, reference };
  } catch {
    return { ok: false as const, message: "Registration could not be completed. Check the original artifact and issuance evidence." };
  }
}

export async function changeVerificationStatus(input: { documentId: string; status: string; reason: string; replacementDocumentId?: string }) {
  const ctx = await liveStaffContext("verification_revoke");
  const parsed = z.object({ documentId: z.uuid(), status: z.enum(["superseded", "withdrawn", "expired", "voided", "revoked"]), reason: z.string().trim().min(10).max(2000), replacementDocumentId: z.uuid().optional() }).safeParse(input);
  if (process.env.CALACOT_VERIFICATION_ENABLED !== "true" || !(await permittedOrigin()) || !parsed.success)
    return { ok: false as const, message: "Status change is unavailable or the request is invalid." };
  try {
    const p = parsed.data;
    if ((p.status === "superseded") !== !!p.replacementDocumentId) throw new Error("replacement_required");
    const find = async (id: string) => (await db.execute<{ id: string; kind: string }>(sql`
      SELECT v.id,d.kind FROM verification_issuances v JOIN documents d ON d.id=v.document_id AND d.organization_id=v.organization_id
      WHERE v.organization_id=${ctx.organizationId} AND d.id=${id}::uuid AND ${documentAccessPredicate(ctx, sql`coalesce(d.family_id,d.id)`)} LIMIT 1`)).rows[0];
    const record = await find(p.documentId);
    const replacement = p.replacementDocumentId ? await find(p.replacementDocumentId) : null;
    if (!record || (p.replacementDocumentId && !replacement)) throw new Error("unavailable");
    await db.execute(sql`SELECT verification_change_status(${ctx.organizationId},${record.id}::uuid,${p.status},${ctx.actor},${p.reason},${replacement?.id ?? null}::uuid)`);
    return { ok: true as const, message: "Verification status updated." };
  } catch {
    return { ok: false as const, message: "Status could not be changed. Check the current status and replacement." };
  }
}
