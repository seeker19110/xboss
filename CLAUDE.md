# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dự án

XBoss — web app quản lý tiến độ thi công MEP/ACMV (dự án TT AVIO Tháp A), thay thế file Excel tracking. Next.js 14 App Router + TypeScript + Tailwind 4 + PostgreSQL (Supabase hoặc tự host). Toàn bộ UI, comment code và commit message viết bằng **tiếng Việt**. Đặc tả đầy đủ trong `spec.md`, ERD trong `docs/ERD.md`, hướng dẫn deploy trong `DEPLOY.md`.

## Lệnh thường dùng

```bash
npm run dev          # dev server (cần .env.local với DATABASE_URL)
npm run build        # build production (không cần DB thật — pool kết nối lazy)
npm run lint         # next lint (.eslintrc.json — next/core-web-vitals)
npm run typecheck    # tsc --noEmit
npm test             # node:test qua tsx — 3 file trong tests/
npx tsx --test tests/status.test.ts   # chạy 1 file test
npm run db:seed      # import Excel gốc trong attachments/ vào DB
```

**Test tích hợp** (`recompute.test.ts`) cần Postgres riêng qua biến `TEST_DATABASE_URL` — không có thì tự skip. `tests/setup.ts` phải được import **đầu tiên** trong mọi test chạm DB: nó xoá `DATABASE_URL` (chống ghi nhầm DB thật) hoặc thay bằng `TEST_DATABASE_URL`.

CI (GitHub Actions, `.github/workflows/ci.yml`) chạy lint + typecheck + test + build trên mỗi push vào main và PR, kèm Postgres 16 service container nên test tích hợp chạy thật trong CI.

## Biến môi trường quan trọng

- `DATABASE_URL` — bắt buộc khi chạy app.
- `XBOSS_SECRET` — ký cookie phiên. **Bắt buộc trong production**: thiếu sẽ throw lúc ký/xác minh token (chủ đích fail-fast, build vẫn chạy được).
- `XBOSS_ADMIN_PASSWORD` — production + DB trống chỉ tạo 1 admin với mật khẩu này (không seed 4 tài khoản demo như dev).
- `CRON_SECRET` — bảo vệ `/api/cron/daily-report`, chỉ nhận qua header `Authorization: Bearer` (không qua query param).
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — (tuỳ chọn) gửi báo cáo trễ hạn hằng ngày qua Telegram, song song với email SMTP.

## Kiến trúc

### Lớp DB (`lib/db/index.ts`)

- Helper `query/queryOne/run/insertId` — placeholder viết dạng `?`, tự chuyển sang `$1..$n` của pg.
- **Schema tự khởi tạo** khi query đầu tiên chạy (`CREATE TABLE IF NOT EXISTS`, idempotent, không có hệ migrate). Muốn đổi schema bảng đã tồn tại phải tự `ALTER` hoặc viết script backfill trong `scripts/` (xem `backfill-boq.ts`, `backfill-dims.ts` làm mẫu).
- Type parser tuỳ chỉnh: cột `DATE` giữ nguyên **chuỗi** `'YYYY-MM-DD'` — toàn bộ code so sánh ngày bằng so sánh chuỗi (vd `end_date < todayISO()`). BIGINT/NUMERIC parse thành number.

### Auth (`lib/auth.ts`)

- Phiên stateless: cookie `xboss_session` = `userId.exp.HMAC` — không có bảng session.
- 4 vai trò: `admin | pm | engineer | subcon`. Quyền tập trung trong map `CAN`; subcon chỉ thao tác task được gán (`canTouchTask`).
- **Các trang chỉ redirect client-side khi 401 — API route là ranh giới bảo mật duy nhất.** Mọi route handler mới phải gọi `getCurrentUser()` và trả 401 khi chưa đăng nhập (pattern xem `app/api/dashboard/route.ts`).

### Mô hình dữ liệu (WBS)

```
Project → Tower → SheetType (5 sheet) → WorkPackage → Task → ProgressDimension
```

