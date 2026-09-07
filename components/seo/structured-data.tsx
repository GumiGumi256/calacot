import { absoluteUrl, seoPages, type SeoPath } from "@/lib/seo";

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function SiteStructuredData() {
  return <JsonLd data={{ "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": absoluteUrl("/#organization"), name: "Calacot", legalName: "Calacot Uganda Limited", url: absoluteUrl("/"), logo: absoluteUrl("/calacot-logo-icon-black.svg"), areaServed: { "@type": "Country", name: "Uganda" } },
    { "@type": "WebSite", "@id": absoluteUrl("/#website"), name: "Calacot", url: absoluteUrl("/"), inLanguage: "en-UG", publisher: { "@id": absoluteUrl("/#organization") } },
  ] }} />;
}

export function ServiceStructuredData({ path }: { path: SeoPath }) {
  const page = seoPages[path];
  if (!("service" in page)) return null;
  return <JsonLd data={{ "@context": "https://schema.org", "@graph": [
    { "@type": "Service", "@id": absoluteUrl(path + "#service"), name: page.service, serviceType: page.service, description: page.description, url: absoluteUrl(path), image: absoluteUrl(page.image), provider: { "@id": absoluteUrl("/#organization") }, areaServed: { "@type": "Country", name: "Uganda" } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: page.service, item: absoluteUrl(path) },
    ] },
  ] }} />;
}
