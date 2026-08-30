-- 0099_engineering_cad_skills.sql — Nâng cấp toàn diện năng lực và công cụ CAD thông minh
-- Đặc tả: docs/nang-cap/M65-cad-engineering-skills.md

CREATE TABLE IF NOT EXISTS engineering_cad_diff_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  base_drawing_id BIGINT REFERENCES drawings(id) ON DELETE CASCADE,
  compare_drawing_id BIGINT REFERENCES drawings(id) ON DELETE CASCADE,
  total_entities_base INT NOT NULL DEFAULT 0,
  total_entities_compare INT NOT NULL DEFAULT 0,
  diff_summary JSONB NOT NULL DEFAULT '{"added": 0, "removed": 0, "modified": 0, "unchanged": 0}'::jsonb,
  diff_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  potential_vo_impact JSONB NOT NULL DEFAULT '{"estimated_cost_vnd": 0, "risk_level": "low"}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering_cad_block_catalogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  block_name TEXT NOT NULL,
  discipline TEXT NOT NULL CHECK (discipline IN ('hvac', 'plumbing', 'electrical', 'firefighting', 'structure', 'architecture')),
  category TEXT NOT NULL,
  attribute_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  mapped_boq_code TEXT,
  mapped_material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cad_block_project_name UNIQUE (project_id, block_name)
);

CREATE TABLE IF NOT EXISTS engineering_cad_lisp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  detail_category TEXT NOT NULL CHECK (detail_category IN ('hanger_support', 'sleeve_opening', 'duct_transition', 'manhole_section', 'equipment_pad')),
  lisp_code_template TEXT NOT NULL,
  parameter_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO engineering_cad_lisp_templates (template_code, title, detail_category, lisp_code_template, parameter_schema)
VALUES
  (
    'TYP-HANGER-TRAPEZE',
    'Chi tiết giá đỡ ty treo chữ U (Trapeze Hanger Detail)',
    'hanger_support',
    ';; AutoLISP Generator: Trapeze Hanger\n(defun c:DRAW_HANGER ( / pt w h rod_d beam_h)\n  (setq pt (getpoint "\\nChon diem dat gia do: "))\n  (setq w %WIDTH%)\n  (setq h %HEIGHT%)\n  (command "_.RECTANG" pt (list (+ (car pt) w) (+ (cadr pt) h)))\n  (princ "\\nVe gia do thanh cong.")\n  (princ)\n)',
    '{"width": 600, "height": 400, "rod_diameter_mm": 10, "channel_size": "Unistrut 41x41"}'::jsonb
  ),
  (
    'TYP-SLEEVE-OPENING',
    'Chi tiết lỗ mở chờ dầm sàn (Sleeve Opening Detail)',
    'sleeve_opening',
    ';; AutoLISP Generator: Sleeve Opening\n(defun c:DRAW_SLEEVE ( / center d)\n  (setq center (getpoint "\\nChon tam lo mo: "))\n  (setq d %DIAMETER%)\n  (command "_.CIRCLE" center (/ d 2.0))\n  (command "_.TEXT" center 100 0 "%TAG%")\n  (princ "\\nDat sleeve thanh cong.")\n  (princ)\n)',
    '{"diameter_mm": 150, "pipe_type": "PVC Class 2", "firestop_rating": "2 Hours"}'::jsonb
  )
ON CONFLICT (template_code) DO NOTHING;

ALTER TABLE engineering_cad_diff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_cad_diff_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_cad_diff_project ON engineering_cad_diff_sessions;
CREATE POLICY p_eng_cad_diff_project ON engineering_cad_diff_sessions
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

ALTER TABLE engineering_cad_block_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_cad_block_catalogs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_cad_block_project ON engineering_cad_block_catalogs;
CREATE POLICY p_eng_cad_block_project ON engineering_cad_block_catalogs
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

CREATE INDEX IF NOT EXISTS idx_cad_diff_sessions_proj ON engineering_cad_diff_sessions(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cad_block_catalogs_proj ON engineering_cad_block_catalogs(project_id, discipline);
