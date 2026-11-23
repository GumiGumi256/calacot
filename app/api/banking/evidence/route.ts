import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { financeMutation, financeMessages } from "@/lib/finance/context";
import { storePrivateObject } from "@/lib/sales/storage";
import { evidenceMaxBytes } from "@/lib/finance/options";
import { expiringAdminData } from "@/lib/cache-tags";

/*
 * Phase 2C supporting evidence (receipts, count sheets) for cash transactions and counts.
 * POST multipart/form-data: file, key (uuid). The type is detected from the content, never from the
 * browser. Stored privately; only the evidence id is returned. Authorization: cash_create, live.
 */

const signatures: Record<string, (b: Buffer) => boolean> = {
  "application/pdf": (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
};
const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

async function handlePOST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > evidenceMaxBytes + 64 * 1024) return reply(413, { ok: false, message: financeMessages.document_size_limit });
  let form: FormData;
  try { form = await request.formData(); } catch { return reply(400, { ok: false, message: "The upload could not be read." }); }
  const file = form.get("file");
  const key = String(form.get("key") || "");
  if (!(file instanceof File) || !z.uuid().safeParse(key).success) return reply(400, { ok: false, message: "Choose a file to upload." });
  if (file.size <= 0 || file.size > evidenceMaxBytes) return reply(413, { ok: false, message: financeMessages.document_size_limit });
  let result: Awaited<ReturnType<typeof financeMutation>>;
  // Signed-out, revoked or unauthorized callers get a plain 404, like the other finance upload routes.
  try { result = await financeMutation("cash_create", async (ctx, correlation) => {
    const bytes = Buffer.from(await file.arrayBuffer());
    const mimeType = Object.keys(signatures).find((t) => signatures[t](bytes));
    if (!mimeType) return { ok: false, message: financeMessages.invalid_document_type };
    const prefix = createHash("sha256").update(ctx.organizationId).digest("hex").slice(0, 24);
    const storageKey = `banking/evidence/${prefix}/${key}`;
    await storePrivateObject(storageKey, bytes, mimeType);
    const p = { key, sha256: createHash("sha256").update(bytes).digest("hex"), storageKey, fileName: (file.name || "evidence").replace(/[^\w .()-]/g, "_").slice(0, 200) || "evidence", mimeType, sizeBytes: bytes.length };
    const r = (await db.execute<{ result: Record<string, unknown> }>(sql`SELECT banking_evidence_record(${ctx.organizationId},${ctx.actor},${JSON.stringify(p)}::jsonb,${correlation}) AS result`)).rows[0].result;
    return { ok: true, id: String(r.id), message: "Evidence attached." };
  }); } catch { return reply(404, { ok: false, message: "Not found" }); }
  return reply(result.ok ? 200 : 422, result);
}

export const POST = expiringAdminData(handlePOST);
