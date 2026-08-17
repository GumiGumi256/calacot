"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative w-full pt-24 pb-16 px-6 md:px-12 lg:px-20 overflow-hidden">
      {/* Top Text Layout matching reference UI */}
      <div className="max-w-400 mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-12">
        {/* Left Heading */}
        <div className="lg:col-span-8">
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-heading font-light tracking-tight leading-[1.05]">
            We Make <br />
            Possibilities Real.
          </h1>
        </div>

        {/* Right Description */}
        <div className="lg:col-span-4 lg:pt-4 flex flex-col justify-between h-full">
          <p className="text-sm md:text-base  leading-relaxed max-w-sm">
            We create the environments where people live, businesses grow, and ideas become reality. From architecture and construction to real estate and technology, we bring ambitious possibilities to life.
          </p>
          <div className="mt-6">
            <Link
              href="/start-project"
              className="inline-flex items-center gap-2 text-sm font-medium text-brand-black dark:text-brand-primary underline underline-offset-8 hover:text-neutral-600 transition"
            >
               Bring an Idea to Life <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Image Showcase */}
      <div className="max-w-400 mx-auto">
        <div className="relative w-full h-[500px] md:h-[650px] lg:h-[750px] rounded-3xl overflow-hidden">
          <Image
            src="/modern-villa.png"
            alt="Calacot modern architectural villa"
            fill
            priority
            className="object-cover object-center"
          />
        </div>
      </div>
    </section>
  );
}