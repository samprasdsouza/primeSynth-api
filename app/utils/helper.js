'use strict'

const queryString = require('query-string')

const {isEmpty, castArray, map, compact, intersection, difference, uniq } = require('lodash')

const queryParser = (req, res, next) => {
  if (req.query) {
    const parseOptions = {
      arrayFormat: 'comma',
      parseBooleans: true,
      parseNumbers: true
    }
    const query = queryString.parseUrl(decodeURIComponent(req.url), parseOptions).query

    // when receiving single value for fields, casting it to an array to keep request validator working
    if (!isEmpty(query.fields)) query.fields = castArray(query.fields)
    if (!isEmpty(query.domainProducts)) query.domainProducts = castArray(query.domainProducts)
    if (!isEmpty(query.products)) query.products = castArray(query.products)
    if (!isEmpty(query.resourceTypes)) query.resourceTypes = castArray(query.resourceTypes)
    req.query = query
  }
  next()
}

const preprocessReqBody = ({ add: addArray, remove: removeArray }) => {
  let add = uniq(map(compact(addArray), e => e.trim()))
  let remove = uniq(map(compact(removeArray), e => e.trim()))

  const duplicates = intersection(add, remove)
  add = difference(add, duplicates)
  remove = difference(remove, duplicates)

  return { add, remove }
}

module.exports = {
  queryParser,
  preprocessReqBody
}
