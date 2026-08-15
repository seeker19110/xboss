-- 0089_engineering_project_invariants.sql — C3 §3 "Relational invariants": khoá nốt các
-- đường tham chiếu CHÉO DỰ ÁN còn sót trong nhóm bảng engineering_*.
-- Đặc tả: docs/nang-cap/C3-data-audit-rls-hardening.md mục 3.
--
-- Vì sao cần (đã ĐO trên DB, không suy từ code): sau 0088, relation đã bị chặn chéo dự án,
-- NHƯNG đường qua source revision thì chưa — chèn thẳng được 1 object thuộc dự án B trỏ
-- `source_revision_id` của dự án A và DB vẫn nhận. Gốc rễ: `engineering_source_revisions`
-- không mang `project_id` nên không thể diễn đạt bất biến bằng FK.
--
-- ⚠️ MIGRATION NÀY ĐỤNG DỮ LIỆU (backfill `project_id` từ source cha) → theo DoD
-- (CLAUDE.md) PHẢI chạy staging trước, không đi thẳng production. Backfill là lũy đẳng
-- (chỉ điền dòng đang NULL) nên chạy lại nhiều lần vẫn an toàn.

-- 1. Đích cho composite FK: sources cần UNIQUE(id, project_id) (id vốn là PK nên không
--    siết thêm gì, chỉ để Postgres chấp nhận làm FK target — cùng cách đã dùng ở 0088).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_engineering_sources_id_project'
  ) THEN
    ALTER TABLE engineering_sources
      ADD CONSTRAINT uq_engineering_sources_id_project UNIQUE (id, project_id);
  END IF;
END $$;

-- 2. Mang project_id xuống revision. Thêm cột nullable → backfill → mới siết NOT NULL,
--    đúng pattern 0027_multi_project.sql / 0069_rls.sql đã dùng trong dự án.
ALTER TABLE engineering_source_revisions ADD COLUMN IF NOT EXISTS project_id INTEGER;

UPDATE engineering_source_revisions r
   SET project_id = s.project_id
  FROM engineering_sources s
 WHERE r.source_id = s.id
   AND r.project_id IS DISTINCT FROM s.project_id;

-- Chỉ siết NOT NULL khi đã backfill hết — bảng rỗng hoặc đã đủ dữ liệu thì qua, còn sót
-- dòng mồ côi thì DỪNG có thông báo rõ thay vì fail khó hiểu ở bước ALTER.
DO $$
DECLARE
  orphan BIGINT;
BEGIN
  SELECT COUNT(*) INTO orphan FROM engineering_source_revisions WHERE project_id IS NULL;
  IF orphan > 0 THEN
    RAISE EXCEPTION 'Còn % dòng engineering_source_revisions không suy được project_id từ source cha — kiểm tra dữ liệu mồ côi trước khi chạy lại migration', orphan;
  END IF;
END $$;

ALTER TABLE engineering_source_revisions ALTER COLUMN project_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_engineering_source_revisions_project
  ON engineering_source_revisions(project_id);

-- 3. Bất biến A — revision phải cùng dự án với source cha của chính nó.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_eng_source_rev_same_project'
  ) THEN
    ALTER TABLE engineering_source_revisions
      ADD CONSTRAINT fk_eng_source_rev_same_project
      FOREIGN KEY (source_id, project_id)
      REFERENCES engineering_sources(id, project_id) ON DELETE CASCADE;
  END IF;

  -- Đích cho các FK ở mục 4/5.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_eng_source_rev_id_project'
  ) THEN
    ALTER TABLE engineering_source_revisions
      ADD CONSTRAINT uq_eng_source_rev_id_project UNIQUE (id, project_id);
  END IF;
END $$;

-- 4. Bất biến B — object trỏ source revision phải cùng dự án.
--    (Đây chính là lỗ hổng đo được: object dự án B trỏ revision dự án A vẫn lọt.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_eng_object_source_rev_same_project'
  ) THEN
    ALTER TABLE engineering_objects
      ADD CONSTRAINT fk_eng_object_source_rev_same_project
      FOREIGN KEY (source_revision_id, project_id)
      REFERENCES engineering_source_revisions(id, project_id);
  END IF;
END $$;

-- 5. Bất biến C — relation trỏ source revision phải cùng dự án (0088 mới khoá 2 đầu object).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_eng_relation_source_rev_same_project'
  ) THEN
    ALTER TABLE engineering_object_relations
      ADD CONSTRAINT fk_eng_relation_source_rev_same_project
      FOREIGN KEY (source_revision_id, project_id)
      REFERENCES engineering_source_revisions(id, project_id);
  END IF;
END $$;
