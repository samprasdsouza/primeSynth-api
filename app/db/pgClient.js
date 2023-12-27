'use strict'

const slug = require('slug')
const joinjs = require('join-js').default
const { generate } = require('short-uuid')
const { isEmpty, map, get, last, includes } = require('lodash')

const { query } = require('./dataAccess')
const { ERROR_CODE_MAP, TAXONOMY: { DOMAIN, DOMAINPRODUCT, PRODUCT, COMPONENT } } = require('../utils/constants')
const { DependencyError, NotFoundError, BadRequestError, DomainsAPIError } = require('../utils/errors')
const { log } = require('winston')
const { off } = require('..')

const toDTO = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description
})

module.exports = () => {
  async function createDomain (domain) {
    try {
      const { name, description } = domain

      await query('BEGIN')

      const sql = 'INSERT INTO domains ( id, name, slug_name, description, created_at, last_modified_at ) VALUES ($1, $2, $3, $4, now(), now()) RETURNING *'
      const params = [generate(), name, slug(name), description]

      const res = await query(sql, params)
      const result = res.rows.length > 0 ? toDTO(res.rows[0]) : undefined
      const domainId = result?.id

      const defaultDomainProductId = await createDefaultDomainProduct(domainId)
      await createDefaultProduct(defaultDomainProductId)

      await query('COMMIT')
      return !isEmpty(result) ? getDomainById(domainId) : undefined
    } catch (err) {
      await query('ROLLBACK')

      if (err.code === ERROR_CODE_MAP.UNIQUE_KEY_VIOLATION) throw new BadRequestError(err.detail, err.stack)
      if (err instanceof DomainsAPIError) throw err
      throw new DependencyError('An error occurred while creating the domain in the database', err.stack)
    }
  }

  const createDefaultDomainProduct = async (domainId) => {
    try {
      await query('BEGIN')

      const name = '(Default Domain-Product)'
      const sql = `INSERT INTO domain_products ( id, name, slug_name, description, created_at, last_modified_at, is_system_generated ) 
        VALUES($1, $2, $3, 'This is a system generated domainProduct.', now(), now(), true) RETURNING id`
      const params = [generate(), name, slug(name)]

      const { rows } = await query(sql, params)
      const domainProductId = rows?.[0]?.id

      await createRelation(domainId, DOMAIN, domainProductId, DOMAINPRODUCT)

      await query('COMMIT')
      return domainProductId
    } catch (err) {
      await query('ROLLBACK')
      throw new DependencyError('An error occurred while creating \'(Default Domain-Product)\' in the database', err.stack)
    }
  }

  const createDefaultProduct = async (domainProductId) => {
    try {
      await query('BEGIN')

      const name = '(Default Product)'
      const sql = `INSERT INTO products ( id, name, slug_name, description, created_at, last_modified_at, is_system_generated ) 
        VALUES($1, $2, $3, 'This is a system generated product.', now(), now(), true) RETURNING id`
      const params = [generate(), name, slug(name)]

      const { rows } = await query(sql, params)
      const productId = rows?.[0]?.id

      await createRelation(domainProductId, DOMAINPRODUCT, productId, PRODUCT)

      await query('COMMIT')
      return productId
    } catch (err) {
      await query('ROLLBACK')
      throw new DependencyError('An error occurred while creating \'(Default Product)\' in the database', err.stack)
    }
  }

  const getDomainsQuery = `
    SELECT 
      d.id, d.name, d.slug_name, d.description, d.sort_id, d.is_active, d.created_at, d.last_modified_at,
      dp.id AS domain_product_id, dp.name AS domain_product_name, dp.description AS domain_product_description, dp.is_system_generated AS domain_product_is_system_generated, dp.created_at AS domain_product_created_at, dp.last_modified_at AS domain_product_last_modified_at,
      p.id AS product_id, p.name AS product_name, p.description AS product_description, p.is_system_generated AS product_is_system_generated, p.created_at AS product_created_at, p.last_modified_at AS product_last_modified_at
    FROM domains d
    LEFT JOIN relations r_d ON r_d.parent_id = d.id and d.is_active = TRUE
    LEFT JOIN domain_products dp ON dp.id = r_d.child_id AND dp.is_active = TRUE
    LEFT JOIN relations r_dp  ON r_dp.parent_id = dp.id
    LEFT JOIN products p ON p.id = r_dp.child_id AND p.is_active = TRUE
  `

  async function getDomainById (domainId) {
    try {
      const sql = `${getDomainsQuery} WHERE d.id = $1 `

      const res = await query(sql, [domainId])

      if (res.rows.length === 0) {
        throw new NotFoundError(`Unable to find domain with id '${domainId}'`)
      }

      const domain = joinjs.mapOne(res.rows, domainResultMap, 'domains')
      return domain
    } catch (err) {
      if (err instanceof DomainsAPIError) throw err
      throw new DependencyError(`An error occurred while retrieving domain with id '${domainId}' from the database.`, err.stack)
    }
  }

  async function getDomains (filterOptions, limit, offset) {
    try {
      const { name, domainProducts } = filterOptions

      const filters = []
      const params = []
      let paramIndex = 1

      if (name) {
        filters.push(`slug_name LIKE $${paramIndex++}`)
        params.push(`%${slug(name)}%`)
      }

      if (!isEmpty(domainProducts)) {
        filters.push(`domain_product_id IN (${map(domainProducts, () => `$${paramIndex++}`).join(',')})`)
        params.push(...map(domainProducts, (domainProduct) => domainProduct.trim()))
      }

      if (offset) {
        filters.push(`sort_id < $${paramIndex++}`)
        params.push(offset.sortId)
      }

      params.push(limit)

      const sql = `
        WITH domains_cte AS (${getDomainsQuery})
        SELECT
          d.id AS id, name, description, d.sort_id AS sort_id,
          domain_product_id,  domain_product_name, domain_product_description, domain_product_is_system_generated, domain_product_created_at, domain_product_last_modified_at,
          product_id,  product_name, product_description, product_is_system_generated, product_created_at, product_last_modified_at
        FROM (
          SELECT DISTINCT id AS id, sort_id
          FROM domains_cte
          ${filters.length > 0 ? 'WHERE ' + filters.join(' AND ') : ''}
          ORDER BY sort_id DESC
          LIMIT $${paramIndex++}
        ) d
        JOIN domains_cte cte ON d.id = cte.id
        ORDER BY cte.sort_id DESC`

      const res = await query(sql, params)
      const results = joinjs.map(res.rows, domainResultMap, 'domains')

      return {
        results,
        nextOffset: results.length >= limit ? { sortId: get(last(res.rows), 'sort_id') } : undefined,
        count: results.length
      }
    } catch (err) {
      if (err instanceof DomainsAPIError) throw err
      throw new DependencyError('An error occurred while retrieving domains from the database.', err.stack)
    }
  }

  async function updateDomain (id, domain) {
    try {
      const { name, description } = domain

      const sql = `
        UPDATE domains
        SET name = $2, slug_name = $3, description = $4, last_modified_at = now()
        WHERE id = $1
      `
      const res = await query(sql, [id, name, slug(name), description])

      return res.rowCount > 0 ? getDomainById(id) : domain
    } catch (err) {
      if (err.code === ERROR_CODE_MAP.UNIQUE_KEY_VIOLATION) throw new BadRequestError(err.detail, err.stack)
      if (err instanceof DomainsAPIError) throw err
      throw new DependencyError(`An error occurred while updating domain '${id}' in the database.`, err.stack)
    }
  }

  async function createDomainProduct (domainProduct) {
    try {
      const { name, description, resourceTypes, domainId } = domainProduct

      await query('BEGIN')

      const sql = `INSERT INTO domain_products ( id, name, slug_name, description, created_at, last_modified_at ) 
        VALUES($1, $2, $3, $4, now(), now()) RETURNING * `
      const params = [generate(), name, slug(name), description]

      const res = await query(sql, params)
      const result = res.rows.length > 0 ? toDTO(res.rows[0]) : undefined
      const domainProductId = result.id

      // CREATE A RELATION BETWEEN DOMAINPRODUCT AND DOMAIN
      await createRelation(domainId, DOMAIN, domainProductId, DOMAINPRODUCT)

      if (!isEmpty(resourceTypes)) {
        const resourceTypeAssociation = await checkResourceTypeAssociation(resourceTypes)

        if (resourceTypeAssociation.length > 0) {
          throw new BadRequestError(
            `ResourceType(s) ${map(resourceTypeAssociation, row => (`'${row.resource_type_name}'`)).join(', ')} are already associated with domainProduct(s) ${map(resourceTypeAssociation, row => (`'${row.domain_product_name}'`)).join(', ')} respectively`)
        }

        let paramIndex = 1
        const sql = `
          INSERT INTO domain_product_resource_types (domain_product_id, resource_type_name)
          VALUES ${map(resourceTypes, () => (`($1, $${++paramIndex})`)).join(', ')}`
        await query(sql, [domainProductId, ...resourceTypes])
      }

      await createDefaultProduct(domainProductId)

      await query('COMMIT')
      return !isEmpty(result) ? getDomainProductById(domainProductId) : undefined
    } catch (err) {
      await query('ROLLBACK')

      switch (err.code) {
        case ERROR_CODE_MAP.UNIQUE_KEY_VIOLATION:
          throw new BadRequestError(err.detail, err.stack)
        default:
          if (err instanceof DomainsAPIError) throw err
          throw new DependencyError(`An error occurred while creating the domainProduct ${domainProduct.name} in the database`, err.stack)
      }
    }
  }

  const getDomainProductsQuery = `
    SELECT
      dp.id, dp.name, dp.slug_name, dp.description, dp.sort_id, dp.is_active, dp.created_at, dp.last_modified_at, dp.is_system_generated,
      d.id as domain_id, d.name as domain_name,
      p.id as product_id, p.name as product_name, p.description as product_description, p.is_system_generated as product_is_system_generated, p.created_at as product_created_at, p.last_modified_at as product_last_modified_at,
      dprt.resource_type_name AS resource_type_name
    FROM domain_products dp
    LEFT JOIN relations r ON r.parent_id = dp.id OR r.child_id = dp.id
    LEFT JOIN domains d ON d.id = r.parent_id OR d.id = r.child_id AND d.is_active = TRUE
    LEFT JOIN products p ON p.id = r.parent_id OR p.id = r.child_id AND p.is_active = TRUE
    LEFT JOIN domain_product_resource_types dprt ON dprt.domain_product_id = dp.id
    WHERE dp.is_active = TRUE
  `

  async function getDomainProducts (reqQuery, limit, offset) {
    try {
      const { name, resourceTypes, products } = reqQuery
      const filters = []
      const params = []
      let paramIndex = 1

      if (name) {
        filters.push(`slug_name LIKE $${paramIndex++}`)
        params.push(`%${slug(name)}%`)
      }

      if (products) {
        filters.push(`product_id IN (${map(products, () => `$${paramIndex++}`).join(',')})`)
        params.push(...map(products, (product) => product.trim()))
      }
      if (resourceTypes) {
        filters.push(`resource_type_name IN (${map(resourceTypes, () => `$${paramIndex++}`).join(',')})`)
        params.push(...map(resourceTypes, (resourceType) => resourceType.trim()))
      }

      if (offset) {
        filters.push(`sort_id < $${paramIndex++}`)
        params.push(offset.sortId)
      }

      params.push(limit)

      const sql = `
        WITH domain_products_cte AS (${getDomainProductsQuery})
        SELECT
          dp.id, name, description, dp.sort_id, is_system_generated,
          domain_id, domain_name, resource_type_name,
          product_id, product_name, product_description, product_is_system_generated, product_created_at, product_last_modified_at
        FROM (
          SELECT DISTINCT id AS id, sort_id
          FROM domain_products_cte
          ${filters.length > 0 ? 'WHERE ' + filters.join(' AND ') : ''}
          ORDER BY sort_id DESC
          LIMIT $${paramIndex++}
        ) dp
        JOIN domain_products_cte cte ON dp.id = cte.id
        ORDER BY cte.sort_id DESC`

      const res = await query(sql, params)
      const results = joinjs.map(res.rows, domainProductResultMap, 'domainProducts')

      return {
        results,
        nextOffset: results.length >= limit ? { sortId: get(last(res.rows), 'sort_id') } : undefined,
        count: results.length
      }
    } catch (err) {
      if (err instanceof DomainsAPIError) throw err
      throw new DependencyError('An error occurred while retrieving domainProducts from the database.', err.stack)
    }
  }

  async function getDomainProductById (domainProductId) {
    try {
      const sql = `${getDomainProductsQuery} AND dp.id = $1 `

      const res = await query(sql, [domainProductId])

      if (res.rows.length === 0) {
        throw new NotFoundError(`Unable to find domainProduct with id '${domainProductId}'`)
      }

      return joinjs.mapOne(res.rows, domainProductResultMap, 'domainProducts')
    } catch (err) {
      console.log(err)
      if (err instanceof DomainsAPIError) throw err
      throw new DependencyError(`An error occurred while retrieving domainProduct with id '${domainProductId}' from the database.`, err.stack)
    }
  }

  async function updateDomainProduct (id, domainProduct, isDomainIdUpdated) {
    try {
      const { name, description, domainId } = domainProduct

      const sql = `
        UPDATE domain_products
        SET name = $2, slug_name = $3, description = $4, last_modified_at = now()
        WHERE id = $1
      `

      const res = await query(sql, [id, name, slug(name), description])

      if (isDomainIdUpdated) {
        await query('UPDATE relations SET parent_id = $1 WHERE child_id = $2', [domainId, id])
      }

      return res.rowCount > 0 ? getDomainProductById(id) : domainProduct
    } catch (err) {
    }
  }

  async function updateDomainProductResourceTypes (domainProduct, reqBody) {
    try {
      const { add, remove } = reqBody
      const { id: domainProductId } = domainProduct
      let updatedRowCount = 0

      await query('BEGIN')

      if (!isEmpty(add)) {
        const resourceTypeAssociation = await checkResourceTypeAssociation(add)

        if (resourceTypeAssociation.length > 0) {
          throw new BadRequestError(
            `ResourceType(s) ${map(resourceTypeAssociation, row => (`'${row.resource_type_name}'`)).join(', ')} are already associated with domainProduct(s) ${map(resourceTypeAssociation, row => (`'${row.domain_product_name}'`)).join(', ')} respectively`)
        }

        let paramIndex = 1
        const sql = `
          INSERT INTO domain_product_resource_types (domain_product_id, resource_type_name)
          VALUES ${map(add, () => (`($1, $${++paramIndex})`)).join(', ')}`
        const result = await query(sql, [domainProductId, ...add])
        updatedRowCount = result.rowCount
      }

      if (!isEmpty(remove)) {
        let paramIndex = 1
        const sql = `
          DELETE FROM domain_product_resource_types
          WHERE domain_product_id = $1 AND resource_type_name IN (${map(remove, () => `$${++paramIndex}`).join(',')})`
        const result = await query(sql, [domainProductId, ...remove])
        updatedRowCount += result.rowCount // RENAME THIS SECTION
      }

      await query('COMMIT')
      return updatedRowCount > 0 ? getDomainProductById(domainProductId) : domainProduct
    } catch (err) {
      await query('ROLLBACK')

      if (err instanceof DomainsAPIError) throw err
      throw new DependencyError('An error occurred while updating domainProduct resource types in the database', err.stack)
    }
  }

  async function createProduct (product) {
    try {
      const { name, description, domainProductId } = product

      await query('BEGIN')

      const sql = `INSERT INTO products ( id, name, slug_name, description, created_at, last_modified_at ) 
        VALUES($1, $2, $3, $4, now(), now()) RETURNING * `
      const params = [generate(), name, slug(name), description]

      const res = await query(sql, params)
      const result = res.rows.length > 0 ? toDTO(res.rows[0]) : undefined
      const productId = result.id

      await createRelation(domainProductId, DOMAINPRODUCT, productId, PRODUCT)
      await query('COMMIT')

      return !isEmpty(result) ? getProductById(productId) : undefined
    } catch (err) {
      await query('ROLLBACK')

      switch (err.code) {
        case ERROR_CODE_MAP.UNIQUE_KEY_VIOLATION:
          throw new BadRequestError(err.detail, err.stack)
        default:
          if (err instanceof DomainsAPIError) throw err
          throw new DependencyError(`An error occurred while creating the product ${product.name} in the database`, err.stack)
      }
    }
  }

  const getProductsQuery = (fields, includeFields) => {
    const includeField = (field) => (isEmpty(fields) || (includeFields && includes(fields, field)))
    return `
      SELECT p.id, p.name, p.slug_name, p.description, p.sort_id, p.is_active, p.created_at, p.last_modified_at, p.is_system_generated
      ${includeField('domain')
        ? ',d.id as domain_id, d.name as domain_name, d.description as domain_description'
        : ''}
      ${includeField('domainProduct')
        ? ',dp.id as domain_product_id, dp.name as domain_product_name, dp.description as domain_product_description'
        : ''}
      FROM products p 
      LEFT JOIN relations r1 ON (r1.parent_id = p.id OR r1.child_id = p.id) 
      LEFT JOIN relations r2 ON (r1.child_id = p.id AND r2.child_id = r1.parent_id)
      ${includeField('domainProduct') ? 'LEFT JOIN domain_products dp ON dp.id = r2.child_id AND dp.is_active = true' : ''} 
      ${includeField('domain') ? 'LEFT JOIN domains d ON d.id = r2.parent_id AND d.is_active = true' : ''}
      WHERE p.is_active = true`
  }

  async function getProducts (reqQuery, limit, offset) {
    try {
      const sql = `SELECT * FROM products where is_deleted=false LIMIT 50 OFFSET ${offset.sortId || 1}`
      const res = await query(sql)
      const results = joinjs.map(res.rows, productResultMap, 'products')
      let prevPage = Number(get(last(res.rows), 'id', '0')) - 100
      return {
        results,
        nextOffset: results.length >= limit ? { sortId: get(last(res.rows), 'id') } : undefined,
        prevOffset: { sortId: prevPage < 1 ? 1: prevPage },
        count: results.length
      }
    } catch (err) {
      if (err instanceof DomainsAPIError) throw err
      throw new DependencyError('An error occurred while retrieving products from the database.', err.stack)
    }
  }

  async function updateProduct (id, product, isDomainProductIdUpdated) {
    try {
      const { name, description, domainProductId } = product

      const sql = `
        UPDATE products
        SET name = $2, slug_name = $3, description = $4, last_modified_at = now()
        WHERE id = $1
      `

      const res = await query(sql, [id, name, slug(name), description])

      if (isDomainProductIdUpdated) {
        await query('UPDATE relations SET parent_id = $1 WHERE child_id = $2', [domainProductId, id])
      }

      return res.rowCount > 0 ? getProductById(id) : product
    } catch (err) {
      switch (err.code) {
        case ERROR_CODE_MAP.UNIQUE_KEY_VIOLATION:
          throw new BadRequestError(err.detail, err.stack)
        default:
          if (err instanceof DomainsAPIError) throw err
          throw new DependencyError(`An error occurred while updating product '${id}' in the database.`, err.stack)
      }
    }
  }

  async function getProductById (productId, queryParams = {}) {
    const { includeFields = true, fields } = queryParams
    try {
      const sql = `select * from products where id = $1 `
      const res = await query(sql, [productId])
      console.log(sql, res);
      if (res.rows.length === 0) {
        throw new NotFoundError(`Unable to find product with id '${productId}'`)
      }

      return joinjs.mapOne(res.rows, productResultMap, 'products')
    } catch (err) {
      if (err instanceof DomainsAPIError) throw err
      throw new DependencyError(`An error occurred while retrieving product with id '${productId}' from the database.`, err.stack)
    }
  }

  async function checkResourceTypeAssociation (resourceTypes) {
    try {
      let paramIndex = 1
      const sql = `
          SELECT dprt.resource_type_name as resource_type_name, dp.name as domain_product_name
          FROM domain_product_resource_types dprt
          LEFT JOIN domain_products dp ON dprt.domain_product_id = dp.id
          WHERE dprt.resource_type_name IN (${map(resourceTypes, () => (`$${paramIndex++}`)).join(', ')})`
      const res = await query(sql, resourceTypes)
      return res.rows
    } catch (err) {
      throw new DependencyError('An error occurred while checking association of resource type(s) with domainProduct(s) from the database.', err.stack)
    }
  }

  async function createRelation (parentId, parentType, childId, childType) {
    const sql = `INSERT INTO relations (parent_id, parent_type, child_id, child_type ) 
        VALUES($1, $2, $3, $4) RETURNING * `
    const params = [parentId, parentType, childId, childType]
    const res = await query(sql, params)

    return res.rows.length > 0 ? toDTO(res.rows[0]) : undefined
  }

  async function createComponent (componentData) {
    try {
      const { name, description, productId, componentId, type } = componentData

      await query('BEGIN')
      const result = await query(
        `INSERT INTO components (name, description, component_id, type, created_at, last_modified_at) 
        VALUES (TRIM($1), TRIM($2), $3, $4, NOW(), NOW()) RETURNING *`,
        [name, description, componentId, type])
      const component = get(result, 'rows[0]', {})

      const componentIdForRelation = type + ':' + component.component_id
      await createRelation(productId, PRODUCT, componentIdForRelation, COMPONENT)
      await query('COMMIT')

      return !isEmpty(component) ? getComponentById(component.component_id, type) : undefined
    } catch (error) {
      await query('ROLLBACK')
      if (error.code === ERROR_CODE_MAP.UNIQUE_KEY_VIOLATION) throw new BadRequestError(error.detail, error.stack)
      if (error instanceof DomainsAPIError) throw error
      throw new DependencyError('An error occurred while creating the component in the database', error.stack)
    }
  }

  async function updateComponent (componentId, componentType, component) {
    try {
      const { name, description, type, productId } = component
      const args = [componentId, componentType]
      let sql = 'UPDATE components SET'
      if (!isEmpty(name)) {
        args.push(name)
        sql = `${sql} name = TRIM($${args.length}),`
      }
      if (!isEmpty(type)) {
        args.push(type)
        sql = `${sql} type = $${args.length},`
      }
      if (!isEmpty(description)) {
        args.push(description)
        sql = `${sql} description = TRIM($${args.length}),`
      }

      query('BEGIN')
      await query(`${sql} last_modified_at = now() WHERE component_id = $1 AND type = $2 RETURNING *`, args)

      if (!isEmpty(productId) || !isEmpty(type)) {
        let updateRelationSql = 'UPDATE relations SET '
        const params = [componentType + ':' + componentId]

        if (!isEmpty(productId)) {
          params.push(productId)
          updateRelationSql = updateRelationSql + `parent_id = $${params.length},`
        }
        if (!isEmpty(type)) {
          params.push(type + ':' + componentId)
          updateRelationSql = updateRelationSql + `child_id = $${params.length},`
        }
        updateRelationSql = updateRelationSql.slice(0, -1) + ' WHERE child_id = $1'

        await query(updateRelationSql, params)
      }
      query('COMMIT')
      return getComponentById(componentId, type || componentType)
    } catch (err) {
      query('ROLLBACK')
      switch (err.code) {
        case ERROR_CODE_MAP.UNIQUE_KEY_VIOLATION:
          throw new BadRequestError(err.detail, err.stack)
        default:
          if (err instanceof DomainsAPIError) throw err
          throw new DependencyError(`An error occurred while updating component '${componentId}' in the database.`, err.stack)
      }
    }
  }

  async function getSize () {
    try {
      const res = await query('SELECT COUNT(*) FROM domains')
      return parseInt(res.rows[0].count, 10)
    } catch (err) {
      throw new DependencyError(`Failed to retrieve the size of the table from the database. ${err.message}`, err.stack)
    }
  }

  const getComponentsQuery = (fields, includeFields) => {
    const includeField = (field) => (isEmpty(fields) || (includeFields && includes(fields, field)))
    return `
      SELECT
        c.name AS name,
        c.description AS description,
        c.component_id AS id,
        c.type AS type,
        c.sort_id AS sort_id,
        c.is_active AS is_active,
        c.created_at AS created_at,
        c.last_modified_at AS last_modified_at
        ${includeField('domain')
        ? `,d.id as domain_id,
        d.name as domain_name`
        : ''}
        ${includeField('product')
        ? `,p.id as product_id,
        p.name as product_name`
        : ''}
        ${includeField('domainProduct')
        ? `,dp.id as domain_product_id,
        dp.name as domain_product_name`
        : ''}
        FROM components c
      LEFT JOIN relations r1 ON r1.child_id = CONCAT(c.type, ':', c.component_id::varchar(255))
      LEFT JOIN relations r2 ON r1.parent_id = r2.child_id
      LEFT JOIN relations r3 ON r2.parent_id = r3.child_id
      ${includeField('domainProduct') ? 'LEFT JOIN domain_products dp ON dp.id = r2.parent_id AND dp.is_active = true' : ''} 
      ${includeField('product') ? 'LEFT JOIN products p ON p.id = r1.parent_id AND p.is_active = true' : ''}
      ${includeField('domain') ? 'LEFT JOIN domains d ON d.id = r3.parent_id AND d.is_active = true' : ''}
      WHERE c.is_active = true `
  }

  async function getComponents (reqQuery, limit, offset) {
    try {
      const { includeFields = true, fields, type, products } = reqQuery
      const filters = []
      const params = []
      let paramIndex = 2
      params.push(limit)

      if (!isEmpty(products)) {
        filters.push(`p.id IN (${map(products, () => `$${paramIndex++}`).join(',')})`)
        params.push(...map(products, (productId) => productId.trim()))
      }

      if (type) {
        filters.push(`c.type = $${paramIndex++}`)
        params.push(type)
      }

      if (offset) {
        params.push(offset.sortId)
      }

      const sql = `
        WITH components_cte AS (${getComponentsQuery(includeFields, fields)} 
        ${filters.length > 0 ? ' AND ' + filters.join(' AND ') : ''}
        )
        SELECT * FROM 
        (SELECT DISTINCT id, sort_id
          FROM components_cte 
          ${offset ? `WHERE sort_id < $${paramIndex++}` : ''}
          ORDER BY sort_id DESC
          LIMIT $1
        ) cp
        JOIN components_cte cte ON cp.id = cte.id
        ORDER BY cte.sort_id DESC`

      const res = await query(sql, params)
      const results = joinjs.map(res.rows, componentResultMap, 'components')

      return {
        results,
        nextOffset: results.length >= limit ? { sortId: get(last(res.rows), 'sort_id') } : undefined,
        count: results.length
      }
    } catch (err) {
      if (err instanceof DomainsAPIError) throw err
      throw new DependencyError('An error occurred while retrieving components from the database.', err.stack)
    }
  }

  async function getComponentById (componentId, type, queryParams = {}) {
    const { includeFields = true, fields } = queryParams
    try {
      const sql = `${getComponentsQuery(includeFields, fields)} AND c.component_id = $1 AND type = $2 `
      const res = await query(sql, [componentId, type])

      if (res.rows.length === 0) {
        throw new NotFoundError(`Unable to find component with id '${type}:${componentId}'`)
      }

      return joinjs.mapOne(res.rows, componentResultMap, 'components')
    } catch (err) {
      if (err instanceof DomainsAPIError) throw err
      throw new DependencyError(`An error occurred while retrieving component with id '${type}:${componentId}' from the database.`, err.stack)
    }
  }

  const domainResultMap = [{
    mapId: 'domains',
    properties: ['id', 'name', 'description', 'is_active', 'created_at', 'last_modified_at', 'is_system_generated'],
    collections: [{
      name: 'domainProducts',
      mapId: 'domainProducts',
      columnPrefix: 'domain_product_'
    }]
  }, {
    mapId: 'domainProducts',
    idProperty: 'id',
    properties: ['id', 'name', 'description', 'is_system_generated', 'created_at', 'last_modified_at'],
    collections: [{
      name: 'products',
      mapId: 'products',
      columnPrefix: 'product_'
    }]
  }, {
    mapId: 'products',
    idProperty: 'id',
    properties: ['id', 'name', 'description', 'is_system_generated', 'created_at', 'last_modified_at']
  }]

  const domainProductResultMap = [{
    mapId: 'domainProducts',
    properties: ['id', 'name', 'description', 'is_active', 'created_at', 'last_modified_at', 'is_system_generated'],
    associations: [{
      name: 'domain', mapId: 'domain', columnPrefix: 'domain_'
    }],
    collections: [{
      name: 'products',
      mapId: 'products',
      columnPrefix: 'product_'
    },
    {
      name: 'resourceTypes',
      mapId: 'resourceTypes',
      columnPrefix: 'resource_type_'
    }
    ]
  }, {
    mapId: 'domain',
    idProperty: 'id',
    properties: ['id', 'name']
  },
  {
    mapId: 'products',
    idProperty: 'id',
    properties: ['id', 'name', 'description', 'is_system_generated', 'created_at', 'last_modified_at']
  },
  {
    mapId: 'resourceTypes',
    idProperty: 'name',
    properties: ['name']
  }]

  const productResultMap = [{
    mapId: 'products',
    properties: ['id', 'name', 'cat_no', 'cas_no', 'mol_formula', 'mol_weight', 'inv_status', 'is_deleted', 'created_by', 'created_at', 'updated_by', 'updated_at'],
  }]

  const componentResultMap = [{
    mapId: 'components',
    properties: ['id', 'name', 'description', 'type', 'is_active', 'created_at', 'last_modified_at'],
    associations: [
      { name: 'domainProduct', mapId: 'domainProduct', columnPrefix: 'domain_product_' },
      { name: 'domain', mapId: 'domain', columnPrefix: 'domain_' },
      { name: 'product', mapId: 'product', columnPrefix: 'product_' }]
  }, {
    mapId: 'domainProduct',
    idProperty: 'id',
    properties: ['id', 'name']
  }, {
    mapId: 'domain',
    idProperty: 'id',
    properties: ['id', 'name']
  },
  {
    mapId: 'product',
    idProperty: 'id',
    properties: ['id', 'name']
  }]

  return {
    createDomain,
    getDomains,
    getDomainById,
    updateDomain,
    createDomainProduct,
    getDomainProducts,
    getDomainProductById,
    updateDomainProduct,
    updateDomainProductResourceTypes,
    createProduct,
    updateProduct,
    getProducts,
    getProductById,
    createComponent,
    updateComponent,
    getComponents,
    getComponentById,
    getSize
  }
}
