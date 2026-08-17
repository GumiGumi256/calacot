"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

const statements = [
  "Land can become a place.",
  "A place can become a home.",
  "A building can become a business.",
  "A property can become an opportunity.",
  "An idea can become an enterprise.",
  "Technology can make it scale.",
];

export default function WorldViewSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;

    // Gravitational pull-in effect (snapping into focus with weight)
    gsap.fromTo(
      el,
      { opacity: 0, y: 35, scale: 0.95 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.8,
        ease: "back.out(1.2)",
      }
    );

    const timer = setTimeout(() => {
      // Gravitational push-out effect (lifting and fading upward)
      gsap.to(el, {
        opacity: 0,
        y: -30,
        scale: 0.95,
        duration: 0.5,
        ease: "power2.in",
        onComplete: () => {
          setCurrentIndex((prev) => (prev + 1) % statements.length);
        },
      });
    }, 3200);

    return () => clearTimeout(timer);
  }, [currentIndex]);

  return (
    <section className="relative w-full  py-24 md:py-32 px-6 md:px-12 lg:px-20 text-foreground transition-colors duration-300 border-t border-border">
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center">
        {/* Left Header */}
        <div className="lg:col-span-5">
        

          <h2 className="text-4xl sm:text-5xl font-heading md:text-7xl font-semibold tracking-tight leading-[1.1]">
           Everything begins with possibility.
          </h2>
        </div>

        {/* Right Side: Minimalist Sequential Gravitational Text */}
        <div className="lg:col-span-7 flex items-center justify-start lg:justify-center min-h-[220px]">
          <div ref={textRef} className="w-full max-w-2xl">
            <p className="text-3xl sm:text-4xl md:text-5xl font-light tracking-tight leading-snug text-foreground">
              {statements[currentIndex]}
            </p>

            {/* Minimalist Progress Indicators */}
            <div className="mt-8 flex items-center gap-3">
              {statements.map((_, index) => (
                <span
                  key={index}
                  className={`h-[2px] transition-all duration-500 rounded-full ${
                    index === currentIndex
                      ? "w-12 bg-foreground"
                      : "w-4 bg-border"
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