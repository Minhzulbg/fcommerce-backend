import express from 'express'
import { query } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()
router.use(requireAuth)

const VALID_STATUSES = ['pending','confirmed','packing','courier','delivered','cancelled','returned']

// GET /api/orders - List orders
router.get('/', async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query
  const offset = (page - 1) * limit
  const params = [req.user.id]
  let where = 'WHERE user_id = $1'
  if (status && VALID_STATUSES.includes(status)) {
    params.push(status)
    where += ` AND status = $2`
  }
  params.push(limit, offset)

  const { rows } = await query(`
    SELECT * FROM orders ${where}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params)

  const countParams = status && VALID_STATUSES.includes(status) ? [req.user.id, status] : [req.user.id]
  const countRes = await query(`SELECT COUNT(*) FROM orders ${where.replace(/\$\d+/g, (m) => `$${countParams.findIndex((_, i) => `$${i+1}` === m) + 1 || m}`)}`, countParams)

  res.json({ success: true, data: rows, total: parseInt(countRes.rows[0]?.count || 0) })
})

// GET /api/orders/stats - Dashboard stats
router.get('/stats', async (req, res) => {
  const { rows: statusRows } = await query(`
    SELECT status, COUNT(*)::int as count, COALESCE(SUM(total_amount), 0)::float as revenue
    FROM orders WHERE user_id = $1
    GROUP BY status
  `, [req.user.id])

  const { rows: todayRows } = await query(`
    SELECT COUNT(*)::int as count, COALESCE(SUM(total_amount), 0)::float as revenue
    FROM orders
    WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE
  `, [req.user.id])

  const stats = {
    total: 0, pending: 0, confirmed: 0, packing: 0,
    courier: 0, delivered: 0, cancelled: 0, returned: 0,
    total_revenue: 0,
    today_orders: todayRows[0]?.count || 0,
    today_revenue: todayRows[0]?.revenue || 0,
  }

  for (const row of statusRows) {
    stats[row.status] = row.count
    stats.total += row.count
    stats.total_revenue += row.revenue
  }

  res.json({ success: true, data: stats })
})

// POST /api/orders - Create order
router.post('/', async (req, res) => {
  const { customer_name, customer_phone, customer_address, product_name,
    product_qty = 1, product_price, delivery_charge = 0,
    page_id, conversation_id, note } = req.body

  if (!customer_name || !customer_phone || !customer_address || !product_name || !product_price) {
    return res.status(400).json({ success: false, error: 'সব তথ্য পূরণ করুন' })
  }

  const total = (parseFloat(product_price) * product_qty) + parseFloat(delivery_charge || 0)

  const seqRes = await query("SELECT nextval('order_seq') as id")
  const orderNumber = `ORD-${new Date().getFullYear()}-${String(seqRes.rows[0].id).padStart(5, '0')}`

  const { rows } = await query(`
    INSERT INTO orders (order_number, user_id, page_id, conversation_id,
      customer_name, customer_phone, customer_address, product_name,
      product_qty, product_price, delivery_charge, total_amount, note)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `, [orderNumber, req.user.id, page_id, conversation_id,
    customer_name, customer_phone, customer_address, product_name,
    product_qty, product_price, delivery_charge, total, note])

  res.json({ success: true, data: rows[0] })
})

// PATCH /api/orders/:id - Update order
router.patch('/:id', async (req, res) => {
  const { status, courier_name, tracking_id, note } = req.body
  
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' })
  }

  const { rows } = await query(`
    UPDATE orders SET
      status = COALESCE($1, status),
      courier_name = COALESCE($2, courier_name),
      tracking_id = COALESCE($3, tracking_id),
      note = COALESCE($4, note),
      updated_at = NOW()
    WHERE id = $5 AND user_id = $6
    RETURNING *
  `, [status, courier_name, tracking_id, note, req.params.id, req.user.id])

  if (!rows.length) return res.status(404).json({ success: false, error: 'Order not found' })
  res.json({ success: true, data: rows[0] })
})

export default router
