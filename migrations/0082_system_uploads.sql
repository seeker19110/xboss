-- migrations/0082_system_uploads.sql
CREATE TABLE IF NOT EXISTS system_uploads (
  id SERIAL PRIMARY KEY,
  system_id INTEGER NOT NULL REFERENCES systems(id),
  project_id INTEGER REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('ke_hoach', 'tracking')),
  file_name TEXT NOT NULL,
  original_name TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  row_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  warnings JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_uploads_system ON system_uploads(project_id, system_id, kind, created_at DESC);
