'use strict'

const { Pool } = require('pg')

let clientConfig
// if (false) {
//   clientConfig = { ssl: true }
// }
const client = new Pool(clientConfig)

module.exports = {
  query: (sql, args) => client.query(sql, args)
}
