-- 0054_saved_reports.sql — M47 PR3: báo cáo lưu được (saved_reports).
-- Người dùng lưu cấu hình 1 báo cáo (nguồn trong whitelist tĩnh lib/reports.ts +
-- bộ lọc/sắp xếp) để chạy lại/xuất Excel bất cứ lúc nào — KHÔNG lưu SQL tự do, chỉ
-- lưu `source` (khoá nguồn) + `config` JSONB đã validate theo schema từng nguồn.
-- Xem docs/nang-cap/M47-evm-bi.md mục PR3. Thêm thuần (CREATE TABLE) — đi thẳng prod.

CREATE TABLE IF NOT EXISTS saved_reports (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,   -- NULL = không gắn dự án (danh mục chung)
  owner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source TEXT NOT NULL,        -- khoá nguồn trong whitelist lib/reports.ts (vd 'late_tasks')
  config JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { filters?, sort? } đã validate theo nguồn
  shared BOOLEAN NOT NULL DEFAULT FALSE,      -- true → mọi vai trò trong dự án xem được
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Liệt kê báo cáo theo dự án + của tôi/được chia sẻ là truy vấn chính.
CREATE INDEX IF NOT EXISTS ix_saved_reports_project ON saved_reports(project_id);
CREATE INDEX IF NOT EXISTS ix_saved_reports_owner ON saved_reports(owner_id);
