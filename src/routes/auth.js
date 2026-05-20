import express from 'express'
import jwt from 'jsonwebtoken'
import axios from 'axios'
import { query } from '../db/index.js'

const router = express.Router()

// GET /api/auth/facebook/url - Get FB login URL
router.get('/facebook/url', (req, res) => {
  const appId = process.env.FACEBOOK_APP_ID
  const redirectUri = `${process.env.BACKEND_URL}/api/auth/facebook/callback`
  const scope = 'email,pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata'
  const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`
  res.json({ success: true, url })
})

// GET /api/auth/facebook/callback - FB OAuth callback
router.get('/facebook/callback', async (req, res) => {
  const { code } = req.query
  const frontendUrl = process.env.FRONTEND_URL
  if (!code) return res.redirect(`${frontendUrl}/login?error=no_code`)

  try {
    const redirectUri = `${process.env.BACKEND_URL}/api/auth/facebook/callback`
    
    // Exchange code for access token
    const { data: tokenData } = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: redirectUri,
        code,
      }
    })

    // Get user info
    const { data: userData } = await axios.get('https://graph.facebook.com/me', {
      params: {
        fields: 'id,name,email,picture.width(200)',
        access_token: tokenData.access_token,
      }
    })

    // Upsert user
    const result = await query(`
      INSERT INTO users (facebook_id, name, email, avatar, access_token)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (facebook_id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        avatar = EXCLUDED.avatar,
        access_token = EXCLUDED.access_token,
        updated_at = NOW()
      RETURNING *
    `, [userData.id, userData.name, userData.email, userData.picture?.data?.url, tokenData.access_token])

    const user = result.rows[0]

    // Create JWT
    const token = jwt.sign({
      id: user.id,
      facebook_id: user.facebook_id,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
    }, process.env.JWT_SECRET, { expiresIn: '30d' })

    // Set cookie and redirect
    res.cookie('fcom_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    })

    res.redirect(`${frontendUrl}/dashboard`)
  } catch (err) {
    console.error('Auth error:', err.response?.data || err.message)
    res.redirect(`${frontendUrl}/login?error=auth_failed`)
  }
})

// GET /api/auth/me - Current user
router.get('/me', async (req, res) => {
  const token = req.cookies?.fcom_session
  if (!token) return res.json({ success: false, user: null })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const result = await query('SELECT id, name, email, avatar, role, subscription_status, subscription_expires_at, trial_ends_at FROM users WHERE id = $1', [decoded.id])
    res.json({ success: true, user: result.rows[0] || null })
  } catch {
    res.json({ success: false, user: null })
  }
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('fcom_session')
  res.json({ success: true })
})

export default router
