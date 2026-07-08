-- 0026_nav_settings.sql — M21 PR3: quản trị hiển thị mục AppShell (Admin/PM bật/tắt
-- dashboard trong sidebar, khu "Hiển thị AppShell" ở /admin) + notification nav_enabled
-- khi Admin bật 1 mục cho PM. Xem docs/nang-cap/M21-appshell-ia.md.

CREATE TABLE IF NOT EXISTS nav_settings (
  id SERIAL PRIMARY KEY,
  node_key TEXT NOT NULL,                -- DashNode.id trong dashboardTree (vd 'dash.moi-truong')
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, -- NULL = áp toàn hệ thống (trước M22)
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- UNIQUE(node_key, project_id) thường KHÔNG dùng được ở đây: Postgres coi mỗi NULL
-- khác nhau nên vẫn cho nhiều dòng project_id=NULL cùng node_key. Tách 2 index riêng:
-- toàn hệ thống (project_id NULL) tối đa 1 dòng/node; theo dự án (M22) 1 dòng/node/dự án.
CREATE UNIQUE INDEX IF NOT EXISTS uq_nav_settings_global ON nav_settings(node_key)
  WHERE project_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_nav_settings_project ON nav_settings(node_key, project_id)
  WHERE project_id IS NOT NULL;

-- nav_enabled: thông báo MỘT LẦN khi Admin bật 1 mục cho PM — KHÁC 4 loại on-fetch
-- tự dọn (delayed/due_soon/comment/material_over), dedup theo node_key riêng.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS nav_node_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_nav ON notifications(user_id, type, nav_node_key)
  WHERE nav_node_key IS NOT NULL;
