-- 0097_engineering_autonomy.sql — Phase OS-4 Controlled Autonomy & Safe Execution (A0–A2)
-- Đặc tả: docs/nang-cap/OS-4-controlled-autonomy.md

-- 1. Autonomy Capabilities Catalog (A0: Observe, A1: Suggest, A2: Prepare Draft)
CREATE TABLE IF NOT EXISTS engineering_autonomy_capabilities (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  max_autonomy_level TEXT NOT NULL CHECK (max_autonomy_level IN ('A0', 'A1', 'A2')),
  risk_class TEXT NOT NULL CHECK (risk_class IN ('low', 'medium', 'high', 'critical')),
  is_reversible BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO engineering_autonomy_capabilities (key, label, max_autonomy_level, risk_class, is_reversible)
VALUES
  ('cap_sync_twin_state', 'Tự động đồng bộ snapshot Digital Twin hiện trường', 'A1', 'low', TRUE),
  ('cap_draft_clash_workflow', 'Chuẩn bị dự thảo quy trình phê duyệt xử lý xung đột', 'A2', 'medium', TRUE),
  ('cap_scan_data_quality', 'Tự động rà quét và phân loại vấn đề chất lượng dữ liệu', 'A1', 'low', TRUE)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label, max_autonomy_level = EXCLUDED.max_autonomy_level,
    risk_class = EXCLUDED.risk_class, is_reversible = EXCLUDED.is_reversible;

-- 2. Autonomy Policies
CREATE TABLE IF NOT EXISTS engineering_autonomy_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  capability_key TEXT NOT NULL REFERENCES engineering_autonomy_capabilities(key) ON DELETE CASCADE,
  max_level TEXT NOT NULL CHECK (max_level IN ('A0', 'A1', 'A2')),
  allowed_roles TEXT[] NOT NULL DEFAULT '{"admin","pm"}',
  max_budget NUMERIC,
  rate_limit_hourly INTEGER NOT NULL DEFAULT 50,
  approval_mode TEXT NOT NULL DEFAULT 'manual' CHECK (approval_mode IN ('manual', 'gate_required')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, capability_key)
);

CREATE INDEX IF NOT EXISTS idx_eng_autonomy_policies_lookup
  ON engineering_autonomy_policies(project_id, capability_key, is_active);

-- 3. Execution Requests
CREATE TABLE IF NOT EXISTS engineering_execution_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  capability_key TEXT NOT NULL REFERENCES engineering_autonomy_capabilities(key) ON DELETE RESTRICT,
  autonomy_level TEXT NOT NULL CHECK (autonomy_level IN ('A0', 'A1', 'A2')),
  intent TEXT NOT NULL,
  dry_run_diff JSONB NOT NULL DEFAULT '{}',
  risk_class TEXT NOT NULL CHECK (risk_class IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'dry_run_passed' CHECK (status IN ('draft', 'dry_run_passed', 'pending_approval', 'authorized', 'executing', 'completed', 'compensated', 'rejected', 'killed')),
  approval_token TEXT,
  token_expires_at TIMESTAMPTZ,
  execution_result JSONB,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eng_exec_requests_project
  ON engineering_execution_requests(project_id, status, created_at DESC);

-- 4. Autonomy Kill Switches (Khẩn cấp dừng tự động hóa)
CREATE TABLE IF NOT EXISTS engineering_autonomy_kill_switches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  capability_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  reason TEXT NOT NULL,
  activated_by INTEGER REFERENCES users(id),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eng_kill_switches_active
  ON engineering_autonomy_kill_switches(project_id, is_active);

-- 5. Row Level Security
ALTER TABLE engineering_autonomy_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_autonomy_capabilities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_autonomy_caps_read ON engineering_autonomy_capabilities;
CREATE POLICY p_eng_autonomy_caps_read ON engineering_autonomy_capabilities FOR SELECT USING (true);

ALTER TABLE engineering_autonomy_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_autonomy_policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_autonomy_policies_project ON engineering_autonomy_policies;
CREATE POLICY p_eng_autonomy_policies_project ON engineering_autonomy_policies
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );

ALTER TABLE engineering_execution_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_execution_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_exec_requests_project ON engineering_execution_requests;
CREATE POLICY p_eng_exec_requests_project ON engineering_execution_requests
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );

ALTER TABLE engineering_autonomy_kill_switches ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_autonomy_kill_switches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_kill_switches_project ON engineering_autonomy_kill_switches;
CREATE POLICY p_eng_kill_switches_project ON engineering_autonomy_kill_switches
  USING (
    project_id IS NULL
    OR project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id IS NULL
    OR project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );
