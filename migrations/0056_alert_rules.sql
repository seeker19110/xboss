-- 0056_alert_rules.sql — M47 PR4: cảnh báo cấu hình được (alert_rules).
-- Thay 2 ngưỡng hard-code trong /api/notifications (hạn sắp đến, vật tư vượt định mức)
-- + SPI/CPI (cron daily-report) bằng bảng cấu hình. Rule mức dự án không có → dùng
-- default cũ y hệt (lib/alerts.ts::ALERT_METRICS) — không đổi hành vi mặc định.
-- Xem docs/nang-cap/M47-evm-bi.md mục PR4. Thêm thuần (CREATE TABLE/INDEX) — đi thẳng prod.

CREATE TABLE IF NOT EXISTS alert_rules (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = áp mọi dự án
  metric TEXT NOT NULL,       -- whitelist tĩnh trong lib/alerts.ts (ALERT_METRICS)
  operator TEXT NOT NULL,     -- 'lt' | 'gt' (nhỏ hơn/lớn hơn ngưỡng thì cảnh báo)
  threshold NUMERIC NOT NULL,
  channel TEXT NOT NULL DEFAULT 'notification',  -- hiện tại chỉ 'notification' — chỗ mở rộng sau
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tối đa 1 rule active mỗi (metric, dự án) — COALESCE gộp NULL về 0 để index nhất quán
-- (cùng pattern ux_flow_active trong migrations/0053_approvals.sql).
CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_rule_active
  ON alert_rules(metric, COALESCE(project_id, 0)) WHERE active;
