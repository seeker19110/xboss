# Triển khai XBoss lên VPS/Server (production)

Ứng dụng dùng **PostgreSQL** — cấu hình qua biến môi trường `DATABASE_URL`
(Supabase free tier hoặc Postgres tự host đều được). Schema tự khởi tạo khi app chạy lần đầu.

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

## Cách B — Không Docker (Node ≥ 20 + pm2 + Supabase)

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
