"use client";

import { buttonVariants } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import type { FeaturedDesign } from "@/lib/queries/design";

gsap.registerPlugin(useGSAP);

type DesignCard = Omit<FeaturedDesign, "featuredImage"> & { imageUrl: string };
const number = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });

export default function FeaturedDesignCarousel({
  designs,
}: {
  designs: DesignCard[];
}) {
  const carousel = useRef<HTMLDivElement>(null);
  const [viewport, api] = useEmblaCarousel({
    align: "center",
    loop: designs.length > 2,
    containScroll: false,
    duration: 35,
    breakpoints: { "(prefers-reduced-motion: reduce)": { duration: 0 } },
  });
  const [selected, setSelected] = useState(0);
  const [navigation, setNavigation] = useState({
    previous: false,
    next: designs.length > 1,
  });

  useGSAP(
    () => {
      const activeCard = carousel.current?.querySelector<HTMLElement>(
        '[data-active="true"] .featured-card',
      );
      const image = carousel.current?.querySelector<HTMLElement>(
        '[data-active="true"] .featured-image',
      );
      if (
        !activeCard ||
        !image ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        return;

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .fromTo(
          activeCard,
          { y: 18, scale: 0.965 },
          { y: 0, scale: 1, duration: 0.8 },
          0,
        )
        .fromTo(
          image,
          { scale: 1.06 },
          { scale: 1, duration: 1.15, ease: "power2.out" },
          0,
        );
    },
    { scope: carousel, dependencies: [selected], revertOnUpdate: true },
  );

  useEffect(() => {
    if (!api) return;
    const update = () => {
      setSelected(api.selectedScrollSnap());
      setNavigation({
        previous: api.canScrollPrev(),
        next: api.canScrollNext(),
      });
    };
    api.on("select", update);
    api.on("reInit", update);
    // Embla may initialize before this effect subscribes.
    const frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      api.off("select", update);
      api.off("reInit", update);
    };
  }, [api]);

  return (
    <div
      ref={carousel}
      className="relative [--card-width:min(72vw,960px)] max-[1000px]:[--card-width:82vw] max-[640px]:[--card-width:92vw]"
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured architectural designs"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          api?.scrollPrev();
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          api?.scrollNext();
        }
      }}
    >
      <div
        ref={viewport}
        className="touch-pan-y overflow-hidden [touch-action:pan-y_pinch-zoom]"
      >
        <div className="flex">
          {designs.map((design, index) => (
            <article
              key={design._id}
              className="group min-w-0 flex-[0_0_var(--card-width)] px-[18px] max-[1000px]:px-3 max-[640px]:px-2"
              data-active={selected === index}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${designs.length}: ${design.title}`}
            >
              <div className="featured-card origin-center scale-[.91] opacity-30 transition-[opacity,transform] duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-data-[active=true]:scale-100 group-data-[active=true]:opacity-100 motion-reduce:transition-none">
                <div className="relative aspect-[1.6] overflow-hidden rounded-[14px] bg-black/8 max-[640px]:aspect-[1.2] max-[640px]:rounded-[10px]">
                  <Image
                    src={design.imageUrl}
                    alt={
                      design.imageAlt ||
                      `${design.title} architectural exterior`
                    }
                    fill
                    sizes="(max-width: 640px) 88vw, (max-width: 1200px) 78vw, 960px"
                    className="featured-image object-cover"
                    placeholder={design.imageBlur ? "blur" : "empty"}
                    blurDataURL={design.imageBlur || undefined}
                  />
                  <span className="absolute left-6 top-6 rounded-full border border-white/35 bg-black/25 px-3 py-2 text-[10px] tracking-[.07em] text-white backdrop-blur-xl max-[640px]:left-3.5 max-[640px]:top-3.5 max-[640px]:text-[9px]">
                    {design.status === "coming-soon"
                      ? "Coming soon"
                      : "Featured design"}
                  </span>
                  <span
                    className="absolute bottom-5 right-6 text-[13px] text-white [text-shadow:0_1px_8px_black]"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="grid grid-cols-[1.25fr_1fr] gap-9 pt-[26px] max-[1000px]:gap-6 max-[640px]:grid-cols-1 max-[640px]:gap-[22px] max-[640px]:pt-[22px]">
                  <div>
                    <p className="mb-2.5 text-[10px] uppercase tracking-[.14em] opacity-55">
                      {[design.architecturalStyle, design.designType]
                        .filter(Boolean)
                        .join(" / ")}
                    </p>
                    <h3 className="text-[clamp(25px,2.5vw,36px)] font-normal leading-[1.15] tracking-[-.045em]">
                      {design.title}
                    </h3>
                    {design.description && (
                      <p className="mt-[13px] line-clamp-3 max-w-[430px] text-[13px] leading-[1.8] opacity-65">
                        {design.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right max-[640px]:border-t max-[640px]:border-black/12 max-[640px]:pt-[18px] max-[640px]:text-left dark:max-[640px]:border-white/12">
                    <p className="mb-1.5 text-[11px] opacity-55">
                      {design.startingPrice != null
                        ? "Design packages from"
                        : "Design packages"}
                    </p>
                    <p className="text-[clamp(21px,2vw,29px)] leading-[1.25] tracking-[-.04em]">
                      {design.startingPrice != null ? (
                        <>
                          <span className="text-xs tracking-normal">UGX</span>{" "}
                          {number.format(design.startingPrice)}
                        </>
                      ) : (
                        "Price on enquiry"
                      )}
                    </p>
                    <ul
                      className="mt-[15px] flex flex-wrap justify-end gap-x-[15px] gap-y-2 text-[11px] opacity-65 max-[640px]:justify-start max-[640px]:text-xs"
                      aria-label="Design specifications"
                    >
                      {design.bedrooms != null && (
                        <li>
                          {design.bedrooms}{" "}
                          {design.bedrooms === 1 ? "bedroom" : "bedrooms"}
                        </li>
                      )}
                      {design.bathrooms != null && (
                        <li>
                          {design.bathrooms}{" "}
                          {design.bathrooms === 1 ? "bathroom" : "bathrooms"}
                        </li>
                      )}
                      {design.totalArea != null && (
                        <li>{number.format(design.totalArea)} m²</li>
                      )}
                    </ul>
                    <Link
                      href={`/architecture/designs/${encodeURIComponent(design.slug)}`}
                      tabIndex={selected === index ? 0 : -1}
                      className="mt-3 inline-flex items-center gap-[18px] border-b border-black/25 px-0 py-2 text-xs transition-colors hover:border-brand-primary dark:border-white/25"
                      aria-label={`View ${design.title}`}
                    >
                      View Design{" "}
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      {designs.length > 1 && (
        <>
          <button
            className={buttonVariants({ variant: "outline", size: "icon", className: "absolute left-[calc((100%_-_var(--card-width))_/_2_-_6px)] top-[calc((var(--card-width)_-_36px)_/_3.2)] z-2 -translate-y-1/2 max-[640px]:left-0 max-[640px]:top-[calc((var(--card-width)_-_16px)_/_2.4)]" })}
            type="button"
            onClick={() => api?.scrollPrev()}
            disabled={!navigation.previous}
            aria-label="Previous featured design"
          >
            <ArrowLeft size={21} aria-hidden="true" />
          </button>
          <button
            className={buttonVariants({ variant: "outline", size: "icon", className: "absolute right-[calc((100%_-_var(--card-width))_/_2_-_6px)] top-[calc((var(--card-width)_-_36px)_/_3.2)] z-2 -translate-y-1/2 max-[640px]:right-0 max-[640px]:top-[calc((var(--card-width)_-_16px)_/_2.4)]" })}
            type="button"
            onClick={() => api?.scrollNext()}
            disabled={!navigation.next}
            aria-label="Next featured design"
          >
            <ArrowRight size={21} aria-hidden="true" />
          </button>
        </>
      )}
     
    </div>
  );
}
