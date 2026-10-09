-- 0170_offline_vault_bao_tri.sql — M131 phần 1: role bảo trì vault offline (rewrap KEK, retire khoá
-- tự động) + bảng yêu cầu khôi phục khi mất proof (docs/nang-cap/M131-vault-offline-bao-tri-va-khoi-phuc.md
-- §1). Đóng "Cần quyết" (1)(2)(3) của S05/S07.
--
-- - Role `xboss_vault_maint` LOGIN NOBYPASSRLS (mẫu 0069): chỉ script `npm run vault:maint` dùng, KHÔNG
--   thuộc runtime app. Chỉ được UPDATE đúng 3 cột wrapped_key/kek_version/retired_at của khoá
--   (cột bất biến id/device/user/org/project/key_version/manifest… không grant → không sửa được) và
--   cột status của yêu cầu khôi phục (đổi pending quá hạn → expired).
-- - xboss_app GIỮ NGUYÊN: không UPDATE/DELETE offline_vault_keys (DATA-MIGRATIONS:141).
-- - Audit khoá qua hàm riêng `audit_offline_vault_key_change()` chỉ ghi kek_version/retired_at
--   (không dùng audit_row_change — hàm đó dump cả wrapped_key).
--
-- Chỉ thêm thuần tuý (CREATE ROLE/TABLE/INDEX/POLICY/FUNCTION/TRIGGER/GRANT), không đụng dòng dữ
-- liệu có sẵn → đi thẳng production. Chạy lặp an toàn.

-- Chặn chạy bằng role ứng dụng / non-owner (khuôn 0163).
DO $$
BEGIN
  IF current_user = 'xboss_app' THEN
    RAISE EXCEPTION 'Không chạy migration offline bằng role ứng dụng xboss_app (cần role owner)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'offline_vault_keys'::regclass AND relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  ) AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Role chạy migration phải là owner của offline_vault_keys';
  END IF;
END $$;

-- 1. Role bảo trì. NGƯỜI VẬN HÀNH PHẢI đổi mật khẩu lúc deploy:
--    ALTER ROLE xboss_vault_maint PASSWORD '<mật khẩu thật>' (xem DEPLOY.md).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'xboss_vault_maint') THEN
    IF NOT (SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user) THEN
      RAISE EXCEPTION 'Role migration không có quyền CREATEROLE — superuser tạo tay: CREATE ROLE xboss_vault_maint LOGIN NOBYPASSRLS PASSWORD ''<mật khẩu>''; rồi chạy lại migration (xem DEPLOY.md, mục vault offline)';
    END IF;
    CREATE ROLE xboss_vault_maint LOGIN NOBYPASSRLS PASSWORD 'CHANGE_ME_ON_DEPLOY';
  END IF;
END $$;

-- 5. Bảng yêu cầu khôi phục khi mất proof (luồng route/UI ở M131 §3).
CREATE TABLE IF NOT EXISTS offline_vault_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id int NOT NULL REFERENCES organizations(id),
  user_id int NOT NULL REFERENCES users(id),
  old_device_id uuid NOT NULL,
  new_device_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'expired')),
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  decided_by int REFERENCES users(id),
  decided_at timestamptz,
  decide_note text,
  completed_at timestamptz,
  keys_recovered int,
  keys_skipped int,
  requested_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (old_device_id, user_id, org_id) REFERENCES offline_devices(id, user_id, org_id),
  FOREIGN KEY (new_device_id, user_id, org_id) REFERENCES offline_devices(id, user_id, org_id),
  CHECK (old_device_id <> new_device_id),
  CHECK (status NOT IN ('approved', 'rejected') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  -- SoD: không tự duyệt yêu cầu của chính mình.
  CHECK (decided_by IS NULL OR decided_by <> user_id)
);

DO $$
BEGIN
  IF (
    SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'offline_vault_recovery_requests'
       AND (column_name, data_type, is_nullable) IN (
         ('id', 'uuid', 'NO'), ('org_id', 'integer', 'NO'), ('user_id', 'integer', 'NO'),
         ('old_device_id', 'uuid', 'NO'), ('new_device_id', 'uuid', 'NO'),
         ('status', 'text', 'NO'), ('reason', 'text', 'YES'), ('decided_by', 'integer', 'YES'),
         ('decided_at', 'timestamp with time zone', 'YES'), ('decide_note', 'text', 'YES'),
         ('completed_at', 'timestamp with time zone', 'YES'),
         ('keys_recovered', 'integer', 'YES'), ('keys_skipped', 'integer', 'YES'),
         ('requested_at', 'timestamp with time zone', 'NO')
       )
  ) <> 14 THEN
    RAISE EXCEPTION 'Sai định nghĩa cột offline_vault_recovery_requests';
  END IF;
