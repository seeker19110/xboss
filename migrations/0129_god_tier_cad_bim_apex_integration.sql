-- Migration 0129: Module M96 — God-Tier CAD/BIM Apex Integration & WebGPU Spatial Hub
-- Bổ sung các bảng CSDL cho:
-- 1. engineering_god_tier_models (Mô hình hình học LOD 400+, Octree phân cấp, WebGPU instanced mesh)
-- 2. engineering_god_tier_clashes (Ma trận xung đột không gian, giải pháp nắn tuyến 45 độ, độ hở clearance)

-- ============================================================================
-- 1. ENGINEERING GOD TIER MODELS
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_god_tier_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    model_code TEXT NOT NULL,
    name TEXT NOT NULL,
    discipline TEXT NOT NULL DEFAULT 'combined',
    lod_level TEXT NOT NULL DEFAULT 'LOD_400',
    total_elements INT NOT NULL DEFAULT 0,
    instanced_mesh_url TEXT,
    spatial_octree_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    bounding_box JSONB NOT NULL DEFAULT '{"min": [0,0,0], "max": [0,0,0]}'::jsonb,
    merkle_root_hash TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, model_code)
);

CREATE INDEX IF NOT EXISTS idx_eng_gt_models_project ON engineering_god_tier_models(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eng_gt_models_discipline ON engineering_god_tier_models(project_id, discipline);

ALTER TABLE engineering_god_tier_models ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'eng_gt_models_project_scope') THEN
        CREATE POLICY eng_gt_models_project_scope ON engineering_god_tier_models
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;

-- ============================================================================
-- 2. ENGINEERING GOD TIER CLASHES
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_god_tier_clashes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    model_id UUID NOT NULL REFERENCES engineering_god_tier_models(id) ON DELETE CASCADE,
    clash_code TEXT NOT NULL,
    element_a_guid TEXT NOT NULL,
    element_b_guid TEXT NOT NULL,
    element_a_type TEXT NOT NULL,
    element_b_type TEXT NOT NULL,
    spatial_point JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "z": 0}'::jsonb,
    clearance_mm NUMERIC(10, 2) NOT NULL DEFAULT 0,
    reroute_solution JSONB,
    status TEXT NOT NULL DEFAULT 'detected',
    resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, clash_code)
);

CREATE INDEX IF NOT EXISTS idx_eng_gt_clashes_project_status ON engineering_god_tier_clashes(project_id, status);
CREATE INDEX IF NOT EXISTS idx_eng_gt_clashes_model ON engineering_god_tier_clashes(model_id);

ALTER TABLE engineering_god_tier_clashes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'eng_gt_clashes_project_scope') THEN
        CREATE POLICY eng_gt_clashes_project_scope ON engineering_god_tier_clashes
            USING (project_id::text = current_setting('app.project_id', true)
                   OR current_setting('app.project_id', true) = '*');
    END IF;
END $$;
