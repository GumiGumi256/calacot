import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function TechCta() {
  return (
    <section
      id="contact"
      className="relative isolate flex min-h-[32rem] w-full items-center overflow-hidden b bg-brand-white px-5 text-brand-black dark:border-brand-white/10 dark:bg-brand-black dark:text-brand-white sm:min-h-[38rem] sm:px-8 lg:min-h-[42rem] lg:px-12 section-space"
    >
      {/* Warm central atmosphere */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-30 bg-[radial-gradient(circle_at_50%_0%,rgba(255,201,25,0.24),transparent_42%)] dark:bg-[radial-gradient(circle_at_50%_0%,rgba(255,201,25,0.16),transparent_42%)]"
      />

      {/* Soft lower glow */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-30 h-1/2 bg-gradient-to-t from-brand-primary/[0.08] to-transparent dark:from-brand-primary/[0.05]"
      />

      {/* Top Calacot line */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-primary to-transparent"
      />

      {/* Bottom Calacot line */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand-primary/70 to-transparent"
      />

      {/* Left orbital system */}
      <div
        aria-hidden="true"
        className="absolute -left-52 -top-24 -z-20 h-[32rem] w-[25rem] -rotate-[28deg] rounded-[50%] border border-brand-primary/35 sm:-left-36 sm:-top-40 sm:h-[44rem] sm:w-[32rem] lg:-left-28"
      />

      <div
        aria-hidden="true"
        className="absolute -left-64 -top-10 -z-20 h-[36rem] w-[29rem] -rotate-[28deg] rounded-[50%] border border-brand-black/10 dark:border-brand-white/10 sm:-left-48 sm:-top-28 sm:h-[48rem] sm:w-[36rem]"
      />

      {/* Right orbital system */}
      <div
        aria-hidden="true"
        className="absolute -right-56 -bottom-28 -z-20 h-[34rem] w-[26rem] rotate-[34deg] rounded-[50%] border border-brand-primary/40 sm:-right-36 sm:-bottom-52 sm:h-[46rem] sm:w-[34rem] lg:-right-24"
      />

      <div
        aria-hidden="true"
        className="absolute -right-64 -bottom-12 -z-20 h-[38rem] w-[30rem] rotate-[34deg] rounded-[50%] border border-brand-black/10 dark:border-brand-white/10 sm:-right-48 sm:-bottom-40 sm:h-[50rem] sm:w-[38rem]"
      />

      {/* Small orbital points */}
      <span
        aria-hidden="true"
        className="absolute left-[7%] top-[30%] size-2 rounded-full bg-brand-primary shadow-[0_0_20px_rgba(255,201,25,0.8)] sm:left-[15%]"
      />

      <span
        aria-hidden="true"
        className="absolute bottom-[25%] right-[9%] size-2 rounded-full bg-brand-primary shadow-[0_0_20px_rgba(255,201,25,0.8)] sm:right-[17%]"
      />

      {/* Content */}
      <div className="relative mx-auto w-full max-w-[90rem]">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-black/50 dark:text-brand-white/45">
            Start a conversation
          </p>

          <h2 className="mt-6 text-balance section-heading">
            Let’s build what your business needs next.
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-7 text-brand-black/60 dark:text-brand-white/60 sm:text-lg sm:leading-8">
            Tell us what is repetitive, disconnected or difficult to manage.
            You do not need a technical specification—just a problem worth
            solving.
          </p>

          <Link
            href="/start-project?service=software-development"
            className={buttonVariants({ variant: "default", size: "lg", className: "mt-9 inline-flex sm:mt-10" })}
          >
            Discuss your business

            <ArrowUpRight
              aria-hidden="true"
              className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}