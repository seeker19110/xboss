# SPEC.MD — XBoss Web App

## Hệ thống quản lý dự án xây dựng (MEP/ACMV → toàn chuỗi) — Dự án TT AVIO Tháp A

**Phiên bản:** 3.0 (viết lại toàn diện theo trạng thái triển khai thực tế — phiên bản 2.0 chỉ phản ánh MVP ban đầu M0, đã lỗi thời sau ~30 module)
**Cập nhật:** 2026-07-09
**Tech Stack:** Next.js 16.2 App Router (React 19.2) · TypeScript 6.0 strict · Tailwind 4.3 · PostgreSQL (tự host, raw SQL qua `pg` — **không Supabase/ORM**, xem `docs/adr/0001-postgres-raw-sql.md`)

> File này là đặc tả kỹ thuật tổng hợp: auth, mô hình dữ liệu cốt lõi, logic nghiệp vụ trung tâm, danh mục đầy đủ module. Chi tiết schema đầy đủ → `docs/ERD.md`; chi tiết từng module (schema/API/UI/test) → `docs/nang-cap/M<xx>-*.md`; tiến độ/nợ kỹ thuật → `PROGRESS.md`; đặc tả mục tiêu/MVP → `PROJECT.md`.

---

## 1. Tổng quan

XBoss khởi đầu là công cụ thay thế file Excel "GIA THÀNH – TT AVIO Báo Cáo Tracking Tiến Độ Thi Công ACMV.xlsx" (tracking tiến độ MEP/ACMV) — sau ~30 module mở rộng (2026-07), đã trở thành **hệ thống quản lý dự án xây dựng toàn chuỗi**: đấu thầu → BOQ → hợp đồng → mua sắm → thi công → QA&QC → nghiệm thu → thanh toán → bàn giao → bảo hành, cộng các trục hỗ trợ (nhân sự, môi trường, HSE, tài chính, hồ sơ, chuyển đổi số). Hỗ trợ **đa dự án** (M22) — 1 lần cài đặt vận hành nhiều công trình song song.

Đặc điểm giữ nguyên từ đầu: realtime đa người dùng (SSE), mobile-first (kỹ sư/thầu phụ dùng điện thoại tại công trường), PWA offline queue, toàn bộ UI/comment/commit bằng tiếng Việt.

---

## 2. Mô hình dữ liệu WBS (lõi tiến độ — không đổi từ M0)

### 2.1 Phân cấp

```
Project → Tower → SheetType [slug động, discipline_id] → WorkPackage → Task → ProgressDimension
```

- **Sheet động**: tạo/sửa/xoá qua `/api/sheets`, không hard-code trong DB (mapping tĩnh `lib/sheets.ts` chỉ dùng backfill 5 sheet gốc `ogtd`/`oghl`/`ogch`/`odnn1`/`odnn2` + fallback client).
- **Pattern mã** (5 sheet gốc, sheet mới tự đặt mã theo nhu cầu): `A{n}` (OGTĐ, cũng dùng chung cho ODNN Zone 1&2 — phân biệt qua `sheet_type_id`), `H{n}` (OGHL), `OGCH{n}` (OGCH); task con: `{mã nhóm},{mm}`.
- **ProgressDimension** = 1 ô checkbox trong lưới tracking (mỗi kích thước ống hoặc mỗi căn hộ).

### 2.2 Trạng thái task (enum slug, `lib/status.ts`)

| Slug            | Hiển thị                            |
| --------------- | ----------------------------------- |
| `chuan_bi`      | Chuẩn bị                            |
| `dang_thi_cong` | Đang thi công                       |
| `hoan_thanh`    | Đã hoàn thành                       |
| `tre`           | Đang trễ (suy ra tự động)           |
| `nghiem_thu`    | Đã nghiệm thu (2 bước + gate QA&QC) |

### 2.3 Đa dự án (M22)

