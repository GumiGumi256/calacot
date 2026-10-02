import "server-only";
import { z } from "zod";
import { client } from "@/sanity/lib/client";
import { businessUnits, intents } from "./contracts";
import { approvedAnswer, safeLink } from "./render";

const profileSchema = z.object({
  _id: z.literal("customerCareCompanyProfile"),
  companyName: z.literal("Calacot"),
  overview: approvedAnswer,
  country: z.string().nullable().optional(),
  serviceLocations: z.array(z.string()).nullable().optional(),
  website: z.string().transform(safeLink),
  contactInformation: approvedAnswer,
  businessUnits: z.array(
    z.object({ unit: z.enum(businessUnits), description: approvedAnswer }),
  ),
  brandPositioning: z.literal("We sell possibility."),
  communicationGuidelines: z.string().max(2400),
  businessHours: approvedAnswer.nullable().optional(),
  version: z.number().int().positive(),
});
export const knowledgeSchema = z.object({
  _id: z.string(),
  title: z.string().max(180),
  businessUnit: z.enum(businessUnits),
  topic: z.enum(intents),
  approvedAnswer,
  displayLink: z.string().transform(safeLink).nullable().optional(),
  version: z.number().int().positive(),
});
export type KnowledgeEntry = z.infer<typeof knowledgeSchema>;
export type CompanyProfile = z.infer<typeof profileSchema>;
const options = {
  perspective: "published" as const,
  useCdn: false,
  cache: "no-store" as const,
};

export async function loadCompanyProfile(): Promise<CompanyProfile | null> {
  const value = await client.fetch(
    `*[_id == "customerCareCompanyProfile" && _type == "customerCareCompanyProfile" && approvalStatus == "approved"][0]`,
    {},
    options,
  );
  const parsed = profileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
