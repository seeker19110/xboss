-- 0088_engineering_ingest_contract.sql — ENG-5 PR1 (C1): hợp đồng ingest an toàn cho
-- MEPF-Agents. Đặc tả: docs/nang-cap/ENG-5-integration-contract-pilot.md §3.3 (định danh &
-- lũy đẳng) + §4 (cách ly dự án, concurrency).
--
-- Vì sao cần: đường ingest ENG-1 hiện KHÔNG lũy đẳng ở mức source/relation —
--   1) engineering_sources không có external_key nên MỖI request tạo 1 source mới; agent
--      retry (timeout/mạng) là sinh source + revision trùng, không cách nào khớp lại;
--   2) engineering_object_relations không có ràng buộc duy nhất nào → retry nhân bản relation;
--   3) relation nhận from/to bằng UUID nội bộ XBoss — agent bên ngoài KHÔNG biết UUID đó
--      (ENG-5 §2.2 cấm), nên trên thực tế không dùng được đường relation.
-- Migration này thuần THÊM (ADD COLUMN nullable / CREATE INDEX / CREATE TABLE / ADD
-- CONSTRAINT) — không UPDATE, không đổi kiểu, không xoá cột; không đụng dòng dữ liệu nào.

-- 1. External key cho source: khoá bền vững do agent tự đặt, duy nhất trong 1 dự án.
--    Partial index — source tạo tay trong XBoss (external_key NULL) không bị ràng buộc,
--    cùng pattern uq_engineering_objects_external của 0084.
ALTER TABLE engineering_sources ADD COLUMN IF NOT EXISTS external_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_sources_external
  ON engineering_sources(project_id, external_key) WHERE external_key IS NOT NULL;

-- 2. External key cho source revision. Giữ nguyên UNIQUE(source_id, revision_no) sẵn có —
--    revision_no theo ENG-5 §3.3 chỉ còn để HIỂN THỊ, khoá lũy đẳng thật là external key.
ALTER TABLE engineering_source_revisions ADD COLUMN IF NOT EXISTS external_revision_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_source_revisions_external
  ON engineering_source_revisions(source_id, external_revision_key)
  WHERE external_revision_key IS NOT NULL;

-- 3. Bất biến "2 đầu relation cùng dự án" ở tầng DB (ENG-5 §4: "app-layer check đơn lẻ
--    không đủ"). Dùng composite FK thay trigger — đặc tả ưu tiên FK khi biểu diễn được.
--    Cần UNIQUE(id, project_id) trên engineering_objects làm đích FK (id vốn đã là PK nên
--    ràng buộc này không siết thêm gì, chỉ để Postgres chấp nhận làm FK target).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_engineering_objects_id_project'
  ) THEN
    ALTER TABLE engineering_objects
      ADD CONSTRAINT uq_engineering_objects_id_project UNIQUE (id, project_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_engineering_relations_from_same_project'
  ) THEN
    ALTER TABLE engineering_object_relations
      ADD CONSTRAINT fk_engineering_relations_from_same_project
      FOREIGN KEY (from_object_id, project_id)
      REFERENCES engineering_objects(id, project_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_engineering_relations_to_same_project'
  ) THEN
    ALTER TABLE engineering_object_relations
      ADD CONSTRAINT fk_engineering_relations_to_same_project
      FOREIGN KEY (to_object_id, project_id)
      REFERENCES engineering_objects(id, project_id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. Relation duy nhất theo bộ khoá logic (ENG-5 §3.3). source_revision_id NULL-able nên
--    dùng COALESCE về UUID hằng — trong Postgres, NULL không "bằng" NULL trong unique index,
--    không có COALESCE thì 2 relation giống hệt nhau mà source_revision_id NULL vẫn lọt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_object_relations_logical
  ON engineering_object_relations(
    project_id,
    from_object_id,
    to_object_id,
    relation_type,
    COALESCE(source_revision_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- 5. Sổ lũy đẳng request (ENG-5 §3.3). Cùng Idempotency-Key + cùng body hash → trả lại
--    response cũ (200); cùng key + body khác → 409. TTL tối thiểu 30 ngày theo đặc tả.
--    response_body lưu nguyên response đã trả để replay bit-đối-bit, không dựng lại.
CREATE TABLE IF NOT EXISTS engineering_ingest_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL DEFAULT '{}',
  correlation_id TEXT,
  api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
  contract_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);
-- Khoá lũy đẳng: 1 dự án + 1 Idempotency-Key = 1 bản ghi (kể cả khi body khác — chính là
-- cách phát hiện xung đột 409).
CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_ingest_requests_key
  ON engineering_ingest_requests(project_id, idempotency_key);
-- Dọn bản ghi hết hạn theo lô (cron/thủ công) — không tự xoá trong đường ingest nóng.
CREATE INDEX IF NOT EXISTS idx_engineering_ingest_requests_expires
  ON engineering_ingest_requests(expires_at);
