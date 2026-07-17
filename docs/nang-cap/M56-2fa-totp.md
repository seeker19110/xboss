# M56 — 2FA/TOTP cho tài khoản mật khẩu (P1 — làm trước M54 SaaS)

> **Mục tiêu**: lớp xác thực thứ hai (TOTP chuẩn RFC 6238, Google Authenticator/Authy) cho tài khoản đăng nhập bằng mật khẩu. SSO OIDC (M49 PR3) đã đẩy MFA về IdP; lỗ hổng còn lại là tài khoản local — gồm toàn bộ admin/pm hiện tại. Chuẩn tối thiểu của ERP thương mại trước khi mở SaaS (M54).
>
> **Không làm**: WebAuthn/passkey (đợt sau nếu có nhu cầu), SMS OTP (không hạ tầng SMS, kém an toàn), bắt buộc 2FA cho engineer/subcon (điện thoại công trường hay đổi máy — chỉ KHUYẾN KHÍCH qua UI, bắt buộc được cấu hình per-role sau).
>
> **Thư viện**: `otplib` (TOTP thuần JS, không native dep) — thêm dependency mới, ghi rõ trong PR để reviewer soát supply-chain (pin version, `npm audit` CI sẵn có).

## PR1 — Nền TOTP + bật/tắt cho bản thân (`route: complex` — chạm `lib/auth.ts`, vùng rủi ro cao)

### Migration `0066_totp.sql` (đổi số nếu bị chiếm; thuần thêm → đi thẳng production)

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;        -- base32, NULL = chưa bật
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS totp_recovery_codes (                    -- 8 mã dự phòng 1 lần
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,                                          -- scrypt như password_hash
  used_at TIMESTAMPTZ
);
-- Audit trigger M43 (audit_row_change) gắn lên totp_recovery_codes; cột users đã có audit sẵn.
```

`totp_secret` lưu **mã hoá đối xứng** bằng khoá dẫn xuất từ `XBOSS_SECRET` (AES-256-GCM, helper mới trong `lib/auth.ts` — KHÔNG lưu plaintext: dump DB không được phép sinh mã OTP hợp lệ). Ghi rõ trade-off trong comment: mất `XBOSS_SECRET` = mọi user phải re-enroll (chấp nhận — cùng blast-radius với cookie phiên hiện tại).

### API (route mới, đều `force-dynamic` + auth)

- `POST /api/auth/totp/setup` — user đã đăng nhập: sinh secret + trả `otpauth://` URI (client render QR bằng lib QR thuần — xem M58 dùng chung) + 8 recovery code (hiện đúng 1 lần). Secret ở trạng thái "chờ xác nhận" (chưa set `totp_enabled_at`).
- `POST /api/auth/totp/confirm { code }` — nhập đúng mã đầu tiên mới bật thật (chống tự khoá vì scan hỏng). Window ±1 step (30s).
- `DELETE /api/auth/totp` — tắt: yêu cầu mật khẩu hiện tại + mã TOTP/recovery còn hạn (chống kẻ chiếm phiên tắt 2FA). Admin tắt hộ user khác qua `PATCH /api/users/:id` (quyền `manageUsers`) — đường thoát khi user mất máy, ghi audit.

### Luồng login (điểm chạm `app/api/auth/login/route.ts` + `lib/auth.ts`)

- Sau `verifyPassword` OK: user có `totp_enabled_at` → KHÔNG set cookie phiên; trả `{ need2fa: true, pending }` với `pending` = token HMAC ngắn hạn (`userId.exp.HMAC`, purpose riêng `'2fa'`, TTL 5 phút, tái dùng khuôn `makeToken` với salt purpose — không dùng lẫn được làm cookie phiên).
- `POST /api/auth/login/2fa { pending, code }` — verify pending + TOTP (hoặc recovery code → đánh dấu `used_at`) → set cookie phiên như luồng cũ. Rate-limit riêng khoá `totp|<ip>` (khuôn `oidc|<ip>` của M49 PR3, không đụng `lib/ratelimit.ts` core).
- Chống replay trong window: lưu step cuối dùng thành công (cột `totp_last_step BIGINT` trên users) — mã cùng step không dùng được 2 lần.

### UI

- `/account`: khối "Xác thực 2 lớp" — bật (QR + nhập mã xác nhận + hiện recovery codes 1 lần kèm nút tải .txt), tắt, trạng thái. `/login`: bước 2 nhập mã khi `need2fa`. Toàn bộ tiếng Việt, theme token, mobile-first theo quy ước.

### Test + tiêu chí

- `tests/totp.test.ts`: unit (sinh/verify mã với secret cố định + mock thời gian, window ±1, replay cùng step bị chặn) + integration (setup→confirm→login 2 bước qua route thật; recovery code dùng 1 lần; tắt cần mật khẩu+mã; pending token hết hạn/purpose sai bị từ chối; user chưa bật 2FA login như cũ KHÔNG đổi hành vi).
- Bất biến tương thích: toàn bộ test auth cũ xanh không sửa — user chưa bật 2FA không thấy khác biệt nào.

## PR2 — Chính sách bắt buộc theo vai trò (`route: standard`, sau PR1 chạy ổn)

- `code_lists`/setting mới `require_2fa_roles` (mặc định rỗng): user thuộc role bắt buộc mà chưa bật → sau login bị chặn ở trang "Bật 2FA để tiếp tục" (chỉ cho vào `/account` phần setup + logout). Admin bật dần: khuyến nghị `admin` trước, `pm` sau.
- Test: role bắt buộc chưa bật bị 403 mọi API trừ whitelist setup/logout; role không bắt buộc không ảnh hưởng.
