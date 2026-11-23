import { createHash } from "node:crypto";
import { sharedDocument } from "@/lib/sales/shared-documents";
import { loadPdf } from "@/lib/sales/storage";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await sharedDocument(token);
  if (!doc) return new Response("Link expired or unavailable", { status: 404, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  try {
    const bytes = await loadPdf(doc.storage_key);
    if (createHash("sha256").update(bytes).digest("hex") !== doc.sha256) throw new Error("checksum_mismatch");
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${disposition}; filename=calacot-${doc.kind}.pdf`, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" } });
  } catch {
    return new Response("Document temporarily unavailable", { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
