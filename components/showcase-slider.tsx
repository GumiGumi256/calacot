"use client";

import Image from "next/image";
import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { SHOWCASE_SLIDES } from "@/constants";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export default function StackedScrollSlider() {
  const container = useRef<HTMLDivElement | null>(null);

  const slidesRef = useRef<(HTMLDivElement | null)[]>([]);
  const imageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const numberRefs = useRef<(HTMLDivElement | null)[]>([]);
  const progressRefs = useRef<(HTMLDivElement | null)[]>([]);

  useGSAP(
    () => {
      // -----------------------------
      // LENIS SMOOTH SCROLL SETUP
      // -----------------------------
      const lenis = new Lenis({
        autoRaf: false,
      });

      const ticker = (time: number) => {
        lenis.raf(time * 1000);
      };
      gsap.ticker.add(ticker);
      gsap.ticker.lagSmoothing(0);

      // -----------------------------
      // INITIAL CARD STATES
      // -----------------------------
      slidesRef.current.forEach((card, index) => {
        if (!card) return;
        gsap.set(card, {
          yPercent: index === 0 ? 0 : 105,
          opacity: index === 0 ? 0 : 1,
          zIndex: index + 1,
          force3D: true,
          transformOrigin: "center center",
        });
      });

      // -----------------------------
      // INITIAL IMAGE STATES
      // Second image (index 1) starts scaled to 0 so it can animate in.
      // Third and beyond start fully visible (no animation).
      // -----------------------------
      imageRefs.current.forEach((image, index) => {
        if (!image) return;
        let initialScale = 1;
        if (index === 0 || index === 1) {
          initialScale = 0;
        }
        gsap.set(image, {
          scale: initialScale,
          transformOrigin: "center center",
          force3D: true,
        });
      });

      // -----------------------------
      // NUMBERS INITIAL (hidden until first image animates)
      // -----------------------------
      numberRefs.current.forEach((number) => {
        if (!number) return;
        gsap.set(number, {
          opacity: 0,
          scale: 0.8,
          x: 0,
        });
      });

      // -----------------------------
      // PROGRESS BARS INITIAL (hidden until first image animates)
      // -----------------------------
      progressRefs.current.forEach((bar) => {
        if (!bar) return;
        gsap.set(bar, {
          scaleY: 0,
          opacity: 0,
          transformOrigin: "top center",
        });
      });

      // -----------------------------
      // MASTER TIMELINE
      // -----------------------------
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: container.current,
          start: "top top",
          end: `+=${SHOWCASE_SLIDES.length * 120}%`,
          scrub: 0.8,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      // -----------------------------
      // FIRST CARD INTRO
      // First image scales in, numbers and progress bars fade+scale in together.
      // -----------------------------
      tl.to(
        slidesRef.current[0],
        {
          opacity: 1,
          duration: 1,
          ease: "power2.out",
        },
        0
      );

      tl.to(
        imageRefs.current[0],
        {
          scale: 1,
          duration: 1.4,
          ease: "power3.out",
        },
        0
      );

      // Numbers left: scale in + fade in + slide
      tl.to(
        numberRefs.current[0],
        {
          opacity: 1,
          scale: 1,
          x: 10,
          duration: 1,
          ease: "back.out(0.4)",
        },
        0
      );

      // Progress bars right: grow + fade in
      tl.to(
        progressRefs.current[0],
        {
          scaleY: 1,
          opacity: 1,
          duration: 1,
          ease: "power2.out",
        },
        0
      );

      // -----------------------------
      // STACKING TRANSITIONS
      // -----------------------------
      SHOWCASE_SLIDES.forEach((_, index) => {
        if (index === SHOWCASE_SLIDES.length - 1) return;

        const currentCard = slidesRef.current[index];
        const nextCard = slidesRef.current[index + 1];
        const position = index + 0.9;

        // Current card settles back
        tl.to(
          currentCard,
          {
            scale: 0.965,
            y: -18,
            duration: 1,
            ease: "power3.out",
          },
          position
        );

        // Next card slides upward above previous
        tl.to(
          nextCard,
          {
            yPercent: 2,
            duration: 1.2,
            ease: "expo.inOut",
          },
          position
        );

        // Numbers transition: current fades out & scales down, next fades in & scales up
        tl.to(
          numberRefs.current[index],
          {
            opacity: 0.25,
            scale: 0.8,
            x: 0,
            duration: 0.5,
            ease: "power2.inOut",
          },
          position
        );

        tl.to(
          numberRefs.current[index + 1],
          {
            opacity: 1,
            scale: 1,
            x: 10,
            duration: 0.5,
            ease: "back.out(0.4)",
          },
          position
        );

        // Progress bars transition
        tl.to(
          progressRefs.current[index],
          {
            scaleY: 0,
            opacity: 0,
            duration: 0.5,
            ease: "power2.inOut",
          },
          position
        );

        tl.to(
          progressRefs.current[index + 1],
          {
            scaleY: 1,
            opacity: 1,
            duration: 0.5,
            ease: "power2.out",
          },
          position
        );

        // SECOND IMAGE ANIMATION (only for the second slide, third slide's image does NOT animate)
        // This makes the second image scale in beautifully when its card becomes active.
        if (index === 0) {
          tl.to(
            imageRefs.current[1],
            {
              scale: 1,
              duration: 1.1,
              ease: "back.out(0.5)",
            },
            position + 0.1 // slight delay after card movement starts
          );
        }
      });

  
    },
    { scope: container, dependencies: [SHOWCASE_SLIDES] }
  );

  return (
    <section
      ref={container}
      className="relative overflow-hidden px-4 py-20 md:px-8 lg:px-12"
    >
      <div className="mx-auto flex h-screen max-w-7xl items-center justify-between gap-8">
        {/* LEFT NUMBERS */}
        <div className="hidden lg:flex">
          <div className="flex flex-col gap-8">
            {SHOWCASE_SLIDES.map((slide, index) => (
              <div
                key={slide.id}
                ref={(el) => {
                  numberRefs.current[index] = el;
                }}
                className="
                  text-3xl
                  font-light
                  tracking-wide
                  text-brand-black
                  transition-opacity
                  duration-300
                  dark:text-white
                  will-change-transform
                "
              >
                {slide.id}
              </div>
            ))}
          </div>
        </div>

        {/* CENTER CARD STACK */}
        <div className="relative h-[420px] flex-1 pt-10 md:h-[480px]">
          {SHOWCASE_SLIDES.map((slide, index) => (
            <div
              key={slide.id}
              ref={(el) => {
                slidesRef.current[index] = el;
              }}
              className="
                absolute inset-0
                overflow-hidden
                rounded-[2.5rem]
                will-change-transform
                backface-hidden
              "
            >
              {/* IMAGE WRAPPER */}
              <div
                ref={(el) => {
                  imageRefs.current[index] = el;
                }}
                className="relative h-full w-full overflow-hidden rounded-[2.5rem]"
              >
                {/* IMAGE */}
                <Image
                  src={slide.image}
                  alt={slide.title}
                  fill
                  priority={index === 0}
                  className="
                    object-cover
                    scale-[1.02]
                    brightness-[0.82]
                  "
                />

                {/* OVERLAY */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

                {/* CONTENT */}
                <div className="absolute bottom-0 left-0 z-10 max-w-2xl p-8 md:p-14">
                  <h2 className="mb-4 text-4xl font-light tracking-tight text-white md:text-6xl">
                    {slide.title}
                  </h2>

                  <p className="max-w-xl text-lg leading-relaxed text-white/80 md:text-xl">
                    {slide.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* RIGHT PROGRESS */}
        <div className="hidden h-[260px] lg:flex">
          <div className="flex flex-col justify-between">
            {SHOWCASE_SLIDES.map((slide, index) => (
              <div
                key={slide.id}
                className="relative h-20 w-px bg-brand-black/15 dark:bg-white/15"
              >
                <div
                  ref={(el) => {
                    progressRefs.current[index] = el;
                  }}
                  className="
                    absolute top-0 left-0
                    h-full w-px origin-top
                    bg-brand-primary
                    dark:bg-brand-white
                    will-change-transform
                  "
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}