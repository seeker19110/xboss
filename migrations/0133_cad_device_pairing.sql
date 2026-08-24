-- 0133_cad_device_pairing.sql — M99 PR2: ghép thiết bị plugin AutoCAD + token scope 'cad'.
--
-- TÁI DÙNG bảng api_keys sẵn có (0061 — hash sha256, thu hồi, audit trigger, org_id từ 0078)
-- thay vì bảng api_tokens mới như DDL nháp trong M99 §11 — điểm lệch spec có chủ đích, đã ghi
-- lại trong docs/nang-cap/M99-plugin-autocad-chuan-hoa.md §11 (bản cập nhật PR2).
--
-- Luồng ghép kiểu OAuth device flow (M99 §6.1):
--   plugin POST /api/devices/pair → nhận user_code (8 ký tự, hiện cho người) + device_code
--   (bí mật, chỉ plugin giữ — DB chỉ lưu sha256) → kỹ sư duyệt user_code trên web (session +
--   CAN.manageDrawings) → plugin poll /api/devices/pair/claim bằng device_code → server SINH
--   api key TẠI THỜI ĐIỂM CLAIM (key thô không bao giờ nằm trong DB), trả đúng 1 lần.
--
-- Thêm thuần (ADD COLUMN / CREATE TABLE / CREATE INDEX) — đi thẳng production theo DoD.

-- Token thiết bị có hạn dùng + tên thiết bị (api key đọc-only cũ giữ expires_at NULL = vô hạn,
-- verifyApiKey chỉ chặn khi expires_at NOT NULL và đã qua — không đổi hành vi key hiện có).
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS device_name TEXT;

CREATE TABLE IF NOT EXISTS cad_device_pairings (
  id SERIAL PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,          -- mã ngắn hiện trong AutoCAD cho kỹ sư gõ vào web
  device_code_hash TEXT NOT NULL UNIQUE,   -- sha256 hex của device_code bí mật (plugin poll)
  device_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'claimed', 'denied')),
  confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL          -- mã ghép sống ngắn (10 phút), hết hạn là chết
);

-- Bảng tiền-xác-thực (chưa biết org/user cho tới lúc duyệt) → không RLS; dọn dòng hết hạn
-- là việc của retention (mã hết hạn vô hại: user_code/device_code_hash không dùng lại được).

-- Audit trigger (0049) — duyệt/claim/thu hồi thiết bị là thao tác nhạy cảm phải vào audit_log,
-- cùng pattern 0061 áp cho api_keys.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cad_device_pairings'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$s', t);
      EXECUTE format(
        'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s '
        'FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END IF;
  END LOOP;
END $$;
