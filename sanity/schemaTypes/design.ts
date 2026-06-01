import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'design',
  title: 'Architectural Design',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Design Name',
      type: 'string',
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title'
      },
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      validation: Rule => Rule.required().min(50)
    }),

    // ✅ PRICING STRUCTURE
    defineField({
      name: 'pricing',
      title: 'Pricing (UGX)',
      type: 'object',
      fields: [
        defineField({
          name: 'structural',
          title: 'Structural Design Price',
          type: 'number',
          validation: Rule => Rule.positive()
        }),
        defineField({
          name: 'mechanical',
          title: 'Mechanical Design Price',
          type: 'number',
          validation: Rule => Rule.positive()
        }),
        defineField({
          name: 'electrical',
          title: 'Electrical Design Price',
          type: 'number',
          validation: Rule => Rule.positive()
        })
      ],
      validation: Rule =>
        Rule.custom(pricing =>
          pricing?.structural || pricing?.mechanical || pricing?.electrical
            ? true
            : 'At least one pricing option is required'
        )
    }),

    // ✅ DEFAULT SCOPE (INITIAL = STRUCTURAL)
    defineField({
      name: 'defaultScope',
      title: 'Default Design Scope',
      type: 'string',
      options: {
        list: [
          { title: 'Structural', value: 'structural' },
          { title: 'Mechanical', value: 'mechanical' },
          { title: 'Electrical', value: 'electrical' }
        ],
        layout: 'radio'
      },
      initialValue: 'structural',
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: ['modern', 'luxury', 'minimalist', 'commercial']
      },
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'bedrooms',
      title: 'Bedrooms',
      type: 'number'
    }),

    defineField({
      name: 'bathrooms',
      title: 'Bathrooms',
      type: 'number'
    }),

    defineField({
      name: 'designType',
      title: 'Design Type',
      type: 'string',
      options: {
        list: [
          { title: 'Bungalow', value: 'bungalow' },
          { title: 'Duplex', value: 'duplex' },
          { title: 'Flat / Apartment', value: 'flat' },
          { title: 'Townhouse', value: 'townhouse' },
          { title: 'Villa', value: 'villa' },
          { title: 'Commercial', value: 'commercial' }
        ]
      },
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'floors',
      title: 'Number of Floors',
      type: 'number'
    }),

    defineField({
      name: 'totalArea',
      title: 'Total Area (sqm)',
      type: 'number',
      validation: Rule => Rule.required().positive()
    }),

    defineField({
      name: 'plotSize',
      title: 'Plot Size',
      type: 'string',
      description: 'e.g. 50x100 ft, 100x100 ft'
    }),

    defineField({
      name: 'images',
      title: 'Design Images',
      type: 'array',
      of: [{ type: 'image', options: { hotspot: true } }],
      validation: Rule =>
        Rule.required()
          .min(5)
          .max(10)
          .error('You must upload between 5 and 10 images')
    }),

    defineField({
      name: 'featuredImage',
      title: 'Featured Image',
      type: 'image',
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'files',
      title: 'Downloadable Files',
      type: 'array',
      of: [{ type: 'file' }],
      description: 'PDF plans, CAD files, etc.'
    }),

    defineField({
      name: 'isFeatured',
      title: 'Featured Design',
      type: 'boolean',
      initialValue: false
    }),

    defineField({
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
      initialValue: () => new Date().toISOString()
    })
  ]
})