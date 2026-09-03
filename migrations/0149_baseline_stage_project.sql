-- 0149_baseline_stage_project.sql — M123 PR1 (§11): đưa 3 bảng của mảng kế hoạch/mặt trận
-- vào trục dự án — `baselines`, `construction_stages`, `floor_stage_fronts`.
--
-- Vì sao: `baselines` chốt snapshot KHÔNG có mệnh đề WHERE nào (PM dự án A chụp luôn task
-- của dự án B), còn `floor_stage_fronts` có UNIQUE (floor_label, stage_id) nên hai dự án
-- cùng nhãn tầng "T5" GHI ĐÈ lẫn nhau. Xem docs/nang-cap/M123-*.md §1.
--
-- CẢNH BÁO VẬN HÀNH: migration này ĐỤNG DỮ LIỆU đang có (backfill + ALTER COLUMN SET NOT
-- NULL + DROP CONSTRAINT unique cũ) ⇒ theo Definition of Done trong CLAUDE.md BẮT BUỘC chạy
-- STAGING trước (`bash deploy.sh --staging`, docs/ops/staging.md) và kiểm bằng
-- `npm run db:migrate -- --dry-run`, KHÔNG đi thẳng production.
--
-- Toàn bộ idempotent: chạy lần 2 không lỗi (IF NOT EXISTS + kiểm tra trước khi DROP/SET NOT NULL).

-- ===== 1) baselines: NOT NULL sau backfill (D2 — baseline cũ về dự án đầu tiên) =====
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
DO $$
DECLARE p INTEGER := (SELECT MIN(id) FROM projects);
BEGIN
  IF p IS NOT NULL THEN
    UPDATE baselines SET project_id = p WHERE project_id IS NULL;
    ALTER TABLE baselines ALTER COLUMN project_id SET NOT NULL;
  END IF;
  -- projects rỗng (DB mới khởi tạo, R3) → để nullable; migration sau siết khi đã có dự án.
END $$;
CREATE INDEX IF NOT EXISTS idx_baselines_project ON baselines(project_id);

-- ===== 2) construction_stages: NULLABLE (D1) =====
-- NULL = danh mục dùng chung mọi dự án (7 công tác seed của 0046 giữ nguyên nghĩa), có giá
-- trị = công tác riêng của dự án đó. KHÔNG backfill, KHÔNG SET NOT NULL — cố ý.
ALTER TABLE construction_stages ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
CREATE INDEX IF NOT EXISTS idx_construction_stages_project ON construction_stages(project_id);

-- ===== 3) floor_stage_fronts: NOT NULL sau backfill + đổi ràng buộc UNIQUE =====
ALTER TABLE floor_stage_fronts ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
DO $$
DECLARE p INTEGER := (SELECT MIN(id) FROM projects);
BEGIN
  IF p IS NOT NULL THEN
    UPDATE floor_stage_fronts SET project_id = p WHERE project_id IS NULL;
    ALTER TABLE floor_stage_fronts ALTER COLUMN project_id SET NOT NULL;
  END IF;
END $$;

-- DROP ràng buộc UNIQUE (floor_label, stage_id) cũ theo ĐỊNH NGHĨA CỘT, không gõ tay tên
-- ngầm định (`floor_stage_fronts_floor_label_stage_id_key` đúng với 0046, nhưng nếu một bản
-- triển khai nào đó tạo bảng bằng tên khác thì `DROP CONSTRAINT IF EXISTS` sẽ âm thầm no-op,
-- để ràng buộc cũ sống song song với index mới và phá đúng mục đích migration này) — khuôn 0145.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'floor_stage_fronts'::regclass
       AND con.contype = 'u'
       -- attname là kiểu `name`, phải ép ::text mới so được với ARRAY[...] literal (text[]).
       AND (SELECT array_agg(att.attname::text ORDER BY att.attname::text)
              FROM unnest(con.conkey) k
              JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k)
           = ARRAY['floor_label', 'stage_id']
  LOOP
    EXECUTE format('ALTER TABLE floor_stage_fronts DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- UNIQUE mới coi NULL là một "dự án" (COALESCE ... 0) để vẫn duy nhất khi projects rỗng (R3).
-- Là unique INDEX (không phải constraint) nên `ON CONFLICT (COALESCE(project_id, 0), floor_label,
-- stage_id)` trong lib/tien-do/constructionStages.ts suy được đúng index này.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_floor_stage_fronts_project
  ON floor_stage_fronts (COALESCE(project_id, 0), floor_label, stage_id);
CREATE INDEX IF NOT EXISTS idx_floor_stage_fronts_project ON floor_stage_fronts(project_id);

-- ===== 4) RLS — phòng tuyến thứ hai (ADR-0005), khuôn 3 nhánh của 0069_rls.sql =====
-- 1) project_id khớp GUC app.project_id — so sánh dạng TEXT, KHÔNG cast GUC ::int (Postgres
--    không bảo đảm short-circuit nên GUC '' hoặc '*' vẫn bị cast → lỗi cú pháp integer);
-- 2) GUC rỗng ('' hoặc NULL) → cho qua (đường đọc ngoài withProjectScope);
-- 3) GUC = '*' → ngữ cảnh xuyên dự án hợp lệ (portfolio/cron/export).
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['baselines', 'floor_stage_fronts'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS p_%s_project ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY p_%s_project ON %I'
      || ' USING ('
      || '   project_id::text = current_setting(''app.project_id'', true)'
      || '   OR NULLIF(current_setting(''app.project_id'', true), '''') IS NULL'
      || '   OR current_setting(''app.project_id'', true) = ''*'''
      || ' )'
      || ' WITH CHECK ('
      || '   project_id::text = current_setting(''app.project_id'', true)'
      || '   OR NULLIF(current_setting(''app.project_id'', true), '''') IS NULL'
      || '   OR current_setting(''app.project_id'', true) = ''*'''
      || ' )',
      t, t
    );
  END LOOP;
END $$;

-- construction_stages: thêm nhánh `project_id IS NULL` — danh mục dùng chung phải luôn
-- đọc/ghi được ở mọi phạm vi dự án (D1), nếu không thì 7 công tác seed biến mất khi phiên
-- chạy trong withProjectScope.
ALTER TABLE construction_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_stages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_construction_stages_project ON construction_stages;
CREATE POLICY p_construction_stages_project ON construction_stages
  USING (
    project_id IS NULL
    OR project_id::text = current_setting('app.project_id', true)
    OR NULLIF(current_setting('app.project_id', true), '') IS NULL
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id IS NULL
    OR project_id::text = current_setting('app.project_id', true)
    OR NULLIF(current_setting('app.project_id', true), '') IS NULL
    OR current_setting('app.project_id', true) = '*'
  );
