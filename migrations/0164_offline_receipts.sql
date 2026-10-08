-- 0164_offline_receipts.sql — QUALITY-FINAL-1 S06: receipt + precondition ở 4 endpoint hàng đợi
-- offline thật (DATA-CONTRACTS §5, A2-FR09..FR11, D04).
--
-- audit_operation_receipts: biên nhận bền vững cho tick / tick_batch / photo / diary_note — đúng
-- DDL thiết kế. Ghi CÙNG transaction với mutation nghiệp vụ (không có placeholder "pending"); cùng
-- operation_id + cùng request_hash → trả lại ACK cũ, khác hash → 409. Không UPDATE/DELETE runtime,
-- không TTL (APPROVAL D04). Chỉ giữ hash + định danh tài nguyên, không giữ nội dung ảnh/nhật ký.
--
-- photo_upload_staging: metadata DB của file ảnh ĐANG ghi lên storage (DATA-CONTRACTS §5 "photo
-- storage dùng staging/metadata transaction và orphan reconciliation"). Dòng được ghi + COMMIT
-- TRƯỚC khi đặt file; transaction ghi task_photos xoá dòng này cùng lúc COMMIT. Còn dòng = file chưa
-- được tham chiếu → đối soát xoá file rồi xoá dòng (lib/tien-do/anh-staging.ts).
--
-- site_diaries.version: phiên bản MẠNH của nhật ký cho If-Match/If-None-Match (A2-FR11). Trigger
-- tăng version ở MỌI UPDATE dòng nhật ký và mọi thay đổi dòng con nhân lực/ảnh (kể cả ảnh bị xoá
-- cascade từ task_photos) — client không tự đặt version, không dùng timestamp client.
--
-- Chỉ thêm thuần tuý (CREATE TABLE/INDEX/POLICY/TRIGGER/GRANT, ADD COLUMN có DEFAULT hằng — không
-- viết lại dòng nhật ký có sẵn). Chạy lặp an toàn; bảng trùng tên mà sai định nghĩa → RAISE.

CREATE TABLE IF NOT EXISTS audit_operation_receipts (
  operation_id uuid NOT NULL,
  user_id integer NOT NULL REFERENCES users(id),
  org_id integer NOT NULL REFERENCES organizations(id),
  project_id integer NOT NULL REFERENCES projects(id),
  operation_kind text NOT NULL CHECK
    (operation_kind IN ('tick', 'tick_batch', 'photo', 'diary_note')),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  result_version text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, project_id, user_id, operation_id)
);

CREATE TABLE IF NOT EXISTS photo_upload_staging (
  file_name text PRIMARY KEY,
  org_id integer NOT NULL REFERENCES organizations(id),
  user_id integer NOT NULL REFERENCES users(id),
  -- Không FK: task có thể bị xoá trong lúc file đang ghi — đối soát vẫn phải dọn được file.
  task_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_photo_upload_staging_owner
  ON photo_upload_staging (org_id, user_id, created_at);

-- Đối chiếu catalog khi bảng đã tồn tại từ trước (lần chạy lặp hoặc schema lạ trùng tên).
DO $$
BEGIN
  IF (
    SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'audit_operation_receipts'
       AND (column_name, data_type, is_nullable) IN (
         ('operation_id', 'uuid', 'NO'), ('user_id', 'integer', 'NO'),
         ('org_id', 'integer', 'NO'), ('project_id', 'integer', 'NO'),
         ('operation_kind', 'text', 'NO'), ('request_hash', 'text', 'NO'),
         ('resource_type', 'text', 'NO'), ('resource_id', 'text', 'NO'),
         ('result_version', 'text', 'YES'),
         ('completed_at', 'timestamp with time zone', 'NO')
       )
  ) <> 10 THEN
    RAISE EXCEPTION 'Sai định nghĩa cột audit_operation_receipts';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'audit_operation_receipts'::regclass AND contype = 'p'
       AND pg_get_constraintdef(oid) = 'PRIMARY KEY (org_id, project_id, user_id, operation_id)'
  ) THEN
    RAISE EXCEPTION 'Sai khoá chính audit_operation_receipts';
  END IF;
  IF (
    SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'photo_upload_staging'
       AND (column_name, data_type, is_nullable) IN (
         ('file_name', 'text', 'NO'), ('org_id', 'integer', 'NO'), ('user_id', 'integer', 'NO'),
         ('task_id', 'integer', 'NO'), ('created_at', 'timestamp with time zone', 'NO')
       )
  ) <> 5 THEN
    RAISE EXCEPTION 'Sai định nghĩa cột photo_upload_staging';
  END IF;
