-- 0103_omnipotent_shopdrawing_qs.sql — Nền tảng Siêu Năng Lực Shopdrawing & Bóc Tách Khối Lượng Toàn Năng
-- Đặc tả: docs/nang-cap/M69-omnipotent-shopdrawing-qs.md

CREATE TABLE IF NOT EXISTS engineering_shopdrawing_lod400_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_code TEXT NOT NULL,
  drawing_name TEXT NOT NULL,
  total_spools_generated INT NOT NULL DEFAULT 0,
  slope_applied_percent NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  flange_pairs_inserted INT NOT NULL DEFAULT 0,
  insulation_spec TEXT,
  sleeves_count INT NOT NULL DEFAULT 0,
  sleeve_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_shopdrawing_lod400_code UNIQUE (project_id, run_code)
);

CREATE TABLE IF NOT EXISTS engineering_qs_bom_explosions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_description TEXT NOT NULL,
  unit TEXT NOT NULL,
  contract_rate_vnd NUMERIC(15,2) NOT NULL,
  breakdown_material_main_vnd NUMERIC(15,2) NOT NULL,
  breakdown_material_aux_vnd NUMERIC(15,2) NOT NULL,
  breakdown_labor_vnd NUMERIC(15,2) NOT NULL,
  breakdown_machinery_vnd NUMERIC(15,2) NOT NULL,
  breakdown_margin_vnd NUMERIC(15,2) NOT NULL,
  target_subcon_rate_vnd NUMERIC(15,2) NOT NULL,
  bom_level_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_qs_bom_code UNIQUE (project_id, item_code)
);

-- Row Level Security (RLS)
ALTER TABLE engineering_shopdrawing_lod400_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_shopdrawing_lod400_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_shopdrawing_lod400_project ON engineering_shopdrawing_lod400_runs;
CREATE POLICY p_eng_shopdrawing_lod400_project ON engineering_shopdrawing_lod400_runs
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

ALTER TABLE engineering_qs_bom_explosions ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_qs_bom_explosions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_qs_bom_project ON engineering_qs_bom_explosions;
CREATE POLICY p_eng_qs_bom_project ON engineering_qs_bom_explosions
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shopdrawing_lod400_proj ON engineering_shopdrawing_lod400_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qs_bom_proj ON engineering_qs_bom_explosions(project_id, item_code);
