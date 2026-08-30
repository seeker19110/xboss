-- 0100_cad_qto_tracking.sql — Hợp nhất CAD, Khối lượng và Tracking Nghiệm thu
-- Đặc tả: docs/nang-cap/M66-cad-qto-tracking.md

CREATE TABLE IF NOT EXISTS engineering_cad_spools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  drawing_id INTEGER REFERENCES drawings(id) ON DELETE SET NULL,
  spool_code TEXT NOT NULL,
  discipline TEXT NOT NULL CHECK (discipline IN ('hvac', 'plumbing', 'electrical', 'firefighting', 'structure', 'architecture')),
  system_code TEXT NOT NULL,
  floor_label TEXT NOT NULL,
  zone_label TEXT NOT NULL DEFAULT 'Main',
  dimension_spec TEXT NOT NULL, -- e.g. "500x300", "DN100", "300x100"
  length_m NUMERIC(12,3) NOT NULL DEFAULT 0,
  calculated_qty NUMERIC(15,3) NOT NULL DEFAULT 0, -- e.g. m2 duct or m pipe or pcs
  unit TEXT NOT NULL, -- "m2", "m", "kg", "cai", "bo"
  boq_item_id INTEGER REFERENCES boq_items(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'fabricated'
    CHECK (status IN ('fabricated', 'delivered', 'installed', 'qc_passed', 'bbnt_approved')),
  inspection_request_id INTEGER REFERENCES inspection_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cad_spool_project_code UNIQUE (project_id, spool_code)
);

CREATE TABLE IF NOT EXISTS engineering_cad_qto_variances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
  qty_contract NUMERIC(15,3) NOT NULL DEFAULT 0,
  qty_shop_cad NUMERIC(15,3) NOT NULL DEFAULT 0,
  qty_installed NUMERIC(15,3) NOT NULL DEFAULT 0,
  qty_approved_bbnt NUMERIC(15,3) NOT NULL DEFAULT 0,
  delta_vo_qty NUMERIC(15,3) GENERATED ALWAYS AS (qty_shop_cad - qty_contract) STORED,
  estimated_vo_vnd NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'vo_risk', 'over_norm', 'critical_variance')),
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cad_qto_variance_proj_boq UNIQUE (project_id, boq_item_id)
);

ALTER TABLE engineering_cad_spools ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_cad_spools FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_cad_spools_project ON engineering_cad_spools;
CREATE POLICY p_eng_cad_spools_project ON engineering_cad_spools
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

ALTER TABLE engineering_cad_qto_variances ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_cad_qto_variances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_cad_qto_variances_project ON engineering_cad_qto_variances;
CREATE POLICY p_eng_cad_qto_variances_project ON engineering_cad_qto_variances
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

CREATE INDEX IF NOT EXISTS idx_cad_spools_proj_status ON engineering_cad_spools(project_id, status);
CREATE INDEX IF NOT EXISTS idx_cad_spools_floor_zone ON engineering_cad_spools(project_id, floor_label, zone_label);
CREATE INDEX IF NOT EXISTS idx_cad_spools_boq ON engineering_cad_spools(boq_item_id);
CREATE INDEX IF NOT EXISTS idx_cad_spools_insreq ON engineering_cad_spools(inspection_request_id);
