-- Migration 0111: Auto-Routing 3D Pathfinding & Beam Sleeve Clash Solver (M77)
-- Quản lý tuyến ống/cáp tự động tránh va chạm và bảng thống kê lỗ khoét dầm (Beam Sleeve Schedule) chuẩn kỹ thuật

CREATE TABLE IF NOT EXISTS engineering_sleeve_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  drawing_code TEXT NOT NULL,
  floor_id TEXT,
  beam_ref TEXT NOT NULL,
  sleeve_type TEXT NOT NULL DEFAULT 'pipe_sleeve' CHECK (sleeve_type IN ('pipe_sleeve', 'duct_sleeve', 'cable_sleeve', 'box_opening')),
  diameter_mm NUMERIC(8, 2) NOT NULL,
  width_mm NUMERIC(8, 2),
  height_mm NUMERIC(8, 2),
  beam_depth_mm NUMERIC(8, 2) NOT NULL,
  beam_span_mm NUMERIC(8, 2) NOT NULL,
  coord_x NUMERIC(12, 4) NOT NULL,
  coord_y NUMERIC(12, 4) NOT NULL,
  coord_z NUMERIC(12, 4) NOT NULL,
  is_structural_approved BOOLEAN NOT NULL DEFAULT false,
  validation_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'installed', 'rejected', 'cancelled')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS engineering_auto_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  system_type TEXT NOT NULL,
  start_point JSONB NOT NULL,
  end_point JSONB NOT NULL,
  waypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  obstacles JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_length_m NUMERIC(10, 3) NOT NULL,
  elbow_count INTEGER NOT NULL DEFAULT 0,
  head_loss_pa NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'computed' CHECK (status IN ('computed', 'approved', 'integrated_to_wbs', 'rejected')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sleeve_proj_drawing
  ON engineering_sleeve_schedules (project_id, drawing_code, status);

CREATE INDEX IF NOT EXISTS idx_auto_routes_proj_sys
  ON engineering_auto_routes (project_id, system_type);

ALTER TABLE engineering_sleeve_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_sleeve_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE engineering_auto_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_auto_routes FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engineering_sleeve_schedules' AND policyname = 'engineering_sleeve_schedules_isolation') THEN
    CREATE POLICY engineering_sleeve_schedules_isolation ON engineering_sleeve_schedules FOR ALL
      USING (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*')
      WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engineering_auto_routes' AND policyname = 'engineering_auto_routes_isolation') THEN
    CREATE POLICY engineering_auto_routes_isolation ON engineering_auto_routes FOR ALL
      USING (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*')
      WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*');
  END IF;
END $$;
