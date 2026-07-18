-- 0065_totp.sql — M56 PR1: 2FA/TOTP (RFC 6238) cho tài khoản mật khẩu.
-- totp_secret lưu MÃ HOÁ (AES-256-GCM, khoá dẫn xuất từ XBOSS_SECRET, xem lib/totp.ts)
-- — không lưu plaintext. Xem docs/nang-cap/M56-2fa-totp.md mục PR1. Thêm thuần → đi
-- thẳng production.

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;              -- mã hoá, NULL = chưa bật
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT;         -- chống replay cùng step

CREATE TABLE IF NOT EXISTS totp_recovery_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,        -- scrypt như password_hash (lib/auth.ts::hashPassword)
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_totp_recovery_codes_user ON totp_recovery_codes(user_id);

-- Gắn audit trigger (0049) lên totp_recovery_codes — cột users đã có audit sẵn từ trước.
-- audit_row_change() đã tồn tại từ 0049; DROP+CREATE cho idempotent.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['totp_recovery_codes'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$s', t);
      EXECUTE format(
        'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s '
        'FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END IF;
  END LOOP;
END $$;
