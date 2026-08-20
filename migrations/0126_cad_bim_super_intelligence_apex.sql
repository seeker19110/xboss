-- Migration 0126: CAD/BIM Super-Intelligence Apex Ecosystem (Module M76 / M92)
-- Bổ sung các bảng CSDL cho:
-- 1. engineering_corridor_layouts (Quy hoạch hành lang kỹ thuật đa tầng)
-- 2. engineering_trapeze_hangers (Tính toán kết cấu giá đỡ Trapeze đa tầng)
-- 3. engineering_hydraulic_networks (Đồ thị không gian & Cân bằng mạng thủy lực)
-- 4. engineering_spool_isometrics (Bản vẽ Isometric chế tạo DfMA Spool)
-- 5. engineering_modular_skids (Module hóa cụm thiết bị Skid tiền chế)
-- 6. engineering_carbon_lifecycle_records (Bản sao số 6D Carbon LCA & 7D MTBF/RUL)
-- 7. engineering_remnant_inventory (Kho phôi thừa tái sử dụng tối ưu Nesting < 0.8%)

-- ============================================================================
-- 1. ENGINEERING CORRIDOR LAYOUTS — Quy hoạch ma trận cao độ hành lang kỹ thuật
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_corridor_layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    corridor_code TEXT NOT NULL,
    title TEXT NOT NULL,
    tower_label TEXT NOT NULL DEFAULT 'Tower-A',
    floor_label TEXT NOT NULL DEFAULT 'FL-01',
    zone_label TEXT NOT NULL DEFAULT 'Zone-Corridor',
    corridor_width_mm NUMERIC(10, 2) NOT NULL DEFAULT 2400.00,
    corridor_clear_height_mm NUMERIC(10, 2) NOT NULL DEFAULT 2600.00,
    slab_bottom_elevation_mm NUMERIC(10, 2) NOT NULL DEFAULT 3500.00,
    beam_bottom_elevation_mm NUMERIC(10, 2) NOT NULL DEFAULT 3100.00,
    ceiling_elevation_mm NUMERIC(10, 2) NOT NULL DEFAULT 2600.00,
    available_service_depth_mm NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
    tier_allocation JSONB NOT NULL DEFAULT '[]'::jsonb,
    assigned_systems JSONB NOT NULL DEFAULT '[]'::jsonb,
    sprinkler_elevation_mm NUMERIC(10, 2) NOT NULL DEFAULT 2500.00,
    status TEXT NOT NULL DEFAULT 'optimized',
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, corridor_code)
);

CREATE INDEX IF NOT EXISTS idx_corridor_layouts_project ON engineering_corridor_layouts(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_corridor_layouts_spatial ON engineering_corridor_layouts(project_id, tower_label, floor_label);

ALTER TABLE engineering_corridor_layouts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'corridor_layouts_project_scope') THEN
        CREATE POLICY corridor_layouts_project_scope ON engineering_corridor_layouts
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 2. ENGINEERING TRAPEZE HANGERS — Tính toán kết cấu giá đỡ Trapeze đa tầng
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_trapeze_hangers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    hanger_code TEXT NOT NULL,
    corridor_layout_id UUID REFERENCES engineering_corridor_layouts(id) ON DELETE SET NULL,
    location_station_m NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    span_width_mm NUMERIC(10, 2) NOT NULL DEFAULT 1200.00,
    drop_length_mm NUMERIC(10, 2) NOT NULL DEFAULT 600.00,
    tiers_count INT NOT NULL DEFAULT 2,
    total_load_kg NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    factored_load_n NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    selected_unistrut_spec TEXT NOT NULL DEFAULT 'Unistrut P1000 41x41x2.5mm',
    unistrut_bending_stress_mpa NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    allowable_bending_stress_mpa NUMERIC(10, 2) NOT NULL DEFAULT 160.00,
    max_deflection_mm NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    allowable_deflection_mm NUMERIC(8, 2) NOT NULL DEFAULT 3.33,
    selected_rod_diameter_mm NUMERIC(6, 2) NOT NULL DEFAULT 10.00,
    rod_tensile_stress_mpa NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    safety_check_status TEXT NOT NULL DEFAULT 'pass',
    anchor_type TEXT NOT NULL DEFAULT 'M10 Wedge Anchor / Drop-in Anchor',
    lisp_script TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, hanger_code)
);

CREATE INDEX IF NOT EXISTS idx_trapeze_hangers_project ON engineering_trapeze_hangers(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trapeze_hangers_layout ON engineering_trapeze_hangers(corridor_layout_id);

ALTER TABLE engineering_trapeze_hangers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'trapeze_hangers_project_scope') THEN
        CREATE POLICY trapeze_hangers_project_scope ON engineering_trapeze_hangers
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 3. ENGINEERING HYDRAULIC NETWORKS — Đồ thị không gian & Cân bằng mạng thủy lực
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_hydraulic_networks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    network_code TEXT NOT NULL,
    system_type TEXT NOT NULL,
    title TEXT NOT NULL,
    nodes_graph JSONB NOT NULL DEFAULT '[]'::jsonb,
    edges_graph JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_flow_rate_lps NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    critical_run_path JSONB NOT NULL DEFAULT '[]'::jsonb,
    critical_pressure_drop_pa NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    critical_pressure_drop_bar NUMERIC(8, 4) NOT NULL DEFAULT 0.0000,
    balancing_valves_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'balanced',
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, network_code)
);

