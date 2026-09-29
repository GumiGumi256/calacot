import { pageMetadata } from "@/lib/seo";
import DesignsHero from "@/components/architecture/designs-hero";
import { Suspense } from "react";
import FeaturedDesigns, { FeaturedDesignsLoading } from "@/components/architecture/featured-designs";
import DesignCollection, { DesignCollectionLoading } from "@/components/architecture/design-collection";

export const metadata = pageMetadata("/architecture/designs");

export default function BuyDesignsPage() {
  return (
    <>
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
