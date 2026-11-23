"use server";

import { z } from "zod";
import { liveStaffContext } from "@/lib/admin/clerk-auth";
import { createSharedDocument, revokeSharedDocuments } from "./shared-documents";

const inputSchema = z.object({ kind: z.enum(["invoice", "receipt"]), id: z.uuid() });

export async function createDocumentShare(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid document." };
  const { kind, id } = parsed.data;
  const ctx = await liveStaffContext(kind === "invoice" ? "invoices_issue" : "payments_verify");
  if (!ctx.permissions.includes(kind === "invoice" ? "invoices_read" : "payments_read")) return { ok: false as const, error: "Document access is unavailable." };
  try {
    const url = await createSharedDocument(ctx.organizationId, kind, id, ctx.actor);
    return { ok: true as const, url };
  } catch {
    return { ok: false as const, error: "Could not create a link. Check that the document is available and storage is configured." };
  }
}

export async function revokeDocumentShares(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid document." };
  const { kind, id } = parsed.data;
  const ctx = await liveStaffContext(kind === "invoice" ? "invoices_issue" : "payments_verify");
  if (!ctx.permissions.includes(kind === "invoice" ? "invoices_read" : "payments_read")) return { ok: false as const, error: "Document access is unavailable." };
  try {
    await revokeSharedDocuments(ctx.organizationId, kind, id, ctx.actor);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Could not revoke links." };
  }
}
