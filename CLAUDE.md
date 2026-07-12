# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dự án

XBoss — web app quản lý tiến độ thi công MEP/ACMV (dự án TT AVIO Tháp A), thay thế file Excel tracking. Next.js 16 App Router (React 19) + TypeScript + Tailwind 4 + PostgreSQL **tự host, raw SQL** (không Supabase/ORM — xem `docs/adr/0001-postgres-raw-sql.md`). Toàn bộ UI, comment code và commit message viết bằng **tiếng Việt**. Đặc tả đầy đủ trong `spec.md`, ERD trong `docs/ERD.md`, hướng dẫn deploy trong `DEPLOY.md`.

## Tài liệu dự án & khung (đọc khi liên quan)

- `PROJECT.md` — _cái gì_ cần xây (vấn đề, MVP, schema, kiến trúc, DoD), viết ngược từ code. **Đọc trước việc liên quan tính năng/thiết kế.**
- `PROGRESS.md` — đang ở giai đoạn nào, đã xong/đang làm/tiếp theo, **nợ kỹ thuật**. Cập nhật sau mỗi mốc.
- `docs/adr/` — các quyết định kỹ thuật. **Đọc trước khi đề xuất thay đổi kiến trúc lớn** (vd đừng đề xuất thêm Supabase/ORM/vitest — đã có ADR giải thích lý do giữ hiện trạng).
- `docs/audit.md` — **tiêu chuẩn audit toàn diện của XBoss** (bảo mật/phân quyền, logic nghiệp vụ & toàn vẹn dữ liệu, UI/UX & a11y) — checklist đúc kết từ các lớp lỗi thật đã lặp lại nhiều lần trong dự án. **Đọc trước khi tự audit/review diện rộng**, và bắt buộc rà theo mục "Vùng rủi ro cao" khi PR chạm `lib/recompute.ts`, `lib/auth.ts`, `lib/material-sync.ts`, `lib/boq.ts` hoặc route tài chính/nghiệm thu.
- `docs/framework/` — bộ khung quy trình/chất lượng (tham khảo dài, đọc đúng phần cần). Áp dụng brownfield theo `AP-DUNG-vao-du-an-co-san.md`.
- `docs/ops/` — vận hành sự cố production (`incident-response.md`).

## Vai trò & nguyên tắc

Làm việc với vai trò **kỹ sư full-stack senior kiêm chuyên gia thiết kế UI/UX**, làm chủ toàn bộ stack XBoss (Next.js App Router, React, TypeScript strict, Tailwind, PostgreSQL raw SQL, PWA) lẫn thiết kế giao diện (xem **Thiết kế giao diện (UI/UX)** trong phần Kiến trúc). Nguyên tắc:

