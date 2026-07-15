# Backup & phục hồi (Disaster Recovery)

> Cụ thể hóa lớp "Vận hành" của M44 — chính sách backup có **kiểm chứng phục hồi**, không chỉ
> "có chạy pg_dump là xong". Liên kết: [`docs/ops/incident-response.md`](./incident-response.md)
> (khi backup này thực sự cần dùng, tức đang xử lý sự cố), [`docs/ops/staging.md`](./staging.md)
> (môi trường tập dượt phục hồi/migration trước khi đụng dữ liệu thật).

## Mục tiêu (SLA nội bộ)

| Chỉ số                             | Mục tiêu | Ý nghĩa                                                                         |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------- |
| **RPO** (Recovery Point Objective) | ≤ 24 giờ | Mất nhiều nhất dữ liệu của 1 ngày làm việc — backup chạy hằng đêm.              |
| **RTO** (Recovery Time Objective)  | ≤ 4 giờ  | Từ lúc phát hiện mất DB/VPS tới lúc app chạy lại với dữ liệu gần nhất, ≤ 4 giờ. |

**Nguyên tắc cốt lõi: "Backup chưa restore được = chưa có backup."** Vì vậy có **2 script riêng biệt** —
`backup.sh` (tạo bản sao) và `restore-check.sh` (chứng minh bản sao đó thực sự phục hồi được) — chạy
định kỳ độc lập, không tin tưởng "chắc là backup ổn" chỉ vì `pg_dump` không báo lỗi.

## Thành phần được backup

1. **Database** (`pg_dump -Fc`, custom format — nén sẵn, phục hồi chọn lọc được từng bảng nếu cần).
2. **`data/uploads/`** — ảnh hiện trường + biên bản nghiệm thu + hồ sơ hợp đồng/claim/VO (không nằm
   trong DB, mất là mất vĩnh viễn, nên đóng gói cùng RPO 24h với DB).

Không backup: `node_modules/`, `.next/` (build lại được từ Git + `npm ci`), log file.

## Script

- **`scripts/ops/backup.sh`** — `pg_dump -Fc "$DATABASE_URL"` → `backups/xboss-YYYY-MM-DD.dump` +
  `tar czf` thư mục uploads → đẩy cả hai ra ngoài máy qua `rclone` (đích cấu hình qua biến
  `BACKUP_REMOTE`, xem bên dưới) → dọn bản cũ (local > 30 ngày, remote > 90 ngày, đổi qua
  `LOCAL_RETENTION_DAYS`/`REMOTE_RETENTION_DAYS` nếu cần).
- **`scripts/ops/restore-check.sh`** — lấy bản dump mới nhất → tạo DB tạm `xboss_restore_check`
  (cùng Postgres instance, KHÔNG đụng DB thật) → `pg_restore` vào đó → đếm tổng số bảng + số dòng
  5 bảng lõi (`tasks`, `contracts`, `payment_certs`, `materials`, `users`) phải > 0 → DROP DB tạm
  (kể cả khi kiểm tra fail, qua `trap ... EXIT`) → exit code khác 0 nếu có bước nào sai.

Cả hai là **bash thuần**, không phải TypeScript — chạy trực tiếp trên VPS bằng `pg_dump`/`pg_restore`/
`psql` có sẵn từ gói `postgresql-client`, không phụ thuộc Node/npm.

## Cấu hình `rclone` (đẩy backup ra ngoài VPS)

Backup chỉ nằm trên cùng VPS với DB gốc thì **không chống được mất cả VPS** (sự cố phần cứng,
nhà cung cấp khoá tài khoản...). Bắt buộc đẩy 1 bản ra nơi khác:

```bash
# Cài rclone (1 lần trên VPS)
curl https://rclone.org/install.sh | sudo bash

# Cấu hình remote (ví dụ Google Drive hoặc bất kỳ dịch vụ S3-compatible) — làm theo
# hướng dẫn tương tác của "rclone config", đặt tên remote (ví dụ "gdrive").
rclone config

# Đặt biến môi trường cho backup.sh (thêm vào ~/.bashrc hoặc file env riêng của cron)
export BACKUP_REMOTE="gdrive:xboss-backups"
```

