import type {StructureResolver} from 'sanity/structure'

// https://www.sanity.io/docs/structure-builder-cheat-sheet
export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      S.listItem().title('Customer care company profile').child(
        S.document().schemaType('customerCareCompanyProfile').documentId('customerCareCompanyProfile')
      ),
      ...S.documentTypeListItems().filter(item => item.getId() !== 'customerCareCompanyProfile'),
    ])
