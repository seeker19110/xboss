-- 0163_offline_vault.sql — QUALITY-FINAL-1 S05: thiết bị offline + khoá vault bọc (wrapped DEK)
-- (DATA-MIGRATIONS §3–§5, DATA-CONTRACTS §3–§4, A2-FR04/FR05, D02/D03).
--
-- offline_devices: bản ghi thiết bị theo actor/org. Cookie proof 32 byte (HttpOnly) là ràng buộc
-- TRÌNH DUYỆT, server chỉ lưu SHA-256 của proof; cùng một trình duyệt có thể có nhiều bản ghi
-- (A, B…) chung proof_hash — đăng ký B không ghi đè bản ghi của A. Profile mặc định shared-safe;
-- field-personal chỉ Admin cùng org duyệt (CHECK bắt buộc có approved_by/approved_at).
-- offline_vault_keys: DEK 256 bit bọc bằng KEK riêng có version (không XBOSS_SECRET/mật khẩu),
-- gắn resource manifest bất biến (hash SHA-256) + owner/org/project/device. Server KHÔNG lưu khoá
-- thô; manifest/wrapped_key không bao giờ UPDATE ở runtime.
-- offline_context_generation_seq: generation tăng đơn điệu do server cấp cho mỗi context offline
-- (không dùng đồng hồ client làm thứ tự).
--
-- Chỉ thêm thuần tuý (CREATE TABLE/INDEX/SEQUENCE/POLICY/TRIGGER/GRANT), không đụng dòng dữ liệu
-- có sẵn. Chạy lặp an toàn; bảng trùng tên mà sai định nghĩa → RAISE (không để IF NOT EXISTS nuốt
-- schema sai, đúng khuôn 0160).

CREATE TABLE IF NOT EXISTS offline_devices (
  id uuid PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  org_id integer NOT NULL REFERENCES organizations(id),
  proof_hash bytea NOT NULL CHECK (octet_length(proof_hash) = 32),
  profile text NOT NULL DEFAULT 'shared-safe'
    CHECK (profile IN ('shared-safe', 'field-personal')),
  approved_by integer REFERENCES users(id),
  approved_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id, org_id),
  UNIQUE (user_id, org_id, proof_hash),
  CHECK (profile <> 'field-personal' OR
    (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS offline_vault_keys (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL,
  user_id integer NOT NULL,
  org_id integer NOT NULL,
  project_id integer NOT NULL REFERENCES projects(id),
  key_version integer NOT NULL CHECK (key_version > 0),
  resource_manifest jsonb NOT NULL CHECK (jsonb_typeof(resource_manifest) = 'object'),
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  permission_fingerprint text NOT NULL
    CHECK (permission_fingerprint ~ '^[0-9a-f]{64}$'),
  wrapped_key bytea NOT NULL,
  kek_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  FOREIGN KEY (device_id, user_id, org_id)
    REFERENCES offline_devices(id, user_id, org_id),
  UNIQUE (device_id, user_id, org_id, project_id, key_version)
);

-- Đối chiếu catalog khi bảng đã tồn tại từ trước (lần chạy lặp hoặc schema lạ trùng tên).
DO $$
BEGIN
  IF (
    SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'offline_devices'
       AND (column_name, data_type, is_nullable) IN (
         ('id', 'uuid', 'NO'), ('user_id', 'integer', 'NO'), ('org_id', 'integer', 'NO'),
         ('proof_hash', 'bytea', 'NO'), ('profile', 'text', 'NO'),
         ('approved_by', 'integer', 'YES'),
         ('approved_at', 'timestamp with time zone', 'YES'),
         ('revoked_at', 'timestamp with time zone', 'YES'),
         ('created_at', 'timestamp with time zone', 'NO')
       )
  ) <> 9 THEN
    RAISE EXCEPTION 'Sai định nghĩa cột offline_devices';
  END IF;
  IF (
    SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'offline_vault_keys'
       AND (column_name, data_type, is_nullable) IN (
         ('id', 'uuid', 'NO'), ('device_id', 'uuid', 'NO'), ('user_id', 'integer', 'NO'),
         ('org_id', 'integer', 'NO'), ('project_id', 'integer', 'NO'),
         ('key_version', 'integer', 'NO'), ('resource_manifest', 'jsonb', 'NO'),
         ('manifest_hash', 'text', 'NO'), ('permission_fingerprint', 'text', 'NO'),
         ('wrapped_key', 'bytea', 'NO'), ('kek_version', 'text', 'NO'),
         ('created_at', 'timestamp with time zone', 'NO'),
         ('retired_at', 'timestamp with time zone', 'YES')
       )
  ) <> 13 THEN
    RAISE EXCEPTION 'Sai định nghĩa cột offline_vault_keys';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'offline_devices'::regclass AND contype = 'u'
       AND pg_get_constraintdef(oid) = 'UNIQUE (user_id, org_id, proof_hash)'
  ) THEN
    RAISE EXCEPTION 'Thiếu UNIQUE (user_id, org_id, proof_hash) trên offline_devices';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'offline_vault_keys'::regclass AND contype = 'f'
       AND pg_get_constraintdef(oid) LIKE
         'FOREIGN KEY (device_id, user_id, org_id) REFERENCES offline_devices(id, user_id, org_id)%'
  ) THEN
    RAISE EXCEPTION 'Thiếu FK (device_id, user_id, org_id) trên offline_vault_keys';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'offline_vault_keys'::regclass AND contype = 'u'
       AND pg_get_constraintdef(oid) =
         'UNIQUE (device_id, user_id, org_id, project_id, key_version)'
  ) THEN
    RAISE EXCEPTION 'Thiếu UNIQUE (device_id, user_id, org_id, project_id, key_version) trên offline_vault_keys';
  END IF;
