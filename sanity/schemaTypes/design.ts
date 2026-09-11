import { defineField, defineType } from "sanity";

export default defineType({
  name: "design",
  title: "Architectural Design",
  type: "document",

  groups: [
    {
      name: "basic",
      title: "Basic Information",
      default: true,
    },
    {
      name: "details",
      title: "Design Details",
    },
    {
      name: "pricing",
      title: "Pricing",
    },
    {
      name: "media",
      title: "Images",
    },
    {
      name: "advanced",
      title: "More Options",
    },
  ],

  fields: [
    // --------------------------------------------------
    // BASIC INFORMATION
    // --------------------------------------------------

    defineField({
      name: "title",
      title: "Design Name",
      type: "string",
      group: "basic",
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      group: "basic",
      options: {
        source: "title",
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "designCode",
      title: "Design Code",
      type: "slug",
      group: "basic",
      description: "Generate from the design name.",
      options: {
        source: "title",

        slugify: (input) =>
          `CAL-${input
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")}`,
      },
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 5,
      group: "basic",
      validation: (Rule) => Rule.required().min(50),
    }),

    defineField({
      name: "propertyType",
      title: "Property Type",
      type: "string",
      group: "basic",
      options: {
        list: [
          { title: "Residential", value: "residential" },
          { title: "Commercial", value: "commercial" },
          { title: "Mixed Use", value: "mixed-use" },
        ],
        layout: "radio",
      },
      initialValue: "residential",
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "designType",
      title: "Design Type",
      type: "string",
      group: "basic",
      options: {
        list: [
          { title: "Bungalow", value: "bungalow" },
          { title: "Duplex", value: "duplex" },
          { title: "Villa", value: "villa" },
          { title: "Townhouse", value: "townhouse" },
          { title: "Apartment", value: "apartment" },
          { title: "Commercial", value: "commercial" },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "architecturalStyle",
      title: "Architectural Style",
      type: "string",
      group: "basic",
      options: {
        list: [
          { title: "Modern", value: "modern" },
          { title: "Contemporary", value: "contemporary" },
          { title: "Minimalist", value: "minimalist" },
          { title: "Luxury", value: "luxury" },
          { title: "Tropical", value: "tropical" },
          { title: "Traditional", value: "traditional" },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),

    // --------------------------------------------------
    // DESIGN DETAILS
    // --------------------------------------------------

    defineField({
      name: "bedrooms",
      title: "Bedrooms",
      type: "number",
      group: "details",
      validation: (Rule) => Rule.integer().min(0),
    }),

    defineField({
      name: "bathrooms",
      title: "Bathrooms",
      type: "number",
      group: "details",
      validation: (Rule) => Rule.min(0),
    }),

    defineField({
      name: "floors",
      title: "Number of Floors",
      type: "number",
      group: "details",
      initialValue: 1,
      validation: (Rule) => Rule.integer().min(1),
    }),

    defineField({
      name: "totalArea",
      title: "Total Floor Area",
      type: "number",
      group: "details",
      description: "Enter area in square metres.",
      validation: (Rule) => Rule.required().positive(),
    }),

    defineField({
      name: "plotSize",
      title: "Recommended Plot Size",
      type: "object",
      group: "details",

      fields: [
        defineField({
          name: "width",
          title: "Width",
          type: "number",
          validation: (Rule) => Rule.positive(),
        }),

        defineField({
          name: "length",
          title: "Length",
          type: "number",
          validation: (Rule) => Rule.positive(),
        }),

        defineField({
          name: "unit",
          title: "Unit",
          type: "string",
          options: {
            list: [
              { title: "Feet", value: "ft" },
              { title: "Metres", value: "m" },
            ],
            layout: "radio",
          },
          initialValue: "ft",
        }),
      ],
    }),

    defineField({
      name: "features",
      title: "Key Features",
      type: "array",
      group: "details",

      of: [{ type: "string" }],

      options: {
        layout: "tags",
      },

      description:
        "Examples: Home office, balcony, servant quarters, walk-in closet, swimming pool.",
    }),

    // --------------------------------------------------
    // PRICING
    // --------------------------------------------------

    defineField({
  name: "packages",
  title: "Design Packages",
  type: "array",
  group: "pricing",

  of: [
    {
      type: "object",
      name: "designPackagePrice",
      title: "Package",

      fields: [
        defineField({
          name: "package",
          title: "Package",
          type: "reference",
          to: [{ type: "designPackage" }],
          validation: (Rule) => Rule.required(),
        }),

        defineField({
          name: "price",
          title: "Price (UGX)",
          type: "number",
          validation: (Rule) =>
            Rule.required().positive(),
        }),

        defineField({
          name: "recommended",
          title: "Recommended",
          type: "boolean",
          initialValue: false,
        }),
      ],

      preview: {
        select: {
          title: "package.name",
          price: "price",
        },

        prepare({ title, price }) {
          return {
            title: title || "Package",
            subtitle: price
              ? `UGX ${price.toLocaleString()}`
              : "No price",
          };
        },
      },
    },
  ],

  validation: (Rule) =>
    Rule.required().min(1),
}),

    // --------------------------------------------------
    // IMAGES
    // --------------------------------------------------

    defineField({
      name: "featuredImage",
      title: "Featured Image",
      type: "image",
      group: "media",

      options: {
        hotspot: true,
      },

      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "images",
      title: "Design Gallery",
      type: "array",
      group: "media",

      of: [
        {
          type: "image",
          options: {
            hotspot: true,
          },
        },
      ],

      validation: (Rule) =>
        Rule.required()
          .min(3)
          .max(15)
          .error("Upload between 3 and 15 images."),
    }),

    // --------------------------------------------------
    // ADDITIONAL SERVICES
    // --------------------------------------------------

    defineField({
      name: "additionalServices",
      title: "Additional Services",
      type: "array",
      group: "advanced",

      description:
        "Optional services customers can request with this design.",

      of: [
        {
          type: "object",
          title: "Service",

          fields: [
            defineField({
              name: "service",
              title: "Service",
              type: "string",

              options: {
                list: [
                  {
                    title: "Structural Engineering",
                    value: "structural",
                  },
                  {
                    title: "Electrical Design",
                    value: "electrical",
                  },
                  {
                    title: "Mechanical Design",
                    value: "mechanical",
                  },
                  {
                    title: "BOQ",
                    value: "boq",
                  },
                  {
                    title: "Interior Design",
                    value: "interior",
                  },
                  {
                    title: "Site Adaptation",
                    value: "site-adaptation",
                  },
                  {
                    title: "Approval Assistance",
                    value: "approval",
                  },
                ],
              },

              validation: (Rule) => Rule.required(),
            }),

            defineField({
              name: "price",
              title: "Price (UGX)",
              type: "number",
            }),

            defineField({
              name: "priceOnRequest",
              title: "Price On Request",
              type: "boolean",
              initialValue: false,
            }),
          ],
        },
      ],
    }),

    // --------------------------------------------------
    // CONSTRUCTION ESTIMATE
    // --------------------------------------------------

    defineField({
      name: "estimatedBuildCost",
      title: "Estimated Construction Cost",
      type: "object",
      group: "advanced",

      description:
        "Optional approximate construction cost for this design.",

      fields: [
        defineField({
          name: "minimum",
          title: "Minimum Cost (UGX)",
          type: "number",
        }),

        defineField({
          name: "maximum",
          title: "Maximum Cost (UGX)",
          type: "number",
        }),
      ],
    }),

    // --------------------------------------------------
    // CUSTOMISATION
    // --------------------------------------------------

    defineField({
      name: "canCustomize",
      title: "Can This Design Be Customized?",
      type: "boolean",
      group: "advanced",
      initialValue: true,
    }),

    defineField({
      name: "customizationNote",
      title: "Customization Information",
      type: "text",
      rows: 3,
      group: "advanced",

      hidden: ({ document }) => !document?.canCustomize,
    }),

    // --------------------------------------------------
    // VISIBILITY
    // --------------------------------------------------

    defineField({
      name: "status",
      title: "Availability",
      type: "string",
      group: "advanced",

      options: {
        list: [
          {
            title: "Available",
            value: "available",
          },
          {
            title: "Coming Soon",
            value: "coming-soon",
          },
          {
            title: "Archived",
            value: "archived",
          },
        ],
      },

      initialValue: "available",
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "isFeatured",
      title: "Featured Design",
      type: "boolean",
      group: "advanced",
      initialValue: false,
    }),

    defineField({
      name: "publishedAt",
      title: "Published At",
      type: "datetime",
      group: "advanced",
      initialValue: () => new Date().toISOString(),
    }),
  ],

  preview: {
    select: {
      title: "title",
      type: "designType",
      style: "architecturalStyle",
      media: "featuredImage",
    },

    prepare({ title, type, style, media }) {
      const details = [style, type]
        .filter(Boolean)
        .map(
          (item: string) =>
            item.charAt(0).toUpperCase() + item.slice(1)
        )
        .join(" · ");

      return {
        title,
        subtitle: details || "Architectural Design",
        media,
      };
    },
  },
});