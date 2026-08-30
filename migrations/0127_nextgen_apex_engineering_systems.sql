-- Migration 0127: Next-Gen Apex Autonomous Construction OS (Module M93 / M94)
-- Bổ sung các bảng CSDL cho:
-- 1. engineering_generative_routing_runs (3D A* Generative Spatial Router MEPF)
-- 2. engineering_edge_vision_detections (Edge-AI 360 Video Ingestion & SLAM Progress Mapping)
-- 3. engineering_rebar_prepour_audits (Computer Vision Pre-Pour Rebar & Spacer Verification)
-- 4. engineering_smart_ipc_records (Instant 60s Gated Smart IPC Payment Release)
-- 5. engineering_fidic_tia_claims (Autonomous FIDIC Time Impact Analysis Claims & Notice Engine)

-- ============================================================================
-- 1. ENGINEERING GENERATIVE ROUTING RUNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_generative_routing_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    routing_code TEXT NOT NULL,
    system_type TEXT NOT NULL,
    start_point JSONB NOT NULL,
    end_point JSONB NOT NULL,
    nominal_size_mm NUMERIC(10, 2) NOT NULL DEFAULT 100.00,
    slope_percent NUMERIC(6, 3) NOT NULL DEFAULT 0.000,
    path_nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
    fittings_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_length_m NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    pressure_drop_pa NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    clash_count_avoided INT NOT NULL DEFAULT 0,
    sleeve_openings_checked INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'solved',
    dxf_content TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, routing_code)
);

CREATE INDEX IF NOT EXISTS idx_gen_routing_project ON engineering_generative_routing_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gen_routing_system ON engineering_generative_routing_runs(project_id, system_type);

ALTER TABLE engineering_generative_routing_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'gen_routing_project_scope') THEN
        CREATE POLICY gen_routing_project_scope ON engineering_generative_routing_runs
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 2. ENGINEERING EDGE VISION DETECTIONS (360 Video SLAM Progress Mapping)
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_edge_vision_detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    detection_code TEXT NOT NULL,
    video_session_id TEXT NOT NULL,
    frame_timestamp_sec NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    camera_pose JSONB NOT NULL DEFAULT '{}'::jsonb,
    bim_element_guid TEXT,
    element_type TEXT NOT NULL,
    zone_label TEXT NOT NULL DEFAULT 'Zone-01',
    installation_status TEXT NOT NULL DEFAULT 'in_progress',
    confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.9000,
    anomaly_detected BOOLEAN NOT NULL DEFAULT false,
    anomaly_description TEXT,
    bounding_box_2d JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, detection_code)
);

CREATE INDEX IF NOT EXISTS idx_edge_vision_project ON engineering_edge_vision_detections(project_id, video_session_id);
CREATE INDEX IF NOT EXISTS idx_edge_vision_guid ON engineering_edge_vision_detections(project_id, bim_element_guid);

ALTER TABLE engineering_edge_vision_detections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'edge_vision_project_scope') THEN
        CREATE POLICY edge_vision_project_scope ON engineering_edge_vision_detections
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 3. ENGINEERING REBAR PREPOUR AUDITS (Pre-Pour Rebar & Spacer Verification)
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_rebar_prepour_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    audit_code TEXT NOT NULL,
    zone_label TEXT NOT NULL,
    slab_level TEXT NOT NULL DEFAULT 'FL-02',
    element_name TEXT NOT NULL,
    design_pitch_mm NUMERIC(8, 2) NOT NULL DEFAULT 150.00,
    measured_pitch_mm NUMERIC(8, 2) NOT NULL DEFAULT 150.00,
    design_spacer_density_sqm NUMERIC(6, 2) NOT NULL DEFAULT 4.00,
    measured_spacer_density_sqm NUMERIC(6, 2) NOT NULL DEFAULT 4.00,
    pitch_deviation_mm NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    circuit_breaker_status TEXT NOT NULL DEFAULT 'PASS_PERMITTED',
    blocking_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    photo_evidence_uris JSONB NOT NULL DEFAULT '[]'::jsonb,
    merkle_leaf_hash TEXT NOT NULL,
    audited_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    audited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, audit_code)
);

CREATE INDEX IF NOT EXISTS idx_rebar_audits_project ON engineering_rebar_prepour_audits(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rebar_audits_zone ON engineering_rebar_prepour_audits(project_id, zone_label);

ALTER TABLE engineering_rebar_prepour_audits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rebar_audits_project_scope') THEN
        CREATE POLICY rebar_audits_project_scope ON engineering_rebar_prepour_audits
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 4. ENGINEERING SMART IPC RECORDS (Instant 60s Gated Payment Release)
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_smart_ipc_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ipc_number TEXT NOT NULL,
    period_month TEXT NOT NULL,
    contractor_name TEXT NOT NULL,
    gross_claimed_vnd NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    net_payable_vnd NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    retention_amount_vnd NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    gate1_geometry_passed BOOLEAN NOT NULL DEFAULT true,
    gate2_bbnt_signed_passed BOOLEAN NOT NULL DEFAULT true,
    gate3_hydro_iot_passed BOOLEAN NOT NULL DEFAULT true,
    gate4_quad_reconcile_passed BOOLEAN NOT NULL DEFAULT true,
    all_gates_cleared BOOLEAN NOT NULL DEFAULT true,
    merkle_seal_hash TEXT NOT NULL,
    banking_payment_payload JSONB DEFAULT '{}'::jsonb,
    payment_status TEXT NOT NULL DEFAULT 'released',
    released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, ipc_number)
);

CREATE INDEX IF NOT EXISTS idx_smart_ipc_project ON engineering_smart_ipc_records(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_smart_ipc_status ON engineering_smart_ipc_records(project_id, payment_status);

ALTER TABLE engineering_smart_ipc_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'smart_ipc_project_scope') THEN
        CREATE POLICY smart_ipc_project_scope ON engineering_smart_ipc_records
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 5. ENGINEERING FIDIC TIA CLAIMS (Time Impact Analysis & Notice Engine)
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_fidic_tia_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    claim_code TEXT NOT NULL,
    delay_event_title TEXT NOT NULL,
    event_category TEXT NOT NULL,
    fidic_sub_clause TEXT NOT NULL DEFAULT 'Clause 20.1 (1999) / 20.2 (2017)',
    delay_start_date DATE NOT NULL,
    delay_end_date DATE NOT NULL,
    fragnet_duration_days INT NOT NULL DEFAULT 14,
    calculated_eot_days INT NOT NULL DEFAULT 14,
    daily_overhead_cost_vnd NUMERIC(14, 2) NOT NULL DEFAULT 15000000.00,
    total_prolongation_cost_vnd NUMERIC(16, 2) NOT NULL DEFAULT 210000000.00,
    impacted_critical_tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
    notice_letter_markdown TEXT NOT NULL,
    time_bar_deadline_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted',
    merkle_proof_hash TEXT NOT NULL,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, claim_code)
);

CREATE INDEX IF NOT EXISTS idx_fidic_tia_project ON engineering_fidic_tia_claims(project_id, created_at DESC);

ALTER TABLE engineering_fidic_tia_claims ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fidic_tia_project_scope') THEN
        CREATE POLICY fidic_tia_project_scope ON engineering_fidic_tia_claims
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;
