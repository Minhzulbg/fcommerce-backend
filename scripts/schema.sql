-- F-Commerce Backend Database Schema
-- PostgreSQL

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facebook_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  avatar TEXT,
  access_token TEXT,
  phone VARCHAR(20),
  role VARCHAR(20) DEFAULT 'user' CHECK(role IN ('user', 'admin')),
  subscription_status VARCHAR(20) DEFAULT 'trial' CHECK(subscription_status IN ('trial', 'active', 'expired', 'cancelled')),
  subscription_plan VARCHAR(20),
  subscription_expires_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Facebook Pages
CREATE TABLE IF NOT EXISTS fb_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id VARCHAR(100) NOT NULL,
  page_name VARCHAR(255) NOT NULL,
  page_avatar TEXT,
  access_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  ai_enabled BOOLEAN DEFAULT false,
  ai_system_prompt TEXT,
  ai_schedule_start TIME,
  ai_schedule_end TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, page_id)
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID NOT NULL REFERENCES fb_pages(id) ON DELETE CASCADE,
  customer_fb_id VARCHAR(100) NOT NULL,
  customer_name VARCHAR(255),
  customer_avatar TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page_id, customer_fb_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  fb_message_id VARCHAR(100) UNIQUE,
  sender_type VARCHAR(20) NOT NULL CHECK(sender_type IN ('customer', 'agent', 'ai')),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders
CREATE SEQUENCE IF NOT EXISTS order_seq START 1;
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  page_id UUID REFERENCES fb_pages(id),
  conversation_id UUID REFERENCES conversations(id),
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_address TEXT NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_qty INTEGER DEFAULT 1,
  product_price DECIMAL(10, 2) NOT NULL,
  delivery_charge DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending','confirmed','packing','courier','delivered','cancelled','returned')),
  courier_name VARCHAR(50),
  tracking_id VARCHAR(100),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions / Payments
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  plan VARCHAR(20) NOT NULL CHECK(plan IN ('basic','pro','ai_addon')),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'BDT',
  payment_gateway VARCHAR(50),
  transaction_id VARCHAR(100) UNIQUE,
  status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','refunded')),
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI pause tracker
CREATE TABLE IF NOT EXISTS ai_pauses (
  conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  paused_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Courier credentials (per user)
CREATE TABLE IF NOT EXISTS courier_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK(provider IN ('pathao','steadfast','redx')),
  api_key TEXT,
  api_secret TEXT,
  client_id TEXT,
  client_secret TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_page ON conversations(page_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_fb_pages_user ON fb_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
