import ConstructionProcessSection from "@/components/construction-process-section";
import { CustomButton } from "@/components/custom-button";
import EstatesSection from "@/components/estates-section";
import HeroSection from "@/components/hero-section";
import PossibilitySection from "@/components/possibility-section";
import ShowcaseSlider from "@/components/showcase-slider";
import WorldViewSection from "@/components/world-view-section";
import { getFeaturedDesigns } from "@/lib/queries/design";

export default async function Home() {
  const featuredDesigns = await getFeaturedDesigns();
  return (
    <main>
      <HeroSection />

      <WorldViewSection />
      <PossibilitySection />
      <ShowcaseSlider />
<EstatesSection />
      {/* <ConstructionProcessSection /> */}
    </main>
  );
}
