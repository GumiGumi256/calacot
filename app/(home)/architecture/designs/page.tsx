import { absoluteUrl, pageMetadata } from "@/lib/seo";
import DesignsHero from "@/components/architecture/designs-hero";
import { Suspense } from "react";
import FeaturedDesigns, { FeaturedDesignsLoading } from "@/components/architecture/featured-designs";
import DesignCollection, { DesignCollectionLoading } from "@/components/architecture/design-collection";
import { JsonLd } from "@/components/seo/structured-data";
import { getDesignSitemapEntries } from "@/lib/queries/design";

export const metadata = pageMetadata("/architecture/designs");

/** The house plans on this page as an ItemList, so search engines can find and group them. */
async function DesignListStructuredData() {
  let designs: { slug: string }[] = [];
  try {
    designs = await getDesignSitemapEntries();
  } catch {
    return null; // Structured data is optional; the page itself handles CMS failures.
  }
  return (
    <JsonLd data={{ "@context": "https://schema.org", "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: "Architecture", item: absoluteUrl("/architecture") },
        { "@type": "ListItem", position: 3, name: "House plans", item: absoluteUrl("/architecture/designs") },
      ] },
      ...(designs.length ? [{
        "@type": "ItemList",
        name: "House plans for sale in Uganda",
        itemListElement: designs.map((d, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(`/architecture/designs/${encodeURIComponent(d.slug)}`) })),
      }] : []),
    ] }} />
  );
}

export default function BuyDesignsPage() {
  return (
    <>
      <Suspense fallback={null}>
        <DesignListStructuredData />
      </Suspense>
      <DesignsHero />

      <Suspense fallback={<FeaturedDesignsLoading />}>
        <FeaturedDesigns />
      </Suspense>
      <Suspense fallback={<DesignCollectionLoading />}>
        <DesignCollection />
      </Suspense>
    </>
  );
}
