import express from 'express'
import axios from 'axios'
import { query } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()
router.use(requireAuth)

// GET /api/pages - List user's connected pages
router.get('/', async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM fb_pages WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
    [req.user.id]
  )
  res.json({ success: true, data: rows })
})

// GET /api/pages/available - List FB pages user can connect
router.get('/available', async (req, res) => {
  try {
    const { rows } = await query('SELECT access_token FROM users WHERE id = $1', [req.user.id])
    const userToken = rows[0]?.access_token
    if (!userToken) return res.json({ success: true, data: [] })

    const { data } = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
      params: { fields: 'id,name,picture,access_token', access_token: userToken }
    })
    res.json({ success: true, data: data.data || [] })
  } catch (err) {
    console.error('Available pages error:', err.message)
    res.json({ success: false, data: [] })
  }
})

// POST /api/pages - Connect a page
router.post('/', async (req, res) => {
  const { page_id, page_name, page_avatar, access_token } = req.body
  if (!page_id || !page_name || !access_token) {
    return res.status(400).json({ success: false, error: 'Missing required fields' })
  }

  try {
    await query(`
      INSERT INTO fb_pages (user_id, page_id, page_name, page_avatar, access_token)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, page_id) DO UPDATE SET
        page_name = EXCLUDED.page_name,
        access_token = EXCLUDED.access_token,
        is_active = true
    `, [req.user.id, page_id, page_name, page_avatar, access_token])

    // Subscribe to webhook
    try {
      await axios.post(`https://graph.facebook.com/v19.0/${page_id}/subscribed_apps`, null, {
        params: {
          subscribed_fields: 'messages,messaging_postbacks',
          access_token,
        }
      })
    } catch (err) {
      console.error('Webhook subscription failed:', err.response?.data || err.message)
    }

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// PATCH /api/pages/:id/ai - Toggle AI for a page
router.patch('/:id/ai', async (req, res) => {
  const { ai_enabled, ai_system_prompt, ai_schedule_start, ai_schedule_end } = req.body
  await query(`
    UPDATE fb_pages
    SET ai_enabled = COALESCE($1, ai_enabled),
        ai_system_prompt = COALESCE($2, ai_system_prompt),
        ai_schedule_start = COALESCE($3, ai_schedule_start),
        ai_schedule_end = COALESCE($4, ai_schedule_end)
    WHERE id = $5 AND user_id = $6
  `, [ai_enabled, ai_system_prompt, ai_schedule_start, ai_schedule_end, req.params.id, req.user.id])
  res.json({ success: true })
})

// DELETE /api/pages/:id - Disconnect page
router.delete('/:id', async (req, res) => {
  await query('UPDATE fb_pages SET is_active = false WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id])
  res.json({ success: true })
})

export default router
