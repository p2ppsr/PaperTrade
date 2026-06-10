require('dotenv').config()

const port = Number(process.env.SQL_DATABASE_PORT || '3306')

module.exports = {
  client: process.env.SQL_CLIENT || 'mysql2',
  migrations: {
    directory: './migrations',
    extension: 'cjs'
  },
  connection: {
    host: process.env.SQL_DATABASE_HOST,
    port: Number.isNaN(port) ? 3306 : port,
    user: process.env.SQL_DATABASE_USER,
    password: process.env.SQL_DATABASE_PASSWORD,
    database: process.env.SQL_DATABASE_DB_NAME
  }
}
