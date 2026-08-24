-- V1 (đợt "nâng tầm" 2026-08-24) — Siết OTP liên kết Telegram/Zalo.
--
-- Bối cảnh: cả hai luồng sinh OTP đều upsert bằng `ON CONFLICT (id)` trên khoá chính UUID tự
-- sinh nên KHÔNG BAO GIỜ conflict — mỗi lần bấm "lấy mã" lại thêm một dòng binding trùng.
-- Sau khi code chuyển sang upsert đúng khoá nghiệp vụ, cần chỉ số duy nhất tương ứng; muốn tạo
-- được chỉ số thì phải dọn dữ liệu trùng do bug cũ để lại trước.
--
-- CẢNH BÁO VẬN HÀNH: đây là migration ĐỤNG DỮ LIỆU (DELETE dòng trùng + NULL hoá OTP đang
-- chờ) → BẮT BUỘC chạy qua staging trước theo DoD trong CLAUDE.md, kiểm trước bằng
-- `npm run db:migrate -- --dry-run`. Viết idempotent: chạy lại lần hai không lỗi, không xoá thêm.

-- 1) Zalo: gộp về một dòng cho mỗi (project_id, zalo_user_id).
--    Quy tắc giữ lại: ưu tiên dòng đã xác thực (is_verified = true) — đó là liên kết đang dùng
--    thật; nếu không có dòng nào đã xác thực thì giữ dòng mới nhất theo created_at (id làm
--    tie-break để kết quả xác định, không phụ thuộc thứ tự quét).
DELETE FROM zalo_user_bindings b
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY project_id, zalo_user_id
           ORDER BY is_verified DESC, created_at DESC, id DESC
         ) AS thu_tu
  FROM zalo_user_bindings
) d
WHERE b.id = d.id AND d.thu_tu > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_zalo_user_bindings_project_zid
  ON zalo_user_bindings (project_id, zalo_user_id);

-- 2) Telegram: mỗi user chỉ được có MỘT dòng đang chờ liên kết (is_verified = false).
--    Cố ý dùng chỉ số duy nhất TỪNG PHẦN thay vì unique(user_id) toàn bảng: các dòng đã xác
--    thực là liên kết thật (telegram_chat_id đã UNIQUE sẵn từ migration 0110) — không được
--    xoá bớt vì có thể là thiết bị đang dùng. Chỉ dòng chờ OTP mới là rác do bug sinh ra.
DELETE FROM telegram_user_bindings b
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY created_at DESC, id DESC
         ) AS thu_tu
  FROM telegram_user_bindings
  WHERE is_verified = false
) d
WHERE b.id = d.id AND d.thu_tu > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_user_bindings_cho_lien_ket
  ON telegram_user_bindings (user_id)
  WHERE is_verified = false;

-- 3) Vô hiệu hoá OTP dạng bản rõ còn tồn (code mới lưu SHA-256 hex dài 64 ký tự nên mã cũ
--    không bao giờ khớp nữa). NULL hoá để người dùng chủ động lấy mã mới, thay vì để lại mã
--    bản rõ nằm trong DB. Điều kiện length(...) <> 64 khiến chạy lại không đụng dòng nào.
UPDATE telegram_user_bindings
   SET otp_code = NULL, otp_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
 WHERE otp_code IS NOT NULL AND length(otp_code) <> 64;

UPDATE zalo_user_bindings
   SET verification_otp = NULL, otp_expires_at = NULL
 WHERE verification_otp IS NOT NULL AND length(verification_otp) <> 64;
