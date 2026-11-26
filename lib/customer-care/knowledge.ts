import "server-only";
import { client } from "@/sanity/lib/client";

type Legacy = {
  profile?: string | null;
  overview?: string;
  country?: string;
  serviceLocations?: string[];
  website?: string;
  contactInformation?: string;
  businessUnits?: { unit?: string; description?: string }[];
  brandPositioning?: string;
  communicationGuidelines?: string;
  businessHours?: string;
};

/** Joins the fields of a profile written before it became one text, so it keeps working until replaced. */
function legacyText(p: Legacy) {
  const parts = [
    p.overview,
    p.brandPositioning && `Brand: ${p.brandPositioning}`,
    (p.country || p.serviceLocations?.length) && `Where we work: ${[p.country, ...(p.serviceLocations || [])].filter(Boolean).join(", ")}`,
    p.businessUnits?.length && `Services:\n${p.businessUnits.map((u) => `- ${u.unit}: ${u.description}`).join("\n")}`,
    p.contactInformation && `Contacts: ${p.contactInformation}`,
    p.website && `Website: ${p.website}`,
    p.businessHours && `Business hours: ${p.businessHours}`,
    p.communicationGuidelines && `Tone: ${p.communicationGuidelines}`,
  ];
  return parts.filter(Boolean).join("\n\n");
}

/** The published company profile (Sanity "Company profile") as one text, or null when there is none. */
export async function loadCompanyProfile(): Promise<string | null> {
  const p = await client.fetch<Legacy | null>(
    `*[_id == "customerCareCompanyProfile" && _type == "customerCareCompanyProfile"][0]`,
    {},
    { perspective: "published", useCdn: false, cache: "no-store" },
  );
  if (!p) return null;
  const text = p.profile?.trim() || legacyText(p).trim();
  return text ? text.slice(0, 15000) : null;
}
