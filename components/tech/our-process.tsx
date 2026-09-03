"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger);

const steps = [
  {
    title: "Understand",
    subtitle: "Learn how the business really works",
    description:
      "We speak with the people doing the work, study the existing process and identify where time, information and opportunities are being lost.",
    image: "/understand.jpg",
    alt: "Business operations being documented during product discovery",
  },
  {
    title: "Define",
    subtitle: "Decide what should change",
    description:
      "We separate symptoms from the real operational problem, establish priorities and define what a successful outcome should look like.",
    image: "/define.jpg",
    alt: "A digital business workflow being mapped and defined",
  },
  {
    title: "Design",
    subtitle: "Make complexity feel simple",
    description:
      "We turn workflows into clear user journeys, interfaces and prototypes that people can understand without extensive training.",
    image: "/design.jpg",
    alt: "Product wireframes and high-fidelity interface designs",
  },
  {
    title: "Build",
    subtitle: "Engineer the working system",
    description:
      "We develop the product in useful stages, connect the necessary services and test it across real devices, roles and operational scenarios.",
    image: "/build.jpg",
    alt: "A Calacot digital product being developed and tested",
  },
  {
    title: "Improve",
    subtitle: "Learn from real use",
    description:
      "After launch, we study adoption, feedback and performance so the system continues becoming more useful as the business evolves.",
    image: "/improve.jpg",
    alt: "Product feedback and performance information being reviewed",
  },
];

export function OurProcess() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  useGSAP(
    () => {
      const stepElements =
        gsap.utils.toArray<HTMLElement>("[data-process-step]");

      stepElements.forEach((step, index) => {
        ScrollTrigger.create({
          trigger: step,
          start: "top 52%",
          end: "bottom 52%",
          onEnter: () => setActiveStep(index),
          onEnterBack: () => setActiveStep(index),
        });
      });

      const media = gsap.matchMedia();

      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          "[data-progress-line]",
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: "none",
            scrollTrigger: {
              trigger: stepElements[0],
              endTrigger: stepElements.at(-1),
              start: "top 52%",
              end: "top 52%",
              scrub: true,
            },
          },
        );

        gsap.from("[data-process-heading]", {
          y: 24,
          autoAlpha: 0,
          duration: 0.8,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 76%",
            once: true,
          },
        });
      });

      media.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set("[data-progress-line]", { scaleY: 0 });
      });

      return () => media.revert();
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      className="bg-background text-foreground transition-colors duration-300"
    >
      <div className="mx-auto w-full max-w-[90rem] px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-28">
        <div className="grid gap-7  pb-6 lg:grid-cols-12 lg:gap-8">
          

          <h2
            data-process-heading
            className="max-w-4xl text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:col-span-8 lg:text-6xl"
          >
            From complexity to a system people can use.
          </h2>

          <p
            data-process-heading
            className="max-w-md text-base leading-7 text-muted-foreground lg:col-span-3 lg:pt-2"
          >
            Good software begins long before development. We first understand
            the operation, then decide what technology should do.
          </p>
        </div>

        <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-12 lg:gap-8">
          {/* Process steps */}
          <div
            data-process-list
            className="relative lg:col-span-6"
          >
            {/* Neutral timeline */}
            <div
              aria-hidden="true"
              className="absolute bottom-[18.25rem] left-[0.6875rem] top-[0.7rem] w-px bg-border sm:bottom-[16.25rem] lg:bottom-[14.25rem]"
            />

            {/* Scroll-controlled timeline */}
            <div
              data-progress-line
              aria-hidden="true"
              className="absolute bottom-[18.25rem] left-[0.6875rem] top-[0.7rem] w-px origin-top scale-y-0 bg-brand-primary sm:bottom-[16.25rem] lg:bottom-[14.25rem]"
            />

            {steps.map((step, index) => {
              const active = index === activeStep;
              const completed = index <= activeStep;

              return (
                <article
                  key={step.title}
                  data-process-step
                  className="relative min-h-[24rem] pl-11 last:min-h-[19rem] sm:min-h-[22rem] sm:pl-14 sm:last:min-h-[17rem] lg:min-h-[17rem] lg:last:min-h-[15rem]"
                >
                  <div
                    aria-hidden="true"
                    className={`absolute left-0 top-0.5 z-10 flex size-6 items-center justify-center rounded-full border bg-background transition duration-300 ${
                      completed
                        ? "border-brand-primary"
                        : "border-border"
                    } ${active ? "scale-100" : "scale-90"}`}
                  >
                    <span
                      className={`size-2 rounded-full bg-brand-primary transition-transform duration-300 ${
                        completed ? "scale-100" : "scale-0"
                      }`}
                    />
                  </div>

                  <div
                    className={`transition-opacity duration-300 ${
                      active
                        ? "opacity-100"
                        : completed
                          ? "opacity-60"
                          : "opacity-35"
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      {step.subtitle}
                    </p>

                    <h3 className="mt-3 text-3xl font-medium leading-none tracking-[-0.04em] sm:text-4xl">
                      {step.title}
                    </h3>

                    <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>

                  {/* Mobile image */}
                  <div className="relative mt-7 aspect-[4/3] overflow-hidden rounded-xl bg-muted lg:hidden">
                    <Image
                      src={step.image}
                      alt={step.alt}
                      fill
                      sizes="(max-width: 1024px) 100vw"
                      className="object-cover"
                    />
                  </div>
                </article>
              );
            })}
          </div>

          {/* Sticky desktop image */}
          <div className="hidden lg:col-span-5 lg:col-start-8 lg:block items-center">
            <div className="sticky top-28 ml-auto w-full max-w-[32rem]">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-muted">
                {steps.map((step, index) => (
                  <div
                    key={step.image}
                    aria-hidden={index !== activeStep}
                    className={`absolute inset-0 transition duration-500 ease-out ${
                      index === activeStep
                        ? "visible scale-100 opacity-100"
                        : "invisible scale-[1.02] opacity-0"
                    }`}
                  >
                    <Image
                      src={step.image}
                      alt={index === activeStep ? step.alt : ""}
                      fill
                      priority={index === 0}
                      sizes="512px"
                      className="object-cover"
                    />

                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent"
                    />
                  </div>
                ))}
              </div>

            
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}