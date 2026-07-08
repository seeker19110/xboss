-- M22 (tiếp) — site_diaries UNIQUE(diary_date) đơn (từ migration 0011) chặn 2 dự án
-- cùng ghi nhật ký 1 ngày sau khi thêm project_id ở migration 0027. Đổi thành
-- UNIQUE(diary_date, project_id) — mỗi dự án có nhật ký riêng theo ngày.
ALTER TABLE site_diaries DROP CONSTRAINT IF EXISTS site_diaries_diary_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_diaries_date_project
  ON site_diaries(diary_date, project_id);