END $$;

-- Kiểm "đúng một chủ sử dụng" (hàm offline_proof_nguoi_khac bên dưới, xuyên org): tìm theo proof.
CREATE INDEX IF NOT EXISTS idx_offline_devices_proof ON offline_devices (proof_hash);

CREATE SEQUENCE IF NOT EXISTS offline_context_generation_seq AS bigint;

-- RLS (ADR-0005, khuôn DATA-MIGRATIONS §4): bảng mới → nghiêm ngặt, không nhánh '*'/GUC rỗng.
-- So sánh dạng TEXT với GUC (không cast GUC ::integer) theo ghi chú 0069/0077/0160 — Postgres
-- không bảo đảm short-circuit, GUC '*'/'' cast sang int sẽ lỗi. app.role do withTransaction đặt
-- từ actor đã xác thực (getCurrentUser), không phải header client.
ALTER TABLE offline_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE offline_vault_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_vault_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offline_device_read ON offline_devices;
CREATE POLICY offline_device_read ON offline_devices FOR SELECT
  USING (
    org_id::text = current_setting('app.org_id', true)
    AND (user_id::text = current_setting('app.user_id', true)
      OR current_setting('app.role', true) = 'admin')
  );
DROP POLICY IF EXISTS offline_device_register ON offline_devices;
CREATE POLICY offline_device_register ON offline_devices FOR INSERT
  WITH CHECK (
    org_id::text = current_setting('app.org_id', true)
    AND user_id::text = current_setting('app.user_id', true)
    AND profile = 'shared-safe'
    AND approved_by IS NULL AND approved_at IS NULL AND revoked_at IS NULL
  );
DROP POLICY IF EXISTS offline_device_admin_update ON offline_devices;
CREATE POLICY offline_device_admin_update ON offline_devices FOR UPDATE
  USING (
    org_id::text = current_setting('app.org_id', true)
    AND current_setting('app.role', true) = 'admin'
  )
  WITH CHECK (
    org_id::text = current_setting('app.org_id', true)
    AND current_setting('app.role', true) = 'admin'
  );

DROP POLICY IF EXISTS offline_vault_read ON offline_vault_keys;
CREATE POLICY offline_vault_read ON offline_vault_keys FOR SELECT
  USING (
    user_id::text = current_setting('app.user_id', true)
    AND org_id::text = current_setting('app.org_id', true)
    AND project_id::text = current_setting('app.project_id', true)
  );
