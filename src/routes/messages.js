import express from 'express'
import axios from 'axios'
import { query } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()
router.use(requireAuth)

// GET /api/messages/conversations - List conversations
router.get('/conversations', async (req, res) => {
  const { page_id } = req.query
  const params = [req.user.id]
  let where = 'WHERE p.user_id = $1'
  if (page_id) {
    params.push(page_id)
    where += ` AND p.page_id = $2`
  }

  const { rows } = await query(`
    SELECT c.*, p.page_name, p.page_avatar
    FROM conversations c
    JOIN fb_pages p ON c.page_id = p.id
    ${where}
    ORDER BY c.last_message_at DESC NULLS LAST
    LIMIT 50
  `, params)
  res.json({ success: true, data: rows })
})

// GET /api/messages/conversations/:id - Messages in a conversation
router.get('/conversations/:id', async (req, res) => {
  // Verify ownership
  const owner = await query(`
    SELECT c.id FROM conversations c
    JOIN fb_pages p ON c.page_id = p.id
    WHERE c.id = $1 AND p.user_id = $2
  `, [req.params.id, req.user.id])

  if (!owner.rows.length) return res.status(404).json({ success: false })

  const { rows } = await query(
    'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sent_at ASC LIMIT 100',
    [req.params.id]
  )
  
  // Mark as read
  await query('UPDATE conversations SET unread_count = 0 WHERE id = $1', [req.params.id])

  res.json({ success: true, data: rows })
})

// POST /api/messages/reply - Send reply to customer
router.post('/reply', async (req, res) => {
  const { conversationId, message } = req.body
  if (!conversationId || !message?.trim()) {
    return res.status(400).json({ success: false, error: 'Missing fields' })
  }

  try {
    // Get conversation with page info, verify ownership
    const { rows } = await query(`
      SELECT c.customer_fb_id, c.id as conv_id, p.access_token, p.ai_enabled
      FROM conversations c
      JOIN fb_pages p ON c.page_id = p.id
      WHERE c.id = $1 AND p.user_id = $2
    `, [conversationId, req.user.id])

    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' })
    const convo = rows[0]

    // Send via Facebook
    const fbRes = await axios.post(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${convo.access_token}`,
      {
        recipient: { id: convo.customer_fb_id },
        message: { text: message },
        messaging_type: 'RESPONSE',
      }
    )

    // Save message
    await query(`
      INSERT INTO messages (conversation_id, fb_message_id, sender_type, content)
      VALUES ($1, $2, 'agent', $3)
    `, [conversationId, fbRes.data.message_id, message])

    // Pause AI for 10 minutes if enabled
    if (convo.ai_enabled) {
      await query(`
        INSERT INTO ai_pauses (conversation_id, paused_until)
        VALUES ($1, NOW() + INTERVAL '10 minutes')
        ON CONFLICT (conversation_id) DO UPDATE SET paused_until = EXCLUDED.paused_until
      `, [conversationId])
    }

    res.json({ success: true, data: { fb_message_id: fbRes.data.message_id } })
  } catch (err) {
    console.error('Reply error:', err.response?.data || err.message)
    res.status(500).json({ success: false, error: 'Failed to send' })
  }
})

export default router
