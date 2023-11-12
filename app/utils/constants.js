module.exports = {
    ERROR_CODE_MAP: {
      UNIQUE_KEY_VIOLATION: '23505',
      FOREIGN_KEY_VIOLATION: '23503'
    },
    TAXONOMY: {
      DOMAIN: 'DOMAIN',
      DOMAINPRODUCT: 'DOMAINPRODUCT',
      PRODUCT: 'PRODUCT',
      COMPONENT: 'COMPONENT'
    },
    RESOURCE_TYPES: {
      DOMAIN: 'platform_domain',
      DOMAIN_PRODUCT: 'platform_domain_product',
      PRODUCT: 'platform_product'
    },
    PERMISSIONS: {
      CREATE_DOMAIN: 'create',
      EDIT_DOMAIN: 'edit',
      CREATE_DOMAIN_PRODUCT: 'create',
      EDIT_DOMAIN_PRODUCT: 'edit',
      CREATE_PRODUCT: 'create',
      EDIT_PRODUCT: 'edit'
    },
    COMPONENT_TYPES: {
      LIBRARY: 'LIBRARY',
      UI: 'UI',
      DATA: 'DATA',
      API: 'API'
    },
    REQUEST_MAPPINGS: {
      POST: 'CREATE',
      PATCH: 'UPDATE',
      DELETE: 'DELETE'
    },
    SOFTWARE_CATALOG_API_CLIENT: `${process.env.SOFTWARE_CATALOG_API_CLIENT}@clients`
  }
  