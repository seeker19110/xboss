# M44 — Vận hành cấp doanh nghiệp: backup/DR, health, logging, giám sát (P0)

> **Mục tiêu**: chính thức hoá lớp vận hành — backup có kiểm chứng phục hồi (RPO ≤ 24h, RTO ≤ 4h), health endpoint cho uptime monitor, structured logging có `request_id`, bật Sentry, staging. Nâng trục Vận hành 2.5 → ~4.0. Phần lớn là script/hạ tầng, ít đụng code app.
>
> **Phụ thuộc**: PR3 dùng `request_id` từ M43 PR1 (`lib/request-context.ts`) — có thể code song song, merge sau M43 PR1.

## PR1 — Backup + kiểm chứng phục hồi (không đụng code app)

- `scripts/ops/backup.sh`: `pg_dump -Fc "$DATABASE_URL"` → `backups/xboss-$(date +%F).dump`; đẩy bản sao ra ngoài máy qua `rclone` (đích cấu hình `BACKUP_REMOTE`, vd Google Drive/S3-compatible); xoá bản cũ >30 ngày local, >90 ngày remote; kèm tar thư mục `data/uploads/` (ảnh/biên bản — cùng RPO với DB).
- `scripts/ops/restore-check.sh`: tạo DB tạm `xboss_restore_check` → `pg_restore` bản dump mới nhất → đếm số bảng + số dòng 5 bảng lõi (`tasks`, `contracts`, `payment_certs`, `materials`, `users`) so ngưỡng > 0 → DROP DB tạm → exit code + log. **Backup chưa restore được = chưa có backup.**
- Cron (crontab VPS, tài liệu hoá — không dùng route app): backup hằng đêm 01:00, restore-check Chủ nhật 02:00; kết quả gửi Telegram qua script curl sẵn có pattern trong `lib/` (hoặc đơn giản: ghi file log + dòng trạng thái đưa vào daily-report).
- `docs/ops/backup.md` (mới): mục tiêu **RPO ≤ 24h / RTO ≤ 4h**, quy trình phục hồi từng bước (kịch bản mất DB, mất cả VPS), vị trí backup, cách xoay secret sau sự cố. Link từ `docs/ops/incident-response.md`.

## PR2 — Health endpoint + uptime

- `GET /api/health` (public, **không** cần auth — nhưng public-safe):
  ```json
  { "status": "ok|degraded", "db": true, "migration": "0049", "uptime_s": 1234 }
  ```
  - DB ping `SELECT 1` timeout 3s; `migration` = MAX(name) từ `schema_migrations`; **không** lộ version app/hostname/disk chi tiết.
  - `status: degraded` + HTTP 503 khi DB fail → uptime monitor bắt được.
  - `export const dynamic = "force-dynamic"`; loại trừ khỏi cache `public/sw.js` (tăng version `CACHE`).
- Đăng ký uptime monitor ngoài (UptimeRobot/BetterStack free tier) ping 1 phút — tài liệu hoá trong `docs/ops/backup.md`, việc đăng ký là thao tác tay của admin.

## PR3 — Structured logging + Sentry

- `lib/log.ts` (mới): `log.info/warn/error(msg, fields)` in **1 dòng JSON**/sự kiện: `{t, level, msg, requestId, userId, route, ...fields}` — `requestId/userId` đọc từ `getRequestContext()` (M43). Prod: JSON ra stdout (pm2 gom); dev: pretty in màu.
- Thay dần `console.error` rải rác (grep ~các route + `lib/*`) bằng `log.error` — làm theo lô, ưu tiên route tài chính/cron/sync trước; **không** yêu cầu đổi 100% trong PR này.
- Access log: cuối `middleware.ts` không đo được response — bỏ qua; thay bằng ghi log trong các handler lỗi (4xx/5xx) qua helper `apiError(status, msg)` nếu tiện điểm chạm, không chế thêm wrapper toàn cục.
- **Sentry**: đặt `SENTRY_DSN` trên prod (thao tác tay, xoá nợ trong PROGRESS.md); thêm `requestId` vào Sentry scope tag trong `instrumentation.ts`; bật alert email khi error rate tăng (cấu hình trên sentry.io, tài liệu hoá).

## PR4 — Staging + quy trình migration an toàn

- Tài liệu `docs/ops/staging.md`: dựng staging = 1 instance pm2 thứ 2 + DB `xboss_staging` trên cùng VPS (đủ cho quy mô hiện tại), deploy bằng `deploy.sh --staging` (thêm cờ: đổi thư mục + port + env file).
- Quy ước (ghi vào CLAUDE.md mục Quy trình): migration **đụng dữ liệu** (UPDATE/backfill/đổi kiểu cột) phải chạy staging trước prod; migration chỉ CREATE/ADD COLUMN được đi thẳng.
- `npm run db:migrate -- --dry-run` (mở rộng `lib/db/migrate.ts`): in danh sách migration sẽ áp mà không chạy — dùng kiểm tra trước deploy.

## Test

- `tests/health.test.ts`: gọi handler trực tiếp — DB ok → 200 đúng shape; mock query fail → 503 (pattern test route sẵn có).
- `tests/log.test.ts` (unit): log ra JSON 1 dòng đủ trường, không throw khi thiếu context.
- Script backup/restore-check: chạy tay trên VPS khi triển khai, ghi kết quả lần đầu vào `docs/ops/backup.md` — không đưa vào CI (cần pg_dump + rclone).

## Chia PR

1. **PR1**: scripts backup/restore-check + docs/ops/backup.md + crontab mẫu.
2. **PR2**: `/api/health` + sw.js exclude + test.
3. **PR3**: `lib/log.ts` + thay console.error lô đầu + Sentry tag requestId (sau M43 PR1).
4. **PR4**: staging docs + deploy.sh --staging + migrate --dry-run.
