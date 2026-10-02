"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/design-purchases/permissions";
import { client } from "@/sanity/lib/client";
import { db } from "@/database/db";
import { careAudit } from "@/database/customer-care-schema";
import { businessUnits, intents } from "./contracts";
import { seoPages } from "@/lib/seo";

function writer() {
  const token = process.env.SANITY_API_WRITE_TOKEN;
  if (!token)
    throw new Error("Configure SANITY_API_WRITE_TOKEN for draft preparation.");
  return client.withConfig({ token, useCdn: false });
}
export async function prepareKnowledgeDraft(form: FormData) {
  const actor = await requireAdmin();
  const sourceId = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_.-]+$/)
    .parse(form.get("sourceId"));
  const businessUnit = z.enum(businessUnits).parse(form.get("businessUnit"));
  const topic = z.enum(intents).parse(form.get("topic"));
  const revisionInput = form.get("revisionOf");
  const revisionOf = revisionInput
    ? z
        .string()
        .regex(/^[a-zA-Z0-9_-]+$/)
        .max(128)
        .parse(revisionInput)
    : null;
  // Import existing structured CMS only. There is deliberately no URL-fetching capability.
  const source = await client.fetch<{
    _id: string;
    _type: string;
    title?: string;
    name?: string;
    description?: string;
    includes?: string[];
  } | null>(
    `*[_id==$id && _type in ["design","property","designPackage"] && !(_id in path("drafts.**"))][0] {_id,_type,title,name,"description":select(defined(description[0]._type)=>pt::text(description),description),includes}`,
    { id: sourceId },
    { perspective: "published", useCdn: false, cache: "no-store" },
  );
  if (!source) throw new Error("Choose a published Calacot CMS source.");
  if (revisionOf) {
    const approved = await client.fetch(
      `*[_id==$id && _type=="customerCareKnowledge" && approvalStatus=="approved"][0]._id`,
      { id: revisionOf },
      { perspective: "published", useCdn: false, cache: "no-store" },
    );
    if (!approved)
      throw new Error("Revision target must be published approved knowledge.");
  }
  const id = randomUUID();
  const draft = {
    _id: `drafts.${id}`,
    _type: "customerCareKnowledge",
    title: `Review: ${source.title || source.name || source._id}`.slice(0, 180),
    businessUnit,
    topic,
    approvedAnswer: [source.description, ...(source.includes || [])]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2400),
    sourceReference: `sanity:${source._type}/${source._id}`,
    importedAt: new Date().toISOString(),
    approvalStatus: "draft",
    active: false,
    version: 1,
    ...(revisionOf
      ? { proposedRevisionOf: { _type: "reference", _ref: revisionOf } }
      : {}),
  };
  await writer().create(draft);
  await db
    .insert(careAudit)
    .values({
      actor,
      action: "knowledge_draft_prepared",
      details: { draftId: id, sourceId, revisionOf },
    });
  revalidatePath("/admin/customer-care/knowledge");
}
export async function prepareCompanyProfile() {
  const actor = await requireAdmin();
  // Only repository-backed facts. Contacts, hours and geographic commitments need human verification.
  await writer().createIfNotExists({
    _id: "drafts.customerCareCompanyProfile",
    _type: "customerCareCompanyProfile",
    companyName: "Calacot",
    overview: seoPages["/"].description,
    website: "https://calacot.com",
    brandPositioning: "We sell possibility.",
    communicationGuidelines:
      "Warm, professional, concise, clear, and never pushy.",
    approvalStatus: "draft",
    version: 1,
    businessUnits: [
      {
        _key: "architecture",
        unit: "architecture",
        description: seoPages["/architecture"].description,
      },
      {
        _key: "real_estate",
        unit: "real_estate",
        description: seoPages["/real-estate"].description,
      },
      {
        _key: "painting",
        unit: "painting",
        description: seoPages["/painting"].description,
      },
      {
        _key: "interiors",
        unit: "interiors",
        description: seoPages["/interior-design"].description,
      },
      {
        _key: "tech",
        unit: "tech",
        description: seoPages["/calacot-tech"].description,
      },
    ],
  });
  await db
    .insert(careAudit)
    .values({ actor, action: "company_profile_draft_prepared" });
  revalidatePath("/admin/customer-care/knowledge");
}
