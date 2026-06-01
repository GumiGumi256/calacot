import { type SchemaTypeDefinition } from 'sanity'
import property from './property'
import design from './design'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [property, design],
}
