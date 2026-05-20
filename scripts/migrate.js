import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { pool } from '../src/db/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function migrate() {
  try {
    const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
    await pool.query(sql)
    console.log('✅ Database schema applied successfully')
    process.exit(0)
  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
  }
}

migrate()
