import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  SlidersHorizontal,
} from "lucide-react";

export default function DesignsHero() {
  return (
    <section
      aria-labelledby="designs-heading"
      className="relative isolate min-h-[760px] overflow-hidden 
                 md:min-h-[850px] lg:min-h-[900px] xl:min-h-[960px]"
    >
      {/* Intro */}
      <div
        className="relative z-20 mx-auto grid w-full max-w-[1600px] grid-cols-1
                   gap-8 px-5 pt-24
                   sm:px-8 sm:pt-28
                   lg:grid-cols-[1.35fr_0.65fr] lg:items-end lg:gap-16 lg:px-12 lg:pt-32
                   xl:px-16"
      >
        {/* Left */}
        <div>
        
          <h1
            id="designs-heading"
            className="max-w-[900px] text-[clamp(2.7rem,6vw,6.75rem)] font-normal
                       leading-[0.92] tracking-[-0.06em]"
          >
            Distinctive homes.
            <br />
            Extraordinary living.
          </h1>
        </div>

        {/* Right */}
        <div className="max-w-[420px] lg:justify-self-end lg:pb-2">
          <p className="text-sm leading-6 text-brand-black/60 dark:text-brand-white/60 sm:text-[15px] sm:leading-7">
            A considered space. A different way to live. Discover architectural
            ideas that bring your vision of home to life.
          </p>

          <Link
            href="#featured-designs"
            className="mt-6 inline-flex items-center gap-2 border border-brand-black/25 dark:border-brand-white/25 rounded-md p-2 text-center
                       pb-1 text-sm font-medium transition-colors hover:border-brand-black"
          >
            Explore our designs
            <ArrowDownRight size={16} aria-hidden="true" />
          </Link>
        </div>

        {/* Side note */}
        <span
          className="hidden items-center gap-2 text-[11px] uppercase tracking-[0.14em]
                     text-brand-black/45 dark:text-brand-white/45 xl:absolute xl:right-5 xl:top-1/2 xl:flex
                     xl:-translate-y-1/2 xl:[writing-mode:vertical-rl]"
        >
          Designed for living
          <ArrowDownRight size={14} aria-hidden="true" />
        </span>
      </div>

      {/* Architectural image */}
      <div
        className="relative z-10 mx-auto mt-2 h-[360px] w-full max-w-[1500px]
                   sm:mt-0 sm:h-[440px]
                   md:h-[520px]
                   lg:-mt-4 lg:h-[610px]
                   xl:-mt-10 xl:h-[680px]"
      >
        <Image
          src="/design-hero.png"
          alt="Contemporary Calacot architectural residence"
          fill
          priority
          sizes="(max-width: 640px) 115vw, (max-width: 1024px) 105vw, 1500px"
          className="object-contain object-center"
        />
      </div>

     

   
    </section>
  );
}
