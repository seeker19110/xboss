# XBoss — Hệ thống quản lý thi công MEP/ACMV

Web app quản lý tiến độ thi công MEP/ACMV cho dự án **TT AVIO Tháp A**, thay thế bộ file Excel tracking bằng giao diện realtime, đa người dùng, mobile-friendly, hoạt động được khi mạng yếu (PWA offline).

> 📄 Đặc tả kỹ thuật đầy đủ tại [`spec.md`](./spec.md) · Mục tiêu/phạm vi tại [`PROJECT.md`](./PROJECT.md) · ERD tại [`docs/ERD.md`](./docs/ERD.md) · Hướng dẫn triển khai tại [`DEPLOY.md`](./DEPLOY.md)

---

## Yêu cầu hệ thống

- Node.js **22** (xem `.nvmrc`)
- PostgreSQL tự host (khuyến nghị — `DEPLOY.md`). Dùng `DATABASE_URL` chỉ cần là chuỗi kết nối Postgres hợp lệ nên Supabase Postgres cũng chạy được cho `DATABASE_URL`, nhưng dự án **không dùng SDK/RLS/Auth của Supabase** (`docs/adr/0001-postgres-raw-sql.md`).

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

Schema quản lý qua **hệ migrate SQL nhẹ** (`migrations/*.sql`, xem `docs/adr/0003-migrations.md`): app tự áp migration còn thiếu khi khởi động, hoặc chủ động `npm run db:migrate`. Đổi schema = thêm file `migrations/000N_*.sql` mới (append-only).

### Tài khoản mặc định (dev)

Khi DB chưa có user, môi trường **dev** tự tạo 4 tài khoản demo:

| Email               | Mật khẩu   | Vai trò  |
| ------------------- | ---------- | -------- |
| `admin@xboss.vn`    | `admin123` | Admin    |
| `pm@xboss.vn`       | `pm123`    | PM       |
| `engineer@xboss.vn` | `eng123`   | Kỹ sư    |
| `subcon@xboss.vn`   | `sub123`   | Thầu phụ |

Ngoài 4 vai trò thao tác trên, hệ thống có thêm 3 vai trò chỉ-xem: `bch`, `cdt`, `viewer` (xem `spec.md` §4).

> ⚠️ **Production**: nếu DB trống, hệ thống chỉ tạo **1 admin** với mật khẩu lấy từ `XBOSS_ADMIN_PASSWORD` (không seed 4 tài khoản demo). Bắt buộc đặt `XBOSS_SECRET` để ký cookie phiên.

---

## Biến môi trường

| Biến                                                       | Bắt buộc        | Mô tả                                                                              |
| ---------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`                                             | ✅ khi chạy app | Chuỗi kết nối Postgres                                                             |
| `XBOSS_SECRET`                                             | ✅ production   | Ký cookie phiên (HMAC); thiếu → throw lúc ký/xác minh token                        |
| `XBOSS_ADMIN_PASSWORD`                                     | production      | Mật khẩu admin khởi tạo khi DB trống                                               |
| `CRON_SECRET`                                              | tuỳ chọn        | Bảo vệ endpoint cron, nhận qua header `Authorization: Bearer`                      |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`                  | tuỳ chọn        | Gửi báo cáo trễ hạn qua Telegram (song song email SMTP)                            |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | tuỳ chọn        | Web Push; sinh bằng `npx web-push generate-vapid-keys`. Thiếu → nút bật push tự ẩn |
| SMTP (`SMTP_HOST`...)                                      | tuỳ chọn        | Gửi email báo cáo hằng ngày / tuần                                                 |
| `SENTRY_DSN`                                               | tuỳ chọn        | Theo dõi lỗi production (server + browser)                                        |
| `TEST_DATABASE_URL`                                        | tuỳ chọn        | Postgres test riêng cho test tích hợp (không có thì test tự skip)                  |

Danh mục đầy đủ (kể cả biến của các module mở rộng như Google Sheet sync) → `spec.md` §8.

---

## Tính năng chính

