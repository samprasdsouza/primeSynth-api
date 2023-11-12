'use strict'

const { get, map, isEmpty } = require('lodash')
const { DomainsAPIError, NotFoundError, BadRequestError, InternalServerError } = require('../utils/errors')
const { logger } = require('./logger')

const errorHandler = (error, req, res, next) => {
  let errorObject
  if (error instanceof DomainsAPIError) {
    errorObject = error
    error.validation = true
  } else if (error.validation || error.statusCode === 400) {
    let errorMessage

    if (error.validation) {
      errorMessage = map(error.validation, validation => {
        const additionalDetail = get(validation, 'params.allowedValues', '')
        return `${error.validationContext}${validation.dataPath} ` +
            `${validation.message}${isEmpty(additionalDetail) ? '' : `: [${additionalDetail}]`}`
      }).join(', ')
    } else {
      errorMessage = `Request Error: ${error.message}`
    }

    errorObject = new BadRequestError(errorMessage, error.stack)
  } else {
    errorObject = new InternalServerError(`An internal server error occurred: ${error.message}`, error.stack)
  }
  logger.error(errorObject)
  const { title, status, detail } = errorObject
  return res.status(status).json({ title, status, detail })
}

const notFoundHandlerMiddleware = (req, res, next) => {
  if (!res.headersSent) {
    return next(new NotFoundError(`Invalid url and method specified: '${req.method} ${req.url}'`))
  }
  next()
}

module.exports = {
  errorHandler,
  notFoundHandlerMiddleware
}
