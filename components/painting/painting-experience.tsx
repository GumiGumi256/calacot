import Image from "next/image";

export default function ExperienceSection() {
  return (
    <section className=" px-12 md:px-16 pt-14 pb-8 md:pb-16 overflow-hidden">
      {/* Header row */}
      <div className="flex flex-col md:flex-row md:justify-between w-full items-center gap-8 md:gap-20 mb-12">
        <h2 className="sub-title leading-tight whitespace-nowrap  capitalize text-center md:text-left">
          Experience<br />You can Trust
        </h2>
        <p className="text-p leading-relaxed pt-1 text-center w-full md:max-w-[520px]">
          At Calacot, painting is more than a service —{" "}
          it&apos;s a craft. We are a team of dedicated professionals
          committed to transforming homes.
        </p>
      </div>

      {/* Desktop layout */}
      <div className="hidden sm:flex justify-between items-start gap-6 min-h-[480px]">
        {/* Left group: first (small) + center (large) */}
        <div className="flex gap-6 w-3/4 self-end">
          {/* First image – smaller, same size as last */}
          <div className="relative w-1/4 aspect-square h-[300px] self-end">
            <Image
              src="/painting-1.jpg"
              alt="Painter applying yellow paint with brush"
              fill
              className="object-cover rounded-2xl aspect-square"
              sizes="(max-width: 768px) 100vw, 20vw"
            />
          </div>

          {/* Center image – larger */}
          <div className="relative w-3/4 aspect-[4/3]">
            <Image
              src="/painting-2.jpg"
              alt="Painter using roller with blue paint"
              fill
              className="object-cover rounded-2xl"
              sizes="(max-width: 768px) 100vw, 55vw"
            />
          </div>
        </div>

        {/* Last image – smaller, same size as first, top-right corner */}
        <div className="relative w-1/4 h-[300px] aspect-square self-start">
          <Image
            src="/painting-3.jpg"
            alt="Smiling professional painter"
            fill
            className="object-cover rounded-2xl"
            sizes="(max-width: 768px) 100vw, 20vw"
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