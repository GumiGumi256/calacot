import Image from "next/image";

const principles = [
  {
    title: "Function first",
    description:
      "We consider movement, storage, daily routines and the purpose of every space before making decorative decisions.",
  },
  {
    title: "Atmosphere with purpose",
    description:
      "Light, colour, texture and material are selected to create the right feeling without compromising how the room works.",
  },
  {
    title: "Made to endure",
    description:
      "We favour thoughtful details, durable materials and a restrained design language that continues to feel relevant.",
  },
];

export function DesignPhilosophy() {
  return (
    <section className="bg-brand-white text-brand-black transition-colors duration-300 dark:bg-brand-black dark:text-brand-white">
      <div className="section-space site-container">
        
        <div className="grid gap-x-8 gap-y-8 lg:grid-cols-12">
        
          {/* Main statement */}
          <h2 className="max-w-5xl text-balance lg:col-span-9 section-heading">
            We design for the life that will happen{" "}
            <span className="text-brand-primary">inside.</span>
          </h2>

          {/* Supporting text */}
          <div className="order-3 lg:col-span-5 lg:col-start-7 lg:pt-5">
            <p className="max-w-2xl text-base leading-7 text-brand-black/60 dark:text-brand-white/60 sm:text-lg sm:leading-8">
              A beautiful room is not enough. It should support how people
              move, rest, gather, work and live—while creating a genuine sense
              of comfort and belonging.
            </p>

            <p className="mt-5 max-w-2xl text-sm leading-6 text-brand-black/50 dark:text-brand-white/50 sm:text-base sm:leading-7">
              Every material, proportion and detail should contribute to both
              the atmosphere of the space and the experience of using it.
            </p>
          </div>

        
        </div>

        {/* Principles */}
        <div className="mt-20 grid border-t border-brand-black/10 dark:border-brand-white/10 sm:mt-24 lg:grid-cols-3">
          {principles.map((principle, index) => (
            <article
              key={principle.title}
              className={`border-b border-brand-black/10 py-8 dark:border-brand-white/10 lg:border-b-0 lg:py-10 ${
                index > 0
                  ? "lg:border-l lg:border-brand-black/10 lg:pl-8 dark:lg:border-brand-white/10"
                  : "lg:pr-8"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-brand-primary/60">
                  <span className="size-1.5 rounded-full bg-brand-primary" />
                </span>

                <h3 className="text-lg font-semibold tracking-[-0.025em]">
                  {principle.title}
                </h3>
              </div>

              <p className="mt-4 max-w-sm text-sm leading-6 text-brand-black/55 dark:text-brand-white/55 sm:text-base sm:leading-7">
                {principle.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}