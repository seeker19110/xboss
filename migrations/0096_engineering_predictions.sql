-- 0096_engineering_predictions.sql — Phase OS-3 Predictive OS, Uncertainty-First
-- Đặc tả: docs/nang-cap/OS-3-predictive-os.md

-- 1. Prediction Models Catalog
CREATE TABLE IF NOT EXISTS engineering_prediction_models (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  use_case TEXT NOT NULL CHECK (use_case IN ('schedule_risk', 'cost_anomaly', 'clash_priority')),
  risk_class TEXT NOT NULL CHECK (risk_class IN ('low', 'medium', 'high', 'critical')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  baseline_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed các mô hình dự báo chuẩn
INSERT INTO engineering_prediction_models (key, label, use_case, risk_class, baseline_ref)
VALUES
  ('model_schedule_risk_v1', 'Dự báo nguy cơ trễ hạn tiến độ thi công WBS', 'schedule_risk', 'high', 'rule_critical_path_delay'),
  ('model_cost_anomaly_v1', 'Dự báo bất thường phát sinh chi phí & định mức vật tư', 'cost_anomaly', 'medium', 'rule_variance_exceeded_10pct'),
  ('model_clash_priority_v1', 'Xếp hạng độ nghiêm trọng xung đột không gian MEP', 'clash_priority', 'critical', 'rule_inter_discipline_clash')
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label, use_case = EXCLUDED.use_case, risk_class = EXCLUDED.risk_class, baseline_ref = EXCLUDED.baseline_ref;

-- 2. Prediction Model Versions
CREATE TABLE IF NOT EXISTS engineering_prediction_model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key TEXT NOT NULL REFERENCES engineering_prediction_models(key) ON DELETE CASCADE,
  version TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}',
  is_champion BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (model_key, version)
);

INSERT INTO engineering_prediction_model_versions (model_key, version, code_hash, metrics, is_champion)
VALUES
  ('model_schedule_risk_v1', '1.0.0', 'sha256_baseline_schedule', '{"precision": 0.88, "recall": 0.82, "brierScore": 0.12}'::jsonb, TRUE),
  ('model_cost_anomaly_v1', '1.0.0', 'sha256_baseline_cost', '{"precision": 0.85, "recall": 0.79, "brierScore": 0.14}'::jsonb, TRUE),
  ('model_clash_priority_v1', '1.0.0', 'sha256_baseline_clash', '{"precision": 0.92, "recall": 0.89, "brierScore": 0.08}'::jsonb, TRUE)
ON CONFLICT (model_key, version) DO UPDATE
SET metrics = EXCLUDED.metrics, is_champion = EXCLUDED.is_champion;

-- 3. Prediction Runs
CREATE TABLE IF NOT EXISTS engineering_prediction_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  model_version_id UUID REFERENCES engineering_prediction_model_versions(id) ON DELETE SET NULL,
  use_case TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  input_hash TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_eng_pred_runs_project
  ON engineering_prediction_runs(project_id, use_case, started_at DESC);

-- 4. Prediction Outputs
CREATE TABLE IF NOT EXISTS engineering_prediction_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES engineering_prediction_runs(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('object', 'task', 'package', 'relation')),
  entity_id TEXT NOT NULL,
  score NUMERIC NOT NULL,
  probability NUMERIC NOT NULL,
  uncertainty_bin TEXT NOT NULL CHECK (uncertainty_bin IN ('low', 'medium', 'high', 'unknown')),
  explanation TEXT NOT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]',
  suggestion_id UUID REFERENCES engineering_suggestions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eng_pred_outputs_project
  ON engineering_prediction_outputs(project_id, status, score DESC);

-- 5. Row Level Security
ALTER TABLE engineering_prediction_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_prediction_models FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_pred_models_read ON engineering_prediction_models;
CREATE POLICY p_eng_pred_models_read ON engineering_prediction_models FOR SELECT USING (true);

ALTER TABLE engineering_prediction_model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_prediction_model_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_pred_model_vers_read ON engineering_prediction_model_versions;
CREATE POLICY p_eng_pred_model_vers_read ON engineering_prediction_model_versions FOR SELECT USING (true);

ALTER TABLE engineering_prediction_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_prediction_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_pred_runs_project ON engineering_prediction_runs;
CREATE POLICY p_eng_pred_runs_project ON engineering_prediction_runs
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );

ALTER TABLE engineering_prediction_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_prediction_outputs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_pred_outputs_project ON engineering_prediction_outputs;
CREATE POLICY p_eng_pred_outputs_project ON engineering_prediction_outputs
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );
