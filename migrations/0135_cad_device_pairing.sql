-- 0135_cad_device_pairing.sql — M99 PR2: ghép thiết bị plugin AutoCAD + token scope 'cad'.
--
-- ĐỔI TÊN TỪ `0133_cad_device_pairing.sql` (2026-08-24). Lý do: PR #386 (file này) và PR #387
-- (`0133_webhook_otp_hardening.sql`) phát triển song song, mỗi nhánh tự lấy số kế tiếp lúc phân
-- nhánh nên merge xong đụng cùng số 0133 → `npm run check:migrations` đỏ trên `main`. Đổi file
-- NÀY vì nó `thêm thuần` và idempotent hoàn toàn (ADD COLUMN/CREATE TABLE IF NOT EXISTS,
-- DROP TRIGGER IF EXISTS trước CREATE TRIGGER) nên chạy lại vô hại; file 0133 còn lại ĐỤNG DỮ
-- LIỆU (DELETE/UPDATE) nên không được động vào. Đúng hướng xử lý mà chính cổng khuyến nghị:
-- "File đã áp production chỉ đổi tên khi DDL idempotent và có ghi chú".
--
-- Runner (lib/db/migrate.ts) theo dõi migration BẰNG TÊN FILE trong `schema_migrations`, nên
-- môi trường đã chạy `0133_cad_device_pairing.sql` sẽ thấy tên mới là chưa áp và chạy lại.
-- Câu DELETE ngay dưới dọn dòng cũ để không còn bản ghi mồ côi trỏ tới file không còn tồn tại;
-- nó nằm CÙNG transaction với phần DDL bên dưới và với câu INSERT tên mới của runner, nên hoặc
-- ăn trọn hoặc không đổi gì. DB mới tinh: DELETE không khớp dòng nào, vô hại.
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
-- VẬN HÀNH: phần DDL vẫn là `thêm thuần` (ADD COLUMN / CREATE TABLE / CREATE INDEX), NHƯNG file
-- này có thêm câu DELETE trên `schema_migrations` ở dưới. Theo DoD trong CLAUDE.md, migration có
-- DELETE/UPDATE phải **chạy qua staging trước** (`bash deploy.sh --staging`, xem docs/ops/staging.md)
-- rồi mới lên production — dù ở đây chỉ là dọn bookkeeping chứ không đụng dữ liệu nghiệp vụ.
-- Kiểm trước bằng `npm run db:migrate -- --dry-run`: phải thấy đúng 1 file `0135_...` sẽ áp.

-- Dọn bản ghi theo dõi của tên file cũ (xem ghi chú đổi tên ở đầu file).
DELETE FROM schema_migrations WHERE name = '0133_cad_device_pairing.sql';

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
