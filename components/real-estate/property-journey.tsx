import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Tell us what matters.",
    description:
      "Share your preferred location, property requirements and plans for what comes next.",
  },
  {
    number: "02",
    title: "Discuss the possibilities.",
    description:
      "We’ll review your brief and contact you to understand your priorities more clearly.",
  },
  {
    number: "03",
    title: "Consider the next step.",
    description:
      "When a suitable opportunity is identified, discuss the details and arrange a viewing.",
  },
];

export default function PropertyJourney() {
  return (
    <section className="bg-brand-white text-brand-black dark:bg-brand-black dark:text-brand-white">
      <div className="mx-auto max-w-7xl px-6 py-14 md:px-12 md:py-20">
        <header className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-10">
          <div className="lg:col-span-8">
         

            <h2 className="mt-4 max-w-2xl font-serif text-3xl leading-[1.08] tracking-[-0.035em] md:text-4xl lg:text-5xl">
              A personal approach, from the first conversation.
            </h2>
          </div>

          <div className="lg:col-span-4 lg:justify-self-end">
            <Link
              href="/contact?intent=buy-home"
              className="group inline-flex min-h-11 items-center gap-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary"
            >
              Discuss your property search

              <ArrowUpRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 dark:text-brand-primary motion-reduce:transition-none"
              />
            </Link>
          </div>
        </header>

        <ol className="mt-10 grid gap-8 md:mt-12 md:grid-cols-3 md:gap-10">
          {steps.map((step) => (
            <li key={step.number}>
              <span
                aria-hidden="true"
                className="font-serif text-4xl leading-none text-brand-black/30 dark:text-brand-primary/70 md:text-5xl"
              >
                {step.number}
              </span>

              <h3 className="mt-5 text-xl font-medium leading-tight tracking-[-0.025em] lg:text-2xl">
                {step.title}
              </h3>

              <p className="mt-3 max-w-[32ch] text-sm leading-7 text-brand-black/65 dark:text-brand-white/65 md:text-base">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}