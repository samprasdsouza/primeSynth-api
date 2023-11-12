const { Router } = require('express');
const { omit, isEmpty, result } = require('lodash');
const halson = require('halson')


module.exports = (logger, validator, pgClient) => {
    const urlPrefix = process.env.URL_PREFIX
    const productRiverId = process.env.PRODUCT_RIVER_ID

    const getProduct = async (req, res, next) => {
        try {
            const { limit = 50 } = req.body
            console.log(req.body);
            let offset
            try {
              const decodedOffset = req.body.offset ? Buffer.from(req.body.offset, 'base64').toString('utf8') : undefined
              if (decodedOffset) offset = JSON.parse(decodedOffset)
            } catch (err) {
              throw new BadRequestError('Error while validating request: request.query.offset is invalid')
            }
      
            const { results: products, count, nextOffset } = await pgClient.getProducts(req.body, limit, offset)
      
            console.log(results);
            const encodedOffset = nextOffset ? Buffer.from(JSON.stringify(nextOffset)).toString('base64') : undefined
            const firstQueryParams = omit(req.query, ['offset'])
      
            const halResponse = halson({ count: count || 0 })
              .addLink('current', `${urlPrefix}${req.originalUrl}`)
              .addLink('first', `${urlPrefix}/api/v1/products${isEmpty(firstQueryParams) ? '' : `?${querystring.stringify(firstQueryParams)}`}`)
      
            if (nextOffset) {
              const nextQuery = assign({}, req.query, { offset: encodedOffset })
              halResponse.addLink('next', `${urlPrefix}/api/v1/products?${querystring.stringify(nextQuery)}`)
            }
      
            // halResponse.addEmbed('products', products.map(product => productToHal(includeExcludeFields(product, req.query))))
      
            return res.status(200).send(halResponse)
          }  catch (err) {
            return next(err);
        }
    }

    const productToHal = (product) => {
        const halResponse = halson(product)
        if (product) {
          halResponse.addLink('self', `${urlPrefix}/api/v1/products/${product.id}`)
    
          if (product.domainProduct) {
            halResponse.domainProduct = halson(product.domainProduct)
              .addLink('self', `${urlPrefix}/api/v1/domainProducts/${product.domainProduct.id}`)
          }
    
          if (product.domain) {
            halResponse.domain = halson(product.domain)
              .addLink('self', `${urlPrefix}/api/v1/domains/${product.domain.id}`)
          }
        }
        return halResponse
    }

    const router = Router()
    router.route('/').get(validator.validate('get', '/products'), getProduct)

    return {
        getProduct,
        router
    }
}