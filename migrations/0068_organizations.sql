-- 0068_organizations.sql — M51 PR4: nền đa pháp nhân (chỉ nền, không UI hợp nhất).
-- Bảng organizations + cột projects.org_id (nullable). Dữ liệu cũ giữ org_id NULL =
-- tổ chức mặc định. Thêm thuần tuý (CREATE TABLE/ADD COLUMN nullable) → idempotent,
-- đi thẳng production, không cần staging. Hợp nhất tài chính đa pháp nhân / cây tổ
-- chức: ngoài phạm vi (YAGNI — xem PROGRESS.md).
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  tax_code TEXT
);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);
