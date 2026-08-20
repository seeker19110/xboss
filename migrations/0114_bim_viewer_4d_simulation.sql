-- Migration 0114: 3D BIM/IFC Web Viewer & 4D Construction Simulation Studio (M80)
-- Quản lý mô hình 3D BIM/IFC, các thực thể hình học MEPF, liên kết WBS và kịch bản mô phỏng tiến độ 4D.

CREATE TABLE IF NOT EXISTS engineering_bim_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    discipline TEXT NOT NULL DEFAULT 'mepf', -- hvac | plumbing | electrical | firefighting | structure | combined
    floor_id BIGINT,
    format TEXT NOT NULL DEFAULT 'json_mesh', -- ifc | gltf | json_mesh
    file_url TEXT,
    file_hash TEXT,
    element_count INT NOT NULL DEFAULT 0,
    bounding_box JSONB NOT NULL DEFAULT '{"min": [0,0,0], "max": [100,100,30]}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engineering_bim_models_project ON engineering_bim_models(project_id);
CREATE INDEX IF NOT EXISTS idx_engineering_bim_models_discipline ON engineering_bim_models(project_id, discipline);

CREATE TABLE IF NOT EXISTS engineering_bim_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES engineering_bim_models(id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    guid TEXT NOT NULL,
    element_type TEXT NOT NULL, -- DUCT_STRAIGHT | DUCT_ELBOW | DUCT_TEE | PIPE_STRAIGHT | PIPE_VALVE | CABLE_TRAY | AIR_TERMINAL | EQUIPMENT | SLAB | BEAM
    system_type TEXT NOT NULL DEFAULT 'HVAC_SUPPLY', -- HVAC_SUPPLY | HVAC_RETURN | PLUMBING_WATER | PLUMBING_DRAINAGE | ELECTRICAL_POWER | FIRE_SPRINKLER
    name TEXT NOT NULL,
    geometry_data JSONB NOT NULL, -- { vertices: [...], dimensions: { width, height, length, diameter }, path: [...] }
    properties JSONB NOT NULL DEFAULT '{}'::jsonb, -- { pset: { airflow, pressure_drop, material, elevation, insulation } }
    wbs_task_id BIGINT REFERENCES tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bim_element_model_guid UNIQUE (model_id, guid)
);

CREATE INDEX IF NOT EXISTS idx_engineering_bim_elements_model ON engineering_bim_elements(model_id);
CREATE INDEX IF NOT EXISTS idx_engineering_bim_elements_project ON engineering_bim_elements(project_id);
CREATE INDEX IF NOT EXISTS idx_engineering_bim_elements_wbs_task ON engineering_bim_elements(wbs_task_id);
CREATE INDEX IF NOT EXISTS idx_engineering_bim_elements_system ON engineering_bim_elements(project_id, system_type);

CREATE TABLE IF NOT EXISTS engineering_bim_4d_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    model_id UUID NOT NULL REFERENCES engineering_bim_models(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    current_time_step INT NOT NULL DEFAULT 0,
    settings JSONB NOT NULL DEFAULT '{"playbackSpeed": 1, "colorScheme": "status", "showGhost": true}'::jsonb,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engineering_bim_4d_simulations_project ON engineering_bim_4d_simulations(project_id);

-- RLS Strict
ALTER TABLE engineering_bim_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_bim_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_bim_4d_simulations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engineering_bim_models' AND policyname = 'engineering_bim_models_project_scope') THEN
        CREATE POLICY engineering_bim_models_project_scope ON engineering_bim_models
            FOR ALL USING (
                project_id::text = current_setting('app.project_id', true)
                OR current_setting('app.project_id', true) = '*'
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engineering_bim_elements' AND policyname = 'engineering_bim_elements_project_scope') THEN
        CREATE POLICY engineering_bim_elements_project_scope ON engineering_bim_elements
            FOR ALL USING (
                project_id::text = current_setting('app.project_id', true)
                OR current_setting('app.project_id', true) = '*'
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engineering_bim_4d_simulations' AND policyname = 'engineering_bim_4d_simulations_project_scope') THEN
        CREATE POLICY engineering_bim_4d_simulations_project_scope ON engineering_bim_4d_simulations
            FOR ALL USING (
                project_id::text = current_setting('app.project_id', true)
                OR current_setting('app.project_id', true) = '*'
            );
    END IF;
END $$;
