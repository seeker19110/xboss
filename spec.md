# SPEC.MD — XBoss Web App
## Hệ thống quản lý thi công MEP (ACMV) — Dự án AVIO Tháp A

**Phiên bản:** 2.0 (cập nhật theo trạng thái triển khai thực tế)
**Cập nhật:** 2026-06-13
**Tech Stack:** Next.js 14 App Router · TypeScript · Tailwind 4 · PostgreSQL (tự host hoặc Supabase)

---

## 1. Tổng quan

XBoss thay thế bộ file Excel "GIA THÀNH – TT AVIO Báo Cáo Tracking Tiến Độ Thi Công ACMV.xlsx" bằng web app realtime, đa người dùng, mobile-friendly, hỗ trợ PWA offline.

Hệ thống quản lý:
- Tiến độ thi công MEP/ACMV theo WBS (5 sheet động, tạo thêm được)
- Vật tư: định mức → tồn kho → PR → PO → nhập kho
- Cảnh báo trễ hạn, báo cáo Telegram/email hàng ngày & hàng tuần
- Nghiệm thu 2 bước, baseline S-curve, kế hoạch lookahead 7/14/21 ngày
- Đơn đặt hàng (order form in được)

---

## 2. Phân tích dữ liệu nguồn (Excel)

### 2.1 Cấu trúc file gốc

| Sheet | Mô tả | Work package |
|---|---|---|
| TRACKING OGTĐ | Ống gió trục đứng | ~31 |
| TRACKING OGHL | Ống gió hành lang | ~31 |
| TRACKING OGCH | Ống gió căn hộ | ~29 |
| TRACKING ODNN Zone 1 | Ống đồng nước ngưng Zone 1 | ~29 |
| TRACKING ODNN Zone 2 | Ống đồng nước ngưng Zone 2 | ~29 |

### 2.2 Phân cấp WBS

```
Project (AVIO Tháp A)
└── Tower (Tháp A)
    └── SheetType  [slug động trong DB]
        └── WorkPackage  (A1, H1, OGCH1...)
            └── Task  (A1,01, A1,02...)
                └── ProgressDimension  (kích thước ống / căn hộ)
```

### 2.3 Pattern mã

| Sheet | WorkPackage | Task |
|---|---|---|
| OGTĐ | `A{n}` | `A{n},{mm}` |
| OGHL | `H{n}` | `H{n},{mm}` |
| OGCH | `OGCH{n}` | `OGCH{n},{mm}` |
| ODNN Zone 1 & 2 | `A{n}` (chung) | `A{n},{mm}` |

> ODNN Zone 1 & 2 dùng chung mã `A{n}` — phân biệt bằng `sheet_type_id`.

### 2.4 Trạng thái task (enum slug)

| Slug | Hiển thị |
|---|---|
| `chuan_bi` | Chuẩn bị |
| `dang_thi_cong` | Đang thi công |
| `hoan_thanh` | Đã hoàn thành |
| `tre` | Đang trễ (suy ra tự động) |
| `nghiem_thu` | Đã nghiệm thu (2 bước, chỉ Admin/PM) |

---

## 3. Database Schema

Schema tự khởi tạo khi query đầu tiên (`CREATE TABLE IF NOT EXISTS`) — **không có hệ migrate**. Đổi schema bảng đã tồn tại bằng `ALTER TABLE` trong phần migration nhẹ cuối `lib/db/index.ts`, hoặc viết script backfill trong `scripts/`.

Xem chi tiết bảng, cột, index → **`docs/ERD.md`**.

---

## 4. Auth & Phân quyền

### 4.1 Cơ chế

- Cookie `xboss_session` = `userId.exp.HMAC` (stateless, ký bằng `XBOSS_SECRET`)
- Rate limit in-memory: 5 lần sai/15 phút theo IP+email, 20/IP → 429

### 4.2 RBAC

