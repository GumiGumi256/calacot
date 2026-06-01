"use client";

import { PAINTING_PROCESS } from "@/constants";
import Image from "next/image";
import React, { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export default function PaintingProcess() {
  const container = useRef<HTMLDivElement>(null);
  const scrollRestoreRef = useRef<string>("");

  useGSAP(
    () => {
      // disable animation on mobile
      if (window.innerWidth < 1024) return;

      const disableScroll = () => {
        scrollRestoreRef.current = document.body.style.overflow;
        document.body.style.overflow = "hidden";
      };

      const enableScroll = () => {
        document.body.style.overflow = scrollRestoreRef.current || "";
      };

      gsap.set(".process-card", {
        opacity: 0,
        scale: 0.96,
        x: 0,
        y: 0,
      });

      gsap.set(".stack-card", {
        opacity: 1,
      });

      const tl = gsap.timeline({
        defaults: {
          ease: "power3.inOut",
        },
        paused: true,
        onComplete: enableScroll,
      });

      // Main card intro
      tl.from(".main-card", {
        opacity: 0,
        scale: 0.92,
        duration: 1,
      });

      // Decorative stack reveal
      tl.to(
        ".stack-1",
        {
          rotate: -8,
          x: -14,
          y: 10,
          duration: 0.8,
        },
        "-=0.7"
      );

      tl.to(
        ".stack-2",
        {
          rotate: 8,
          x: 14,
          y: 14,
          duration: 0.8,
        },
        "-=0.8"
      );

      tl.to(
        ".stack-3",
        {
          rotate: 14,
          x: 22,
          y: 24,
          duration: 0.8,
        },
        "-=0.8"
      );

      // Cards spread outward
      tl.to(
        ".card-1",
        {
          opacity: 1,
          x: -650,
          duration: 1.2,
        },
        "+=0.2"
      );

      tl.to(
        ".card-2",
        {
          opacity: 1,
          x: -330,
          duration: 1.2,
        },
        "-=1.05"
      );

      tl.to(
        ".card-3",
        {
          opacity: 1,
          x: 330,
          duration: 1.2,
        },
        "-=1.05"
      );

      tl.to(
        ".card-4",
        {
          opacity: 1,
          x: 650,
          duration: 1.2,
        },
        "-=1.05"
      );

      // Hide decorative stack
      tl.to(
        ".stack-card",
        {
          opacity: 0,
          duration: 0.5,
        },
        "-=0.8"
      );

      ScrollTrigger.create({
        trigger: container.current,
        start: "center center",
        onEnter: () => {
          disableScroll();
          tl.play();
        },
        once: true,
      });
    },
    { scope: container }
  );

  return (
    <section className="overflow-hidden py-10 md:py-20">
      {/* ================= DESKTOP ================= */}
      <div
        ref={container}
        className="relative hidden lg:flex items-center justify-center min-h-[520px]"
      >
        {/* Decorative stacked cards behind */}
        <div className="stack-card stack-1 absolute w-[320px] h-[400px] rounded-[2.5rem] border dark:border-brand-white/10 border-brand-black/25" />

        <div className="stack-card stack-2 absolute w-[320px] h-[400px] rounded-[2.5rem] border dark:border-brand-white/10 border-brand-black/25" />

        <div className="stack-card stack-3 absolute w-[320px] h-[400px] rounded-[2.5rem] border dark:border-brand-white/10 border-brand-black/25" />

        {/* LEFT CARDS */}
        {PAINTING_PROCESS.slice(0, 2).map((item, index) => (
          <div
            key={index}
            className={`process-card card-${
              index + 1
            } absolute z-10 w-[300px] h-[400px] rounded-[2.5rem] border dark:border-brand-white/15 border-brand-black/15 dark:bg-brand-black/70 bg-brand-white/70 p-5 flex flex-col justify-between`}
          >
            <p className="text-[4rem] leading-none font-light dark:text-brand-white text-brand-black">
              {item.number}
            </p>

            <div className="space-y-4">
              <h3 className="text-2xl font-light tracking-tight dark:text-brand-white text-brand-black">
                {item.title}
              </h3>

              <p className="text-lg leading-relaxed dark:text-brand-white/50 text-brand-black/50 max-w-[90%]">
                {item.description}
              </p>
            </div>
          </div>
        ))}

        {/* MAIN CARD */}
        <div className="main-card relative z-20">
          <div className="relative w-[320px] h-[400px] rounded-[2.5rem] overflow-hidden">
            <Image
              src="/concept-5.jpg"
              alt="Painting Process"
              fill
              className="object-cover"
            />

            <div className="absolute inset-0 bg-black/30 z-10" />

            <div className="relative z-20 flex flex-col justify-between items-center h-full p-8">
              <Image
                src="/calacot-logo-vertical-white.svg"
                alt="Calacot Logo"
                width={180}
                height={180}
                className="object-contain"
              />

              <h2 className="text-[4rem] leading-[0.9] tracking-tight font-light text-white">
                Painting
                <br />
                Process
              </h2>
            </div>
          </div>
        </div>

        {/* RIGHT CARDS */}
        {PAINTING_PROCESS.slice(2, 4).map((item, index) => (
          <div
            key={index + 2}
            className={`process-card card-${
              index + 3
            } absolute z-10 w-[300px] h-[400px] rounded-[2.5rem] border dark:border-brand-white/15 border-brand-black/15 dark:bg-brand-black/70 bg-brand-white/70 p-5 flex flex-col justify-between`}
          >
            <p className="text-[4rem] leading-none font-light dark:text-brand-white text-brand-black">
              {item.number}
            </p>

            <div className="space-y-4">
              <h3 className="text-2xl font-light tracking-tight dark:text-brand-white text-brand-black">
                {item.title}
              </h3>

              <p className="text-lg leading-relaxed dark:text-brand-white/50 text-brand-black/50 max-w-[90%]">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ================= MOBILE ================= */}
      <div className="flex flex-col gap-5 lg:hidden px-4">
        {/* Main Hero Card */}
        <div className="relative w-full h-[320px] rounded-[2rem] overflow-hidden">
          <Image
            src="/concept-5.jpg"
            alt="Painting Process"
            fill
            className="object-cover"
          />

          <div className="absolute inset-0 bg-black/30 z-10" />

          <div className="relative z-20 flex flex-col justify-between h-full p-6">
            <Image
              src="/calacot-logo-vertical-white.svg"
              alt="Calacot Logo"
              width={150}
              height={150}
              className="object-contain"
            />

            <h2 className="text-[3.5rem] leading-[0.9] tracking-tight font-light text-white">
              Design
              <br />
              Process
            </h2>
          </div>
        </div>

        {/* Process Cards */}
        {PAINTING_PROCESS.map((item, index) => (
          <div
            key={index}
            className="w-full min-h-[260px] rounded-[2rem] border dark:border-brand-white/10 border-brand-black/10 dark:bg-brand-black/70 bg-brand-white/70 p-6 flex flex-col justify-between"
          >
            <p className="text-[3.5rem] leading-none font-light dark:text-brand-white text-brand-black">
              {item.number}
            </p>

            <div className="space-y-3">
              <h3 className="text-3xl font-light tracking-tight dark:text-brand-white text-brand-black">
                {item.title}
              </h3>

              <p className="text-base leading-relaxed dark:text-brand-white/50 text-brand-black/50">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}