Thiếu `BACKUP_REMOTE` → `backup.sh` vẫn chạy (backup local vẫn có ích cho phục hồi nhanh mất-DB-
không-mất-VPS) nhưng in cảnh báo rõ ràng — **không đạt RPO/RTO nếu mất cả VPS**.

## Crontab mẫu (trên VPS, user chạy app)

```cron
# Backup DB + uploads hằng đêm 01:00 (giờ ít người dùng app nhất)
0 1 * * * cd /path/to/xboss && export $(grep -E '^(DATABASE_URL|BACKUP_REMOTE)=' .env.local | xargs) && bash scripts/ops/backup.sh >> logs/backup.log 2>&1

# Kiểm chứng phục hồi Chủ nhật 02:00 (sau backup ~1h, không trùng giờ backup)
0 2 * * 0 cd /path/to/xboss && export $(grep -E '^DATABASE_URL=' .env.local | xargs) && bash scripts/ops/restore-check.sh >> logs/restore-check.log 2>&1
```

Gợi ý gửi kết quả qua Telegram (tái dùng `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` đã có trong
`.env.local` cho báo cáo ngày) — thêm dòng `curl` đơn giản vào cuối crontab entry, ví dụ:

```cron
0 2 * * 0 cd /path/to/xboss && bash scripts/ops/restore-check.sh >> logs/restore-check.log 2>&1 || \
  curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d chat_id="$TELEGRAM_CHAT_ID" -d text="⚠️ XBoss restore-check THẤT BẠI — xem logs/restore-check.log"
```

## Uptime monitor (đăng ký tay, không phải script)

Sau khi có `GET /api/health` (M44 PR2), đăng ký 1 uptime monitor ngoài ping endpoint này mỗi phút —
thao tác tay của admin, không tự động hoá trong repo:

