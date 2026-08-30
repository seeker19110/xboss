-- Migration 0113: AI FIDIC Contract Dispute & Delay Defense Dossier Generator (M79)
-- Quản lý hồ sơ khiếu nại tiến độ (EOT) & chi phí kéo dài (Prolongation Cost) theo chuẩn FIDIC Red/Yellow Book

CREATE TABLE IF NOT EXISTS engineering_fidic_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  claim_code TEXT NOT NULL UNIQUE,
  contract_type TEXT NOT NULL DEFAULT 'FIDIC_RED_1999' CHECK (contract_type IN ('FIDIC_RED_1999', 'FIDIC_YELLOW_1999', 'FIDIC_RED_2017', 'FIDIC_YELLOW_2017', 'VIETNAM_STANDARD')),
  fidic_clause TEXT NOT NULL DEFAULT '8.4',
  event_title TEXT NOT NULL,
  event_date DATE NOT NULL,
  notice_date DATE NOT NULL,
  eot_days_claimed INTEGER NOT NULL DEFAULT 0,
  cost_claimed_vnd BIGINT NOT NULL DEFAULT 0,
  is_time_bar_compliant BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'notice_submitted', 'full_claim_submitted', 'engineer_reviewing', 'approved_partially', 'approved_full', 'rejected', 'dispute_adjudication')),
  tia_analysis_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dossier_content TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS engineering_fidic_claim_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES engineering_fidic_claims(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('daily_diary', 'rfi_delay', 'ncr_halt', 'variation_order', 'weather_report', 'site_photo', 'correspondence')),
  reference_code TEXT NOT NULL,
  description TEXT,
  impact_days INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fidic_claims_proj_code
  ON engineering_fidic_claims (project_id, claim_code, status);

CREATE INDEX IF NOT EXISTS idx_claim_evidences_claim
  ON engineering_fidic_claim_evidences (project_id, claim_id);

ALTER TABLE engineering_fidic_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_fidic_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE engineering_fidic_claim_evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_fidic_claim_evidences FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engineering_fidic_claims' AND policyname = 'engineering_fidic_claims_isolation') THEN
    CREATE POLICY engineering_fidic_claims_isolation ON engineering_fidic_claims FOR ALL
      USING (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*')
      WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engineering_fidic_claim_evidences' AND policyname = 'engineering_fidic_claim_evidences_isolation') THEN
    CREATE POLICY engineering_fidic_claim_evidences_isolation ON engineering_fidic_claim_evidences FOR ALL
      USING (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*')
      WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*');
  END IF;
END $$;
