"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger);

const properties = [
  {
    id: "01",
    location: "Kololo, Kampala",
    type: "Private Residence",
    title: "A quieter kind of luxury.",
    image: "/slide-1.jpg",
  },
  {
    id: "02",
    location: "Naguru, Kampala",
    type: "Premium Development",
    title: "Designed for the way you live.",
    image: "/slide-2.jpg",
  },
  {
    id: "03",
    location: "Kampala, Uganda",
    type: "Investment Opportunity",
    title: "Property with a longer view.",
    image: "/slide-3.jpg",
  },
];

export default function EstatesSection() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLDivElement | null>(null);
  const cardsRef = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      if (!sectionRef.current) return;

      gsap.fromTo(
        headingRef.current,
        {
          opacity: 0,
          y: 60,
        },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 75%",
            toggleActions: "play none none reverse",
          },
        }
      );

      gsap.fromTo(
        cardsRef.current?.children ?? [],
        {
          opacity: 0,
          y: 80,
          scale: 0.97,
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.9,
          stagger: 0.15,
          ease: "power3.out",
          scrollTrigger: {
            trigger: cardsRef.current,
            start: "top 78%",
            toggleActions: "play none none reverse",
          },
        }
      );
    },
    {
      scope: sectionRef,
    }
  );

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden "
    >
      {/* ------------------------------------------------
          INTRO
      ------------------------------------------------ */}
      <div className="px-6 py-24 md:px-12 md:py-32 lg:px-20">
        <div
          ref={headingRef}
          className="mx-auto grid max-w-[1600px] grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-20"
        >
        
          <div className="lg:col-span-3">
            <div className="flex items-center gap-4">
            

              <span className="h-px w-12 bg-border" />

              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Calacot Estates 
              </span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <h2 className="text-5xl font-light leading-[0.95] tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
              Exceptional
              <br />
              property.
              <br />
              <span className="text-muted-foreground">
                Carefully connected.
              </span>
            </h2>
          </div>

         
          <div className="lg:col-span-3 lg:pt-3">
            <p className="max-w-sm text-base leading-relaxed text-muted-foreground md:text-lg">
              We curate premium homes, developments, and investment
              opportunities across Uganda, connecting discerning buyers with
              properties worth knowing about.
            </p>

            <Link
              href="/real-estate"
              className="mt-8 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-8 transition-colors hover:text-muted-foreground"
            >
              Explore Calacot Estates
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------
          PROPERTY SHOWCASE
      ------------------------------------------------ */}
      {/* <div className="px-6 md:px-12 lg:px-20">
        <div
          ref={cardsRef}
          className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {properties.map((property, index) => (
            <Link
              href="/real-estate"
              key={property.id}
              className={`group relative overflow-hidden rounded-[2rem] ${
                index === 0
                  ? "md:col-span-2 lg:col-span-2"
                  : "md:col-span-1 lg:col-span-1"
              }`}
            >
              <div
                className={`relative ${
                  index === 0
                    ? "h-[520px] md:h-[620px]"
                    : "h-[520px] md:h-[620px]"
                }`}
              >
                <Image
                  src={property.image}
                  alt={property.title}
                  fill
                  className="object-cover transition-transform duration-1000 ease-out group-hover:scale-105"
                  sizes={
                    index === 0
                      ? "(max-width: 768px) 100vw, 66vw"
                      : "(max-width: 768px) 100vw, 33vw"
                  }
                />

               
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

              
                <div className="absolute left-6 top-6">
                  <span className="text-xs tracking-[0.2em] text-white/70">
                    {property.id}
                  </span>
                </div>

              
                <div className="absolute inset-x-0 bottom-0 p-7 md:p-9">
                  <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-white/60">
                    <span>{property.location}</span>
                    <span className="h-px w-6 bg-white/30" />
                    <span>{property.type}</span>
                  </div>

                  <div className="flex items-end justify-between gap-6">
                    <h3 className="max-w-lg text-3xl font-light leading-tight tracking-tight text-white md:text-4xl">
                      {property.title}
                    </h3>

                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur-md transition-all duration-300 group-hover:bg-white group-hover:text-black">
                      <ArrowUpRight className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div> */}

      {/* ------------------------------------------------
          THE CALACOT ESTATES EXPERIENCE
      ------------------------------------------------ */}
      <div className="px-6 pb-28 pt-24 md:px-12 md:pb-40 md:pt-32 lg:px-20">
        <div className="mx-auto max-w-[1600px] border-t border-border pt-12 md:pt-16">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-20">
            {/* Left */}
            <div className="lg:col-span-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                The Calacot Estates Experience
              </p>
              <Image 
              src="/estate-highlight.jpg"
              alt="Calacot Estates Experience"
              width={400}
              height={400}
              className="mt-8 rounded-3xl object-cover object-center"
              />
            </div>

            {/* Right */}
            <div className="lg:col-span-8">
              <h3 className="max-w-4xl text-4xl font-light leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
                From discovery to ownership, we make exceptional property
                easier to navigate.
              </h3>

              {/* Journey */}
              <div className="mt-16 grid grid-cols-1 border-t border-border md:grid-cols-3">
                {/* Step 01 */}
                <div className="border-b border-border py-8 md:border-b-0 md:border-r md:pr-8">
                  <span className="text-xs text-muted-foreground">01</span>

                  <h4 className="mt-8 text-xl font-light">
                    Discover
                  </h4>

                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Explore carefully selected properties and developments
                    through a more considered real estate experience.
                  </p>
                </div>

                {/* Step 02 */}
                <div className="border-b border-border py-8 md:border-b-0 md:px-8 md:border-r">
                  <span className="text-xs text-muted-foreground">02</span>

                  <h4 className="mt-8 text-xl font-light">
                    Experience
                  </h4>

                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Get closer to the property through private viewings and
                    guidance from a Calacot advisor.
                  </p>
                </div>

                {/* Step 03 */}
                <div className="py-8 md:pl-8">
                  <span className="text-xs text-muted-foreground">03</span>

                  <h4 className="mt-8 text-xl font-light">
                    Acquire
                  </h4>

                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Move from interest to ownership with support throughout
                    the transaction.
                  </p>
                </div>
              </div>

              {/* CTA */}
              <div className="mt-12">
                <Link
                  href="/estates"
                  className="group inline-flex items-center gap-3 text-sm font-medium"
                >
                  Enter Calacot Estates

                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border transition-all duration-300 group-hover:bg-foreground group-hover:text-background">
                    <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}