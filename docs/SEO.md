# Calacot SEO: what's in the code, and what to do outside it

Last updated 20 November 2026.

## Why calacot.com wasn't showing up

- **Every URL given to Google redirected.** `calacot.com` permanently redirects to `www.calacot.com`, but the sitemap, robots.txt, canonical tags and structured data all named `calacot.com`. Google won't index URLs that redirect, and canonicals pointing at a redirect send mixed signals. All of these now use `https://www.calacot.com`.
- **Titles and headings never named the service or the place.** "Architecture for the Home You Have in Mind" doesn't match "architects in Kampala" or "house plans Uganda". The titles, descriptions and a visible label above each hero heading now do.
- **No local business signals.** There was no address, area served or profiles in the structured data, and no contact details on the site. Calacot is now described as a Kampala business, and its contact details appear once you provide them (see below).
- **The site is new to Google.** A search for "calacot.com" found nothing at all (November 2026). Search Console registration (step 1 below) is what gets it crawled.

## What changed in the code

| Area | Change |
|---|---|
| Canonical host | `lib/seo.ts`: `siteUrl` is `https://www.calacot.com`. `npm run test:seo` fails if any sitemap URL uses another host. |
| Titles and descriptions | Each indexable page names the service and Kampala/Uganda, e.g. "Architects in Kampala, Uganda", "House Plans for Sale in Uganda" and "Painting Services in Kampala". Descriptions are at most 160 characters. |
| Visible text | A small label above each hero heading says what and where: "Architects in Kampala, Uganda", "House plans for sale in Uganda" and so on. The footer shows "Kampala, Uganda", plus the phone and email once set. |
| Structured data | The site-wide graph describes Calacot as an `Organization` + `ProfessionalService` (a LocalBusiness) in Kampala. It covers Kampala and Uganda as areas served, the 5 official social profiles (`sameAs`) and a catalogue of the 5 services. Division pages carry `Service` and breadcrumb data. The house plans page carries an `ItemList` of designs. Each design page carries `Product` data (images, SKU, the UGX package price range) for price rich results. |
| Sitemap | `www` URLs, priorities, and each design's main image (for Google Images). |
| Verification | `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` settings add the ownership meta tags with no code change. |
| Freshness | `app/api/revalidate/sanity/route.ts`: a signed Sanity webhook refreshes design pages and the sitemap as soon as content is published. Otherwise refresh happens every 60 seconds. |

## Settings to add in Vercel (Project → Settings → Environment Variables)

| Name | Example | Why |
|---|---|---|
| `GOOGLE_SITE_VERIFICATION` | the code from Search Console's "HTML tag" method | Proves you own the site |
| `SANITY_REVALIDATE_SECRET` | a long random string | Lets only Sanity trigger the refresh webhook |
| `CALACOT_PUBLIC_PHONE` | +256 7XX XXX XXX | Phone in the footer and structured data |
| `CALACOT_PUBLIC_EMAIL` | info@calacot.com | Email in the footer and structured data |
| `CALACOT_PUBLIC_STREET` | Plot 00, Example Road | Street address |
| `CALACOT_PUBLIC_AREA` | e.g. Kololo | Neighbourhood |
| `CALACOT_PUBLIC_HOURS` | `Mo-Fr 08:00-17:00, Sa 09:00-13:00` | Opening hours |
| `CALACOT_PUBLIC_GEO` | `0.3301,32.5880` | Map pin (latitude,longitude) |

Use exactly the same name, address and phone everywhere (website, Google Business Profile, directories, social bios). Inconsistent details weaken local rankings. Redeploy after changing these.

## Sanity webhook (instant updates)

In sanity.io/manage → your project → API → Webhooks → Create:

- **URL:** `https://www.calacot.com/api/revalidate/sanity`
- **Trigger on:** Create, Update, Delete
- **Filter:** `_type in ["design", "designPackage"]`
- **Projection:** `{_type, "slug": slug.current}`
- **HTTP method:** POST, with the **Secret** set to the same value as `SANITY_REVALIDATE_SECRET`

## Off-site steps, in order of impact

1. **Google Search Console** (search.google.com/search-console):
   - Add the domain property `calacot.com` (DNS verification covers www and non-www), or a URL-prefix property `https://www.calacot.com/` using `GOOGLE_SITE_VERIFICATION`.
   - Submit `https://www.calacot.com/sitemap.xml`.
   - Use **URL Inspection → Request indexing** on the home page, /architecture, /architecture/designs, /interior-design, /painting, /real-estate and /calacot-tech.
2. **Google Business Profile** (business.google.com). Create "Calacot" in Kampala with:
   - Categories: primary "Architect"; secondary "Interior designer", "Painter", "Real estate agency", "Software company".
   - The same address, phone and website as above.
   - Opening hours, project photos and services.
   - Ask happy clients for reviews.

   This is what makes Calacot appear in the map results for "architects near me" and "painters Kampala".
3. **Bing Webmaster Tools.** You can import directly from Search Console. Bing also powers several AI assistants' web search.
4. **Directories and citations:** Yellow Pages Uganda (yellow.ug), Uganda business directories, Houzz, and the Uganda Society of Architects' member directory if eligible. Use the same name, address and phone.
5. **Content.** Each new house plan in Sanity is a new page Google can rank, so give each one a full description (bedrooms, plot size, style, Kampala/Uganda context). Articles answering real questions bring searchers who aren't ready to buy yet. Examples: house plan approval with KCCA, building costs per square metre in Uganda, choosing exterior paint for Uganda's climate.
6. **Links.** Ask partners, suppliers and press (Daily Monitor *Homes & Property*, New Vision) to link to calacot.com. Featured designs in those sections rank well for "house plans Uganda".

## Ground rules (from the earlier SEO notes, still valid)

- **The canonical host is now `www`.** The earlier plan was to redirect `www` to `calacot.com`, but hosting does the opposite: `calacot.com` redirects to `www`. The code now follows what is live.
  - If you'd rather the address had no `www`, make `calacot.com` the primary domain in Vercel (Project → Domains) and change `siteUrl` in `lib/seo.ts` to match.
  - The two must always agree.
- **Never invent ratings, reviews, office locations or legal policies.** Structured data only states what is true and configured.
- **Case studies:** publish real projects (with permission) as case studies: location, service, brief, photographs, process and outcome. Link each to its service page, and label conceptual renders clearly.
- **FAQs:** add service FAQs based on real enquiries (preparation, scope, pricing factors). Avoid near-identical "city" pages and keyword stuffing.
- **Studio and the thank-you page** stay `noindex` and out of the sitemap. Robots still allows crawling them so the `noindex` can be read.
- **Footer legal links:** only Privacy Policy is linked. `/privacy`, `/terms` and `/cookies` were broken links. Add Terms and Cookies once approved texts exist.

## Checking progress

- **Search Console → Pages** shows indexed URLs. Expect the first ones within days of submitting, and rankings over weeks to months.
- **Search Console → Performance** shows which searches show Calacot and how often people click.
- **Rich Results Test** (search.google.com/test/rich-results): paste a design page URL to confirm the Product data is read.
