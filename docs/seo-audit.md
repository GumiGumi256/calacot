# Calacot SEO audit and page comparison

Editorial recommendations based on the repository and supplied brand brief, not measured keyword or ranking data. No Search Console or analytics dataset was available. Existing URLs and visual design are preserved.

## Page comparison (implemented)

Titles below are the complete proposed document titles.

| URL | Previous title | Proposed title | Proposed description | Audience, intent and rationale |
| --- | --- | --- | --- | --- |
| / | Architecture, Interiors & Property in Uganda \| Calacot | We Make Possibilities Real \| Design, Property & Technology \| Calacot | Build a home, find your next property or improve how your business works. Calacot brings design, construction and technology together. Share your plans. | Parent-brand discovery: connect ambitions for homes and businesses with concrete design, property and technology offerings; preserve the main brand headline. |
| /architecture | Architectural Design in Uganda \| Calacot | Architecture for the Home You Have in Mind \| Calacot | Turn your vision for a home or building into a considered design. Explore Calacot's architectural concepts, layouts and design packages, then discuss your brief. | Homeowners and building clients: move from an idea to a workable architectural design; show concepts and packages without claiming completed construction. |
| /architecture/designs | Calacot \| Design, Property & Technology in Uganda (inherited) | House Designs & Architectural Plans \| Calacot | Find a starting point for the home you want to build. Explore Calacot's house designs, compare specifications and packages, and enquire about a design. | People comparing house plans: make the catalogue discoverable and distinguish designs from properties for sale. |
| /interior-design | Interior Design in Uganda \| Calacot | Interior Design for the Way You Live \| Calacot | Make more of your home or workspace with Calacot. Explore interior layouts, lighting, materials and finishes shaped around daily life. Tell us about your space. | Homeowners and workspace clients: show how planning, light and materials support everyday use. |
| /painting | Professional Painting Services in Uganda \| Calacot | Interior & Exterior Painting That Renews Your Space \| Calacot | Give your home or business a considered new finish. Calacot helps with surface preparation, colour and interior or exterior painting. Discuss your space. | People refreshing interiors or exteriors: lead with the service and the desired finish, supported by preparation and colour choices. |
| /real-estate | Real Estate in Uganda \| Calacot | Find a Home or Land in Uganda \| Calacot Estates | Find property that fits your next chapter. Calacot Estates supports home and land searches, property marketing and advisory in Uganda. Share your priorities. | Home and land seekers: geography clarifies property availability; Estates is an intermediary with discovery, marketing and advisory services. |
| /calacot-tech | Custom Software Development in Uganda \| Calacot | Custom Software for Better Ways of Working \| Calacot Tech | Turn a business idea or a difficult workflow into useful software. Calacot Tech builds web platforms and custom systems. Tell us what you want to improve. | Business owners and teams: connect custom software to useful products and improved workflows; identify the Tech division. |
| /contact | Contact Calacot Estates in Uganda \| Calacot | Talk About Your Property Plans \| Calacot Estates | A home to find, land to build on or a property to sell: tell Calacot Estates what you have in mind and how you would like our team to contact you. | Property enquiries: accurately describe this Estates-only form, rather than implying a general corporate contact page. |
| /list-property | List Your Property in Uganda \| Calacot | Property Marketing for Owners & Developers \| Calacot Estates | Help buyers understand what your property offers. Share your home, land or development with Calacot Estates to discuss marketing and sales representation. | Owners and developers: clarify marketing and sales representation, without promising a sale or claiming ownership. |
| /start-project | Start a Project in Uganda \| Calacot | Tell Us What You Want to Create \| Calacot | Share your plans for a home, space or digital product with Calacot. Tell us your priorities, scope and budget so we can discuss a practical next step. | Project briefing and design-purchase enquiries: retain navigation access, but noindex this transactional form. |
| /schedule-call | Schedule a Consultation \| Calacot | Discuss Your Next Project \| Calacot | Book a conversation with Calacot about your home, space, property or software plans. Choose a time and tell us what you would like to discuss. | Consultation booking: noindex the transactional scheduler; service pages remain discoverable. |
| /thank-you | Thank You for Contacting Calacot \| Calacot | Enquiry Received \| Calacot | Thank you for sharing your plans. Review what happens next and how to continue the conversation with Calacot. | Confirmation: maintain noindex and remove duplicated Calacot branding. |
| /architecture/designs/[slug] | {design.title} \| Calacot | {design.title} - Architectural Design \| Calacot | Complete-word excerpt of the published description; otherwise: Explore {design.title}, an architectural design from Calacot. Review the specifications and enquire about design packages. | Design-specific comparison and purchase enquiry. CMS name stays as the H1; metadata adds offering context, with matching sharing data and canonical URL. |
| /studio/[[...tool]] | Sanity Studio metadata | Content Studio \| Calacot | Calacot's content authoring environment. | Authoring UI: explicit noindex for all Studio paths, excluded from sitemap. |

