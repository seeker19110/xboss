-- Migration 0121: Unified Engineering Pinnacle Cockpit & Apex Pulse Synergy (Module M88)
CREATE TABLE IF NOT EXISTS engineering_apex_system_pulses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    apex_index NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    spatial_score NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    financial_score NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    legal_score NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    site_score NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    agent_score NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    status_tier TEXT NOT NULL DEFAULT 'OPTIMAL', -- OPTIMAL | RESILIENT | ATTENTION | CRITICAL
    pulse_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engineering_apex_pulses_project ON engineering_apex_system_pulses(project_id);
CREATE INDEX IF NOT EXISTS idx_engineering_apex_pulses_created ON engineering_apex_system_pulses(created_at DESC);

CREATE TABLE IF NOT EXISTS engineering_apex_command_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- CROSS_SYSTEM_SCAN | SYNERGY_SYNC | EMERGENCY_REVISE | MERKLE_SEAL
    initiated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_status TEXT NOT NULL DEFAULT 'COMPLETED', -- PENDING | IN_PROGRESS | COMPLETED | FAILED
    result_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engineering_apex_actions_project ON engineering_apex_command_actions(project_id);

ALTER TABLE engineering_apex_system_pulses ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_apex_command_actions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_apex_system_pulses_project_scope') THEN
        CREATE POLICY engineering_apex_system_pulses_project_scope ON engineering_apex_system_pulses
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_apex_command_actions_project_scope') THEN
        CREATE POLICY engineering_apex_command_actions_project_scope ON engineering_apex_command_actions
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;