CREATE INDEX IF NOT EXISTS idx_hydraulic_networks_project ON engineering_hydraulic_networks(project_id, created_at DESC);

ALTER TABLE engineering_hydraulic_networks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hydraulic_networks_project_scope') THEN
        CREATE POLICY hydraulic_networks_project_scope ON engineering_hydraulic_networks
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 4. ENGINEERING SPOOL ISOMETRICS — Bản vẽ Isometric DfMA Spool & Micro-BOM
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_spool_isometrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    spool_code TEXT NOT NULL,
    discipline TEXT NOT NULL DEFAULT 'MEPF',
    system_code TEXT NOT NULL,
    nominal_diameter_mm NUMERIC(8, 2) NOT NULL DEFAULT 50.00,
    pipe_material TEXT NOT NULL DEFAULT 'Galvanized Steel / Sch40',
    centerline_length_mm NUMERIC(10, 2) NOT NULL,
    cut_length_mm NUMERIC(10, 2) NOT NULL,
    socket_insertion_deduction_mm NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    field_fit_allowance_mm NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    bubble_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    micro_bom_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    svg_isometric_vector TEXT,
    qr_spool_token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ready_for_fab',
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, spool_code)
);

CREATE INDEX IF NOT EXISTS idx_spool_isometrics_project ON engineering_spool_isometrics(project_id, system_code);

ALTER TABLE engineering_spool_isometrics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'spool_isometrics_project_scope') THEN
        CREATE POLICY spool_isometrics_project_scope ON engineering_spool_isometrics
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 5. ENGINEERING MODULAR SKIDS — Module hóa cụm thiết bị đúc sẵn DfMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_modular_skids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    skid_code TEXT NOT NULL,
    skid_type TEXT NOT NULL,
    title TEXT NOT NULL,
    frame_width_mm NUMERIC(10, 2) NOT NULL DEFAULT 1200.00,
    frame_length_mm NUMERIC(10, 2) NOT NULL DEFAULT 2400.00,
    frame_height_mm NUMERIC(10, 2) NOT NULL DEFAULT 1800.00,
    total_skid_weight_kg NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    included_equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
    included_spools JSONB NOT NULL DEFAULT '[]'::jsonb,
    inlet_flange_spec TEXT NOT NULL DEFAULT 'DN100 PN16 Flange',
    outlet_flange_spec TEXT NOT NULL DEFAULT 'DN100 PN16 Flange',
    electrical_kw_rating NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    qr_skid_token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'designed',
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, skid_code)
);

CREATE INDEX IF NOT EXISTS idx_modular_skids_project ON engineering_modular_skids(project_id, skid_type);

ALTER TABLE engineering_modular_skids ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'modular_skids_project_scope') THEN
        CREATE POLICY modular_skids_project_scope ON engineering_modular_skids
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 6. ENGINEERING CARBON LIFECYCLE RECORDS — 6D Carbon LCA & 7D Asset Management
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_carbon_lifecycle_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    record_code TEXT NOT NULL,
    element_type TEXT NOT NULL,
    system_code TEXT NOT NULL,
    material_category TEXT NOT NULL,
    weight_kg NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    carbon_factor_kg_co2e_per_kg NUMERIC(8, 4) NOT NULL DEFAULT 2.1000,
    embodied_carbon_kg_co2e NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    asset_guid TEXT,
    equipment_serial TEXT,
    mtbf_hours INT NOT NULL DEFAULT 20000,
    expected_lifespan_years INT NOT NULL DEFAULT 15,
    remaining_useful_life_percent NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    maintenance_cycle_days INT NOT NULL DEFAULT 90,
    next_maintenance_due TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active',
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, record_code)
);

CREATE INDEX IF NOT EXISTS idx_carbon_lifecycle_project ON engineering_carbon_lifecycle_records(project_id, material_category);

ALTER TABLE engineering_carbon_lifecycle_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'carbon_lifecycle_project_scope') THEN
        CREATE POLICY carbon_lifecycle_project_scope ON engineering_carbon_lifecycle_records
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 7. ENGINEERING REMNANT INVENTORY — Quản lý phôi thừa tối ưu Nesting < 0.8%
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_remnant_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    remnant_barcode TEXT NOT NULL,
    material_type TEXT NOT NULL,
    spec_dimension TEXT NOT NULL,
    length_mm NUMERIC(10, 2) NOT NULL,
    width_mm NUMERIC(10, 2),
    thickness_mm NUMERIC(6, 2) DEFAULT 1.00,
    warehouse_bin_location TEXT DEFAULT 'RACK-REMNANT-01',
    is_allocated BOOLEAN NOT NULL DEFAULT false,
    allocated_to_spool_code TEXT,
    status TEXT NOT NULL DEFAULT 'available',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, remnant_barcode)
);

CREATE INDEX IF NOT EXISTS idx_remnant_inv_project ON engineering_remnant_inventory(project_id, material_type, status);

ALTER TABLE engineering_remnant_inventory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'remnant_inv_project_scope') THEN
        CREATE POLICY remnant_inv_project_scope ON engineering_remnant_inventory
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;