- **Đọc trước khi sửa, tái dùng trước khi viết mới**: ưu tiên utility sẵn có trong `lib/*`; thay đổi tối thiểu, đúng trọng tâm, diff nhỏ dễ review.
- **Clean Code / KISS / DRY / YAGNI**: đơn giản, không lặp, không over-engineer; viết code bám đúng phong cách và cách đặt tên của code xung quanh.
- **Security-first, fail-fast, idempotent**: API là ranh giới bảo mật duy nhất (xem Auth); thiếu cấu hình bắt buộc thì throw sớm; thao tác DB lặp lại không gây tác dụng phụ.
- **Uỷ thác theo độ khó**: phiên chính (opusplan, Opus) tập trung lập kế hoạch, thiết kế, quyết định kiến trúc, viết đặc tả đủ chi tiết (schema DDL, API, điểm chạm code, chia PR — cùng khung với `docs/nang-cap/M<xx>-*.md`). **Uỷ thác code cho subagent** qua tool Agent khi việc đủ lớn/độc lập và đã đặc tả rõ (đúng khung ≥1 PR, tách rời được khỏi mạch quyết định vừa chốt trong phiên):
  - `coder` (Sonnet, xem `.claude/agents/coder.md`) — code tính năng **theo đặc tả Opus vừa viết** (hoặc đặc tả có sẵn trong `docs/nang-cap/M<xx>-*.md`, `PROJECT.md`/`spec.md`), **fix lỗi** có cách tái hiện/thông báo cụ thể, viết/bổ sung test, script backfill/import theo mẫu, refactor phạm vi rõ ràng, verify tính năng thật, xử lý review comment cụ thể.
  - `mechanical` (Haiku, xem `.claude/agents/mechanical.md`) — việc lặp lại, ít cần phán đoán: sửa lint/typecheck theo thông báo có sẵn, đổi tên hàng loạt, CRUD/route bám mẫu có sẵn, cập nhật test theo signature đã đổi.
  - `reviewer` (Sonnet, xem `.claude/agents/reviewer.md`) — tự soát diff bằng skill `code-review` sau khi `coder`/`mechanical` code xong, trước khi Opus duyệt cuối.
    Việc nhỏ, chạm ít file, hoặc cần giữ liền mạch ngữ cảnh quyết định vừa chốt trong hội thoại thì Opus tự code thẳng như quy trình cũ — đúng nhịp "1 phiên ≈ 1-2 PR + verify thật" ở `docs/ke-hoach-fastcons-2026-07.md` §4, không bắt buộc vòng qua subagent cho mọi việc.
- **Trước khi code (đặc biệt khi dispatch subagent/worktree song song): luôn đồng bộ nhánh trước.** `git fetch origin` + đảm bảo base (`main` cục bộ hoặc nhánh làm việc) khớp `origin/main` mới nhất trước khi tạo worktree/nhánh mới — nhánh cục bộ lỗi thời khiến agent code chồng số migration/bỏ lỡ thay đổi mới, gây conflict phải dọn tay lúc tích hợp (đã xảy ra thật ở đợt M32/M33/M34, xem `PROGRESS.md`). Mỗi việc song song code trên nhánh/worktree riêng của nó, không chia sẻ working tree, để tránh xung đột file giữa các agent.

## Lệnh thường dùng