END $$;

-- Tối đa 1 yêu cầu đang mở (pending|approved) cho mỗi thiết bị cũ.
CREATE UNIQUE INDEX IF NOT EXISTS uq_offline_vault_recovery_open
  ON offline_vault_recovery_requests (old_device_id) WHERE status IN ('pending', 'approved');

-- 3. Index cho script bảo trì.
CREATE INDEX IF NOT EXISTS idx_offline_vault_keys_kek_live
  ON offline_vault_keys (kek_version) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_offline_vault_keys_device
  ON offline_vault_keys (device_id) WHERE retired_at IS NULL;

-- RLS bảng khôi phục (khuôn 0163: so sánh TEXT với GUC, không nhánh '*'/GUC rỗng).
ALTER TABLE offline_vault_recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_vault_recovery_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offline_recovery_read ON offline_vault_recovery_requests;
CREATE POLICY offline_recovery_read ON offline_vault_recovery_requests FOR SELECT
  USING (
    org_id::text = current_setting('app.org_id', true)
    AND (user_id::text = current_setting('app.user_id', true)
      OR current_setting('app.role', true) = 'admin')
  );
DROP POLICY IF EXISTS offline_recovery_create ON offline_vault_recovery_requests;
CREATE POLICY offline_recovery_create ON offline_vault_recovery_requests FOR INSERT
  WITH CHECK (
    org_id::text = current_setting('app.org_id', true)
    AND user_id::text = current_setting('app.user_id', true)
    AND status = 'pending'
    AND decided_by IS NULL AND decided_at IS NULL AND decide_note IS NULL
    AND completed_at IS NULL AND keys_recovered IS NULL AND keys_skipped IS NULL
  );
-- Admin cùng org quyết định; chủ yêu cầu chỉ được chuyển approved → completed.
DROP POLICY IF EXISTS offline_recovery_update ON offline_vault_recovery_requests;
CREATE POLICY offline_recovery_update ON offline_vault_recovery_requests FOR UPDATE
  USING (
    org_id::text = current_setting('app.org_id', true)
    AND (current_setting('app.role', true) = 'admin'
      OR (user_id::text = current_setting('app.user_id', true) AND status = 'approved'))
  )
  WITH CHECK (
    org_id::text = current_setting('app.org_id', true)
    AND (current_setting('app.role', true) = 'admin'
      OR (user_id::text = current_setting('app.user_id', true) AND status = 'completed'))
  );

-- 2. Policy cho role bảo trì (FORCE RLS đã bật trên cả 3 bảng). Quyền thực tế bị chặn bởi GRANT
-- cấp cột bên dưới — policy `true` không mở được cột bất biến.
DROP POLICY IF EXISTS offline_vault_maint_read ON offline_vault_keys;
CREATE POLICY offline_vault_maint_read ON offline_vault_keys FOR SELECT TO xboss_vault_maint
  USING (true);
DROP POLICY IF EXISTS offline_vault_maint_update ON offline_vault_keys;
CREATE POLICY offline_vault_maint_update ON offline_vault_keys FOR UPDATE TO xboss_vault_maint
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS offline_device_maint_read ON offline_devices;
CREATE POLICY offline_device_maint_read ON offline_devices FOR SELECT TO xboss_vault_maint
  USING (true);
DROP POLICY IF EXISTS offline_recovery_maint_read ON offline_vault_recovery_requests;
CREATE POLICY offline_recovery_maint_read ON offline_vault_recovery_requests FOR SELECT
  TO xboss_vault_maint USING (true);
DROP POLICY IF EXISTS offline_recovery_maint_update ON offline_vault_recovery_requests;
CREATE POLICY offline_recovery_maint_update ON offline_vault_recovery_requests FOR UPDATE
  TO xboss_vault_maint USING (true) WITH CHECK (true);

-- Quyền: ALTER DEFAULT PRIVILEGES của 0069 tự cấp UPDATE/DELETE/TRUNCATE cho xboss_app trên bảng
-- mới — thu hồi rồi cấp lại đúng tập tối thiểu (REVOKE cấp bảng thu luôn quyền cấp cột → chạy lặp
-- vẫn ra đúng tập quyền).
REVOKE ALL ON offline_vault_recovery_requests FROM xboss_app;
GRANT SELECT, INSERT ON offline_vault_recovery_requests TO xboss_app;
GRANT UPDATE (status, decided_by, decided_at, decide_note, completed_at, keys_recovered, keys_skipped)
  ON offline_vault_recovery_requests TO xboss_app;

REVOKE ALL ON offline_vault_keys FROM xboss_vault_maint;
REVOKE ALL ON offline_devices FROM xboss_vault_maint;
REVOKE ALL ON offline_vault_recovery_requests FROM xboss_vault_maint;
REVOKE ALL ON organizations FROM xboss_vault_maint;
REVOKE ALL ON audit_log FROM xboss_vault_maint;
GRANT USAGE ON SCHEMA public TO xboss_vault_maint;
GRANT SELECT ON offline_devices, offline_vault_recovery_requests, organizations TO xboss_vault_maint;
GRANT SELECT, UPDATE (wrapped_key, kek_version, retired_at) ON offline_vault_keys TO xboss_vault_maint;
GRANT UPDATE (status) ON offline_vault_recovery_requests TO xboss_vault_maint;
GRANT INSERT ON audit_log TO xboss_vault_maint;
-- Hash-chain audit (0050/0090) đọc row_hash của dòng audit cuối (ORDER BY id) → cần SELECT đúng 2
-- cột id/row_hash (không đọc được nội dung changes/actor).
GRANT SELECT (id, row_hash) ON audit_log TO xboss_vault_maint;
DO $$
BEGIN
  IF to_regclass('audit_log_id_seq') IS NOT NULL THEN
    GRANT USAGE ON SEQUENCE audit_log_id_seq TO xboss_vault_maint;
  END IF;
END $$;

-- 4. Audit khoá vault KHÔNG lộ vật liệu khoá: chỉ ghi kek_version/retired_at (cũ → mới). Cùng công
-- thức hash-chain với audit_row_change (0090) để chuỗi kiểm toán vẫn liền mạch.
CREATE OR REPLACE FUNCTION audit_offline_vault_key_change() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_key text := NEW.id::text;
  v_project int;
  v_project_raw text;
  v_prev_hash text;
  v_row_hash text;
BEGIN
  IF OLD.kek_version IS DISTINCT FROM NEW.kek_version THEN
    v_changes := v_changes || jsonb_build_object(
      'kek_version', jsonb_build_array(to_jsonb(OLD.kek_version), to_jsonb(NEW.kek_version)));
  END IF;
  IF OLD.retired_at IS DISTINCT FROM NEW.retired_at THEN
    v_changes := v_changes || jsonb_build_object(
      'retired_at', jsonb_build_array(to_jsonb(OLD.retired_at), to_jsonb(NEW.retired_at)));
  END IF;
  IF v_changes = '{}'::jsonb THEN RETURN NEW; END IF;

  v_project_raw := NULLIF(current_setting('app.project_id', true), '');
  v_project := CASE WHEN v_project_raw ~ '^[0-9]{1,9}$' THEN v_project_raw::int ELSE NULL END;

  SELECT a.row_hash INTO v_prev_hash FROM public.audit_log a ORDER BY a.id DESC LIMIT 1;
  v_row_hash := encode(
    sha256(convert_to(COALESCE(v_prev_hash, '') || v_key || now()::text || v_changes::text, 'UTF8')),
    'hex'
  );

  INSERT INTO public.audit_log(actor_id, actor_role, entity_type, entity_id, entity_key, action,
                               changes, project_id, request_id, row_hash)
  VALUES (CASE WHEN current_setting('app.user_id', true) ~ '^[0-9]{1,9}$'
               THEN current_setting('app.user_id', true)::int END,
          NULLIF(current_setting('app.role', true), ''),
          'offline_vault_keys', NULL, v_key, TG_OP, v_changes,
          v_project,
          NULLIF(current_setting('app.request_id', true), ''),
          v_row_hash);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_offline_vault_keys ON offline_vault_keys;
CREATE TRIGGER audit_offline_vault_keys AFTER UPDATE ON offline_vault_keys
  FOR EACH ROW EXECUTE FUNCTION audit_offline_vault_key_change();

-- Bảng khôi phục không mang vật liệu khoá → trigger audit chung.
DROP TRIGGER IF EXISTS audit_offline_vault_recovery_requests ON offline_vault_recovery_requests;
CREATE TRIGGER audit_offline_vault_recovery_requests AFTER INSERT OR UPDATE
  ON offline_vault_recovery_requests FOR EACH ROW EXECUTE FUNCTION audit_row_change();
