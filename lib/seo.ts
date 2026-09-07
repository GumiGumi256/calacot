import type { Metadata } from "next";

export const siteUrl = new URL("https://calacot.com");
export const absoluteUrl = (path: string) => new URL(path, siteUrl).toString();

type SeoPage = { title: string; description: string; image?: string; service?: string };
export const seoPages = {
  "/": {
    "title": "Architecture, Interiors & Property in Uganda",
    "description": "Explore Calacot's architectural design, interior design, painting, real estate and software development services in Uganda. Tell us about your project.",
    "image": "/villa-1.png"
  },
  "/architecture": {
    "title": "Architectural Design in Uganda",
    "description": "Residential and commercial architectural design in Uganda with Calacot. Explore house concepts, space planning and 3D visualizations for your next project.",
    "image": "/concept-1.jpg",
    "service": "Architectural design"
  },
  "/interior-design": {
    "title": "Interior Design in Uganda",
    "description": "Interior design for homes and commercial spaces in Uganda. Calacot brings together space planning, materials, lighting and finishes around your needs.",
    "image": "/interior-hero-right.png",
    "service": "Interior design"
  },
  "/painting": {
    "title": "Professional Painting Services in Uganda",
    "description": "Refresh your home or business with interior and exterior painting services in Uganda. Discuss surface preparation, colours and finishes with Calacot.",
    "image": "/painting-hero-light.png",
    "service": "Interior and exterior painting"
  },
  "/real-estate": {
    "title": "Real Estate in Uganda",
    "description": "Looking for a home, land or a buyer in Uganda? Calacot Estates helps with property searches, land enquiries and sales representation for owners and developers.",
    "image": "/real-estate-hero.png",
    "service": "Real estate services"
  },
  "/software-development": {
    "title": "Custom Software Development in Uganda",
    "description": "Calacot Tech builds custom software, web platforms and business management systems for organisations in Uganda. Discuss your workflows and digital project.",
    "image": "/tech.jpg",
    "service": "Custom software development"
  },
  "/contact": {
    "title": "Contact Calacot Estates in Uganda",
    "description": "Contact Calacot Estates about buying a home, finding land or selling property in Uganda. Share your requirements and preferred way to get in touch."
  },
  "/list-property": {
    "title": "List Your Property in Uganda",
    "description": "Introduce your property or development to Calacot Estates in Uganda. Discuss property marketing and sales representation with our team."
  },
  "/start-project": {
    "title": "Start a Project in Uganda",
    "description": "Tell Calacot about your architecture, interior design, painting or software project in Uganda. Share your scope, location, budget and preferred timeline."
  },
  "/schedule-call": {
    "title": "Schedule a Consultation",
    "description": "Schedule a call with Calacot to discuss your design, painting, property or software requirements in Uganda."
  },
  "/thank-you": {
    "title": "Thank You for Contacting Calacot",
    "description": "Your enquiry has been received. Review the next steps for your project or consultation."
  }
} satisfies Record<string, SeoPage>;
export type SeoPath = keyof typeof seoPages;

export function pageMetadata(path: SeoPath): Metadata {
  const page: SeoPage = seoPages[path];
  const title = page.title + " | Calacot";
  const images = [{ url: absoluteUrl(page.image || "/villa-1.png"), alt: page.title }];
  return {
    title: { absolute: title },
    description: page.description,
    alternates: { canonical: absoluteUrl(path) },
    openGraph: { type: "website", locale: "en_UG", siteName: "Calacot", title, description: page.description, url: absoluteUrl(path), images },
    twitter: { card: "summary_large_image", title, description: page.description, images },
    ...(path === "/thank-you" ? { robots: { index: false, follow: true } } : {}),
  };
}