Đã mở rộng từ lưới tracking MEP/ACMV gốc thành hệ thống quản lý dự án xây dựng toàn chuỗi (BOQ, chi phí, hợp đồng/VO/IPC, đấu thầu, mua sắm & vật tư, QA&QC + gate nghiệm thu, nhật ký/mặt bằng/thiết bị, bản vẽ & thay đổi thiết kế, HSE, nhân sự, môi trường & quan trắc, bảo hiểm, bàn giao & bảo hành, chuyển đổi số, tài chính & kế toán, đa dự án), cộng các đặc điểm giữ nguyên từ đầu: đồng bộ realtime đa người dùng (SSE), PWA offline queue, tìm kiếm toàn cục, Web Push, S-curve/baseline, export Excel/PDF, báo cáo ngày/tuần qua email + Telegram.

**Danh mục module + màn hình đầy đủ, RBAC 7 vai trò, logic nghiệp vụ trung tâm** → xem [`spec.md`](./spec.md). Mục tiêu/phạm vi ở mức sản phẩm → [`PROJECT.md`](./PROJECT.md).

---

## Cấu trúc thư mục (rút gọn)

```
xboss/
├── app/            # Next.js App Router — mọi page 'use client', fetch từ /api/*
│   ├── tracking/[sheet]/   # Lưới tracking động + checkbox (lõi gốc)
│   ├── components/         # AppHeader, NotificationBell, GlobalSearch, SCurveChart...
│   └── api/                 # ~107 nhóm route REST (đều force-dynamic + check auth)
├── lib/            # Logic nghiệp vụ dùng chung: db/, auth.ts, roles.ts, recompute.ts,
│                   # status.ts, boq.ts, sheets.ts, + 1 file/module mở rộng (cost.ts, qaqc.ts...)
├── migrations/     # Hệ migrate SQL nhẹ, đánh số append-only (ADR-0003)
├── tests/          # node:test qua tsx (tests/setup.ts import đầu tiên)
├── e2e/            # Playwright e2e (axe a11y, desktop + mobile)
├── scripts/        # seed + backfill + migrate
├── docs/           # ERD, ADR, đặc tả từng module (nang-cap/M<xx>-*.md)
└── spec.md / PROJECT.md / CLAUDE.md   # Đặc tả kỹ thuật / mục tiêu / hướng dẫn agent
```

---

## Scripts

| Command                               | Mô tả                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                         | Chạy dev server (cần `.env.local`)                       |
| `npm run build`                       | Build production (pool kết nối lazy — không cần DB thật) |
| `npm run lint`                        | `next lint`                                              |
| `npm run typecheck`                   | `tsc --noEmit`                                           |
| `npm test`                            | `node:test` qua `tsx` — toàn bộ `tests/*.test.ts`         |
| `npx tsx --test tests/status.test.ts` | Chạy 1 file test                                         |
| `npm run db:seed`                     | Seed từ Excel AVIO trong `attachments/`                  |
| `npm run db:migrate`                  | Áp migration còn thiếu (chủ động, ngoài lúc boot)         |

Test tích hợp (`recompute.test.ts` và nhiều file khác) chỉ chạy khi đặt `TEST_DATABASE_URL`; không có thì tự skip. CI (`.github/workflows/ci.yml`) chạy `npm audit` → lint → typecheck → test (Postgres 16 service) → build trên mỗi push/PR.

---

## Mô hình dữ liệu (lõi tracking)

`projects → towers → sheet_types → work_packages → tasks → progress_dimensions`

Trạng thái (`status`) là slug: `chuan_bi`, `dang_thi_cong`, `hoan_thanh`, `tre`, `nghiem_thu`. Một task **trễ** khi `end_date < hôm nay` **và** `progress < 100%` **và** chưa `hoan_thanh`/`nghiem_thu`; `nghiem_thu` không bao giờ bị hạ cấp tự động. % tiến độ: task = số ô đã tick / tổng ô; work package = trung bình các task con. Cột `DATE` giữ nguyên **chuỗi** `'YYYY-MM-DD'` (so sánh bằng string). Chi tiết đầy đủ (BOQ, chi phí, hợp đồng...) → `docs/ERD.md`.

---

## Tech Stack

Next.js 16.2 (App Router, React 19.2) · TypeScript strict · Tailwind 4.3 (dark-first) · PostgreSQL qua `pg` (raw SQL, hệ migrate nhẹ) · Recharts · `@tanstack/react-table` · ExcelJS/SheetJS · `@react-pdf/renderer` · Lucide · Web Push · PWA · Sentry (tuỳ chọn). Chi tiết đầy đủ → `spec.md` §9.
