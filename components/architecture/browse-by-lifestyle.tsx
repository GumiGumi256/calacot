import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const lifestyles = [
  {
    number: "01",
    title: "Growing Families",
    description: "Spacious 4–6 bedroom homes with room for everyone to grow.",
    image: "/modern-house-2.png",
    slug: "growing-families",
  },
  {
    number: "02",
    title: "First Home",
    description: "Practical homes designed for smaller plots and considered budgets.",
    image: "/simple-house.png",
    slug: "first-home",
  },
  {
    number: "03",
    title: "Luxury Living",
    description: "Large residences shaped around premium spaces and everyday ease.",
    image: "/luxury-home.jpg",
    slug: "luxury-living",
  },
  {
    number: "04",
    title: "Investment Properties",
    description: "Duplexes, rentals, and multi-unit designs made for long-term value.",
    image: "/urbanhouse.jpg",
    slug: "investment-properties",
  },
  {
    number: "05",
    title: "Compact Plots",
    description: "Thoughtful designs optimized for 50 × 100 and smaller sites.",
    image: "/modern-villa.png",
    slug: "compact-plots",
  },
] as const;

export default function BrowseByLifestyle() {
  return (
    <section
      className="border-y border-brand-black/10 bg-brand-white text-brand-black dark:border-brand-white/10 dark:bg-brand-black dark:text-brand-white section-space"
      aria-labelledby="browse-by-lifestyle-title"
    >
      <div className="site-container">
        <div className="mb-12 flex flex-col justify-between gap-8 md:mb-16 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <p className="mb-5 flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[.17em] opacity-60">
              <span className="size-1.5 rounded-full bg-brand-primary" />
              Find your fit
            </p>
            <h2
              id="browse-by-lifestyle-title"
              className="max-w-3xl section-heading"
            >
              Designed around
              <br />
              <span className="opacity-50">how you want to live.</span>
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-7 opacity-65 md:pb-1">
            Start with the life you are building, then find the spaces that can
            carry it. Explore our collection by what matters most to you.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {lifestyles.map((lifestyle) => (
            <Link
              key={lifestyle.slug}
              href={`/start-project?service=architecture&lifestyle=${lifestyle.slug}`}
              className="group relative isolate min-h-[390px] overflow-hidden rounded-2xl bg-brand-black text-brand-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary sm:min-h-[430px] lg:min-h-[480px]"
            >
              <Image
                src={lifestyle.image}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 20vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-brand-black/35 transition-colors duration-500 group-hover:bg-brand-black/25" />
              <div className="absolute inset-0 bg-linear-to-t from-brand-black/90 via-brand-black/10 to-transparent" />
              <div className="relative flex h-full flex-col justify-between p-5 sm:p-6">
                <span className="text-[11px] tracking-[.14em] text-brand-white/65">{lifestyle.number}</span>
                <div>
                  <div className="mb-5 flex items-end justify-between gap-3">
                    <h3 className="max-w-[12rem] text-2xl font-normal leading-[1.02] tracking-[-.04em] sm:text-[27px]">
                      {lifestyle.title}
                    </h3>
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-primary text-brand-black transition-transform duration-500 group-hover:rotate-45">
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </span>
                  </div>
                  <p className="max-w-[17rem] text-xs leading-6 text-brand-white/75">
                    {lifestyle.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
