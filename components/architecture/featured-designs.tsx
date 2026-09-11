import { getFeaturedDesigns } from "@/lib/queries/design";
import { urlFor } from "@/sanity/lib/image";
import FeaturedDesignCarousel from "./featured-design-carousel";
import Link from "next/link";

export default async function FeaturedDesigns() {
  let designs;
  try {
    designs = await getFeaturedDesigns();
  } catch (error) {
    console.error("Unable to load featured architectural designs", error);
    return <FeaturedDesignsMessage unavailable />;
  }

  if (!designs.length) return <FeaturedDesignsMessage />;

  const cards = designs.map(({ featuredImage, ...design }) => ({
    ...design,
    imageUrl: urlFor(featuredImage)
      .width(1600)
      .height(1000)
      .fit("crop")
      .auto("format")
      .url(),
  }));

  return (
    <section
      id="featured-designs"
      className="overflow-hidden bg-brand-white py-[clamp(72px,8vw,128px)] text-brand-black dark:bg-brand-black dark:text-brand-white"
      aria-labelledby="featured-designs-title"
    >
      <header className="mx-auto mb-[60px] max-w-[740px] px-6 text-center max-sm:mb-9">
        
        <h2
          id="featured-designs-title"
          className="text-[clamp(36px,4.3vw,64px)] font-normal leading-[1.07] tracking-[-.055em]"
        >
          Good design.
          <br />
          <span className="text-black/55 dark:text-white/55">
            Great places to live.
          </span>
        </h2>
        <p className="mx-auto mt-6 max-w-[470px] text-sm leading-[1.8] opacity-65 max-sm:text-[13px]">
          Explore our featured architectural designs. Considered proportions,
          beautiful details, and room for the way you live.
        </p>
      </header>
      <FeaturedDesignCarousel designs={cards} />
    </section>
  );
}

function FeaturedDesignsMessage({
  unavailable = false,
}: {
  unavailable?: boolean;
}) {
  return (
    <section
      id="featured-designs"
      className="overflow-hidden bg-brand-white py-[clamp(72px,8vw,128px)] text-brand-black dark:bg-brand-black dark:text-brand-white"
      aria-labelledby="featured-designs-title"
    >
      <header className="mx-auto max-w-[740px] px-6 text-center">
        
        <h2
          id="featured-designs-title"
          className="text-[clamp(36px,4.3vw,64px)] font-normal leading-[1.07] tracking-[-.055em]"
        >
          Your next chapter,
          <br />
          <span className="text-black/55 dark:text-white/55">
            thoughtfully designed.
          </span>
        </h2>
        <p className="mx-auto mt-6 max-w-[470px] text-sm leading-[1.8] opacity-65">
          {unavailable
            ? "Our design collection is temporarily unavailable. Our team can help you explore the possibilities."
            : "Our next selection of featured designs is on its way. Talk to us about the home you have in mind."}
        </p>
        <Link
          className="mt-3 inline-flex items-center gap-[18px] border-b border-black/25 px-0 py-2 text-xs transition-colors hover:border-brand-primary dark:border-white/25"
          href="/start-project?service=architecture"
        >
          Discuss your project <span aria-hidden="true">↗</span>
        </Link>
      </header>
    </section>
  );
}

export function FeaturedDesignsLoading() {
  return (
    <div
      className="grid min-h-[500px] place-items-center text-[13px] opacity-60"
      role="status"
    >
      <span>Loading the selected collection…</span>
    </div>
  );
}
