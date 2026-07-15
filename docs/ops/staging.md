# Staging — môi trường tập dượt migration/deploy

> Cụ thể hóa "quy trình migration an toàn" của M44 PR4. Liên kết:
> [`DEPLOY.md`](../../DEPLOY.md) (setup production gốc), [`docs/ops/backup.md`](./backup.md)
> (RPO/RTO, kịch bản phục hồi), [`docs/ops/incident-response.md`](./incident-response.md).

## Mục tiêu

Staging tồn tại để **tập dượt trước khi đụng dữ liệu thật** — chạy migration đụng dữ liệu
(UPDATE/backfill/đổi kiểu cột), thử `deploy.sh` phiên bản mới, kiểm tra tính năng lớn trước khi
lên production. **Không phải** môi trường demo cho khách hàng, không cần HA/scale — 1 process
pm2 thứ hai + 1 DB Postgres riêng, đủ dùng cho quy mô hiện tại của XBoss (1 VPS).

## Kiến trúc

Staging chạy **cùng VPS** với production, cách ly bằng:

|                   | Production                       | Staging                                                                                                              |
| ----------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Thư mục           | `~/xboss` (hoặc thư mục hiện có) | `~/xboss-staging` (checkout Git riêng — khuyến nghị mạnh, xem lý do bên dưới)                                        |
| Database          | `xboss`                          | `xboss_staging`                                                                                                      |
| Cổng              | 3000 (mặc định)                  | 3001 (hoặc cổng trống khác)                                                                                          |
| pm2 process       | `xboss`                          | `xboss-staging`                                                                                                      |
| File env          | `.env.local`                     | `.env.local` (nội dung khác — trỏ DB/cổng/secret staging), có thể giữ bản gốc tên `.env.staging` để backup/đối chiếu |
| Domain (tuỳ chọn) | `xboss.example.com`              | `staging.xboss.example.com` (reverse proxy nginx trỏ cổng 3001)                                                      |

**Vì sao khuyến nghị thư mục checkout Git RIÊNG** (không dùng chung 1 thư mục với 2 pm2
process): `deploy.sh` chạy `git reset --hard` + `git clean -fd` — nếu 2 lần deploy (staging và
production) chạy trên CÙNG thư mục gần nhau, một lần `git reset --hard` có thể xoá code đang
build dở của lần kia, hoặc build tạm `.next-build`/`.next-build-staging` tuy đã đặt tên khác
nhau (xem `deploy.sh`) nhưng vẫn chia sẻ `node_modules`/`package-lock.json` → `npm ci` của
staging có thể chạy giữa lúc production đang phục vụ request cần `node_modules` ổn định. 2
thư mục Git riêng loại bỏ hoàn toàn rủi ro này, với chi phí là ổ đĩa gấp đôi (chấp nhận được ở
quy mô VPS hiện tại).

## Setup lần đầu (thao tác tay trên VPS)

```bash
# 1. Clone repo riêng cho staging (khác thư mục với production)
cd ~
git clone https://github.com/<org>/xboss.git xboss-staging
cd xboss-staging

# 2. Tạo DB staging riêng (Postgres đã cài sẵn cho production)
sudo -u postgres createdb xboss_staging

# 3. Tạo file env staging — sao chép .env.local production làm nền, ĐỔI các giá trị sau:
cp ~/xboss/.env.local .env.staging
#    - DATABASE_URL: trỏ sang xboss_staging (không phải DB production!)
#    - PORT: 3001 (hoặc cổng trống khác — set qua biến môi trường lúc pm2 start, xem bước 5)
#    - XBOSS_SECRET: giá trị KHÁC production (session staging không lẫn với production)
#    - CRON_SECRET: giá trị KHÁC production (tránh gọi nhầm cron production/staging cho nhau)
#    - SMTP_*/TELEGRAM_*/APP_URL: trỏ kênh thông báo riêng (hoặc để trống để im lặng — tránh
#      spam nhóm Telegram/email thật production bằng dữ liệu test)
#    - SENTRY_DSN: dùng project Sentry riêng (hoặc để trống) — không lẫn lỗi staging vào
#      dashboard theo dõi lỗi production

# 4. Cài đặt + build lần đầu (deploy.sh --staging làm việc này cho các lần sau)
npm ci
npm run db:migrate   # DATABASE_URL đọc từ .env.staging cần được nạp — export thủ công lần đầu:
                      # export $(grep DATABASE_URL .env.staging | xargs) && npm run db:migrate
npm run build

# 5. Khởi động pm2 process riêng cho staging (khác tên + khác cổng)
PORT=3001 pm2 start npm --name xboss-staging -- start
pm2 save
```

## Deploy các lần sau

```bash
cd ~/xboss-staging
bash deploy.sh --staging
```

`deploy.sh --staging` (xem code + comment chi tiết trong file) khác `deploy.sh` mặc định ở 3
điểm: tên pm2 process (`xboss-staging`), tên thư mục build tạm (`.next-build-staging`/
`.next-old-staging` — không đụng bản của production dù lỡ chạy chung thư mục), và copy
`.env.staging` → `.env.local` trước khi build (Next.js chỉ tự đọc `.env.local`, không có khái
niệm tên file `.env.staging` sẵn có).

## Quy ước bắt buộc: migration đụng dữ liệu phải qua staging trước

Xem `CLAUDE.md` mục "Quy trình & Definition of Done" (nguồn sự thật của quy ước). Tóm tắt:

- **Migration chỉ `CREATE TABLE`/`ADD COLUMN`/`CREATE INDEX`** (thêm thuần tuý, không đụng dòng
  dữ liệu hiện có) → đi thẳng production, không bắt buộc qua staging (rủi ro thấp, rollback dễ
  — schema thêm mới không phá dữ liệu cũ).
- **Migration đụng dữ liệu** (`UPDATE`, backfill bằng `INSERT ... SELECT`, đổi kiểu cột
  `ALTER COLUMN ... TYPE`, `DROP COLUMN`, đổi CHECK constraint có thể vi phạm dữ liệu cũ) →
  **bắt buộc** chạy `bash deploy.sh --staging` trước, kiểm tra dữ liệu staging sau migrate đúng
  kỳ vọng, rồi mới chạy lên production.

Kiểm tra trước khi áp thật (cả 2 môi trường): `npm run db:migrate -- --dry-run` in danh sách
migration SẼ áp mà không chạy gì — dùng xác nhận đúng file trước khi deploy thật.

## Giới hạn đã biết

- Không tự động đồng bộ dữ liệu production → staging định kỳ (thao tác tay nếu cần dữ liệu
  thật để test: `pg_dump xboss | psql xboss_staging` — cân nhắc ẩn danh hoá dữ liệu nhạy cảm
  trước khi copy, đặc biệt cột lương/tài chính, xem `lib/roles.ts` các bảng liên quan).
  Mặc định staging chạy schema trống + seed mẫu (`npm run db:seed:sample`) là đủ cho hầu hết
  việc tập dượt migration/deploy.
- Chưa dựng CI riêng chạy staging tự động — deploy staging vẫn là thao tác tay của admin.
