-- Migration 0128: Module M95 — Pipe Mass-Balance Reconciliation & Geolocation Stash Hunter
-- Bổ sung các bảng CSDL cho:
-- 1. engineering_pipe_spool_tracking (Vòng đời không gian từng đốt ống Spool có mã QR)
-- 2. engineering_material_mass_balance_audits (Sổ đối soát cân bằng vật chất 5 chiều)

-- ============================================================================
-- 1. ENGINEERING PIPE SPOOL TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_pipe_spool_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    spool_code TEXT NOT NULL,
    system_code TEXT NOT NULL,
    nominal_dia_mm NUMERIC(8, 2) NOT NULL,
    material_type TEXT NOT NULL,
    design_length_mm NUMERIC(10, 2) NOT NULL,
    cut_length_mm NUMERIC(10, 2) NOT NULL,
    tower_label TEXT NOT NULL DEFAULT 'Tower-A',
    floor_label TEXT NOT NULL DEFAULT 'FL-12',
    zone_label TEXT NOT NULL DEFAULT 'Zone-01',
    spatial_coords_start JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "z": 0}'::jsonb,
    spatial_coords_end JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "z": 0}'::jsonb,
    current_status TEXT NOT NULL DEFAULT 'PO_ORDERED',
    current_location_tag TEXT DEFAULT 'CENTRAL_YARD_BIN_A4',
    staged_at TIMESTAMPTZ,
    holding_time_hours NUMERIC(8, 2) DEFAULT 0.00,
    installed_at TIMESTAMPTZ,
    scan_deviation_mm NUMERIC(6, 2),
    assigned_subcon_id BIGINT REFERENCES subcontractors(id) ON DELETE SET NULL,
    qr_spool_token TEXT NOT NULL,
    merkle_leaf_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, spool_code)
);

CREATE INDEX IF NOT EXISTS idx_pipe_spool_track_proj ON engineering_pipe_spool_tracking(project_id, current_status);
CREATE INDEX IF NOT EXISTS idx_pipe_spool_track_loc ON engineering_pipe_spool_tracking(project_id, floor_label, zone_label);

ALTER TABLE engineering_pipe_spool_tracking ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pipe_spool_track_project_scope') THEN
        CREATE POLICY pipe_spool_track_project_scope ON engineering_pipe_spool_tracking
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 2. ENGINEERING MATERIAL MASS BALANCE AUDITS
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_material_mass_balance_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    audit_code TEXT NOT NULL,
    system_code TEXT NOT NULL,
    nominal_dia_mm NUMERIC(8, 2) NOT NULL,
    total_bim_design_m NUMERIC(12, 3) NOT NULL,
    total_po_ordered_m NUMERIC(12, 3) NOT NULL,
    total_grn_received_m NUMERIC(12, 3) NOT NULL,
    total_installed_verified_m NUMERIC(12, 3) NOT NULL,
    total_staged_on_floors_m NUMERIC(12, 3) NOT NULL,
    total_in_central_warehouse_m NUMERIC(12, 3) NOT NULL,
    total_reusable_remnants_m NUMERIC(12, 3) NOT NULL,
    total_scrap_logged_m NUMERIC(12, 3) NOT NULL,
    delta_unaccounted_or_stash_m NUMERIC(12, 3) NOT NULL,
    remaining_to_install_m NUMERIC(12, 3) NOT NULL,
    remaining_to_procure_m NUMERIC(12, 3) NOT NULL,
    progress_percentage NUMERIC(6, 2) NOT NULL,
    stash_risk_status TEXT NOT NULL DEFAULT 'CLEAN_BALANCED',
    suspect_locations JSONB NOT NULL DEFAULT '[]'::jsonb,
    audited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    audited_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    merkle_seal_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, audit_code)
);

CREATE INDEX IF NOT EXISTS idx_mass_balance_proj ON engineering_material_mass_balance_audits(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mass_balance_system ON engineering_material_mass_balance_audits(project_id, system_code);

ALTER TABLE engineering_material_mass_balance_audits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mass_balance_project_scope') THEN
        CREATE POLICY mass_balance_project_scope ON engineering_material_mass_balance_audits
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;
