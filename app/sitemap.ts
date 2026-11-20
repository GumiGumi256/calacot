import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { sitemapEntries } from "@/lib/seo";
import { getDesignSitemapEntries } from "@/lib/queries/design";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  // Refreshed every minute, and immediately when the Sanity webhook expires the "designs" tag.
  cacheLife("minutes");
  cacheTag("designs");
  // Surface CMS failures instead of publishing a silently incomplete sitemap.
  return sitemapEntries(await getDesignSitemapEntries());
}
