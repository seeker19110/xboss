# Metabase self-host — BI/khám phá dữ liệu qua schema `bi`

> Cụ thể hóa **PR2** của [`docs/nang-cap/M55-bi-metabase.md`](../nang-cap/M55-bi-metabase.md).
> Vận hành thuần túy, KHÔNG code app — mọi luật che dữ liệu (masking tiền M50 PR2, scope dự án
> M22) đã nằm sẵn trong 18 view schema `bi` (migration `migrations/0073_bi_schema.sql`, PR1).
> Metabase **không bao giờ** kết nối vào schema `public` của Postgres XBoss — chỉ vào `bi`, qua
> role Postgres chỉ-đọc `xboss_bi`.
>
> Liên kết: [`DEPLOY.md`](../../DEPLOY.md) (setup production gốc),
> [`docs/ops/staging.md`](./staging.md) (môi trường tập dượt),
> [`docs/ops/backup.md`](./backup.md) (backup DB XBoss — **khác** backup DB nội bộ Metabase, xem
> mục backup bên dưới).

## Phạm vi & đối tượng dùng (nhắc lại từ đặc tả)

- Đợt 1: chỉ **Admin/PM** (nhóm `PAYMENT_VIEW_ROLES` trừ `bch`). Tài khoản Metabase tạo **tay**
  cho từng người, chưa có SSO (nợ: SSO qua M49 khi làm embedding — không thuộc phạm vi PR2).
- Không nhúng dashboard Metabase vào app XBoss ở đợt này.
- Danh sách 18 view Metabase nhìn thấy: `bi.tasks`, `bi.task_history_daily`, `bi.delays`,
  `bi.contracts_fin`, `bi.variations_fin`, `bi.payment_certs_fin`, `bi.cost_by_month_fin`,
  `bi.cash_fin`, `bi.materials`, `bi.purchase_orders`, `bi.material_transactions`, `bi.ncrs`,
  `bi.inspections`, `bi.hse_records`, `bi.diaries`, `bi.projects`, `bi.systems`, `bi.users_dim`
  (nhóm hậu tố `_fin` là view tài chính — chứa cột tiền; các view còn lại không lộ tiền).

## 0. Kiểm tra VPS đủ RAM trước khi cài

Metabase chạy trên JVM, khuyến nghị tối thiểu **~2GB RAM rảnh** (ngoài phần app XBoss +
Postgres đang chạy). Kiểm tra trước khi thêm container:

```bash
free -h
```

Nhìn cột `available` của dòng `Mem:` — cần còn trống ≥ 2GB sau khi trừ các service đang chạy.
Nếu VPS hiện tại không đủ (ví dụ VPS 2-4GB đang chạy sát app + Postgres XBoss):

- **Phương án 1 (khuyến nghị nếu chỉ cần dùng thử/tập dượt trên staging)**: nâng cấp gói VPS
  thêm RAM trước khi cài Metabase production — đừng ép chạy khi thiếu RAM, JVM bị OOM-kill sẽ
  làm Metabase crash lặp lại, khó chẩn đoán.
- **Phương án 2**: dựng Metabase trên **một VPS/máy riêng** thay vì chung VPS với app XBoss —
  chỉ cần mở port Postgres XBoss (5432, qua firewall giới hạn IP nguồn) cho máy Metabase kết nối
  tới bằng role `xboss_bi`. Cách này còn giúp cô lập tải truy vấn BI khỏi ảnh hưởng app production.
- Có thể giới hạn heap JVM Metabase qua biến `JAVA_OPTS="-Xmx1g"` để chạy tạm trong RAM hẹp hơn
  (chấp nhận đánh đổi hiệu năng câu hỏi phức tạp/nhiều người dùng đồng thời) — chỉ dùng tạm, không
  khuyến nghị cho production dài hạn.

## 1. Tạo role Postgres `xboss_bi` (chạy TAY, **BƯỚC BẮT BUỘC LÀM TRƯỚC** migration `0073`)

> ⚠️ **Điểm lưu ý quan trọng — thứ tự bắt buộc.** Migration `0073_bi_schema.sql` (đã áp ở PR1)
> tạo schema `bi` + 18 view rồi mới `GRANT` quyền `SELECT` cho role `xboss_bi`. Câu `GRANT` được
> bọc trong khối `DO ... EXCEPTION WHEN undefined_object` để migration không vỡ khi role chưa tồn
> tại (đúng cho CI/dev sạch) — nghĩa là **nếu role `xboss_bi` chưa được tạo trước khi migration
> `0073` chạy lần đầu, các câu GRANT bị bỏ qua âm thầm** (chỉ in `RAISE NOTICE`, không lỗi).
> Vì `schema_migrations` đã ghi nhận `0073` đã áp, chạy lại `npm run db:migrate` **không** tự áp
> lại GRANT. Nếu rơi vào tình huống này (đã lỡ migrate trước khi tạo role), phải `GRANT` thủ
> công — xem lệnh ở cuối mục này.

Kết nối vào Postgres XBoss bằng user quản trị (superuser hoặc owner database `xboss`), ví dụ
qua `psql "$DATABASE_URL"` hoặc `docker compose exec db psql -U xboss xboss`:

```sql
-- Sinh mật khẩu ngẫu nhiên mạnh trước (vd: openssl rand -base64 24), KHÔNG lưu trong Git/.env
-- (đây là mật khẩu Postgres role riêng cho BI, không phải biến môi trường app XBoss).
CREATE ROLE xboss_bi LOGIN PASSWORD '<mật-khẩu-ngẫu-nhiên-dài>' NOBYPASSRLS;
```

**Chạy lệnh này TRƯỚC bước 2 (chạy migration `0073` lần đầu)** nếu đang setup mới hoàn toàn.

### Nếu migration `0073` đã lỡ chạy trước khi tạo role (GRANT bị bỏ qua)

Sau khi `CREATE ROLE` như trên, chạy tay 3 câu `GRANT` sau (giống hệt nội dung trong migration):

```sql
GRANT USAGE ON SCHEMA bi TO xboss_bi;
GRANT SELECT ON ALL TABLES IN SCHEMA bi TO xboss_bi;
ALTER DEFAULT PRIVILEGES IN SCHEMA bi GRANT SELECT ON TABLES TO xboss_bi;
```

Kiểm tra đã cấp đúng quyền:

```sql
-- Phải liệt kê đủ 18 view bi.* mà xboss_bi có quyền SELECT
SELECT table_name FROM information_schema.role_table_grants
 WHERE grantee = 'xboss_bi' AND table_schema = 'bi';

-- Phải bị từ chối (permission denied) — xác nhận KHÔNG lộ schema public
SET ROLE xboss_bi;
SELECT * FROM public.tasks LIMIT 1;
RESET ROLE;
```

## 2. Chạy migration `0073` (nếu chưa áp)

Đã áp production/staging ở PR1 (`npm run db:migrate` tự chạy khi app khởi động, hoặc chủ động
`npm run db:migrate`). Nếu đang dựng staging mới từ đầu, đảm bảo đã tạo role `xboss_bi` (bước 1)
**trước** khi chạy lệnh này lần đầu. Migration sẽ được ghi nhận trong bảng `schema_migrations` để
đảm bảo không chạy lại trong lần sau.

## 3. Dựng Metabase qua Docker Compose (DB nội bộ RIÊNG, không dùng chung DB `xboss`)

Metabase cần một Postgres nội bộ để lưu câu hỏi/dashboard/tài khoản người dùng Metabase tự tạo —
**đây là dữ liệu KHÁC HOÀN TOÀN với schema `bi`** (schema `bi` chỉ là nguồn dữ liệu để hỏi, không
lưu gì về "ai đã lưu dashboard nào"). Bắt buộc dùng **database riêng** cho Metabase, không trỏ
vào database `xboss` hay `xboss_staging` — dù có thể dùng chung 1 Postgres instance với XBoss
(khác database) hoặc một Postgres hoàn toàn tách biệt trong compose dưới đây (khuyến nghị đơn
giản nhất cho 1 VPS, cô lập rõ ràng).

Tạo thư mục riêng, ví dụ `~/xboss-metabase/docker-compose.yml`:

```yaml
services:
  metabase-db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: metabase
      POSTGRES_USER: metabase
      POSTGRES_PASSWORD: "<đổi-mật-khẩu-ngẫu-nhiên>" # KHÔNG dùng chung với DB xboss
    volumes:
      - metabase-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U metabase"]
      interval: 10s
      timeout: 5s
      retries: 5

  metabase:
    image: metabase/metabase:latest
    restart: unless-stopped
    depends_on:
      metabase-db:
        condition: service_healthy
    ports:
      - "127.0.0.1:3002:3000" # chỉ bind localhost — Nginx sẽ proxy vào, không lộ ra ngoài trực tiếp
    environment:
      MB_DB_TYPE: postgres
      MB_DB_DBNAME: metabase
      MB_DB_PORT: 5432
      MB_DB_USER: metabase
      MB_DB_PASS: "<khớp-POSTGRES_PASSWORD-ở-trên>"
      MB_DB_HOST: metabase-db
      # Tuỳ chọn giới hạn heap JVM nếu RAM hẹp (xem mục 0):
      # JAVA_OPTS: "-Xmx1g"

volumes:
  metabase-pgdata:
```

Chạy nền:

```bash
cd ~/xboss-metabase
docker compose up -d
docker compose logs -f metabase   # đợi tới khi log báo "Metabase Initialization COMPLETE"
```

Cổng `3002` chỉ bind `127.0.0.1` — không truy cập trực tiếp được từ ngoài, phải qua Nginx (mục
5). Đổi số cổng nếu `3002` đã bị chiếm trên VPS.

## 4. Kết nối Metabase tới Postgres XBoss qua role `xboss_bi`

1. Mở `http://127.0.0.1:3002` (hoặc SSH tunnel nếu chưa dựng Nginx) trên trình duyệt — lần đầu
   Metabase dẫn qua wizard tạo tài khoản Admin Metabase đầu tiên.
2. Ở bước "Add your data" (hoặc sau này: **Admin settings → Databases → Add database**):
   - **Database type**: PostgreSQL
   - **Host**: địa chỉ Postgres XBoss (IP VPS hoặc `host.docker.internal` nếu Metabase chạy
     Docker cùng máy Postgres XBoss chạy trên host — tuỳ cách XBoss deploy, xem `DEPLOY.md`; nếu
     XBoss Postgres cũng chạy trong Docker compose riêng, dùng IP/hostname service đó hoặc IP
     LAN của VPS).
   - **Port**: 5432 (mặc định)
   - **Database name**: `xboss` (hoặc `xboss_staging` nếu đang dựng để tập dượt)
   - **Username**: `xboss_bi`
   - **Password**: mật khẩu đã tạo ở bước 1
   - **Schemas**: nếu Metabase hỏi giới hạn schema, chọn/nhập `bi` (role đã không có quyền gì
     trên `public` nên dù không giới hạn ở UI, Metabase cũng không đọc được gì ngoài `bi` —
     nhưng khai rõ `bi` giúp danh sách bảng trong Metabase gọn hơn).
3. Bấm **Save** → Metabase tự sync danh sách bảng (thực chất là 18 view) trong schema `bi`.
4. Xác nhận: vào **Admin settings → Databases → (tên đã đặt) → xem bảng** — phải thấy đúng 18
   view liệt kê ở đầu tài liệu này, không thấy bảng nào khác của schema `public`.

## 5. Đặt Metabase sau Nginx tại subdomain riêng (dùng lại pattern HTTPS của `DEPLOY.md`)

Theo đúng cách `DEPLOY.md` mục "HTTPS (tuỳ chọn)" đã làm cho domain chính (Nginx reverse proxy +
`certbot --nginx`), áp dụng cho subdomain BI, ví dụ `bi.xboss.example.com`:

```nginx
server {
    listen 80;
    server_name bi.xboss.example.com;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Trỏ DNS bản ghi A của bi.xboss.example.com về IP VPS trước, rồi:
sudo certbot --nginx -d bi.xboss.example.com
```

Sau khi HTTPS chạy ổn định, thêm HSTS như `DEPLOY.md` đã khuyến nghị cho domain chính (chỉ thêm
khi chắc chắn subdomain BI phục vụ HTTPS lâu dài):

