"use client";

import { useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import ScrollTrigger from "gsap/ScrollTrigger";

import { NAV_LINKS } from "@/constants";
import { ModeToggle } from "./mode-toggle";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger);

// ─────────────────────────────────────────────────────────────────────────────
// Menu Animation Hook
// ─────────────────────────────────────────────────────────────────────────────

function useMenuAnimation() {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const linksRef = useRef<HTMLDivElement | null>(null);
  const brandRef = useRef<HTMLDivElement | null>(null);
const logoRef = useRef<HTMLDivElement | null>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);

  const [isOpen, setIsOpen] = useState(false);

  useGSAP(
    () => {
      if (
        !overlayRef.current ||
        !contentRef.current ||
        !linksRef.current ||
        !brandRef.current
      )
        return;

      const linkEls =
        linksRef.current.querySelectorAll<HTMLAnchorElement>("a");

      gsap.set(contentRef.current, { opacity: 0 });
      gsap.set(linkEls, { y: 40, opacity: 0 });
      gsap.set(brandRef.current, { y: 30, opacity: 0 });

      timeline.current = gsap.timeline({
        paused: true,
        defaults: {
          ease: "power3.inOut",
        },

        onStart: () => {
          gsap.set(overlayRef.current, {
            visibility: "visible",
            pointerEvents: "auto",
          });
        },

        onReverseComplete: () => {
          gsap.set(overlayRef.current, {
            visibility: "hidden",
            pointerEvents: "none",
          });
        },
      });

      timeline.current
        .to(contentRef.current, {
          opacity: 1,
          duration: 0.3,
        })
        .to(
          linkEls,
          {
            y: 0,
            opacity: 1,
            stagger: 0.06,
            duration: 0.45,
          },
          "-=0.15"
        )
        .to(
          brandRef.current,
          {
            y: 0,
            opacity: 1,
            duration: 0.4,
          },
          "-=0.35"
        );
    },
    { scope: overlayRef }
  );

  const toggle = useCallback(() => {
    if (!timeline.current) return;

    const next = !isOpen;

    setIsOpen(next);

    if (next) {
      timeline.current.play();
    } else {
      timeline.current.reverse();
    }
  }, [isOpen]);

  return {
    isOpen,
    toggle,
    overlayRef,
    contentRef,
    linksRef,
    brandRef,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Navbar Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Navbar() {
  const {
    isOpen,
    toggle,
    overlayRef,
    contentRef,
    linksRef,
    brandRef,
  } = useMenuAnimation();

  const headerRef = useRef<HTMLElement | null>(null);
  const logoContainerRef = useRef<HTMLDivElement | null>(null);

  const [scrolled, setScrolled] = useState(false);
const hiddenRef = useRef(false); // ← use a ref, not state

const lastScroll = useRef(0);
  // ───────────────────────────────────────────────────────────────────────────
  // Navbar Scroll Behavior
  // ───────────────────────────────────────────────────────────────────────────

useGSAP(() => {
  if (!headerRef.current || !logoContainerRef.current) return;

  const header = headerRef.current;
  const logo = logoContainerRef.current;

  const handleScroll = () => {
    const current = window.scrollY;

    // Background blur
    setScrolled(current > 24);

    // Keep visible when menu is open
    if (isOpen) {
      gsap.to(header, { y: 0, duration: 0.3, ease: "power2.out" });
      gsap.to(logo, { y: 0, duration: 0.3, ease: "power2.out" });
      lastScroll.current = current;
      return;
    }

    // Always show near the top
    if (current < 80) {
      hiddenRef.current = false;
      gsap.to(header, { y: 0, duration: 0.35, ease: "power2.out" });
      gsap.to(logo, { y: 0, duration: 0.35, ease: "power2.out" });
      lastScroll.current = current;
      return;
    }

    const scrollingDown = current > lastScroll.current;

    if (scrollingDown && !hiddenRef.current) {
      hiddenRef.current = true;
      gsap.to(header, { y: -120, duration: 0.4, ease: "power2.out" });
      gsap.to(logo, { y: -120, duration: 0.4, ease: "power2.out" });
    } else if (!scrollingDown && hiddenRef.current) {
      hiddenRef.current = false;
      gsap.to(header, { y: 0, duration: 0.4, ease: "power2.out" });
      gsap.to(logo, { y: 0, duration: 0.4, ease: "power2.out" });
    }

    lastScroll.current = current;
  };

  window.addEventListener("scroll", handleScroll, { passive: true });

  return () => window.removeEventListener("scroll", handleScroll);
}, [isOpen]);
  return (
    <>
      {/* ───────────────────────────────────────────────────────── Logo ───── */}

      <div ref={logoContainerRef} className="fixed left-6 top-4 z-[100]">
        <Link
          href="/"
          aria-label="Calacot home"
          className="relative block"
        >
          <Image
            src="/calacot-logo-vertical-white.svg"
            width={140}
            height={60}
            alt="Calacot Logo"
            className="object-contain  hidden dark:block"
          />

          <Image
            src="/calacot-logo-vertical-yellow.svg"
            width={140}
            height={60}
            alt="Calacot Logo"
            className=" object-contain block dark:hidden"
          />
        </Link>
      </div>

      {/* ──────────────────────────────────────────────── Top Navigation ───── */}

      <header
        ref={headerRef}
        className={cn(
          "fixed inset-x-0 top-0 z-[75]",
          "flex items-center justify-between",
          "px-6 py-4",
          "transition-[background-color,border-color,backdrop-filter] duration-500",
          scrolled && !isOpen
            ? "border-b border-border/30 bg-brand-white/80 dark:bg-brand-black/20 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        )}
      >
        {/* Spacer */}
        <div className="w-[140px]" aria-hidden />

        <div className="flex items-center gap-3">
          <ModeToggle />

          <button
            onClick={toggle}
            aria-label={isOpen ? "Close menu" : "Open menu"}
            aria-expanded={isOpen}
            className="group relative flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95 sm:h-auto sm:w-auto sm:gap-2 sm:px-4 sm:py-2 bg-primary text-brand-black"
            
          >
            <span className="hidden text-sm font-semibold tracking-wide sm:block">
              {isOpen ? "Close" : "Menu"}
            </span>

            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-brand-white bg-brand-black"
             
            >
              {isOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <Menu className="h-4 w-4" />
              )}
            </span>
          </button>
        </div>
      </header>

      {/* ───────────────────────────────────────────────── Overlay ───── */}

      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 overflow-hidden bg-brand-white pt-34 pb-10 md:pb-0 dark:bg-brand-black md:pt-0"
        style={{
          visibility: "hidden",
          pointerEvents: "none",
        }}
      >
        <div
          ref={contentRef}
          className="relative flex h-full items-center justify-center px-8 lg:px-16"
        >
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-24">
            {/* Navigation */}

            <nav
              ref={linksRef}
              className="flex flex-col justify-center gap-5"
            >
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.link}
                  href={link.link}
                  onClick={toggle}
                  className="group relative inline-flex w-fit items-center transition-all duration-300 hover:translate-x-3"
                >
                  <span className="sub-title font-light tracking-tight">
                    {link.title}
                  </span>

                  <span
                    aria-hidden
                    className="absolute bottom-0 left-0 h-px w-0 transition-all duration-300 group-hover:w-full"
                    style={{
                      backgroundColor: "var(--primary)",
                    }}
                  />
                </Link>
              ))}
            </nav>

            {/* Brand */}

            <div
              ref={brandRef}
              className="flex flex-col justify-center gap-8 border-border/50 lg:border-l lg:pl-16"
            >
              <Image
                src="/calacot-logo-vertical-yellow.svg"
                width={300}
                height={150}
                alt="Calacot"
              />

              <p className="max-w-xs text-base leading-relaxed text-muted-foreground lg:text-lg">
                Building excellence from the ground up. Designing comfort.
              </p>

              <div
                aria-hidden
                className="h-0.5 w-12"
                style={{
                  backgroundColor: "var(--primary)",
                }}
              />

              <Link
                href="/contact"
                onClick={toggle}
                className="inline-flex w-fit items-center gap-3 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                Get in touch

                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}