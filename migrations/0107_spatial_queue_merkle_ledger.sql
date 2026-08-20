-- Migration: 0107_spatial_queue_merkle_ledger.sql
-- Mục đích: Hàng đợi tác vụ kỹ thuật phân tán, Sổ cái băm Merkle bất biến, và Bộ đệm tính toán không gian

CREATE TABLE IF NOT EXISTS engineering_async_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  priority INT NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  worker_id VARCHAR(128),
  lease_expires_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  result JSONB,
  error_message TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS engineering_merkle_roots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  batch_code VARCHAR(128) NOT NULL,
  merkle_root VARCHAR(64) NOT NULL,
  leaf_count INT NOT NULL,
  start_timestamp TIMESTAMPTZ NOT NULL,
  end_timestamp TIMESTAMPTZ NOT NULL,
  previous_root VARCHAR(64),
  signature_token VARCHAR(256) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_merkle_roots_project_batch UNIQUE (project_id, batch_code)
);

CREATE TABLE IF NOT EXISTS engineering_spatial_compute_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cache_key VARCHAR(128) NOT NULL,
  algorithm_version VARCHAR(32) NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  output_data JSONB NOT NULL,
  hit_count BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_spatial_cache_key UNIQUE (project_id, cache_key)
);

ALTER TABLE engineering_async_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_async_tasks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_engineering_async_tasks ON engineering_async_tasks;
CREATE POLICY rls_engineering_async_tasks ON engineering_async_tasks
  FOR ALL
  USING (
    project_id = NULLIF(current_setting('app.project_id', true), '')::bigint
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id = NULLIF(current_setting('app.project_id', true), '')::bigint
    OR current_setting('app.project_id', true) = '*'
  );

ALTER TABLE engineering_merkle_roots ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_merkle_roots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_engineering_merkle_roots ON engineering_merkle_roots;
CREATE POLICY rls_engineering_merkle_roots ON engineering_merkle_roots
  FOR ALL
  USING (
    project_id = NULLIF(current_setting('app.project_id', true), '')::bigint
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id = NULLIF(current_setting('app.project_id', true), '')::bigint
    OR current_setting('app.project_id', true) = '*'
  );

ALTER TABLE engineering_spatial_compute_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_spatial_compute_cache FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_engineering_spatial_compute_cache ON engineering_spatial_compute_cache;
CREATE POLICY rls_engineering_spatial_compute_cache ON engineering_spatial_compute_cache
  FOR ALL
  USING (
    project_id = NULLIF(current_setting('app.project_id', true), '')::bigint
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id = NULLIF(current_setting('app.project_id', true), '')::bigint
    OR current_setting('app.project_id', true) = '*'
  );

CREATE INDEX IF NOT EXISTS idx_async_tasks_queue ON engineering_async_tasks(project_id, status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_merkle_roots_proj ON engineering_merkle_roots(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spatial_cache_lookup ON engineering_spatial_compute_cache(project_id, cache_key);
