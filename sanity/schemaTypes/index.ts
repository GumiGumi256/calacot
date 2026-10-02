import { type SchemaTypeDefinition } from 'sanity'
import property from './property'
import design from './design'
import designPackage from './design-package'
import { customerCareCompanyProfile, customerCareKnowledge } from './customer-care'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [property, design, designPackage, customerCareCompanyProfile, customerCareKnowledge],
}
