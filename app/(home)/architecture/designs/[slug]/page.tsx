import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { getDesignBySlug } from "@/lib/queries/design";
import { urlFor } from "@/sanity/lib/image";
import { absoluteUrl, designPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/structured-data";
import DesignGallery from "@/components/architecture/design-gallery";
import DesignPurchase from "@/components/architecture/design-purchase";

type Props = { params: Promise<{ slug: string }> };
const label = (value: string) => value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (value: number) => `UGX ${value.toLocaleString("en-UG")}`;
const serviceLabels: Record<string, string> = {
  structural: "Structural engineering", electrical: "Electrical design", mechanical: "Mechanical design",
  boq: "Bill of quantities (BOQ)", interior: "Interior design", "site-adaptation": "Site adaptation", approval: "Approval assistance",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const design = await getDesignBySlug((await params).slug);
  
  if (!design) notFound();
  return designPageMetadata({
    slug: design.slug,
    title: design.title,
    description: design.description,
    image: design.featuredImage ? urlFor(design.featuredImage).width(1200).height(630).fit("crop").url() : undefined,
    imageAlt: design.imageAlt,
  });
}

export default async function DesignDetailsPage({ params }: Props) {
  const design = await getDesignBySlug((await params).slug);
  if (!design) notFound();
  const images = [
    ...(design.featuredImage ? [{ src: urlFor(design.featuredImage).width(1800).auto("format").url(), alt: design.imageAlt || design.title, blur: design.imageBlur }] : []),
    ...(design.images || []).map((item, index) => ({ src: urlFor(item.image).width(1800).auto("format").url(), alt: item.alt || `${design.title} - view ${index + 2}`, blur: item.blur })),
  ];
  const plot = design.plotSize;
  const specifications = [
    ["Property type", design.propertyType && label(design.propertyType)],
    ["Design type", design.designType && label(design.designType)],
    ["Architectural style", design.architecturalStyle && label(design.architecturalStyle)],
    ["Bedrooms", design.bedrooms], ["Bathrooms", design.bathrooms], ["Floors", design.floors],
    ["Total floor area", design.totalArea != null ? `${design.totalArea.toLocaleString("en-UG")} m²` : null],
    ["Recommended plot", plot && (plot.width != null || plot.length != null) ? `${plot.width != null ? `Width: ${plot.width}${plot.unit ? ` ${plot.unit}` : ""}` : ""}${plot.width != null && plot.length != null ? " × " : ""}${plot.length != null ? `Length: ${plot.length}${plot.unit ? ` ${plot.unit}` : ""}` : ""}` : null],
  ].filter(([, value]) => value != null);
  const estimate = design.estimatedBuildCost;

  return <article className="bg-brand-white text-brand-black dark:bg-brand-black dark:text-brand-white">
    <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Architecture", item: absoluteUrl("/architecture") },
      { "@type": "ListItem", position: 3, name: "Architectural designs", item: absoluteUrl("/architecture/designs") },
      { "@type": "ListItem", position: 4, name: design.title, item: absoluteUrl(`/architecture/designs/${encodeURIComponent(design.slug)}`) },
    ] }} />
    <div className="pb-24 pt-28 md:pt-28 site-container">
      <Link href="/architecture/designs" className="inline-flex min-h-11 items-center gap-2 text-sm opacity-65 hover:opacity-100"><ArrowLeft size={16} aria-hidden="true" />Explore architectural designs</Link>
      <header className="mb-9 mt-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[.16em] opacity-55">{[design.architecturalStyle, design.designType].filter(Boolean).join(" / ")}</p>
          <h1 className="mt-4 max-w-4xl text-[clamp(40px,6vw,80px)] leading-[1.05] tracking-[-.055em]">{design.title}</h1>
          {/* {design.designCode && <p className="mt-4 text-xs opacity-55">Design code: {design.designCode}</p>} */}
        </div>
        <span className="rounded-full border border-current/20 px-4 py-2 text-xs">{label(design.status)}</span>
      </header>
      <DesignGallery images={images} />
      <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
        <div className="min-w-0 space-y-10">
          <section><h2 className="section-heading">About this design</h2>{design.description && <p className="mt-5 whitespace-pre-line text-sm leading-8 opacity-70">{design.description}</p>}</section>
          <section><h2 className="section-heading">Design specifications</h2>
            <dl className="mt-5 grid grid-cols-2 gap-x-6">{specifications.map(([name, value]) => <div key={name} className="border-b border-current/15 py-5"><dt className="text-xs opacity-55">{name}</dt><dd className="mt-2 text-base">{value}</dd></div>)}</dl>
          </section>
          {!!design.features?.length && <section><h2 className="section-heading">Thoughtful details</h2><ul className="mt-5 grid gap-4 sm:grid-cols-2">{design.features.map((feature, index) => <li key={index} className="flex gap-3 text-sm leading-6"><Check className="mt-1 size-4 shrink-0" aria-hidden="true" />{feature}</li>)}</ul></section>}
          {!!design.additionalServices?.length && <section><h2 className="section-heading">Additional services</h2><p className="mt-3 text-sm opacity-60">Optional services, priced separately from your design package.</p><dl className="mt-4">{design.additionalServices.map((service) => <div key={service._key} className="flex flex-wrap justify-between gap-3 border-b border-current/15 py-4 text-sm"><dt>{serviceLabels[service.service] || label(service.service)}</dt><dd className="opacity-65">{service.priceOnRequest || service.price == null ? "Price on request" : money(service.price)}</dd></div>)}</dl></section>}
          {estimate && (estimate.minimum != null || estimate.maximum != null) && <section className="rounded-xl bg-current/5 p-6"><h2 className="text-xl">Estimated construction cost</h2><p className="mt-3 text-xl">{estimate.minimum != null && estimate.maximum != null ? `${money(estimate.minimum)} – ${money(estimate.maximum)}` : estimate.minimum != null ? `From ${money(estimate.minimum)}` : `Up to ${money(estimate.maximum!)}`}</p><p className="mt-3 text-xs leading-6 opacity-60">An approximate construction estimate, separate from the design package price.</p></section>}
          {design.canCustomize != null && <section><h2 className="section-heading">{design.canCustomize ? "Adapt it to your life" : "Customization"}</h2><p className="mt-4 whitespace-pre-line text-sm leading-8 opacity-70">{design.canCustomize ? design.customizationNote || "This design can be customized. Tell our team about the changes you have in mind." : "This design is offered as shown, without customization."}</p></section>}
        </div>
        <DesignPurchase packages={design.packages} slug={design.slug} status={design.status} />
      </div>
    </div>
  </article>;
}
