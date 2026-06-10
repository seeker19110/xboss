# Triển khai XBoss lên VPS/Server (production)

Ứng dụng dùng **SQLite (node:sqlite)** — dữ liệu nằm trong 1 file, không cần DB server riêng.
Yêu cầu: **Node.js ≥ 22.5** (khuyến nghị **Node 24** để khỏi cần cờ thử nghiệm).

---

## Cách A — Docker (khuyến nghị)

Đơn giản, cố định Node 24, DB lưu trên volume bền (không mất khi rebuild).

```bash
# 1. Tải mã nguồn lên server (git clone hoặc scp), rồi vào thư mục
cd xboss

# 2. Mở docker-compose.yml, ĐỔI XBOSS_SECRET thành chuỗi ngẫu nhiên dài
#    (ví dụ tạo bằng: openssl rand -hex 32)

# 3. Build + chạy nền
docker compose up -d --build

# 4. Xem log (lần đầu sẽ tự seed dữ liệu từ Excel)
docker compose logs -f
```

Truy cập: `http://<IP-server>:3000`

Cập nhật phiên bản mới: `git pull` rồi `docker compose up -d --build` (DB giữ nguyên trong volume `xboss-data`).

---

## Cách B — Không Docker (Node + pm2)

```bash
# Cài Node 24 (qua nvm hoặc nodesource), rồi:
cd xboss
npm install
npm run build
npm run db:seed                 # nạp dữ liệu lần đầu

# Chạy nền bằng pm2
npm install -g pm2
XBOSS_SECRET="chuoi-bi-mat-dai" pm2 start npm --name xboss -- start
pm2 save && pm2 startup         # tự khởi động lại khi reboot
```

Mặc định lắng nghe cổng 3000. Đổi cổng: `PORT=8080 pm2 start ...`.
Cho phép truy cập từ máy khác trong LAN: mở cổng tường lửa, dùng IP server.

> Node 22.x: thêm `NODE_OPTIONS=--experimental-sqlite` trước lệnh chạy. Node 24+: không cần.

---

## HTTPS / tên miền (tùy chọn)

Đặt sau Nginx/Caddy reverse proxy. Ví dụ Nginx:

```nginx
server {
  server_name xboss.example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

Rồi dùng `certbot --nginx` để cấp SSL miễn phí.

---

## ✅ Checklist trước khi chạy thật

- [ ] Đổi `XBOSS_SECRET` thành chuỗi ngẫu nhiên dài (bảo mật cookie đăng nhập).
- [ ] Đổi mật khẩu 4 tài khoản demo (admin/pm/engineer/subcon) — xem mục dưới.
- [ ] Sao lưu định kỳ file DB (volume `xboss-data` hoặc `xboss.db`).
- [ ] Đảm bảo Node ≥ 22.5 trên server.

### Đổi mật khẩu / thêm người dùng

Tạm thời tài khoản được seed tự động lần đầu. Để đổi mật khẩu hoặc thêm user thật,
có thể thêm một trang quản lý người dùng (chưa làm) — báo nếu bạn cần, sẽ bổ sung.

---

## Sao lưu & phục hồi DB

```bash
# Docker
docker compose cp xboss:/app/data/xboss.db ./backup-$(date +%F).db

# Không Docker
cp xboss.db backup-$(date +%F).db
```
