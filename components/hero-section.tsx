"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ArrowLeft, ArrowRight } from "lucide-react";
import { urlFor } from "@/sanity/lib/image";
import { SanityImageSource } from "@sanity/image-url/lib/types/types";
interface FeaturedDesign {
  title: string;
  description: string;
  slug: string;
  featuredImage: SanityImageSource; // Adjust type based on your Sanity image schema
}

interface HeroSectionProps {
  featuredDesigns: FeaturedDesign[];
}

export default function HeroSection({ featuredDesigns }: HeroSectionProps) {
  const designs = featuredDesigns.slice(0, 3);

  const [activeIndex, setActiveIndex] = useState(0);

  const activeDesign = designs[activeIndex];

  const handlePrev = () => {
    setActiveIndex((prev) => (prev === 0 ? designs.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev === designs.length - 1 ? 0 : prev + 1));
  };

  return (
    <section className="relative h-screen min-h-212.5 w-full overflow-hidden bg-brand-black text-brand-brand-white">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/hero-image.jpg"
          alt="Luxury residential architecture"
          fill
          priority
          className="object-cover brightness-75"
        />

        <div className="absolute inset-0 dark:bg-brand-brand-black/20" />

        <div className="absolute inset-0 bg-gradient-to-r from-brand-brand-black/65 via-brand-brand-black/25 to-brand-brand-black/40" />

        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-brand-brand-black/80 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto flex h-full max-w-[1600px] flex-col justify-between px-6 py-8 md:px-10 lg:px-14">
        <div />

        <div className="grid items-end gap-10 lg:grid-cols-[1.2fr_520px]">
          {/* Left Content */}
          <div className="max-w-5xl">
            <h1 className="max-w-5xl text-[65px] font-light leading-[1.15] text-brand-white md:text-[110px] md:tracking-[-0.06em] lg:text-[130px]">
              We Design &
              <br className="hidden md:block" />
              Build Modern Spaces
            </h1>

            <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:gap-10">
              <Link
                href="/start-project"
                className="inline-flex h-16 items-center justify-center rounded-2xl bg-brand-white px-10 text-base font-medium text-brand-black transition hover:bg-brand-white/90"
              >
                Start Your Project
              </Link>

              <p className="max-w-sm text-sm leading-relaxed text-brand-white/70">
                Calacot designs and builds modern spaces, from architecture and
                interiors to construction and software systems.
              </p>
            </div>
          </div>

          {/* Right Floating Cards */}
          <div className="relative pb-4">
            <div className="grid grid-cols-2 gap-4">
         {/* Card 1 */}
<div className="rounded-[28px] border border-brand-white/10 bg-brand-white/10 p-6 backdrop-blur-2xl">
  <div className="text-4xl font-light tracking-[-0.04em]">
    5+
  </div>

  <p className="mt-6 text-sm text-brand-brand-white/65">
    integrated disciplines
  </p>

  <p className="mt-3 text-xs text-brand-brand-white/40">
   Construction, Architecture, Interiors, Real Estate & Software
  </p>
</div>

{/* Card 2 */}
<div className="rounded-[28px] border border-brand-white/10 bg-brand-white/10 p-6 backdrop-blur-2xl">
  <div className="text-4xl font-light tracking-[-0.04em]">
    End-to-end
  </div>

  <p className="mt-6 text-sm text-brand-brand-white/65">
    design to execution workflow
  </p>

  <p className="mt-3 text-xs text-brand-brand-white/40">
    From concept → design → build → delivery
  </p>
</div>

              {activeDesign && (
                <div className="col-span-2 hidden overflow-hidden rounded-[32px] border border-brand-white/10 bg-brand-white/10 backdrop-blur-2xl md:block">
                  {/* Image */}
                  <div className="relative h-[240px] w-full overflow-hidden">
                    <Image
                      src={
                        urlFor(activeDesign.featuredImage).url() ||
                        "/slide-3.jpg"
                      }
                      alt={activeDesign.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 520px"
                      className="object-cover brightness-60 transition-all duration-500"
                    />
                  </div>

                  {/* Content */}
                  <div className="flex gap-5 p-6">
                    <div className="flex-1">
                      <h3 className="text-3xl font-medium">
                        {activeDesign.title}
                      </h3>

                      <p className="mt-3 max-w-md line-clamp-4 text-sm leading-relaxed text-brand-brand-white/70">
                        {activeDesign.description}
                      </p>

                      {/* Pagination */}
                      <div className="mt-6 flex items-center gap-2">
                        {designs.map((_, index) => (
                          <button
                            key={index}
                            onClick={() => setActiveIndex(index)}
                            className={`h-[2px] w-12 rounded-full transition-all ${
                              index === activeIndex
                                ? "bg-brand-white"
                                : "bg-brand-white/20"
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Side Action */}
                    <div className="flex flex-col justify-between">
                      <Link
                        href={`/architecture/designs/${activeDesign.slug}`}
                        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-white text-brand-black transition hover:bg-brand-white/90"
                      >
                        <ArrowUpRight className="h-5 w-5" />
                      </Link>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handlePrev}
                          className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand-white/10 bg-brand-white/5 transition hover:bg-brand-white/10"
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </button>

                        <button
                          onClick={handleNext}
                          className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand-white/10 bg-brand-white/5 transition hover:bg-brand-white/10"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