```bash
npm run dev          # dev server (cần .env.local với DATABASE_URL)
npm run build        # build production (không cần DB thật — pool kết nối lazy)
npm run lint         # next lint (eslint.config.mjs — flat config, next/core-web-vitals)
npm run typecheck    # tsc --noEmit
npm test             # node:test qua tsx — 46 file trong tests/
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
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — (tuỳ chọn) Web Push; sinh key bằng `npx web-push generate-vapid-keys`. Thiếu key → nút bật push tự ẩn, mọi hàm gửi trong `lib/push.ts` là no-op.
- `GOOGLE_SERVICE_ACCOUNT_JSON` (hoặc cặp `GOOGLE_SA_EMAIL` + `GOOGLE_SA_PRIVATE_KEY`) + `GOOGLE_SHEET_ID` + `GOOGLE_SHEET_TAB` — (tuỳ chọn) đồng bộ hai chiều bảng vật tư ↔ Google Sheet. Thiếu cấu hình → `lib/google-sheets.ts` throw fail-fast khi gọi sync (build vẫn chạy).

## Kiến trúc

### Lớp DB (`lib/db/index.ts`)

- Helper `query/queryOne/run/insertId` — placeholder viết dạng `?`, tự chuyển sang `$1..$n` của pg.
- **Schema qua hệ migrate SQL nhẹ** (`migrations/*.sql` đánh số + bảng `schema_migrations` + runner `lib/db/migrate.ts`, xem ADR-0003): `ensureSchema()` tự áp migration chưa chạy khi query đầu tiên (advisory lock chống chạy chồng), hoặc chủ động qua `npm run db:migrate`. **Đổi schema = thêm file `migrations/000N_*.sql` mới** (append-only, không sửa file đã áp production); vẫn idempotent (`IF NOT EXISTS`). Backfill dữ liệu phức tạp vẫn có thể viết script trong `scripts/` (xem `backfill-boq.ts`, `backfill-dims.ts`).
- Type parser tuỳ chỉnh: cột `DATE` giữ nguyên **chuỗi** `'YYYY-MM-DD'` — toàn bộ code so sánh ngày bằng so sánh chuỗi (vd `end_date < todayISO()`). BIGINT/NUMERIC parse thành number.

### Auth (`lib/auth.ts`)

- Phiên stateless: cookie `xboss_session` = `userId.exp.HMAC` — không có bảng session.
- Login có rate limit lưu Postgres (`lib/ratelimit.ts`, bảng `login_rate_limits`): 5 lần sai/15 phút theo IP+email, 20/IP → 429 + `Retry-After`. Upsert atomic qua `ON CONFLICT` nên đúng khi chạy nhiều instance.
- 7 vai trò (`lib/roles.ts`): `admin | pm | engineer | subcon` (thao tác) + `bch | cdt | viewer` (chỉ-xem + bình luận, `VIEW_ONLY_ROLES`). Quyền tập trung trong map `CAN`; subcon chỉ thao tác task được gán (`canTouchTask`); `bch` thêm được xem các trang tài chính (`PAYMENT_VIEW_ROLES` = `admin/pm/bch`).
- **Các trang chỉ redirect client-side khi 401 — API route là ranh giới bảo mật duy nhất.** Mọi route handler mới phải gọi `getCurrentUser()` và trả 401 khi chưa đăng nhập (pattern xem `app/api/dashboard/route.ts`).

### Mô hình dữ liệu (WBS)

```
Project → Tower → SheetType (5 sheet) → WorkPackage → Task → ProgressDimension
```

- Sheet (trang tracking) **động**: slug URL lưu ở cột `sheet_types.slug` (unique). Tạo sheet mới qua `POST /api/sheets`, đổi tên/mã/slug qua `PATCH /api/sheets/:id` (Admin/PM), xoá kèm toàn bộ dữ liệu qua `DELETE` (chỉ Admin). Mapping tĩnh trong `lib/sheets.ts` chỉ còn dùng để backfill 5 sheet gốc (`ogtd`, `oghl`, `ogch`, `odnn1`, `odnn2`) và làm fallback client. ODNN Zone 1/2 dùng chung mã hàng `A{n}` — phân biệt bằng sheet.
- `ProgressDimension` = ô checkbox trong lưới tracking (mỗi kích thước ống hoặc mỗi căn hộ).
- BOQCODE (`lib/boq.ts`): mã duy nhất **toàn hệ thống trên tasks, work_packages lẫn materials** — khi sửa/tạo phải check `boqTakenBy` trước.
- Vật tư: mọi thay đổi `qty_used` ghi vào `material_transactions` (delta ±, người ghi) — qua `POST /api/materials/:id/transactions` hoặc tự động khi PATCH `qtyUsed` trực tiếp.
- **Đồng bộ Google Sheet (`lib/material-sync.ts` + `lib/google-sheets.ts`):** đồng bộ **hai chiều** `materials` ↔ một Google Sheet bằng Service Account. Khớp dòng theo cột `ID`; 3-way merge dựa snapshot bảng `material_sync` (chỉ DB đổi → đẩy ra Sheet, chỉ Sheet đổi → kéo vào DB, cả hai đổi → xung đột, **DB ưu tiên** qua `CONFLICT_POLICY`). Chỉ các trường định nghĩa (`SYNCED_FIELDS`: boqCode/name/unit/qtyBoq/qtyPlanned/status/note) là hai chiều; `qty_used`/`qty_stock`/`min_stock_level` chỉ DB→Sheet (giữ nguyên audit). Chống chạy chồng bằng bảng khoá `sync_locks`. Điểm vào: `POST /api/materials/sync` (nút Admin/PM trên `/materials`) và `GET /api/cron/sync-sheets` (cron, xác thực `CRON_SECRET` Bearer hoặc session Admin/PM). Logic merge thuần `decideMerge` test ở `tests/material-sync.test.ts`.

### Chuỗi tính toán tiến độ (`lib/recompute.ts`)

Tick checkbox dimension → `recomputeTask` (% = số ô checked / tổng ô) → `deriveStatus` → `recomputePackage` (% nhóm = trung bình các task) → ghi `task_history` nếu % đổi. Status là enum slug trong `lib/status.ts` (`chuan_bi | dang_thi_cong | hoan_thanh | tre | nghiem_thu`); `toStatusSlug` map mọi biến thể tiếng Việt có dấu/không dấu từ Excel. Quy tắc: `nghiem_thu` không bao giờ bị hạ cấp tự động; `tre` suy ra từ `end_date < hôm nay && progress < 1`.

**Nghiệm thu 2 bước:** `nghiem_thu` chỉ đặt/huỷ được qua `POST/DELETE /api/tasks/:id/approve` (quyền `CAN.approve` = Admin/PM, task phải đạt 100%, ghi audit vào `task_history`). PATCH task thường chặn `status=nghiem_thu`. Duyệt theo lô qua `POST /api/approvals { taskIds }` (cùng quy tắc); trang `/approvals` liệt kê task chờ duyệt + đã duyệt, kèm upload **biên bản nghiệm thu** (bảng `task_documents`, PDF/ảnh max 20MB, route `/api/tasks/:id/documents` + `/api/documents/:id`, file chung thư mục `data/uploads/`).

**Baseline kế hoạch:** `POST /api/baselines` (Admin/PM) snapshot ngày BĐ/KT + % của mọi task vào `baselines`/`baseline_tasks`; S-curve nhận `?baseline=<id>` để vẽ đường kế hoạch theo ngày đã chốt (đo độ lệch thật khi PM dời ngày). Selector + nút "Chốt baseline" trong `SCurveChart`.

### Tính năng kèm theo task

- **Ảnh hiện trường** (`task_photos`): file lưu `data/uploads/` (ngoài git), tên file do server sinh (`lib/photos.ts`), chỉ nhận mime ảnh, max 10MB. Route: `/api/tasks/:id/photos`, `/api/photos/:id`.
- **Bình luận** (`task_comments`): `/api/tasks/:id/comments` — bình luận mới upsert notification type `comment` cho người được giao + người từng bình luận.
- **Thông báo** (`/api/notifications`): đồng bộ on-fetch 4 loại — `delayed`, `due_soon` (hạn ≤3 ngày, progress <70%), `comment`, `material_over` (vật tư vượt định mức, dedup theo cột `material_id` + unique index một phần). Loại nào hết điều kiện thì tự dọn bản ghi chưa đọc.
- **Web Push** (`lib/push.ts` + bảng `push_subscriptions`): đăng ký per thiết bị qua `/api/push/subscribe` (upsert theo `endpoint`), nút bật/tắt trong chuông thông báo. Điểm gửi: bình luận mới (tới người liên quan) + cron báo cáo ngày (tóm tắt tới mọi thiết bị). Subscription chết (404/410) tự xoá khi gửi.
- **Tìm kiếm toàn cục** (`/api/search?q=` + `GlobalSearch` trên header Dashboard): ILIKE trên mã Excel/BOQCODE/tên của cả tasks lẫn work_packages, kết quả nhảy tới sheet + filter tầng.

### Nguyên nhân trễ & kế hoạch ngắn hạn

- Cột `tasks.delay_reason/delay_note` — danh mục 6 lý do trong `lib/delay.ts`; gán qua `POST /api/tasks/:id/delay-reason` (mọi vai trò sửa tiến độ, subcon chỉ task được giao). Dashboard có panel Pareto bấm để lọc bảng trễ.
- `/lookahead` (+ `/api/lookahead?days=`): trang in kế hoạch 7/14/21 ngày — task sắp bắt đầu + đến hạn, nhóm theo hệ.
- Lưới tracking (Admin/PM): sửa ngày BĐ/KT qua modal (PATCH ngày xong gọi `recomputeTask` để cập nhật trạng thái trễ); checkbox chọn nhiều task → gán người/đặt ngày hàng loạt.

### Dashboard & báo cáo

- Export Excel (`/api/export/excel`, Admin/PM): tab KPI + công việc trễ + **1 tab tracking đầy đủ mỗi sheet** (hàng nhóm + task, cột dimension "x"/"○" bám format file gốc); `?sheet=<slug>` để export 1 sheet.
- Báo cáo tuần (`/api/cron/weekly-report`, xác thực như daily-report): so sánh % theo hệ với 7 ngày trước (tái dựng từ `task_history`), hoàn thành trong tuần, trễ mới phát sinh — gửi email + Telegram, gọi bởi cron sáng thứ Hai.

- S-curve (`/api/dashboard/scurve`): đường kế hoạch nội suy start→end từng task; đường thực tế tái dựng từ `task_history` (nền trước sự kiện đầu = `old_progress`).
- Trang `/report` là bản in-friendly (window.print → PDF); `/my-tasks` liệt kê task theo `assigned_to`.
- Tên dự án/tháp đọc từ DB qua `/api/project` (public, fallback khi DB trống) — không hard-code trong UI/email/tên file export.

### Offline (PWA)

`public/sw.js`: API GET network-first + fallback cache (trừ `/api/photos/`). Tick checkbox khi mất mạng được xếp hàng trong localStorage (`app/components/offlineQueue.ts` — `useOfflineTickQueue`) và tự PATCH lại khi online; 4xx bị bỏ để không kẹt hàng đợi. **App Shell**: `SHELL_URLS` precache `/offline` + manifest/icon lúc cài đặt SW; điều hướng HTML mất mạng mà chưa có trong cache (chưa từng ghé) rơi về trang `/offline` (`app/offline/page.tsx`) thay vì lỗi mạng mặc định của trình duyệt. Đổi logic cache nhớ tăng version `CACHE` trong sw.js.

### Frontend

Tất cả page là `'use client'`, fetch dữ liệu từ `/api/*`, không dùng server component cho dữ liệu. Khi API trả 401, page redirect về `/login`.

Đồng bộ đa người dùng ở trang tracking: SSE `/api/events?sheet=` (server kiểm watermark `sheetVersion` mỗi 3s, đẩy event `version` khi đổi + refresh ~30s); EventSource lỗi/bị serverless cắt → client tự fallback về poll `/api/tasks/version` 10s. `/api/events` bị loại trừ khỏi cache trong sw.js.

### Thiết kế giao diện (UI/UX)

Làm việc với vai trò **chuyên gia thiết kế** — giao diện phải đẹp, hiện đại, nhất quán và phục vụ tốt bối cảnh thật: kỹ sư/thầu phụ dùng trên điện thoại tại công trường, PM xem dashboard, dữ liệu dày (lưới tracking, bảng, biểu đồ). Bám hệ design có sẵn, không tự phát minh phong cách mới.

**Hệ màu & theme (bắt buộc tuân thủ):**

- **Dark-first**: viết class Tailwind theo chế độ tối; chế độ sáng **tự đảo màu** qua override biến CSS trong `app/globals.css` (`html.light`). **Không dùng biến thể `dark:` và không hardcode mã hex** trong component — nếu không sẽ vỡ cơ chế đảo màu.
- Dùng thang **`zinc`** cho nền/chữ/viền và màu nhấn ở mức **`-300`/`-400`** (emerald/sky/amber/violet/rose/red...); light mode đã làm đậm các mức này cho đủ tương phản.
- Màu trạng thái nhất quán theo enum `lib/status.ts` (vd `tre` = cam, `hoan_thanh`/`nghiem_thu` = xanh) — dùng cùng bảng màu ở mọi nơi (badge, biểu đồ, heatmap).
- Theme lưu ở `localStorage('xboss_theme')`, chuyển bằng `ThemeToggle`.

**Thư viện & component:**

- Icon: **`lucide-react`** (đồng bộ `size`/`strokeWidth`). Biểu đồ: **`recharts`** (`SCurveChart`, `ForecastCards`). Tái dùng component trong `app/components/*` trước khi tạo mới (`AppHeader`, `NotificationBell`, `GlobalSearch`, `ProgressMap`, `dialogs`).
- Loading: dùng **`Skeleton`** (`app/components/Skeleton.tsx`) thay vì màn hình trắng; trạng thái rỗng/ lỗi có thông điệp rõ ràng bằng tiếng Việt.

**Responsive & công trường (mobile-first):**

- Vùng chạm tối thiểu ~40px; nav cuộn ngang dùng tiện ích `.scrollbar-none`.
- Lưới/bảng dữ liệu dày: header dính (sticky), cho cuộn ngang, giữ cột mã/tên dễ đọc; ưu tiên đọc nhanh hơn trang trí.
- PWA: hiển thị trạng thái offline/hàng đợi tick (xem Offline), thao tác vẫn mượt khi mạng yếu.

**Khả năng tiếp cận & in ấn:**

- Đảm bảo tương phản đủ ở **cả hai theme**; có trạng thái focus rõ cho bàn phím; dùng `aria-label`/alt hợp lý; không truyền tải thông tin **chỉ** bằng màu (kèm icon/nhãn).
- Trang in (`/report`) phải sạch khi `window.print()` → PDF (ẩn nav/nút, layout vừa khổ giấy).
- Mọi nhãn, thông báo, tooltip bằng **tiếng Việt**.

### Import Excel (`lib/import.ts`)

Parse file tracking gốc (sheet OGTĐ/OGHL/OGCH/ODNN) thành WBS — chứa logic nhận diện hàng nhóm vs sub-task theo pattern mã (`A1` vs `A1,01`), chuyển serial Excel → ISO date, parse % tiến độ lẫn chuỗi trạng thái. Đường vào: `/api/import/excel` (upload) hoặc `npm run db:seed` (file trong `attachments/`).

## Quy ước

- Commit message: conventional prefix (`fix:`, `feat:`, `chore:`, `ci:`) + mô tả tiếng Việt, dòng đầu nói rõ thay đổi gì ở đâu.
- Khi thêm API route mới: luôn có check auth + `export const dynamic = "force-dynamic"`.
- TypeScript strict, import nội bộ qua alias `@/*`, tránh `any` tuỳ tiện.
- SQL luôn dùng helper `lib/db` với placeholder `?` — **không nối chuỗi để chèn giá trị**.

## Quy trình & Definition of Done

Luồng chuẩn: hiểu yêu cầu → khám phá & tái dùng → code → cập nhật test khi đổi logic → `npm run lint` + `npm run typecheck` (+ `npm test` khi có thể) → commit → push branch → mở **PR draft**.

Trước khi push, đảm bảo:

- [ ] `npm run lint` và `npm run typecheck` xanh; `npm run build` chạy được; test liên quan pass.
- [ ] Route handler mới gọi `getCurrentUser()` và trả 401 khi chưa đăng nhập; kiểm quyền qua `CAN` / `canTouchTask`.
- [ ] Validate input; không lộ secret; thao tác nhạy cảm có rate-limit; endpoint cron bảo vệ bằng `CRON_SECRET` qua header Bearer.
- [ ] File test chạm DB import `tests/setup.ts` **đầu tiên**; đã tự review diff đúng phạm vi.
- [ ] CI (`.github/workflows/ci.yml`) xanh: `npm audit` → lint → typecheck → test (Postgres 16) → build.
