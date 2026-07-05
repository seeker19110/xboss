-- 0007_cost.sql — M2: kiểm soát chi phí (ngân sách vs cam kết vs thực chi) + cảnh báo
-- vượt chi phí. Xem docs/nang-cap/M02-chi-phi.md. Không cần bảng lớn — chủ yếu query
-- tổng hợp trong lib/cost.ts; chỉ thêm ngưỡng cảnh báo + cột dedup notification.

CREATE TABLE IF NOT EXISTS cost_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  warn_pct NUMERIC(5,2) NOT NULL DEFAULT 90,
  over_pct NUMERIC(5,2) NOT NULL DEFAULT 100
);
INSERT INTO cost_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Dedup cảnh báo cost_over theo hệ (mã discipline) — cùng cơ chế partial unique index
-- với material_over (notifications.is_read là INTEGER, không có read_at).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS cost_group TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_cost ON notifications(user_id, type, cost_group)
  WHERE cost_group IS NOT NULL;

-- Backfill dần payment_bills.responsible (TEXT tự do) sang FK suppliers khi tên khớp,
-- phục vụ drill-down công nợ ở trang /costs — giữ nguyên cột responsible để hiển thị.
ALTER TABLE payment_bills ADD COLUMN IF NOT EXISTS responsible_supplier_id INTEGER REFERENCES suppliers(id);
UPDATE payment_bills pb SET responsible_supplier_id = s.id
  FROM suppliers s
 WHERE pb.responsible_supplier_id IS NULL
   AND lower(trim(pb.responsible)) = lower(trim(s.name));
CREATE INDEX IF NOT EXISTS idx_payment_bills_resp_supplier ON payment_bills(responsible_supplier_id);
