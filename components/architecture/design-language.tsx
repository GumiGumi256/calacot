"use client";

import Image from "next/image";
import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const panels = [
  {
    title: "Visual Clarity",
    description:
      "Every line, shadow, and reflection rendered with architectural precision. The language of space translated through meticulous digital craftsmanship.",
    image:
      "/concept-1.jpg",
  },
  {
    title: "Atmospheric Depth",
    description:
      "Light behaves naturally. Materials breathe authentically. Each composition captures the quiet dialogue between structure and environment.",
    image:
      "/concept-2.jpg",
  },
  {
    title: "Narrative Resolution",
    description:
      "Beyond documentation — storytelling through spatial sequence. From concept to completion, we articulate design intent with unwavering fidelity.",
    image:
      "/concept-3.jpg",
  },
];

export default function DesignLanguageSection() {
  const container = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      const panels =
        gsap.utils.toArray<HTMLElement>(".design-panel");

      panels.forEach((panel, index) => {
        const image =
          panel.querySelector<HTMLElement>(".panel-image");

        const content =
          panel.querySelector<HTMLElement>(".panel-content");

        // Image scale effect
        gsap.fromTo(
          image,
          {
            scale: 1,
          },
          {
            scale: 1.08,
            ease: "none",
            scrollTrigger: {
              trigger: panel,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          }
        );

        // Content reveal
        gsap.fromTo(
          content,
          {
            y: 100,
            opacity: 0,
          },
          {
            y: 0,
            opacity: 1,
            duration: 1.2,
            ease: "power3.out",
            scrollTrigger: {
              trigger: panel,
              start: "top 65%",
            },
          }
        );

        // Stacked pinned panels
        ScrollTrigger.create({
          trigger: panel,
          start: "top top",
          pin: true,
          pinSpacing: false,
          end: "+=100%",
        });

        // Subtle upward movement
        if (index !== panels.length - 1) {
          gsap.to(panel, {
            y: -80,
            ease: "none",
            scrollTrigger: {
              trigger: panel,
              start: "top top",
              end: "bottom top",
              scrub: true,
            },
          });
        }
      });
    },
    {
      scope: container,
    }
  );

  return (
    <section
      ref={container}
      className="relative"
    >
      {/* Intro */}
      <div className="mx-auto max-w-7xl px-6 py-10 md:py-32">
        <div className="max-w-4xl">
          <h2 className="text-4xl font-light uppercase title-2 md:text-7xl w-full">
            Where vision meets <br />
            visual articulation.
          </h2>

          <p className="mt-10 max-w-lg text-sm leading-relaxed text-p md:text-base">
            Calacot translates architectural ambition into compelling visual narrative. 
            Each frame upholds the rigor of design while evoking the atmosphere of place.
          </p>
        </div>
      </div>

      {/* Panels */}
      <div className="relative">
        {panels.map((panel, index) => (
          <div
            key={index}
            className="design-panel relative h-screen overflow-hidden"
          >
            {/* Background */}
            <div className="panel-image absolute inset-0 w-full">
              <Image
                src={panel.image}
                alt={panel.title}
                fill
                 sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
                priority={index === 0}
                className="object-cover"
              />
            </div>

            {/* Overlay */}
            <div className="absolute inset-0 bg-brand-black/5 dark:bg-brand-black/45" />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-black via-brand-black/10 to-transparent" />

            {/* Content */}
            <div className="panel-content relative flex h-full items-end">
              <div className="mx-auto flex w-full max-w-7xl flex-col justify-between gap-10 px-6 pb-16 md:flex-row md:items-end md:pb-24">
                <div>
                  <p className="mb-4 text-xs uppercase tracking-[0.35em] text-brand-white/50">
                    0{index + 1}
                  </p>

                  <h3 className="text-5xl font-light uppercase leading-[0.9] tracking-[-0.05em] md:text-8xl text-brand-white">
                    {panel.title}
                  </h3>
                </div>

                <p className="max-w-md text-sm leading-relaxed text-white/70 md:text-base">
                  {panel.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}