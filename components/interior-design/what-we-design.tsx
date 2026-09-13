import { buttonVariants } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Grid2X2,
  Layers3,
  Lightbulb,
  Palette,
  Route,
  Sparkles,
  SwatchBook,
  UsersRound,
} from "lucide-react";

const capabilities = [
  {
    value: "Space",
    label: "Planning",
    icon: Grid2X2,
  },
  {
    value: "Material",
    label: "Direction",
    icon: SwatchBook,
  },
  {
    value: "Lighting",
    label: "Strategy",
    icon: Lightbulb,
  },
  {
    value: "Furniture",
    label: "& Styling",
    icon: Layers3,
  },
];

const advantages = [
  {
    title: "Natural materials",
    description:
      "Warm, tactile materials selected for character, durability and everyday use.",
    icon: Palette,
  },
  {
    title: "Timeless aesthetics",
    description:
      "Restrained interiors designed to remain relevant beyond passing trends.",
    icon: Sparkles,
  },
  {
    title: "Built for everyday",
    description:
      "Comfort, circulation, storage and daily routines considered from the beginning.",
    icon: Route,
  },
  {
    title: "One connected team",
    description:
      "Interior, architecture, painting and execution decisions coordinated together.",
    icon: UsersRound,
  },
];

export function WhatWeDesign() {
  return (
    <section className="bg-brand-white text-brand-black transition-colors duration-300 dark:bg-brand-black dark:text-brand-white">
      {/* Crafted spaces */}
      <div className="section-space site-container">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Main image */}
          <div className="lg:col-span-7">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted sm:aspect-[16/10]">
              <Image
                src="/interior-residential.png"
                alt="Warm contemporary kitchen and dining interior"
                fill
                sizes="(max-width: 1024px) 100vw, 58vw"
                className="object-cover"
              />

              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-brand-black/15 via-transparent to-transparent"
              />
            </div>
          </div>

          {/* Message */}
          <div className="lg:col-span-5 lg:pl-4">
          
            <h2 className="mt-5 max-w-xl font-sans section-heading">
              Interiors that reflect you.
            </h2>

            <p className="mt-6 max-w-lg text-base leading-7 text-brand-black/60 dark:text-brand-white/60 sm:text-lg sm:leading-8">
              From calm contemporary homes to distinctive commercial and
              hospitality spaces, every interior is shaped around its people,
              purpose and architecture.
            </p>

            <Link
              href="/start-project?service=interior-design"
              className={buttonVariants({ variant: "default", size: "lg", className: "mt-8 inline-flex" })}
            >
              Discuss your space

              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-300 group-hover:translate-x-1"
              />
            </Link>
          </div>
        </div>

        {/* Capabilities instead of fake statistics */}
        <div className="mt-16 grid grid-cols-2 border-y border-brand-black/10 dark:border-brand-white/10 lg:mt-20 lg:grid-cols-4">
          {capabilities.map(({ value, label, icon: Icon }, index) => (
            <div
              key={`${value}-${label}`}
              className={`flex min-h-32 flex-col items-center justify-center px-4 py-7 text-center sm:min-h-36 ${
                index % 2 !== 0
                  ? "border-l border-brand-black/10 dark:border-brand-white/10"
                  : ""
              } ${
                index > 1
                  ? "border-t border-brand-black/10 dark:border-brand-white/10 lg:border-t-0"
                  : ""
              } ${
                index > 0
                  ? "lg:border-l lg:border-brand-black/10 dark:lg:border-brand-white/10"
                  : ""
              }`}
            >
              <Icon
                aria-hidden="true"
                strokeWidth={1.4}
                className="mb-4 size-5 text-brand-primary"
              />

              <p className="font-serif text-2xl leading-none sm:text-3xl">
                {value}
              </p>

              <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-brand-black/45 dark:text-brand-white/45">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Our advantage */}
      <div>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16 section-space site-container">
          {/* Editorial statement */}
          <div className="flex flex-col lg:col-span-5">
            

            <h2 className="mt-5 max-w-lg font-serif section-heading">
              Thoughtful design for real life.
            </h2>

            <p className="mt-6 max-w-lg text-base leading-7 text-brand-black/60 dark:text-brand-white/60">
              We bring together natural materials, considered planning and
              everyday functionality to create interiors that feel warm,
              balanced and distinctly yours.
            </p>

            <Link
              href="/start-project?service=interior-design"
              className="group mt-8 inline-flex w-fit items-center gap-3 text-sm font-semibold"
            >
              Begin your interior

              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-300 group-hover:translate-x-1"
              />
            </Link>
          </div>

          {/* Advantage panels */}
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
            {advantages.map(({ title, description, icon: Icon }) => (
              <article
                key={title}
                className="flex min-h-56 flex-col justify-between bg-brand-black p-7 text-brand-white dark:border dark:border-brand-white/10 dark:bg-[#1a191d] sm:min-h-60 sm:p-8"
              >
                <Icon
                  aria-hidden="true"
                  strokeWidth={1.25}
                  className="size-6 text-brand-primary"
                />

                <div className="mt-12">
                  <h3 className="font-serif text-2xl leading-tight">
                    {title}
                  </h3>

                  <p className="mt-3 max-w-sm text-sm leading-6 text-brand-white/55">
                    {description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}