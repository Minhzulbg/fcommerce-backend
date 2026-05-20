import express from 'express'
import { query } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()
router.use(requireAuth)

// GET /api/ai/status/:pageId - Check AI status for a page
router.get('/status/:pageId', async (req, res) => {
  const { rows } = await query(
    'SELECT ai_enabled, ai_system_prompt, ai_schedule_start, ai_schedule_end FROM fb_pages WHERE id = $1 AND user_id = $2',
    [req.params.pageId, req.user.id]
  )
  res.json({ success: true, data: rows[0] || null })
})

// POST /api/ai/pause - Manually pause AI for a conversation
router.post('/pause', async (req, res) => {
  const { conversationId, minutes = 10 } = req.body
  await query(`
    INSERT INTO ai_pauses (conversation_id, paused_until)
    VALUES ($1, NOW() + INTERVAL '${parseInt(minutes)} minutes')
    ON CONFLICT (conversation_id) DO UPDATE SET paused_until = EXCLUDED.paused_until
  `, [conversationId])
  res.json({ success: true })
})

export default router
