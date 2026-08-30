-- Migration 0125: Ductwork Length Accumulation, Diffuser Alignment & Plenum +10mm Clearance (Module M75 / M91)
-- Tạo 2 bảng: engineering_duct_plenum_boxes, engineering_duct_diffuser_alignments

-- ============================================================================
-- 1. ENGINEERING DUCT PLENUM BOXES — Thông số chế tạo hộp gió chuẩn dung sai +10mm
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_duct_plenum_boxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plenum_code TEXT NOT NULL,
    system_code TEXT NOT NULL DEFAULT 'ACMV_SUPPLY',
    diffuser_type TEXT NOT NULL DEFAULT 'square_4way', -- square_4way | linear_slot | round | exhaust_grille | linear_bar
    diffuser_neck_width_mm NUMERIC(8, 2) NOT NULL,
    diffuser_neck_height_mm NUMERIC(8, 2) NOT NULL,
    diffuser_face_width_mm NUMERIC(8, 2) NOT NULL,
    diffuser_face_height_mm NUMERIC(8, 2) NOT NULL,
    -- Quy tắc vàng gót hộp gió +10mm
    plenum_opening_width_mm NUMERIC(8, 2) NOT NULL,
    plenum_opening_height_mm NUMERIC(8, 2) NOT NULL,
    clearance_applied_mm NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    plenum_box_height_mm NUMERIC(8, 2) NOT NULL DEFAULT 300.00,
    -- Cổ trích ống mềm (Spigot D - 5mm)
    spigot_dia_mm NUMERIC(8, 2) NOT NULL DEFAULT 200.00,
    spigot_length_mm NUMERIC(6, 2) NOT NULL DEFAULT 60.00,
    spigots_count INT NOT NULL DEFAULT 1,
    has_obd_damper BOOLEAN NOT NULL DEFAULT false,
    insulation_type TEXT NOT NULL DEFAULT 'internal_rubber_15mm', -- none | internal_rubber_15mm | external_aeroflex_25mm | internal_acoustic_fiber_25mm
    sheet_metal_area_m2 NUMERIC(8, 4) NOT NULL DEFAULT 0.0000,
    tower_label TEXT DEFAULT 'Tower-A',
    floor_label TEXT DEFAULT 'FL-01',
    zone_label TEXT DEFAULT 'Zone-1',
    apartment_label TEXT,
    target_ceiling_coordinate JSONB NOT NULL DEFAULT '[0, 0, 2700]'::jsonb,
    qr_plenum_token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'designed', -- designed | fabricated | delivered | installed | qc_passed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, plenum_code)
);

CREATE INDEX IF NOT EXISTS idx_plenum_boxes_project ON engineering_duct_plenum_boxes(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plenum_boxes_spatial ON engineering_duct_plenum_boxes(project_id, tower_label, floor_label, apartment_label);

ALTER TABLE engineering_duct_plenum_boxes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'plenum_boxes_project_scope') THEN
        CREATE POLICY plenum_boxes_project_scope ON engineering_duct_plenum_boxes
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 2. ENGINEERING DUCT DIFFUSER ALIGNMENTS — Kết quả căn chỉnh tim miệng gió trần
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_duct_diffuser_alignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    alignment_code TEXT NOT NULL,
    ductline_code TEXT NOT NULL,
    plenum_code TEXT NOT NULL,
    target_ceiling_grid_x_mm NUMERIC(10, 2) NOT NULL,
    target_ceiling_grid_y_mm NUMERIC(10, 2) NOT NULL,
    target_ceiling_grid_z_mm NUMERIC(10, 2) NOT NULL,
    accumulated_drift_mm NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    flange_accumulated_mm NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    accessories_accumulated_mm NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    canvas_expansion_mm NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    nominal_straight_cut_length_mm NUMERIC(10, 2) NOT NULL,
    adjusted_straight_cut_length_mm NUMERIC(10, 2) NOT NULL,
    final_deviation_from_grid_mm NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    is_aligned_zero_drift BOOLEAN NOT NULL DEFAULT true,
    flexible_duct_cut_length_m NUMERIC(6, 3) NOT NULL DEFAULT 1.500,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, alignment_code)
);

CREATE INDEX IF NOT EXISTS idx_diffuser_align_project ON engineering_duct_diffuser_alignments(project_id, ductline_code);

ALTER TABLE engineering_duct_diffuser_alignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'diffuser_align_project_scope') THEN
        CREATE POLICY diffuser_align_project_scope ON engineering_duct_diffuser_alignments
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;
