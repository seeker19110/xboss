-- Migration 0123: Pipe Spooling, Fitting Deduction & Micro-BOM Engine (Module M74 / M90)
-- Bảng: engineering_pipe_spools, engineering_pipe_spool_fittings, engineering_pipe_micro_bom_items, engineering_pipe_remnant_inventory

-- ============================================================================
-- 1. ENGINEERING PIPE SPOOLS — Danh mục đốt Spool tiền chế xưởng LOD 400
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_pipe_spools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    spool_code TEXT NOT NULL,
    system_code TEXT NOT NULL DEFAULT 'PLUMBING_WATER', -- PLUMBING_WATER | DRAINAGE | FIRE_SPRINKLER | CHILLED_WATER | CONDENSER | HVAC_REFRIGERANT
    discipline TEXT NOT NULL DEFAULT 'plumbing',
    material_type TEXT NOT NULL DEFAULT 'upvc', -- upvc | cpvc | ppr | hdpe | steel_threaded | steel_grooved | steel_welded | copper
    nominal_dia_mm NUMERIC(8, 2) NOT NULL,
    outer_dia_mm NUMERIC(8, 2) NOT NULL,
    c_to_c_length_mm NUMERIC(10, 2) NOT NULL,
    cut_length_mm NUMERIC(10, 2) NOT NULL,
    slope_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    weight_kg NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    end1_prep TEXT NOT NULL DEFAULT 'plain', -- plain | socket | bevel_37_5 | thread_npt | thread_bspt | roll_groove | slip_on_flange | weld_neck_flange
    end2_prep TEXT NOT NULL DEFAULT 'plain',
    field_fit_allowance_mm NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    zone_label TEXT,
    floor_label TEXT,
    drawing_ref TEXT,
    qr_fabrication_token TEXT NOT NULL,
    isometric_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'designed', -- designed | cutting | fabricated | qc_passed | delivered | installed | tested | bbnt_approved
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, spool_code)
);

CREATE INDEX IF NOT EXISTS idx_pipe_spools_project ON engineering_pipe_spools(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipe_spools_system ON engineering_pipe_spools(project_id, system_code);
CREATE INDEX IF NOT EXISTS idx_pipe_spools_status ON engineering_pipe_spools(project_id, status);

ALTER TABLE engineering_pipe_spools ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pipe_spools_project_scope') THEN
        CREATE POLICY pipe_spools_project_scope ON engineering_pipe_spools
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 2. ENGINEERING PIPE SPOOL FITTINGS — Chi tiết phụ kiện gắn liền Spool
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_pipe_spool_fittings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    spool_id UUID NOT NULL REFERENCES engineering_pipe_spools(id) ON DELETE CASCADE,
    fitting_code TEXT NOT NULL,
    fitting_type TEXT NOT NULL, -- elbow_90 | elbow_45 | tee_equal | tee_reducing | reducer_concentric | reducer_eccentric | coupling_socket | union | flange | cap | valve | y_strainer
    nominal_dia_primary_mm NUMERIC(8, 2) NOT NULL,
    nominal_dia_secondary_mm NUMERIC(8, 2),
    material_type TEXT NOT NULL DEFAULT 'upvc',
    center_to_face_mm NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    socket_depth_mm NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    take_off_mm NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    stop_ridge_mm NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    is_field_installed BOOLEAN NOT NULL DEFAULT false, -- false: ráp xưởng | true: kitting giao hiện trường
    quantity INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spool_fittings_spool ON engineering_pipe_spool_fittings(spool_id);
CREATE INDEX IF NOT EXISTS idx_spool_fittings_project ON engineering_pipe_spool_fittings(project_id);

ALTER TABLE engineering_pipe_spool_fittings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'spool_fittings_project_scope') THEN
        CREATE POLICY spool_fittings_project_scope ON engineering_pipe_spool_fittings
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 3. ENGINEERING PIPE MICRO BOM ITEMS — Bóc tách 5 Cấp Độ
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_pipe_micro_bom_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    spool_id UUID REFERENCES engineering_pipe_spools(id) ON DELETE CASCADE,
    level_tier INT NOT NULL CHECK (level_tier BETWEEN 1 AND 5), -- 1: Pipe | 2: Fittings | 3: Valves/Trims | 4: Fasteners/Gaskets/Adhesives | 5: Supports/Insulation/Tags
    category TEXT NOT NULL, -- main_pipe | primary_fitting | valve_trim | fastener_seal | support_insulation
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    spec TEXT NOT NULL,
    quantity NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    unit TEXT NOT NULL,
    unit_cost_vnd NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_cost_vnd NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    is_kitted BOOLEAN NOT NULL DEFAULT false, -- true: đã đóng gói vào kitting box
    kitting_box_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_micro_bom_project ON engineering_pipe_micro_bom_items(project_id, level_tier);
CREATE INDEX IF NOT EXISTS idx_micro_bom_spool ON engineering_pipe_micro_bom_items(spool_id);

ALTER TABLE engineering_pipe_micro_bom_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'micro_bom_project_scope') THEN
        CREATE POLICY micro_bom_project_scope ON engineering_pipe_micro_bom_items
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 4. ENGINEERING PIPE REMNANT INVENTORY — Quản lý Phôi Thừa Tái Sử Dụng
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_pipe_remnant_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    remnant_code TEXT NOT NULL,
    diameter_mm NUMERIC(8, 2) NOT NULL,
    material_type TEXT NOT NULL,
    remaining_length_mm NUMERIC(10, 2) NOT NULL,
    source_stock_bar_code TEXT,
    warehouse_bin_location TEXT,
    qr_tag_token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available', -- available | reserved | consumed | scrapped
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, remnant_code)
);

CREATE INDEX IF NOT EXISTS idx_pipe_remnants_project ON engineering_pipe_remnant_inventory(project_id, status);
CREATE INDEX IF NOT EXISTS idx_pipe_remnants_spec ON engineering_pipe_remnant_inventory(project_id, material_type, diameter_mm);

ALTER TABLE engineering_pipe_remnant_inventory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pipe_remnants_project_scope') THEN
        CREATE POLICY pipe_remnants_project_scope ON engineering_pipe_remnant_inventory
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;
