# SEO maintenance and launch

Production origin: https://calacot.com. Shared page metadata lives in lib/seo.ts; update it when services or URLs change. The sitemap includes public pages only and deliberately omits invented modification dates. Keep new indexable routes in the registry, with internal links and unique visible content.

## Launch

- Redirect alternate hosts (including www) to https://calacot.com in the hosting provider. Confirm HTTPS works.
- Verify the domain in Google Search Console via DNS, or set GOOGLE_SITE_VERIFICATION to the HTML verification token and rebuild. Submit https://calacot.com/sitemap.xml.
- Inspect each service URL in Search Console and validate structured data with Google's Rich Results Test. Service schema describes services; it does not guarantee a rich result.
- Studio already supplies noindex through next-sanity; thank-you also has noindex. Neither is in the sitemap. Robots allows crawling these pages so noindex can be read; this is not access control.
- Protect preview deployments using your host's preview access controls.

## Local growth

- Complete a Google Business Profile using the actual business name, eligible address/service area, telephone, hours and relevant categories. Keep details consistent with the website. Organization schema is used until a verified business address and contact details are available; do not invent ratings or office locations.
- Publish real project case studies with permission: location, service, brief, photographs, process and outcomes. Link each case study to its service page. Clearly label conceptual renders.
- Add useful service FAQs based on real enquiries, project preparation, scope and pricing factors. Avoid repetitive city pages and keyword stuffing.
- Track service-page impressions, clicks, search terms and enquiries monthly. Improve pages using actual Uganda search demand. Rankings and traffic are not guaranteed by metadata.

## Existing follow-up

The footer links to /privacy, /terms and /cookies, but those pages do not exist. Supply approved policy content before publishing them; SEO work does not invent legal policies.

References: https://developers.google.com/search/docs/fundamentals/seo-starter-guide and https://developers.google.com/search/docs/appearance/structured-data/organization
