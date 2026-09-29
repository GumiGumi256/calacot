import { client } from "@/sanity/lib/client";
import { defineQuery } from "next-sanity";
import { cache } from "react";
import { urlFor } from "@/sanity/lib/image";
import { DESIGN_TYPES } from "@/sanity/design-types";
import { rankDesigns, type SearchableDesign } from "@/lib/design-search";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";

export type FeaturedDesign = {
  _id: string;
  title: string;
  slug: string;
  description: string | null;
  designType: string | null;
  architecturalStyle: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  totalArea: number | null;
  status: string;
  startingPrice: number | null;
  featuredImage: SanityImageSource;
  imageAlt: string | null;
  imageBlur: string | null;
};

export const FEATURED_DESIGNS_QUERY = defineQuery(/* groq */ `
*[_type == "design" && isFeatured == true && coalesce(status, "available") != "archived"
  && defined(slug.current) && defined(featuredImage.asset->url)]
  | order(publishedAt desc, _id asc)[0...12] {
  _id,
  title,
  "slug": slug.current,
  featuredImage,
  "imageAlt": featuredImage.alt,
  "imageBlur": featuredImage.asset->metadata.lqip,
  "description": select(defined(description[0]._type) => pt::text(description), description),
  designType,
  architecturalStyle,
  bedrooms,
  bathrooms,
  totalArea,
  "status": coalesce(status, "available"),
  "startingPrice": (packages[price > 0 && package->isActive == true] | order(price asc))[0].price
}`);

export async function getFeaturedDesigns() {
  return client.fetch<FeaturedDesign[]>(
    FEATURED_DESIGNS_QUERY,
    {},
    {
      perspective: "published",
      useCdn: false,
      next: { revalidate: 60, tags: ["featured-designs"] },
    },
  );
}

export const DESIGN_PAGE_SIZE = 12;
export type CollectionDesign = Omit<FeaturedDesign, "featuredImage"> & { imageUrl: string };
export type DesignCollectionPage = {
  designs: CollectionDesign[];
  total: number;
  types: string[];
  nextOffset: number | null;
};

// Exclude only the twelve designs actually shown in the featured carousel.
const collectionFilter = /* groq */ `
  _type == "design" && coalesce(status, "available") != "archived"
  && defined(slug.current) && defined(featuredImage.asset->url)
  && !(_id in *[_type == "design" && isFeatured == true
    && coalesce(status, "available") != "archived"
    && defined(slug.current) && defined(featuredImage.asset->url)]
    | order(publishedAt desc, _id asc)[0...12]._id)
`;

export const DESIGN_COLLECTION_QUERY = defineQuery(/* groq */ `{
  "designs": *[${collectionFilter} && ($type == "" || designType == $type)]
    | order(publishedAt desc, _id asc)[$offset...$end] {
      _id, title, "slug": slug.current, featuredImage,
      "imageAlt": featuredImage.alt, "imageBlur": featuredImage.asset->metadata.lqip,
      "description": null, designType, architecturalStyle, bedrooms, bathrooms, totalArea,
      "status": coalesce(status, "available"),
      "startingPrice": (packages[price > 0 && package->isActive == true] | order(price asc))[0].price
    },
  "total": count(*[${collectionFilter} && ($type == "" || designType == $type)])
}`);

const DESIGN_SEARCH_INDEX_QUERY = defineQuery(/* groq */ `
  *[${collectionFilter} && ($type == "" || designType == $type)]
    | order(publishedAt desc, _id asc) { _id, title, designType, architecturalStyle, bedrooms }
`);

