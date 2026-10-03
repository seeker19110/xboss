## Mô-đun bảo mật (lib/bao-mat/, app/api/auth/)

- Rate-limit endpoint nhạy cảm (login, 2FA...) lưu Postgres và cập nhật **atomic** bằng `INSERT ... ON CONFLICT` — không dùng `Map` trong process hay đọc-rồi-ghi (sai khi nhiều instance, race).
- 2FA/TOTP: có trần số lần dò mã theo tài khoản (chống brute-force phân tán qua nhiều IP); so mã constant-time; mã đã dùng không dùng lại được (chống replay qua `users.totp_last_step`).
- CSRF/OIDC: kiểm `state`/`nonce`, `redirect_uri` lấy từ `APP_URL` cấu hình — không lấy từ header `Host` hay query của client (open redirect).
- Webhook đi vào (nếu thêm lại): gọi `xacThucWebhookTelegram`/`xacThucWebhookZalo` ngay đầu handler, sai chữ ký → 401 trước khi ghi DB.
- Cookie phiên: đủ `httpOnly`, `sameSite: "lax"`, `secure` ở production.
- Không log mật khẩu, token, mã 2FA, secret; thông báo lỗi đăng nhập không phân biệt "sai email" với "sai mật khẩu".
- Mọi so sánh secret/HMAC dùng `timingSafeEqual` với kiểm độ dài trước.
