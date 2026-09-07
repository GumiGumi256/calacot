import Image from "next/image";
import Link from "next/link";
import { Compass, House, MapPin, MessagesSquare } from "lucide-react";

const benefits = [
  {
    title: "Your priorities first",
    description:
      "Your lifestyle, preferred location and plans shape the search from the beginning.",
    icon: Compass,
  },
  {
    title: "An architectural perspective",
    description:
      "Look beyond appearances to consider light, layout, materials and everyday functionality.",
    icon: House,
  },
  {
    title: "A sense of place",
    description:
      "Consider the neighbourhood, its character and the connections that matter to you.",
    icon: MapPin,
  },
  {
    title: "A personal conversation",
    description:
      "Discuss your expectations, ask questions and define what the right property means to you.",
    icon: MessagesSquare,
  },
];

export default function RealEstateApproach() {
  return (
    <section
      id="developments"
      className="bg-brand-white text-brand-black dark:bg-brand-black dark:text-brand-white ]"
    >
      <div className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-stretch lg:gap-14 xl:gap-16">
          {/* Left feature panel */}
          <div className="relative flex w-full flex-col overflow-hidden rounded-xl border border-brand-black/10 bg-brand-white/10 dark:border-brand-white/10 dark:bg-brand-black/8 h-[500px] md:max-lg:grid md:max-lg:h-auto md:max-lg:grid-cols-2 md:max-lg:items-center">
            <div className="p-7 pb-0 md:p-8 md:pb-0 md:max-lg:pb-8">
              <h2 className="max-w-[17ch] text-2xl font-bold leading-[1.12] tracking-tight md:text-[2rem] lg:text-[2.25rem]">
                A considered way to find your next home.
              </h2>

              <p className="mt-4 max-w-[26ch] text-sm leading-6 text-brand-black/60 dark:text-brand-white/60">
                Real estate in Uganda, shaped around the way you want to live.
              </p>

              <Link
                href="/contact"
                className="mt-5 inline-flex min-h-11 items-center rounded-md bg-brand-primary px-5 py-2.5 text-xs font-medium text-brand-black transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary"
              >
                Begin your search
              </Link>
            </div>

            {/* Fit the full house beside the copy on tablets. */}
            <div className="relative mt-6 h-85 shrink-0 overflow-hidden md:h-90 md:max-lg:mt-0 md:max-lg:h-auto md:max-lg:aspect-square">
              <div className="absolute inset-y-0 left-0 w-[118%] md:max-lg:w-full">
                <Image
                  src="/simple-house.png"
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 450px, (min-width: 768px) calc((100vw - 80px) / 2), calc((100vw - 48px) * 1.18)"
                  className="object-cover object-bottom-left md:max-lg:object-contain md:max-lg:object-center"
                />
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div className="grid content-start gap-x-8 gap-y-10 sm:grid-cols-2 lg:content-between lg:gap-x-9 lg:py-2">
            {benefits.map(({ title, description, icon: Icon }) => (
              <article key={title} className="flex min-w-0 flex-col items-start">
                <div
                  aria-hidden="true"
                  className="relative mb-5 flex size-12 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary dark:bg-brand-primary/20"
                >
                  <Icon className="size-5 stroke-[1.75]" />

                  <div className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-brand-primary text-brand-black">
                    <Icon className="size-2.5 stroke-[2.5]" />
                  </div>
                </div>

                <h3 className="text-lg font-bold leading-[1.2] tracking-tight md:text-xl lg:text-2xl">
                  {title}
                </h3>

                <p className="mt-3 max-w-[29ch] text-sm leading-6 text-brand-black/60 dark:text-brand-white/60">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
