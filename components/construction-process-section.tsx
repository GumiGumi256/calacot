"use client";

import { useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Card } from "@/components/ui/card";
import { STEPS } from "@/constants";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis();

export default function ConstructionProcessSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const cards = gsap.utils.toArray<HTMLElement>(".process-card");

    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);

    const isMobile = window.innerWidth < 768;

    // =================================================
    // MOBILE: slide-in one by one (NO STACKING ISSUE)
    // =================================================
   if (isMobile) {
  const cards = gsap.utils.toArray<HTMLElement>(".process-card");

  const pairs: HTMLElement[][] = [];

  for (let i = 0; i < cards.length; i += 2) {
    pairs.push([cards[i], cards[i + 1]].filter(Boolean));
  }

  // initial state
  gsap.set(cards, {
    x: 120,
    opacity: 0,
    scale: 0.98,
  });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: sectionRef.current,
      start: "top top",
      end: `+=${pairs.length * window.innerHeight}`,
      scrub: 0.5,
      pin: true,
    },
  });

  pairs.forEach((pair, i) => {
    const start = i * 0.9;

    // ENTER pair
    tl.to(
      pair,
      {
        x: 0,
        opacity: 1,
        scale: 1,
        duration: 0.6,
        ease: "power3.out",
        stagger: 0.05,
      },
      start
    )

      // HOLD then EXIT slightly
      .to(
        pair,
        {
          x: -80,
          opacity: 0,
          scale: 0.98,
          duration: 0.5,
          ease: "power3.in",
        },
        start + 0.6
      );
  });
}

    // =================================================
    // DESKTOP: paired left/right animation system
    // =================================================

    const pairs: HTMLElement[][] = [];

    for (let i = 0; i < cards.length; i += 2) {
      pairs.push([cards[i], cards[i + 1]].filter(Boolean));
    }

    pairs.forEach((pair, i) => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: () => `top -${i * window.innerHeight * 0.8}`,
          end: () => `+=${window.innerHeight}`,
          scrub: 0.4,
        },
      });

      // ENTER
      tl.fromTo(
        pair,
        {
          y: 140,
          opacity: 0,
          scale: 0.9,
          filter: "blur(12px)",
        },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.4,
          ease: "power3.out",
        }
      )

        // EXIT (reverse animation)
        .to(
          pair,
          {
            y: -140,
            opacity: 0,
            scale: 0.9,
            filter: "blur(12px)",
            duration: 0.35,
            ease: "power3.in",
          },
          ">0.15"
        );
    });

    ScrollTrigger.create({
      trigger: sectionRef.current,
      start: "top top",
      end: `+=${pairs.length * window.innerHeight}`,
      pin: true,
    });
  }, { scope: sectionRef });

  return (
    <section
      ref={sectionRef}
      className="relative h-dvh overflow-hidden bg-black text-white"
    >
      {/* Background */}
      <div className="absolute inset-0">
        <Image
          src="/luxury-home.jpg"
          alt="Luxury Home"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black/70" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col px-6 py-8 md:px-10 lg:px-16">
        {/* Header */}
        <div className="flex items-start justify-between gap-10">
          <div className="max-w-4xl">
            <h2 className="leading-[0.85] tracking-[-0.06em] text-white">
              <span className="block text-[4.5rem] font-light md:text-[8rem]">
                Steps to your
              </span>
              <span className="ml-[12%] block text-[4.5rem] font-light md:text-[8rem]">
                new home
              </span>
            </h2>
          </div>
        </div>

        {/* Cards */}
        <div className="relative mt-10 flex flex-col gap-10 md:block">
          {STEPS.map((step, i) => {
            const isLeft = i % 2 === 0;

            return (
              <Card
                key={step.number}
                className={`process-card w-[300px] border border-white/10 bg-white/[0.08] p-5 text-white shadow-2xl backdrop-blur-2xl
  md:absolute
  ${isLeft ? "md:left-[12%]" : "md:right-[12%]"}
`}
              >
                <div className="text-6xl font-light leading-none text-white/90">
                  {step.number}
                </div>

                <div className="mt-4">
                  <h3 className="text-[2rem] font-medium leading-tight tracking-[-0.04em]">
                    {step.title}
                  </h3>

                  <p className="mt-3 text-base leading-relaxed text-white/70">
                    {step.description}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}