export async function getDesignCollection(type = "", offset = 0, search = ""): Promise<DesignCollectionPage> {
  let rankedIds: string[] | null = null;
  if (search.trim()) {
    const index = await client.fetch<SearchableDesign[]>(DESIGN_SEARCH_INDEX_QUERY, { type }, {
      perspective: "published", useCdn: false, next: { revalidate: 60, tags: ["designs"] },
    });
    rankedIds = rankDesigns(index, search);
  }
  const ids = rankedIds?.slice(offset, offset + DESIGN_PAGE_SIZE) ?? [];
  const result = await client.fetch<{ designs: FeaturedDesign[]; total: number }>(
    rankedIds === null ? DESIGN_COLLECTION_QUERY : DESIGN_COLLECTION_QUERY.replaceAll(
      '$type == "" || designType == $type', '_id in $ids',
    ),
    { type, ids, offset: rankedIds === null ? offset : 0, end: rankedIds === null ? offset + DESIGN_PAGE_SIZE : DESIGN_PAGE_SIZE },
    { perspective: "published", useCdn: false, next: { revalidate: 60, tags: ["designs"] } },
  );
  if (rankedIds !== null) {
    result.total = rankedIds.length;
    result.designs.sort((a, b) => ids.indexOf(a._id) - ids.indexOf(b._id));
  }
  return {
    ...result,
    types: DESIGN_TYPES.map(({ value }) => value),
    designs: result.designs.map(({ featuredImage, ...design }) => ({
      ...design,
      imageUrl: urlFor(featuredImage).width(960).height(720).fit("crop").auto("format").url(),
    })),
    nextOffset: offset + result.designs.length < result.total && result.designs.length > 0
      ? offset + result.designs.length : null,
  };
}

export type DesignPackage = {
  _key: string;
  price: number;
  recommended: boolean | null;
  package: {
    _id: string;
    name: string;
    slug: string | null;
    isActive: boolean;
    description: string | null;
    includes: string[] | null;
  };
};

export type DesignDetails = Omit<FeaturedDesign, "startingPrice"> & {
  designCode: string | null;
  propertyType: string | null;
  floors: number | null;
  plotSize: {
    width: number | null;
    length: number | null;
    unit: string | null;
  } | null;
  features: string[] | null;
  images:
    | { _key: string; image: SanityImageSource; alt: string | null; blur: string | null }[]
    | null;
  packages: DesignPackage[];
  additionalServices:
    | {
        _key: string;
        service: string;
        price: number | null;
        priceOnRequest: boolean | null;
      }[]
    | null;
  estimatedBuildCost: { minimum: number | null; maximum: number | null } | null;
  canCustomize: boolean | null;
  customizationNote: string | null;
};

export const DESIGN_BY_SLUG_QUERY = defineQuery(/* groq */ `
*[_type == "design" && slug.current == $slug && coalesce(status, "available") != "archived"][0] {
  _id, title, "slug": slug.current, "designCode": designCode.current,
  "description": select(defined(description[0]._type) => pt::text(description), description),
  propertyType, designType, architecturalStyle, bedrooms, bathrooms, floors,
  totalArea, plotSize { width, length, unit }, features,
  "status": coalesce(status, "available"),
  featuredImage, "imageAlt": featuredImage.alt,
  "imageBlur": featuredImage.asset->metadata.lqip,
  "images": images[defined(asset->url)] { _key, "image": @, alt, "blur": asset->metadata.lqip },
  "packages": coalesce(packages[price > 0 && package->isActive == true] | order(package->order asc, price asc) {
    _key, price, recommended, package->{ _id, name, "slug": slug.current, isActive, description, includes }
  }, []),
  additionalServices[] { _key, service, price, priceOnRequest },
  estimatedBuildCost { minimum, maximum }, canCustomize, customizationNote
}`);

export const getDesignBySlug = cache(async (slug: string) =>
  client.fetch<DesignDetails | null>(
    DESIGN_BY_SLUG_QUERY,
    { slug },
    {
      perspective: "published",
      useCdn: false,
      next: { revalidate: 60, tags: ["designs"] },
    },
  ),
);

// Published detail pages, including designs outside the featured carousel.
export const DESIGN_SITEMAP_QUERY = defineQuery(/* groq */ `
*[_type == "design" && coalesce(status, "available") != "archived"
  && defined(slug.current) && slug.current != ""] | order(slug.current asc) {
  "slug": slug.current, _updatedAt
}`);

export async function getDesignSitemapEntries() {
  return client.fetch<{ slug: string; _updatedAt: string }[]>(
    DESIGN_SITEMAP_QUERY,
    {},
    { perspective: "published", useCdn: false, next: { revalidate: 60, tags: ["designs"] } },
  );
}

// Always read current published pricing for purchase creation.
export async function getPurchasableDesign(slug: string) {
  return client.fetch<DesignDetails | null>(DESIGN_BY_SLUG_QUERY, { slug }, {
    perspective: "published", useCdn: false, cache: "no-store",
  });
}