Từ 2026-07, hệ thống hỗ trợ nhiều `projects` song song: bảng `user_projects` (ai thấy dự án nào), cookie `xboss_project` chọn dự án hiện tại (không path prefix — giữ nguyên URL), `getCurrentProjectId(user)` (`lib/projects.ts`) suy dự án đang chọn ở mọi route cần lọc. 19 bảng "gốc cụm" có cột `project_id` trực tiếp (BOQ/hợp đồng/PO/vật tư/QC/HSE/...); các bảng con suy `project_id` qua bảng cha (JOIN `towers`/`sheet_types`). Portfolio (`/portfolio`) + project switcher (`ProjectSwitcher.tsx`) là lớp mỏng phía trên. Chi tiết: `docs/adr/0004-multi-project.md` + `docs/nang-cap/M22-da-du-an.md`.

---

## 3. Database Schema

Schema quản lý qua **hệ migrate SQL nhẹ** (`migrations/000N_*.sql`, hiện 36 file — đánh số, append-only, `IF NOT EXISTS`) + bảng `schema_migrations` + runner `lib/db/migrate.ts` (ADR-0003) — **không phải auto-init như bản MVP ban đầu**. Đổi schema = thêm file migration mới, không sửa file đã áp production. Chạy tự động khi boot hoặc chủ động qua `npm run db:migrate`.

Xem chi tiết đầy đủ bảng/cột/FK/index → **`docs/ERD.md`** (bắt buộc cập nhật cùng PR khi đổi schema).

---

## 4. Auth & Phân quyền

### 4.1 Cơ chế

- Cookie `xboss_session` = `userId.exp.pwFrag.HMAC(userId.exp.pwFrag)` (stateless, ký bằng `XBOSS_SECRET`) — `pwFrag` = 12 ký tự đầu `password_hash`, nên **đổi mật khẩu tự vô hiệu hoá mọi token cũ**. Hết hạn sau 7 ngày.
- Rate limit lưu **Postgres** (bảng `login_rate_limits`, `migrations/0002_login_rate_limit.sql` — không còn in-memory như MVP ban đầu, đúng khi chạy nhiều instance): 5 lần sai/15 phút theo IP+email, 20/IP → 429 + `Retry-After`.

### 4.2 Vai trò (7, `lib/roles.ts` — mở rộng từ 4 vai trò ban đầu)

| Vai trò    | Nhãn     | Phạm vi                                                                                          |
| ---------- | -------- | ------------------------------------------------------------------------------------------------ |
| `admin`    | Admin    | Toàn quyền, quản lý user/hệ thống                                                                |
| `pm`       | PM       | Toàn quyền nghiệp vụ (trừ quản lý user)                                                          |
| `engineer` | Kỹ sư    | Ghi nhận hiện trường (tiến độ, QC, nhật ký, HSE...), không quản lý cấu trúc/quyền                |
| `subcon`   | Thầu phụ | Chỉ thao tác task/module được gán (`canTouchTask`/`canTouchPackage`)                             |
| `bch`      | BCH      | Chỉ xem + bình luận, xem được Thanh toán/Chi phí (`PAYMENT_VIEW_ROLES`)                          |
| `cdt`      | CĐT      | Chỉ xem + bình luận, **không** xem chi phí/thương mại nhạy cảm (VO/thanh toán KL/đấu thầu/claim) |
| `viewer`   | Viewer   | Chỉ xem + bình luận, hẹp nhất                                                                    |

`bch`/`cdt`/`viewer` = `VIEW_ONLY_ROLES` (không sửa tiến độ/cấu trúc). Quyền tập trung trong map `CAN` (`lib/auth.ts`) — thêm quyền mới = thêm hàm vào map, không check role rải rác trong route.

> **Ranh giới bảo mật duy nhất là API route.** Mọi route handler gọi `getCurrentUser()`, trả 401 khi chưa đăng nhập, kiểm quyền qua `CAN`/`canTouchTask`/`canTouchPackage` trước khi xử lý. Trang client chỉ redirect khi nhận 401 — không tự ý ẩn UI thay cho kiểm quyền thật.

---

