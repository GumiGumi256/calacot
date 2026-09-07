"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

export function InteriorsHero() {
  const heroRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const media = gsap.matchMedia();

      media.add("(prefers-reduced-motion: no-preference)", () => {
        const timeline = gsap.timeline({
          defaults: {
            ease: "power3.out",
          },
        });

        timeline
          .from("[data-hero-copy]", {
            y: 24,
            autoAlpha: 0,
            duration: 0.8,
            stagger: 0.08,
          })
          .from(
            "[data-image='left']",
            {
              x: -50,
              scale: 0.97,
              autoAlpha: 0,
              duration: 1,
            },
            "-=0.45",
          )
          .from(
            "[data-image='right']",
            {
              x: 50,
              scale: 0.97,
              autoAlpha: 0,
              duration: 1,
            },
            "-=0.85",
          );
      });

      return () => media.revert();
    },
    { scope: heroRef },
  );

  return (
    <section
      ref={heroRef}
      className="relative isolate min-h-svh overflow-hidden bg-brand-white px-5 pb-10 pt-28 text-brand-black dark:bg-brand-black dark:text-brand-white sm:px-8 sm:pb-14 sm:pt-32 lg:px-12 lg:pb-16"
    >
      {/* Subtle background atmosphere */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-0 -z-10 h-80 w-200 -translate-x-1/2 rounded-full bg-brand-primary/[0.07] blur-3xl dark:bg-brand-primary/4"
      />

      <div className="mx-auto flex min-h-[calc(100svh-9rem)] w-full max-w-360 flex-col">
        {/* Hero copy */}
        <div className="relative z-20 mx-auto max-w-4xl text-center">
          {/* <p
            data-hero-copy
            className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-black/50 dark:text-brand-white/45"
          >
            Calacot Interiors
          </p> */}

          <h1
            data-hero-copy
            className="mx-auto mt-5 max-w-5xl text-balance text-[clamp(2.75rem,6vw,5.75rem)] font-semibold leading-[0.94] tracking-[-0.055em]"
          >
            Interior design in Uganda, around how you live.
          </h1>

          <p
            data-hero-copy
            className="mx-auto mt-6 max-w-xl text-pretty text-base leading-7 text-brand-black/60 dark:text-brand-white/60 sm:text-lg sm:leading-8"
          >
            Thoughtful spaces shaped by light, material, comfort and the way
            everyday life actually happens.
          </p>

          <div data-hero-copy className="mt-8">
            <Link
              href="/start-project?service=interior-design"
              className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-brand-primary px-6 text-sm font-semibold text-brand-black shadow-[0_10px_30px_rgba(255,201,25,0.18)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(255,201,25,0.28)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary"
            >
              Discuss your interior

              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-300 group-hover:translate-x-1"
              />
            </Link>
          </div>
        </div>

        {/* Overlapping editorial images */}
        <div className="relative mx-auto mt-12 h-[27rem] w-full max-w-6xl flex-1 sm:mt-14 sm:h-[34rem] lg:mt-16 lg:min-h-[30rem]">
          {/* Left image */}
          <div
            data-image="left"
            className="absolute bottom-0 left-0 z-0 h-[47%] w-[74%] overflow-hidden rounded-2xl border border-brand-black/10 bg-muted shadow-[0_20px_60px_rgba(20,20,26,0.08)] dark:border-brand-white/10 dark:shadow-[0_20px_60px_rgba(0,0,0,0.25)] sm:h-[62%] sm:w-[58%] lg:h-[66%] lg:w-[56%]"
          >
            <Image
              src="/interior-hero-left.png"
              alt="Warm contemporary dining and living interior"
              fill
              priority
              sizes="(max-width: 640px) 74vw, (max-width: 1024px) 58vw, 650px"
              className="object-cover"
            />

            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-brand-black/10 to-transparent"
            />
          </div>

          {/* Right image */}
          <div
            data-image="right"
            className="absolute right-0 top-0 z-10 h-[61%] w-[83%] overflow-hidden rounded-2xl border border-brand-black/10 bg-muted shadow-[0_24px_70px_rgba(20,20,26,0.12)] dark:border-brand-white/10 dark:shadow-[0_24px_70px_rgba(0,0,0,0.35)] sm:h-[72%] sm:w-[61%] lg:h-[78%] lg:w-[58%]"
          >
            <Image
              src="/interior-hero-right.png"
              alt="Refined contemporary lounge with natural materials"
              fill
              priority
              sizes="(max-width: 640px) 83vw, (max-width: 1024px) 61vw, 680px"
              className="object-cover"
            />

            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-brand-black/10 to-transparent"
            />
          </div>
        </div>
      </div>
    </section>
  );
}