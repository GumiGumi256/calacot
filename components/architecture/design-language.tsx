"use client";

import Image from "next/image";
import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const panels = [
  {
    title: "Form & Function",
    description:
      "Simple building forms, clear circulation, and well-proportioned rooms. We explore how entrances, living areas, and private spaces connect to support everyday use.",
    image:
      "/concept-1.jpg",
  },
  {
    title: "Light & Materials",
    description:
      "Window placement, shading, and material choices shape the character of a building. Our visualizations show how daylight meets concrete, timber, glass, and other finishes.",
    image:
      "/concept-2.jpg",
  },
  {
    title: "Inside & Outside",
    description:
      "Terraces, courtyards, and gardens extend living space beyond the walls. We explore how openings and views connect a building to its site while maintaining privacy.",
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
      <div className="mx-auto max-w-7xl px-6 py-10 md:py-32 md:max-lg:px-10 md:max-lg:py-20">
        <div className="max-w-4xl">
          <h2 className="text-4xl font-light uppercase title-2 md:text-7xl w-full md:max-lg:text-5xl">
            Modern architecture.<br />
            Designed for daily life.
          </h2>

          <p className="mt-10 max-w-lg text-sm leading-relaxed text-p md:text-base">
            Calacot visualizes modern buildings with attention to how they work:
            the arrangement of rooms, access to daylight, material finishes,
            and connections to outdoor space. See how design decisions come
            together before construction begins.
          </p>
        </div>
      </div>

      {/* Panels */}
      <div className="relative">
        {panels.map((panel, index) => (
          <div
            key={index}
            className="design-panel relative h-screen overflow-hidden max-lg:flex max-lg:h-auto max-lg:flex-col max-lg:bg-brand-black"
          >
            {/* Background */}
            <div className="absolute inset-0 overflow-hidden max-lg:relative max-lg:inset-auto max-lg:aspect-[4/3] max-lg:w-full max-lg:shrink-0 md:max-lg:aspect-video">
              <div className="panel-image absolute inset-0 w-full">
              <Image
                src={panel.image}
                alt={panel.title}
                fill
                sizes="100vw"
                priority={index === 0}
                className="object-cover"
              />
              </div>
              {/* Keep the smaller-screen images clear, fading only their lower edge. */}
              <div className="absolute inset-0 bg-brand-black/5 dark:bg-brand-black/45 max-lg:hidden" />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-black via-brand-black/10 to-transparent max-lg:top-auto max-lg:h-20 max-lg:via-brand-black/20" />
            </div>

            {/* Content */}
            <div className="panel-content relative flex h-full items-end max-lg:h-auto">
              <div className="mx-auto flex w-full max-w-7xl flex-col justify-between gap-6 px-6 pb-10 pt-6 lg:gap-10 lg:pt-0 lg:pb-24 lg:flex-row lg:items-end md:max-lg:px-10 md:max-lg:pb-12">
                <div>
                  <p className="mb-4 text-xs uppercase tracking-[0.35em] text-brand-white/50">
                    0{index + 1}
                  </p>

                  <h3 className="text-4xl font-light uppercase leading-tight tracking-[-0.05em] sm:text-5xl lg:text-8xl lg:leading-[0.9] text-brand-white">
                    {panel.title}
                  </h3>
                </div>

                <p className="max-w-md text-sm leading-relaxed text-white/70 md:text-base md:max-lg:max-w-2xl">
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