## 5. Danh mục module (M0–M31, ~90 nhóm route API)

Hệ thống hiện có ~90 nhóm route (`app/api/*`), 44 file test, tổ chức theo module — mỗi module có đặc tả tự chứa trong `docs/nang-cap/M<xx>-*.md` (schema/lib/API/UI/test/chia PR). Bảng dưới liệt kê module đã triển khai (✅) theo nhóm nghiệp vụ; xem `docs/nang-cap/README.md` cho danh mục đầy đủ + `PROGRESS.md` cho lịch sử/nợ kỹ thuật từng module.

| Nhóm                 | Module                                                                                         | Route chính                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Nền tảng             | M0 AppShell sidebar, M21 IA đầy đủ (hub + quản trị hiển thị), M22 đa dự án                     | `/`, `/hub/*`, `/portfolio`                                                        |
| Tiến độ & BOQ        | M1 BOQ, M15 trang hệ, M9 dashboard mở rộng                                                     | `/boq`, `/he/[code]`, `/`                                                          |
| Chi phí & Hợp đồng   | M2 chi phí, M16 hợp đồng, M6 VO, M17 thanh toán KL (IPC), M7 đấu thầu                          | `/costs`, `/contracts`, `/variations`, `/payment-certs`, `/tenders`                |
| Mua sắm & Vật tư     | M4 NCC & đơn hàng, M18 định mức                                                                | `/materials/*`, `/vehicles`                                                        |
| Chất lượng & An toàn | M3 QA&QC + hồ sơ chất lượng, M11 HSE                                                           | `/quality`, `/hse`                                                                 |
| Hiện trường          | M5 nhật ký thi công, M14 mặt bằng, M12 thiết bị                                                | `/diary`, `/work-fronts`, `/equipment`                                             |
| Bản vẽ & Hồ sơ       | M8 bản vẽ BIM/Shop, M10 RFI/công văn, M13 họp & rủi ro, M19 đề xuất & phê duyệt, M20 kho hồ sơ | `/drawings`, `/correspondences`, `/meetings`, `/risks`, `/proposals`, `/documents` |
| Khởi động & Tổ chức  | M23 khởi động & pháp lý, M24 nhân sự & tổ chức                                                 | `/kickoff`, `/org`, `/personnel`, `/attendance`                                    |
| Môi trường & Rủi ro  | M25 môi trường & giấy phép, M26 quan hệ & quan trắc                                            | `/environment`, `/monitoring`                                                      |
| Tài chính hỗ trợ     | M28 bảo hiểm & bảo lãnh                                                                        | `/insurance`                                                                       |
| Bàn giao & Vận hành  | M29 bàn giao & kết thúc                                                                        | `/handover`                                                                        |
| Công nghệ            | M31 chuyển đổi số (CDE/BIM link/album drone)                                                   | `/tech`                                                                            |

**Đang triển khai** (worktree song song, xem `PROGRESS.md`): M27 Tài chính – Kế toán công trường (`/finance`), M30 Bảo hành – Bảo trì (`/warranty`).

**Đã viết đặc tả, chưa triển khai** (`docs/nang-cap/M32-M34`): M32 Quản lý thay đổi thiết kế (mở rộng bản vẽ), M33 Hồ sơ năng lực & đánh giá Nhà thầu phụ, M34 Claim chi phí & gia hạn thời gian (EOT).

**Chủ động không làm** (quyết định 2026-07-05, xem `docs/ke-hoach-fastcons-2026-07.md` §5 nhóm E): bảo hành công trình kiểu FastCons cũ (đã thay bằng M30 mới), điểm danh công trường GPS, CRM bán hàng, HRM/lương độc lập (đã có 1 phần qua M24/M27), thu chi nội bộ ngoài phạm vi công trình, Map vị trí.

---

## 6. API Endpoints cốt lõi (lõi tiến độ — chi tiết đầy đủ; module mở rộng xem đặc tả riêng)

### Auth

