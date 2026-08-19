-- Migration 0120: HSE AI Computer Vision Sentinel & Safety Hazard Detection (Module M87)
CREATE TABLE IF NOT EXISTS engineering_hse_vision_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scan_name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    image_hash TEXT NOT NULL,
    total_hazards_found INT NOT NULL DEFAULT 0,
    site_safety_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    risk_tier TEXT NOT NULL DEFAULT 'SAFE', -- SAFE | WARNING | DANGER | CRITICAL
    analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engineering_hse_scans_project ON engineering_hse_vision_scans(project_id);

CREATE TABLE IF NOT EXISTS engineering_hse_detected_hazards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES engineering_hse_vision_scans(id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    hazard_type TEXT NOT NULL, -- NO_HELMET | NO_VEST | NO_HARNESS | BLOCKED_FIRE_EXIT | UNGUARDED_EDGE | ELECTRICAL_HAZARD
    severity TEXT NOT NULL DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH | CRITICAL
    confidence NUMERIC(5,2) NOT NULL DEFAULT 90.00,
    bounding_box JSONB NOT NULL DEFAULT '[0,0,100,100]'::jsonb, -- [x, y, width, height]
    description TEXT NOT NULL,
    standard_violation TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engineering_hse_hazards_scan ON engineering_hse_detected_hazards(scan_id);
CREATE INDEX IF NOT EXISTS idx_engineering_hse_hazards_project ON engineering_hse_detected_hazards(project_id);

CREATE TABLE IF NOT EXISTS engineering_hse_action_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES engineering_hse_vision_scans(id) ON DELETE CASCADE,
    hazard_id UUID NOT NULL REFERENCES engineering_hse_detected_hazards(id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ticket_code TEXT NOT NULL UNIQUE,
    assigned_subcon TEXT NOT NULL,
    fine_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    deadline_hours INT NOT NULL DEFAULT 4,
    status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | RESOLVED | REJECTED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engineering_hse_tickets_project ON engineering_hse_action_tickets(project_id);

ALTER TABLE engineering_hse_vision_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_hse_detected_hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_hse_action_tickets ENABLE ROW LEVEL SECURITY;

DO  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_hse_vision_scans_project_scope') THEN
        CREATE POLICY engineering_hse_vision_scans_project_scope ON engineering_hse_vision_scans
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_hse_detected_hazards_project_scope') THEN
        CREATE POLICY engineering_hse_detected_hazards_project_scope ON engineering_hse_detected_hazards
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_hse_action_tickets_project_scope') THEN
        CREATE POLICY engineering_hse_action_tickets_project_scope ON engineering_hse_action_tickets
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
END ;
