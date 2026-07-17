-- 0059_api_keys.sql — M49 PR1: API keys đọc-only cho namespace /api/v1.
-- Bên thứ ba đọc dữ liệu qua API key (Bearer xbk_...). Key thô chỉ hiện 1 lần lúc tạo;
-- DB chỉ giữ sha256 hex. project_id NULL = key toàn cục (mọi dự án). Xem
-- docs/nang-cap/M49-api-mo-sso.md mục PR1. Thêm thuần (CREATE TABLE/TRIGGER).

CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,        -- sha256 hex của key thô; key thô chỉ hiện 1 lần lúc tạo
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = key toàn cục (mọi dự án)
  scopes TEXT[] NOT NULL DEFAULT '{read}',                   -- 'read' | 'read_finance'
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

-- Gắn audit trigger (0049) lên bảng api_keys để mọi thay đổi được ghi tự động (M43 PR1).
-- audit_row_change() đã tồn tại từ 0049; DROP+CREATE cho idempotent. Tạo/thu hồi key là
-- thao tác nhạy cảm phải vào audit_log.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['api_keys'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$s', t);
      EXECUTE format(
        'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s '
        'FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END IF;
  END LOOP;
END $$;
