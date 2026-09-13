"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import Container from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function ArchHero() {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contentRef.current) return;

    const tl = gsap.timeline();

    tl.fromTo(
      contentRef.current.children,
      { y: 30, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        stagger: 0.12,
        duration: 1,
        ease: "power3.out",
      }
    );
  }, []);

  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-brand-black">

      {/* BACKGROUND */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/concept-1.jpg')" }}
      >
        {/* Dark overlay */}
        <div className="absolute inset-0 dark:bg-brand-black/20" />

        {/* Soft gradient for premium feel */}
        <div className="absolute inset-0 bg-linear-to-r from-brand-black/60 via-brand-black/30 to-transparent" />
      </div>

      {/* CONTENT */}
      <Container>
        <div className="relative z-10 min-h-screen flex items-center">
          <div
            ref={contentRef}
            className="max-w-4xl"
          >
     

            {/* HEADLINE */}
            <h1 className="text-brand-white mb-6 max-w-6xl title font-light">
             A home imagined. A design to build on.
             
            </h1>

            {/* SUBTEXT */}
            <p className="text-lg text-brand-white/80 mb-10 text-p">
              Bring your plans for a home or building into focus. Our architectural design work in Uganda brings together layouts, materials and 3D concepts around your site and the way you want to use it.
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/architecture/designs" className={buttonVariants({ size: "lg" })}>Buy Designs <ArrowRight data-icon="inline-end" /></Link>
<Link href="/start-project?service=architecture" className={buttonVariants({ variant: "glass", size: "lg" })}>Start a Project</Link>
            </div>
          </div>
        </div>
      </Container>

      {/* BOTTOM FADE */}
      <div className="absolute bottom-0 w-full h-40 bg-gradient-to-t from-brand-black to-transparent pointer-events-none" />
    </section>
  );
}