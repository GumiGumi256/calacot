"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

const statements = [
  "Land can become a place people belong.",
  "A place can become a meaningful home.",
  "A building can become a thriving business.",
  "A property can become lasting value.",
  "An idea can become an enterprise.",
  "Technology can help it reach further.",
];

export default function WorldViewSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const statementRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const statement = statementRef.current;
    if (!statement) return;

    const context = gsap.context(() => {
      gsap.fromTo(
        statement,
        {
          autoAlpha: 0,
          y: 24,
        },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.7,
          ease: "power3.out",
        },
      );
    });

    const timeout = window.setTimeout(() => {
      gsap.to(statement, {
        autoAlpha: 0,
        y: -20,
        duration: 0.45,
        ease: "power2.in",
        onComplete: () => {
          setCurrentIndex((index) => (index + 1) % statements.length);
        },
      });
    }, 3000);

    return () => {
      window.clearTimeout(timeout);
      context.revert();
    };
  }, [currentIndex]);

  return (
    <section className="relative px-5 py-20 text-foreground sm:px-8 md:px-12 md:py-28 lg:px-20 lg:py-36">
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-14 lg:grid-cols-12 lg:items-center lg:gap-16">
        {/* Worldview */}
        <div className="lg:col-span-5">
          

          <h2 className="max-w-xl font-heading text-4xl font-medium leading-[1.05] tracking-[-0.04em] sm:text-5xl md:text-6xl lg:text-7xl">
            We see what things can become.
          </h2>
        </div>

        {/* Changing statement */}
        <div className="flex min-h-48 items-center lg:col-span-7 lg:min-h-64 lg:justify-center">
          <div className="w-full max-w-3xl">
            <p
              ref={statementRef}
              aria-live="polite"
              className="max-w-2xl text-3xl font-light leading-[1.15] tracking-[-0.03em] sm:text-4xl md:text-5xl"
            >
              {statements[currentIndex]}
            </p>

            <div
              className="mt-8 flex items-center gap-2"
              aria-label={`Statement ${currentIndex + 1} of ${
                statements.length
              }`}
            >
              {statements.map((_, index) => (
                <span
                  key={index}
                  className={`h-0.5 rounded-full transition-[width,background-color] duration-500 ${
                    index === currentIndex
                      ? "w-12 bg-foreground"
                      : "w-4 bg-foreground/15"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}