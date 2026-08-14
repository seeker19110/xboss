-- 0084_engineering_core.sql — kho nhận Engineering Object cho tích hợp MEP-Agents (M65 PR1).
-- Bảng còn thiếu cho lib/engineering-kernel.ts (đã merge từ commit 8c84e49 "feat: add M43
-- engineering kernel domain services" — push thẳng main không kèm migration, code vỡ khi
-- gọi thật vì bảng chưa tồn tại). Migration này tái dựng ĐÚNG schema mà lib đó đã dùng
-- (tên bảng/cột không đổi) + thêm cổng duyệt trên engineering_objects.status theo
-- docs/nang-cap/M65-tich-hop-mep-agents-engineering-core.md. Thuần CREATE TABLE/INDEX,
-- không đụng dữ liệu hiện có.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS engineering_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN
    ('drawing', 'document', 'bim', 'cad', 'model', 'photo', 'spreadsheet', 'other')),
  title TEXT NOT NULL,
  object_key TEXT,
  mime_type TEXT,
  sha256 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engineering_sources_project ON engineering_sources(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS engineering_source_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES engineering_sources(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL,
  object_key TEXT,
  sha256 TEXT,
  parser_name TEXT,
  parser_version TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, revision_no)
);

CREATE TABLE IF NOT EXISTS engineering_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL,
  discipline TEXT,
  external_key TEXT,  -- object_id bất biến bên MEP-Agents ("{type}:{uuid4_hex}") — chuỗi tự do, KHÔNG phải UUID
  name TEXT,
  -- Cổng duyệt: object mới luôn 'pending_review', chỉ Admin/PM chuyển 'approved'/'rejected'
  -- qua reviewEngineeringObject(). 'void' = soft-delete (listEngineeringObjects đã lọc sẵn
  -- "status <> 'void'" từ code gốc).
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'void')),
  properties JSONB NOT NULL DEFAULT '{}',
  geometry_ref JSONB NOT NULL DEFAULT '{}',
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  updated_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_status ON engineering_objects(project_id, status);
CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_type ON engineering_objects(project_id, object_type);
-- Idempotent ingest theo external_key (upsertEngineeringObjectFromExternal) — 1 dự án
-- không có 2 object cùng external_key. Partial index: object tạo tay (external_key NULL)
-- không bị ràng buộc.
CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_objects_external
  ON engineering_objects(project_id, external_key) WHERE external_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS engineering_object_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL,
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  object_type TEXT NOT NULL,
  discipline TEXT,
  name TEXT,
  status TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  geometry_ref JSONB NOT NULL DEFAULT '{}',
  change_reason TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (object_id, revision_no)
);
CREATE INDEX IF NOT EXISTS idx_engineering_object_revisions_object ON engineering_object_revisions(object_id, revision_no DESC);

CREATE TABLE IF NOT EXISTS engineering_object_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  to_object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engineering_object_relations_project ON engineering_object_relations(project_id);
CREATE INDEX IF NOT EXISTS idx_engineering_object_relations_from ON engineering_object_relations(from_object_id);
CREATE INDEX IF NOT EXISTS idx_engineering_object_relations_to ON engineering_object_relations(to_object_id);
