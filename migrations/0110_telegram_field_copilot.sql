-- Migration 0110: Telegram 2-Way Field Gateway & Voice Copilot (M76)
-- Liên kết tài khoản Telegram của Kỹ sư/Chỉ huy trưởng và ghi nhật ký tin nhắn/ảnh/giọng nói hiện trường

CREATE TABLE IF NOT EXISTS telegram_user_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_chat_id BIGINT UNIQUE,
  telegram_username TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  otp_code TEXT,
  otp_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_bot_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  chat_id BIGINT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'photo', 'voice', 'document', 'location')),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_text TEXT,
  parsed_intent TEXT,
  action_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'unrecognized', 'failed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_user_chat
  ON telegram_user_bindings (telegram_chat_id, is_verified);

CREATE INDEX IF NOT EXISTS idx_telegram_logs_proj
  ON telegram_bot_message_logs (project_id, chat_id, created_at DESC);
