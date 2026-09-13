import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/seo";
import { getDesignSitemapEntries } from "@/lib/queries/design";

export const revalidate = 60;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Surface CMS failures instead of publishing a silently incomplete sitemap.
  return sitemapEntries(await getDesignSitemapEntries());
}
