-- Migration 0122: CAD/BIM Professional Pinnacle Upgrade (Module M89)
-- Tạo 5 bảng mới: pipe_nesting_runs, pipe_nesting_cuts, hydraulic_checks, bcf_issues, bim_routing_runs

-- ============================================================================
-- 1. PIPE NESTING RUNS — Kết quả phiên tối ưu cắt phôi 1D (FFD Algorithm)
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_pipe_nesting_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    run_code TEXT NOT NULL,
    discipline TEXT NOT NULL DEFAULT 'hvac', -- hvac | plumbing | electrical | firefighting | gas | combined
    stock_length_mm NUMERIC(10, 2) NOT NULL DEFAULT 6000.00,
    kerf_mm NUMERIC(5, 2) NOT NULL DEFAULT 2.00,
    total_segments INT NOT NULL DEFAULT 0,
    total_bars_used INT NOT NULL DEFAULT 0,
    total_used_length_mm NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_waste_mm NUMERIC(14, 2) NOT NULL DEFAULT 0,
    waste_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    efficiency_grade TEXT NOT NULL DEFAULT 'F', -- A | B | C | D | F
    nesting_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, run_code)
);

CREATE INDEX IF NOT EXISTS idx_pipe_nesting_runs_project ON engineering_pipe_nesting_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipe_nesting_runs_discipline ON engineering_pipe_nesting_runs(project_id, discipline);

ALTER TABLE engineering_pipe_nesting_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pipe_nesting_runs_project_scope') THEN
        CREATE POLICY pipe_nesting_runs_project_scope ON engineering_pipe_nesting_runs
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 2. HYDRAULIC CHECKS — Kết quả kiểm tra thủy lực / khí động MEPF
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_hydraulic_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    check_code TEXT NOT NULL,
    system_type TEXT NOT NULL DEFAULT 'domestic_water', -- domestic_water | chilled_water | pump_suction | duct_branch | duct_main | hvac_ahu | fire_sprinkler
    formula_used TEXT NOT NULL DEFAULT 'hazen_williams',  -- hazen_williams | darcy_weisbach | duct_sizing
    flow_rate_lps NUMERIC(10, 4),
    pipe_diameter_mm NUMERIC(8, 2),
    pipe_length_m NUMERIC(10, 3),
    roughness_mm NUMERIC(6, 4),
    fluid_temp_c NUMERIC(5, 2) DEFAULT 25.0,
    velocity_ms NUMERIC(8, 4),
    reynolds_number NUMERIC(12, 2),
    friction_factor NUMERIC(10, 6),
    head_loss_per_m_pa NUMERIC(12, 4),
    total_head_loss_pa NUMERIC(14, 4),
    pressure_drop_bar NUMERIC(10, 6),
    -- Duct sizing fields
    airflow_cfm NUMERIC(12, 2),
    duct_width_mm NUMERIC(8, 2),
    duct_height_mm NUMERIC(8, 2),
    -- Validation
    velocity_limit_ms NUMERIC(8, 4),
    velocity_ok BOOLEAN NOT NULL DEFAULT true,
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pass', -- pass | warning | fail
    linked_spool_code TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, check_code)
);

CREATE INDEX IF NOT EXISTS idx_hydraulic_checks_project ON engineering_hydraulic_checks(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hydraulic_checks_system ON engineering_hydraulic_checks(project_id, system_type);
CREATE INDEX IF NOT EXISTS idx_hydraulic_checks_status ON engineering_hydraulic_checks(project_id, status);

ALTER TABLE engineering_hydraulic_checks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hydraulic_checks_project_scope') THEN
        CREATE POLICY hydraulic_checks_project_scope ON engineering_hydraulic_checks
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 3. BCF ISSUES — BIM Collaboration Format Issue Tracker (openBIM ISO 21597)
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_bcf_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    bcf_code TEXT NOT NULL,   -- BCF-2025-0001, ...
    title TEXT NOT NULL,
    description TEXT,
    discipline TEXT NOT NULL DEFAULT 'combined', -- hvac | plumbing | electrical | firefighting | structure | architecture | combined
    issue_type TEXT NOT NULL DEFAULT 'clash', -- clash | rfi | design_query | ncr | observation
    severity TEXT NOT NULL DEFAULT 'medium',  -- low | medium | high | critical
    status TEXT NOT NULL DEFAULT 'open',       -- open | in_review | resolved | closed | wont_fix
    -- Camera 3D Viewpoint (BCF Viewpoint chuẩn)
    camera_position JSONB,   -- {x, y, z} (m)
    camera_direction JSONB,  -- {x, y, z} unit vector
    camera_up JSONB,         -- {x, y, z} unit vector
    camera_fov_deg NUMERIC(5, 2) DEFAULT 60.0,
    -- Linked elements
    clash_element_a_guid TEXT,
    clash_element_b_guid TEXT,
    linked_clash_code TEXT,
    linked_spool_code TEXT,
    -- Workflow
    assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
    due_date DATE,
    resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT,
    -- Attachments (ảnh, PDF)
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, bcf_code)
);

CREATE INDEX IF NOT EXISTS idx_bcf_issues_project ON engineering_bcf_issues(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bcf_issues_status ON engineering_bcf_issues(project_id, status);
CREATE INDEX IF NOT EXISTS idx_bcf_issues_severity ON engineering_bcf_issues(project_id, severity);
CREATE INDEX IF NOT EXISTS idx_bcf_issues_assignee ON engineering_bcf_issues(assigned_to);

ALTER TABLE engineering_bcf_issues ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bcf_issues_project_scope') THEN
        CREATE POLICY bcf_issues_project_scope ON engineering_bcf_issues
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 4. BIM ROUTING RUNS — Kết quả phiên Auto-Routing A* 3D
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_bim_routing_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    routing_code TEXT NOT NULL,
    discipline TEXT NOT NULL DEFAULT 'hvac',
    system_code TEXT,
    -- Grid configuration
    grid_cell_size_mm NUMERIC(8, 2) NOT NULL DEFAULT 100.0,
    start_point JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {x, y, z} mm
    end_point JSONB NOT NULL DEFAULT '{}'::jsonb,     -- {x, y, z} mm
    -- Result
    path_points JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{x,y,z}...]
    total_length_m NUMERIC(12, 3),
    elbow_count INT DEFAULT 0,
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    violates_gravity_slope BOOLEAN NOT NULL DEFAULT false,
    violates_structural_zone BOOLEAN NOT NULL DEFAULT false,
    routing_status TEXT NOT NULL DEFAULT 'success', -- success | no_path | partial | error
    -- Linked objects
    linked_spool_code TEXT,
    bcf_issue_id UUID REFERENCES engineering_bcf_issues(id) ON DELETE SET NULL,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, routing_code)
);

CREATE INDEX IF NOT EXISTS idx_bim_routing_runs_project ON engineering_bim_routing_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bim_routing_runs_status ON engineering_bim_routing_runs(project_id, routing_status);

ALTER TABLE engineering_bim_routing_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bim_routing_runs_project_scope') THEN
        CREATE POLICY bim_routing_runs_project_scope ON engineering_bim_routing_runs
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;
