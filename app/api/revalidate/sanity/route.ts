import type { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { parseBody } from "next-sanity/webhook";

/*
 * Sanity webhook: refresh the website as soon as design content is published, instead of waiting
 * for the 60-second revalidation. Configure in sanity.io/manage -> API -> Webhooks:
 *   URL      https://www.calacot.com/api/revalidate/sanity
 *   Trigger  create, update, delete
 *   Filter   _type in ["design", "designPackage"]
 *   Projection {_type, "slug": slug.current}
 *   Secret   the same value as SANITY_REVALIDATE_SECRET in Vercel
 * The signature is verified, so only Sanity can trigger it.
 */

type WebhookBody = { _type?: string; slug?: string | null };

export async function POST(request: NextRequest) {
  const secret = process.env.SANITY_REVALIDATE_SECRET?.trim();
  if (!secret) return Response.json({ revalidated: false, message: "SANITY_REVALIDATE_SECRET is not configured" }, { status: 500 });
  try {
    // true: wait briefly so the next read sees the content Sanity just published.
    const { isValidSignature, body } = await parseBody<WebhookBody>(request, secret, true);
    if (!isValidSignature) return Response.json({ revalidated: false, message: "Invalid signature" }, { status: 401 });
    if (!body?._type || !["design", "designPackage"].includes(body._type)) {
      return Response.json({ revalidated: false, message: `Ignored type ${body?._type ?? "(none)"}` });
    }
    // Immediate expiry (Next 16): the next visitor gets fresh content, not a stale copy.
    revalidateTag("designs", { expire: 0 });
    revalidateTag("featured-designs", { expire: 0 });
    revalidatePath("/sitemap.xml");
    if (body.slug) revalidatePath(`/architecture/designs/${body.slug}`);
    return Response.json({ revalidated: true, type: body._type, slug: body.slug ?? null, now: Date.now() });
  } catch (error) {
    console.error("sanity_revalidate_failed", error instanceof Error ? error.message : error);
    return Response.json({ revalidated: false, message: "Could not process the webhook" }, { status: 400 });
  }
}
