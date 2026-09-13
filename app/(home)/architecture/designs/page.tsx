import { pageMetadata } from "@/lib/seo";
import DesignsHero from "@/components/architecture/designs-hero";
import { Suspense } from "react";
import FeaturedDesigns, { FeaturedDesignsLoading } from "@/components/architecture/featured-designs";
import BrowseByLifestyle from "@/components/architecture/browse-by-lifestyle";

export const metadata = pageMetadata("/architecture/designs");

export default function BuyDesignsPage() {
  return (
    <>
      <DesignsHero />
    
      <Suspense fallback={<FeaturedDesignsLoading />}>
        <FeaturedDesigns />
      </Suspense>
        {/* <BrowseByLifestyle /> */}
    </>
  );
}