## Visible copy review

| Page | H1 decision | Introductory copy decision |
| --- | --- | --- |
| Home | Keep We Make Possibilities Real. | Connect a home, a better space and a business idea to design, construction, property and technology. |
| Architecture | A home imagined. A design to build on. | Explain residential/commercial design, layouts, materials, 3D concepts and Uganda service context. |
| Design catalogue | Keep Distinctive homes. Extraordinary living. | Identify architectural designs, specifications and packages explicitly. |
| Interiors | Make room for the way you live. | Explain home/workspace interior design and the role of light, materials and daily routines; retain Uganda. |
| Painting | A new finish. A fresh sense of home. | Explain interior/exterior painting, preparation, colours and finish; retain Uganda. |
| Estates | Your next chapter. Find a place to live. | Explain home/land search and advisory in Uganda without suggesting property ownership. |
| Tech | Your ideas, put to work. Software with a purpose. | Name custom software, web platforms, connected systems and practical workflows; preserve existing Uganda/Africa scope. |
| Property contact | Keep Let's talk about your next chapter. | Existing home/land/sale enquiry copy is clear and appropriate. |
| List property | Keep Introduce your property. | Existing copy accurately offers a discussion about listing and selling; no sale guarantee. |
| Project briefing | Keep service-specific Start Your Project heading. | Remove return-oriented claims from the real-estate service variant. |
| Schedule call | Keep Schedule a Consultation. | Existing goals, timeline and next-steps introduction remains appropriate. |
| Confirmation | Keep outcome-specific confirmation heading. | Remains a transactional acknowledgement, not a landing page. |
| Design detail | Keep published design name as H1. | Published description, specifications and package information remain the content source; see CMS editorial findings below. |

## Technical changes

- One shared metadata builder sets canonical, Open Graph URL/type/locale/site name, Twitter large-image card and explicit general/Googlebot indexing rules.
- Absolute titles prevent parent layout templates from appending duplicate division names. Estates and Tech identify their respective audiences while retaining Calacot.
- Added metadata to the design catalogue. Design pages now have matching Twitter and Open Graph data, canonical URLs, readable description fallback and image fallback.
- Sitemap includes nine indexable static routes and all three published, non-archived design pages, including non-featured entries. Real CMS update timestamps are used. Published perspective excludes drafts; CMS outages surface instead of returning a silently incomplete sitemap.
- Project briefing, scheduling and confirmation are noindex; Studio is explicitly noindex/nofollow. Contact and property marketing pages stay indexable. Robots.txt allows crawlers to read noindex directives. No existing route was renamed.
- Existing Organization, WebSite and Service markup retains the verified-on-site company name and Uganda service area. Added the visible brand slogan and homepage description; no office address, rating, project history or property ownership was invented.
- Added design breadcrumbs and restored a descriptive link to the catalogue.
- Added optional image descriptions to design images in Studio; gallery and metadata prefer these descriptions and fall back to the design name. Existing image assets remain intact.
- Replaced the homepage villa alt text claiming a completed Calacot building with a description of the architectural rendering.
- Repaired the Tech navigation destinations /tech and /tech/start-a-project to point to existing routes.

