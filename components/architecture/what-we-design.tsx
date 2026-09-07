"use client";

import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ARCHITECTURE_SERVICES } from "@/constants";


export default function WhatWeDesignSection() {
  const [active, setActive] = useState(0);

  return (
    <section className="relative overflow-hidden pt-14 md:pt-24">
      <div className="mx-auto max-w-7xl px-6 md:max-lg:px-10">
        {/* Header */}
        <div className="mb-14 flex flex-col justify-between gap-8 md:flex-row md:items-end md:max-lg:mb-10 md:max-lg:items-center">
          <div className="max-w-2xl">
            <h2 className="text-5xl font-light title md:text-7xl md:max-lg:text-5xl">
              What We
              <br />
               Visualize
            </h2>
          </div>

          <p className="max-w-md text-sm leading-relaxed text-p md:max-lg:max-w-xs">
            Calacot provides architectural visualization services 
            for studios, developers, and cultural institutions worldwide.
          </p>
        </div>

        {/* Desktop Cards with Animation */}
        <div className="hidden md:flex h-[660px] gap-3 overflow-hidden md:max-lg:h-[500px] md:max-lg:gap-2">
          {ARCHITECTURE_SERVICES.map((service, index) => {
            const isActive = active === index;

            return (
              <div
                key={index}
                onMouseEnter={() => setActive(index)}
                onClick={() => setActive(index)}
                onFocus={() => setActive(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActive(index);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-expanded={isActive}
                aria-label={service.title.replace(/\n/g, " ")}
                className={cn(
                  "group relative flex cursor-pointer overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-primary md:max-lg:min-w-0 md:max-lg:rounded-xl",
                  isActive ? "flex-2 md:max-lg:flex-[5]" : "flex-1"
                )}
              >
                {/* Image */}
                <div className="absolute inset-0">
                  <Image
                    src={service.image}
                    alt={service.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className={cn(
                      "object-cover transition-transform duration-1400 ease-out",
                      isActive ? "scale-110" : "scale-100"
                    )}
                  />
                </div>

                {/* Overlay */}
                <div
                  className={cn(
                    "absolute inset-0 transition-all duration-700",
                    isActive
                      ? "bg-brand-black/30"
                      : "bg-brand-black/50 group-hover:bg-brand-black/40"
                  )}
                />

                {/* Gradient */}
                <div className="absolute inset-0 bg-linear-to-t from-brand-black/80 via-brand-black/10 to-transparent" />

                {/* Content */}
                <div className="relative flex h-full w-full flex-col justify-end p-6 md:p-8 md:max-lg:p-6">
                  {/* Bottom Content */}
                  <div>
                    <div className="mb-6 flex items-start justify-between gap-4 md:max-lg:mb-4">
                      <h3
                        className={cn(
                          "whitespace-pre-line text-brand-white uppercase leading-[0.9] transition-all duration-700",
                          isActive
                            ? "text-4xl md:text-5xl md:max-lg:text-[2rem] md:max-lg:leading-[1.05]"
                            : "text-2xl md:text-3xl md:max-lg:absolute md:max-lg:bottom-6 md:max-lg:left-1/2 md:max-lg:-translate-x-1/2 md:max-lg:rotate-180 md:max-lg:whitespace-nowrap md:max-lg:text-lg md:max-lg:leading-tight md:max-lg:[writing-mode:vertical-rl]"
                        )}
                      >
                        {service.title}
                      </h3>

                      <div
                        className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-full bg-lime-300 text-black transition-all duration-500 md:max-lg:absolute md:max-lg:right-6 md:max-lg:top-6 md:max-lg:size-10",
                          isActive
                            ? "translate-y-0 opacity-100"
                            : "translate-y-4 opacity-0"
                        )}
                      >
                        <ArrowUpRight className="h-5 w-5" />
                      </div>
                    </div>

                    <p
                      className={cn(
                        "max-w-sm overflow-hidden text-sm leading-relaxed text-brand-white/75 transition-all duration-700",
                        isActive
                          ? "max-h-40 opacity-100"
                          : "max-h-0 opacity-0"
                      )}
                    >
                      {service.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Static cards for mobile. */}
        <div className="grid gap-4 md:hidden">
          {ARCHITECTURE_SERVICES.map((service, index) => (
            <div
              key={index}
              className="relative h-[460px] overflow-hidden md:max-lg:h-[420px] md:max-lg:min-w-0"
            >
              <Image
                src={service.image}
                alt={service.title}
                fill
                className="object-cover"
              />

              <div className="absolute inset-0 bg-black/45" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              <div className="relative flex h-full flex-col justify-end p-6">
                <h3 className="mb-4 whitespace-pre-line text-4xl font-light uppercase leading-[0.9] text-white md:max-lg:text-3xl md:max-lg:leading-tight">
                  {service.title}
                </h3>

                <p className="mb-6 text-sm leading-relaxed text-white/70">
                  {service.description}
                </p>

               
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
