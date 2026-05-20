import express from 'express'
import axios from 'axios'
import { query } from '../db/index.js'
import { generateAIReply } from '../services/aiService.js'

const router = express.Router()

// GET /api/webhook/facebook - Webhook verification
router.get('/facebook', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified')
    return res.status(200).send(challenge)
  }
  res.status(403).send('Forbidden')
})

// POST /api/webhook/facebook - Receive messages
router.post('/facebook', async (req, res) => {
  res.status(200).send('EVENT_RECEIVED') // Respond immediately

  if (req.body.object !== 'page') return

  for (const entry of req.body.entry || []) {
    const pageId = entry.id
    for (const event of entry.messaging || []) {
      if (!event.message || event.message.is_echo) continue
      await processIncomingMessage(pageId, event)
    }
  }
})

async function processIncomingMessage(pageId, event) {
  const customerId = event.sender.id
  const messageText = event.message.text || '[Media]'
  const fbMessageId = event.message.mid

  try {
    // Find page
    const pageRes = await query(
      'SELECT * FROM fb_pages WHERE page_id = $1 AND is_active = true',
      [pageId]
    )
    if (!pageRes.rows.length) return
    const page = pageRes.rows[0]

    // Get customer info
    let customerName = null
    let customerAvatar = null
    try {
      const { data } = await axios.get(`https://graph.facebook.com/${customerId}`, {
        params: { fields: 'name,profile_pic', access_token: page.access_token }
      })
      customerName = data.name
      customerAvatar = data.profile_pic
    } catch {}

    // Upsert conversation
    const convRes = await query(`
      INSERT INTO conversations (page_id, customer_fb_id, customer_name, customer_avatar, last_message, last_message_at, unread_count)
      VALUES ($1, $2, $3, $4, $5, NOW(), 1)
      ON CONFLICT (page_id, customer_fb_id) DO UPDATE SET
        last_message = EXCLUDED.last_message,
        last_message_at = NOW(),
        customer_name = COALESCE(conversations.customer_name, EXCLUDED.customer_name),
        unread_count = conversations.unread_count + 1
      RETURNING id
    `, [page.id, customerId, customerName, customerAvatar, messageText])

    const conversationId = convRes.rows[0].id

    // Save message (ignore duplicates)
    await query(`
      INSERT INTO messages (conversation_id, fb_message_id, sender_type, content)
      VALUES ($1, $2, 'customer', $3)
      ON CONFLICT (fb_message_id) DO NOTHING
    `, [conversationId, fbMessageId, messageText])

    // Trigger AI if enabled
    if (page.ai_enabled) {
      const pauseRes = await query(
        'SELECT 1 FROM ai_pauses WHERE conversation_id = $1 AND paused_until > NOW()',
        [conversationId]
      )
      if (!pauseRes.rows.length) {
        generateAIReply(conversationId, page, customerId, messageText).catch(console.error)
      }
    }
  } catch (err) {
    console.error('Message processing error:', err.message)
  }
}

export default router
