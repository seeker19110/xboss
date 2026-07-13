# SPEC.MD — XBoss Web App

## Hệ thống quản lý dự án xây dựng (MEP/ACMV → toàn chuỗi) — Dự án TT AVIO Tháp A

**Phiên bản:** 4.1 (rút gọn, gộp bảng module/màn hình trùng nhau)
**Cập nhật:** 2026-07-13
**Tech Stack:** Next.js 16.2 App Router (React 19.2) · TypeScript 6.0 strict · Tailwind 4.3 · PostgreSQL (tự host, raw SQL qua `pg` — **không Supabase/ORM**, xem `docs/adr/0001-postgres-raw-sql.md`)

> Đặc tả kỹ thuật tổng hợp: auth, mô hình dữ liệu cốt lõi, logic nghiệp vụ trung tâm, danh mục module + màn hình. Schema đầy đủ → `docs/ERD.md`; chi tiết từng module (schema/API/UI/test) → `docs/nang-cap/M<xx>-*.md`; tiến độ/nợ kỹ thuật → `PROGRESS.md`; mục tiêu/MVP → `PROJECT.md`.

---

## 1. Tổng quan

XBoss khởi đầu là công cụ thay thế file Excel tracking tiến độ thi công MEP/ACMV — qua các đợt mở rộng M0–M42 đã trở thành **hệ thống quản lý dự án xây dựng toàn chuỗi**: đấu thầu → BOQ → hợp đồng → mua sắm → thi công → QA&QC → nghiệm thu → thanh toán → bàn giao → bảo hành, cộng các trục hỗ trợ (nhân sự, môi trường, HSE, tài chính, hồ sơ, chuyển đổi số). Hỗ trợ **đa dự án** (M22) — 1 lần cài đặt vận hành nhiều công trình song song.

Đặc điểm giữ nguyên từ đầu: realtime đa người dùng (SSE), mobile-first (kỹ sư/thầu phụ dùng điện thoại tại công trường), PWA offline queue, toàn bộ UI/comment/commit bằng tiếng Việt.

---

## 2. Mô hình dữ liệu WBS (lõi tiến độ)

```
Project → Tower → SheetType [slug động, discipline_id] → WorkPackage → Task → ProgressDimension
```

- **Sheet động**: tạo/sửa/xoá qua `/api/sheets` (không hard-code); `lib/sheets.ts` chỉ dùng backfill 5 sheet gốc (`ogtd`/`oghl`/`ogch`/`odnn1`/`odnn2`) + fallback client.
- **Pattern mã**: `A{n}` (OGTĐ, cũng dùng cho ODNN Zone 1&2 — phân biệt qua `sheet_type_id`), `H{n}` (OGHL), `OGCH{n}` (OGCH); task con: `{mã nhóm},{mm}`.
- **ProgressDimension** = 1 ô checkbox trong lưới tracking (mỗi kích thước ống hoặc mỗi căn hộ).
- **Trạng thái** (`lib/status.ts`): `chuan_bi` → `dang_thi_cong` → `hoan_thanh` / `tre` (suy tự động) → `nghiem_thu` (2 bước + gate QA&QC, không tự hạ cấp).
- **Đa dự án (M22)**: bảng `user_projects` (ai thấy dự án nào), cookie `xboss_project` chọn dự án hiện tại (không path prefix), `getCurrentProjectId(user)` (`lib/projects.ts`) suy dự án ở mọi route cần lọc. Bảng "gốc cụm" có cột `project_id` trực tiếp; bảng con suy qua JOIN cha. Portfolio (`/portfolio`) + `ProjectSwitcher.tsx` là lớp mỏng phía trên. Chi tiết: `docs/adr/0004-multi-project.md`.

---

## 3. Database Schema

Quản lý qua **hệ migrate SQL nhẹ** (`migrations/000N_*.sql`, đánh số append-only, `IF NOT EXISTS`) + bảng `schema_migrations` + runner `lib/db/migrate.ts` (ADR-0003) — **không phải auto-init**. Đổi schema = thêm file migration mới (không sửa file đã áp production); chạy tự động khi boot (advisory lock) hoặc `npm run db:migrate`. Chi tiết bảng/cột/FK/index → **`docs/ERD.md`** (cập nhật cùng PR khi đổi schema).

---

## 4. Auth & Phân quyền

