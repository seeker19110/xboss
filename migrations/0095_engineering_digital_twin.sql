-- 0095_engineering_digital_twin.sql — Phase OS-2 Digital Twin theo cấp độ L0–L3
-- Đặc tả: docs/nang-cap/OS-2-digital-twin.md

-- 1. L1: Bindings — Liên kết đối tượng với tầng, khu vực, hệ thống, task thi công, bản vẽ hoặc phần tử BIM
CREATE TABLE IF NOT EXISTS engineering_twin_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  binding_type TEXT NOT NULL CHECK (binding_type IN ('floor', 'zone', 'system', 'task', 'drawing', 'bim_element')),
  target_key TEXT NOT NULL,
  target_id TEXT,
  source_revision_id UUID REFERENCES engineering_source_revisions(id) ON DELETE SET NULL,
  authority TEXT NOT NULL DEFAULT 'primary_spec',
  metadata JSONB NOT NULL DEFAULT '{}',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eng_twin_bindings_lookup
  ON engineering_twin_bindings(project_id, object_id, binding_type);

CREATE INDEX IF NOT EXISTS idx_eng_twin_bindings_target
  ON engineering_twin_bindings(project_id, binding_type, target_key);

-- 2. L3: Field State Snapshots — Ghi nhận trạng thái vận hành/hiện trường thực tế
CREATE TABLE IF NOT EXISTS engineering_twin_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  state_type TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  value JSONB NOT NULL,
  unit TEXT,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  quality TEXT NOT NULL DEFAULT 'high' CHECK (quality IN ('high', 'medium', 'low', 'unknown')),
  source TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  supersedes_id UUID REFERENCES engineering_twin_states(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eng_twin_states_object_time
  ON engineering_twin_states(project_id, object_id, state_type, observed_at DESC);

-- 3. Row Level Security cho nhóm bảng Digital Twin theo chuẩn C3 §3
ALTER TABLE engineering_twin_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_twin_bindings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_twin_bindings_project ON engineering_twin_bindings;
CREATE POLICY p_eng_twin_bindings_project ON engineering_twin_bindings
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );

ALTER TABLE engineering_twin_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_twin_states FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_twin_states_project ON engineering_twin_states;
CREATE POLICY p_eng_twin_states_project ON engineering_twin_states
  USING (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );
