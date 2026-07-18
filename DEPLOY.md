# Triển khai XBoss lên VPS/Server (production)

Ứng dụng dùng **PostgreSQL** — cấu hình qua biến môi trường `DATABASE_URL`
(Supabase free tier hoặc Postgres tự host đều được). Schema áp qua hệ migrate SQL
(`migrations/*.sql`, xem `docs/adr/0003-migrations.md`): app **tự áp migration chưa chạy khi
khởi động lần đầu**, hoặc chủ động chạy `npm run db:migrate` trước khi start. Đổi schema về sau
= thêm file `migrations/000N_*.sql` mới (append-only).

---

## Cách A — Docker Compose (khuyến nghị, kèm Postgres)

`docker-compose.yml` đã gồm sẵn service Postgres 17 + volume bền.

```bash
# 1. Tải mã nguồn lên server (git clone hoặc scp), rồi vào thư mục
cd xboss

# 2. Mở docker-compose.yml:
#    - ĐỔI XBOSS_SECRET thành chuỗi ngẫu nhiên dài (openssl rand -hex 32)
#    - ĐỔI POSTGRES_PASSWORD (và cập nhật DATABASE_URL tương ứng)
#    - Nếu dùng Supabase: thay DATABASE_URL bằng chuỗi Supabase, xoá service db

# 3. Build + chạy nền
docker compose up -d --build

# 4. Nạp dữ liệu lần đầu từ file Excel (đặt trong attachments/)
docker compose exec xboss npm run db:seed

# 5. Xem log
docker compose logs -f xboss
```

Truy cập: `http://<IP-server>:3000`

Cập nhật phiên bản mới: `git pull` rồi `docker compose up -d --build` (dữ liệu giữ nguyên trong volume `xboss-pgdata`).

---

## Cách B — Không Docker (Node ≥ 24 + pm2 + Supabase)

```bash
cd xboss
npm install

# Tạo file môi trường
cp .env.example .env.local       # điền DATABASE_URL + XBOSS_SECRET

npm run build
npm run db:seed                  # nạp dữ liệu lần đầu từ Excel

# Chạy nền bằng pm2
npm install -g pm2
pm2 start npm --name xboss -- start
pm2 save && pm2 startup          # tự khởi động lại khi reboot
```

Mặc định lắng nghe cổng 3000. Đổi cổng: `PORT=8080 pm2 start ...`.

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
reload xboss --update-env`. Build vào thư mục tạm rồi swap thay vì ghi đè
thẳng lên `.next` đang chạy giúp tránh 2 rủi ro: client đã tải HTML cũ xin lại
chunk JS/CSS đúng lúc file đó vừa bị ghi đè giữa chừng (ChunkLoadError thoáng
qua), và build lỗi giữa chừng làm `.next` bị bỏ dở không rollback được (giờ
`.next` đang chạy chỉ bị thay khi build mới đã hoàn tất chắc chắn).

> ⚠️ `reset --hard` sẽ **xoá mọi sửa đổi cục bộ** trên VPS để khớp đúng
> `origin/main` — đừng sửa file trực tiếp trên server, hãy đổi cấu hình qua
> biến môi trường hoặc file `.env.local`.

### Vận hành: backup, health check, staging

- **Backup + kiểm chứng phục hồi**: `scripts/ops/backup.sh`/`scripts/ops/restore-check.sh` +
  quy trình phục hồi từng bước — xem [`docs/ops/backup.md`](./docs/ops/backup.md).
- **Health check** cho uptime monitor: `GET /api/health`.
- **Staging** (tập dượt migration/deploy đụng dữ liệu trước khi lên production, `deploy.sh
--staging`): xem [`docs/ops/staging.md`](./docs/ops/staging.md).

---

## Cách C — Vercel + Supabase (không cần server)

1. Push repo lên GitHub.
2. Vercel → New Project → import repo.
3. Environment Variables: thêm `DATABASE_URL` (Supabase) + `XBOSS_SECRET`.
4. Deploy. Seed dữ liệu chạy từ máy local: `npm run db:seed` (trỏ cùng DATABASE_URL).

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

## ✅ Checklist trước khi chạy thật

- [ ] Đổi `XBOSS_SECRET` thành chuỗi ngẫu nhiên dài (bảo mật cookie đăng nhập).
- [ ] Đổi mật khẩu 4 tài khoản demo (admin/pm/engineer/subcon).
- [ ] Đổi `POSTGRES_PASSWORD` nếu dùng Postgres trong compose.
- [ ] Sao lưu định kỳ DB (Supabase tự backup; Postgres tự host: `pg_dump`).

### Tài khoản mặc định

Khi DB chưa có user nào, hệ thống tự tạo: `admin@xboss.vn/admin123`, `pm@xboss.vn/pm123`,
`engineer@xboss.vn/eng123`, `subcon@xboss.vn/sub123`.
**Đổi mật khẩu hoặc xoá user demo ngay sau lần đăng nhập đầu trên production.**

---

## Sao lưu & phục hồi DB

```bash
# Postgres trong Docker compose
docker compose exec db pg_dump -U xboss xboss > backup-$(date +%F).sql

# Supabase: Dashboard → Database → Backups (tự động hằng ngày trên free tier)
```

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

- **Gửi webhook ra ngoài (mỗi 5 phút):** đẩy các sự kiện đang chờ (nghiệm thu task, duyệt
  VO/IPC, vật tư vượt định mức, yêu cầu nghiệm thu) tới hệ ngoài đã cấu hình — dùng chung
  `CRON_SECRET`:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/deliver-webhooks
  ```

  Ví dụ crontab mỗi 5 phút: `*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/deliver-webhooks`
  (hoặc khai báo trong `vercel.json` nếu deploy Vercel).

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
