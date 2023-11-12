'use strict'

const dotenv = require('dotenv')
dotenv.config()

const app = require('./app')

const port = process.env.PORT || 3000
try {
  app.listen(port)
  console.log(`App started listening on port: ${port}`)
} catch (err) {
  console.error('Error while starting the app', err)
}

process.on('SIGINT', () => {
  console.log('Exiting...')
  process.exit()
})
