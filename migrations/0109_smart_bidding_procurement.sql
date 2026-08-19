-- Migration 0109: Smart Bidding & Subcon Procurement Matrix (M75)
-- Quản lý gói thầu, báo giá nhà thầu/nhà cung cấp, và ma trận phân tích đơn giá bất thường (Price Skewing & Unbalanced Bidding)

CREATE TABLE IF NOT EXISTS engineering_bidding_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_code TEXT NOT NULL,
  title TEXT NOT NULL,
  discipline TEXT NOT NULL,
  target_budget_vnd BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'rfq_published', 'evaluating', 'awarded', 'closed', 'cancelled')),
  rfq_specs JSONB NOT NULL DEFAULT '{}'::jsonb,
  awarded_vendor TEXT,
  awarded_amount_vnd BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS engineering_bidding_vendor_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES engineering_bidding_packages(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  vendor_type TEXT NOT NULL DEFAULT 'subcontractor' CHECK (vendor_type IN ('subcontractor', 'material_supplier', 'equipment_vendor', 'joint_venture')),
  total_amount_vnd BIGINT NOT NULL DEFAULT 0,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  capacity_score NUMERIC(5, 2) NOT NULL DEFAULT 80.0,
  safety_score NUMERIC(5, 2) NOT NULL DEFAULT 85.0,
  technical_compliance_score NUMERIC(5, 2) NOT NULL DEFAULT 80.0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'shortlisted', 'awarded', 'rejected')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS engineering_bidding_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES engineering_bidding_packages(id) ON DELETE CASCADE,
  variance_matrix JSONB NOT NULL DEFAULT '{}'::jsonb,
  skew_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  ranking_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendation_summary TEXT NOT NULL,
  provenance_token TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bidding_pkg_proj_code
  ON engineering_bidding_packages (project_id, package_code);

CREATE INDEX IF NOT EXISTS idx_bidding_quotes_pkg
  ON engineering_bidding_vendor_quotes (project_id, package_id, status);

CREATE INDEX IF NOT EXISTS idx_bidding_analysis_pkg
  ON engineering_bidding_analysis_runs (project_id, package_id);

ALTER TABLE engineering_bidding_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_bidding_packages FORCE ROW LEVEL SECURITY;
ALTER TABLE engineering_bidding_vendor_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_bidding_vendor_quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE engineering_bidding_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_bidding_analysis_runs FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engineering_bidding_packages' AND policyname = 'engineering_bidding_packages_isolation') THEN
    CREATE POLICY engineering_bidding_packages_isolation ON engineering_bidding_packages FOR ALL
      USING (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*')
      WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engineering_bidding_vendor_quotes' AND policyname = 'engineering_bidding_vendor_quotes_isolation') THEN
    CREATE POLICY engineering_bidding_vendor_quotes_isolation ON engineering_bidding_vendor_quotes FOR ALL
      USING (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*')
      WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engineering_bidding_analysis_runs' AND policyname = 'engineering_bidding_analysis_runs_isolation') THEN
    CREATE POLICY engineering_bidding_analysis_runs_isolation ON engineering_bidding_analysis_runs FOR ALL
      USING (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*')
      WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*');
  END IF;
END $$;
