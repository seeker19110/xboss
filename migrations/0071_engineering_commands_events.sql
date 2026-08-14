-- 0071 — M43 command idempotency + engineering event/provenance ledger.
-- UUID-first tables intentionally avoid coupling this event layer to legacy SERIAL audit IDs.
CREATE TABLE IF NOT EXISTS engineering_command_idempotency (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  command_key TEXT NOT NULL,
  command_type TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, actor_id, command_key)
);

CREATE INDEX IF NOT EXISTS idx_eng_idempotency_created ON engineering_command_idempotency(created_at DESC);

CREATE TABLE IF NOT EXISTS engineering_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID,
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  command_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eng_events_project_time ON engineering_events(project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_eng_events_aggregate ON engineering_events(aggregate_type, aggregate_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_eng_events_source_revision ON engineering_events(source_revision_id);

ALTER TABLE engineering_command_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_command_idempotency FORCE ROW LEVEL SECURITY;
ALTER TABLE engineering_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_engineering_idempotency_project ON engineering_command_idempotency;
CREATE POLICY p_engineering_idempotency_project ON engineering_command_idempotency
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

DROP POLICY IF EXISTS p_engineering_events_project ON engineering_events;
CREATE POLICY p_engineering_events_project ON engineering_events
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
