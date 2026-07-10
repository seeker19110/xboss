-- 0028_design_changes.sql — M32: Quản lý thay đổi thiết kế (Design Change). Quy trình
-- tiếp nhận yêu cầu → đánh giá tác động (kỹ thuật/chi phí/tiến độ) → trình duyệt → cập
-- nhật bản vẽ liên quan. Xem docs/nang-cap/M32-thiet-ke-thay-doi.md. Biện pháp thi công
-- (drawings.kind='method') đã có từ M8 — KHÔNG làm lại ở đây.
CREATE TABLE IF NOT EXISTS design_changes (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  code TEXT,                                                 -- DC-0001 (nextSeqCode, pad 4)
  title TEXT NOT NULL,
  discipline_id INTEGER REFERENCES disciplines(id),
  drawing_id INTEGER REFERENCES drawings(id),                -- bản vẽ liên quan (nullable — có thể chưa gắn bản vẽ cụ thể)
  requested_by_note TEXT,                                    -- ai/đơn vị nào yêu cầu (CĐT/TVGS/nhà thầu) — nhập tay, không FK cứng
  reason TEXT NOT NULL,                                       -- lý do thay đổi
  impact_technical TEXT,
  impact_cost TEXT,                                           -- mô tả định tính; số tiền thật nối qua VO (variation_orders.design_change_id) nếu có
  impact_schedule TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'assessing', 'approved', 'rejected', 'drawing_updated')),
  decision_note TEXT,
  decided_by INTEGER REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_changes_drawing ON design_changes(drawing_id);
CREATE INDEX IF NOT EXISTS idx_design_changes_project ON design_changes(project_id);

-- Nối VO (M6) khi thay đổi thiết kế phát sinh chi phí — tuỳ chọn, không bắt buộc mọi DC đều có VO.
ALTER TABLE variation_orders ADD COLUMN IF NOT EXISTS design_change_id INTEGER REFERENCES design_changes(id);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS design_change_id INTEGER REFERENCES design_changes(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_design_change ON notifications(user_id, type, design_change_id)
  WHERE design_change_id IS NOT NULL;