- Cookie `xboss_session` = `userId.exp.pwFrag.HMAC(...)` (stateless, ký `XBOSS_SECRET`) — `pwFrag` = 12 ký tự đầu `password_hash` nên đổi mật khẩu tự vô hiệu hoá token cũ. Hết hạn 7 ngày.
- Rate limit lưu **Postgres** (`login_rate_limits`): 5 lần sai/15 phút theo IP+email, 20/IP → 429 + `Retry-After` (đúng khi chạy nhiều instance).
- **7 vai trò** (`lib/roles.ts`): `admin`/`pm` (toàn quyền, PM trừ quản lý user) · `engineer` (ghi nhận hiện trường) · `subcon` (chỉ task/module được gán, `canTouchTask`/`canTouchPackage`) · `bch`/`cdt`/`viewer` = `VIEW_ONLY_ROLES` (chỉ xem + bình luận; `bch` thêm xem Thanh toán/Chi phí qua `PAYMENT_VIEW_ROLES`; `cdt` không xem VO/IPC/đấu thầu/claim). Quyền tập trung trong map `CAN` (`lib/auth.ts`).

> **Ranh giới bảo mật duy nhất là API route.** Mọi route gọi `getCurrentUser()`, trả 401 khi chưa đăng nhập, kiểm quyền qua `CAN`/`canTouchTask`/`canTouchPackage`. Trang client chỉ redirect khi nhận 401 — không tự ý ẩn UI thay cho kiểm quyền thật.

---

## 5. Module & màn hình (M0–M42 — tất cả đã triển khai)

Mỗi module có đặc tả tự chứa trong `docs/nang-cap/M<xx>-*.md` (schema/lib/API/UI/test). `PROGRESS.md` giữ lịch sử/nợ kỹ thuật.

| Nhóm                 | Module (Mxx)                                                        | Route                                                                              |
| -------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Nền tảng             | M0 AppShell sidebar · M21 IA đầy đủ (hub) · M22 đa dự án            | `/`, `/hub/[id]`, `/portfolio`                                                     |
| Tiến độ & BOQ        | M1 BOQ · M15 trang hệ · M9 dashboard mở rộng · M35 BPTC · M36 trang tiến độ theo hệ | `/tracking/[slug]`, `/boq`, `/he/[code]`, `/tien-do/[he]`                          |
| Chi phí & Hợp đồng   | M2 chi phí · M16 hợp đồng · M6 VO · M17 thanh toán KL (IPC) · M7 đấu thầu · M27 tài chính & kế toán | `/costs`, `/contracts`, `/variations`, `/payment-certs`, `/tenders`, `/finance`    |
| Mua sắm & Vật tư     | M4 NCC & đơn hàng, xe ra vào · M18 định mức · M33 hồ sơ năng lực NTP | `/materials/*`, `/vehicles`                                                        |
| Chất lượng & An toàn | M3 QA&QC + hồ sơ chất lượng · M11 HSE                                | `/quality`, `/hse`                                                                 |
| Hiện trường          | M5 nhật ký thi công · M14 mặt bằng · M12 thiết bị                    | `/diary`, `/work-fronts`, `/equipment`                                             |
| Bản vẽ & Hồ sơ       | M8 bản vẽ BIM/Shop · M32 thay đổi thiết kế · M10 RFI/công văn · M13 họp & rủi ro · M34 claim & EOT · M19 đề xuất & phê duyệt · M20 kho hồ sơ | `/drawings`, `/correspondences`, `/meetings`, `/risks`, `/proposals`, `/documents` |
| Khởi động & Tổ chức  | M23 khởi động & pháp lý · M24 nhân sự & tổ chức                      | `/kickoff`, `/org`, `/personnel`, `/attendance`                                    |
| Môi trường & Rủi ro  | M25 môi trường & giấy phép · M26 quan hệ & quan trắc                 | `/environment`, `/monitoring`                                                      |
| Bàn giao & Vận hành  | M28 bảo hiểm & bảo lãnh · M29 bàn giao & kết thúc · M30 bảo hành & bảo trì | `/insurance`, `/handover`, `/warranty`                                             |
| Công nghệ            | M31 chuyển đổi số (CDE/BIM link/album drone)                         | `/tech`                                                                            |
| Lập kế hoạch & báo cáo (không module riêng) | —                                                       | `/lookahead`, `/gantt`, `/timeline`, `/report`, `/my-tasks`, `/notifications` (M40) |
| Quản trị hệ thống (không module riêng) | —                                                             | `/login`, `/password`, `/users`, `/admin`, `/import`, `/offline`                   |
| UI/UX xuyên suốt (không route riêng) | M37 theme sáng · M38 màu/token tương phản · M39 bảng filter/sort/sticky · M40 trung tâm thông báo · M41 responsive mobile · M42 flatten sidebar | —                                                                                  |

**Chủ động không làm** (2026-07-05, `docs/ke-hoach-fastcons-2026-07.md` §5): bảo hành kiểu FastCons cũ, điểm danh GPS, CRM bán hàng, HRM/lương độc lập, thu chi nội bộ ngoài công trình, Map vị trí.

