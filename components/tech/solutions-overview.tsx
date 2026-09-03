import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const solutions = [
  {
    value: "operations",
    title: "Business operating systems",
    description:
      "Connect the people, processes and information involved in running the business through one structured system.",
    capabilities: [
      "Customer and lead management",
      "Projects and workflows",
      "Inventory and assets",
      "Staff and permissions",
      "Payments and finance",
      "Management reporting",
    ],
  },
  {
    value: "customer-platforms",
    title: "Customer platforms",
    description:
      "Create useful digital experiences through which customers can discover, buy, book, communicate and manage their relationship with your business.",
    capabilities: [
      "Web applications",
      "Mobile applications",
      "Customer portals",
      "Booking systems",
      "Marketplaces",
      "E-commerce platforms",
    ],
  },
  {
    value: "automation",
    title: "Automation and AI",
    description:
      "Reduce repetitive work and improve response times by automating communication, decisions and routine operational processes.",
    capabilities: [
      "AI customer support",
      "Lead qualification",
      "WhatsApp automation",
      "Approvals and reminders",
      "Document generation",
      "Internal AI assistants",
    ],
  },
  {
    value: "intelligence",
    title: "Data and management intelligence",
    description:
      "Turn everyday business activity into clear information that helps management understand performance and act sooner.",
    capabilities: [
      "Executive dashboards",
      "Operational reports",
      "Performance monitoring",
      "Automated alerts",
      "Business forecasting",
      "Cross-department visibility",
    ],
  },
];

export function SolutionsOverview() {
  return (
    <section className="bg-background text-foreground">
      <div className="mx-auto w-full max-w-[90rem] px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-28">
        <div className="grid gap-14 border-t border-border pt-6 lg:grid-cols-12 lg:gap-12">
          {/* Introduction */}
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-brand-primary" />

              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                What we build
              </span>
            </div>

            <h2 className="mt-8 max-w-xl text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              Technology built around the operation.
            </h2>

            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              We combine product design, software engineering, automation and
              business understanding to create systems that solve meaningful
              operational problems.
            </p>

            <Link
              href="/tech/solutions"
              className="group mt-9 inline-flex items-center gap-2 border-b border-foreground pb-1 text-sm font-semibold transition-colors hover:border-brand-primary hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              Explore all solutions

              <ArrowUpRight
                aria-hidden="true"
                className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </Link>
          </div>

          {/* Solutions accordion */}
          <div className="lg:col-span-7">
            <Accordion
              type="single"
              defaultValue="operations"
              collapsible
              className="border-t border-border"
            >
              {solutions.map((solution) => (
                <AccordionItem
                  key={solution.value}
                  value={solution.value}
                  className="border-b border-border"
                >
                  <AccordionTrigger className="group py-6 text-left hover:no-underline sm:py-8 [&>svg]:size-5 [&>svg]:text-muted-foreground [&>svg]:transition-colors [&[data-state=open]>svg]:text-brand-primary">
                    <span className="flex items-center gap-4 sm:gap-6">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border transition-colors duration-300 group-data-[state=open]:border-brand-primary">
                        <span className="size-1.5 rounded-full bg-muted-foreground transition-all duration-300 group-data-[state=open]:scale-125 group-data-[state=open]:bg-brand-primary" />
                      </span>

                      <span className="text-xl font-medium tracking-[-0.025em] sm:text-2xl">
                        {solution.title}
                      </span>
                    </span>
                  </AccordionTrigger>

                  <AccordionContent className="pb-8 pl-9 sm:pb-10 sm:pl-11">
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                      {solution.description}
                    </p>

                    <div className="mt-7 grid gap-x-8 gap-y-3 border-t border-border pt-6 sm:grid-cols-2">
                      {solution.capabilities.map((capability) => (
                        <div
                          key={capability}
                          className="flex items-center gap-3 text-sm text-foreground/80"
                        >
                          <span
                            aria-hidden="true"
                            className="size-1 rounded-full bg-brand-primary"
                          />

                          {capability}
                        </div>
                      ))}
                    </div>

                    <Link
                      href={`/tech/start-a-project?solution=${solution.value}`}
                      className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                    >
                      Discuss this solution

                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      />
                    </Link>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
}