| Quyền | admin | pm | engineer | subcon |
|---|---|---|---|---|
| Dashboard / xem tracking | ✓ | ✓ | ✓ | ✓ (task được gán) |
| Cập nhật tiến độ | ✓ | ✓ | ✓ | ✓ (task được gán) |
| Import Excel | ✓ | ✓ | — | — |
| Export Excel | ✓ | ✓ | — | — |
| Quản lý cấu trúc (sheet/nhóm) | ✓ | ✓ | — | — |
| Nghiệm thu / duyệt loạt | ✓ | ✓ | — | — |
| Chốt baseline | ✓ | ✓ | — | — |
| Gán người / phân công | ✓ | ✓ | — | — |
| Xóa sheet | ✓ | ✓ | — | — |
| Quản lý users | ✓ | — | — | — |

> **Ranh giới bảo mật duy nhất là API route.** Mọi route handler phải gọi `getCurrentUser()` và trả 401 nếu chưa đăng nhập. Trang client chỉ redirect khi nhận 401.

---

## 5. API Endpoints

### Auth
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/logout` | Đăng xuất |
| GET | `/api/auth/me` | Thông tin user hiện tại |
| PATCH | `/api/auth/password` | Đổi mật khẩu |

### Project / Tower / Sheet
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/project` | Thông tin dự án (public, fallback khi DB trống) |
| GET/POST | `/api/towers` | Danh sách / tạo tháp |
| GET/PATCH/DELETE | `/api/towers/:id` | Chi tiết / sửa / xóa tháp |
| GET/POST | `/api/sheets` | Danh sách / tạo sheet động |
| PATCH/DELETE | `/api/sheets/:id` | Đổi tên, slug, mã / xóa sheet kèm dữ liệu (Admin/PM) |

### Work Packages
| Method | Path | Mô tả |
|---|---|---|
| GET/POST | `/api/workpackages` | Danh sách / tạo |
| GET/PATCH/DELETE | `/api/workpackages/:id` | Chi tiết / sửa / xóa |
| POST | `/api/workpackages/:id/copy` | Nhân bản nhóm |
| POST | `/api/workpackages/:id/move` | Di chuyển thứ tự |
| GET/POST | `/api/workpackages/:id/tasks` | Tasks trong nhóm |
| GET/PATCH | `/api/workpackages/:id/dimensions` | Cột dimension của nhóm |
| GET/POST | `/api/workpackages/:id/dimensions/column` | Thêm cột dimension |
| POST | `/api/workpackages/:id/dimensions/column/move` | Reorder cột |

### Tasks
| Method | Path | Mô tả |
|---|---|---|
| GET/POST | `/api/tasks` | Danh sách / tạo |
| GET/PATCH/DELETE | `/api/tasks/:id` | Chi tiết / sửa / xóa |
| POST | `/api/tasks/:id/copy` | Nhân bản task |
| POST | `/api/tasks/:id/move` | Reorder task |
| PATCH | `/api/tasks/:id/progress` | Cập nhật % tiến độ |
| POST/DELETE | `/api/tasks/:id/approve` | Đặt / huỷ nghiệm thu (Admin/PM, phải đạt 100%) |
| POST | `/api/tasks/:id/delay-reason` | Gán nguyên nhân trễ |
| GET | `/api/tasks/:id/history` | Lịch sử tiến độ |
| GET/POST | `/api/tasks/:id/dimensions` | Dimensions của task |
| GET/POST | `/api/tasks/:id/photos` | Ảnh hiện trường |
| GET/DELETE | `/api/photos/:id` | Xem / xóa ảnh |
| GET/POST | `/api/tasks/:id/comments` | Bình luận |
| DELETE | `/api/comments/:id` | Xóa bình luận |
| GET/POST | `/api/tasks/:id/documents` | Biên bản nghiệm thu |
| GET/DELETE | `/api/documents/:id` | Xem / xóa tài liệu |
| PATCH | `/api/dimensions/:id` | Toggle checkbox dimension |
| POST | `/api/dimensions/rename` | Đổi tên cột dimension |
| GET | `/api/tasks/version` | Watermark phiên bản (SSE fallback) |
| GET | `/api/events` | SSE sync đa người dùng |

