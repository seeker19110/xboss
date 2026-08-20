-- Migration 0119: Smart Zalo Field Copilot & Interactive Site Gateway (Module M86)
CREATE TABLE IF NOT EXISTS zalo_user_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    zalo_user_id TEXT NOT NULL,
    zalo_display_name TEXT,
    phone_number TEXT,
    verification_otp TEXT,
    otp_expires_at TIMESTAMPTZ,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zalo_user_bindings_project ON zalo_user_bindings(project_id);
CREATE INDEX IF NOT EXISTS idx_zalo_user_bindings_zid ON zalo_user_bindings(zalo_user_id);

CREATE TABLE IF NOT EXISTS zalo_site_message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    zalo_user_id TEXT NOT NULL,
    message_direction TEXT NOT NULL DEFAULT 'INCOMING',
    raw_text TEXT NOT NULL,
    intent TEXT NOT NULL DEFAULT 'UNKNOWN',
    confidence NUMERIC(5,2) NOT NULL DEFAULT 1.00,
    parsed_entities JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zalo_message_logs_project ON zalo_site_message_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_zalo_message_logs_zid ON zalo_site_message_logs(zalo_user_id);

CREATE TABLE IF NOT EXISTS zalo_field_action_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    zalo_user_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    execution_status TEXT NOT NULL DEFAULT 'SUCCESS',
    result_summary TEXT,
    dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zalo_action_dispatches_project ON zalo_field_action_dispatches(project_id);

ALTER TABLE zalo_user_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_site_message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_field_action_dispatches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'zalo_user_bindings_project_scope') THEN
        CREATE POLICY zalo_user_bindings_project_scope ON zalo_user_bindings
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'zalo_site_message_logs_project_scope') THEN
        CREATE POLICY zalo_site_message_logs_project_scope ON zalo_site_message_logs
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'zalo_field_action_dispatches_project_scope') THEN
        CREATE POLICY zalo_field_action_dispatches_project_scope ON zalo_field_action_dispatches
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;
