"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import gsap from "gsap";
import { ArrowUpRight } from "lucide-react";

const divisions = [
  {
    id: "built-environment",
    number: "01",
    label: "Built Environment",
    division: "Calacot",
    title: "We create places that shape how people live.",
    description:
      "We bring architecture, construction, and interiors together to create thoughtful environments from initial concept to final detail.",
    capabilities: ["Architecture", "Construction", "Interiors"],
    href: "/built-environment",
    image: "/slide-5.jpg",
  },
  {
    id: "estates",
    number: "02",
    label: "Estates",
    division: "Calacot Estates",
    title: "We connect people with valuable places.",
    description:
      "We identify exceptional properties, strengthen market access, and build clearer pathways to ownership and long-term investment.",
    capabilities: ["Property", "Developments", "Investment"],
    href: "/real-estate",
    image: "/slide-2.jpg",
  },
  {
    id: "technology",
    number: "03",
    label: "Technology",
    division: "Calacot Technologies",
    title: "We build systems that move businesses forward.",
    description:
      "We create digital products and operating systems that streamline complex workflows and support sustainable operational growth.",
    capabilities: ["Products", "Systems", "Automation"],
    href: "/technologies",
    image: "/tech.jpg",
  },
];

export default function PossibilitySection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = divisions[activeIndex];

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }
      );
    }, panelRef);

    return () => ctx.revert();
  }, [activeIndex]);

  return (
    <section 
      className="w-full px-6 py-24 md:px-12 lg:px-16"
      aria-labelledby="capabilities-heading"
    >
      <div className="mx-auto max-w-7xl">
        {/* Header Section */}
        <header className="mb-16 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            
            <h2 
              id="capabilities-heading"
              className="font-heading text-4xl font-normal leading-tight sm:text-5xl md:text-6xl"
            >
              Different capabilities. <br />
              <span className="text-muted-foreground">One shared ambition.</span>
            </h2>
          </div>
          <div className="lg:col-span-5">
            <p className="max-w-md text-base text-muted-foreground leading-relaxed">
              Calacot unifies specialized disciplines under a single operational standard to shape environments, capture property value, and modernize enterprise systems.
            </p>
          </div>
        </header>

        {/* Tab Interface */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          {/* Navigation Tabs */}
          <div 
            role="tablist" 
            aria-label="Calacot Divisions"
            className="flex flex-col border-t border-border lg:col-span-4"
          >
            {divisions.map((item, index) => {
              const isActive = index === activeIndex;

              return (
                <button
                  key={item.id}
                  id={`tab-${item.id}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`panel-${item.id}`}
                  onClick={() => setActiveIndex(index)}
                  className={`group flex items-center justify-between border-b border-border py-6 text-left transition-colors ${
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs">{item.number}</span>
                    <span className="text-lg font-medium">{item.label}</span>
                  </div>
                  <span 
                    className={`h-2 w-2 rounded-full transition-all duration-300 ${
                      isActive ? "bg-primary scale-100" : "bg-transparent scale-0 group-hover:scale-50 group-hover:bg-muted-foreground"
                    }`} 
                  />
                </button>
              );
            })}
          </div>

          {/* Active Content Panel */}
          <div className="lg:col-span-8">
            <div
              id={`panel-${active.id}`}
              role="tabpanel"
              aria-labelledby={`tab-${active.id}`}
              ref={panelRef}
              className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-12"
            >
              {/* Image Frame */}
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-muted">
                <Image
                  src={active.image}
                  alt={active.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                />
              </div>

              {/* Editorial Details */}
              <div className="flex flex-col justify-between py-2">
                <div>
                  <p className="text-xs font-mono uppercase text-muted-foreground">
                    {active.division}
                  </p>
                  <h3 className="mt-3 text-2xl font-normal leading-snug md:text-3xl">
                    {active.title}
                  </h3>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
                    {active.description}
                  </p>

                  <div className="mt-8 border-t border-border pt-6">
                    <p className="mb-3 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                      Core Capabilities
                    </p>
                    <ul className="flex flex-wrap gap-2" aria-label="Capabilities list">
                      {active.capabilities.map((capability) => (
                        <li 
                          key={capability}
                          className="rounded-full bg-secondary/60 px-3 py-1 text-xs font-medium text-secondary-foreground"
                        >
                          {capability}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-8">
                  <Link
                    href={active.href}
                    className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground"
                  >
                    Explore {active.division}
                    <ArrowUpRight className="h-4 w-4" />
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