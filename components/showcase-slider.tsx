"use client";

import Image from "next/image";
import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { SHOWCASE_SLIDES } from "@/constants";

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
      // INITIAL CARD STATES
      // Card 0 is immediately visible in place to prevent any empty space on scroll entry.
      // -----------------------------
      slidesRef.current.forEach((card, index) => {
        if (!card) return;
        gsap.set(card, {
          yPercent: index === 0 ? 0 : 105,
          opacity: 1,
          scale: 1,
          zIndex: index + 1,
          force3D: true,
          transformOrigin: "center center",
        });
      });

      // -----------------------------
      // IMAGE INITIAL STATES (Original Fade-In / Scale-In Effect)
      // All images start scaled down and hidden so they can play their signature intro/scale animation in strict order.
      // -----------------------------
      imageRefs.current.forEach((image, index) => {
        if (!image) return;
        gsap.set(image, {
          scale: index === 0 ? 0 : 0,
          opacity: index === 0 ? 0 : 0,
          transformOrigin: "center center",
          force3D: true,
        });
      });

      // -----------------------------
      // NUMBERS INITIAL
      // -----------------------------
      numberRefs.current.forEach((number, index) => {
        if (!number) return;
        gsap.set(number, {
          opacity: index === 0 ? 1 : 0.25,
          scale: index === 0 ? 1 : 0.8,
          x: index === 0 ? 10 : 0,
        });
      });

      // -----------------------------
      // PROGRESS BARS INITIAL
      // -----------------------------
      progressRefs.current.forEach((bar, index) => {
        if (!bar) return;
        gsap.set(bar, {
          scaleY: index === 0 ? 1 : 0,
          opacity: index === 0 ? 1 : 0,
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
      // FIRST CARD & IMAGE INTRO
      // Plays instantly on entry with the beloved scale/fade animation, avoiding any blank space.
      // -----------------------------
      tl.to(
        slidesRef.current[0],
        {
          opacity: 1,
          duration: 0.5,
          ease: "power2.out",
        },
        0
      );

      tl.to(
        imageRefs.current[0],
        {
          scale: 1,
          opacity: 1,
          duration: 1.4,
          ease: "power3.out",
        },
        0
      );

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
      // STACKING & SEQUENTIAL TRANSITIONS
      // Each slide and its corresponding image animate strictly in order (1 -> 2 -> 3).
      // -----------------------------
      SHOWCASE_SLIDES.forEach((_, index) => {
        if (index === SHOWCASE_SLIDES.length - 1) return;

        const currentCard = slidesRef.current[index];
        const nextCard = slidesRef.current[index + 1];
        const nextImage = imageRefs.current[index + 1];
        const currentNumber = numberRefs.current[index];
        const nextNumber = numberRefs.current[index + 1];
        const currentProgress = progressRefs.current[index];
        const nextProgress = progressRefs.current[index + 1];

        const position = index + 0.9;

        // 1. Current card settles back
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

        // 2. Next card slides upward into position
        tl.to(
          nextCard,
          {
            yPercent: 2,
            duration: 1.2,
            ease: "expo.inOut",
          },
          position
        );

        // 3. Sequential Image Fade-In & Scale Animation
        if (nextImage) {
          tl.to(
            nextImage,
            {
              scale: 1,
              opacity: 1,
              duration: 1.1,
              ease: "back.out(0.5)",
            },
            position + 0.1
          );
        }

        // 4. Numbers transition
        if (currentNumber && nextNumber) {
          tl.to(
            currentNumber,
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
            nextNumber,
            {
              opacity: 1,
              scale: 1,
              x: 10,
              duration: 0.5,
              ease: "back.out(0.4)",
            },
            position
          );
        }

        // 5. Progress bars transition
        if (currentProgress && nextProgress) {
          tl.to(
            currentProgress,
            {
              scaleY: 0,
              opacity: 0,
              duration: 0.5,
              ease: "power2.inOut",
            },
            position
          );

          tl.to(
            nextProgress,
            {
              scaleY: 1,
              opacity: 1,
              duration: 0.5,
              ease: "power2.out",
            },
            position
          );
        }
      });
    },
    { scope: container, dependencies: [SHOWCASE_SLIDES] }
  );

  return (
    <>
    <div className="mx-auto max-w-[1600px] px-5 pb-14 pt-24 sm:px-8 md:px-12 md:pb-20 md:pt-32 lg:px-20">
  <p className="mb-5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
    Our direction
  </p>

  <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
    <h2 className="max-w-4xl font-heading text-5xl font-light leading-[0.95] tracking-tight sm:text-6xl md:text-7xl lg:col-span-8 lg:text-8xl">
      What we are here
      <br />
      <span className="text-muted-foreground">to create.</span>
    </h2>

    <p className="max-w-md text-base leading-relaxed text-muted-foreground md:text-lg lg:col-span-4">
      Calacot was built around a clear ambition: to create thoughtful places,
      valuable opportunities and useful systems that move people and
      businesses forward.
    </p>
  </div>
</div>
   
    <section
      ref={container}
      className="relative overflow-hidden px-4 md:px-8 lg:px-12 text-foreground"
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
                className="text-3xl font-light tracking-wide text-brand-black dark:text-white will-change-transform"
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
              className="absolute inset-0 overflow-hidden rounded-[2.5rem] will-change-transform  backface-hidden"
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
                  className="object-cover scale-[1.02] brightness-[0.82]"
                />

                {/* OVERLAY */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

                {/* CONTENT */}
                <div className="absolute bottom-0 left-0 z-10 max-w-2xl p-8 md:p-14">
                  <h2 className="mb-4 text-4xl font-light tracking-tight text-white md:text-6xl font-heading">
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
                  className="absolute top-0 left-0 h-full w-px origin-top bg-brand-primary dark:bg-brand-white will-change-transform"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
     </>
  );
}