---

## 6. API Endpoints cốt lõi (lõi tiến độ; module mở rộng xem đặc tả riêng trong `docs/nang-cap/`)

**Auth**: `POST /api/auth/login|logout`, `GET /api/auth/me`, `PATCH /api/auth/password`.

**Project/Tower/Sheet**: `GET /api/project` (public) · `GET/POST /api/projects` (M22, Admin) · `GET/POST /api/towers` + `GET/PATCH/DELETE /api/towers/:id` · `GET/POST /api/sheets` + `PATCH/DELETE /api/sheets/:id` (đổi tên/slug/xoá, Admin/PM).

**Work Packages & Tasks**: `GET/POST /api/workpackages|tasks` + `GET/PATCH/DELETE .../:id` · `POST .../:id/copy|move` · `PATCH /api/tasks/:id/progress`, `/api/dimensions/:id` (gate hold-point QA&QC khi tiến độ TĂNG) · `POST/DELETE /api/tasks/:id/approve` (nghiệm thu đơn, gate `requiredInspectionMissing`, Admin/PM, 100%) · `POST /api/approvals` (duyệt lô) · `GET/POST .../:id/photos|comments|documents` · `GET /api/tasks/version`, `/api/events` (SSE, fallback poll).

**Dashboard & báo cáo**: `GET /api/dashboard` (KPI + cashflow/CPI/VO chỉ `PAYMENT_VIEW_ROLES`) · `/api/dashboard/scurve` (`?baseline=`) · `/api/lookahead` · `/api/search` · `/api/export/excel` · `/api/disciplines/:code/summary`.

**Notifications** (`GET /api/notifications`, đồng bộ on-fetch, lọc theo `project_id` đang chọn trừ `cost_over`): `delayed`/`due_soon`/`comment` (tracking) · `material_over`/`cost_over` (vật tư/chi phí) · `po_late`/`vehicle_late` (mua sắm) · `ncr_overdue`/`punch_overdue` (chất lượng) · `contract_expiry`/`cert_over_contract`/`vo_pending`/`cert_pending` (thương mại) · `diary_missing`/`front_missing` (hiện trường) · `calibration_due`/`norm_over` (thiết bị/định mức) · `due_correspondence`/`proposal_pending`/`meeting_action_overdue` (điều hành) · `legal_expiry`/`insurance_expiry`/`env_permit_expiry`/`env_monitoring_over`/`monitoring_alarm` (pháp lý/môi trường) · `design_change_pending` (M32).

**Cron**: `POST/GET /api/cron/daily-report|weekly-report|sync-sheets` — `Authorization: Bearer CRON_SECRET` (hoặc session Admin/PM cho sync-sheets).

---

## 7. Logic nghiệp vụ trung tâm

- **% tiến độ**: `progress(task) = COUNT(dimension đã tick) / COUNT(tổng dimension)`; `progress(work_package) = AVG(task.progress)`. Chuỗi: `recomputeTask` → `deriveStatus` → `recomputePackage` (`lib/recompute.ts`), luôn `withTransaction` + `SELECT ... FOR UPDATE`.
- **Trạng thái & gate nghiệm thu**: `nghiem_thu` không tự hạ cấp — chỉ đặt/huỷ qua `/api/tasks/:id/approve` hoặc `/api/approvals`. `tre` suy ra `end_date < hôm nay AND progress < 1` (tính lại mỗi lần recompute, không lưu cứng). **Gate QA&QC (M3)**: `requiredInspectionMissing(taskId)` chặn approve khi còn checklist bắt buộc chưa `passed`; `handoverBlocked(packageId)` (hold-point) chặn TĂNG tiến độ khi predecessor chưa nghiệm thu/chưa có biên bản chuyển bước — cả 2 trả 409 kèm lý do.
- **Đồng bộ & Offline**: SSE `/api/events?sheet=` đẩy event `version` khi `sheetVersion` đổi (poll 3s server-side); lỗi/bị cắt → fallback poll `/api/tasks/version` 10s. `public/sw.js`: GET network-first + cache (trừ `/api/photos/`, `/api/events`); tick offline → queue `localStorage` (`useOfflineTickQueue`) → PATCH khi online (bỏ 4xx khỏi queue).
- **BOQCODE**: mã duy nhất toàn hệ thống trên `tasks`/`work_packages`/`materials`/`boq_items` — registry `boq_codes` + trigger DB `boq_codes_sync()` atomic trong transaction ghi (đóng race mà check thuần code `boqTakenBy()` có thể bỏ lọt).
- **Baseline & S-curve, Web Push**: `POST /api/baselines` snapshot ngày BĐ/KT + % mọi task; S-curve `?baseline=<id>` nội suy kế hoạch, tái dựng thực tế từ `task_history`. Web Push đăng ký per thiết bị (`upsert` theo `endpoint`), gửi khi có bình luận mới + cron báo cáo ngày, no-op khi thiếu VAPID key.

