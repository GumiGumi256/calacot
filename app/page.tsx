import ConstructionProcessSection from "@/components/construction-process-section";
import { CustomButton } from "@/components/custom-button";
import HeroSection from "@/components/hero-section";
import ShowcaseSlider from "@/components/showcase-slider";
import { getFeaturedDesigns } from "@/lib/queries/design";

export default async function Home() {
  const featuredDesigns = await getFeaturedDesigns();
  return (
    <main>
      <HeroSection featuredDesigns={featuredDesigns} />

      {/* Intro Section */}
      <section className="relative overflow-hidden px-6 md:py-10 md:px-10 lg:px-16">
       <div className="mx-auto grid max-w-7xl grid-cols-1 gap-14 lg:grid-cols-[1.4fr_0.8fr] lg:gap-24">
  {/* Left Content */}
  <div className="space-y-6">
    <h2 className="title font-light leading-[1.25]">
      Spaces shaped by
      <br className="hidden md:block" />
      intention and precision
    </h2>
  </div>

  {/* Right Content */}
  <div className="flex flex-col justify-center">
    <p className="text-p max-w-md leading-relaxed text-muted-foreground">
      From architectural concepts to interior environments and digital systems,
      every Calacot project is guided by clarity, function, and long-term value.
      We focus on how spaces are experienced — not just how they are built.
    </p>

    <div className="mt-8">
      <CustomButton className="bg-brand-black text-white dark:text-brand-accent dark:bg-primary">
        Start a Project
      </CustomButton>
    </div>
  </div>
</div>

        {/* Subtle Accent */}
        {/* <div
          className="absolute bottom-0 left-0 h-px w-full opacity-40 bg-linear-to-r from-transparent via-brand-black/50 dark:via-brand-primary/50 to-transparent"
        
        /> */}
      </section>

      <ShowcaseSlider />

      <ConstructionProcessSection />
    </main>
  );
}