| Method | Path                 | Mô tả                               |
| ------ | -------------------- | ----------------------------------- |
| POST   | `/api/auth/login`    | Đăng nhập (rate-limit Postgres)     |
| POST   | `/api/auth/logout`   | Đăng xuất                           |
| GET    | `/api/auth/me`       | Thông tin user hiện tại             |
| PATCH  | `/api/auth/password` | Đổi mật khẩu (vô hiệu hoá token cũ) |

### Project / Tower / Sheet

| Method           | Path              | Mô tả                                                     |
| ---------------- | ----------------- | --------------------------------------------------------- |
| GET              | `/api/project`    | Thông tin dự án (public, fallback khi DB trống)           |
| GET/POST         | `/api/projects`   | Danh sách / tạo dự án (M22, Admin)                        |
| GET/POST         | `/api/towers`     | Danh sách / tạo tháp                                      |
| GET/PATCH/DELETE | `/api/towers/:id` | Chi tiết / sửa / xoá tháp                                 |
| GET/POST         | `/api/sheets`     | Danh sách / tạo sheet động (nhận `disciplineId` tuỳ chọn) |
| PATCH/DELETE     | `/api/sheets/:id` | Đổi tên/slug/mã / xoá sheet kèm dữ liệu (Admin/PM)        |

### Work Packages & Tasks (lưới tracking)

| Method           | Path                                                      | Mô tả                                                                                 |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GET/POST         | `/api/workpackages` + `/api/tasks`                        | Danh sách / tạo                                                                       |
| GET/PATCH/DELETE | `/api/workpackages/:id` + `/api/tasks/:id`                | Chi tiết / sửa / xoá                                                                  |
| POST             | `.../:id/copy`, `.../:id/move`                            | Nhân bản, đổi thứ tự                                                                  |
| PATCH            | `/api/tasks/:id/progress`, `/api/dimensions/:id`          | Cập nhật % tiến độ / toggle checkbox — có gate hold-point QA&QC (M3) khi tiến độ TĂNG |
| POST/DELETE      | `/api/tasks/:id/approve`                                  | Đặt/huỷ nghiệm thu — gate `requiredInspectionMissing` (M3), Admin/PM, phải đạt 100%   |
| POST             | `/api/approvals`                                          | Duyệt nghiệm thu nhiều task cùng lúc                                                  |
| GET/POST         | `.../:id/photos`, `.../:id/comments`, `.../:id/documents` | Ảnh hiện trường, bình luận, biên bản (kèm `docCategory`)                              |
| GET              | `/api/tasks/version`, `/api/events`                       | Watermark (fallback poll) / SSE sync đa người dùng                                    |

### Dashboard & Báo cáo

