import { ServiceStructuredData } from "@/components/seo/structured-data";
import { pageMetadata } from "@/lib/seo";
import ExperienceSection from "@/components/painting/painting-experience";
import PaintingHero from "@/components/painting/painting-hero";
import PaintingProcess from "@/components/painting/painting-process";
import PaintingServices from "@/components/painting/painting-services";
import Image from "next/image";
import Link from "next/link";
import React from "react";

export const metadata = pageMetadata("/painting");

export default function Painting() {
  return (
    <div>
      <ServiceStructuredData path="/painting" />
      <PaintingHero />
      <ExperienceSection />
      <PaintingServices />
      < div className="grid w-full items-center gap-8 px-12 pt-8 mb-12 sm:px-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:px-10 md:pt-14 lg:px-16 lg:gap-20">
        <h2 className="sub-title min-w-0 leading-tight capitalize font-light md:max-lg:text-4xl">
          Your Trusted partner for <br className="md:max-lg:hidden" /> Exceptional Painting
        </h2>
        <p className="text-p min-w-0 max-w-[520px] pt-1 text-left leading-relaxed">
          Choosing the right painting company is crucial for achieving the
          desired transformation of your space. At Calacot, we are committed to
          delivering results through our expertise, attention to
          detail and dedication to customer satisfaction.
        </p>
      </div>
      <PaintingProcess />
       {/* Call to Action Section */}
      <section className="relative w-full  md:py-40 overflow-hidden">
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
        <div className="relative z-20 max-w-4xl ml-16 md:ml-auto text-center text-brand-black px-4 md:px-12 pb-10 md:pb-20">
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
            <Link href="/start-project?service=painting" className="bg-brand-white/10 backdrop-blur-sm hover:bg-white/20 text-brand-black font-medium px-8 py-3 rounded-full border border-white/30 transition-all duration-300">
              Get A Quote
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
