import express from 'express'
import axios from 'axios'
import { query } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

const PLANS = {
  basic:    { name: 'বেসিক', amount: 499, days: 30 },
  pro:      { name: 'প্রো', amount: 1299, days: 30 },
  ai_addon: { name: 'AI অ্যাড-অন', amount: 800, days: 30 },
}

// GET /api/subscription/plans - List plans
router.get('/plans', (req, res) => {
  res.json({ success: true, data: PLANS })
})

router.use(requireAuth)

// GET /api/subscription/status - Current subscription
router.get('/status', async (req, res) => {
  const { rows } = await query(
    'SELECT subscription_status, subscription_plan, subscription_expires_at, trial_ends_at FROM users WHERE id = $1',
    [req.user.id]
  )
  res.json({ success: true, data: rows[0] })
})

// POST /api/subscription/initiate - Start payment (SSLCommerz)
router.post('/initiate', async (req, res) => {
  const { plan } = req.body
  if (!PLANS[plan]) return res.status(400).json({ success: false, error: 'Invalid plan' })

  const planData = PLANS[plan]
  const tranId = `SUB-${Date.now()}-${req.user.id.slice(0, 8)}`

  try {
    // Create pending subscription
    await query(`
      INSERT INTO subscriptions (user_id, plan, amount, payment_gateway, transaction_id, status)
      VALUES ($1, $2, $3, 'sslcommerz', $4, 'pending')
    `, [req.user.id, plan, planData.amount, tranId])

    // SSLCommerz payment session
    const sslData = new URLSearchParams({
      store_id: process.env.SSLCOMMERZ_STORE_ID,
      store_passwd: process.env.SSLCOMMERZ_STORE_PASSWORD,
      total_amount: planData.amount,
      currency: 'BDT',
      tran_id: tranId,
      success_url: `${process.env.BACKEND_URL}/api/subscription/success`,
      fail_url: `${process.env.FRONTEND_URL}/dashboard/settings?payment=failed`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard/settings?payment=cancelled`,
      cus_name: req.user.name,
      cus_email: req.user.email || 'user@fcommerce.com',
      cus_phone: '01700000000',
      product_name: planData.name,
      product_category: 'subscription',
      product_profile: 'general',
      shipping_method: 'NO',
    })

    const sslUrl = process.env.SSLCOMMERZ_IS_LIVE === 'true'
      ? 'https://securepay.sslcommerz.com/gwprocess/v4/api.php'
      : 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php'

    const { data } = await axios.post(sslUrl, sslData)
    if (data.GatewayPageURL) {
      res.json({ success: true, payment_url: data.GatewayPageURL })
    } else {
      res.status(500).json({ success: false, error: 'Payment init failed' })
    }
  } catch (err) {
    console.error('Subscription error:', err.message)
    res.status(500).json({ success: false, error: 'Payment error' })
  }
})

// POST /api/subscription/success - Payment callback
router.post('/success', express.urlencoded({ extended: true }), async (req, res) => {
  const { tran_id, status } = req.body
  if (status === 'VALID' || status === 'VALIDATED') {
    const subRes = await query('SELECT * FROM subscriptions WHERE transaction_id = $1', [tran_id])
    if (subRes.rows.length) {
      const sub = subRes.rows[0]
      const planData = PLANS[sub.plan]
      await query(`UPDATE subscriptions SET status = 'paid', starts_at = NOW(), expires_at = NOW() + INTERVAL '${planData.days} days' WHERE id = $1`, [sub.id])
      await query(`UPDATE users SET subscription_status = 'active', subscription_plan = $1, subscription_expires_at = NOW() + INTERVAL '${planData.days} days' WHERE id = $2`, [sub.plan, sub.user_id])
    }
  }
  res.redirect(`${process.env.FRONTEND_URL}/dashboard/settings?payment=success`)
})

export default router
