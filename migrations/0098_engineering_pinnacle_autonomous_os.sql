-- 0098_engineering_pinnacle_autonomous_os.sql — Trạng thái Đỉnh cao Autonomous & Cognitive Engineering OS
-- Đặc tả: docs/nang-cap/PINNACLE-AUTONOMOUS-COGNITIVE-ENGINEERING-OS.md

-- ============================================================================
-- 1. ENGINE 1: LIVING DIGITAL TWIN & REALITY CAPTURE (L4-L6)
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_twin_reality_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  capture_code TEXT NOT NULL,
  capture_type TEXT NOT NULL CHECK (capture_type IN ('lidar_pointcloud', 'drone_photogrammetry', 'camera_ai_survey', 'bim_scan_diff')),
  spatial_zone TEXT NOT NULL,
  elevation_level TEXT,
  capture_timestamp TIMESTAMPTZ NOT NULL,
  total_points BIGINT DEFAULT 0,
  storage_uri TEXT NOT NULL,
  bounding_box JSONB NOT NULL DEFAULT '{}'::jsonb,
  processing_status TEXT NOT NULL DEFAULT 'completed' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_reality_captures_project_code UNIQUE (project_id, capture_code)
);

CREATE TABLE IF NOT EXISTS engineering_twin_spatial_deviations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  capture_id UUID NOT NULL REFERENCES engineering_twin_reality_captures(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  element_guid TEXT,
  deviation_type TEXT NOT NULL CHECK (deviation_type IN ('position_offset', 'clearance_violation', 'missing_element', 'unexpected_obstacle', 'rotation_skew')),
  measured_deviation_mm NUMERIC(10, 2) NOT NULL,
  tolerance_threshold_mm NUMERIC(10, 2) NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  point_coordinates JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "z": 0}'::jsonb,
  remediation_status TEXT NOT NULL DEFAULT 'open' CHECK (remediation_status IN ('open', 'acknowledged', 'remediated', 'accepted_as_built', 'rejected')),
  suggestion_id UUID REFERENCES engineering_suggestions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering_twin_sensor_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sensor_code TEXT NOT NULL,
  sensor_type TEXT NOT NULL CHECK (sensor_type IN ('temperature', 'humidity', 'pressure', 'vibration', 'tilt', 'flow_rate', 'energy_kwh')),
  object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  sampling_interval_seconds INT NOT NULL DEFAULT 60,
  latest_value NUMERIC(14, 4),
  latest_unit TEXT,
  latest_observed_at TIMESTAMPTZ,
  anomaly_status TEXT NOT NULL DEFAULT 'normal' CHECK (anomaly_status IN ('normal', 'warning', 'critical', 'offline')),
  threshold_config JSONB NOT NULL DEFAULT '{"min": null, "max": null, "critical_max": null}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sensor_streams_project_code UNIQUE (project_id, sensor_code)
);

-- ============================================================================
-- 2. ENGINE 2: PRESCRIPTIVE OPTIMIZATION & STANDARDS COMPLIANCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_prescriptive_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scenario_code TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  target_metric TEXT NOT NULL CHECK (target_metric IN ('schedule_compression', 'cost_mitigation', 'clash_resolution', 'resource_leveling', 'multi_objective_pareto')),
  baseline_schedule_days INT NOT NULL,
  baseline_cost_vnd NUMERIC(18, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'simulated' CHECK (status IN ('simulated', 'evaluating', 'approved', 'rejected', 'archived')),
  simulated_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  pareto_frontier JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_option_index INT,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_prescriptive_scenarios_code UNIQUE (project_id, scenario_code)
);

CREATE TABLE IF NOT EXISTS engineering_compliance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_code TEXT NOT NULL,
  standard_title TEXT NOT NULL,
  section_clause TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('structural', 'fire_safety', 'hvac', 'plumbing', 'electrical', 'environmental', 'general_building')),
  rule_expression JSONB NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('advisory', 'mandatory', 'legal_strict')),
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_compliance_rules_clause UNIQUE (standard_code, section_clause)
);

INSERT INTO engineering_compliance_rules (standard_code, standard_title, section_clause, domain, rule_expression, severity, description)
VALUES
  ('QCVN 06:2022/BXD', 'Quy chuẩn kỹ thuật quốc gia về An toàn cháy cho nhà và công trình', 'Clause 5.1.2', 'fire_safety', '{"min_clearance_mm": 1200, "fire_rating_hours": 2}', 'legal_strict', 'Yêu cầu khoảng cách thông thủy tối thiểu lối thoát nạn và bậc chịu lửa'),
  ('NFPA 13', 'Standard for the Installation of Sprinkler Systems', 'Section 8.5.5', 'fire_safety', '{"max_sprinkler_spacing_mm": 4600, "min_pipe_diameter_mm": 25}', 'mandatory', 'Khoảng cách lắp đặt đầu phun sprinkler và đường kính ống nhánh'),
  ('TCVN 9385:2012', 'Chống sét cho công trình xây dựng - Hướng dẫn thiết kế, kiểm tra và bảo trì', 'Section 6.2', 'electrical', '{"max_grounding_resistance_ohm": 10}', 'legal_strict', 'Điện trở nối đất an toàn chống sét không vượt quá 10 Ohm')
