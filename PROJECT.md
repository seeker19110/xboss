# PROJECT.md — XBoss

> Đặc tả dự án — nguồn sự thật về _cái gì cần xây_. Bản này được **viết ngược** từ code thật
> (theo `docs/framework/AP-DUNG-vao-du-an-co-san.md`, Bước 0) cho dự án đã phát triển.
> Đặc tả chi tiết hơn ở `spec.md`; ERD ở `docs/ERD.md`; deploy ở `DEPLOY.md`.

## 1. Vấn đề & Người dùng

- **Vấn đề:** quản lý tiến độ thi công MEP/ACMV cho dự án **TT AVIO Tháp A** đang dựa trên file Excel tracking — khó đồng bộ nhiều người, không có lịch sử thay đổi, không cảnh báo trễ hạn, không dùng tốt trên điện thoại tại công trường.
- **Người dùng mục tiêu:** 4 vai trò — `admin` (quản trị), `pm` (chỉ huy/QLDA), `engineer` (kỹ sư hiện trường), `subcon` (thầu phụ, chỉ thao tác task được giao). Kỹ sư/thầu phụ dùng chủ yếu trên **điện thoại tại công trường**; PM xem dashboard trên máy tính.
- **Bằng chứng nhu cầu:** thay thế trực tiếp file Excel tracking đang dùng thật (import được file gốc OGTĐ/OGHL/OGCH/ODNN qua `lib/import.ts`).
- **Khác biệt:** đồng bộ đa người dùng thời gian thực, lịch sử tiến độ, cảnh báo trễ/đến hạn, nghiệm thu 2 bước có biên bản, đồng bộ 2 chiều Google Sheet, PWA offline — những thứ Excel không có.

## 2. Phạm vi MVP (MoSCoW) — phần lớn đã hoàn thành

- **Must have (đã có):** mô hình WBS `Project → Tower → SheetType → WorkPackage → Task → ProgressDimension`; lưới tracking dạng spreadsheet tick checkbox → tự tính %/trạng thái; auth 4 vai trò; sheet động (tạo/sửa/xoá); export Excel; dashboard KPI + S-curve.
- **Should have (đã có):** nghiệm thu 2 bước + biên bản; baseline kế hoạch; thông báo (delayed/due_soon/comment/material_over) + Web Push; tìm kiếm toàn cục; lý do trễ + Pareto; lookahead 7/14/21 ngày; báo cáo ngày/tuần (email + Telegram); quản lý vật tư + đồng bộ Google Sheet 2 chiều; offline queue (PWA).
- **Could have:** Gantt/timeline, CPM (`lib/cpm.ts`), forecast/SPI.
- **Won't have (lúc này):** đa ngôn ngữ (chỉ tiếng Việt), multi-tenant nhiều dự án song song.

## 3. Yêu cầu phi chức năng

- **Hiệu năng:** ngân sách Lighthouse CI chính thức (`lighthouserc.json`, đo trên `/login`, 3 lần chạy) — cả 4 category `performance`/`accessibility`/`best-practices`/`seo` đã siết ngưỡng `error` (0.9/0.9/0.9/0.8), chặn merge khi tụt điểm. Mục tiêu định hướng thêm: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.
- **Bảo mật:** **API là ranh giới bảo mật duy nhất** — mọi route gọi `getCurrentUser()` + kiểm quyền `CAN`/`canTouchTask`. Phiên stateless HMAC; rate-limit login; SQL tham số hoá qua `lib/db`. (Không dùng RLS Postgres — quyền ở tầng app.)
- **Accessibility:** mục tiêu WCAG AA cả hai theme; **đã có** axe-core tự động qua Playwright (`e2e/authed/*.spec.ts`, desktop + mobile, mọi trang mới bắt buộc thêm case axe) — xem `docs/a11y/contrast-audit.md` cho backlog remediation đã đóng hết.
- **Mobile-first:** vùng chạm ~40px, nav cuộn ngang `.scrollbar-none`, bảng dày sticky header + cuộn ngang.
- **Theme:** **dark-first** với cơ chế đảo màu qua biến CSS (`app/globals.css`): các class `html.dark` / `html.light` / `html.kingblue` / `html.darkblue` / `html.navy`. **Không** dùng `styles/theme.css`/`data-theme` của khung (xem ADR nếu cần) — không hard-code hex, không dùng biến thể `dark:`.

## 4. Tech stack (xác minh từ `package.json` ngày 2026-06-30)

- **Frontend/Backend:** Next.js **16.2** App Router (React **19.2**, tất cả page `'use client'`, fetch từ `/api/*`) · TypeScript **6.0** `strict` · Tailwind **4.3** (cấu hình CSS qua `@theme inline`, không có `tailwind.config`).
- **CSDL:** PostgreSQL qua `pg` **8.13** — **raw SQL tự quản** (helper `lib/db`, schema tự khởi tạo `CREATE TABLE IF NOT EXISTS`, không ORM, không Supabase, không hệ migrate). Xem `docs/adr/0001-postgres-raw-sql.md`.
- **Thư viện chính:** `lucide-react` (icon) · `recharts` (biểu đồ) · `@tanstack/react-table` + `react-virtual` (lưới) · `exceljs` + `@e965/xlsx` (Excel) · `@react-pdf/renderer` (PDF) · `nodemailer` (email) · `web-push` (push) · `google-auth-library` (Google Sheets).
- **Test:** `node:test` chạy qua `tsx` (không vitest/jest). Xem `docs/adr/0002-node-test-runner.md`.
- **Hosting:** tự host VPS (pm2 + reverse proxy) — xem `DEPLOY.md`. Build không cần DB thật (pool lazy).
- **Phiên bản chính:** Node **22** (`.nvmrc`) · Next 16.2 · React 19.2 · TS 6.0 · Tailwind 4.3 · pg 8.13.

