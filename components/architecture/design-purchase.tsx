"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import type { DesignPackage } from "@/lib/queries/design";

export default function DesignPurchase({ packages: packageOptions, slug, status }: {
  packages?: DesignPackage[] | null; slug: string; status: string;
}) {
  const packages = packageOptions ?? [];
  const [selectedKey, setSelectedKey] = useState(
    packages.find((item) => item.recommended)?._key ?? packages[0]?._key,
  );
  const selected = packages.find((item) => item._key === selectedKey);
  const query = new URLSearchParams({ service: "architecture", design: slug });
  if (selected) query.set("package", selected._key);

  return (
    <aside className="rounded-2xl border border-current/15 p-6 lg:sticky lg:top-28 lg:self-start lg:p-8">
      <p className="text-xs uppercase tracking-[.16em] opacity-55">Make it yours</p>
      <h2 className="mt-3 section-heading">Choose your package.</h2>
      {packages.length > 0 ? (
        <fieldset className="mt-6 space-y-3">
          <legend className="sr-only">Design package</legend>
          {packages.map((item) => (
            <label key={item._key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${selectedKey === item._key ? "border-brand-primary bg-brand-primary/10" : "border-current/15"}`}>
              <input className="mt-1 accent-brand-primary" type="radio" name="design-package" value={item._key} checked={selectedKey === item._key} onChange={() => setSelectedKey(item._key)} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.package.name}</span>
                {item.recommended && <span className="mt-1 block text-[10px] uppercase tracking-wider opacity-60">Recommended</span>}
                {item.package.description && <span className="mt-2 block text-xs leading-6 opacity-65">{item.package.description}</span>}
                <span className="mt-2 block text-lg">UGX {item.price.toLocaleString("en-UG")}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : <p className="mt-6 text-sm opacity-65">Contact us for package availability and pricing.</p>}
      {selected && <div className="mt-6" aria-live="polite">
        <h3 className="text-sm font-medium">Included in {selected.package.name}</h3>
        <ul className="mt-3 space-y-3">{selected.package.includes?.map((item, index) => <li key={index} className="flex gap-3 text-sm leading-6 opacity-75"><Check className="mt-1 size-4 shrink-0" aria-hidden="true" />{item}</li>)}</ul>
      </div>}
      {status === "coming-soon" ? <Button disabled size="lg" className="mt-7 w-full">Coming soon</Button> :
        <Link href={`/start-project?${query}`} className={buttonVariants({ variant: "default", size: "lg", className: "mt-7" })}>
          {selected ? "Buy this design" : "Enquire about this design"}<ArrowUpRight size={18} aria-hidden="true" />
        </Link>}
      <p className="mt-4 text-xs leading-6 opacity-55">{status === "coming-soon" ? "This design is not yet available to purchase." : "Send a purchase enquiry. Our team will confirm your package and arrange payment with you."}</p>
    </aside>
  );
}
