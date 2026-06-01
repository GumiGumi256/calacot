'use client';

import { NAV_LINKS } from "@/constants";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const SOCIAL_LINKS = [
  {
    name: "Instagram",
    href: "https://instagram.com/calacotug",
    icon: "/instagram.svg",
  },
  {
    name: "TikTok",
    href: "https://tiktok.com/@calacotug",
    icon: "/tiktok.svg",
  },
  {
    name: "YouTube",
    href: "https://youtube.com/calacotug",
    icon: "/youtube.svg",
  },
  {
    name: "LinkedIn",
    href: "https://linkedin.com/in/calacotug",
    icon: "/linkedin.svg",
  },
  {
    name: "X",
    href: "https://x.com/calacotug",
    icon: "/x.svg",
  },
];

const LEGAL_LINKS = [
  { name: "Privacy Policy", href: "/privacy" },
  { name: "Terms", href: "/terms" },
  { name: "Cookies", href: "/cookies" },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden border-t border-black/10 bg-brand-white dark:border-white/10 dark:bg-brand-black">
      <div className="mx-auto flex min-h-[85vh] max-w-[1800px] flex-col justify-between px-6 pt-16 md:px-10 lg:px-14 lg:pt-20">

        {/* Top */}
        <div className="grid gap-14 lg:grid-cols-[0.9fr_0.5fr_0.5fr]">

          {/* Brand */}
          <div className="max-w-md">
             {/* Logo */}
            <Link href="/" className="mt-12 inline-block">
              
              {/* Light Mode Logo */}
              <Image
                src="/calacot-logo-icon-black.svg"
                alt="Calacot Logo"
                width={120}
                height={120}
                className="block dark:hidden"
              />

              {/* Dark Mode Logo */}
              <Image
                src="/calacot-logo-icon-yellow.svg"
                alt="Calacot Logo"
                width={100}
                height={120}
                className="hidden dark:block"
              />
            </Link>
            <p className="text-sm leading-relaxed text-brand-black/55 dark:text-brand-white/55">
              A multidisciplinary studio creating refined architecture,
              interiors, brands, and digital experiences with timeless intent.
            </p>

            {/* Social Icons */}
            <div className="mt-8 flex items-center gap-5">
              {SOCIAL_LINKS.map((social) => (
                <Link
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.name}
                  className="group"
                >
                  <Image
                    src={social.icon}
                    alt={social.name}
                    width={18}
                    height={18}
                    className="
                      opacity-60
                      transition-all
                      duration-500
                      group-hover:opacity-100
                      group-hover:scale-105
                      dark:brightness-0
                      dark:invert
                    "
                  />
                </Link>
              ))}
            </div>

           
          </div>

          {/* Navigation */}
          <div>
            <span className="text-[11px] uppercase font-bold tracking-[0.25em] text-brand-black dark:text-brand-primary">
              Navigation
            </span>

            <ul className="mt-6 space-y-4">
              {NAV_LINKS?.map((link) => (
                <li key={link.title}>
                  <Link
                    href={link.link}
                    className="group inline-flex items-center gap-2 text-sm text-brand-black/65 transition-colors duration-300 hover:text-brand-black dark:text-brand-white/65 dark:hover:text-brand-white"
                  >
                    {link.title}

                    <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <span className="text-[11px] uppercase font-bold tracking-[0.25em] text-brand-black dark:text-brand-primary">
              Legal
            </span>

            <ul className="mt-6 space-y-4">
              {LEGAL_LINKS.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-brand-black/65 transition-colors duration-300 hover:text-brand-black dark:text-brand-white/65 dark:hover:text-brand-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Large Typography Section */}
        <div className="relative mt-20 border-t border-black/10 pt-10 dark:border-white/10">

          <div className="overflow-hidden">
            <h2
              className="
                text-center
                text-[19dvw]
                md:text-[20dvw]
                font-semibold
                uppercase
                leading-relaxed
               
                text-brand-black
                dark:text-brand-white
                font-heading
              "
            >
              CALACOT
            </h2>
          </div>

          {/* Bottom */}
          <div className="mt-4 flex flex-col items-start justify-between gap-4 pb-8 text-xs uppercase tracking-[0.15em] text-brand-black/40 dark:text-brand-white/40 md:flex-row md:items-center">
            <span>
              © {currentYear} Calacot Uganda Limited. <span className="capitalize">All rights reserved.</span>
            </span>

            {/* <span>
              Kampala — Uganda
            </span> */}
          </div>
        </div>
      </div>
    </footer>
  );
}