1. Đăng ký tài khoản free tier [UptimeRobot](https://uptimerobot.com) hoặc [BetterStack](https://betterstack.com/uptime).
2. Thêm monitor HTTP(S) trỏ tới `https://<domain-production>/api/health`, chu kỳ 1 phút.
3. Cấu hình cảnh báo khi HTTP status khác 200 (endpoint trả 503 khi DB fail) — gửi email/Telegram/SMS
   tuỳ gói.

## Quy trình phục hồi — kịch bản "mất DB" (VPS còn sống)

RTO mục tiêu: ≤ 4 giờ (thực tế nhanh hơn nhiều nếu backup local còn nguyên).

1. **Dừng app** để không ghi dữ liệu mới vào DB hỏng: `pm2 stop xboss`.
2. Xác định bản dump gần nhất dùng được: `ls -t backups/xboss-*.dump | head -1` (hoặc tải từ
   `BACKUP_REMOTE` nếu local cũng mất: `rclone copy "$BACKUP_REMOTE" backups/ --include 'xboss-*.dump'`).
3. Tạo DB mới (không ghi đè DB cũ nếu còn — đổi tên trước để giữ lại điều tra nguyên nhân):
   ```bash
   psql "$MAINT_URL" -c "ALTER DATABASE xboss RENAME TO xboss_broken_$(date +%s);"
   psql "$MAINT_URL" -c "CREATE DATABASE xboss;"
   pg_restore --no-owner --no-privileges -d "$DATABASE_URL" backups/xboss-<ngày-gần-nhất>.dump
   ```
4. Phục hồi `data/uploads/` nếu cũng mất: `tar xzf backups/xboss-uploads-<ngày>.tar.gz -C /`.
5. Chạy migration để đảm bảo schema khớp code hiện tại (backup có thể cũ hơn vài migration):
   `npm run db:migrate`.
6. Khởi động lại app: `pm2 start xboss` (hoặc `pm2 reload xboss --update-env`).
7. Kiểm tra nhanh qua `/api/health` (status `ok`, `db: true`) + đăng nhập thử + xem 1-2 trang có
   dữ liệu quan trọng (dashboard, `/contracts`).
8. Viết post-mortem theo mẫu trong `docs/ops/incident-response.md` — dữ liệu mất giữa lần backup
   cuối và lúc sự cố (tối đa ~24h theo RPO) cần liệt kê rõ trong mục "Ảnh hưởng".

## Quy trình phục hồi — kịch bản "mất cả VPS"

RTO mục tiêu: ≤ 4 giờ — cần chuẩn bị trước (không phải lúc sự cố mới tìm hiểu):

1. Dựng VPS mới (hoặc máy dự phòng) theo `DEPLOY.md` — cài Node, PostgreSQL, pm2, nginx/certbot.
2. Clone repo từ GitHub (nguồn sự thật của code — VPS cũ mất không mất code).
3. Tải bản dump + tar uploads mới nhất từ `BACKUP_REMOTE`:
   ```bash
   rclone copy "$BACKUP_REMOTE" backups/ --include 'xboss-*'
   ```
4. Tạo DB `xboss` mới, `pg_restore` như kịch bản trên, giải nén uploads vào `data/uploads/`.
5. Tạo lại `.env.local` từ **kho secret riêng** (không lưu trong Git) — xem mục xoay secret bên dưới.
6. `npm ci && npm run db:migrate && npm run build && pm2 start ...` (theo `DEPLOY.md`).
7. Trỏ DNS domain production sang IP mới (hoặc cập nhật load balancer/reverse proxy).
8. Kiểm tra `/api/health` + đăng nhập + post-mortem như trên.

## Xoay secret sau sự cố mất VPS

Nếu VPS bị xâm nhập (không chỉ hỏng phần cứng) — coi mọi secret trên máy đó là **lộ**, phải xoay hết
trước khi đưa VPS mới lên production:

- `XBOSS_SECRET` — đổi giá trị mới → **mọi session hiện tại bị vô hiệu** (chấp nhận được, user đăng
  nhập lại).
- `DATABASE_URL` mật khẩu Postgres — đổi mật khẩu user DB.
- `CRON_SECRET` — đổi, cập nhật lại nơi gọi cron ngoài (nếu có).
- `SMTP_PASS`, `TELEGRAM_BOT_TOKEN`, `VAPID_PRIVATE_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`,
  `SENTRY_AUTH_TOKEN` — thu hồi/tạo lại key tại nơi cấp (Gmail App Password, BotFather `/revoke`,
  Google Cloud Console, Sentry Settings).
- Rà soát tài khoản user trong DB phục hồi — nếu nghi có tài khoản bị tạo trái phép trong lúc bị
  xâm nhập, khoá/xoá trước khi mở lại truy cập.

## Vị trí backup

- **Local**: `backups/` trong thư mục project trên VPS (ngoài `.gitignore` — không commit vào Git).
- **Remote**: đích cấu hình qua `BACKUP_REMOTE` (Google Drive/S3-compatible tuỳ chọn của admin lúc
  triển khai — xem mục cấu hình `rclone` ở trên).

## Giới hạn đã biết

- Chưa có PITR (point-in-time recovery qua WAL archiving) — RPO thực tế = khoảng cách giữa 2 lần
  backup (mục tiêu hằng đêm = tối đa ~24h dữ liệu mất, đúng SLA đã đặt). Nếu cần RPO chặt hơn sau
  này, cân nhắc bật `wal_archive`/`pg_basebackup` liên tục — ngoài phạm vi M44.
- `restore-check.sh` kiểm tra schema restore được + có dữ liệu, **không** kiểm tra business logic
  đúng đắn (ví dụ tổng tiến độ tính đúng) — coi là smoke test tối thiểu, không thay thế test tích hợp.
