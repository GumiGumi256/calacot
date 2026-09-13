import { seoPages, pageMetadata, designPageMetadata, sitemapEntries, indexablePaths, type SeoPath } from "../lib/seo";
import robots from "../app/robots";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

const titles = new Set<string>();
const descriptions = new Set<string>();
const excluded = ["/start-project", "/schedule-call", "/thank-you"];
for (const path of Object.keys(seoPages) as SeoPath[]) {
  const page = seoPages[path];
  const metadata = pageMetadata(path);
  const title = (metadata.title as { absolute: string }).absolute;
  assert.equal(metadata.alternates?.canonical, new URL(path, "https://calacot.com").toString());
  assert(!titles.has(title), `Duplicate title for ${path}`);
  assert(!descriptions.has(page.description), `Duplicate description for ${path}`);
  assert.equal(title.match(/Calacot/g)?.length, 1);
  titles.add(title);
  descriptions.add(page.description);
  if ("image" in page) assert(existsSync("public" + page.image), `Missing image for ${path}`);
  assert.equal(metadata.openGraph?.title, title);
  assert.equal(metadata.twitter?.title, title);
  assert.equal(metadata.openGraph?.description, page.description);
  assert.equal(metadata.twitter?.description, page.description);
  const directives = metadata.robots as { index: boolean; googleBot: { index: boolean } };
  assert.equal(directives.index, !excluded.includes(path));
  assert.equal(directives.googleBot.index, directives.index);
}
const design = designPageMetadata({ slug: "courtyard home", title: "Courtyard Home", description: "A home arranged around a courtyard. ".repeat(10) });
assert.equal(design.alternates?.canonical, "https://calacot.com/architecture/designs/courtyard%20home");
assert.equal(design.twitter?.title, design.openGraph?.title);
assert(design.description!.length <= 160);
assert(!design.description!.includes("\n"));
const fallback = designPageMetadata({ slug: "sample", title: "Sample | Calacot", description: "  " });
assert(fallback.description?.includes("Review the specifications"));
assert.equal((fallback.title as { absolute: string }).absolute.match(/Calacot/g)?.length, 1);
const entries = sitemapEntries([{ slug: "courtyard home", _updatedAt: "2026-01-01T00:00:00Z" }]);
assert.equal(entries.length, indexablePaths.length + 1);
for (const path of excluded) assert(!entries.some(entry => entry.url.endsWith(path)));
assert(entries.some(entry => entry.url.endsWith("/architecture/designs")));
assert.equal(entries.at(-1)?.url, design.alternates?.canonical);
assert.equal(entries.at(-1)?.lastModified, "2026-01-01T00:00:00Z");
assert.equal(robots().sitemap, "https://calacot.com/sitemap.xml");
// noindex URLs must remain crawlable, so bots can read their directives.
assert.deepEqual(robots().rules, { userAgent: "*", allow: "/", disallow: ["/api/"] });
const detail = readFileSync("app/(home)/architecture/designs/[slug]/page.tsx", "utf8");
assert.equal((detail.match(/if \(!design\) notFound\(\);/g) || []).length, 2);
const studio = readFileSync("app/studio/[[...tool]]/page.tsx", "utf8");
assert(studio.includes("index: false"));
console.log(`Verified ${titles.size} static pages, dynamic metadata fallbacks, sharing data, canonical URLs, image files, indexing policy and sitemap entries.`);
