import type { Metadata, MetadataRoute } from "next";

/*
 * One canonical address for search engines. calacot.com permanently redirects to www.calacot.com,
 * so canonicals, the sitemap and structured data must use the www host; URLs that redirect are not
 * indexed. Titles and descriptions name the service and the place people search for.
 */
export const siteUrl = new URL("https://www.calacot.com");
export const absoluteUrl = (path: string) => new URL(path, siteUrl).toString();

type SeoPage = {
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  service?: string;
  brand?: string;
  noIndex?: boolean;
};
export const seoPages = {
  "/": {
    title: "Architects, Interior Design, Painting & Property in Uganda",
    description: "Calacot is a Kampala design and property company: architectural house plans, interior design, painting, real estate and custom software across Uganda.",
    image: "/villa-1.png",
  },
  "/architecture": {
    title: "Architects in Kampala, Uganda: Home & Building Design",
    description: "Architectural design for homes and buildings across Uganda. Calacot's Kampala architects turn your brief into plans, 3D concepts and design packages.",
    image: "/concept-1.jpg",
    service: "Architectural design",
  },
  "/architecture/designs": {
    title: "House Plans for Sale in Uganda: Ready-Made Designs",
    description: "Browse ready-made house plans for Uganda: villas, bungalows and mansions with specifications and packages. Buy a plan or have it adapted to your plot.",
    image: "/design-hero.png",
  },
  "/interior-design": {
    title: "Interior Designers in Kampala: Homes & Workspaces",
    description: "Interior design in Kampala and across Uganda: space planning, lighting, materials, furniture and finishes for homes, offices and hospitality spaces.",
    image: "/interior-hero-right.png",
    service: "Interior design",
  },
  "/painting": {
    title: "Painting Services in Kampala: Interior & Exterior Painters",
    description: "Professional interior and exterior painting in Kampala and across Uganda: surface preparation, colour advice and durable finishes. Request a quote.",
    image: "/painting-hero-light.png",
    service: "Interior and exterior painting",
  },
  "/real-estate": {
    title: "Houses & Land for Sale in Uganda",
    description: "Find houses, apartments and land for sale or rent in Kampala and across Uganda. Calacot Estates also markets properties for owners and developers.",
    image: "/real-estate-hero-2.png",
    service: "Real estate services",
    brand: "Calacot Estates",
  },
  "/calacot-tech": {
    title: "Software Development Company in Uganda: Web & Custom Systems",
    description: "Calacot Tech builds websites, web platforms and custom business software in Kampala, Uganda. Turn a workflow or an idea into useful software.",
    image: "/tech.jpg",
    service: "Custom software and digital products",
    brand: "Calacot Tech",
  },
  "/contact": {
    title: "Property Enquiries in Kampala & Uganda",
    description: "Buying, renting or selling property in Uganda? Tell Calacot Estates what you have in mind and how you would like our Kampala team to contact you.",
    brand: "Calacot Estates",
  },
  "/list-property": {
    title: "List Your Property for Sale in Uganda",
    description: "Selling a house, land or development in Uganda? List it with Calacot Estates for professional marketing and sales representation in Kampala and beyond.",
    brand: "Calacot Estates",
  },
  "/start-project": {
    "title": "Tell Us What You Want to Create",
    "description": "Share your plans for a home, space or digital product with Calacot. Tell us your priorities, scope and budget so we can discuss a practical next step.",
    "noIndex": true
  },
  "/schedule-call": {
    "title": "Discuss Your Next Project",
    "description": "Book a conversation with Calacot about your home, space, property or software plans. Choose a time and tell us what you would like to discuss.",
    "noIndex": true
  },
  "/thank-you": {
    "title": "Enquiry Received",
    "description": "Thank you for sharing your plans. Review what happens next and how to continue the conversation with Calacot.",
    "noIndex": true
  }
} satisfies Record<string, SeoPage>;
export type SeoPath = keyof typeof seoPages;

export function brandedTitle(title: string, brand = "Calacot") {
  // CMS design names may already include a brand suffix.
  return /\bCalacot\b/i.test(title) ? title : title + " | " + brand;
}

export function createPageMetadata(path: string, page: SeoPage): Metadata {
  const title = brandedTitle(page.title, page.brand);
  const images = [{ url: absoluteUrl(page.image || "/villa-1.png"), alt: page.imageAlt || page.title }];
  const index = !page.noIndex;
  return {
    title: { absolute: title },
    description: page.description,
    alternates: { canonical: absoluteUrl(path) },
    openGraph: { type: "website", locale: "en_UG", siteName: "Calacot", title, description: page.description, url: absoluteUrl(path), images },
    twitter: { card: "summary_large_image", title, description: page.description, images },
    robots: { index, follow: true, googleBot: { index, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  };
}

export function pageMetadata(path: SeoPath): Metadata {
  return createPageMetadata(path, seoPages[path]);
}

export const indexablePaths = (Object.keys(seoPages) as SeoPath[])
  .filter((path) => !(seoPages[path] as SeoPage).noIndex);

export type DesignSeo = {
  slug: string;
  title: string;
  description?: string | null;
  image?: string;
  imageAlt?: string | null;
};

export function designPageMetadata(design: DesignSeo): Metadata {
  const description = design.description?.trim().replace(/\s+/g, " ");
  const excerpt = description && description.length > 160
    ? description.slice(0, 157).replace(/\s+\S*$/, "") + "..."
    : description;
  return createPageMetadata(`/architecture/designs/${encodeURIComponent(design.slug)}`, {
    title: `${design.title}: House Plan & Architectural Design in Uganda`,
    description: excerpt || `Explore ${design.title}, a ready-made house plan for Uganda by Calacot. Review the specifications and design packages, or have it adapted to your plot.`,
    image: design.image || "/design-hero.png",
    imageAlt: design.imageAlt || design.title,
  });
}

/** Main pages first (higher priority), then every house plan with its image for Google Images. */
const priorities: Partial<Record<SeoPath, number>> = { "/": 1, "/architecture": 0.9, "/architecture/designs": 0.9, "/interior-design": 0.8, "/painting": 0.8, "/real-estate": 0.8, "/calacot-tech": 0.8 };
export function sitemapEntries(designs: { slug: string; _updatedAt: string; image?: string | null }[]): MetadataRoute.Sitemap {
  return [
    ...indexablePaths.map((path) => ({ url: absoluteUrl(path), changeFrequency: "weekly" as const, priority: priorities[path] ?? 0.6 })),
    ...designs.map((design) => ({
      url: absoluteUrl(`/architecture/designs/${encodeURIComponent(design.slug)}`),
      lastModified: design._updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      ...(design.image ? { images: [design.image] } : {}),
    })),
  ];
}
