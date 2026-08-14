-- 0070_engineering_kernel.sql — M43 Project/Engineering Kernel foundation.
-- Canonical engineering identity is UUID-based so objects can move across services/repositories
-- without coupling identity to PostgreSQL SERIAL ids. project_id remains INTEGER to integrate
-- with the existing XBoss project kernel.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS engineering_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('drawing','document','bim','cad','model','photo','spreadsheet','other')),
  title TEXT NOT NULL,
  object_key TEXT,
  mime_type TEXT,
  sha256 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eng_sources_project ON engineering_sources(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eng_sources_sha256 ON engineering_sources(sha256) WHERE sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS engineering_source_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES engineering_sources(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL CHECK (revision_no > 0),
  object_key TEXT,
  sha256 TEXT,
  parser_name TEXT,
  parser_version TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, revision_no),
  UNIQUE (source_id, sha256)
);

CREATE INDEX IF NOT EXISTS idx_eng_source_revisions_source ON engineering_source_revisions(source_id, revision_no DESC);

CREATE TABLE IF NOT EXISTS engineering_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL,
  discipline TEXT,
  external_key TEXT,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','void')),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  geometry_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eng_objects_project ON engineering_objects(project_id, object_type, status);
CREATE INDEX IF NOT EXISTS idx_eng_objects_external ON engineering_objects(project_id, external_key) WHERE external_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eng_objects_source_revision ON engineering_objects(source_revision_id);
CREATE INDEX IF NOT EXISTS idx_eng_objects_properties ON engineering_objects USING gin(properties);

CREATE TABLE IF NOT EXISTS engineering_object_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL CHECK (revision_no > 0),
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  object_type TEXT NOT NULL,
  discipline TEXT,
  name TEXT,
  status TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  geometry_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (object_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_eng_object_revisions_object ON engineering_object_revisions(object_id, revision_no DESC);

CREATE TABLE IF NOT EXISTS engineering_object_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  to_object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_object_id <> to_object_id),
  UNIQUE (project_id, from_object_id, to_object_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_eng_rel_from ON engineering_object_relations(project_id, from_object_id, relation_type);
CREATE INDEX IF NOT EXISTS idx_eng_rel_to ON engineering_object_relations(project_id, to_object_id, relation_type);

CREATE TABLE IF NOT EXISTS engineering_object_sources (
  object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  source_revision_id UUID NOT NULL REFERENCES engineering_source_revisions(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL DEFAULT 'source',
  locator JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(6,5) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (object_id, source_revision_id, evidence_type)
);

CREATE INDEX IF NOT EXISTS idx_eng_object_sources_revision ON engineering_object_sources(source_revision_id);

CREATE TABLE IF NOT EXISTS engineering_quantity_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  quantity_code TEXT NOT NULL,
  quantity NUMERIC(24,8) NOT NULL,
  unit TEXT NOT NULL,
  method TEXT NOT NULL,
  engine_name TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC(6,5) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eng_qty_project ON engineering_quantity_results(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eng_qty_object ON engineering_quantity_results(object_id, quantity_code);

-- Project-scoped RLS is deliberately introduced after the transition period used by 0069.
-- Keep the same application GUC convention as the existing DB layer; no duplicate policy model.
ALTER TABLE engineering_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE engineering_source_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_source_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE engineering_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE engineering_object_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_object_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE engineering_object_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_object_relations FORCE ROW LEVEL SECURITY;
ALTER TABLE engineering_object_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_object_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE engineering_quantity_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_quantity_results FORCE ROW LEVEL SECURITY;

-- Source/revision/object tables use direct project ownership. Revision/evidence tables inherit
-- scope through their parent, so their policies use EXISTS rather than duplicating project_id.
DROP POLICY IF EXISTS p_engineering_sources_project ON engineering_sources;
CREATE POLICY p_engineering_sources_project ON engineering_sources
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

DROP POLICY IF EXISTS p_engineering_source_revisions_project ON engineering_source_revisions;
CREATE POLICY p_engineering_source_revisions_project ON engineering_source_revisions
  USING (EXISTS (SELECT 1 FROM engineering_sources s WHERE s.id = source_id))
  WITH CHECK (EXISTS (SELECT 1 FROM engineering_sources s WHERE s.id = source_id));

DROP POLICY IF EXISTS p_engineering_objects_project ON engineering_objects;
CREATE POLICY p_engineering_objects_project ON engineering_objects
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

DROP POLICY IF EXISTS p_engineering_object_revisions_project ON engineering_object_revisions;
CREATE POLICY p_engineering_object_revisions_project ON engineering_object_revisions
  USING (EXISTS (SELECT 1 FROM engineering_objects o WHERE o.id = object_id))
  WITH CHECK (EXISTS (SELECT 1 FROM engineering_objects o WHERE o.id = object_id));

DROP POLICY IF EXISTS p_engineering_object_relations_project ON engineering_object_relations;
CREATE POLICY p_engineering_object_relations_project ON engineering_object_relations
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');

DROP POLICY IF EXISTS p_engineering_object_sources_project ON engineering_object_sources;
CREATE POLICY p_engineering_object_sources_project ON engineering_object_sources
  USING (EXISTS (SELECT 1 FROM engineering_objects o WHERE o.id = object_id))
  WITH CHECK (EXISTS (SELECT 1 FROM engineering_objects o WHERE o.id = object_id));

DROP POLICY IF EXISTS p_engineering_quantity_results_project ON engineering_quantity_results;
CREATE POLICY p_engineering_quantity_results_project ON engineering_quantity_results
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
