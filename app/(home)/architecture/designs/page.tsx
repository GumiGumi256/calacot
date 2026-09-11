import DesignsHero from "@/components/architecture/designs-hero";
import { Suspense } from "react";
import FeaturedDesigns, { FeaturedDesignsLoading } from "@/components/architecture/featured-designs";

export default function BuyDesignsPage() {
  return (
    <>
      <DesignsHero />
      <Suspense fallback={<FeaturedDesignsLoading />}>
        <FeaturedDesigns />
      </Suspense>
    </>
  );
}
