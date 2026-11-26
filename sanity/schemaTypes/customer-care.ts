import { defineField, defineType } from "sanity";

/**
 * Everything the WhatsApp assistant should know about Calacot, in one text: who we are, services,
 * locations, contacts, hours, how we work, tone. Publishing it is the approval; the assistant only
 * states what is written here, in knowledge entries or in the live catalogue.
 */
export const customerCareCompanyProfile = defineType({
  name: "customerCareCompanyProfile",
  title: "Company profile",
  type: "document",
  fields: [
    defineField({
      name: "profile",
      title: "Company profile",
      description:
        "Write it as you would brief a new receptionist: who Calacot is, each service, where you work, contacts, business hours, how projects start, and the tone to use. Prices and product details can go here or in Customer care knowledge.",
      type: "text",
      rows: 30,
      validation: (R) => R.required().max(20000),
    }),
  ],
  preview: { prepare: () => ({ title: "Company profile" }) },
});

/**
 * What the WhatsApp assistant may tell customers about a product, service, policy or FAQ (e.g. Soolos).
 * Publishing is the approval: the assistant reads published entries that are switched on.
 */
export const customerCareKnowledge = defineType({
  name: "customerCareKnowledge",
  title: "Customer care knowledge",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      description: "The product or topic, as customers would name it, e.g. Soolos or Refund policy.",
      type: "string",
      validation: (R) => R.required().max(120),
    }),
    defineField({
      // Stored as approvedAnswer so existing entries keep their text.
      name: "approvedAnswer",
      title: "Answer",
      description:
        "Everything the assistant may tell customers: what it is, who it is for, prices (only if it may quote them), how to get started. It will not add facts that are not here.",
      type: "text",
      rows: 10,
      validation: (R) => R.required().max(10000),
    }),
    defineField({
      name: "tags",
      title: "Keywords",
      description: "Other words customers might use, e.g. school software, fees system.",
      type: "array",
      of: [{ type: "string" }],
      options: { layout: "tags" },
    }),
    defineField({
      name: "displayLink",
      title: "Link",
      description: "Optional page the assistant can share.",
      type: "url",
      validation: (R) => R.uri({ scheme: ["https"] }),
    }),
    defineField({
      name: "active",
      title: "Show to customers",
      description: "Switch off to hide this entry from the assistant without deleting it.",
      type: "boolean",
      initialValue: true,
    }),
  ],
  preview: {
    select: { title: "title", active: "active" },
    prepare: ({ title, active }) => ({ title, subtitle: active === false ? "Hidden from customers" : "Shown to customers" }),
  },
});
