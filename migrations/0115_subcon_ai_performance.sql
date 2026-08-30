-- Migration 0115: AI Autonomous Subcontractor Performance & Auto-Bidding Recommendation (Module M82)

CREATE TABLE IF NOT EXISTS engineering_subcon_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_id BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  tax_code TEXT,
  primary_discipline TEXT NOT NULL, -- HVAC, PLUMBING, ELECTRICAL, FIRE_FIGHTING, EXTRA_LOW_VOLTAGE, GENERAL_MEPF
  specialties JSONB DEFAULT '[]'::jsonb, -- ['Chiller', 'VRV/VRF', 'FM200', 'Substation']
  workforce_capacity INT DEFAULT 20,
  equipment_assets JSONB DEFAULT '[]'::jsonb,
  certifications JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering_subcon_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES engineering_subcon_profiles(id) ON DELETE CASCADE,
  evaluation_period TEXT NOT NULL, -- YYYY-MM
  on_time_completion_rate NUMERIC(5, 2) DEFAULT 100.00, -- 0.00 - 100.00%
  bbnt_pass_rate NUMERIC(5, 2) DEFAULT 100.00, -- % nghiệm thu đạt lần 1
  ncr_incident_count INT DEFAULT 0,
  hse_safety_score NUMERIC(5, 2) DEFAULT 95.00, -- 0.00 - 100.00
  cost_variance_rate NUMERIC(5, 2) DEFAULT 0.00, -- % phát sinh ngoài hợp đồng
  trust_score NUMERIC(5, 2) NOT NULL DEFAULT 85.00, -- Điểm tín nhiệm tổng hợp AI (0 - 100)
  tier_grade TEXT NOT NULL DEFAULT 'TIER_B', -- TIER_A, TIER_B, TIER_C, TIER_D
  ai_analysis_summary TEXT,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering_subcon_bidding_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  discipline TEXT NOT NULL,
  estimated_budget NUMERIC(15, 2) NOT NULL,
  required_capacity INT DEFAULT 10,
  recommended_profiles JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ profileId, matchScore, trustScore, riskFactors: [] }]
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bật Row Level Security (RLS)
ALTER TABLE engineering_subcon_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_subcon_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_subcon_bidding_recommendations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_subcon_profiles_project_scope') THEN
    CREATE POLICY engineering_subcon_profiles_project_scope ON engineering_subcon_profiles
      USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_subcon_performance_metrics_project_scope') THEN
    CREATE POLICY engineering_subcon_performance_metrics_project_scope ON engineering_subcon_performance_metrics
      USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_subcon_bidding_recommendations_project_scope') THEN
    CREATE POLICY engineering_subcon_bidding_recommendations_project_scope ON engineering_subcon_bidding_recommendations
      USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
  END IF;
END $$;
