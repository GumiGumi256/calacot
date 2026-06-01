"use client";

import React, { useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Link from "next/link";

export default function PaintingHero() {
  const container = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.from(".hero-title", {
        y: 40,
        opacity: 0,
        duration: 0.8,
      })
        .from(
          ".hero-sub",
          {
            y: 20,
            opacity: 0,
            duration: 0.6,
          },
          "-=0.4",
        )
        .from(
          ".hero-cta",
          {
            y: 20,
            opacity: 0,
            duration: 0.5,
          },
          "-=0.3",
        );
    },
    { scope: container },
  );

  return (
    <section
      ref={container}
      className="relative flex h-dvh items-center justify-center overflow-hidden"
    >
      {/* Light mode image - visible only in light theme */}
      <div className="absolute inset-0 block dark:hidden">
        <Image
          src="/painting-hero-light.png"
          alt="Painting hero background"
          fill
          priority
          quality={100}
          sizes="100vw"
          className="object-cover"
        />
      </div>

      {/* Dark mode image - visible only in dark theme */}
      <div className="absolute inset-0 hidden dark:block">
        <Image
          src="/painting-hero-dark.png"
          alt="Painting hero background (dark)"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>

      {/* Centered content */}
      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center mb-44 md:mb-64">
        <h1 className="sub-title font-light text-4xl tracking-tight text-neutral-900 dark:text-white md:text-5xl lg:text-6xl hero-title">
          Brighten Your Home with Professional Painting
        </h1>

        <p className="hero-sub mx-auto mt-5 max-w-2xl text-base text-neutral-700 dark:text-neutral-200 md:text-lg">
          Transform your space with high-quality interior and exterior painting
          services. Clean finishes, modern color palettes, and long-lasting
          craftsmanship.
        </p>

        <div className="hero-cta mt-4 flex flex-col gap-4 md:flex-row justify-center">
          <Link href="/start-project?service=painting">
            <Button
              size="lg"
              className="rounded-full px-8 shadow-md transition-transform hover:scale-105"
            >
              Start A Project
            </Button>
          </Link>
           <Link href="/start-project?service=painting">
            <Button
            variant="outline"
              size="lg"
              className="rounded-full px-8 shadow-md transition-transform hover:scale-105"
            >
              Get A Quote
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
