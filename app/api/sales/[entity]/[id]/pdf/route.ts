import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { renderCommercialPdf } from "@/lib/sales/pdf";
import { finalArtifact } from "@/lib/sales/artifacts";
import type { DocumentSnapshot } from "@/lib/sales/document-model";
import { readFile } from "node:fs/promises";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const { entity, id } = await params;
  if (
    !["quotations", "invoices"].includes(entity) ||
    !z.uuid().safeParse(id).success
  )
    return new Response("Not found", { status: 404 });
  const ctx = await staffContext(
      entity === "quotations" ? "quotations_read" : "invoices_read",
    ),
    org = ctx.organizationId;
  const versionId = new URL(request.url).searchParams.get("versionId");
  if (versionId && !z.uuid().safeParse(versionId).success)
    return new Response("Not found", { status: 404 });
  const r = await db.execute<{
    id: string;
    status: string;
    document_snapshot: DocumentSnapshot | null;
  }>(
    entity === "quotations"
      ? sql`SELECT v.* FROM quotation_versions v JOIN quotations q ON q.id=v.quotation_id AND q.organization_id=v.organization_id WHERE q.id=${id}::uuid AND q.organization_id=${org} ${versionId ? sql`AND v.id=${versionId}::uuid` : sql``} ORDER BY v.version DESC LIMIT 1`
      : sql`SELECT * FROM invoices WHERE id=${id}::uuid AND organization_id=${org}`,
  );
  const row = r.rows[0];
  if (!row) return new Response("Not found", { status: 404 });
  try {
    let bytes: Buffer;
    if (row.document_snapshot)
      bytes = (
        await finalArtifact(
          org,
          entity === "quotations" ? "quotation" : "invoice",
          row.id,
          row.document_snapshot,
        )
      ).bytes;
    else if (entity === "quotations" && row.status === "draft") {
      const raw = row as unknown as Record<string, unknown>;
      const q = (
        await db.execute(
          sql`SELECT q.*,p.name AS project_name,c.display_name,c.billing_address FROM quotations q JOIN clients c ON c.id=q.client_id AND c.organization_id=q.organization_id LEFT JOIN projects p ON p.id=q.project_id AND p.organization_id=q.organization_id WHERE q.id=${id}::uuid AND q.organization_id=${org}`,
        )
      ).rows[0];
      const issuer = (
        await db.execute(sql`SELECT * FROM organizations WHERE id=${org}`)
      ).rows[0];
      const items = (
        await db.execute(
          sql`SELECT description,unit,quantity,unit_price AS "unitPrice",discount_amount AS "discountAmount",tax_rate AS "taxRate",subtotal,tax_amount AS "taxAmount",total,position FROM quotation_items WHERE quotation_version_id=${row.id}::uuid AND organization_id=${org} ORDER BY position`,
        )
      ).rows;
      const logo = await readFile(`${process.cwd()}/public/calacot-logo.png`);
      const snap = {
        type: "quotation",
        number: "DRAFT",
        version: raw.version,
        title: q.title,
        project: q.project_name || "Unlinked",
        clientId: q.client_id,
        projectId: q.project_id,
        quotationVersionId: row.id,
        currency: raw.currency,
        customer: {
          name: q.display_name,
          email: "",
          address: Object.values(
            (q.billing_address || {}) as Record<string, string>,
          ).join(", "),
          taxIdentifier: "",
        },
        issuer: {
          legalName: issuer.legal_name,
          address: issuer.billing_address || "",
          email: issuer.email || "",
          phone: issuer.phone || "",
          taxIdentifier: issuer.tax_identifier || "",
        },
        scope: raw.scope,
        deliverables: raw.deliverables,
        exclusions: raw.exclusions,
        terms: raw.terms,
        instructions: "",
        items,
        subtotal: raw.subtotal,
        discountAmount: raw.discount_amount,
        taxAmount: raw.tax_amount,
        total: raw.total,
        schedules: [],
        issuedAt: new Date().toISOString(),
        due: String(raw.valid_until),
        billingPolicy: "full",
        billingPurpose: "draft",
        brand: {
          logoBase64: logo.toString("base64"),
          logo: "calacot-logo.png",
          logoSha256: "preview",
          template: "calacot-commercial-v1",
        },
      } as unknown as DocumentSnapshot;
      bytes = await renderCommercialPdf(snap, true);
    } else
      return new Response("Historical snapshot requires review", {
        status: 409,
      });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=calacot-document.pdf",
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    console.error("sales_pdf_unavailable", { id });
    return new Response(
      "PDF temporarily unavailable; check storage configuration",
      { status: 503 },
    );
  }
}
