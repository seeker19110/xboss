-- Migration 0108: Spatial Annotations & CAD/BIM Field Pinning (M74)
-- Quản lý các điểm ghim (Spatial Pinning), Đám mây ghi chú (Markup) và liên kết WBS/NCR/BBNT trên bản vẽ không gian 2D/3D

CREATE TABLE IF NOT EXISTS engineering_spatial_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  drawing_code TEXT NOT NULL,
  floor_id TEXT,
  annot_type TEXT NOT NULL CHECK (annot_type IN ('progress_pin', 'ncr_issue', 'bbnt_request', 'rfi_markup', 'general_note')),
  coord_x NUMERIC(12, 4) NOT NULL,
  coord_y NUMERIC(12, 4) NOT NULL,
  coord_z NUMERIC(12, 4) DEFAULT 0,
  geom_payload JSONB DEFAULT '{}'::jsonb,
  entity_ref_type TEXT,
  entity_ref_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'normal' CHECK (severity IN ('low', 'normal', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'cancelled')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_spatial_annot_proj_drawing
  ON engineering_spatial_annotations (project_id, drawing_code, status);

CREATE INDEX IF NOT EXISTS idx_spatial_annot_entity_ref
  ON engineering_spatial_annotations (project_id, entity_ref_type, entity_ref_id);

ALTER TABLE engineering_spatial_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_spatial_annotations FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'engineering_spatial_annotations'
      AND policyname = 'engineering_spatial_annotations_isolation'
  ) THEN
    CREATE POLICY engineering_spatial_annotations_isolation
      ON engineering_spatial_annotations
      FOR ALL
      USING (
        project_id = NULLIF(current_setting('app.project_id', true), '')::integer
        OR current_setting('app.project_id', true) = '*'
      )
      WITH CHECK (
        project_id = NULLIF(current_setting('app.project_id', true), '')::integer
        OR current_setting('app.project_id', true) = '*'
      );
  END IF;
END $$;
