-- 0104_scan_to_bim_closed_loop.sql — Nền tảng AI Reality Scan-to-BIM & Closed-Loop Sync
-- Đặc tả: docs/nang-cap/M70-scan-to-bim-closed-loop.md

CREATE TABLE IF NOT EXISTS engineering_scan_to_bim_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scan_code TEXT NOT NULL,
  point_cloud_source TEXT NOT NULL,
  total_points_scanned INT NOT NULL DEFAULT 0,
  spools_analyzed_count INT NOT NULL DEFAULT 0,
  pass_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  max_deviation_mm NUMERIC(8,2) NOT NULL DEFAULT 0,
  defects_count INT NOT NULL DEFAULT 0,
  deviation_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_scan_to_bim_code UNIQUE (project_id, scan_code)
);

CREATE TABLE IF NOT EXISTS engineering_closed_loop_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sync_code TEXT NOT NULL,
  spool_id TEXT NOT NULL,
  wbs_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  synced_qty NUMERIC(10,3) NOT NULL,
  synced_amount_vnd NUMERIC(15,2) NOT NULL,
  provenance_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_closed_loop_sync_code UNIQUE (project_id, sync_code)
);

-- Row Level Security (RLS)
ALTER TABLE engineering_scan_to_bim_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_scan_to_bim_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_scan_to_bim_project ON engineering_scan_to_bim_runs;
CREATE POLICY p_eng_scan_to_bim_project ON engineering_scan_to_bim_runs
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

ALTER TABLE engineering_closed_loop_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_closed_loop_sync_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_eng_closed_loop_sync_project ON engineering_closed_loop_sync_logs;
CREATE POLICY p_eng_closed_loop_sync_project ON engineering_closed_loop_sync_logs
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scan_to_bim_proj ON engineering_scan_to_bim_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_closed_loop_sync_proj ON engineering_closed_loop_sync_logs(project_id, spool_id);