## Published CMS editorial findings (not changed remotely)

The live published dataset contained three designs. No separate CMS SEO fields existed; metadata deliberately follows published design content. The technical metadata improvements apply to all three. These editorial corrections should be made in the source records so names, visible descriptions and sharing copy stay aligned. Existing slugs should stay unchanged.

| URL suffix | Current title | Suggested source title | Suggested source description | Reason |
| --- | --- | --- | --- | --- |
| six-bedroom-mansion | SIX BEDROOM MANSION | Six-Bedroom Mansion | Explore a six-bedroom home design with space for parking. Review the specifications and available packages, then tell us how it fits your plans. | Correct spelling in the description and replace vague lifestyle promises with supplied facts. |
| 4-bedroom-villa | 4 Bedroom villa | Four-Bedroom Villa | Consider a four-bedroom villa for the home you want to build. Explore its design specifications and packages, then discuss your plans with Calacot. | Replace luxury/masterpiece language with the verified bedroom count and a practical next step. |
| ultra-mordern-five-bedroom | Ultra Mordern Five bedroom Villa. | Contemporary Five-Bedroom Villa | Explore a villa design with open-plan living, a guest bedroom and a roof terrace. Review the layouts and packages to see how it fits your plans. | Correct the name and describe supplied layout details; confirm bedroom counting before editing source specifications. |

## Remaining issues and limits

- Footer links to /privacy, /terms and /cookies have no corresponding pages. Kept unchanged because real policy content needs the business's approved practices; no fabricated policies or unrelated redirects were added.
- The public /contact route is Estates-specific. General navigation labels may imply corporate contact; project enquiries remain available at /start-project. Changing the contact flow is outside this SEO copy change.
- The architecture page previously positioned the whole section as worldwide visualization for studios. Its supporting copy now describes residential/commercial design and visualization without claiming a worldwide client base.
- No property-detail, article or software-product routes exist in this repository. A property schema alone is not an indexable property page; no unsupported URLs were added.
- Some catalogue imagery has no authored image description yet. Optional fields are available, with safe fallbacks until editors supply accurate descriptions.
- No traffic, search-volume, ranking or conversion improvement has been measured or promised.

## References

Implementation follows the installed Next.js 16.2.1 metadata, sitemap and notFound documentation. Editorial choices follow [Google's title guidance](https://developers.google.com/search/docs/appearance/title-link); the crawlable noindex policy follows [Google's indexing guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing). Google may choose different search-result titles after recrawling.

## Verification

- TypeScript: npx tsc --noEmit passed.
- Source lint: npx eslint app components lib sanity scripts/verify-seo.ts --quiet passed (existing warnings are not treated as errors).
- SEO regression script checks all 12 static metadata entries, unique titles/descriptions, one brand mention, image existence, social metadata consistency, robots policy, dynamic fallback descriptions and URL encoding, missing-record guards and sitemap composition.
- Production build passed with network access for the existing Google Fonts and Sanity requests.
- HTTP verification against the production server checked all 12 public static-route pages, all three published designs, robots.txt, sitemap.xml, Studio and a nonexistent design. Normal pages returned 200. Each public page rendered one H1; the homepage brand headline was retained.
- Query-string variants for contact, property listing, project briefing and scheduling resolved to their clean canonical URLs. Sharing titles/descriptions matched the page metadata, with a large-image Twitter card.
- Sitemap rendered nine static URLs plus three design URLs and excluded the three transactional routes and Studio.
- Missing design output includes noindex and the not-found UI. Next.js streams this case with HTTP 200 rather than a hard 404; the notFound guards remain in both page rendering and metadata generation. No missing design URL enters the sitemap.
- Additional HTTP results are in seo-http-verification.json. These are local production responses, not evidence of a deployed change or a Google recrawl.
- Visual layout was not browser-tested in this SEO pass. Existing layout classes and interactions were preserved.
