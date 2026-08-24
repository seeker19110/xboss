# Triển khai XBoss lên VPS/Server (production)

Ứng dụng dùng **PostgreSQL** — cấu hình qua biến môi trường `DATABASE_URL`
(Supabase free tier hoặc Postgres tự host đều được). Schema áp qua hệ migrate SQL
(`migrations/*.sql`, xem `docs/adr/0003-migrations.md`): app **tự áp migration chưa chạy khi
khởi động lần đầu**, hoặc chủ động chạy `npm run db:migrate` trước khi start. Đổi schema về sau
= thêm file `migrations/000N_*.sql` mới (append-only).

---

## Cài đặt lần đầu (Node ≥ 24 + PM2 + Postgres tự host hoặc Supabase)

> **XBoss chạy bằng PM2, không dùng Docker.** Trước đây tài liệu này có song song hai đường
> (Docker Compose và PM2); nay chỉ còn PM2 — bớt một bộ artefact phải bảo trì và bớt một lớp
> trừu tượng nằm giữa lỗi production với người phải sửa. Mọi tiến trình khai trong
> [`ecosystem.config.js`](./ecosystem.config.js).

### 1. Postgres

Nếu Postgres chạy trên chính VPS này (không dùng Supabase):

```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER xboss WITH PASSWORD 'mật-khẩu-mạnh';"
sudo -u postgres psql -c "CREATE DATABASE xboss OWNER xboss;"
```

Để Postgres chỉ nghe `localhost` (không sửa `listen_addresses` ra `*`) — app và DB cùng máy
nên không cần mở cổng 5432 ra ngoài, bớt một bề mặt tấn công.