ON CONFLICT (standard_code, section_clause) DO NOTHING;

CREATE TABLE IF NOT EXISTS engineering_compliance_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES engineering_compliance_rules(id) ON DELETE CASCADE,
  compliance_status TEXT NOT NULL CHECK (compliance_status IN ('compliant', 'non_compliant', 'exemption_granted', 'manual_review_required')),
  finding_details TEXT,
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  audited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. ENGINE 3: MULTI-AGENT SWARM ORCHESTRATION & SYNTHESIS
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_swarm_debates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  debate_topic TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  participating_agents JSONB NOT NULL DEFAULT '["agent_structural", "agent_mepf", "agent_cost_qs", "agent_safety", "agent_contract"]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'debating', 'synthesized', 'authorized', 'cancelled')),
  synthesis_summary TEXT,
  consensus_level TEXT CHECK (consensus_level IN ('unanimous', 'majority_with_dissent', 'authority_reconciled', 'human_escalation_required')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering_swarm_arguments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES engineering_swarm_debates(id) ON DELETE CASCADE,
  agent_role TEXT NOT NULL,
  stance TEXT NOT NULL CHECK (stance IN ('propose', 'concur', 'object', 'amend', 'neutral')),
  authority_weight NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
  argument_text TEXT NOT NULL,
  cited_clauses JSONB NOT NULL DEFAULT '[]'::jsonb,
  impact_assessment JSONB NOT NULL DEFAULT '{"cost_delta_vnd": 0, "schedule_delta_days": 0, "risk_score": 0}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. ENGINE 4: CROSS-PROJECT COLLECTIVE INTELLIGENCE & PATTERN MEMORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_knowledge_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('labor_productivity_deviation', 'material_waste_rate', 'subcontractor_reliability', 'weather_impact_curve', 'rework_risk_fingerprint')),
  category TEXT NOT NULL,
  fingerprint_hash TEXT NOT NULL UNIQUE,
  pattern_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.5000,
  sample_size_projects INT NOT NULL DEFAULT 1,
  sample_size_observations BIGINT NOT NULL DEFAULT 1,
  lesson_learned TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering_cross_project_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  pattern_id UUID REFERENCES engineering_knowledge_patterns(id) ON DELETE SET NULL,
  work_package_code TEXT,
  observed_problem TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  prescribed_preventative_action TEXT NOT NULL,
  effectiveness_score NUMERIC(5, 4) DEFAULT 1.0000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. ROW-LEVEL SECURITY & PERFORMANCE INDEXES
-- ============================================================================

ALTER TABLE engineering_twin_reality_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_twin_reality_captures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_twin_reality_captures_project ON engineering_twin_reality_captures;
CREATE POLICY p_eng_twin_reality_captures_project ON engineering_twin_reality_captures
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );

ALTER TABLE engineering_twin_spatial_deviations ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_twin_spatial_deviations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_twin_spatial_deviations_project ON engineering_twin_spatial_deviations;
CREATE POLICY p_eng_twin_spatial_deviations_project ON engineering_twin_spatial_deviations
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );

ALTER TABLE engineering_twin_sensor_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_twin_sensor_streams FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_twin_sensor_streams_project ON engineering_twin_sensor_streams;
CREATE POLICY p_eng_twin_sensor_streams_project ON engineering_twin_sensor_streams
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );

ALTER TABLE engineering_prescriptive_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_prescriptive_scenarios FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_prescriptive_scenarios_project ON engineering_prescriptive_scenarios;
CREATE POLICY p_eng_prescriptive_scenarios_project ON engineering_prescriptive_scenarios
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );

ALTER TABLE engineering_compliance_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_compliance_audits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_compliance_audits_project ON engineering_compliance_audits;
CREATE POLICY p_eng_compliance_audits_project ON engineering_compliance_audits
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );

ALTER TABLE engineering_swarm_debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_swarm_debates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_swarm_debates_project ON engineering_swarm_debates;
CREATE POLICY p_eng_swarm_debates_project ON engineering_swarm_debates
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );

CREATE INDEX IF NOT EXISTS idx_twin_spatial_deviations_proj ON engineering_twin_spatial_deviations(project_id, severity, remediation_status);
CREATE INDEX IF NOT EXISTS idx_twin_sensor_streams_proj ON engineering_twin_sensor_streams(project_id, anomaly_status);
CREATE INDEX IF NOT EXISTS idx_prescriptive_scenarios_proj ON engineering_prescriptive_scenarios(project_id, status);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_proj ON engineering_compliance_audits(project_id, compliance_status);
CREATE INDEX IF NOT EXISTS idx_swarm_debates_proj ON engineering_swarm_debates(project_id, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_patterns_type ON engineering_knowledge_patterns(pattern_type, category);
