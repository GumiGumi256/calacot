import { defineField, defineType } from "sanity";

export default defineType({
  name: "designPackage",
  title: "Design Package",
  type: "document",

  fields: [
    defineField({
      name: "name",
      title: "Package Name",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: {
        source: "name",
      },
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "description",
      title: "Short Description",
      type: "text",
      rows: 3,
    }),

    defineField({
      name: "includes",
      title: "What's Included",
      type: "array",
      of: [{ type: "string" }],
      validation: (Rule) =>
        Rule.required().min(1),
    }),

    defineField({
      name: "isActive",
      title: "Active",
      type: "boolean",
      initialValue: true,
    }),

    defineField({
      name: "order",
      title: "Display Order",
      type: "number",
      initialValue: 1,
    }),
  ],

  preview: {
    select: {
      title: "name",
      includes: "includes",
    },

    prepare({ title, includes }) {
      return {
        title,
        subtitle: `${includes?.length ?? 0} included items`,
      };
    },
  },
});