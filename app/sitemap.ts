import type { MetadataRoute } from "next";
import { absoluteUrl, seoPages } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.keys(seoPages).filter((path) => path !== "/thank-you").map((path) => ({ url: absoluteUrl(path) }));
}