### Dashboard & Báo cáo
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/dashboard` | KPI per sheet + danh sách trễ |
| GET | `/api/dashboard/floors` | Tiến độ nhóm theo tầng |
| GET | `/api/dashboard/scurve` | Data S-curve (kế hoạch + thực tế) |
| GET | `/api/dashboard/forecast` | Dự báo hoàn thành |
| GET | `/api/gantt` | Data Gantt chart |
| GET | `/api/lookahead` | Kế hoạch 7/14/21 ngày tới |
| GET | `/api/my-tasks` | Tasks được gán cho user hiện tại |
| GET | `/api/search` | Tìm kiếm toàn cục (tasks + work_packages) |
| GET | `/api/export/excel` | Xuất Excel (tab KPI + trễ + tracking per sheet) |

### Approvals (nghiệm thu loạt)
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/approvals` | Duyệt nghiệm thu nhiều task cùng lúc |

### Baselines
| Method | Path | Mô tả |
|---|---|---|
| GET/POST | `/api/baselines` | Danh sách / chốt baseline |
| GET/DELETE | `/api/baselines/:id` | Chi tiết / xóa baseline |

### Notifications & Push
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/notifications` | Thông báo của user (đồng bộ on-fetch) |
| PATCH | `/api/notifications/:id/read` | Đánh dấu đã đọc |
| POST | `/api/push/subscribe` | Đăng ký Web Push |

### Users & Admin
| Method | Path | Mô tả |
|---|---|---|
| GET/POST | `/api/users` | Danh sách / tạo user (Admin) |
| PATCH/DELETE | `/api/users/:id` | Sửa / xóa user |
| GET | `/api/admin/audit` | Audit log toàn hệ |
| GET/POST | `/api/admin/assignments` | Xem / gán người phụ trách |

### Import
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/import/excel` | Upload + parse + upsert Excel tracking |

### Vật tư
| Method | Path | Mô tả |
|---|---|---|
| GET/POST | `/api/materials` | Danh sách / tạo |
| GET/PATCH/DELETE | `/api/materials/:id` | Chi tiết / sửa / xóa |
| POST | `/api/materials/:id/transactions` | Ghi giao dịch qty |
| POST | `/api/materials/:id/issue` | Xuất kho gắn task |
| POST | `/api/materials/:id/move` | Reorder |
| GET | `/api/materials/columns` | Cột tùy biến |
| GET | `/api/materials/template` | Template import |
| POST | `/api/materials/import` | Import vật tư từ Excel |
| GET | `/api/materials/reports` | Báo cáo vật tư |

### Nhà cung cấp & Đơn hàng
| Method | Path | Mô tả |
|---|---|---|
| GET/POST | `/api/suppliers` | Nhà cung cấp |
| GET/PATCH/DELETE | `/api/suppliers/:id` | Chi tiết nhà cung cấp |
| GET/POST | `/api/purchase-requests` | Yêu cầu mua (PR) |
| GET/PATCH/DELETE | `/api/purchase-requests/:id` | Chi tiết PR |
| GET/POST | `/api/purchase-orders` | Đơn đặt hàng (PO) |
| GET/PATCH/DELETE | `/api/purchase-orders/:id` | Chi tiết PO |
| POST | `/api/purchase-orders/:id/receive` | Nhập kho theo PO |

### Cron
| Method | Path | Xác thực |
|---|---|---|
| POST | `/api/cron/daily-report` | `Authorization: Bearer CRON_SECRET` |
| POST | `/api/cron/weekly-report` | `Authorization: Bearer CRON_SECRET` |

---

