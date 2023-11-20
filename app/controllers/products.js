const { Router } = require('express');
const { omit, isEmpty, assign, result } = require('lodash');
const querystring = require('querystring')
const halson = require('halson');
const { off } = require('process');
const { BadRequestError, ForbiddenError } = require('../utils/errors');
const { log } = require('console');



module.exports = (logger, validator, pgClient) => {
    const urlPrefix = process.env.URL_PREFIX
    const productRiverId = process.env.PRODUCT_RIVER_ID

    const getProduct = async (req, res, next) => {
        try {
            const { limit = 1 } = req.body

            console.log(req.query.offset);
            let offset
            try {
              const decodedOffset = req.query.offset ? Buffer.from(req.query.offset, 'base64').toString('utf8') : undefined
              console.log(decodedOffset, Buffer.from(req.query.offset, 'base64').toString('utf8'));
              if (decodedOffset) offset = JSON.parse(decodedOffset)
              console.log('offset', decodedOffset, offset);
            } catch (err) {
              throw new BadRequestError('Error while validating request: request.query.offset is invalid')
            }
      
            const { results: products, count, nextOffset } = await pgClient.getProducts(req.body, limit, offset)
      
            console.log(products, count, nextOffset);
            const encodedOffset = nextOffset ? Buffer.from(JSON.stringify(nextOffset)).toString('base64') : undefined
            const firstQueryParams = omit(req.query, ['offset'])
      
            const halResponse = halson({ count: count || 0 })
              .addLink('current', `${urlPrefix}${req.originalUrl}`)
              .addLink('first', `${urlPrefix}/api/v1/products${isEmpty(firstQueryParams) ? '' : `?${querystring.stringify(firstQueryParams)}`}`)
            
              console.log('nextOffset', nextOffset);
            if (nextOffset) {
              const nextQuery = assign({}, req.query, { offset: encodedOffset })
              halResponse.addLink('next', `${urlPrefix}/api/v1/products?${querystring.stringify(nextQuery)}`)
            }
      
            halResponse.addEmbed('products', products.map(product => productToHal(includeExcludeFields(product, req.query))))
      
            return res.status(200).send(halResponse)
          }  catch (err) {
            return next(err);
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
    router.route('/').get(validator.validate('get', '/products'), getProduct)

    return {
        getProduct,
        router
    }
}