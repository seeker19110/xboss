## Phiên đăng nhập & ma trận quyền (VÙNG RỦI RO CAO)

- Cookie `xboss_session` stateless, **7 phần** `userId.exp.pwFrag.flag2fa.sessionVersion.orgId.HMAC` (ký/verify ở `lib/bao-mat/session-token.ts` — file này không được import `next/headers` hay `pg` vì `proxy.ts` dùng nó). Đổi thứ tự/số phần, bỏ kiểm `pwFrag`/`session_version`/`orgId` là làm token cũ (sau đổi mật khẩu/thu hồi phiên/đổi tổ chức) sống lại.
- So khớp chữ ký/secret bằng so sánh constant-time (`timingSafeEqual`), không dùng `===`.
- `XBOSS_SECRET` thiếu trong production phải throw khi ký/xác minh (fail-fast), không fallback giá trị mặc định.
- `flag2fa=1`: `proxy.ts` chặn mọi API ngoài `/api/auth/*` cho tới khi bật 2FA — mở rộng whitelist phải có lý do.
- Map `CAN` là nguồn quyền tập trung: thêm quyền ghi cho vai trò chỉ-xem (`bch`/`cdt`/`viewer`) hay nới `canTouchTask`/`canTouchPackage` cho `subcon` là thay đổi bảo mật — phải khớp đặc tả, nêu rõ nếu diff không giải thích.
- `PAYMENT_VIEW_ROLES` (admin/pm/bch) chỉ để **xem** tài chính.
