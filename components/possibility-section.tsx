"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ArrowUpRight, Plus } from "lucide-react";

const possibilities = [
  {
    id: "create",
    number: "01",
    label: "CREATE",
    division: "Calacot",
    title: "We shape the physical world.",
    description:
      "From the first line drawn to the final detail, we design and create spaces made for living, working, and experiencing.",
    services: ["Architecture", "Construction", "Interiors"],
    href: "/",
    image: "/slide-5.jpg",
    statement: "Build something physical.",
  },
  {
    id: "own",
    number: "02",
    label: "OWN",
    division: "Calacot Estates",
    title: "We turn property into opportunity.",
    description:
      "We connect people with exceptional properties and create pathways to participate in the real estate opportunities shaping Uganda's future.",
    services: ["Premium Real Estate", "Developments", "Investment"],
    href: "/real-estate",
    image: "/slide-2.jpg",
    statement: "Participate in something valuable.",
  },
  {
    id: "scale",
    number: "03",
    label: "SCALE",
    division: "Calacot Technologies",
    title: "We build what makes businesses move.",
    description:
      "We create digital systems that help businesses operate smarter, connect their people, and turn complexity into growth.",
    services: ["Software", "Automation", "Digital Systems"],
    href: "/technologies",
    image: "/tech.jpg",
    statement: "Build something digital.",
  },
];

export default function PossibilitySection() {
  const [activeIndex, setActiveIndex] = useState(0);

  const imageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const active = possibilities[activeIndex];

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        imageRef.current,
        {
          opacity: 0,
          scale: 1.04,
        },
        {
          opacity: 1,
          scale: 1,
          duration: 0.8,
          ease: "power3.out",
        }
      );

      gsap.fromTo(
        contentRef.current,
        {
          opacity: 0,
          y: 20,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.65,
          ease: "power3.out",
        }
      );
    });

    return () => ctx.revert();
  }, [activeIndex]);

  return (
    <section className="relative w-full py-28 md:py-40 px-6 md:px-12 lg:px-20 overflow-hidden border-t border-border">
      <div className="max-w-[1600px] mx-auto">
        {/* Section Introduction */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-20 mb-20 md:mb-28">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-4 mb-7">
             

              <span className="h-px w-16 bg-border" />

              <span className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
                Possibility Takes Many Forms
              </span>
            </div>

            <h2 className="text-5xl sm:text-6xl md:text-7xl font-heading lg:text-8xl font-light tracking-tight leading-[0.95] max-w-4xl">
              What could your
              <br />
              <span className="text-muted-foreground">
                possibility become?
              </span>
            </h2>
          </div>

          <div className="lg:col-span-5 lg:pt-12">
            <p className="text-base md:text-lg leading-relaxed text-muted-foreground max-w-lg">
              A vision might begin as a sketch, become a building, grow into
              an investment, or evolve into a business powered by technology.
              Calacot brings the disciplines together to make it happen.
            </p>
          </div>
        </div>

        {/* Main Possibility Experience */}
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[650px] border-t border-border">
          {/* Left Navigation */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-border">
            <div className="flex flex-col">
              {possibilities.map((item, index) => {
                const isActive = index === activeIndex;

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveIndex(index)}
                    className="group text-left border-b border-border py-7 md:py-9 pr-6 lg:pr-10 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex gap-5">
                        <span
                          className={`text-xs pt-1 transition-colors duration-300 ${
                            isActive
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {item.number}
                        </span>

                        <div>
                          <p
                            className={`text-2xl md:text-3xl font-light tracking-tight transition-all duration-300 ${
                              isActive
                                ? "text-foreground"
                                : "text-muted-foreground group-hover:text-foreground"
                            }`}
                          >
                            {item.label}
                          </p>

                          <p
                            className={`mt-2 text-sm transition-all duration-300 ${
                              isActive
                                ? "text-muted-foreground"
                                : "text-muted-foreground/60"
                            }`}
                          >
                            {item.statement}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`mt-1 transition-transform duration-300 ${
                          isActive
                            ? "rotate-45 text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        <Plus className="w-5 h-5" />
                      </div>
                    </div>

                    {/* Active progress line */}
                    <div className="mt-6 h-px w-full bg-border overflow-hidden">
                      <div
                        className={`h-full bg-foreground transition-all duration-500 ${
                          isActive ? "w-full" : "w-0"
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Content */}
          <div className="lg:col-span-8 lg:pl-10 xl:pl-16 pt-10 lg:pt-0">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-10 h-full">
              {/* Image */}
              <div
                ref={imageRef}
                className="relative min-h-[400px] lg:min-h-[560px] overflow-hidden rounded-2xl"
              >
                <img
                  src={active.image}
                  alt={active.title}
                  className="absolute inset-0 h-full w-full object-cover"
                />

                {/* Image overlay */}
                <div className="absolute inset-0 bg-black/10" />

                {/* Division label */}
                <div className="absolute top-6 left-6">
                  <div className="rounded-full border border-white/30 bg-black/20 backdrop-blur-md px-4 py-2 text-xs tracking-[0.15em] uppercase text-white">
                    {active.division}
                  </div>
                </div>

                {/* Number */}
                <div className="absolute bottom-6 left-6 text-white">
                  <span className="text-xs tracking-[0.2em]">
                    {active.number} / 03
                  </span>
                </div>
              </div>

              {/* Content */}
              <div
                ref={contentRef}
                className="flex flex-col justify-center py-4 xl:py-12"
              >
                <span className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-5">
                  {active.division}
                </span>

                <h3 className="text-4xl md:text-5xl xl:text-6xl font-light tracking-tight leading-[1]">
                  {active.title}
                </h3>

                <p className="mt-7 text-base md:text-lg leading-relaxed text-muted-foreground max-w-xl">
                  {active.description}
                </p>

                {/* Services */}
                <div className="mt-10 border-t border-border pt-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-5">
                    What we bring together
                  </p>

                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    {active.services.map((service) => (
                      <span
                        key={service}
                        className="text-sm md:text-base text-foreground"
                      >
                        {service}
                      </span>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <div className="mt-10">
                  <Link
                    href={active.href}
                    className="inline-flex items-center gap-3 text-sm font-medium underline underline-offset-8 hover:text-muted-foreground transition-colors"
                  >
                    Explore {active.division}
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

      
      </div>
    </section>
  );
}