import express from 'express'
import axios from 'axios'
import { query } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()
router.use(requireAuth)

// GET /api/courier/credentials - Get saved courier credentials
router.get('/credentials', async (req, res) => {
  const { rows } = await query(
    'SELECT id, provider, is_active FROM courier_credentials WHERE user_id = $1',
    [req.user.id]
  )
  res.json({ success: true, data: rows })
})

// POST /api/courier/credentials - Save courier API credentials
router.post('/credentials', async (req, res) => {
  const { provider, api_key, api_secret, client_id, client_secret } = req.body
  if (!['pathao', 'steadfast', 'redx'].includes(provider)) {
    return res.status(400).json({ success: false, error: 'Invalid provider' })
  }

  await query(`
    INSERT INTO courier_credentials (user_id, provider, api_key, api_secret, client_id, client_secret)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id, provider) DO UPDATE SET
      api_key = EXCLUDED.api_key,
      api_secret = EXCLUDED.api_secret,
      client_id = EXCLUDED.client_id,
      client_secret = EXCLUDED.client_secret,
      is_active = true
  `, [req.user.id, provider, api_key, api_secret, client_id, client_secret])

  res.json({ success: true })
})

// POST /api/courier/send - Send order to courier
router.post('/send', async (req, res) => {
  const { orderId, provider } = req.body

  try {
    // Get order
    const orderRes = await query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [orderId, req.user.id])
    if (!orderRes.rows.length) return res.status(404).json({ success: false, error: 'Order not found' })
    const order = orderRes.rows[0]

    // Get credentials
    const credRes = await query(
      'SELECT * FROM courier_credentials WHERE user_id = $1 AND provider = $2 AND is_active = true',
      [req.user.id, provider]
    )
    if (!credRes.rows.length) {
      return res.status(400).json({ success: false, error: 'Courier credentials not set' })
    }
    const cred = credRes.rows[0]

    let trackingId = null

    if (provider === 'steadfast') {
      const { data } = await axios.post('https://portal.packzy.com/api/v1/create_order', {
        invoice: order.order_number,
        recipient_name: order.customer_name,
        recipient_phone: order.customer_phone,
        recipient_address: order.customer_address,
        cod_amount: order.total_amount,
        note: order.note || '',
      }, {
        headers: {
          'Api-Key': cred.api_key,
          'Secret-Key': cred.api_secret,
          'Content-Type': 'application/json',
        }
      })
      trackingId = data.consignment?.tracking_code
    } else if (provider === 'pathao') {
      // Pathao requires OAuth token first
      const { data: tokenData } = await axios.post('https://api-hermes.pathao.com/aladdin/api/v1/issue-token', {
        client_id: cred.client_id,
        client_secret: cred.client_secret,
        grant_type: 'client_credentials',
      })
      const { data } = await axios.post('https://api-hermes.pathao.com/aladdin/api/v1/orders', {
        recipient_name: order.customer_name,
        recipient_phone: order.customer_phone,
        recipient_address: order.customer_address,
        amount_to_collect: order.total_amount,
      }, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      })
      trackingId = data.data?.consignment_id
    }

    // Update order
    await query(`
      UPDATE orders SET status = 'courier', courier_name = $1, tracking_id = $2, updated_at = NOW()
      WHERE id = $3
    `, [provider, trackingId, orderId])

    res.json({ success: true, data: { tracking_id: trackingId } })
  } catch (err) {
    console.error('Courier error:', err.response?.data || err.message)
    res.status(500).json({ success: false, error: 'Courier submission failed' })
  }
})

export default router
