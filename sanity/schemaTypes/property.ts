// schemas/property.ts
import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'property',
  title: 'Property',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required().min(10).max(120)
    }),

    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96
      },
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 4,
      validation: Rule => Rule.required().min(50)
    }),

    defineField({
      name: 'price',
      title: 'Price (UGX)',
      type: 'number',
      validation: Rule => Rule.required().positive()
    }),

    defineField({
      name: 'listingType',
      title: 'Listing Type',
      type: 'string',
      options: {
        list: ['sale', 'rent']
      },
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'propertyType',
      title: 'Property Type',
      type: 'string',
      options: {
        list: ['house', 'apartment', 'land', 'commercial']
      },
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'bedrooms',
      title: 'Bedrooms',
      type: 'number',
      validation: Rule => Rule.min(0)
    }),

    defineField({
      name: 'bathrooms',
      title: 'Bathrooms',
      type: 'number',
      validation: Rule => Rule.min(0)
    }),

    defineField({
      name: 'area',
      title: 'Area (sqm)',
      type: 'number',
      validation: Rule => Rule.positive()
    }),

    defineField({
      name: 'location',
      title: 'Location',
      type: 'object',
      fields: [
        { name: 'address', type: 'string', title: 'Address' },
        { name: 'district', type: 'string', title: 'District' },
        { name: 'city', type: 'string', title: 'City' },
        {
          name: 'coordinates',
          title: 'Coordinates',
          type: 'geopoint'
        }
      ],
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'images',
      title: 'Images',
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
      options: { hotspot: true },
      validation: Rule => Rule.required()
    }),

    defineField({
      name: 'amenities',
      title: 'Amenities',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        list: [
          'parking',
          'security',
          'wifi',
          'swimming pool',
          'garden',
          'furnished'
        ]
      }
    }),

    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: ['available', 'sold', 'rented']
      },
      initialValue: 'available'
    }),

    defineField({
      name: 'isFeatured',
      title: 'Featured Listing',
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