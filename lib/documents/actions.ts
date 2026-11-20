"use server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/database/db";
import { financeMutation, type FinanceResult } from "@/lib/finance/context";
import { documentAccessPredicate } from "./access";
import { expireAdminData } from "@/lib/cache-tags";

/** Archives a whole document family (all versions). Financial artifacts are refused by the database. */
export async function archiveDocument(_: FinanceResult, data: FormData): Promise<FinanceResult> {
  const p = z.object({ documentId: z.uuid(), reason: z.string().trim().min(5).max(1000) }).safeParse(Object.fromEntries(data));
  if (!p.success) return { ok: false, message: "Give a reason for archiving (at least 5 characters)." };
  return financeMutation("documents_archive", async (ctx, correlation) => {
    const visible = await db.execute(sql`SELECT 1 FROM documents d WHERE d.id=${p.data.documentId}::uuid AND d.organization_id=${ctx.organizationId} AND ${documentAccessPredicate(ctx, sql`coalesce(d.family_id,d.id)`)}`);
    if (!visible.rows.length) return { ok: false, message: "This document is unavailable." };
    try {
      const r = await db.execute<{ result: { already: boolean } }>(sql`SELECT document_archive(${ctx.organizationId},${ctx.actor},${p.data.documentId}::uuid,${p.data.reason},${correlation}) AS result`);
      revalidatePath("/admin/documents", "layout");
      expireAdminData(); // cached admin reads (lib/cache-tags.ts)
      return { ok: true, message: r.rows[0].result.already ? "Already archived." : "Document archived. It stays available in the archive and in audit history." };
    } catch (e) {
      if (String(e instanceof Error ? `${e.message} ${e.cause instanceof Error ? e.cause.message : ""}` : e).includes("financial_document_immutable")) return { ok: false, message: "Quotations, invoices, receipts and expense evidence cannot be archived here." };
      throw e;
    }
  });
}