- 5 sheet cố định, mapping slug URL ↔ mã DB trong `lib/sheets.ts` (`ogtd`, `oghl`, `ogch`, `odnn1`, `odnn2`). ODNN Zone 1/2 dùng chung mã hàng `A{n}` — phân biệt bằng sheet.
- `ProgressDimension` = ô checkbox trong lưới tracking (mỗi kích thước ống hoặc mỗi căn hộ).
- BOQCODE (`lib/boq.ts`): mã duy nhất **toàn hệ thống trên cả tasks lẫn work_packages** — khi sửa/tạo phải check `boqTakenBy` trước.

### Chuỗi tính toán tiến độ (`lib/recompute.ts`)

Tick checkbox dimension → `recomputeTask` (% = số ô checked / tổng ô) → `deriveStatus` → `recomputePackage` (% nhóm = trung bình các task) → ghi `task_history` nếu % đổi. Status là enum slug trong `lib/status.ts` (`chuan_bi | dang_thi_cong | hoan_thanh | tre | nghiem_thu`); `toStatusSlug` map mọi biến thể tiếng Việt có dấu/không dấu từ Excel. Quy tắc: `nghiem_thu` không bao giờ bị hạ cấp tự động; `tre` suy ra từ `end_date < hôm nay && progress < 1`.

**Nghiệm thu 2 bước:** `nghiem_thu` chỉ đặt/huỷ được qua `POST/DELETE /api/tasks/:id/approve` (quyền `CAN.approve` = Admin/PM, task phải đạt 100%, ghi audit vào `task_history`). PATCH task thường chặn `status=nghiem_thu`.

### Tính năng kèm theo task

- **Ảnh hiện trường** (`task_photos`): file lưu `data/uploads/` (ngoài git), tên file do server sinh (`lib/photos.ts`), chỉ nhận mime ảnh, max 10MB. Route: `/api/tasks/:id/photos`, `/api/photos/:id`.
- **Bình luận** (`task_comments`): `/api/tasks/:id/comments` — bình luận mới upsert notification type `comment` cho người được giao + người từng bình luận.
- **Thông báo** (`/api/notifications`): đồng bộ on-fetch 4 loại — `delayed`, `due_soon` (hạn ≤3 ngày, progress <70%), `comment`, `material_over` (vật tư vượt định mức, dedup theo cột `material_id` + unique index một phần). Loại nào hết điều kiện thì tự dọn bản ghi chưa đọc.

### Dashboard & báo cáo

- S-curve (`/api/dashboard/scurve`): đường kế hoạch nội suy start→end từng task; đường thực tế tái dựng từ `task_history` (nền trước sự kiện đầu = `old_progress`).
- Trang `/report` là bản in-friendly (window.print → PDF); `/my-tasks` liệt kê task theo `assigned_to`.
- Tên dự án/tháp đọc từ DB qua `/api/project` (public, fallback khi DB trống) — không hard-code trong UI/email/tên file export.

### Offline (PWA)

`public/sw.js`: API GET network-first + fallback cache (trừ `/api/photos/`). Tick checkbox khi mất mạng được xếp hàng trong localStorage (`app/components/offlineQueue.ts` — `useOfflineTickQueue`) và tự PATCH lại khi online; 4xx bị bỏ để không kẹt hàng đợi. Đổi logic cache nhớ tăng version `CACHE` trong sw.js.

### Frontend

Tất cả page là `'use client'`, fetch dữ liệu từ `/api/*`, không dùng server component cho dữ liệu. Khi API trả 401, page redirect về `/login`.

### Import Excel (`lib/import.ts`)

Parse file tracking gốc (sheet OGTĐ/OGHL/OGCH/ODNN) thành WBS — chứa logic nhận diện hàng nhóm vs sub-task theo pattern mã (`A1` vs `A1,01`), chuyển serial Excel → ISO date, parse % tiến độ lẫn chuỗi trạng thái. Đường vào: `/api/import/excel` (upload) hoặc `npm run db:seed` (file trong `attachments/`).

## Quy ước

- Commit message: conventional prefix (`fix:`, `feat:`, `chore:`, `ci:`) + mô tả tiếng Việt, dòng đầu nói rõ thay đổi gì ở đâu.
- Khi thêm API route mới: luôn có check auth + `export const dynamic = "force-dynamic"`.
