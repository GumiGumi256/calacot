"use client";

import { useState } from "react";
import Image from "next/image";

export default function DesignGallery({ images }: { images: { src: string; alt: string; blur?: string | null }[] }) {
  const [active, setActive] = useState(0);
  const selected = images[active];
  if (!selected) return <div className="grid aspect-[16/9] place-items-center rounded-2xl bg-current/5 text-sm">Design images coming soon</div>;
  return <div>
    <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-current/5 max-sm:aspect-[4/3]">
      <Image src={selected.src} alt={selected.alt} fill sizes="(max-width: 1280px) 100vw, 1200px" className="object-contain" preload={active === 0} placeholder={selected.blur ? "blur" : "empty"} blurDataURL={selected.blur || undefined} />
      <span className="absolute bottom-4 right-4 rounded-full bg-black/60 px-3 py-1 text-xs text-white" aria-live="polite">{active + 1} / {images.length}</span>
    </div>
    {images.length > 1 && <div className="mt-4 flex gap-3 overflow-x-auto p-1" aria-label="Design gallery">
      {images.map((item, index) => <button key={`${item.src}-${index}`} type="button" onClick={() => setActive(index)} aria-label={`View ${item.alt}`} aria-pressed={index === active} className={`relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border-2 focus-visible:outline-2 focus-visible:outline-offset-2 ${index === active ? "border-brand-primary" : "border-transparent opacity-60 hover:opacity-100"}`}>
        <Image src={item.src} alt="" fill sizes="112px" className="object-cover" />
      </button>)}
    </div>}
  </div>;
}
