"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger);

const problems = [
  {
    number: "01",
    category: "Customer information",
    title: "Scattered across different tools",
    description:
      "Important customer details live across WhatsApp, spreadsheets, notebooks and individual team members.",
    status: "Disconnected",
  },
  {
    number: "02",
    category: "Daily operations",
    title: "Dependent on manual follow-up",
    description:
      "Tasks, approvals and reminders depend on someone remembering what needs to happen next.",
    status: "Manual",
  },
  {
    number: "03",
    category: "Management visibility",
    title: "Decisions made without clear data",
    description:
      "Leaders struggle to see performance, responsibilities and operational bottlenecks as they happen.",
    status: "Unclear",
  },
  {
    number: "04",
    category: "Business growth",
    title: "More customers create more complexity",
    description:
      "Existing processes become harder to control as the company and volume of work grow.",
    status: "Restricted",
  },
];

export function BusinessTransformation() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const media = gsap.matchMedia();

      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-bento-item]", {
          y: 32,
          autoAlpha: 0,
          duration: 0.85,
          stagger: 0.09,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 72%",
            once: true,
          },
        });
      });

      return () => media.revert();
    },
    {
      scope: sectionRef,
    },
  );

  return (
    <section
      ref={sectionRef}
      className="bg-background text-foreground transition-colors duration-300"
    >
      <div className="mx-auto w-full max-w-[90rem] px-5 py-24 sm:px-8 sm:py-32 lg:px-12 lg:py-40">
        <div className="mb-8 flex items-center gap-3">
          <span className="h-px w-8 bg-brand-primary" />

          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            The problem
          </span>
        </div>

        <div className="grid auto-rows-auto gap-4 md:grid-cols-2 lg:grid-cols-12 lg:auto-rows-[minmax(17rem,auto)]">
          {/* Main statement */}
          <article
            data-bento-item
            className="flex min-h-[30rem] flex-col justify-between overflow-hidden rounded-3xl border border-border bg-foreground p-7 text-background md:col-span-2 sm:p-9 lg:col-span-7 lg:row-span-2 lg:min-h-0 lg:p-12"
          >
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-background/50">
                Operational reality
              </span>

              <h2 className="mt-8 max-w-3xl text-balance text-4xl font-semibold leading-[0.98] tracking-[-0.05em] sm:text-5xl lg:text-6xl xl:text-7xl">
                Growth gets harder when your business is{" "}
                <span className="text-background/35">disconnected.</span>
              </h2>
            </div>

            <p className="mt-16 max-w-xl text-base leading-7 text-background/60 sm:text-lg sm:leading-8">
              Many businesses do not need another isolated application. They
              need their people, information and daily processes to work as one
              connected operation.
            </p>
          </article>

          {/* First two problems */}
          {problems.slice(0, 2).map((problem) => (
            <ProblemCard
              key={problem.number}
              problem={problem}
              className="md:col-span-1 lg:col-span-5"
            />
          ))}

          {/* Remaining problems */}
          {problems.slice(2).map((problem) => (
            <ProblemCard
              key={problem.number}
              problem={problem}
              className="md:col-span-1 lg:col-span-4"
            />
          ))}

          {/* Result */}
          <article
            data-bento-item
            className="group relative flex min-h-72 flex-col justify-between overflow-hidden rounded-3xl border border-brand-primary bg-brand-primary p-7 text-brand-black sm:p-8 md:col-span-2 lg:col-span-4"
          >
            <div
              aria-hidden="true"
              className="absolute -right-16 -top-16 size-48 rounded-full border border-brand-black/10"
            />

            <div
              aria-hidden="true"
              className="absolute -right-8 -top-8 size-32 rounded-full border border-brand-black/10"
            />

            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-black/55">
                  The opportunity
                </span>

                <span className="flex items-center gap-2 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-brand-black/60">
                  <span className="size-1.5 rounded-full bg-brand-black" />
                  Connected
                </span>
              </div>

              <h3 className="mt-8 max-w-md text-3xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-4xl">
                One clear system behind the entire operation.
              </h3>
            </div>

            <Link
              href="/tech/solutions"
              className="relative mt-12 inline-flex w-fit items-center gap-2 border-b border-brand-black pb-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-black"
            >
              Explore our solutions

              <ArrowUpRight
                aria-hidden="true"
                className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}

type Problem = (typeof problems)[number];

type ProblemCardProps = {
  problem: Problem;
  className?: string;
};

function ProblemCard({ problem, className = "" }: ProblemCardProps) {
  return (
    <article
      data-bento-item
      className={`group relative flex min-h-72 flex-col justify-between overflow-hidden rounded-3xl border border-border bg-card p-7 text-card-foreground transition-colors duration-300 hover:border-foreground/20 sm:p-8 ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-brand-primary transition-transform duration-500 group-hover:scale-x-100"
      />

      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {problem.number}
            </span>

            <span className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {problem.category}
            </span>
          </div>

          <span className="rounded-full border border-border px-2.5 py-1 text-[0.5625rem] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
            {problem.status}
          </span>
        </div>

        <h3 className="mt-8 max-w-lg text-2xl font-medium leading-tight tracking-[-0.035em] sm:text-3xl">
          {problem.title}
        </h3>
      </div>

      <p className="mt-10 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
        {problem.description}
      </p>
    </article>
  );
}