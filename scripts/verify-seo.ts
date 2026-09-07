import { seoPages, pageMetadata, type SeoPath } from "../lib/seo";
import sitemap from "../app/sitemap";
import robots from "../app/robots";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";

const titles = new Set<string>();
for (const path of Object.keys(seoPages) as SeoPath[]) {
  const page = seoPages[path];
  const metadata = pageMetadata(path);
  assert.equal(metadata.alternates?.canonical, new URL(path, "https://calacot.com").toString());
  assert(!titles.has(page.title), `Duplicate title for ${path}`);
  titles.add(page.title);
  if ("image" in page) assert(existsSync("public" + page.image));
}
assert.equal(sitemap().length, Object.keys(seoPages).length - 1);
assert(!sitemap().some((entry) => entry.url.includes("thank-you")));
assert.equal(robots().sitemap, "https://calacot.com/sitemap.xml");
assert.deepEqual(pageMetadata("/thank-you").robots, { index: false, follow: true });
console.log("Verified page metadata, unique titles, canonical URLs, images, noindex, sitemap and robots.");
