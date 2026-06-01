// components/hero/luxury-hero.tsx

"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ArrowLeft, ArrowRight } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative h-screen min-h-[850px] w-full overflow-hidden bg-black text-brand-white">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/hero-image.jpg"
          alt="Luxury residential architecture"
          fill
          priority
          className="object-cover"
        />

        {/* Dark Overlay */}
        <div className="absolute inset-0 dark:bg-brand-black/20" />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-brand-black/65 via-brand-black/25 to-brand-black/40" />

        {/* Bottom Glow */}
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-brand-black/80 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto flex h-full max-w-[1600px] flex-col justify-between px-6 py-8 md:px-10 lg:px-14">
        {/* Top */}
        <div />

        {/* Bottom Section */}
        <div className="grid items-end gap-10 lg:grid-cols-[1.2fr_520px]">
          {/* Left Content */}
          <div className="max-w-5xl">
            <h1 className="max-w-5xl text-[65px]  font-light leading-[1.15] md:tracking-[-0.06em] text-brand-white md:text-[110px] lg:text-[130px]">
              High-end
              <br className="hidden md:block" />
              project design
              <br className="hidden md:block" />
              & build
            </h1>

            <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:gap-10">
              <Link
                href="/contact"
                className="inline-flex h-16 items-center justify-center rounded-2xl bg-brand-white px-10 text-base font-medium text-brand-black transition hover:bg-brand-white/90"
              >
                Discuss the Project
              </Link>

              <p className="max-w-sm text-sm leading-relaxed text-brand-white/70">
                Our work is defined by careful thinking, technical innovation
                and attention to detail.
              </p>
            </div>
          </div>

          {/* Right Floating Cards */}
          <div className="relative pb-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Card 1 */}
              <div className="rounded-[28px] border border-white/10 bg-white/10 p-6 backdrop-blur-2xl">
                <div className="text-6xl font-light tracking-[-0.04em]">
                  10+
                </div>

                <p className="mt-12 text-sm text-brand-white/65">
                  years of experience
                </p>
              </div>

              {/* Card 2 */}
              <div className="rounded-[28px] border border-white/10 bg-white/10 p-6 backdrop-blur-2xl">
                <div className="text-6xl font-light tracking-[-0.04em]">
                  75+
                </div>

                <p className="mt-12 text-sm text-brand-white/65">
                  completed projects
                </p>
              </div>

              {/* Large Project Card */}
              <div className="col-span-2 hidden md:block overflow-hidden rounded-[32px] border border-white/10 bg-white/10 backdrop-blur-2xl">
                {/* Image */}
                <div className="relative h-[240px] w-full overflow-hidden">
                  <Image
                    src="/slide-3.jpg"
                    alt="Ridge House"
                    fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover brightness-60"
                  />
                </div>

                {/* Content */}
                <div className="flex gap-5 p-6">
                  <div className="flex-1">
                    <h3 className="text-3xl font-medium">Modern Design</h3>

                    <p className="mt-3 max-w-md text-sm leading-relaxed text-brand-white/70">
                      A discrete home structured around an inward courtyard,
                      allowing natural light, airflow and outdoor spaces to
                      shape the layout.
                    </p>

                    {/* Pagination */}
                    {/* <div className="mt-6 flex items-center gap-2">
                      <div className="h-[2px] w-12 rounded-full bg-white" />
                      <div className="h-[2px] w-12 rounded-full bg-white/20" />
                      <div className="h-[2px] w-12 rounded-full bg-white/20" />
                    </div> */}
                  </div>

                  {/* Side Action */}
                  <div className="flex flex-col justify-between">
                    <button className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black transition hover:bg-white/90">
                      <ArrowUpRight className="h-5 w-5" />
                    </button>

                    {/* <div className="flex items-center gap-2">
                      <button className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition hover:bg-white/10">
                        <ArrowLeft className="h-4 w-4" />
                      </button>

                      <button className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition hover:bg-white/10">
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div> */}
                  </div>
                </div>
              </div>
            </div>


          </div>
        </div>
      </div>
    </section>
  );
}