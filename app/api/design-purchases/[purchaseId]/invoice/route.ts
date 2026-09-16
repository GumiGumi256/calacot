import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { designPurchases } from "@/database/schema";
import { isAdmin } from "@/lib/design-purchases/permissions";
import { generateDesignInvoice } from "@/lib/design-purchases/invoice";
import { ownedPurchaseFilter } from "@/lib/design-purchases/transitions";

export const runtime = "nodejs";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ purchaseId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return new Response("Authentication required", { status: 401 });
  const { purchaseId } = await params;
  if (!z.uuid().safeParse(purchaseId).success)
    return new Response("Not found", { status: 404 });
  const admin = await isAdmin();
  const [purchase] = await db
    .select()
    .from(designPurchases)
    .where(
      admin
        ? eq(designPurchases.id, purchaseId)
        : ownedPurchaseFilter(purchaseId, userId),
    )
    .limit(1);
  if (!purchase) return new Response("Not found", { status: 404 });
  try {
    const pdf = await generateDesignInvoice(purchase);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${purchase.invoiceNumber.replace(/[^A-Z0-9-]/g, "")}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    console.error("Invoice generation failed", { purchaseId });
    return new Response(
      "Your purchase is safe, but the invoice could not be generated. Please try again shortly.",
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store", "Retry-After": "30" },
      },
    );
  }
}
