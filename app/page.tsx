import ConstructionProcessSection from "@/components/construction-process-section";
import { CustomButton } from "@/components/custom-button";
import HeroSection from "@/components/hero-section";
import ShowcaseSlider from "@/components/showcase-slider";

export default function Home() {
  return (
    <main>
      <HeroSection />

      {/* Intro Section */}
      <section className="relative overflow-hidden px-6 py-20 md:px-10 lg:px-16">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-14 lg:grid-cols-[1.4fr_0.8fr] lg:gap-24">
          
          {/* Left Content */}
          <div className="space-y-6">
           

            <h2 className="title font-light leading-[1.25]">
              A modern studio
              <br className="hidden md:block" />
              with a clear focus
            </h2>
          </div>

          {/* Right Content */}
          <div className="flex flex-col justify-center">
            <p className="text-p max-w-md leading-relaxed text-muted-foreground">
            Calacot is a premier design and construction company specializing in high-end residential projects, delivering exceptional spaces that embody our clients&apos; unique visions.
            </p>

            <div className="mt-8">
              <CustomButton className="bg-brand-black text-white dark:text-brand-accent dark:bg-primary">
                Contact us
              </CustomButton>
            </div>
          </div>
        </div>

        {/* Subtle Accent */}
        <div
          className="absolute bottom-0 left-0 h-px w-full opacity-40 bg-linear-to-r from-transparent via-brand-black/50 dark:via-brand-primary/50 to-transparent"
        
        />
      </section>
      <section>
        <ShowcaseSlider />
      </section>
      <ConstructionProcessSection />
    </main>
  );
}