"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden px-5 pb-8 pt-24 sm:px-8 md:px-12 lg:px-20 lg:pb-14">
      {/* Hero content */}
      <div className="relative z-10 mx-auto grid max-w-[1600px] grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-8">
          <h1 className="font-heading text-[clamp(3rem,14vw,5rem)] font-light leading-[0.95] tracking-[-0.05em] lg:text-8xl lg:leading-[1.02]">
            We Make
            <br />
            Possibilities Real.
          </h1>
        </div>

        <div className="flex flex-col lg:col-span-4 lg:pt-3">
          <p className="max-w-md text-sm leading-relaxed text-foreground/75 md:text-base">
            We create the environments where people live, businesses grow, and
            ideas become reality. From architecture and construction to real
            estate and technology, we bring ambitious possibilities to life.
          </p>

          <Link
            href="/start-project"
            className="mt-5 inline-flex w-fit items-center gap-2 border-b border-current pb-1 text-sm font-medium transition-opacity hover:opacity-60 lg:mt-8"
          >
            Bring an Idea to Life
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Villa */}
      <div className="relative z-20 mx-auto -mt-1 max-w-[1600px] sm:-mt-8 lg:-mt-16">
        {/*
          The image intentionally extends beyond the viewport on small screens.
          This gives the villa more presence without distorting it.
        */}
        <div className="relative left-1/2 aspect-[1.84/1] w-[145vw] max-w-none -translate-x-1/2 sm:w-[115vw] md:w-full">
          <Image
            src="/villa-1.png"
            alt="Modern luxury villa designed and built by Calacot"
            fill
            priority
            sizes="(max-width: 639px) 145vw, (max-width: 767px) 115vw, 100vw"
            className="object-contain object-center"
          />
        </div>
      </div>
    </section>
  );
}