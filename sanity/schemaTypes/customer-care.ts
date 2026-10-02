import { defineField, defineType } from "sanity";
import { businessUnits, intents } from "../../lib/customer-care/contracts";
import { approvedAnswer, displayText } from "../../lib/customer-care/render";

const approval = defineField({
  name: "approvalStatus",
  type: "string",
  options: { list: ["draft", "approved"] },
  initialValue: "draft",
  validation: (R) => R.required(),
});
const version = defineField({
  name: "version",
  type: "number",
  initialValue: 1,
  validation: (R) => R.required().integer().positive(),
});
const reviewedText = (name: string, title?: string) =>
  defineField({
    name,
    title,
    type: "text",
    validation: (R) =>
      R.required().custom(
        (v) =>
          approvedAnswer.safeParse(v).success ||
          "Use plain reviewed text without embedded URLs (maximum 2400 characters).",
      ),
  });

export const customerCareCompanyProfile = defineType({
  name: "customerCareCompanyProfile",
  title: "Customer care company profile",
  type: "document",
  fields: [
    defineField({
      name: "companyName",
      type: "string",
      initialValue: "Calacot",
      validation: (R) => R.required(),
    }),
    reviewedText("overview", "Approved overview"),
    defineField({ name: "country", type: "string" }),
    defineField({
      name: "serviceLocations",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "website",
      type: "url",
      initialValue: "https://calacot.com",
    }),
    reviewedText(
      "contactInformation",
      "Verified contact information (no embedded URLs)",
    ),
    defineField({
      name: "businessUnits",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            {
              name: "unit",
              type: "string",
              options: { list: [...businessUnits] },
            },
            {
              name: "description",
              type: "text",
              validation: (R) =>
                R.required().custom(
                  (v) =>
                    approvedAnswer.safeParse(v).success ||
                    "Use reviewed plain text without links",
                ),
            },
          ],
        },
      ],
    }),
    defineField({
      name: "brandPositioning",
      type: "string",
      initialValue: "We sell possibility.",
    }),
    defineField({
      name: "communicationGuidelines",
      type: "text",
      initialValue: "Warm, professional, concise, clear, and never pushy.",
    }),
    defineField({
      name: "businessHours",
      title: "Verified business hours (leave empty until verified)",
      type: "text",
    }),
    approval,
    version,
  ],
});
export const customerCareKnowledge = defineType({
  name: "customerCareKnowledge",
  title: "Customer care knowledge",
  type: "document",
  fields: [
    defineField({
      name: "title",
      type: "string",
      validation: (R) =>
        R.required().custom(
          (v) => displayText.safeParse(v).success || "Use a plain title",
        ),
    }),
    defineField({
      name: "businessUnit",
      type: "string",
      options: { list: [...businessUnits] },
      validation: (R) => R.required(),
    }),
    defineField({
      name: "topic",
      type: "string",
      options: { list: [...intents] },
      validation: (R) => R.required(),
    }),
    defineField({
      name: "relatedQuestions",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({ name: "tags", type: "array", of: [{ type: "string" }] }),
    reviewedText("approvedAnswer"),
    defineField({
      name: "displayLink",
      title: "Reviewed Calacot link",
      type: "url",
      validation: (R) =>
        R.uri({ scheme: ["https"] }).custom(
          (v) =>
            !v ||
            /^https:\/\/(www\.)?calacot\.com\//.test(v) ||
            "Only Calacot links",
        ),
    }),
    defineField({
      name: "sourceReference",
      type: "string",
      validation: (R) => R.required(),
    }),
    defineField({ name: "importedAt", type: "datetime", readOnly: true }),
    defineField({
      name: "proposedRevisionOf",
      type: "reference",
      to: [{ type: "customerCareKnowledge" }],
    }),
    approval,
    defineField({ name: "active", type: "boolean", initialValue: false }),
    defineField({
      name: "lastReviewedAt",
      type: "datetime",
      validation: (R) =>
        R.custom((value, context) =>
          context.document?.approvalStatus === "approved" && !value
            ? "Review date required before approval"
            : true,
        ),
    }),
    version,
  ],
});
