import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { rateLimit } from 'express-rate-limit'

import authRoutes from './routes/auth.js'
import pagesRoutes from './routes/pages.js'
import messagesRoutes from './routes/messages.js'
import ordersRoutes from './routes/orders.js'
import webhookRoutes from './routes/webhook.js'
import subscriptionRoutes from './routes/subscription.js'
import adminRoutes from './routes/admin.js'
import courierRoutes from './routes/courier.js'
import aiRoutes from './routes/ai.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Security middleware
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || true,
  credentials: true,
}))
app.use(express.json({ limit: '5mb' }))
app.use(cookieParser())

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
})
app.use('/api/', limiter)

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }))

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/pages', pagesRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/webhook', webhookRoutes)
app.use('/api/subscription', subscriptionRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/courier', courierRoutes)
app.use('/api/ai', aiRoutes)

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  })
})

app.listen(PORT, () => {
  console.log(`✅ F-Commerce Backend running on port ${PORT}`)
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`)
})
