-- 0135_api_tokens.sql — M99 PR2: token API cho plugin AutoCAD (ghép thiết bị).
-- Chỉ CREATE TABLE/ADD COLUMN thuần túy (không đụng dữ liệu hiện có).

-- Token thiết bị: chỉ lưu HASH (sha256 hex), token thô hiện đúng 1 lần lúc phát.
CREATE TABLE IF NOT EXISTS api_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,      -- chỉ lưu hash, không lưu token gốc
  scopes TEXT NOT NULL DEFAULT 'cad',
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);

-- Phiên ghép thiết bị (device pairing): plugin xin mã → người dùng duyệt trên web →
-- plugin poll bằng secret để NHẬN token (token chỉ sinh tại thời điểm poll sau khi
-- confirmed — không bao giờ lưu token thô trong bảng này).
CREATE TABLE IF NOT EXISTS device_pairings (
  id SERIAL PRIMARY KEY,
  device_code TEXT NOT NULL UNIQUE,     -- mã ngắn hiện cho người dùng gõ trên web
  secret_hash TEXT NOT NULL UNIQUE,     -- sha256 của secret chỉ plugin giữ (chống đoán mã)
  device_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | consumed
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- gán khi confirmed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ
);

-- Cột nhận revision từ plugin (M99 §11 — PR5 dùng, khai sẵn theo khối DDL PR2 của spec).
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS rule_pack_version TEXT;
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS standardize_report JSONB;
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS source_tool TEXT; -- 'plugin' | 'server'
