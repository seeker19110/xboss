-- 0094_engineering_knowledge_graph.sql — Phase OS-1 Engineering System of Record & Knowledge Graph
-- Đặc tả: docs/nang-cap/OS-1-engineering-system-of-record.md

-- 1. Taxonomy: Danh mục loại đối tượng kỹ thuật
CREATE TABLE IF NOT EXISTS engineering_object_types (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  discipline TEXT,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed danh mục đối tượng kỹ thuật chuẩn MEP
INSERT INTO engineering_object_types (key, label, discipline, schema_version)
VALUES
  ('equipment', 'Thiết bị cơ điện chính (AHU, Chiller, Bơm, Quạt, Tủ điện)', 'general', '1.0'),
  ('component', 'Cấu kiện / Chi tiết lắp đặt (Van, Miệng gió, Cảm biến, Công tắc)', 'general', '1.0'),
  ('duct', 'Tuyến ống gió (Trục đứng, Hành lang, Căn hộ)', 'hvac', '1.0'),
  ('pipe', 'Tuyến ống nước / Gas / PCCC (Chilled water, Cấp thoát nước, Sprinkler)', 'plumbing', '1.0'),
  ('cable_tray', 'Máng cáp / Thang cáp / Trunking', 'electrical', '1.0'),
  ('space', 'Không gian / Khu vực / Phòng kỹ thuật / Căn hộ', 'architecture', '1.0'),
  ('system', 'Hệ thống kỹ thuật hoàn chỉnh (ACMV, Cấp thoát nước, Điện, PCCC)', 'general', '1.0')
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label, discipline = EXCLUDED.discipline, schema_version = EXCLUDED.schema_version;

-- 2. Taxonomy: Danh mục loại quan hệ kỹ thuật
CREATE TABLE IF NOT EXISTS engineering_relation_types (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  allowed_from_types TEXT[] NOT NULL DEFAULT '{}',
  allowed_to_types TEXT[] NOT NULL DEFAULT '{}',
  is_directed BOOLEAN NOT NULL DEFAULT TRUE,
  is_acyclic BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed danh mục loại quan hệ kỹ thuật
INSERT INTO engineering_relation_types (key, label, allowed_from_types, allowed_to_types, is_directed, is_acyclic, description)
VALUES
  ('SERVES', 'Phục vụ không gian / đối tượng khác', ARRAY['equipment', 'system', 'duct', 'pipe'], ARRAY['space', 'equipment'], TRUE, FALSE, 'Quan hệ cấp tải, làm mát, thông gió hoặc cấp nguồn'),
  ('CONTAINS', 'Bao hàm / Chứa đối tượng con', ARRAY['system', 'equipment', 'space'], ARRAY['equipment', 'component', 'duct', 'pipe', 'cable_tray'], TRUE, TRUE, 'Quan hệ cây phân cấp WBS / không gian'),
  ('CONNECTED_TO', 'Kết nối cơ điện trực tiếp', ARRAY['equipment', 'component', 'duct', 'pipe', 'cable_tray'], ARRAY['equipment', 'component', 'duct', 'pipe', 'cable_tray'], FALSE, FALSE, 'Quan hệ liên kết vật lý hoặc đường ống/dây dẫn'),
  ('FEEDS', 'Cấp nguồn / chất tải', ARRAY['equipment', 'pipe', 'cable_tray'], ARRAY['equipment', 'component'], TRUE, FALSE, 'Quan hệ cấp điện hoặc dòng môi chất'),
  ('LOCATED_IN', 'Vị trí lắp đặt tại không gian', ARRAY['equipment', 'component', 'duct', 'pipe', 'cable_tray'], ARRAY['space'], TRUE, TRUE, 'Quan hệ định vị vị trí lắp đặt thực tế')
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    allowed_from_types = EXCLUDED.allowed_from_types,
    allowed_to_types = EXCLUDED.allowed_to_types,
    is_directed = EXCLUDED.is_directed,
    is_acyclic = EXCLUDED.is_acyclic,
    description = EXCLUDED.description;

-- 3. Sổ ghi nhận vấn đề chất lượng dữ liệu kỹ thuật
CREATE TABLE IF NOT EXISTS engineering_data_quality_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  issue_rule TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'ignored')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by INTEGER REFERENCES users(id),
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_eng_dq_issues_project_status
  ON engineering_data_quality_issues(project_id, status, severity);

CREATE INDEX IF NOT EXISTS idx_eng_dq_issues_entity
  ON engineering_data_quality_issues(entity_type, entity_id);

-- 4. Bật Row Level Security cho các bảng mới theo C3 §3
ALTER TABLE engineering_object_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_object_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_obj_types_read ON engineering_object_types;
CREATE POLICY p_eng_obj_types_read ON engineering_object_types
  FOR SELECT USING (true);

ALTER TABLE engineering_relation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_relation_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_rel_types_read ON engineering_relation_types;
CREATE POLICY p_eng_rel_types_read ON engineering_relation_types
  FOR SELECT USING (true);

ALTER TABLE engineering_data_quality_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_data_quality_issues FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_dq_issues_project ON engineering_data_quality_issues;
CREATE POLICY p_eng_dq_issues_project ON engineering_data_quality_issues
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );
