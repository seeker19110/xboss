# XBoss — Hệ thống quản lý thi công MEP

Web app quản lý tiến độ thi công ACMV cho dự án **TT AVIO Tháp A**, thay thế bộ file Excel tracking bằng giao diện realtime, đa người dùng, mobile-friendly.

> 📄 Xem đặc tả kỹ thuật đầy đủ tại [`spec.md`](./spec.md) · Hướng dẫn triển khai tại [`DEPLOY.md`](./DEPLOY.md)

---

## Yêu cầu hệ thống

- Node.js **20+**
- PostgreSQL — tài khoản [Supabase](https://supabase.com) (free tier) hoặc Postgres tự host

---

## Cài đặt & Chạy local

```bash
# 1. Clone repo
git clone https://github.com/seeker19110/xboss.git
cd xboss

# 2. Cài dependencies
npm install

# 3. Tạo file môi trường
cp .env.example .env.local
# Điền DATABASE_URL (Postgres/Supabase) + XBOSS_SECRET

# 4. (Tuỳ chọn) Seed data từ file Excel AVIO (đặt trong attachments/)
npm run db:seed

# 5. Khởi động dev server
npm run dev
```

Mở trình duyệt: [http://localhost:3000](http://localhost:3000)

Schema tự khởi tạo khi app chạy lần đầu — không cần bước migrate riêng.

### Tài khoản mặc định

Khi DB chưa có user, hệ thống tự tạo 4 tài khoản demo:

| Email | Mật khẩu | Vai trò |
|---|---|---|
| `admin@xboss.vn` | `admin123` | Admin |
| `pm@xboss.vn` | `pm123` | PM |
| `engineer@xboss.vn` | `eng123` | Kỹ sư |
| `subcon@xboss.vn` | `sub123` | Thầu phụ |

> ⚠️ Đổi mật khẩu (hoặc xoá user demo) trước khi đưa lên production. Đặt `XBOSS_SECRET` để ký cookie phiên.

---

## Tính năng chính

- **BOQCODE**: mỗi hàng (nhóm + task) có mã BOQ **duy nhất toàn hệ thống**, hiển thị ở cột đầu lưới tracking, Admin/PM sửa được — hệ thống chặn nhập trùng và chỉ rõ mã đang bị hàng nào dùng
- **Dashboard**: KPI cards per sheet, **heatmap tiến độ tầng × hệ** (bấm ô mở thẳng sheet tại tầng đó), **dự báo ngày hoàn thành** từng hệ (ngoại suy tốc độ 14 ngày), bar chart, bảng công việc trễ (lọc theo sheet / tầng / trạng thái)
- **Gantt** (`/gantt`): timeline các nhóm theo ngày bắt đầu/kết thúc, màu theo trạng thái, % hoàn thành phủ trong thanh, vạch hôm nay, mốc tháng
- **Tracking sheet** (`/tracking/ogtd|oghl|ogch|odnn1|odnn2`): drill-down nhóm → task → lưới checkbox theo kích thước ống / căn hộ, tự tính lại % khi toggle; **tự đồng bộ khi người khác cập nhật** (poll 10s + toast)
- **Thông báo trễ hạn** 🔔: chuông trên header, tự phát hiện task quá deadline
- **Lịch sử tiến độ**: mọi thay đổi % được ghi `task_history` (ai, lúc nào) — xem timeline qua nút 🕐 trên từng task
- **Import Excel 2 bước**: upload → xem trước (số nhóm/task/cảnh báo từng sheet, chưa ghi DB) → xác nhận import
- **Export**: Excel (KPI + danh sách trễ) và báo cáo in PDF (`/report`)
- **Quản lý người dùng** (`/users`, Admin): thêm/xoá user, đổi vai trò, đặt lại mật khẩu; mọi người tự đổi mật khẩu tại `/password`
- **Giao task** (Admin/PM): gán task cho người làm ngay trên lưới tracking; thầu phụ chỉ thấy và chỉ được cập nhật task của mình, thông báo trễ cũng lọc theo
- **Quản lý vật tư** (`/materials`): định mức / đã dùng theo hệ, trạng thái đặt hàng → về kho → đã dùng, cảnh báo vượt định mức
- **Link bản vẽ / BBNT**: gắn link bản vẽ nghiệm thu cho từng nhóm và task (icon 🔗 trong lưới); import tự đọc cột Link từ Excel
- **PWA**: cài được lên màn hình chính điện thoại (Add to Home Screen), asset cache offline qua service worker
- **Email báo cáo hằng ngày** 8:00 sáng: tổng hợp KPI + việc mới trễ gửi Admin/PM (cấu hình SMTP trong `.env`; Vercel Cron có sẵn trong `vercel.json`, VPS dùng crontab gọi `/api/cron/daily-report` với `CRON_SECRET`)
- **RBAC**: Admin/PM được import/export/sửa cấu trúc; Kỹ sư/Thầu phụ cập nhật tiến độ

---

## Cấu trúc thư mục

```
xboss/
├── app/
│   ├── page.tsx              # Dashboard (trang chủ)
│   ├── login/page.tsx        # Đăng nhập
│   ├── import/page.tsx       # Upload & import Excel
│   ├── report/page.tsx       # Báo cáo in PDF
│   ├── tracking/[sheet]/     # Bảng tracking + lưới checkbox
│   ├── components/           # UI components (NotificationBell...)
│   └── api/                  # REST API routes
│       ├── auth/             # login / logout / me
│       ├── dashboard/        # KPI + danh sách trễ
│       ├── tasks/            # CRUD + progress + history + dimensions
│       ├── workpackages/     # Nhóm công việc + lưới dimensions
│       ├── dimensions/       # Toggle checkbox, đổi tên cột
│       ├── notifications/    # Thông báo trễ hạn
│       ├── import/excel/     # POST import file .xlsx
│       └── export/excel/     # GET xuất Excel
├── lib/
│   ├── db/index.ts           # PostgreSQL (pg Pool) + schema tự khởi tạo
│   ├── auth.ts               # Session cookie (HMAC) + RBAC
│   ├── import.ts             # Parse Excel (dùng chung API + seed)
│   ├── recompute.ts          # Tính lại % task/package + derive status
│   ├── status.ts             # Chuẩn hóa trạng thái + % tiến độ
│   └── sheets.ts             # Map slug URL ↔ mã sheet
├── tests/                    # Unit tests (node:test)
├── scripts/
│   ├── seed.ts               # Seed từ Excel
│   ├── seed-sample.ts        # Seed dữ liệu mẫu
│   └── migrate-sqlite-to-pg.ts  # Di trú dữ liệu từ bản SQLite cũ
├── attachments/              # File Excel nguồn
└── spec.md                   # Đặc tả kỹ thuật
```

---

## Scripts

| Command | Mô tả |
|---|---|
| `npm run dev` | Chạy dev server |
| `npm run build` | Build production |
| `npm test` | Chạy unit tests (logic status / recompute / import) |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run db:seed` | Seed data từ Excel AVIO |
| `npm run db:seed:sample` | Seed data mẫu |
| `npx tsx scripts/migrate-sqlite-to-pg.ts` | Di trú dữ liệu từ file `xboss.db` (bản cũ) sang Postgres |

Test tích hợp DB chỉ chạy khi đặt `TEST_DATABASE_URL` (trỏ tới Postgres test riêng); không có thì tự skip để không đụng DB thật.

---

## Mô hình dữ liệu

`projects → towers → sheet_types → work_packages → tasks → progress_dimensions`

Trạng thái (`status`) chuẩn hóa dạng slug: `chuan_bi`, `dang_thi_cong`, `hoan_thanh`, `nghiem_thu`, `tre`. Chuỗi tiếng Việt từ Excel ("Chuẩn bị", "Đang thi công"...) được map tự động trong `lib/status.ts`.

Một task bị coi là **trễ** khi: `end_date < hôm nay` **và** `progress < 100%` **và** chưa `hoan_thanh`/`nghiem_thu`.

% tiến độ tự tính: task = số ô đã lắp / tổng ô; work package = trung bình các task con.

---

## Tech Stack

Next.js 14 · TypeScript · Tailwind v4 · PostgreSQL (Supabase) · node-postgres (`pg`) · Recharts · SheetJS · Lucide
