-- M52 PR2 — Custom fields (trường tuỳ biến cấu hình được cho 4 entity)
-- Định nghĩa field trong custom_field_defs; giá trị lưu cột JSONB `custom` trên
-- từng bảng entity. Merge shallow khi PATCH (không tạo route riêng cho custom).

CREATE TABLE IF NOT EXISTS custom_field_defs (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = mọi dự án
  entity_type TEXT NOT NULL,     -- 'task' | 'contract' | 'material' | 'work_package'
  key TEXT NOT NULL,             -- snake_case, immutable sau khi tạo
  label TEXT NOT NULL,
  type TEXT NOT NULL,            -- 'text' | 'number' | 'date' | 'select' | 'checkbox'
  options JSONB,                 -- cho select: ["..."]
  required BOOLEAN NOT NULL DEFAULT FALSE,
  sort INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Postgres không cho biểu thức (COALESCE) trong UNIQUE constraint mức bảng nên dùng
-- unique index có biểu thức: NULL project_id (áp mọi dự án) coi như 0 để một key chỉ
-- khai báo 1 lần cho mỗi (entity_type, phạm vi dự án).
CREATE UNIQUE INDEX IF NOT EXISTS custom_field_defs_scope_key_uidx
  ON custom_field_defs (entity_type, COALESCE(project_id, 0), key);

ALTER TABLE tasks         ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}';
ALTER TABLE contracts     ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}';
ALTER TABLE materials     ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}';
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}';
