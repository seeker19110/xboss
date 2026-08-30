-- 0106_multi_agent_copilot_health.sql — Nền tảng Multi-Agent Swarm Debate & Project Health Cockpit
-- Đặc tả: docs/nang-cap/M72-multi-agent-copilot-health.md

CREATE TABLE IF NOT EXISTS engineering_agent_debate_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_code TEXT NOT NULL,
  topic_title TEXT NOT NULL,
  issue_description TEXT NOT NULL,
  agent_perspectives JSONB NOT NULL DEFAULT '[]'::jsonb,
  consensus_verdict TEXT NOT NULL,
  recommended_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  consensus_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_agent_debate_code UNIQUE (project_id, session_code)
);

CREATE TABLE IF NOT EXISTS engineering_project_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  health_index_percent NUMERIC(5,2) NOT NULL,
  spi_index NUMERIC(5,3) NOT NULL,
  cpi_index NUMERIC(5,3) NOT NULL,
  quality_pass_rate_percent NUMERIC(5,2) NOT NULL,
  projected_completion_p50 DATE NOT NULL,
  projected_completion_p80 DATE NOT NULL,
  projected_completion_p95 DATE NOT NULL,
  risk_drivers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE engineering_agent_debate_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_agent_debate_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_agent_debate_project ON engineering_agent_debate_sessions;
CREATE POLICY p_eng_agent_debate_project ON engineering_agent_debate_sessions
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

ALTER TABLE engineering_project_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_project_health_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_project_health_project ON engineering_project_health_snapshots;
CREATE POLICY p_eng_project_health_project ON engineering_project_health_snapshots
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_debate_proj ON engineering_agent_debate_sessions(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_health_proj ON engineering_project_health_snapshots(project_id, snapshot_date DESC);