---

## 8. Biến môi trường (xem thêm `CLAUDE.md` + `.env.example`)

| Biến                                                       | Bắt buộc        | Mô tả                                                        |
| ------------------------------------------------------------ | --------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`                                             | ✓ runtime       | Chuỗi kết nối PostgreSQL tự host                             |
| `XBOSS_SECRET`                                             | ✓ production    | Ký cookie session — thiếu → throw fail-fast                  |
| `XBOSS_ADMIN_PASSWORD`                                     | production      | Mật khẩu admin khi DB trống (thay 4 tài khoản demo dev)      |
| `CRON_SECRET`                                               | ✓ cron          | Header `Authorization: Bearer` cho `/api/cron/*`             |
| `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`                    | tuỳ chọn        | Báo cáo trễ hạn qua Telegram                                 |
| `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`     | tuỳ chọn        | Web Push                                                     |
| `SMTP_HOST/PORT/USER/PASS/FROM`, `REPORT_EMAIL_TO`         | tuỳ chọn        | Gửi email báo cáo                                            |
| `GOOGLE_SERVICE_ACCOUNT_JSON` (hoặc `GOOGLE_SA_EMAIL`+`GOOGLE_SA_PRIVATE_KEY`) + `GOOGLE_SHEET_ID` + `GOOGLE_SHEET_TAB` | tuỳ chọn | Đồng bộ 2 chiều vật tư ↔ Google Sheet |
| `SENTRY_DSN`                                               | tuỳ chọn        | Theo dõi lỗi production (server + browser)                   |
| `XLSX_FILE`                                                | tuỳ chọn        | File Excel gốc cho `npm run db:seed`                         |
| `APP_URL`                                                  | tuỳ chọn        | Base URL dùng trong email/push                               |

---

## 9. Tech Stack (xác minh `package.json`)

Next.js **16.2** App Router (React **19.2**) · TypeScript **6.0** strict · Tailwind **4.3** (`@theme inline`, không `tailwind.config`, dark-first đảo màu qua `app/globals.css`) · PostgreSQL qua `pg` **8.22** (raw SQL, migrate nhẹ ADR-0003, không ORM/Supabase SDK) · Auth HMAC cookie tự chế · SSE realtime · Recharts · `@tanstack/react-table` + `react-virtual` · `exceljs`/`@e965/xlsx` · `@react-pdf/renderer` (+ `lib/pdf-fonts.ts` font tiếng Việt) · `web-push` · Nodemailer · Service Worker PWA · Sentry (tuỳ chọn) · Test: `node:test` qua `tsx` (ADR-0002) + Playwright e2e. CI: GitHub Actions (`npm audit` → lint → typecheck → test Postgres 16 → build). **Deploy: tự host VPS** (Docker Compose hoặc pm2 + reverse proxy, `DEPLOY.md`) — **không Vercel** (SSE + cron tự host không hợp serverless).

---

## 10. Quy ước phát triển

- **Commit**: conventional prefix (`fix:`/`feat:`/`chore:`/`ci:`/`docs:`) + mô tả tiếng Việt, dòng đầu nói rõ thay đổi gì ở đâu.
- **API route mới**: `getCurrentUser()` (401 khi chưa đăng nhập) + `export const dynamic = "force-dynamic"` + kiểm quyền qua `CAN`.
- **Schema mới**: thêm file `migrations/000N_*.sql` (append-only, `IF NOT EXISTS`) — không sửa migration đã áp production.
- **Ngày**: chuỗi `'YYYY-MM-DD'`, so sánh bằng string — không dùng `Date` object cho logic nghiệp vụ.
- **UI/comment/commit**: toàn bộ tiếng Việt; dark-first, thang `zinc`, không hardcode hex/`dark:`.
- **Test**: `npm test` (`tests/*.test.ts`, tích hợp cần `TEST_DATABASE_URL` — tự skip nếu thiếu; `tests/setup.ts` import đầu tiên ở file chạm DB); e2e authed (`e2e/authed/*.spec.ts`) phủ axe a11y cho trang mới, desktop + mobile.
- **Module mới**: viết đặc tả `docs/nang-cap/M<xx>-*.md` theo khung `docs/nang-cap/README.md` trước khi code (trừ việc nhỏ/sửa lỗi rõ ràng).
