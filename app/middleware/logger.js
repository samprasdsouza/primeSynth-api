'use strict'

const { includes, get } = require('lodash')
const expressWinston = require('express-winston')
const { createLogger, format, transports } = require('winston')

const IGNORE_LOGS_FOR_ROUTES = ['/v1/healthcheck', '/v1/livecheck', '/v1/openapi']
const REQUEST_WHITELIST = ['method', 'url', 'headers', 'query', 'body', 'baseUrl', '_parsedUrl', 'user']
const RESPONSE_WHITELIST = ['statusCode', 'statusMessage', 'headers', 'body']

// since we are planning to deploy this as a serverless function,
// we just need to console log & logs will be available in AWS CloudWatch
const winstonInstance = createLogger({
  // only generate info logs and above when running in production
  level: process.env.NODE_ENV === 'prd' ? 'info' : 'debug',
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.Console({
      silent: process.env.NODE_ENV === 'test', // silent when running tests
      handleExceptions: true
    })
  ]
})

// this module returns a logger middleware which is used in express flow to log request and response,
// and a logger module with `log` and `error` methods for custom logging
module.exports = {
  logger: winstonInstance,
  loggerMiddleware: expressWinston.logger({
    winstonInstance,
    meta: true,
    level: (req, res) => {
      if (res.statusCode >= 400) return 'error'
      if (['HEAD', 'OPTIONS'].includes(req.method)) return 'debug'
      return 'info'
    },
    requestFilter: (req, propName) => {
      if (req && propName === 'headers') {
        if (req[propName].authorization) {
          req[propName].authorization = req[propName].authorization.split('.').slice(0, 2).join('.') + '.REDACTED'
        }
        if (req[propName]['x-session-id']) {
          req[propName]['x-session-id'] = 'REDACTED'
        }
      }
      return req[propName]
    },
    requestWhitelist: REQUEST_WHITELIST,
    responseWhitelist: RESPONSE_WHITELIST,
    dynamicMeta: (req) => ({
      requestId: {
        apiGateway: get(req, 'apiGateway.event.requestContext.requestId', ''),
        lambda: get(req, 'apiGateway.context.awsRequestId', '')
      }
    }),
    msg: 'HTTP {{req.method}} {{req.baseUrl}}{{req._parsedUrl.path}}',
    skip: (req, res) => includes(IGNORE_LOGS_FOR_ROUTES, req._parsedUrl.path) && res.statusCode < 400
  })
}
