import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const { Pool } = pg

export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'fcommerce',
      user: process.env.DB_USER || 'fcomuser',
      password: process.env.DB_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
    })

export const query = (text, params) => pool.query(text, params)

pool.on('error', (err) => console.error('Database pool error:', err))

pool.connect()
  .then(c => { c.release(); console.log('✅ Database connected') })
  .catch(err => console.error('❌ Database connection failed:', err.message))
