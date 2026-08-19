-- 0101_mepf_ai_lifecycle.sql — Nền tảng dữ liệu Hệ sinh thái AI & Tự động hoá Thi công MEPF
-- Đặc tả: docs/nang-cap/M67-mepf-ai-autonomous-lifecycle.md

CREATE TABLE IF NOT EXISTS engineering_mepf_takeoff_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  drawing_id INTEGER REFERENCES drawings(id) ON DELETE SET NULL,
  session_code TEXT NOT NULL,
  discipline TEXT NOT NULL CHECK (discipline IN ('hvac', 'plumbing', 'electrical', 'firefighting', 'all')),
  drawing_name TEXT NOT NULL,
  total_symbols_detected INT NOT NULL DEFAULT 0,
  total_linear_meters NUMERIC(15,3) NOT NULL DEFAULT 0,
  total_duct_area_m2 NUMERIC(15,3) NOT NULL DEFAULT 0,
  inferred_fittings_count INT NOT NULL DEFAULT 0,
  detected_elements JSONB NOT NULL DEFAULT '[]'::jsonb,
  fitting_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  boq_mapping_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  vo_risk_summary JSONB NOT NULL DEFAULT '{"has_vo_risk": false, "total_delta_vnd": 0}'::jsonb,
  compliance_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mepf_takeoff_project_code UNIQUE (project_id, session_code)
);

CREATE TABLE IF NOT EXISTS engineering_mepf_tc_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  matrix_code TEXT NOT NULL,
  title TEXT NOT NULL,
  test_type TEXT NOT NULL CHECK (test_type IN ('hydrostatic_pipe', 'air_duct_leakage', 'air_balance_tab', 'fire_interlock', 'insulation_resistance')),
  system_code TEXT NOT NULL,
  floor_label TEXT NOT NULL,
  zone_label TEXT NOT NULL DEFAULT 'Main',
  test_package_name TEXT NOT NULL,
  design_pressure_bar NUMERIC(8,2),
  test_pressure_bar NUMERIC(8,2),
  holding_duration_minutes INT NOT NULL DEFAULT 120,
  allowable_drop_bar NUMERIC(8,2) NOT NULL DEFAULT 0.2,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'testing', 'passed', 'failed', 'approved')),
  interlock_logic JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_inspector INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mepf_tc_matrix_project_code UNIQUE (project_id, matrix_code)
);

CREATE TABLE IF NOT EXISTS engineering_mepf_tc_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  matrix_id UUID NOT NULL REFERENCES engineering_mepf_tc_matrices(id) ON DELETE CASCADE,
  reading_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sensor_code TEXT,
  recorded_value NUMERIC(10,3) NOT NULL, -- Bar, m3/h, MegaOhm
  unit TEXT NOT NULL,
  ambient_temp_c NUMERIC(5,2),
  notes TEXT,
  is_anomaly BOOLEAN NOT NULL DEFAULT false,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE engineering_mepf_takeoff_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_mepf_takeoff_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_mepf_takeoff_project ON engineering_mepf_takeoff_runs;
CREATE POLICY p_eng_mepf_takeoff_project ON engineering_mepf_takeoff_runs
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

ALTER TABLE engineering_mepf_tc_matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_mepf_tc_matrices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_mepf_tc_matrices_project ON engineering_mepf_tc_matrices;
CREATE POLICY p_eng_mepf_tc_matrices_project ON engineering_mepf_tc_matrices
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

ALTER TABLE engineering_mepf_tc_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_mepf_tc_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_mepf_tc_logs_project ON engineering_mepf_tc_logs;
CREATE POLICY p_eng_mepf_tc_logs_project ON engineering_mepf_tc_logs
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mepf_takeoff_proj ON engineering_mepf_takeoff_runs(project_id, discipline);
CREATE INDEX IF NOT EXISTS idx_mepf_tc_matrices_proj ON engineering_mepf_tc_matrices(project_id, status);
CREATE INDEX IF NOT EXISTS idx_mepf_tc_logs_matrix ON engineering_mepf_tc_logs(matrix_id, reading_time DESC);