## 6. Logic nghiệp vụ quan trọng

### 6.1 Tính % tiến độ

```
progress_percent(task) = COUNT(dimensions WHERE installed > 0) / COUNT(all dimensions)
progress(work_package)  = AVG(task.progress_percent)
```

Hàm trung tâm: `recomputeTask` → `deriveStatus` → `recomputePackage` trong `lib/recompute.ts`.

### 6.2 Quy tắc trạng thái

- `nghiem_thu` không bị hạ cấp tự động — chỉ đặt/huỷ qua `/api/tasks/:id/approve`.
- `tre` được suy ra: `end_date < hôm nay AND progress < 1` (không lưu cứng, tính lại mỗi lần `recomputeTask`).
- `PATCH /api/tasks/:id` với `status=nghiem_thu` bị chặn — phải dùng endpoint approve.

### 6.3 Đồng bộ đa người dùng

- SSE `/api/events?sheet=` đẩy event `version` mỗi khi `sheetVersion` thay đổi (poll 3s server-side) + refresh tự động ~30s.
- Khi SSE lỗi hoặc bị cắt: client fallback poll `/api/tasks/version` mỗi 10s.
- `/api/events` bị loại khỏi cache service worker.

### 6.4 Offline / PWA

- `public/sw.js`: GET network-first + cache fallback (trừ `/api/photos/` và `/api/events`).
- Tick checkbox khi offline → queue trong `localStorage` (`useOfflineTickQueue`) → PATCH tự động khi online lại.
- 4xx bị bỏ khỏi queue để tránh kẹt.

### 6.5 Thông báo (đồng bộ on-fetch)

4 loại tự quản lý mỗi lần `GET /api/notifications`:
- `delayed` — task quá hạn, chưa hoàn thành
- `due_soon` — hạn ≤3 ngày, tiến độ <70%
- `comment` — bình luận mới trên task được giao / đã bình luận
- `material_over` — vật tư vượt định mức BOQ

Loại nào hết điều kiện → tự xóa bản ghi chưa đọc.

### 6.6 Web Push

- Đăng ký per thiết bị qua `/api/push/subscribe` (upsert theo `endpoint`).
- Gửi khi: bình luận mới + cron báo cáo ngày.
- Subscription 404/410 tự xóa khi gửi.
- Thiếu VAPID key → nút bật push ẩn, mọi hàm gửi là no-op.

### 6.7 BOQCODE

Mã duy nhất **toàn hệ thống** trên `tasks`, `work_packages`, `materials`. Trước khi gán/sửa phải kiểm tra `boqTakenBy()` trong `lib/boq.ts`.

### 6.8 Nghiệm thu 2 bước

1. Task đạt 100% → Admin/PM gọi `POST /api/tasks/:id/approve` → status = `nghiem_thu`, ghi `task_history`.
2. Huỷ: `DELETE /api/tasks/:id/approve`.
3. Duyệt loạt: `POST /api/approvals { taskIds }`.
4. Upload biên bản: `POST /api/tasks/:id/documents`.

### 6.9 Baseline & S-curve

- `POST /api/baselines` snapshot ngày BĐ/KT + % mọi task → bảng `baselines`/`baseline_tasks`.
- S-curve nhận `?baseline=<id>`: đường kế hoạch nội suy start→end từng task trong baseline; đường thực tế tái dựng từ `task_history`.

---

## 7. Màn hình chính

