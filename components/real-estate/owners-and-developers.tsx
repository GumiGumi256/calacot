"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

const audiences = {
  owners: {
    label: "For owners",
    title: "Give your property its next chapter.",
    description:
      "Looking to sell your home, land or commercial property? Discuss listing it on Calacot Estates and having our team support the sale.",
    supporting:
      "Share your property details and your expectations. We’ll review your submission and discuss the next steps with you.",
    cta: "Submit your property",
    href:'/list-property?type=individual'
  },
  developers: {
    label: "For developers",
    title: "Bring your development to its next owners.",
    description:
      "Discuss listing your development on Calacot Estates and working with our team to connect your available properties with prospective buyers.",
    supporting:
      "Tell us about your development, available units and sales objectives. We’ll review the details and discuss how we could work together.",
    cta: "Submit your development",
    href:'/list-property?type=development'
  },
};
type Audience = keyof typeof audiences;

export default function OwnersAndDevelopers() {
  const [audience, setAudience] = useState<Audience>("owners");
  const content = audiences[audience];

  return (
    <section
      id="developers"
      className="bg-brand-white text-brand-black dark:bg-brand-black dark:text-brand-white"
    >
      <div className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-16">
        <div className="grid items-center gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-8 lg:grid-cols-2 lg:gap-16">
          {/* Image composition */}
          <div className="relative mx-auto w-full max-w-md pb-7 pl-6 pt-3 sm:pl-10 md:max-lg:pl-4">
            <div className="relative aspect-[4/4.3] overflow-hidden rounded-md bg-[#eee9df] dark:bg-[#292620] md:max-lg:aspect-[3/4]">
              <Image
                src="/urbanhouse.jpg"
                alt=""
                fill
                sizes="(min-width: 1152px) 408px, (min-width: 1024px) calc((100vw - 144px) / 2 - 40px), (min-width: 768px) calc((100vw - 112px) * 0.45 - 16px), (min-width: 640px) 408px, (min-width: 496px) 424px, calc(100vw - 72px)"
                className="object-cover object-center"
              />
            </div>

            {/* Upper caption */}
            <div className="absolute left-0 top-8 max-w-[18rem] rounded-md bg-brand-white/40 px-3 py-2 shadow-sm dark:bg-brand-black/20 backdrop-blur-3xl sm:top-10 md:max-lg:max-w-[calc(100%-1rem)]">
              <p className="text-sm font-semibold tracking-tight">
                List with Calacot Estates
              </p>

              <p className="mt-1 text-xs leading-5 text-brand-black/60 dark:text-brand-white/60">
                Introduce your property to prospective buyers.
              </p>
            </div>

            {/* Lower caption */}
            <div className="absolute bottom-0 right-3 max-w-[18rem] rounded-md bg-brand-white/40 px-3 py-2 shadow-sm dark:bg-brand-black/20 backdrop-blur-3xl sm:right-7 md:max-lg:right-0 md:max-lg:max-w-[calc(100%-1rem)]">
              <p className="text-sm font-semibold tracking-tight">
                Discuss sales representation
              </p>

              <p className="mt-1 text-xs leading-5 text-brand-black/60 dark:text-brand-white/60">
                A conversation about your property and goals.
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="min-w-0">
            <div
              role="group"
              aria-label="Choose your property relationship"
              className="inline-flex gap-1 rounded-md bg-brand-black/[0.04] p-1 dark:bg-brand-white/[0.06]"
            >
              {(Object.keys(audiences) as Audience[]).map((key) => {
                const active = audience === key;

                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    aria-controls="property-audience-content"
                    onClick={() => setAudience(key)}
                    className={`min-h-11 rounded-sm px-4 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary sm:px-5 sm:text-sm ${
                      active
                        ? "bg-brand-primary text-brand-black"
                        : "text-brand-black/60 hover:text-brand-black dark:text-brand-white/60 dark:hover:text-brand-white"
                    }`}
                  >
                    {audiences[key].label}
                  </button>
                );
              })}
            </div>

            <div id="property-audience-content">
              <h2 className="mt-6 max-w-[19ch] text-3xl font-semibold leading-[1.12] tracking-[-0.04em] md:text-[2rem] lg:text-[2.65rem]">
                {content.title}
              </h2>

              <p className="mt-5 max-w-md text-sm leading-7 text-brand-black/65 dark:text-brand-white/65 md:max-lg:leading-6 lg:text-base">
                {content.description}
              </p>

              <p className="mt-3 max-w-md text-sm leading-7 text-brand-black/65 dark:text-brand-white/65 md:max-lg:leading-6 lg:text-base">
                {content.supporting}
              </p>

              <Link
                href={content.href}
                className="group mt-6 inline-flex min-h-12 items-center justify-center gap-3 rounded-md bg-brand-primary px-5 py-3 text-sm font-semibold text-brand-black transition-colors hover:bg-brand-primary/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary"
              >
                {content.cta}

                <ArrowUpRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
