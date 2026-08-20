-- Migration 0124: Multi-Dimensional Spatial Hierarchy QTO & Apartment Kitting (Module M74 / M90)
-- Mở rộng bảng engineering_pipe_spools, engineering_pipe_micro_bom_items và tạo bảng engineering_pipe_spatial_qto_summaries

-- ============================================================================
-- 1. BỔ SUNG CỘT KHÔNG GIAN CHO PIPE SPOOLS
-- ============================================================================

ALTER TABLE engineering_pipe_spools
    ADD COLUMN IF NOT EXISTS tower_label TEXT DEFAULT 'Tower-A',
    ADD COLUMN IF NOT EXISTS shaft_label TEXT,
    ADD COLUMN IF NOT EXISTS apartment_label TEXT,
    ADD COLUMN IF NOT EXISTS pipeline_code TEXT;

CREATE INDEX IF NOT EXISTS idx_pipe_spools_spatial ON engineering_pipe_spools(project_id, tower_label, floor_label, zone_label, apartment_label);
CREATE INDEX IF NOT EXISTS idx_pipe_spools_shaft ON engineering_pipe_spools(project_id, shaft_label);
CREATE INDEX IF NOT EXISTS idx_pipe_spools_pipeline ON engineering_pipe_spools(project_id, pipeline_code);

-- ============================================================================
-- 2. BỔ SUNG CỘT KHÔNG GIAN CHO MICRO BOM ITEMS
-- ============================================================================

ALTER TABLE engineering_pipe_micro_bom_items
    ADD COLUMN IF NOT EXISTS tower_label TEXT DEFAULT 'Tower-A',
    ADD COLUMN IF NOT EXISTS floor_label TEXT,
    ADD COLUMN IF NOT EXISTS shaft_label TEXT,
    ADD COLUMN IF NOT EXISTS zone_label TEXT,
    ADD COLUMN IF NOT EXISTS apartment_label TEXT,
    ADD COLUMN IF NOT EXISTS pipeline_code TEXT;

CREATE INDEX IF NOT EXISTS idx_micro_bom_spatial ON engineering_pipe_micro_bom_items(project_id, tower_label, floor_label, apartment_label);
CREATE INDEX IF NOT EXISTS idx_micro_bom_shaft ON engineering_pipe_micro_bom_items(project_id, shaft_label);

-- ============================================================================
-- 3. TẠO BẢNG SPATIAL QTO SUMMARIES — Lưu trữ tổng hợp đa chiều
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_pipe_spatial_qto_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    dimension_type TEXT NOT NULL, -- tower | floor | shaft | zone | apartment | pipeline
    dimension_key TEXT NOT NULL,  -- e.g. "A10.01", "SHAFT-PL01", "FL10", "TOWER-A"
    filter_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_spools_count INT NOT NULL DEFAULT 0,
    total_cut_length_m NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    pipe_summary_by_spec JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"uPVC_DN114": 12.5, "PPR_DN25": 18.2}
    fittings_count_by_type JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"elbow_90": 8, "tee_equal": 3, "coupling": 5}
    consumables_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    supports_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_cost_vnd NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    kitting_box_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, dimension_type, dimension_key)
);

CREATE INDEX IF NOT EXISTS idx_spatial_qto_project ON engineering_pipe_spatial_qto_summaries(project_id, dimension_type);

ALTER TABLE engineering_pipe_spatial_qto_summaries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'spatial_qto_project_scope') THEN
        CREATE POLICY spatial_qto_project_scope ON engineering_pipe_spatial_qto_summaries
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;
