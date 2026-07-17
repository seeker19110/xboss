-- M52 PR1 — Danh mục mềm (code_lists): enum-mềm cấu hình được thay vì hard-code trong lib/*.
-- Append-only, idempotent. Seed từ hằng số hiện có (chỉ delay_reason — xem lib/delay.ts).

CREATE TABLE IF NOT EXISTS code_lists (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL,          -- 'delay_reason' | 'document_kind' | 'cost_group' | 'unit' | ...
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  meta JSONB NOT NULL DEFAULT '{}',
  UNIQUE(domain, code)
);

-- Seed danh mục nguyên nhân trễ (khớp DELAY_REASON_LABEL trong lib/delay.ts).
INSERT INTO code_lists (domain, code, label, sort) VALUES
  ('delay_reason', 'thieu_vat_tu',   'Thiếu vật tư',  0),
  ('delay_reason', 'thieu_nhan_luc', 'Thiếu nhân lực', 1),
  ('delay_reason', 'cho_mat_bang',   'Chờ mặt bằng',  2),
  ('delay_reason', 'doi_thiet_ke',   'Đổi thiết kế',  3),
  ('delay_reason', 'thoi_tiet',      'Thời tiết',     4),
  ('delay_reason', 'khac',           'Khác',          5)
ON CONFLICT (domain, code) DO NOTHING;
