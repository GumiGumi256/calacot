import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { storePrivateObject } from "@/lib/sales/storage";
import { financeError, financeMessages } from "@/lib/finance/context";
import { evidenceMaxBytes } from "@/lib/finance/options";
import { expiringAdminData } from "@/lib/cache-tags";


const signatures: Record<string, (b: Buffer) => boolean> = {
  "application/pdf": (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
};
const reply = (status: number, message: string, id?: string) => Response.json({ ok: status === 200, message, id }, { status, headers: { "Cache-Control": "no-store" } });

/** Uploads a receipt or payment evidence file to private storage and links it to an expense. */
async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return reply(404, "Not found");
  let ctx: Awaited<ReturnType<typeof staffContext>>;
  try { ctx = await staffContext(); } catch { return reply(404, "Not found"); }
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  let originHost = "";
  try { originHost = origin ? new URL(origin).host : ""; } catch { /* rejected below */ }
  if (!origin || originHost !== host) return reply(403, financeMessages.origin_denied);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > evidenceMaxBytes + 64 * 1024) return reply(413, financeMessages.document_size_limit);
  let form: FormData;
  try { form = await request.formData(); } catch { return reply(400, "Upload could not be read."); }
  const file = form.get("file");
  const role = form.get("role");
  const documentId = String(form.get("documentId") || "");
  if (!(file instanceof File) || (role !== "requester" && role !== "finance") || !z.uuid().safeParse(documentId).success) return reply(400, "Choose a file to upload.");
  const required = role === "finance" ? "expenses_disburse" : "expenses_create";
  if (!ctx.permissions.includes(required)) return reply(404, "Not found");
  if (file.size <= 0 || file.size > evidenceMaxBytes) return reply(400, financeMessages.document_size_limit);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = Object.keys(signatures).find((type) => signatures[type](bytes));
  if (!mimeType) return reply(400, financeMessages.invalid_document_type);
  // Pre-check eligibility before writing to storage; the database function checks again atomically.
  const eligible = await db.execute(sql`SELECT 1 FROM expenses e JOIN staff_memberships s ON s.organization_id=e.organization_id AND s.clerk_user_id=${ctx.actor} AND s.status='active'
    WHERE e.id=${id}::uuid AND e.organization_id=${ctx.organizationId} AND ${role === "requester" ? sql`e.requested_by_id=s.id AND e.status IN ('draft','returned')` : sql`e.status IN ('approved','paid')`}`);
  if (!eligible.rows.length) return reply(409, role === "requester" ? financeMessages.expense_not_editable : financeMessages.expense_not_approved);
  const name = (file.name || "evidence").replace(/[^\w .()-]/g, "_").slice(0, 200) || "evidence";
  const storageKey = `finance/expenses/${id}/${documentId}`;
  const correlation = randomUUID();
  try {
    await storePrivateObject(storageKey, bytes, mimeType);
    await db.execute(sql`SELECT expense_attach_document(${ctx.organizationId},${ctx.actor},${id}::uuid,${JSON.stringify({ documentId, role, storageKey, mimeType, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), name })}::jsonb,${correlation})`);
  } catch (e) {
    const code = financeError(e);
    console.error("finance_upload_failed", { correlation, code: code || "unexpected" });
    return reply(code ? 409 : 500, code ? financeMessages[code] : "The file could not be stored. Try again.");
  }
  revalidatePath(`/admin/expenses/${id}`);
  return reply(200, "File attached.", documentId);
}

// Expire cached admin reads after a successful write (lib/cache-tags.ts).
export const POST = expiringAdminData(handlePOST);
