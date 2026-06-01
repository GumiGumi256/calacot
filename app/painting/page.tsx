import ExperienceSection from "@/components/painting/painting-experience";
import PaintingHero from "@/components/painting/painting-hero";
import PaintingProcess from "@/components/painting/painting-process";
import PaintingServices from "@/components/painting/painting-services";
import Image from "next/image";
import Link from "next/link";
import React from "react";

export default function Painting() {
  return (
    <main>
      <PaintingHero />
      <ExperienceSection />
      <PaintingServices />
      <div className="space-y-10 px-12 md:px-16 pt-8 md:pt-14  flex flex-col md:flex-row md:justify-between w-full items-center gap-8 md:gap-20 mb-12">
        <h2 className="sub-title leading-tight whitespace-nowrap  capitalize font-light">
          Your Trusted partner for <br /> Exceptional Painting
        </h2>
        <p className="text-p leading-relaxed pt-1 text-left  max-w-[520px]">
          Choosing the right painting company is crucial for achieving the
          desired transformation of your space. At Calacot, we are committed to
          delivering results through our expertise, attention to
          detail and dedication to customer satisfaction.
        </p>
      </div>
      <PaintingProcess />
       {/* Call to Action Section */}
      <section className="relative w-full py-10  md:py-40 overflow-hidden">
        {/* Next.js Image as background */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/painting-cta.png"
            alt="Professional painting services by Calacot"
            fill
            className="object-cover object-bottom"
            priority
          />
        </div>
    

        {/* Content */}
        <div className="relative z-20 max-w-4xl ml-24 md:ml-auto text-center text-brand-black px-6 md:px-12 pb-10 md:pb-20">
          <h2 className="text-2xl md:text-5xl lg:text-6xl font-light tracking-tight">
            Transform Your Space with <br />
            <span className="font-semibold">Professional Painting</span>
          </h2>
          <p className="mt-6 text-base md:text-xl text-brand-black/80 max-w-2xl mx-auto">
            From residential to commercial projects, Calacot delivers flawless
            finishes and lasting beauty. Let our experts bring your vision to life.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/start-project?service=painting" className="bg-brand-black hover:bg-brand-black/90 text-white font-medium px-8 py-3 rounded-full transition-all duration-300 shadow-lg">
              Start A Project
            </Link>
            <Link href="/get-quote" className="bg-brand-white/10 backdrop-blur-sm hover:bg-white/20 text-brand-black font-medium px-8 py-3 rounded-full border border-white/30 transition-all duration-300">
              Get A Quote
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
