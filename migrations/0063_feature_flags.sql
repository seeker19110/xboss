-- M52 PR4 — Cờ tính năng theo dự án (feature_flags)
-- Mặc định KHÔNG có dòng = module BẬT (không đổi hành vi hiện tại khi bảng rỗng).
-- Ma trận module (module_key, xem lib/modules.ts::MODULES) × dự án (project_id).
-- nav_settings (migrations/0026) giữ nguyên, đánh dấu deprecated trong lib/nav-settings.ts
-- — feature_flags là cơ chế mới ở granularity module (thô hơn, có enforcement API thật).

CREATE TABLE IF NOT EXISTS feature_flags (
  module_key TEXT NOT NULL,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (module_key, project_id)
);