| Method | Path                             | Mô tả                                                                                    |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/dashboard`                 | KPI + cashflow/CPI/VO (chỉ `PAYMENT_VIEW_ROLES`, `null` cho vai trò khác) + khối theo hệ |
| GET    | `/api/dashboard/scurve`          | S-curve kế hoạch (nhận `?baseline=<id>`) + thực tế                                       |
| GET    | `/api/lookahead`                 | Kế hoạch 7/14/21 ngày                                                                    |
| GET    | `/api/search`                    | Tìm kiếm toàn cục (tasks + work_packages)                                                |
| GET    | `/api/export/excel`              | Xuất Excel (KPI + trễ + tracking đầy đủ mỗi sheet)                                       |
| GET    | `/api/disciplines/:code/summary` | KPI theo hệ thi công (M1) — khối chưa triển khai trả `null`                              |

### Notifications (đồng bộ on-fetch — ~20 loại, xem `app/api/notifications/route.ts`)

Mỗi lần `GET /api/notifications`: tự tạo/dọn theo điều kiện hiện tại, lọc theo `project_id` đang chọn (trừ `cost_over` — xem nợ kỹ thuật `PROGRESS.md`). Nhóm chính: `delayed`/`due_soon` (tracking), `comment`, `material_over`/`cost_over` (vật tư/chi phí), `po_late`/`vehicle_late` (mua sắm), `ncr_overdue`/`punch_overdue` (chất lượng), `contract_expiry`/`cert_over_contract`/`vo_pending`/`cert_pending` (thương mại), `diary_missing`/`front_missing` (hiện trường), `calibration_due`/`norm_over` (thiết bị/định mức), `due_correspondence`/`proposal_pending`/`meeting_action_overdue` (điều hành), `legal_expiry`/`insurance_expiry`/`env_permit_expiry`/`env_monitoring_over`/`monitoring_alarm` (pháp lý/môi trường/quan trắc).

### Cron

| Method   | Path                                                                         | Xác thực                                                                    |
| -------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| POST/GET | `/api/cron/daily-report`, `/api/cron/weekly-report`, `/api/cron/sync-sheets` | `Authorization: Bearer CRON_SECRET` (hoặc session Admin/PM cho sync-sheets) |

> **Danh mục đầy đủ ~90 nhóm route** (BOQ, vật tư/NCC, QA&QC, hợp đồng/VO/IPC/đấu thầu, nhân sự, môi trường, quan trắc, bàn giao, công nghệ...) nằm rải trong `docs/nang-cap/M<xx>-*.md` — mỗi file có bảng API đầy đủ của module đó, không lặp lại toàn bộ ở đây để tránh tài liệu trôi khỏi code (bài học từ bản spec 2.0).

---

## 7. Logic nghiệp vụ trung tâm

### 7.1 Chuỗi tính % tiến độ

```
progress_percent(task) = COUNT(dimensions WHERE installed > 0) / COUNT(all dimensions)
progress(work_package)  = AVG(task.progress_percent)
```

Hàm trung tâm: `recomputeTask` → `deriveStatus` → `recomputePackage` (`lib/recompute.ts`), luôn bọc `withTransaction` + `SELECT ... FOR UPDATE`.

### 7.2 Quy tắc trạng thái & gate nghiệm thu (mở rộng M3 — không còn chỉ "2 bước" đơn giản như MVP)

- `nghiem_thu` không bị hạ cấp tự động — chỉ đặt/huỷ qua `/api/tasks/:id/approve` (đơn) hoặc `/api/approvals` (loạt).
- `tre` suy ra: `end_date < hôm nay AND progress < 1` (không lưu cứng, tính lại mỗi lần `recomputeTask`).
- **Gate QA&QC (M3)**: `requiredInspectionMissing(taskId)` chặn approve khi còn checklist bắt buộc chưa có inspection `passed`; `handoverBlocked(packageId)` (hold-point chuyển bước) chặn TĂNG tiến độ khi predecessor chưa nghiệm thu/chưa có biên bản chuyển bước — cả 2 gate trả 409 kèm lý do, lưới tracking hiện icon cảnh báo tương ứng.

### 7.3 Đồng bộ đa người dùng & Offline (không đổi từ M0)

- SSE `/api/events?sheet=` đẩy event `version` khi `sheetVersion` đổi (poll 3s server-side) + refresh ~30s; lỗi/bị cắt → fallback poll `/api/tasks/version` 10s.
- `public/sw.js`: GET network-first + cache fallback (trừ `/api/photos/`, `/api/events`); tick offline → queue `localStorage` (`useOfflineTickQueue`) → PATCH tự động khi online; 4xx bị bỏ khỏi queue.

### 7.4 BOQCODE (mở rộng — nay có ràng buộc DB thật, không chỉ check ở code)

Mã duy nhất **toàn hệ thống** trên `tasks`/`work_packages`/`materials`/`boq_items`. Từ `migrations/0029_boq_codes.sql`: bảng registry `boq_codes` + trigger DB `boq_codes_sync()` atomic ngay trong transaction ghi — đóng cửa sổ race mà kiểm tra thuần ở code (`boqTakenBy()`, `lib/boq.ts`) trước đó có thể bỏ lọt.

### 7.5 Baseline & S-curve, Web Push (không đổi từ M0)

`POST /api/baselines` snapshot ngày BĐ/KT + % mọi task; S-curve `?baseline=<id>` nội suy kế hoạch, tái dựng thực tế từ `task_history`. Web Push đăng ký per thiết bị (`upsert` theo `endpoint`), gửi khi có bình luận mới + cron báo cáo ngày, no-op khi thiếu VAPID key.

---

## 8. Màn hình chính (đã mở rộng nhiều — xem `app/lib/dashboardTree.ts` cho cây điều hướng đầy đủ)

| Route                                                                              | Mô tả                                                                      |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `/`                                                                                | Dashboard tổng: KPI, S-curve, cashflow/CPI (M9), Pareto trễ, card theo hệ  |
| `/hub/[dashId]`                                                                    | Trang hub khuôn chung cho các cụm dashboard (M21)                          |
| `/portfolio`                                                                       | Danh sách dự án + KPI tổng hợp (M22)                                       |
| `/tracking/[slug]`                                                                 | Lưới tracking: nhóm → task → checkbox dimension + icon gate QA&QC/mặt bằng |
| `/boq`, `/he/[code]`                                                               | BOQ theo hệ (M1), trang riêng từng hệ (M15)                                |
| `/costs`, `/contracts`, `/variations`, `/payment-certs`, `/tenders`                | Chi phí, hợp đồng, VO, thanh toán KL (IPC), đấu thầu                       |
| `/materials/*`                                                                     | Vật tư, NCC, PR/PO, báo cáo, import                                        |
| `/vehicles`                                                                        | Xe ra vào công trường (M4)                                                 |
| `/quality`, `/hse`                                                                 | QA&QC + hồ sơ chất lượng, HSE/an toàn                                      |
| `/diary`, `/work-fronts`, `/equipment`                                             | Nhật ký thi công, mặt bằng, thiết bị/máy                                   |
| `/drawings`, `/correspondences`, `/meetings`, `/risks`, `/proposals`, `/documents` | Bản vẽ, RFI/công văn, họp, rủi ro, đề xuất & phê duyệt, kho hồ sơ          |
| `/kickoff`, `/org`, `/personnel`, `/attendance`                                    | Khởi động & pháp lý, tổ chức, nhân sự, chấm công                           |
| `/environment`, `/monitoring`                                                      | Môi trường & giấy phép, quan hệ & quan trắc                                |
| `/insurance`, `/handover`, `/tech`                                                 | Bảo hiểm & bảo lãnh, bàn giao & kết thúc, chuyển đổi số                    |
| `/lookahead`, `/gantt`, `/timeline`, `/report`                                     | Kế hoạch nhìn trước, Gantt, timeline, bản in                               |
| `/my-tasks`, `/notifications`                                                      | Task của tôi, thông báo                                                    |
| `/login`, `/password`, `/users`, `/admin`                                          | Đăng nhập, đổi mật khẩu, quản lý user, admin panel                         |
| `/import`, `/offline`                                                              | Import Excel, trang offline (PWA app-shell)                                |

---

## 9. Biến môi trường (đầy đủ — xem `CLAUDE.md` + `.env.example`)

| Biến                                                                                                                    | Bắt buộc       | Mô tả                                                           |
| ----------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                          | ✓ (runtime)    | Chuỗi kết nối PostgreSQL tự host (raw `pg`, không SDK Supabase) |
| `XBOSS_SECRET`                                                                                                          | ✓ (production) | Ký cookie session — thiếu → throw fail-fast                     |
| `XBOSS_ADMIN_PASSWORD`                                                                                                  | production     | Mật khẩu admin khi DB trống (thay 4 tài khoản demo dev)         |
| `CRON_SECRET`                                                                                                           | ✓ (cron)       | Header `Authorization: Bearer` cho `/api/cron/*`                |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`                                                                               | tuỳ chọn       | Báo cáo trễ hạn qua Telegram                                    |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`                                                              | tuỳ chọn       | Web Push                                                        |
| `SMTP_HOST/PORT/USER/PASS/FROM`, `REPORT_EMAIL_TO`                                                                      | tuỳ chọn       | Gửi email báo cáo                                               |
| `GOOGLE_SERVICE_ACCOUNT_JSON` (hoặc `GOOGLE_SA_EMAIL`+`GOOGLE_SA_PRIVATE_KEY`) + `GOOGLE_SHEET_ID` + `GOOGLE_SHEET_TAB` | tuỳ chọn       | Đồng bộ 2 chiều vật tư ↔ Google Sheet (M4)                      |
| `XLSX_FILE`                                                                                                             | tuỳ chọn       | File Excel gốc cho `npm run db:seed`                            |
| `APP_URL`                                                                                                               | tuỳ chọn       | Base URL dùng trong email/push                                  |

---

## 10. Tech Stack thực tế (xác minh `package.json`)

| Layer         | Công nghệ                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework     | Next.js **16.2** App Router (React **19.2**) + TypeScript **6.0** strict                                                                                      |
| Styling       | Tailwind CSS **4.3** (`@theme inline`, không `tailwind.config`), dark-first + đảo màu qua `app/globals.css`                                                   |
| Database      | PostgreSQL qua `pg` **8.13** — raw SQL, hệ migrate SQL nhẹ (ADR-0003), **không ORM/Supabase SDK**                                                             |
| Auth          | Stateless HMAC cookie (không NextAuth/Supabase Auth)                                                                                                          |
| Realtime      | SSE (`/api/events`) + fallback poll                                                                                                                           |
| Charts        | Recharts                                                                                                                                                      |
| Grid          | `@tanstack/react-table` + `react-virtual`                                                                                                                     |
| Import/Export | `exceljs` + `@e965/xlsx`                                                                                                                                      |
| PDF           | `@react-pdf/renderer` (+ `lib/pdf-fonts.ts` — font tiếng Việt)                                                                                                |
| Push          | `web-push` (VAPID)                                                                                                                                            |
| Email         | Nodemailer (SMTP)                                                                                                                                             |
| PWA           | Service Worker (`public/sw.js`)                                                                                                                               |
| Test          | `node:test` qua `tsx` (không vitest/jest, ADR-0002) — 44 file                                                                                                 |
| CI/CD         | GitHub Actions: `npm audit` → lint → typecheck → test (Postgres 16 service) → build, trên push `main` + PR                                                    |
| **Deploy**    | **Tự host VPS** (Docker Compose hoặc pm2 + reverse proxy — xem `DEPLOY.md`). **Không Vercel** (SSE `/api/events` + cron tự host không tương thích serverless) |

---

## 11. Quy ước phát triển

- **Commit**: conventional prefix (`fix:`, `feat:`, `chore:`, `ci:`, `docs:`...) + mô tả tiếng Việt, dòng đầu nói rõ thay đổi gì ở đâu.
- **API route mới**: luôn có `getCurrentUser()` (401 khi chưa đăng nhập) + `export const dynamic = "force-dynamic"` + kiểm quyền qua `CAN`.
- **Schema mới**: thêm file `migrations/000N_*.sql` mới (append-only, `IF NOT EXISTS`) — **không** sửa file migration đã áp production, **không** còn auto-init tuỳ ý như MVP ban đầu.
- **Ngày**: lưu dạng chuỗi `'YYYY-MM-DD'`, so sánh bằng string — không dùng `Date` object cho logic nghiệp vụ.
- **UI/comment/commit**: toàn bộ tiếng Việt; UI dark-first, thang `zinc`, không hardcode hex/`dark:`.
- **Test**: `npm test` (44 file `tests/*.test.ts`) — tích hợp cần `TEST_DATABASE_URL` (tự skip nếu thiếu); `tests/setup.ts` import đầu tiên ở mọi file chạm DB.
- **Module mới**: viết đặc tả `docs/nang-cap/M<xx>-*.md` theo khung `docs/nang-cap/README.md` TRƯỚC khi code (trừ việc nhỏ/sửa lỗi rõ ràng).
