import Anthropic from '@anthropic-ai/sdk'
import axios from 'axios'
import { query } from '../db/index.js'

export async function generateAIReply(conversationId, page, customerId, customerMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return

  try {
    const anthropic = new Anthropic({ apiKey })

    // Get conversation history (last 10)
    const { rows } = await query(`
      SELECT sender_type, content FROM messages
      WHERE conversation_id = $1
      ORDER BY sent_at DESC LIMIT 10
    `, [conversationId])

    const history = rows.reverse().map(m => ({
      role: m.sender_type === 'customer' ? 'user' : 'assistant',
      content: m.content,
    }))

    const systemPrompt = page.ai_system_prompt || `আপনি একজন বিনয়ী কাস্টমার সার্ভিস প্রতিনিধি।
বাংলায় সংক্ষেপে উত্তর দিন। অর্ডার নিতে হলে নাম, ফোন নাম্বার এবং ঠিকানা চান।`

    // Generate reply
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: history.length ? history : [{ role: 'user', content: customerMessage }],
    })

    const replyText = response.content[0]?.text
    if (!replyText) return

    // Send via Facebook
    const fbRes = await axios.post(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${page.access_token}`,
      {
        recipient: { id: customerId },
        message: { text: replyText },
        messaging_type: 'RESPONSE',
      }
    )

    // Save AI message
    await query(`
      INSERT INTO messages (conversation_id, fb_message_id, sender_type, content)
      VALUES ($1, $2, 'ai', $3)
    `, [conversationId, fbRes.data.message_id, replyText])

  } catch (err) {
    console.error('AI reply error:', err.response?.data || err.message)
  }
}
