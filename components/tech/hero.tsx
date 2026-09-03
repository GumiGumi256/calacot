import Link from "next/link";

const products = [
  {
    name: "Events OS",
    description: "Event operations platform",
  },
  {
    name: "School OS",
    description: "School management platform",
  },
];

export default function TechHero() {
  return (
    <section className="relative isolate flex min-h-[calc(100svh-4rem)] overflow-hidden bg-brand-black text-brand-white">
      {/* Background video */}
      <video
        aria-hidden="true"
        className="absolute inset-0 -z-30 size-full object-cover object-center"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        tabIndex={-1}
      >
        <source
          src="/video-bg.mp4"
          type="video/mp4"
          media="(prefers-reduced-motion: no-preference)"
        />
      </video>

      {/* Static fallback when video is unavailable or reduced motion is enabled */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-40 bg-[radial-gradient(circle_at_50%_90%,rgba(40,111,255,0.34),transparent_28%),radial-gradient(circle_at_20%_85%,rgba(255,146,0,0.3),transparent_30%),#08090d]"
      />

      {/* Video overlays */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(5,6,10,0.82)_0%,rgba(5,6,10,0.38)_48%,rgba(5,6,10,0.72)_100%)]"
      />
{/* Soft transition into the next section */}
<div
  aria-hidden="true"
  className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-40 bg-gradient-to-b from-transparent via-brand-black/80 to-brand-black sm:h-52 lg:h-64"
/>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(5,6,10,0.38)_100%)]"
      />

      

      <div className="mx-auto flex w-full max-w-[90rem] flex-col px-5 pb-6 pt-24 sm:px-8 sm:pb-8 lg:px-12 lg:pb-10 lg:pt-32">
        {/* Hero content */}
        <div className="flex flex-1 items-center justify-center py-16">
          <div className="mx-auto max-w-5xl text-center">
           

            <h1 className="text-balance text-[clamp(2.75rem,7vw,7rem)] font-heading font-semibold leading-[0.92] tracking-[-0.055em] text-brand-white">
              Complex operations.
              <span className="mt-2 block text-brand-primary">
                Made beautifully simple.
              </span>
            </h1>

            <p className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-7 text-white/70 sm:text-lg sm:leading-8">
              Calacot Tech designs intelligent digital products that help
              African businesses operate efficiently, serve customers better
              and scale with greater control.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/tech/start-a-project"
                className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-black transition duration-300 hover:-translate-y-0.5 hover:bg-brand-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary sm:w-auto"
              >
                Discuss your business

                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
                >
                  <path
                    d="M4 10h12M11 5l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>

              <Link
                href="#products"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/20 bg-white/[0.06] px-6 py-3 text-sm font-medium text-white backdrop-blur-md transition duration-300 hover:border-white/35 hover:bg-white/[0.1] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:w-auto"
              >
                Explore what we’re building
              </Link>
            </div>

            
          </div>
        </div>

      
      </div>
    </section>
  );
}