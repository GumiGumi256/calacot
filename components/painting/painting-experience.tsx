import Image from "next/image";

export default function ExperienceSection() {
  return (
    <section className=" px-12 sm:px-8 md:px-10 lg:px-16 pt-14 pb-8 md:pb-16 overflow-hidden">
      {/* Header row */}
      <div className="flex flex-col md:flex-row md:justify-between w-full items-center gap-8 lg:gap-20 mb-12">
        <h2 className="whitespace-nowrap capitalize text-center md:text-left md:shrink-0 section-heading">
          Experience<br />You can Trust
        </h2>
        <p className="text-p leading-relaxed pt-1 text-center w-full md:max-w-[520px] md:max-lg:text-left">
          At Calacot, painting is more than a service —{" "}
          it&apos;s a craft. We are a team of dedicated professionals
          committed to transforming homes.
        </p>
      </div>

      {/* Staggered gallery with balanced tablet columns. */}
      <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] lg:flex justify-between items-start gap-4 lg:gap-6 sm:min-h-[320px] md:min-h-[360px] lg:min-h-[480px]">
        {/* Left group: first (small) + center (large) */}
        <div className="contents lg:flex lg:gap-6 lg:w-3/4 lg:self-end">
          {/* First image – smaller, same size as last */}
          <div className="relative w-full lg:w-1/4 aspect-square h-[220px] md:h-[260px] lg:h-[300px] self-end">
            <Image
              src="/painting-1.jpg"
              alt="Painter applying yellow paint with brush"
              fill
              className="object-cover rounded-2xl aspect-square"
              sizes="(min-width: 1024px) 20vw, (min-width: 768px) calc((100vw - 112px) / 4), calc((100vw - 96px) / 4)"
            />
          </div>

          {/* Center image – larger */}
          <div className="relative w-full lg:w-3/4 aspect-[4/3] sm:max-lg:h-[320px] md:max-lg:h-[360px] self-end">
            <Image
              src="/painting-2.jpg"
              alt="Painter using roller with blue paint"
              fill
              className="object-cover rounded-2xl"
              sizes="(min-width: 1024px) 55vw, (min-width: 768px) calc((100vw - 112px) / 2), calc((100vw - 96px) / 2)"
            />
          </div>
        </div>

        {/* Last image – smaller, same size as first, top-right corner */}
        <div className="relative w-full lg:w-1/4 h-[220px] md:h-[260px] lg:h-[300px] aspect-square self-start">
          <Image
            src="/painting-3.jpg"
            alt="Smiling professional painter"
            fill
            className="object-cover rounded-2xl"
            sizes="(min-width: 1024px) 20vw, (min-width: 768px) calc((100vw - 112px) / 4), calc((100vw - 96px) / 4)"
          />
        </div>
      </div>

      {/* Mobile layout (unchanged) */}
      <div className="flex flex-col gap-3 sm:hidden">
        <div className="relative h-[220px] w-full rounded-2xl overflow-hidden shadow-lg">
          <Image
            fill
            src="/painting-1.jpg"
            alt="Painter applying yellow paint with brush"
            className="object-cover"
            sizes="100vw"
          />
        </div>
        <div className="relative h-[220px] w-full rounded-2xl overflow-hidden shadow-lg">
          <Image
            fill
            src="/painting-2.jpg"
            alt="Painter using roller with blue paint"
            className="object-cover"
            sizes="100vw"
          />
        </div>
        <div className="relative h-[220px] w-full rounded-2xl overflow-hidden shadow-lg">
          <Image
            fill
            src="/painting-3.jpg"
            alt="Smiling professional painter"
            className="object-cover"
            sizes="100vw"
          />
        </div>
      </div>
    </section>
  );
}
