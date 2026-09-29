"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Bath, BedDouble, LoaderCircle, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CollectionDesign, DesignCollectionPage } from "@/lib/queries/design";

const number = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });
const label = (value: string) => value.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase());

export default function DesignCollectionBrowser({ initialPage }: { initialPage: DesignCollectionPage | null }) {
  const [page, setPage] = useState(initialPage);
  const [type, setType] = useState("");
  const [pending, setPending] = useState<"filter" | "more" | null>(null);
  const [error, setError] = useState(initialPage ? "" : "We couldn’t load the collection. Please try again.");
  const controller = useRef<AbortController | null>(null);
  const retry = useRef({ type: "", offset: 0 });
  const grid = useRef<HTMLUListElement>(null);
  const focusIndex = useRef<number | null>(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (focusIndex.current !== null && page) {
      grid.current?.querySelectorAll<HTMLAnchorElement>("a")[focusIndex.current]?.focus({ preventScroll: true });
      focusIndex.current = null;
    }
  }, [page]);

  async function load(nextType: string, offset = 0) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    retry.current = { type: nextType, offset };
    setPending(offset ? "more" : "filter");
    setError("");
    try {
      const params = new URLSearchParams({ type: nextType, offset: String(offset) });
      const response = await fetch(`/api/designs?${params}`, { signal: request.signal });
      if (!response.ok) throw new Error("Collection request failed");
      const result: DesignCollectionPage = await response.json();
      if (request.signal.aborted) return;
      if (offset) focusIndex.current = page?.designs.length ?? 0;
      setPage((previous) => ({
        ...result,
        designs: offset && previous
          ? [...previous.designs, ...result.designs.filter((design) => !previous.designs.some((item) => item._id === design._id))]
          : result.designs,
      }));
      setType(nextType);
    } catch {
      if (!request.signal.aborted) setError("We couldn’t load these designs. Your place is saved — please try again.");
    } finally {
      if (!request.signal.aborted) setPending(null);
    }
  }

  return (
    <section id="design-collection" aria-labelledby="design-collection-title" className="section-space text-foreground">
      <div className="site-container">
        <header className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
        
            <h2 id="design-collection-title" className="section-heading">More ways to feel at home.</h2>
          </div>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">Find a design that fits your life. Explore the details, compare spaces, and make it your own.</p>
        </header>

        <div className="mb-8 flex flex-col gap-5 border-y border-border py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <label htmlFor="design-type" className="text-sm font-medium">Design type</label>
            <select id="design-type" value={type} disabled={pending !== null || !page}
              onChange={(event) => void load(event.target.value)}
              aria-controls="design-results"
              className="h-11 min-w-52 rounded-xl border border-border bg-background px-4 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
              <option value="">All types</option>
              {page?.types.map((item) => <option key={item} value={item}>{label(item)}</option>)}
            </select>
            {type && <Button variant="ghost" disabled={pending !== null} onClick={() => void load("")}>Clear filter</Button>}
          </div>
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {pending === "filter" ? "Finding your designs…" : pending === "more" ? "Loading more designs…" : page ? `${page.designs.length} of ${page.total} ${page.total === 1 ? "design" : "designs"}${type ? ` · ${label(type)}` : ""}` : "Collection unavailable"}
          </p>
        </div>

        {error && <div role="alert" className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-background p-5">
          <p className="text-sm">{error}</p>
          <Button variant="outline" disabled={pending !== null} onClick={() => void load(retry.current.type, retry.current.offset)}>Try again</Button>
        </div>}

        <div id="design-results" aria-busy={pending !== null}>
          <ul ref={grid} className={`grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 ${pending === "filter" ? "opacity-50" : ""}`}>
            {page?.designs.map((design) => <li key={design._id}><DesignCard design={design} /></li>)}
          </ul>
          {page?.designs.length === 0 && !pending && !error && <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <h3 className="text-2xl tracking-tight">{type ? "More designs are on their way." : "You’re all caught up."}</h3>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">{type ? "Try another design type to discover more possibilities." : "Explore the featured designs above, or check back soon for new additions to the collection."}</p>
            {type && <Button className="mt-6" variant="outline" onClick={() => void load("")}>Explore all types</Button>}
          </div>}
        </div>

        {!!page?.designs.length && <div className="mt-12 flex flex-col items-center gap-4 border-t border-border pt-8">
          <p className="text-xs text-muted-foreground">Showing {page.designs.length} of {page.total} designs</p>
          {page.nextOffset !== null ? <Button variant="outline" size="lg" disabled={pending !== null} aria-controls="design-results" onClick={() => void load(type, page.nextOffset!)}>
            {pending === "more" ? <><LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> Loading designs…</> : <>Load more designs <ArrowDown aria-hidden="true" /></>}
          </Button> : <p className="text-sm text-muted-foreground">You’ve explored every {type ? `${label(type).toLowerCase()} ` : ""}design in this collection.</p>}
        </div>}
      </div>
    </section>
  );
}

function DesignCard({ design }: { design: CollectionDesign }) {
  return (
    <Link href={`/architecture/designs/${encodeURIComponent(design.slug)}`} className="group block h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
      <div className="relative aspect-[3/2] overflow-hidden rounded-2xl bg-muted">
        <Image src={design.imageUrl} alt={design.imageAlt || `${design.title} architectural exterior`} fill sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" className="object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-105" placeholder={design.imageBlur ? "blur" : "empty"} blurDataURL={design.imageBlur || undefined} />
        {design.status === "coming-soon" && <span className="absolute left-4 top-4 rounded-full bg-background/95 px-3 py-2 text-xs font-medium">Coming soon</span>}
        <span aria-hidden="true" className="absolute bottom-4 right-4 grid size-10 place-items-center rounded-full bg-background/95 text-foreground"><ArrowUpRight className="size-5" /></span>
      </div>
      <div className="px-1 pt-5">
        <p className="text-[11px] uppercase tracking-[.13em] text-muted-foreground">{[design.designType, design.architecturalStyle].filter(Boolean).map((value) => label(value!)).join(" / ") || "Architectural design"}</p>
        <h3 className="mt-2 text-2xl font-medium tracking-tight">{design.title}</h3>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Design specifications">
          {design.bedrooms != null && <li className="flex items-center gap-1.5"><BedDouble className="size-4" aria-hidden="true" />{design.bedrooms} {design.bedrooms === 1 ? "bedroom" : "bedrooms"}</li>}
          {design.bathrooms != null && <li className="flex items-center gap-1.5"><Bath className="size-4" aria-hidden="true" />{design.bathrooms} {design.bathrooms === 1 ? "bathroom" : "bathrooms"}</li>}
          {design.totalArea != null && <li className="flex items-center gap-1.5"><Ruler className="size-4" aria-hidden="true" />{number.format(design.totalArea)} m²</li>}
        </ul>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm font-medium">{design.startingPrice != null ? <><span className="font-normal text-muted-foreground">From </span>UGX {number.format(design.startingPrice)}</> : "Price on enquiry"}</p>
          <span className="text-xs text-muted-foreground group-hover:text-foreground">View design</span>
        </div>
      </div>
    </Link>
  );
}
