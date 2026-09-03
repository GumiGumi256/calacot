"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ModeToggle } from "../mode-toggle";

const navigation = [
  {
    name: "Solutions",
    href: "/tech/solutions",
  },
  {
    name: "Products",
    href: "/tech/products",
  },
  {
    name: "Approach",
    href: "/tech/approach",
  },
  {
    name: "About",
    href: "/tech/about",
  },
];

export function TechNavbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* Keeps the logo and navigation visible over the hero video */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-brand-black/90 via-brand-black/45 to-transparent"
      />

      <nav
        aria-label="Technology navigation"
        className="relative mx-auto flex h-20 w-full max-w-[90rem] items-center justify-between px-5 sm:px-8 lg:h-24 lg:px-12"
      >
        <TechLogo />

        {/* Desktop navigation */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 lg:block">
          <div className="flex items-center rounded-full border border-white/20 bg-black/25 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            {navigation.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative rounded-full px-5 py-2.5 text-sm font-medium transition-colors duration-300 ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/65 hover:text-white"
                  }`}
                >
                  {item.name}

                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-5 -bottom-1 h-px origin-center bg-brand-primary transition-transform duration-300 ${
                      active ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <Link
            href="/tech/start-a-project"
            className="group relative hidden min-h-11 items-center justify-center overflow-hidden rounded-full border border-white/25 bg-black/60 px-6 text-sm font-semibold text-white shadow-[0_0_20px_rgba(48,126,255,0.38),-8px_0_22px_rgba(255,174,37,0.22)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-white/45 sm:inline-flex"
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(100deg,rgba(255,201,25,0.16),transparent_40%,rgba(53,134,255,0.22))] opacity-70 transition-opacity duration-300 group-hover:opacity-100"
            />

            <span className="relative">Discuss your business</span>
          </Link>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger >
              <button
                type="button"
                aria-label="Open navigation"
                className="inline-flex size-11 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary lg:hidden"
              >
                <Menu aria-hidden="true" className="size-5" />
                <span className="sr-only">Open navigation</span>
              </button>
            </SheetTrigger>

            <SheetContent
              side="right"
              className="w-full max-w-none overflow-hidden border-l border-white/10 bg-brand-black/95 p-0 text-brand-white shadow-2xl backdrop-blur-2xl sm:max-w-md [&>button]:hidden"
            >
              <div
                aria-hidden="true"
                className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_90%_5%,rgba(45,118,255,0.2),transparent_38%),radial-gradient(circle_at_5%_92%,rgba(255,174,30,0.16),transparent_38%)]"
              />

              <div
                aria-hidden="true"
                className="absolute inset-0 -z-10 opacity-[0.05] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px]"
              />

              <div className="flex h-svh flex-col px-5 pb-6 pt-5 sm:px-7">
                <div className="flex items-center justify-between">
                  <TechLogo />

                  <SheetClose >
                    <button
                      type="button"
                      aria-label="Close navigation"
                      className="inline-flex size-11 items-center justify-center rounded-full border border-white/20 bg-white/[0.06] text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                    >
                      <X aria-hidden="true" className="size-5" />
                      <span className="sr-only">Close navigation</span>
                    </button>
                  </SheetClose>
                </div>

                <SheetHeader className="sr-only">
                  <SheetTitle>Calacot Tech navigation</SheetTitle>
                  <SheetDescription>
                    Navigate through the Calacot Tech website.
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-10 border-b border-white/10 pb-4 text-xs font-medium uppercase tracking-[0.18em] text-white/35">
                  Navigation
                </div>

                <div className="flex flex-col">
                  {navigation.map((item, index) => {
                    const active =
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);

                    return (
                      <SheetClose key={item.name} >
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className="group flex min-h-20 items-center justify-between border-b border-white/10 py-5"
                        >
                          <span
                            className={`text-3xl font-medium tracking-[-0.045em] transition-colors duration-300 ${
                              active
                                ? "text-brand-primary"
                                : "text-white group-hover:text-brand-primary"
                            }`}
                          >
                            {item.name}
                          </span>

                          <span className="flex items-center gap-4">
                            <span className="text-xs tabular-nums text-white/30">
                              {String(index + 1).padStart(2, "0")}
                            </span>

                            <ArrowRight
                              aria-hidden="true"
                              className="size-5 text-white/40 transition duration-300 group-hover:translate-x-1 group-hover:text-brand-primary"
                            />
                          </span>
                        </Link>
                      </SheetClose>
                    );
                  })}
                </div>

                <div className="mt-auto space-y-4">
                  <SheetClose >
                    <Link
                      href="/tech/start-a-project"
                      className="group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-brand-primary px-6 text-sm font-semibold text-brand-black transition-colors hover:bg-brand-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary"
                    >
                      Discuss your business

                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                      />
                    </Link>
                  </SheetClose>

                  <div className="flex items-center justify-between text-xs text-white/35">
                    <span>Kampala, Uganda</span>
                    <span>Calacot Tech</span>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <ModeToggle />
      </nav>
    </header>
  );
}

function TechLogo() {
  return (
    <Link
      href="/tech"
      aria-label="Calacot Tech home"
      className="group relative z-10 inline-flex items-center gap-3"
    >
      <span className="relative flex h-12 w-[152px] items-center 5 px-3  transition-colors duration-300  sm:w-[170px]">
        <Image
          src="/calacot-logo-vertical-white.svg"
          width={170}
          height={64}
          priority
          alt="Calacot"
          className="h-auto w-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)]"
        />
      </span>

     
    </Link>
  );
}