```
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

## 6. Tạo tài khoản Admin/PM trong Metabase (tay, đợt 1 chưa SSO)

- Người tạo tài khoản Metabase đầu tiên (bước 4.1) trở thành Admin Metabase.
- Vào **Admin settings → People → Invite someone** để tạo tài khoản cho từng Admin/PM XBoss cần
  dùng — Metabase tự gửi email mời (cần cấu hình SMTP Metabase riêng ở **Admin settings → Email**
  nếu muốn dùng tính năng mời qua email; nếu không cấu hình, tạo tài khoản kèm mật khẩu tạm rồi
  gửi tay).
- Ghi nợ: SSO qua OIDC (dùng lại IdP đã cấu hình cho XBoss ở M49) chỉ làm khi triển khai embedding
  dashboard vào app — ngoài phạm vi PR2 này.

## 7. Backup database nội bộ Metabase (KHÔNG thể phục hồi từ schema `bi`)

**Quan trọng**: mọi câu hỏi/dashboard/collection người dùng tạo trong Metabase nằm ở
`metabase-db` (bước 3), **hoàn toàn tách biệt** với DB `xboss` và schema `bi`. Nếu mất
`metabase-db` mà không có backup, toàn bộ dashboard/câu hỏi đã xây dựng **mất vĩnh viễn** — schema
`bi` chỉ là nguồn dữ liệu thô, không lưu lại những gì người dùng đã dựng trên đó.

Backup định kỳ tương tự cách `docs/ops/backup.md` làm cho DB XBoss, nhưng là một job **riêng**
nhắm vào `metabase-db`:

```bash
# Chạy trên VPS, trong thư mục ~/xboss-metabase
docker compose exec metabase-db pg_dump -U metabase -Fc metabase \
  > ~/xboss-metabase/backups/metabase-$(date +%F).dump
```

Crontab mẫu (hằng đêm, lệch giờ với backup XBoss chính để tránh cùng lúc):

```cron
0 3 * * * cd ~/xboss-metabase && mkdir -p backups && \
  docker compose exec -T metabase-db pg_dump -U metabase -Fc metabase \
  > backups/metabase-$(date +\%F).dump 2>> logs/metabase-backup.log
```

Khuyến nghị đẩy bản backup này ra ngoài VPS cùng cơ chế `rclone`/`BACKUP_REMOTE` đã dùng cho DB
XBoss (xem `docs/ops/backup.md` mục "Cấu hình rclone") — cùng nguyên tắc RPO/RTO, chỉ khác là
job/đích lưu tách riêng khỏi backup XBoss chính.

Phục hồi khi cần:

```bash
docker compose exec -T metabase-db pg_restore --no-owner --no-privileges \
  -U metabase -d metabase < backups/metabase-<ngày>.dump
docker compose restart metabase
```

## 8. Cập nhật phiên bản Metabase

Metabase image `latest` tự cập nhật theo tag khi `docker compose pull`. Quy trình an toàn:

```bash
cd ~/xboss-metabase

# 1. Backup metabase-db trước khi update (mục 7) — bắt buộc, update có thể chạy migration
#    schema nội bộ của Metabase, không rollback được nếu lỗi giữa chừng.
docker compose exec metabase-db pg_dump -U metabase -Fc metabase \
  > backups/metabase-pre-update-$(date +%F).dump

# 2. Kéo image mới + khởi động lại
docker compose pull metabase
docker compose up -d metabase

# 3. Theo dõi log tới khi báo "Metabase Initialization COMPLETE", kiểm tra đăng nhập +
#    vài dashboard/câu hỏi cũ vẫn chạy đúng.
docker compose logs -f metabase
```

Nếu muốn cố định phiên bản (tránh update ngoài ý muốn khi `docker compose pull` chạy nhầm), đổi
`image: metabase/metabase:latest` thành tag cụ thể (ví dụ `metabase/metabase:v0.50.x`) và tự tay
nâng tag khi quyết định update.

## Tiêu chí xác nhận đã dựng đúng (checklist)

- [ ] `free -h` xác nhận đủ RAM trước khi cài (mục 0).
- [ ] Role `xboss_bi` được tạo **trước** khi migration `0073` chạy lần đầu trên môi trường đang
      dựng (mục 1) — hoặc đã GRANT tay nếu lỡ thứ tự.
- [ ] `metabase-db` là Postgres riêng, không trùng database `xboss`/`xboss_staging` (mục 3).
- [ ] Metabase kết nối XBoss bằng `xboss_bi`, thấy đúng 18 view `bi.*`, không thấy bảng nào của
      schema `public` (mục 4).
- [ ] Truy cập được qua `https://bi.<domain>` với chứng chỉ hợp lệ (mục 5).
- [ ] Admin/PM có tài khoản Metabase riêng, đăng nhập được (mục 6).
- [ ] Đã có cron backup `metabase-db` hoạt động, đã thử phục hồi 1 lần để xác nhận dump dùng
      được (mục 7).
- [ ] Thử 1 câu hỏi pivot tiến độ theo hệ × tháng trong Metabase (dựa `bi.tasks` +
      `bi.task_history_daily`), đối chiếu số ra khớp với dashboard app XBoss (`/dashboard`).
