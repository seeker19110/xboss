# XBoss — Hệ thống quản lý thi công MEP/ACMV

Web app quản lý tiến độ thi công MEP/ACMV cho dự án **TT AVIO Tháp A**, thay thế bộ file Excel tracking bằng giao diện realtime, đa người dùng, mobile-friendly, hoạt động được khi mạng yếu (PWA offline).

> 📄 Đặc tả kỹ thuật đầy đủ tại [`spec.md`](./spec.md) · ERD tại [`docs/ERD.md`](./docs/ERD.md) · Hướng dẫn triển khai tại [`DEPLOY.md`](./DEPLOY.md)

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
# Tối thiểu: DATABASE_URL (Postgres/Supabase) + XBOSS_SECRET

# 4. (Tuỳ chọn) Seed data từ file Excel AVIO gốc (đặt trong attachments/)
npm run db:seed

# 5. Khởi động dev server
npm run dev
```

Mở trình duyệt: [http://localhost:3000](http://localhost:3000)

Schema **tự khởi tạo** khi app chạy query đầu tiên (`CREATE TABLE IF NOT EXISTS`, idempotent) — không có bước migrate riêng. Đổi schema bảng đã tồn tại phải tự `ALTER` hoặc viết script backfill trong `scripts/`.

### Tài khoản mặc định (dev)

Khi DB chưa có user, môi trường **dev** tự tạo 4 tài khoản demo:

| Email | Mật khẩu | Vai trò |
|---|---|---|
| `admin@xboss.vn` | `admin123` | Admin |
| `pm@xboss.vn` | `pm123` | PM |
| `engineer@xboss.vn` | `eng123` | Kỹ sư |
| `subcon@xboss.vn` | `sub123` | Thầu phụ |

> ⚠️ **Production**: nếu DB trống, hệ thống chỉ tạo **1 admin** với mật khẩu lấy từ `XBOSS_ADMIN_PASSWORD` (không seed 4 tài khoản demo). Bắt buộc đặt `XBOSS_SECRET` để ký cookie phiên.

---

## Biến môi trường

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `DATABASE_URL` | ✅ khi chạy app | Chuỗi kết nối Postgres |
| `XBOSS_SECRET` | ✅ production | Ký cookie phiên (HMAC); thiếu → throw lúc ký/xác minh token |
| `XBOSS_ADMIN_PASSWORD` | production | Mật khẩu admin khởi tạo khi DB trống |
| `CRON_SECRET` | tuỳ chọn | Bảo vệ endpoint cron, nhận qua header `Authorization: Bearer` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | tuỳ chọn | Gửi báo cáo trễ hạn qua Telegram (song song email SMTP) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | tuỳ chọn | Web Push; sinh bằng `npx web-push generate-vapid-keys`. Thiếu → nút bật push tự ẩn |
| SMTP (`SMTP_HOST`...) | tuỳ chọn | Gửi email báo cáo hằng ngày / tuần |
| `TEST_DATABASE_URL` | tuỳ chọn | Postgres test riêng cho test tích hợp (không có thì test tự skip) |

---

## Tính năng chính

### Tracking & tính toán tiến độ
- **Sheet động**: trang tracking không hardcode — tạo/đổi tên/xoá sheet qua UI (Admin/PM), slug lưu ở `sheet_types.slug`. 5 sheet gốc: OGTĐ, OGHL, OGCH, ODNN Zone 1/2.
- **Lưới checkbox**: drill-down nhóm → task → ô tiến độ theo kích thước ống / căn hộ; tick ô → tự tính lại % task → % nhóm → ghi `task_history`.
- **Đồng bộ realtime đa người dùng**: SSE (`/api/events`) đẩy event khi sheet đổi; lỗi/serverless cắt → tự fallback poll `/api/tasks/version`. Mất mạng: tick được xếp hàng trong localStorage và tự gửi lại khi online.
- **BOQCODE**: mã duy nhất **toàn hệ thống** trên tasks/work_packages/materials — chặn nhập trùng, chỉ rõ mã đang bị ai dùng.
- **Sửa hàng loạt** (Admin/PM): sửa ngày BĐ/KT qua modal; chọn nhiều task → gán người / đặt ngày hàng loạt.

### Dashboard & báo cáo
- **Dashboard**: KPI per sheet, **SPI** (chỉ số tiến độ), heatmap tầng × hệ (bấm ô mở thẳng sheet tại tầng), **dự báo ngày hoàn thành** từng hệ, cảnh báo task đình trệ, panel **Pareto nguyên nhân trễ**.
- **S-curve** (`/api/dashboard/scurve`): đường kế hoạch nội suy + đường thực tế tái dựng từ `task_history`; nhận `?baseline=<id>` để so với kế hoạch đã chốt.
- **Baseline kế hoạch**: chốt snapshot ngày + % toàn bộ task để đo độ lệch khi PM dời ngày.
- **Gantt** (`/gantt`): timeline nhóm theo ngày, màu theo trạng thái, % phủ trong thanh, vạch hôm nay; **phụ thuộc giữa nhóm việc + đường găng CPM** + vẽ mũi tên phụ thuộc + cảnh báo "bị chặn".
- **Lookahead** (`/lookahead`): kế hoạch in 7/14/21 ngày — task sắp bắt đầu + đến hạn, nhóm theo hệ.
- **Export Excel**: tab KPI + việc trễ + 1 tab tracking đầy đủ mỗi sheet; báo cáo in PDF (`/report`).
- **Báo cáo hằng ngày / hằng tuần**: email + Telegram, gọi qua cron (`CRON_SECRET`); Vercel Cron có sẵn trong `vercel.json`, VPS dùng crontab.

### Nghiệm thu & tài liệu
- **Nghiệm thu 2 bước**: `nghiem_thu` chỉ đặt/huỷ qua `/api/tasks/:id/approve` (Admin/PM, task 100%, ghi audit). Duyệt theo lô tại `/approvals` + upload **biên bản nghiệm thu** (PDF/ảnh).
- **Ảnh hiện trường** & **link bản vẽ/BBNT** gắn cho từng task/nhóm.

### Cộng tác & thông báo
- **Bình luận** trên từng task (kèm notification cho người liên quan).
- **Thông báo** 🔔: tự đồng bộ 4 loại — `delayed`, `due_soon`, `comment`, `material_over`.
- **Web Push** (per thiết bị) + **tìm kiếm toàn cục** (mã/BOQCODE/tên, nhảy tới sheet + filter tầng).
- **Nguyên nhân trễ**: danh mục 6 lý do, gán theo task; hiển thị Pareto trên dashboard.

### Quản lý & phân quyền
- **Vật tư** (`/materials`): định mức / đã dùng theo hệ, vòng đời đặt hàng → về kho → đã dùng; mọi thay đổi `qty_used` ghi `material_transactions`; cảnh báo vượt định mức.
- **RBAC**: 4 vai trò `admin | pm | engineer | subcon` (map `CAN`); subcon chỉ thao tác task được gán. Quản lý user tại `/users`; tự đổi mật khẩu tại `/password`.
- **PWA**: cài lên màn hình chính, cache offline qua service worker; `/my-tasks` lọc theo người được giao.

---

## Cấu trúc thư mục

```
xboss/
├── app/
│   ├── page.tsx              # Dashboard (trang chủ)
│   ├── login/ password/      # Đăng nhập / đổi mật khẩu
│   ├── tracking/[sheet]/     # Lưới tracking động + checkbox
│   ├── gantt/ lookahead/     # Gantt CPM + kế hoạch ngắn hạn
│   ├── approvals/ materials/ # Nghiệm thu theo lô + vật tư
│   ├── report/ my-tasks/     # Báo cáo in PDF + task của tôi
│   ├── users/                # Quản lý người dùng (Admin)
│   ├── components/           # AppHeader, NotificationBell, GlobalSearch, SCurveChart, FloorHeatmap...
│   └── api/                  # REST API routes (đều force-dynamic + check auth)
│       ├── auth/ dashboard/ tasks/ workpackages/ dimensions/
│       ├── sheets/ baselines/ approvals/ notifications/ push/
│       ├── events/ search/ lookahead/ materials/
│       ├── import/excel/ export/excel/ project/
│       └── cron/             # daily-report / weekly-report
├── lib/
│   ├── db/index.ts           # PostgreSQL (pg Pool) + schema tự khởi tạo
│   ├── auth.ts  ratelimit.ts # Session cookie (HMAC) + RBAC + rate limit
│   ├── import.ts             # Parse Excel (dùng chung API + seed)
│   ├── recompute.ts          # Tính lại % task/package + derive status
│   ├── status.ts  delay.ts   # Chuẩn hóa trạng thái + danh mục lý do trễ
│   ├── boq.ts  sheets.ts     # BOQCODE duy nhất + map slug sheet
│   └── push.ts  photos.ts    # Web Push + lưu ảnh hiện trường
├── tests/                    # node:test qua tsx (setup.ts import đầu tiên)
├── scripts/                  # seed + backfill (boq, dims) + migrate
├── attachments/              # File Excel nguồn
└── spec.md / docs/ERD.md     # Đặc tả + ERD
```

---

## Scripts

| Command | Mô tả |
|---|---|
| `npm run dev` | Chạy dev server (cần `.env.local`) |
| `npm run build` | Build production (pool kết nối lazy — không cần DB thật) |
| `npm run lint` | `next lint` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (status / recompute / import) |
| `npx tsx --test tests/status.test.ts` | Chạy 1 file test |
| `npm run db:seed` | Seed từ Excel AVIO trong `attachments/` |

Test tích hợp (`recompute.test.ts`) chỉ chạy khi đặt `TEST_DATABASE_URL`; không có thì tự skip. CI (`.github/workflows/ci.yml`) chạy `npm audit` → lint → typecheck → test (Postgres 16 service) → build trên mỗi push/PR.

---

## Mô hình dữ liệu

`projects → towers → sheet_types → work_packages → tasks → progress_dimensions`

Trạng thái (`status`) là slug: `chuan_bi`, `dang_thi_cong`, `hoan_thanh`, `tre`, `nghiem_thu`. Chuỗi tiếng Việt từ Excel được map tự động trong `lib/status.ts`.

Quy tắc: cột `DATE` giữ nguyên **chuỗi** `'YYYY-MM-DD'` (so sánh ngày bằng so sánh chuỗi). Một task **trễ** khi `end_date < hôm nay` **và** `progress < 100%` **và** chưa `hoan_thanh`/`nghiem_thu`. `nghiem_thu` không bao giờ bị hạ cấp tự động.

% tiến độ: task = số ô đã tick / tổng ô; work package = trung bình các task con.

---

## Tech Stack

Next.js 14 (App Router) · TypeScript strict · Tailwind v4 (dark-first) · PostgreSQL · node-postgres (`pg`) · Recharts · SheetJS · Lucide · Web Push · PWA
