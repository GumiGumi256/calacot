import "server-only";
import { client } from "@/sanity/lib/client";
import { db } from "@/database/db";
import { getPurchasableDesign } from "@/lib/queries/design";
import type { Classification } from "./contracts";
import { ownedOrderQuery } from "./queries";
import {
  displayText,
  renderListings,
  renderOrder,
  renderSupport,
  templates,
} from "./render";
import { sql } from "drizzle-orm";

const options = {
  perspective: "published" as const,
  useCdn: false,
  cache: "no-store" as const,
};
export async function designResults(fields: Classification["extractedFields"]) {
  if (fields.designSlug) {
    const d = await getPurchasableDesign(fields.designSlug);
    if (!d) return templates.no_results;
    const packages = d.packages.slice(0, 3);
    if (!packages.length) return templates.missing;
    return (
      renderListings(
        packages.map((p) => ({
          title: `${displayText.parse(d.title)} · ${displayText.parse(p.package.name)}`,
          price: p.price,
          detail: `Availability: ${displayText.parse(d.status)}`,
          url: `https://calacot.com/architecture/designs/${fields.designSlug}`,
        })),
      ) +
      "\n\nPackage inclusions:\n" +
      packages
        .map(
          (p) =>
            `${displayText.parse(p.package.name)}: ${(p.package.includes || [])
              .slice(0, 8)
              .map((v) => displayText.parse(v))
              .join(", ")}`,
        )
        .join("\n")
    );
  }
  const rows = await client.fetch<
    { title: string; slug: string; status: string; price: number | null }[]
  >(
    `*[_type=="design" && !(_id in path("drafts.**")) && coalesce(status,"available")!="archived" && defined(slug.current) && ($bedrooms==null || bedrooms==$bedrooms)] | order(_updatedAt desc)[0...3] {title,"slug":slug.current,"status":coalesce(status,"available"),"price":(packages[price>0 && package->isActive==true] | order(price asc))[0].price}`,
    { bedrooms: fields.bedrooms },
    options,
  );
  return renderListings(
    rows.map((r) => ({
      title: r.title,
      price: r.price,
      detail: `Availability: ${r.status}; starting price`,
      url: `https://calacot.com/architecture/designs/${checkedSlug(r.slug)}`,
    })),
  );
}
function checkedSlug(slug: string) {
  if (!/^[a-z0-9-]{1,96}$/.test(slug)) throw new Error("Invalid live slug");
  return slug;
}
export async function propertyResults(
  fields: Classification["extractedFields"],
) {
  const rows = await client.fetch<
    {
      title: string;
      slug: string;
      status: string;
      price: number;
      listingType: string;
    }[]
  >(
    `*[_type=="property" && !(_id in path("drafts.**")) && status=="available" && defined(slug.current) && ($type==null || listingType==$type) && ($bedrooms==null || bedrooms==$bedrooms) && ($location==null || location.city==$location || location.district==$location)] | order(_updatedAt desc)[0...3] {title,"slug":slug.current,status,price,listingType}`,
    {
      type: fields.listingType,
      bedrooms: fields.bedrooms,
      location: fields.location,
    },
    options,
  );
  return renderListings(
    rows.map((r) => ({
      title: r.title,
      price: r.price,
      detail: `For ${r.listingType}; ${r.status}`,
      url: "https://calacot.com/real-estate",
    })),
  );
}
export async function authorisedOrder(phone: string, reference: string) {
  const result = await db.execute<{
    purchase_reference: string;
    purchase_status: string;
    payment_status: string;
  }>(ownedOrderQuery(phone, reference));
  const r = result.rows[0];
  return r
    ? renderOrder({
        purchaseReference: r.purchase_reference,
        purchaseStatus: r.purchase_status,
        paymentStatus: r.payment_status,
      })
    : templates.order_missing;
}
export async function authorisedSupport(phone: string) {
  const result = await db.execute<{
    kind: string;
    status: string;
  }>(sql`SELECT r.kind,r.status FROM care_requests r
    JOIN care_conversations c ON c.phone=r.phone
    JOIN whatsapp_contacts contact ON contact.phone=c.phone
    WHERE c.phone=${phone} AND c.clerk_user_id IS NOT NULL AND c.linked_until>now() AND contact.opted_out_at IS NULL
    ORDER BY r.created_at DESC LIMIT 3`);
  return renderSupport(result.rows);
}
