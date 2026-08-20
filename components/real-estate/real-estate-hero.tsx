import Image from "next/image";
import Link from "next/link";

export default function RealEstateHero() {
  return (
    <section className="relative h-screen min-h-[720px] w-full overflow-hidden">
      {/* Background Image */}
      <Image
        fill
        src="/real-estate-hero.png"
        alt="Luxury residence"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* Content */}
      <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col px-6 pt-16 md:px-12 md:pt-12">
        {/* Top Content */}
        <div className="flex justify-between items-start">
          {/* Left */}
          <div className="max-w-2xl mt-10">
            <h1 className="text-5xl leading-[0.95] font-light tracking-tight text-brand-black dark:text-brand-white sm:text-7xl lg:text-[82px]">
              Find a place you
              <br />
              will call home
            </h1>

            <Link
              href="/contact"
              className="mt-10 inline-flex bg-brand-black dark:bg-brand-white dark:text-brand-black px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              Book a call
            </Link>
          </div>

          {/* Right */}
          <div className="hidden lg:block max-w-xs mt-12">
            <p className="text-sm leading-6 text-neutral-600 dark:text-brand-white/80">
              With us you will find not just accommodation, but a place where
              your new life begins, full of coziness and possibilities.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
