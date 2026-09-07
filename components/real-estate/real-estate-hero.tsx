import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function RealEstateHero() {
  return (
    <section className="relative isolate overflow-hidden bg-brand-white text-brand-black dark:bg-brand-black dark:text-brand-white">
      <div className="relative flex min-h-[85vh] flex-col justify-between pt-16 md:min-h-[640px] md:flex-row md:items-center md:pt-0 lg:min-h-[680px] xl:min-h-[760px]">

        {/* Left Column: Text & Primary CTA */}
        <div className="relative z-20 flex flex-col justify-center px-6 pb-12 pt-16 sm:px-10 md:w-[52%] md:py-16 md:pl-10 md:pr-4 lg:w-[50%] lg:py-20 lg:pl-12 lg:pr-8 xl:pl-16">
          <h1 className="mt-4 text-balance text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.04em] lg:text-[clamp(3.25rem,4.8vw,4.75rem)]">
            Real estate in Uganda. <br />
            Find a place to{" "}
            <span className="text-brand-primary">
              live.
            </span>
          </h1>

          <p className="mt-5 max-w-lg text-sm leading-relaxed text-brand-black/65 dark:text-brand-white/65 sm:text-base sm:leading-7 lg:mt-6 lg:leading-8">
            A considered approach to real estate in Uganda. For those who
            value thoughtful architecture, a distinctive setting and a place
            that reflects how they want to live.
          </p>

          <div className="mt-8">
            <Link
              href="/contact?intent=buy-home"
              className="group inline-flex min-h-12 items-center justify-center gap-4 rounded-sm bg-brand-primary px-7 py-3.5 text-sm font-semibold text-brand-black transition-colors hover:bg-brand-primary/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary"
            >
              Begin your property search
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
          </div>
        </div>

        {/* Right Column: Scaled Building Image with Bottom Fade on Tablet/Desktop */}
        <div className="relative z-10 h-[480px] w-full md:absolute md:inset-y-0 md:right-0 md:h-full md:w-[52%] lg:w-[54%]">

          {/* Mask added here: Fades out the bottom 25% on tablet & desktop */}
          <div className="absolute inset-0 right-0 -top-12 h-full w-full md:top-0 md:[mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)]">
            <Image
              src="/real-estate-hero-2.png"
              alt="Contemporary residential architecture"
              fill
              priority
              sizes="(max-width: 767px) 100vw, (max-width: 1023px) 52vw, 54vw"
              className="object-cover object-bottom-right md:object-contain md:object-right-bottom"
            />
          </div>

        </div>

      </div>
    </section>
  );
}