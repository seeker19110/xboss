-- 0102_mepf_super_skills.sql — Nền tảng dữ liệu Super Skills MEPF AI Đỉnh Cao
-- Đặc tả: docs/nang-cap/M68-mepf-super-skills.md

CREATE TABLE IF NOT EXISTS engineering_mepf_hydraulic_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  calc_code TEXT NOT NULL,
  system_type TEXT NOT NULL CHECK (system_type IN ('chilled_water', 'condenser_water', 'domestic_water', 'firefighting_sprinkler', 'air_duct')),
  flow_rate_m3h NUMERIC(10,3) NOT NULL,
  pipe_length_m NUMERIC(10,3) NOT NULL,
  selected_diameter_spec TEXT NOT NULL,
  fluid_velocity_ms NUMERIC(6,3) NOT NULL,
  head_loss_bar NUMERIC(8,4) NOT NULL,
  recommended_hanger_spacing_m NUMERIC(5,2) NOT NULL,
  recommended_rod_size TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mepf_hydraulic_code UNIQUE (project_id, calc_code)
);

CREATE TABLE IF NOT EXISTS engineering_mepf_nesting_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  material_type TEXT NOT NULL,
  stock_length_m NUMERIC(8,3) NOT NULL DEFAULT 6.0,
  total_required_pieces INT NOT NULL DEFAULT 0,
  total_stock_bars_needed INT NOT NULL DEFAULT 0,
  scrap_waste_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  cutting_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mepf_nesting_code UNIQUE (project_id, plan_code)
);

CREATE TABLE IF NOT EXISTS engineering_mepf_voice_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  transcribed_text TEXT NOT NULL,
  extracted_location TEXT NOT NULL,
  extracted_spool_code TEXT,
  updated_stage TEXT,
  defect_created BOOLEAN NOT NULL DEFAULT false,
  defect_description TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE engineering_mepf_hydraulic_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_mepf_hydraulic_calculations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_mepf_hydraulic_project ON engineering_mepf_hydraulic_calculations;
CREATE POLICY p_eng_mepf_hydraulic_project ON engineering_mepf_hydraulic_calculations
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

ALTER TABLE engineering_mepf_nesting_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_mepf_nesting_plans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_mepf_nesting_project ON engineering_mepf_nesting_plans;
CREATE POLICY p_eng_mepf_nesting_project ON engineering_mepf_nesting_plans
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

ALTER TABLE engineering_mepf_voice_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_mepf_voice_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_mepf_voice_project ON engineering_mepf_voice_logs;
CREATE POLICY p_eng_mepf_voice_project ON engineering_mepf_voice_logs
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mepf_hydraulic_proj ON engineering_mepf_hydraulic_calculations(project_id, system_type);
CREATE INDEX IF NOT EXISTS idx_mepf_nesting_proj ON engineering_mepf_nesting_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_mepf_voice_proj ON engineering_mepf_voice_logs(project_id, created_at DESC);
