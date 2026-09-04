import Link from "next/link";
import { ArrowUpRight, Cpu, Layers, Layout, LineChart } from "lucide-react";

const solutions = [
  {
    value: "operations",
    title: "Business Operating Systems",
    description:
      "Connect people, workflows, and core operational data through a unified central platform.",
    icon: Layers,
    capabilities: [
      "Customer & Lead Management",
      "Project & Workflow Tracking",
      "Inventory & Asset Control",
      "Staff & Role Permissions",
      "Payments & Financial Routing",
      "Executive Analytics",
    ],
  },
  {
    value: "customer-platforms",
    title: "Customer Platforms",
    description:
      "Digital customer experiences designed for seamless discovery, booking, and transactional growth.",
    icon: Layout,
    capabilities: [
      "Web & Mobile Applications",
      "Customer Self-Service Portals",
      "Automated Booking Systems",
      "Multi-Vendor Marketplaces",
      "E-Commerce Architectures",
      "Custom Client Dashboards",
    ],
  },
  {
    value: "automation",
    title: "Automation & AI Workflows",
    description:
      "Eliminate manual overhead by automating routine communication, approvals, and data extraction.",
    icon: Cpu,
    capabilities: [
      "AI Customer Support Agents",
      "Automated Lead Qualification",
      "WhatsApp & Telephony Automation",
      "Approval & Reminder Pipelines",
      "Dynamic Document Generation",
      "Internal AI Knowledge Bots",
    ],
  },
  {
    value: "intelligence",
    title: "Data & Executive Intelligence",
    description:
      "Transform disparate operational data into real-time metrics and proactive forecasting.",
    icon: LineChart,
    capabilities: [
      "Executive Command Dashboards",
      "Automated Operational Reports",
      "Real-time System Monitoring",
      "Anomaly Detection Alerts",
      "Predictive Growth Forecasting",
      "Cross-Department Metrics",
    ],
  },
];

export function SolutionsOverview() {
  return (
    <section className="bg-background text-foreground py-24 px-6 md:px-12 lg:px-16">
      <div className="mx-auto max-w-7xl">
        {/* Header Section */}
        <header className="mb-16 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="mb-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              What We Build
            </p>
            <h2 className="font-heading text-4xl font-normal leading-tight sm:text-5xl md:text-6xl">
              Technology built around <br />
              <span className="text-muted-foreground">the core operation.</span>
            </h2>
          </div>
          <div className="lg:col-span-5 flex flex-col items-start lg:items-end justify-between gap-6">
            <p className="text-base text-muted-foreground leading-relaxed">
              We combine product design, software engineering, and operational understanding to build systems that scale cleanly.
            </p>
            <Link
              href="/tech/solutions"
              className="inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4 transition-colors hover:text-muted-foreground"
            >
              Explore All Solutions
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        {/* Bento Grid layout */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {solutions.map((solution) => {
            const Icon = solution.icon;

            return (
              <div
                key={solution.value}
                className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-8 transition-all duration-300 hover:border-foreground/30 hover:shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <Link
                      href={`/tech/start-a-project?solution=${solution.value}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground"
                    >
                      Discuss
                      <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </Link>
                  </div>

                  <h3 className="mt-6 text-xl font-medium tracking-tight">
                    {solution.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {solution.description}
                  </p>

                  <div className="mt-8 border-t border-border/60 pt-6">
                    <p className="mb-4 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                      Capabilities
                    </p>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {solution.capabilities.map((capability) => (
                        <div
                          key={capability}
                          className="flex items-center gap-2 text-xs text-foreground/80"
                        >
                          <span className="h-1 w-1 rounded-full bg-primary" />
                          {capability}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}