END $$;

-- RLS (ADR-0005, khuôn nghiêm ngặt của bảng mới): không nhánh '*'/GUC rỗng. So sánh dạng TEXT với
-- GUC (DDL thiết kế ghi NULLIF(...)::integer — đổi sang so text như 0160/0163 để không vỡ khi GUC
-- là '*'; ngữ nghĩa giữ nguyên). Một policy cho mọi lệnh như DDL thiết kế; quyền lệnh giới hạn ở
-- GRANT bên dưới (receipt chỉ SELECT/INSERT).
ALTER TABLE audit_operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_operation_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_receipts_context ON audit_operation_receipts;
CREATE POLICY audit_receipts_context ON audit_operation_receipts
  USING (
    user_id::text = current_setting('app.user_id', true)
    AND org_id::text = current_setting('app.org_id', true)
    AND project_id::text = current_setting('app.project_id', true)
  )
  WITH CHECK (
    user_id::text = current_setting('app.user_id', true)
    AND org_id::text = current_setting('app.org_id', true)
    AND project_id::text = current_setting('app.project_id', true)
  );

ALTER TABLE photo_upload_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_upload_staging FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS photo_staging_owner ON photo_upload_staging;
CREATE POLICY photo_staging_owner ON photo_upload_staging
  USING (
    user_id::text = current_setting('app.user_id', true)
    AND org_id::text = current_setting('app.org_id', true)
  )
  WITH CHECK (
    user_id::text = current_setting('app.user_id', true)
    AND org_id::text = current_setting('app.org_id', true)
  );

-- Quyền tối thiểu: ALTER DEFAULT PRIVILEGES của 0069 tự cấp UPDATE/DELETE/TRUNCATE cho xboss_app
-- trên bảng mới — thu hồi. Receipt: chỉ SELECT/INSERT (bất biến ở tầng quyền). Staging: thêm
-- DELETE (dòng phải được xoá khi ảnh đã ghi xong / file đã dọn), không UPDATE.
REVOKE ALL ON audit_operation_receipts FROM xboss_app;
GRANT SELECT, INSERT ON audit_operation_receipts TO xboss_app;
REVOKE ALL ON photo_upload_staging FROM xboss_app;
GRANT SELECT, INSERT, DELETE ON photo_upload_staging TO xboss_app;

-- Phiên bản mạnh của nhật ký.
ALTER TABLE site_diaries ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION site_diaries_tang_version() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  -- Luôn tăng từ giá trị CŨ: UPDATE nào cũng không đặt được version tuỳ ý.
  NEW.version := OLD.version + 1;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS site_diaries_version ON site_diaries;
CREATE TRIGGER site_diaries_version BEFORE UPDATE ON site_diaries
  FOR EACH ROW EXECUTE FUNCTION site_diaries_tang_version();

-- Dòng con (nhân lực, ảnh) là một phần biểu diễn của nhật ký (GET trả kèm) → đổi dòng con cũng
-- tăng version dòng cha. Dòng cha đang bị xoá (cascade) thì UPDATE không khớp dòng nào — vô hại.
CREATE OR REPLACE FUNCTION diary_con_tang_version() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE site_diaries SET version = version + 1 WHERE id = OLD.diary_id;
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.diary_id IS DISTINCT FROM OLD.diary_id) THEN
    UPDATE site_diaries SET version = version + 1 WHERE id = NEW.diary_id;
  END IF;
  RETURN NULL;
END
$fn$;
DROP TRIGGER IF EXISTS diary_manpower_version ON diary_manpower;
CREATE TRIGGER diary_manpower_version AFTER INSERT OR UPDATE OR DELETE ON diary_manpower
  FOR EACH ROW EXECUTE FUNCTION diary_con_tang_version();
DROP TRIGGER IF EXISTS diary_photos_version ON diary_photos;
CREATE TRIGGER diary_photos_version AFTER INSERT OR UPDATE OR DELETE ON diary_photos
  FOR EACH ROW EXECUTE FUNCTION diary_con_tang_version();
