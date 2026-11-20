import { absoluteUrl, seoPages, type SeoPath } from "@/lib/seo";
import { business, openingHours } from "@/lib/business";

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

const kampala = { "@type": "City", name: business.city, containedInPlace: { "@type": "Country", name: business.countryName } };
const uganda = { "@type": "Country", name: business.countryName };

/** Present keys only: empty values are omitted, never published as blanks. */
const compact = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && !v.length)));

/*
 * Site-wide graph. Calacot is described as a local business in Kampala (ProfessionalService is a
 * LocalBusiness), which is what local searches such as "architects in Kampala" match against.
 * Phone, street, hours and coordinates appear only once configured (lib/business.ts).
 */
export function SiteStructuredData() {
  const address = compact({
    "@type": "PostalAddress",
    streetAddress: business.street,
    addressLocality: business.area ? `${business.area}, ${business.city}` : business.city,
    addressRegion: business.region,
    postalCode: business.postcode,
    addressCountry: business.country,
  });
  const organization = compact({
    "@type": ["Organization", "ProfessionalService"],
    "@id": absoluteUrl("/#organization"),
    name: business.name,
    legalName: business.legalName,
    slogan: "We Make Possibilities Real.",
    description: seoPages["/"].description,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/calacot-logo.png"),
    image: absoluteUrl(seoPages["/"].image),
    telephone: business.phone,
    email: business.email,
    address,
    geo: business.geo ? { "@type": "GeoCoordinates", ...business.geo } : null,
    openingHoursSpecification: openingHours(),
    areaServed: [kampala, uganda],
    knowsAbout: [...business.services],
    sameAs: [...business.profiles],
    contactPoint: business.phone || business.email ? compact({ "@type": "ContactPoint", contactType: "customer service", telephone: business.phone, email: business.email, areaServed: "UG", availableLanguage: ["English"] }) : null,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Calacot services",
      itemListElement: (["/architecture", "/interior-design", "/painting", "/real-estate", "/calacot-tech"] as const).map((path) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", "@id": absoluteUrl(path + "#service"), name: (seoPages[path] as { service: string }).service, url: absoluteUrl(path) },
      })),
    },
  });
  return <JsonLd data={{ "@context": "https://schema.org", "@graph": [
    organization,
    { "@type": "WebSite", "@id": absoluteUrl("/#website"), name: business.name, url: absoluteUrl("/"), inLanguage: "en-UG", publisher: { "@id": absoluteUrl("/#organization") } },
  ] }} />;
}

export function ServiceStructuredData({ path }: { path: SeoPath }) {
  const page = seoPages[path];
  if (!("service" in page)) return null;
  return <JsonLd data={{ "@context": "https://schema.org", "@graph": [
    {
      "@type": "Service",
      "@id": absoluteUrl(path + "#service"),
      name: page.service,
      serviceType: page.service,
      description: page.description,
      url: absoluteUrl(path),
      image: absoluteUrl(page.image),
      brand: { "@type": "Brand", name: "brand" in page ? page.brand : business.name },
      provider: { "@id": absoluteUrl("/#organization") },
      areaServed: [kampala, uganda],
    },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: page.service, item: absoluteUrl(path) },
    ] },
  ] }} />;
}