DROP POLICY IF EXISTS offline_vault_create ON offline_vault_keys;
CREATE POLICY offline_vault_create ON offline_vault_keys FOR INSERT
  WITH CHECK (
    user_id::text = current_setting('app.user_id', true)
    AND org_id::text = current_setting('app.org_id', true)
    AND project_id::text = current_setting('app.project_id', true)
  );

-- Quyền tối thiểu: ALTER DEFAULT PRIVILEGES của 0069 tự cấp UPDATE/DELETE/TRUNCATE cho xboss_app
-- trên bảng mới — thu hồi. Thiết bị: chỉ UPDATE 4 cột profile/duyệt/thu hồi (không đổi owner/org/
-- proof). Khoá vault: chỉ SELECT/INSERT (không UPDATE wrapped_key/manifest, không DELETE).
-- REVOKE cấp bảng cũng thu hồi quyền cấp cột nên chạy lặp vẫn ra đúng tập quyền dưới đây.
REVOKE ALL ON offline_devices FROM xboss_app;
REVOKE ALL ON offline_vault_keys FROM xboss_app;
GRANT SELECT, INSERT ON offline_devices TO xboss_app;
GRANT UPDATE (profile, approved_by, approved_at, revoked_at) ON offline_devices TO xboss_app;
GRANT SELECT, INSERT ON offline_vault_keys TO xboss_app;
REVOKE ALL ON SEQUENCE offline_context_generation_seq FROM xboss_app;
GRANT USAGE ON SEQUENCE offline_context_generation_seq TO xboss_app;

-- "Đúng một chủ sử dụng" (D02) XUYÊN ORG: RLS chỉ cho actor thấy bản ghi cùng org, nên kiểm proof
-- có đang được người KHÁC dùng hay không phải qua hàm SECURITY DEFINER. Hàm chỉ trả boolean (không
-- lộ id/org/user nào), đầu vào là SHA-256 của proof 32 byte ngẫu nhiên (không dò được), search_path
-- cố định + tên bảng có schema. `p_chi_field_personal` = chỉ tính bản ghi field-personal.
--
-- Bảng có FORCE ROW LEVEL SECURITY nên chính owner (người tạo hàm, chạy hàm) cũng bị policy lọc
-- theo GUC actor → thêm policy SELECT dành riêng cho role owner (TO CURRENT_USER lúc migrate) để
-- hàm thấy mọi org. xboss_app KHÔNG khớp policy này (chặn chạy migration bằng xboss_app bên dưới).
DO $$
BEGIN
  IF current_user = 'xboss_app' THEN
    RAISE EXCEPTION 'Không chạy migration offline bằng role ứng dụng xboss_app (cần role owner)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'offline_devices'::regclass AND relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  ) AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Role chạy migration phải là owner của offline_devices';
  END IF;
END $$;

DROP POLICY IF EXISTS offline_device_owner_proof_check ON offline_devices;
CREATE POLICY offline_device_owner_proof_check ON offline_devices FOR SELECT TO CURRENT_USER
  USING (true);

CREATE OR REPLACE FUNCTION offline_proof_nguoi_khac(
  p_proof_hash bytea, p_user_id integer, p_chi_field_personal boolean
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.offline_devices o
     WHERE o.proof_hash = p_proof_hash
       AND o.user_id <> p_user_id
       AND o.revoked_at IS NULL
       AND (NOT p_chi_field_personal OR o.profile = 'field-personal')
  )
$fn$;
REVOKE ALL ON FUNCTION offline_proof_nguoi_khac(bytea, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION offline_proof_nguoi_khac(bytea, integer, boolean) TO xboss_app;

-- Audit duyệt/thu hồi thiết bị (Admin) qua trigger chung 0049 — CHỈ UPDATE: bản ghi INSERT sẽ chép
-- cả proof_hash vào audit_log, còn UPDATE chỉ ghi các cột đổi (profile/approved_*/revoked_at).
-- Không gắn trigger lên offline_vault_keys: dòng mới mang wrapped_key/manifest (không log khoá).
DROP TRIGGER IF EXISTS audit_offline_devices ON offline_devices;
CREATE TRIGGER audit_offline_devices AFTER UPDATE ON offline_devices
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
