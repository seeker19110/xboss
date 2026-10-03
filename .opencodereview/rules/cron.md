## Endpoint cron

- Xác thực bằng `checkCronSecret(req.headers.get("authorization"))` — `CRON_SECRET` chỉ nhận qua header `Authorization: Bearer`, **không** qua query param (lộ trong log/proxy). Route nào cho phép thêm session Admin/PM thì kiểm đúng vai trò, không chỉ "đã đăng nhập".
- Thiếu cấu hình gửi (SMTP/Telegram/VAPID) → trả preview / no-op rõ ràng, không throw làm hỏng phần còn lại; thiếu `CRON_SECRET` → từ chối (không mở cửa).
- Chạy lại cùng ngày (cron retry) không gửi trùng/ghi trùng — idempotent theo khoá ngày hoặc khoá `sync_locks`.
- Mốc ngày dùng `todayISO()` (giờ `Asia/Ho_Chi_Minh`) — server chạy UTC.
- Truy vấn toàn cục (mọi dự án) phải có chủ đích (GUC `app.project_id = '*'` theo ADR-0005), không vô tình gửi dữ liệu dự án A cho người nhận dự án B.
