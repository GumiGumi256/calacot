import { client } from "@/sanity/lib/client";
import { defineQuery } from "next-sanity";
import { cache } from "react";
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
*[_type == "design" && isFeatured == true && status != "archived"
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

export type DesignPackage = {
  _key: string;
  price: number;
  recommended: boolean | null;
  package: {
    _id: string;
    name: string;
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
    | { _key: string; image: SanityImageSource; blur: string | null }[]
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
*[_type == "design" && slug.current == $slug && status != "archived"][0] {
  _id, title, "slug": slug.current, "designCode": designCode.current,
  "description": select(defined(description[0]._type) => pt::text(description), description),
  propertyType, designType, architecturalStyle, bedrooms, bathrooms, floors,
  totalArea, plotSize { width, length, unit }, features,
  "status": coalesce(status, "available"),
  featuredImage, "imageAlt": featuredImage.alt,
  "imageBlur": featuredImage.asset->metadata.lqip,
  "images": images[defined(asset->url)] { _key, "image": @, "blur": asset->metadata.lqip },
  "packages": coalesce(packages[price > 0 && package->isActive == true] | order(package->order asc, price asc) {
    _key, price, recommended, package->{ _id, name, description, includes }
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
