-- 0105_predictive_carbon_handover.sql — Nền tảng AI Predictive Operations, Carbon LCA & Digital Handover Passport
-- Đặc tả: docs/nang-cap/M71-predictive-carbon-handover.md

CREATE TABLE IF NOT EXISTS engineering_mepf_predictive_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_code TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  system_type TEXT NOT NULL,
  installation_date DATE NOT NULL,
  operating_hours_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  mtbf_hours NUMERIC(10,2) NOT NULL,
  remaining_useful_life_days INT NOT NULL,
  health_score_percent NUMERIC(5,2) NOT NULL,
  next_maintenance_date DATE NOT NULL,
  maintenance_action_recommended TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mepf_predictive_code UNIQUE (project_id, asset_code)
);

CREATE TABLE IF NOT EXISTS engineering_carbon_lca_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_code TEXT NOT NULL,
  total_embodied_carbon_kgco2e NUMERIC(15,2) NOT NULL,
  carbon_intensity_kgco2e_per_m2 NUMERIC(8,2) NOT NULL,
  leed_points_estimated INT NOT NULL DEFAULT 0,
  carbon_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_carbon_lca_code UNIQUE (project_id, report_code)
);

CREATE TABLE IF NOT EXISTS engineering_digital_handover_passports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  passport_code TEXT NOT NULL,
  project_title TEXT NOT NULL,
  handover_date DATE NOT NULL,
  total_spools_count INT NOT NULL,
  total_bbnt_count INT NOT NULL,
  total_tc_tests_passed INT NOT NULL,
  provenance_master_hash TEXT NOT NULL,
  digital_certificate_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_digital_handover_code UNIQUE (project_id, passport_code)
);

-- Row Level Security (RLS)
ALTER TABLE engineering_mepf_predictive_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_mepf_predictive_assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_mepf_predictive_project ON engineering_mepf_predictive_assets;
CREATE POLICY p_eng_mepf_predictive_project ON engineering_mepf_predictive_assets
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

ALTER TABLE engineering_carbon_lca_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_carbon_lca_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_carbon_lca_project ON engineering_carbon_lca_reports;
CREATE POLICY p_eng_carbon_lca_project ON engineering_carbon_lca_reports
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

ALTER TABLE engineering_digital_handover_passports ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_digital_handover_passports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_digital_handover_project ON engineering_digital_handover_passports;
CREATE POLICY p_eng_digital_handover_project ON engineering_digital_handover_passports
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mepf_predictive_proj ON engineering_mepf_predictive_assets(project_id, system_type);
CREATE INDEX IF NOT EXISTS idx_carbon_lca_proj ON engineering_carbon_lca_reports(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_digital_handover_proj ON engineering_digital_handover_passports(project_id, passport_code);
