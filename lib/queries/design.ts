import { client } from "@/sanity/lib/client";

// Only what's needed for featured designs
export const FEATURED_DESIGN_FIELDS = `
  title,
  "slug": slug.current,
  featuredImage,
  description
`;

export async function getFeaturedDesigns() {
  return await client.fetch(`*[_type == "design" && isFeatured == true] | order(publishedAt desc) {
    ${FEATURED_DESIGN_FIELDS}
  }`);
}