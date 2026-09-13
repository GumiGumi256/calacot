import type { Metadata, MetadataRoute } from "next";

export const siteUrl = new URL("https://calacot.com");
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
    "title": "We Make Possibilities Real | Design, Property & Technology",
    "description": "Build a home, find your next property or improve how your business works. Calacot brings design, construction and technology together. Share your plans.",
    "image": "/villa-1.png"
  },
  "/architecture": {
    "title": "Architecture for the Home You Have in Mind",
    "description": "Turn your vision for a home or building into a considered design. Explore Calacot's architectural concepts, layouts and design packages, then discuss your brief.",
    "image": "/concept-1.jpg",
    "service": "Architectural design"
  },
  "/architecture/designs": {
    "title": "House Designs & Architectural Plans",
    "description": "Find a starting point for the home you want to build. Explore Calacot's house designs, compare specifications and packages, and enquire about a design.",
    "image": "/design-hero.png"
  },
  "/interior-design": {
    "title": "Interior Design for the Way You Live",
    "description": "Make more of your home or workspace with Calacot. Explore interior layouts, lighting, materials and finishes shaped around daily life. Tell us about your space.",
    "image": "/interior-hero-right.png",
    "service": "Interior design"
  },
  "/painting": {
    "title": "Interior & Exterior Painting That Renews Your Space",
    "description": "Give your home or business a considered new finish. Calacot helps with surface preparation, colour and interior or exterior painting. Discuss your space.",
    "image": "/painting-hero-light.png",
    "service": "Interior and exterior painting"
  },
  "/real-estate": {
    "title": "Find a Home or Land in Uganda",
    "description": "Find property that fits your next chapter. Calacot Estates supports home and land searches, property marketing and advisory in Uganda. Share your priorities.",
    "image": "/real-estate-hero-2.png",
    "service": "Real estate services",
    "brand": "Calacot Estates"
  },
  "/calacot-tech": {
    "title": "Custom Software for Better Ways of Working",
    "description": "Turn a business idea or a difficult workflow into useful software. Calacot Tech builds web platforms and custom systems. Tell us what you want to improve.",
    "image": "/tech.jpg",
    "service": "Custom software and digital products",
    "brand": "Calacot Tech"
  },
  "/contact": {
    "title": "Talk About Your Property Plans",
    "description": "A home to find, land to build on or a property to sell: tell Calacot Estates what you have in mind and how you would like our team to contact you.",
    "brand": "Calacot Estates"
  },
  "/list-property": {
    "title": "Property Marketing for Owners & Developers",
    "description": "Help buyers understand what your property offers. Share your home, land or development with Calacot Estates to discuss marketing and sales representation.",
    "brand": "Calacot Estates"
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
    title: `${design.title} - Architectural Design`,
    description: excerpt || `Explore ${design.title}, an architectural design from Calacot. Review the specifications and enquire about design packages.`,
    image: design.image || "/design-hero.png",
    imageAlt: design.imageAlt || design.title,
  });
}

export function sitemapEntries(designs: { slug: string; _updatedAt: string }[]): MetadataRoute.Sitemap {
  return [
    ...indexablePaths.map((path) => ({ url: absoluteUrl(path) })),
    ...designs.map((design) => ({
      url: absoluteUrl(`/architecture/designs/${encodeURIComponent(design.slug)}`),
      lastModified: design._updatedAt,
    })),
  ];
}