> Postgres tự host trên cùng VPS **không có backup tự động** như Supabase — bắt buộc thiết lập
> `pg_dump` định kỳ trước khi đưa vào production, xem [Sao lưu & phục hồi DB](#sao-lưu--phục-hồi-db)
> và [`docs/ops/backup.md`](./docs/ops/backup.md). Mất VPS đồng nghĩa mất cả app lẫn DB cùng lúc.

### 2. App

```bash
cd xboss
npm ci

# Tạo file môi trường
cp .env.example .env.local       # điền DATABASE_URL + XBOSS_SECRET
# DATABASE_URL=postgresql://xboss:mật-khẩu-mạnh@localhost:5432/xboss  (nếu tự host Postgres)

npm run build
npm run db:seed                  # nạp dữ liệu lần đầu từ Excel trong attachments/

# Chạy nền bằng PM2
npm install -g pm2
pm2 start ecosystem.config.js --only xboss
pm2 save && pm2 startup          # tự khởi động lại khi reboot
```

Truy cập: `http://<IP-server>:3000`. Đổi cổng bằng biến `PORT` trong `.env.local`.

### 3. MEPF worker (tuỳ chọn — chỉ khi dùng tác vụ AI kỹ thuật)

Daemon Python poll hàng đợi `engineering_async_tasks`. VPS không cần tính năng này thì bỏ qua
hẳn phần dưới (app chạy độc lập, chỉ các tác vụ AI nằm chờ trong hàng đợi).

```bash
sudo apt install -y python3 python3-pip
pip3 install -r scripts/mepf/requirements-worker.txt
pip3 install ./mepf-worker           # MEPF-Agents + ezdxf, LangGraph…

pm2 start ecosystem.config.js --only mepf-worker
pm2 save
```

Khai `ANTHROPIC_API_KEY` hoặc `OPENAI_API_KEY` trong `.env.local` để worker gọi agent thật;
thiếu cả hai thì worker tự chạy dry-run (trả kết quả giả lập, không gọi LLM).

> `scripts/mepf/worker_entry.py` đọc thẳng `os.environ["DATABASE_URL"]` và **thoát ngay nếu
> thiếu** — `ecosystem.config.js` tự nạp biến từ `.env.local`/`.env` rồi truyền vào, nên đừng
> khởi động worker bằng `pm2 start scripts/mepf/worker_entry.py` trực tiếp (sẽ thiếu biến, và
> thiếu cả `PYTHONPATH` khiến worker âm thầm rơi về dry-run).

### Chuyển từ bản cài Docker hoặc PM2 kiểu cũ sang `ecosystem.config.js`

VPS đang chạy Docker Compose:

```bash
docker compose down                       # dừng container (volume dữ liệu vẫn còn)
# Dump dữ liệu ra rồi nạp vào Postgres cài thẳng trên máy, xem mục Sao lưu & phục hồi DB
```

VPS đang chạy PM2 kiểu cũ (`pm2 start npm --name xboss -- start`) — process cũ gọi qua `npm`,
cần khai lại một lần để PM2 quản đúng tiến trình Node thật:

```bash
pm2 delete xboss
pm2 start ecosystem.config.js --only xboss
pm2 save
```

Các lần cập nhật sau không cần lặp lại — `deploy.sh` chỉ `pm2 reload` theo tên process.

### Script một lệnh cho các lần cập nhật sau: `deploy.sh`

Sau lần setup đầu ở trên (đã có pm2 app tên `xboss`), các lần cập nhật sau chỉ cần:

```bash
cd xboss
bash deploy.sh
```

Script tự làm: `git fetch` + `reset --hard origin/main` (VPS luôn chạy nhánh
`main`) → `npm ci` → `npm run db:migrate` (áp migration DB còn thiếu, dừng
deploy nếu lỗi) → build vào thư mục tạm `.next-build` (không đụng `.next`
đang được app chạy thật đọc) → swap atomic `.next-build` vào `.next` → `pm2
reload xboss --update-env` → **health-check** `GET /api/health` (retry tối đa
5 lần, cách nhau 3 giây). Build vào thư mục tạm rồi swap thay vì ghi đè
thẳng lên `.next` đang chạy giúp tránh 2 rủi ro: client đã tải HTML cũ xin lại
chunk JS/CSS đúng lúc file đó vừa bị ghi đè giữa chừng (ChunkLoadError thoáng
qua), và build lỗi giữa chừng làm `.next` bị bỏ dở không rollback được (giờ
`.next` đang chạy chỉ bị thay khi build mới đã hoàn tất chắc chắn). Nếu
health-check vẫn thất bại sau 5 lần thử, script **tự rollback** về bản build
trước (`.next-old`) và `pm2 reload` lại rồi thoát với mã lỗi — bản cũ đang
chạy chỉ bị dọn (`rm -rf .next-old`) khi health-check pass.

> ⚠️ `reset --hard` sẽ **xoá mọi sửa đổi cục bộ** trên VPS để khớp đúng
> `origin/main` — đừng sửa file trực tiếp trên server, hãy đổi cấu hình qua
> biến môi trường hoặc file `.env.local`.

### Vận hành: backup, health check, staging

- **Backup + kiểm chứng phục hồi**: `scripts/ops/backup.sh`/`scripts/ops/restore-check.sh` +
  quy trình phục hồi từng bước — xem [`docs/ops/backup.md`](./docs/ops/backup.md).
- **Health check** cho uptime monitor: `GET /api/health`.
- **Staging** (tập dượt migration/deploy đụng dữ liệu trước khi lên production, `deploy.sh
--staging`): xem [`docs/ops/staging.md`](./docs/ops/staging.md).

### Cron trên VPS (không dùng `vercel.json`)

Khi chạy hẳn trên VPS (không Vercel), **tất cả** cron đều gọi qua crontab hệ thống (không có
cơ chế cron nội bộ nào khác) — kể cả báo cáo ngày/tuần trước đây chỉ khai trong `vercel.json`:

```
0 8 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/daily-report
0 8 * * 1   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/weekly-report
```

Các cron còn lại (`sync-sheets`, `retention`, `deliver-webhooks`, `health-check`) xem lịch cụ
thể ở mục [Đồng bộ hai chiều bảng vật tư ↔ Google Sheet](#đồng-bộ-hai-chiều-bảng-vật-tư--google-sheet-tuỳ-chọn)
bên dưới — không còn giới hạn "tối đa 1 lần/ngày" như Vercel Hobby nên có thể chạy đúng tần suất
khai trong tài liệu (hàng giờ/5 phút/...).

---

## Di trú từ bản SQLite cũ

Nếu trước đây chạy bản SQLite (file `xboss.db`), chuyển toàn bộ dữ liệu sang Postgres:

```bash
# DATABASE_URL trong .env.local trỏ tới Postgres đích (cần Node ≥ 22.5 để đọc SQLite)
npx tsx scripts/migrate-sqlite-to-pg.ts
```

Script giữ nguyên ID, tự chỉnh sequence và đối chiếu số dòng từng bảng sau khi copy.

---

## HTTPS (tuỳ chọn)

Đặt Nginx/Caddy làm reverse proxy trước cổng 3000, rồi dùng `certbot --nginx` cấp SSL miễn phí.

Sau khi HTTPS chạy ổn định, thêm HSTS vào block `server` cổng 443 của Nginx để chặn
downgrade về HTTP (certbot không tự thêm header này):

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

> Lưu ý: chỉ thêm khi chắc chắn toàn bộ domain (kể cả subdomain nếu dùng
> `includeSubDomains`) phục vụ HTTPS lâu dài; không dùng `preload` — ghi danh vào
> danh sách preload của trình duyệt gần như không rút lại được.

---

## Biến môi trường pool DB & ngưỡng cảnh báo (tuỳ chọn, M53)

Không đặt gì thì hành vi giữ nguyên như trước (pool 10 connection, timeout 30s). Chỉ chỉnh khi
cần scale lên nhiều instance/traffic cao:

| Biến                       | Mô tả                                                                                                                                                                             | Mặc định |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `XBOSS_PG_POOL_MAX`        | Số connection tối đa trong pool Postgres của mỗi instance app (clamp 1–100).                                                                                                      | `10`     |
| `XBOSS_PG_STMT_TIMEOUT_MS` | Thời gian tối đa (ms) cho 1 câu query trước khi Postgres huỷ (clamp 1.000–300.000). Riêng phiên chạy migration (`npm run db:migrate` / tự động lúc boot) không bị áp timeout này. | `30000`  |
| `XBOSS_SLOW_QUERY_MS`      | Ngưỡng (ms) coi 1 query là "chậm" để ghi log cảnh báo.                                                                                                                            | `500`    |

---

## Chạy nhiều instance (cluster, tuỳ chọn — M53 PR4)

Mặc định XBoss chạy 1 instance (đủ cho quy mô hiện tại). Khi cần scale ngang trên cùng máy
(nhiều CPU) hoặc chuẩn bị cho nhiều máy:

```bash
pm2 start npm -i 2 --name xboss -- start
```

**Điều kiện tiên quyết:**

- **Hạ `XBOSS_PG_POOL_MAX` mỗi process** — Postgres có giới hạn `max_connections` chung
  (mặc định 100); N instance × pool 10 connection/instance dễ vượt ngưỡng. Đặt sao cho
  `N × XBOSS_PG_POOL_MAX < max_connections` của Postgres, chừa chỗ cho kết nối khác
  (migration, psql thủ công). Ví dụ 4 instance trên Postgres `max_connections=100`: đặt
  `XBOSS_PG_POOL_MAX=15` (4×15=60, còn dư).
- **Hoặc dựng PgBouncer** ở chế độ **transaction pooling** phía trước — `lib/db/index.ts`
  (`withTransaction`) dùng `SET LOCAL` để set GUC `app.project_id`/ngữ cảnh audit, chỉ có
  hiệu lực trong 1 transaction nên **tương thích transaction-pooling mode** của PgBouncer
  (KHÔNG dùng session-pooling nếu có code nào set GUC ngoài transaction — hiện tại không có).
- **Cron chỉ gọi từ ngoài 1 lần** (1 dòng crontab/1 Vercel Cron job trỏ 1 URL) — bộ cân bằng
  tải sẽ đưa request cron tới đúng 1 instance mỗi lần gọi, không tự nhân đôi. Các endpoint
  `sync-sheets`/`sync-integrations` đã có khoá `sync_locks`; `deliver-webhooks` dùng
  `SELECT ... FOR UPDATE SKIP LOCKED`; `daily-report`/`weekly-report` đã thêm khoá ngắn hạn
  (M53 PR4, `lib/ha-tang/sync-locks.ts`) chống gửi email/Telegram trùng nếu 2 request chạm gần như
  đồng thời; `refresh-views` tự an toàn vì Postgres chặn `REFRESH CONCURRENTLY` trùng view.

**Giới hạn đã biết khi chạy nhiều instance (chấp nhận ở quy mô hiện tại, xem `PROGRESS.md`
mục Nợ kỹ thuật nếu cần nâng cấp):**

- Trang **Traffic monitor** (`/admin/traffic`, SSE) chỉ thấy traffic của đúng instance bạn
  đang kết nối — không gộp traffic toàn cluster.
- **Danh mục mềm** (`/admin/code-lists`) và **cờ tính năng theo dự án** (`/admin/feature-flags`):
  đổi ở 1 instance lan sang instance khác **chậm nhất 60 giây** (cache TTL), không tức thời.
- Đếm **SSE stream đang mở** trong `GET /api/health` (M53 PR1) là số của riêng instance đó,
  không phải tổng toàn cluster.

---

## ✅ Checklist trước khi chạy thật

- [ ] Đổi `XBOSS_SECRET` thành chuỗi ngẫu nhiên dài (bảo mật cookie đăng nhập).
- [ ] Đổi mật khẩu 4 tài khoản demo (admin/pm/engineer/subcon).
- [ ] Đổi mật khẩu role Postgres `xboss` khỏi giá trị mẫu nếu tự host DB.
- [ ] Sao lưu định kỳ DB (Supabase tự backup; Postgres tự host: `pg_dump`).

### Tài khoản mặc định

Khi DB chưa có user nào, hệ thống tự tạo: `admin@xboss.vn/admin123`, `pm@xboss.vn/pm123`,
`engineer@xboss.vn/eng123`, `subcon@xboss.vn/sub123`.
**Đổi mật khẩu hoặc xoá user demo ngay sau lần đăng nhập đầu trên production.**

---

## Sao lưu & phục hồi DB

```bash
# Postgres tự host trên VPS
pg_dump "$DATABASE_URL" > backup-$(date +%F).sql

# Supabase: Dashboard → Database → Backups (tự động hằng ngày trên free tier)
```

Sao lưu định kỳ + kiểm chứng phục hồi đã có script sẵn: `scripts/ops/backup.sh` và
`scripts/ops/restore-check.sh`, xem [`docs/ops/backup.md`](./docs/ops/backup.md).

---

## Đồng bộ hai chiều bảng vật tư ↔ Google Sheet (tuỳ chọn)

Cho phép xem/sửa vật tư trên Google Sheet mà vẫn khớp DB. Sửa ở phía nào cũng được
gộp lại; khi cùng một dòng đổi ở **cả hai** phía thì **DB ưu tiên** (xung đột được
liệt kê trong kết quả). Cột `Đã dùng`/`Tồn kho`/`Ngưỡng tối thiểu` chỉ DB→Sheet.

**Thiết lập một lần:**

1. Vào [Google Cloud Console](https://console.cloud.google.com) → tạo project →
   **APIs & Services → Enable APIs** → bật **Google Sheets API**.
2. **IAM & Admin → Service Accounts** → tạo service account → **Keys → Add key →
   JSON** → tải file JSON về.
3. Mở Google Sheet cần đồng bộ → **Share** → cấp quyền **Editor** cho email service
   account (dạng `...@...iam.gserviceaccount.com`).
4. Đặt biến môi trường (xem `.env.example`):
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = nguyên nội dung file JSON (1 dòng).
   - `GOOGLE_SHEET_ID` = đoạn giữa `/d/` và `/edit` trong URL Sheet.
   - `GOOGLE_SHEET_TAB` = tên tab (mặc định `VatTu`).

> Thiếu cấu hình → nút/cron báo lỗi rõ ràng, không ảnh hưởng phần còn lại của app.

**Chạy đồng bộ:**

- **Thủ công:** Admin/PM bấm nút **"Đồng bộ Google Sheet"** trên trang `/materials`.
- **Tự động (cron):** gọi định kỳ — dùng chung `CRON_SECRET`:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/sync-sheets
  ```

  Ví dụ crontab mỗi giờ: `0 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/sync-sheets`
  (hoặc khai báo trong `vercel.json` nếu deploy Vercel).

- **Dọn dữ liệu hết hạn (mỗi ngày, C3 §6):** xoá bản ghi kỹ thuật đã quá hạn theo chính
  sách khai báo trong `lib/ha-tang/retention.ts` — sổ lũy đẳng ingest (`expires_at`, mặc định 30
  ngày) và nhật ký giao webhook đã kết thúc (30 ngày). **Mặc định chỉ CHẠY THỬ**, phải thêm
  `?apply=1` mới xoá thật:

  ```bash
  # xem trước sẽ dọn những gì (không xoá)
  curl -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/retention

  # dọn thật — đặt vào crontab hằng ngày
  curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://<APP_URL>/api/cron/retention?apply=1"
  ```

  Ví dụ crontab 3h sáng: `0 3 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://<APP_URL>/api/cron/retention?apply=1"`

  > **`audit_log` KHÔNG bao giờ bị dọn** — cột `row_hash` là chuỗi băm móc xích, xoá một
  > dòng là đứt xích và `verifyAuditChain` không còn phân biệt được "dọn theo chính sách"
  > với "sửa trộm". Muốn thu gọn phải lưu trữ ra ngoài rồi neo lại xích, cần chủ sở hữu và
  > pháp chế duyệt riêng.
  >
  > Các mục **đụng dữ liệu nghiệp vụ** (source revision, object bị từ chối) đã khai báo sẵn
  > nhưng **để tắt**, chờ chủ sở hữu chốt thời hạn — xem `RETENTION_TARGETS`.

- **Gửi webhook ra ngoài (mỗi 5 phút):** đẩy các sự kiện đang chờ (nghiệm thu task, duyệt
  VO/IPC, vật tư vượt định mức, yêu cầu nghiệm thu) tới hệ ngoài đã cấu hình — dùng chung
  `CRON_SECRET`:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/deliver-webhooks
  ```

  Ví dụ crontab mỗi 5 phút: `*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/deliver-webhooks`
  (hoặc khai báo trong `vercel.json` nếu deploy Vercel).

- **Kiểm tra trạng thái hoạt động (2 lần/ngày):** kiểm tra các tính năng dùng API (kết nối
  Postgres, Telegram Bot API) và không dùng API (cấu hình SMTP/VAPID/Google Sheet, lưu trữ
  `data/uploads`, bảng chống brute-force) — chỉ gửi email + Telegram cho **Admin** khi phát
  hiện lỗi/cảnh báo (chạy sạch thì im lặng, chỉ ghi log). Xem panel "Hệ thống" trên `/tech`
  để kiểm tra thủ công và xem lịch sử. Vượt giới hạn cron hằng ngày của Vercel Hobby (2
  lần/ngày > 1 lần/ngày) nên **không khai trong `vercel.json`** — dùng dịch vụ cron ngoài
  (vd cron-job.org, GitHub Actions `schedule`) hoặc crontab VPS:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/health-check
  ```

  Ví dụ crontab 8h sáng + 20h tối: `0 8,20 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/health-check`

## BI/khám phá dữ liệu qua Metabase (tuỳ chọn, M55)

Metabase self-host đọc dữ liệu qua schema `bi` (view whitelist chỉ-đọc, KHÔNG đọc `public`) qua
role Postgres riêng `xboss_bi`. Mật khẩu role này tạo **tay** lúc deploy bằng `CREATE ROLE xboss_bi
LOGIN PASSWORD '...'` — đây là mật khẩu **Postgres role**, không phải biến môi trường app, nên
**không đưa vào `.env`/`.env.local`/Git**. Hướng dẫn dựng đầy đủ (thứ tự tạo role trước
migration, Nginx/HTTPS, backup, cập nhật phiên bản): xem
[`docs/ops/metabase.md`](./docs/ops/metabase.md).

> Metabase là phần mềm BI của bên thứ ba, dựng **tách rời** XBoss và có cách đóng gói riêng —
> nó không nằm trong phạm vi "XBoss chạy bằng PM2, không dùng Docker" ở đầu tài liệu này.

## Đăng nhập bằng tài khoản công ty — SSO OIDC (tuỳ chọn)

Cho phép đăng nhập bằng Google Workspace / Microsoft Entra (OIDC chuẩn). Thiếu bất kỳ biến
bắt buộc → nút SSO tự ẩn, đăng nhập mật khẩu như cũ (mật khẩu vẫn là đường thoát hiểm khi
IdP hỏng).

1. Tạo OIDC client (Google Cloud Console / Entra App registration), đặt **redirect URI** =
   `https://<APP_URL>/api/auth/oidc/callback` (phải khớp chính xác `APP_URL`).
2. Đặt biến môi trường:

   - `OIDC_ISSUER` — URL issuer (vd `https://accounts.google.com`).
   - `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` — lấy từ IdP.
   - `APP_URL` — URL gốc app (dùng dựng `redirect_uri`, không suy từ request origin).
   - `OIDC_ROLE_CLAIM` _(tuỳ chọn)_ — tên claim chứa vai trò XBoss (`admin/pm/engineer/...`);
     giá trị lạ bị bỏ qua (giữ role cũ / dùng mặc định).
   - `OIDC_DEFAULT_ROLE` _(tuỳ chọn)_ — vai trò cho user SSO mới khi không có claim role hợp
     lệ (mặc định `viewer`).

   User tạo qua SSO không có mật khẩu dùng được (hash ngẫu nhiên) — chỉ vào được qua SSO;
   Admin gán dự án (`/users`) và có thể đặt lại mật khẩu nếu cần fallback.