| Route | Mô tả |
|---|---|
| `/` | Dashboard: KPI cards, biểu đồ tiến độ per sheet, bảng trễ, Pareto nguyên nhân trễ |
| `/tracking/[slug]` | Lưới tracking: nhóm → task → checkbox dimension, filter tầng/trạng thái |
| `/materials` | Quản lý vật tư: bảng, sửa inline tên, xóa từng dòng (Admin/PM) |
| `/materials/PurchaseOrders` | Đơn đặt hàng: chọn nhà cung cấp → điền bảng vật tư → in A4 (`/order` redirect về đây) |
| `/approvals` | Danh sách task chờ nghiệm thu + đã nghiệm thu, upload biên bản |
| `/lookahead` | Kế hoạch 7/14/21 ngày: task sắp bắt đầu + đến hạn |
| `/gantt` | Gantt chart toàn bộ task theo timeline |
| `/my-tasks` | Tasks được gán cho user hiện tại |
| `/report` | Bản in-friendly (window.print → PDF) |
| `/login` | Đăng nhập |
| `/password` | Đổi mật khẩu |
| `/users` | Quản lý người dùng (Admin) |
| `/admin` | Admin panel: audit log, phân công hàng loạt |
| `/materials/suppliers` | Danh sách nhà cung cấp |
| `/materials/purchase-requests` | Yêu cầu mua vật tư (PR) |
| `/materials/purchase-orders` | Đơn đặt hàng (PO) |
| `/materials/reports` | Báo cáo tồn kho, xuất nhập vật tư |
| `/materials/import` | Import vật tư từ Excel |
| `/materials/PurchaseOrders` | Đơn đặt hàng in được: chọn NCC → điền bảng vật tư → in A4 |

---

## 8. Biến môi trường

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `DATABASE_URL` | ✓ (runtime) | Chuỗi kết nối PostgreSQL |
| `XBOSS_SECRET` | ✓ (production) | Ký cookie session — thiếu → throw fail-fast |
| `XBOSS_ADMIN_PASSWORD` | production | Mật khẩu admin khi DB trống (thay cho 4 tài khoản demo) |
| `CRON_SECRET` | ✓ (cron) | Header `Authorization: Bearer` cho `/api/cron/*` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | tuỳ chọn | Gửi báo cáo trễ hạn qua Telegram |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | tuỳ chọn | Web Push |
| `SMTP_*` | tuỳ chọn | Gửi email báo cáo |

> **Chi tiết token**: `xboss_session` = `userId.exp.pwFrag.HMAC` — `pwFrag` là 12 ký tự đầu của `password_hash`, nên đổi mật khẩu tự vô hiệu hoá mọi token cũ. Hết hạn sau 7 ngày.

---

## 9. Tech Stack thực tế

| Layer | Công nghệ |
|---|---|
| Framework | Next.js 14 App Router + TypeScript |
| Styling | Tailwind CSS 4 |
| Charts | Recharts + D3 scale |
| Database | PostgreSQL (pg Pool) — schema tự khởi tạo |
| Auth | Stateless HMAC cookie (không dùng NextAuth / Supabase Auth) |
| Realtime | SSE (`/api/events`) + fallback poll |
| Import | SheetJS (xlsx) |
| Export | SheetJS (ExcelJS) |
| Push | web-push (VAPID) |
| Email | Nodemailer (SMTP) |
| PWA | Service Worker (`public/sw.js`) |
| CI/CD | GitHub Actions (lint + typecheck + test + build + Postgres service) |
| Deploy | Vercel + PostgreSQL tự host hoặc Supabase |

---

## 10. Quy ước phát triển

- **Commit**: conventional prefix (`fix:`, `feat:`, `chore:`, `ci:`) + mô tả tiếng Việt.
- **API route mới**: luôn có `getCurrentUser()` + `export const dynamic = "force-dynamic"`.
- **Schema mới**: thêm vào phần migration nhẹ cuối `SCHEMA` trong `lib/db/index.ts` (idempotent).
- **Ngày**: lưu dạng `'YYYY-MM-DD'` (string), so sánh bằng string — không dùng `Date` object cho logic nghiệp vụ.
- **UI/comment/commit**: toàn bộ tiếng Việt.
- **Test**: `npm test` — 3 file trong `tests/`; test tích hợp cần `TEST_DATABASE_URL` (tự skip nếu thiếu).
