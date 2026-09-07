import { pageMetadata } from "@/lib/seo";
import ConstructionProcessSection from "@/components/construction-process-section";
import { CustomButton } from "@/components/custom-button";
import EstatesSection from "@/components/estates-section";
import HeroSection from "@/components/hero-section";
import PossibilitySection from "@/components/possibility-section";
import ShowcaseSlider from "@/components/showcase-slider";
import WorldViewSection from "@/components/world-view-section";


export const metadata = pageMetadata("/");

export default async function Home() {

  return (
    <div>
      <HeroSection />

      <WorldViewSection />
      <PossibilitySection />
      <ShowcaseSlider />
<EstatesSection />
      {/* <ConstructionProcessSection /> */}
    </div>
  );
}
