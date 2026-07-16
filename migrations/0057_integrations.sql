-- M48 PR1 — Khung tích hợp chung (lib/integrations/): chuẩn hoá pattern đồng bộ từ
-- lib/material-sync.ts. Chưa gắn nhà cung cấp thật nào (khung trước, adapter sau).
--   integrations      — cấu hình 1 tích hợp cho 1 (provider, dự án); config JSONB tự do.
--   integration_runs  — nhật ký từng lần chạy đồng bộ (running/ok/error + stats).
--   sync_cursors      — con trỏ tiến của từng entity (last_local_id) để chỉ đẩy dòng mới.
--   remote_links      — ánh xạ thực thể local ↔ khoá bên hệ ngoài (idempotent theo PK).
-- Khoá chống chạy chồng tái dùng bảng sync_locks (M18), không tạo bảng khoá riêng.

CREATE TABLE IF NOT EXISTS integrations (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  project_id INT REFERENCES projects(id),
  -- KHÔNG chứa secret (API key/token) — secret luôn đọc từ biến môi trường
  -- (pattern lib/google-sheets.ts). config chỉ giữ tham số không nhạy cảm.
  config JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(provider, project_id)
);

CREATE TABLE IF NOT EXISTS integration_runs (
  id SERIAL PRIMARY KEY,
  integration_id INT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  stats JSONB,
  error TEXT
);

CREATE TABLE IF NOT EXISTS sync_cursors (
  integration_id INT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  last_local_id BIGINT,
  last_remote_key TEXT,
  last_at TIMESTAMPTZ,
  PRIMARY KEY(integration_id, entity)
);

CREATE TABLE IF NOT EXISTS remote_links (
  entity_type TEXT NOT NULL,
  entity_id BIGINT NOT NULL,
  integration_id INT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  remote_key TEXT NOT NULL,
  remote_status TEXT,
  synced_at TIMESTAMPTZ,
  PRIMARY KEY(entity_type, entity_id, integration_id)
);
