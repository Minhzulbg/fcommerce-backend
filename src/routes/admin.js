import express from 'express'
import { query } from '../db/index.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'

const router = express.Router()
router.use(requireAuth, requireAdmin)

// GET /api/admin/stats - Overall platform stats
router.get('/stats', async (req, res) => {
  const { rows: users } = await query(`
    SELECT
      COUNT(*)::int as total_users,
      COUNT(*) FILTER (WHERE subscription_status = 'active')::int as active_users,
      COUNT(*) FILTER (WHERE subscription_status = 'trial')::int as trial_users,
      COUNT(*) FILTER (WHERE subscription_status = 'expired')::int as expired_users
    FROM users
  `)

  const { rows: revenue } = await query(`
    SELECT
      COALESCE(SUM(amount), 0)::float as total_revenue,
      COALESCE(SUM(amount) FILTER (WHERE DATE(created_at) = CURRENT_DATE), 0)::float as today_revenue,
      COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)), 0)::float as month_revenue
    FROM subscriptions WHERE status = 'paid'
  `)

  const { rows: orders } = await query('SELECT COUNT(*)::int as total_orders FROM orders')

  res.json({
    success: true,
    data: { ...users[0], ...revenue[0], ...orders[0] }
  })
})

// GET /api/admin/users - List all users
router.get('/users', async (req, res) => {
  const { rows } = await query(`
    SELECT u.id, u.name, u.email, u.avatar, u.subscription_status, u.subscription_plan,
      u.subscription_expires_at, u.trial_ends_at, u.created_at,
      (SELECT COUNT(*)::int FROM fb_pages WHERE user_id = u.id) as pages_count,
      (SELECT COUNT(*)::int FROM orders WHERE user_id = u.id) as orders_count
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT 100
  `)
  res.json({ success: true, data: rows })
})

// PATCH /api/admin/users/:id - Update user subscription manually
router.patch('/users/:id', async (req, res) => {
  const { subscription_status, subscription_plan, days } = req.body
  if (days) {
    await query(`
      UPDATE users SET
        subscription_status = COALESCE($1, subscription_status),
        subscription_plan = COALESCE($2, subscription_plan),
        subscription_expires_at = NOW() + INTERVAL '${parseInt(days)} days'
      WHERE id = $3
    `, [subscription_status, subscription_plan, req.params.id])
  } else {
    await query(`
      UPDATE users SET
        subscription_status = COALESCE($1, subscription_status),
        subscription_plan = COALESCE($2, subscription_plan)
      WHERE id = $3
    `, [subscription_status, subscription_plan, req.params.id])
  }
  res.json({ success: true })
})

// GET /api/admin/subscriptions - Recent payments
router.get('/subscriptions', async (req, res) => {
  const { rows } = await query(`
    SELECT s.*, u.name as user_name, u.email as user_email
    FROM subscriptions s
    JOIN users u ON s.user_id = u.id
    ORDER BY s.created_at DESC LIMIT 100
  `)
  res.json({ success: true, data: rows })
})

export default router