## 5. Thiết kế dữ liệu

- Mô hình WBS đầy đủ: ERD ở `docs/ERD.md`. Bảng chính: `projects`, `towers`, `sheet_types`, `work_packages`, `tasks`, `progress_dimensions`, `task_history`, `materials`, `material_transactions`, `baselines`/`baseline_tasks`, `task_photos`, `task_comments`, `task_documents`, `notifications`, `push_subscriptions`, `material_sync`/`sync_locks`.
- **Quy ước dữ liệu đặc biệt:** cột `DATE` giữ nguyên **chuỗi** `'YYYY-MM-DD'` (so sánh ngày bằng so sánh chuỗi). **BOQCODE** duy nhất toàn hệ thống trên `tasks`/`work_packages`/`materials`. Mọi thay đổi `qty_used` ghi `material_transactions` (audit delta).
- **Chính sách quyền:** không RLS — kiểm soát ở tầng API bằng map `CAN` + `canTouchTask` (`lib/auth.ts`, `lib/roles.ts`).

## 6. Kiến trúc & API

- **Luồng:** client (`'use client'`) → `/api/*` (route handler, `force-dynamic`) → `lib/*` → `lib/db` → Postgres. 98 route handler trong `app/api/`.
- **Chuỗi tính toán:** tick dimension → `recomputeTask` → `deriveStatus` → `recomputePackage` → ghi `task_history` (`lib/recompute.ts`). Status enum slug ở `lib/status.ts`.
- **Đồng bộ real-time:** SSE `/api/events?sheet=` (watermark `sheetVersion`), fallback poll `/api/tasks/version`.
- **Logic nhạy cảm ở server:** kiểm quyền, nghiệm thu 2 bước (`/api/tasks/:id/approve`), tính tiến độ, đồng bộ Google Sheet, cron báo cáo (bảo vệ `CRON_SECRET` Bearer).

## 7. Luồng người dùng chính

1. Đăng nhập (`/login`) → 2. Vào sheet tracking (`/tracking/[slug]`) → 3. Tick checkbox dimension theo ống/căn hộ → 4. Hệ tự tính %/trạng thái, đồng bộ tới mọi người qua SSE → 5. PM xem dashboard/S-curve, duyệt nghiệm thu (`/approvals`), nhận cảnh báo trễ.

## 8. Definition of Done (DoD)

Xem `CLAUDE.md` mục **Quy trình & Definition of Done** và `.github/PULL_REQUEST_TEMPLATE.md`. Tóm tắt: `npm run lint` + `npm run typecheck` xanh · `npm run build` chạy · `npm test` pass · route mới có auth + `force-dynamic` · validate input, không lộ secret · SQL qua `lib/db` placeholder `?` · tự review diff · CI xanh.

## 9. Lộ trình & Mốc thời gian

- **Đã ra mắt nội bộ** (v0.2.1) — đang phát triển/tinh chỉnh tính năng liên tục (xem `git log`).
- **Đang làm:** áp bộ khung quy trình/chất lượng (brownfield) — xem `PROGRESS.md`.

## 10. Rủi ro & Giả định

- ~~Rate-limit in-memory đếm theo process~~ → **đã chuyển Postgres** (bảng `login_rate_limits`, `migrations/0002_login_rate_limit.sql`) — đúng khi chạy nhiều instance, upsert atomic qua `ON CONFLICT`.
- ~~Không có hệ migrate~~ → **đã có** (ADR-0003): `migrations/*.sql` đánh số + `schema_migrations` + runner `lib/db/migrate.ts`, tự áp khi boot hoặc `npm run db:migrate`.
- **Schema qua hệ migrate append-only, `docs/ERD.md` vẫn phải cập nhật tay** — rủi ro thật còn lại (đã bổ sung phần thiếu 2026-07 sau nhiều module M23-M31 chưa được ghi vào ERD).
- ~~Giả định: 1 dự án~~ → **đã hỗ trợ đa dự án** (M22 — Portfolio, project switcher, `user_projects` gate quyền, cột `project_id` trên các bảng gốc). Rủi ro còn lại: một số cụm cross-cutting chưa scope hết theo dự án (đã đóng phần `/api/notifications` + `/api/costs`, xem `PROGRESS.md` mục Nợ kỹ thuật).
- Rủi ro thật đang chờ xử lý: chưa có Sentry (chờ `SENTRY_DSN` từ người vận hành); `EMBED_HOST_WHITELIST` (M31, BIM/camera viewer) là danh sách suy đoán, cần công ty xác nhận domain thật trước khi dùng production.
