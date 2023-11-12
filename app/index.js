'use strict'
const express = require('express')
const cors = require('cors')

const fs = require('fs')
const { OpenApiValidator } = require('express-openapi-validate')
const yaml = require('js-yaml')
const path = require('path')
const bodyParser = require('body-parser')

const { queryParser } = require('./utils/helper.js')
const productsController = require('./controllers/products') 
const { errorHandler, notFoundHandlerMiddleware } = require('./middleware/error-handler')
const { logger, loggerMiddleware } = require('./middleware/logger')
const  postgresClient = require('./db/pgClient')

const app = express()

app.use(cors())
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }))
app.use(queryParser)
app.use(loggerMiddleware)


const openApiDoc = yaml.load(fs.readFileSync(path.join(__dirname, './openapi/openapi.yaml'), 'utf-8'))
const validator = new OpenApiValidator(openApiDoc)
const pgClient = postgresClient()


app.use('/api/v1/products', productsController(logger, validator, pgClient).router)


app.use(notFoundHandlerMiddleware)
app.use(errorHandler)

module.exports = app
