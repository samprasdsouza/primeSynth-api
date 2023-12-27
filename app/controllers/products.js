const { Router } = require('express');
const { omit, isEmpty, assign, result } = require('lodash');
const querystring = require('querystring')
const halson = require('halson');
const { off } = require('process');
const { BadRequestError, ForbiddenError } = require('../utils/errors');
const { log } = require('console');



module.exports = (logger, validator, pgClient) => {
    const urlPrefix = 'http://localhost:3500'

    const getAllProduct = async (req, res, next) => {
        try {
            const { limit = 50 } = req.body
            let offset = 1
            try {
              const decodedOffset = req.query?.offset ? Buffer.from(req.query?.offset, 'base64').toString('utf8') : undefined
              if (decodedOffset) {
                offset = JSON.parse(decodedOffset)
              }
            } catch (err) {
              throw new BadRequestError('Error while validating request: request.query.offset is invalid')
            }
      
            const { results: products, count, nextOffset, prevOffset } = await pgClient.getProducts(req.body, limit, offset)
      
            const encodedOffset = nextOffset ? Buffer.from(JSON.stringify(nextOffset)).toString('base64') : undefined
            const encodedPrevOffset = prevOffset ? Buffer.from(JSON.stringify(prevOffset)).toString('base64') : undefined
            const firstQueryParams = omit(req.query, ['offset'])
            
            const halResponse = halson({ count: count || 0 })
              .addLink('current', `${urlPrefix}${req.originalUrl}`)
              .addLink('first', `${urlPrefix}/api/v1/products${isEmpty(firstQueryParams) ? '' : `?${querystring.stringify(firstQueryParams)}`}`)
            
              console.log('nextOffset', nextOffset);
            if (nextOffset) {
              const nextQuery = assign({}, req.query, { offset: encodedOffset })
              halResponse.addLink('next', `${urlPrefix}/api/v1/products?${querystring.stringify(nextQuery)}`)
            }
            if(prevOffset) {
              const prevQuery = assign({}, req.query, { offset: encodedPrevOffset })
              halResponse.addLink('previous', `${urlPrefix}/api/v1/products?${querystring.stringify(prevQuery)}`)
            }
      
            halResponse.addEmbed('products', products.map(product => productToHal(includeExcludeFields(product, req.query))))
      
            return res.status(200).send(halResponse)
          }  catch (err) {
            return next(err);
        }
    }

    const getProductById = async(req, res, next) => {
      try {
        const { productId } = req.params
        console.log('productId', productId);
        const product = await pgClient.getProductById(productId, req.query) 

        return res.status(200).send(productToHal(includeExcludeFields(product, req.query)))
      } catch (err) {
        next(err)
      }
    }

    const productToHal = (product) => {
        const halResponse = halson(product)
        if (product) {
          halResponse.addLink('self', `${urlPrefix}/api/v1/product/${product.id}`)
        }
        return halResponse
    }

    const includeExcludeFields = (product, queryParams = {}) => {
      const { fields, includeFields = true } = queryParams
      product = omit(product, ['is_deleted', 'created_at', 'created_by', 'updated_by', 'updated_at'])
  
      if (!isEmpty(fields)) {
        product = includeFields ? pick(product, ['id', ...fields]) : omit(product, fields)
      }
  
      return product
    }

    const router = Router()
    router.route('/')
      .get(validator.validate('get', '/products'), getAllProduct)

    router.route('/:productId')
      .get(validator.validate('get', '/products/{productId}', getProductById))

    return {
        getAllProduct,
        getProductById,
        router
    }
}