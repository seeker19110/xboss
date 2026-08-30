# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dự án

XBoss — web app quản lý tiến độ thi công MEP/ACMV (dự án TT AVIO Tháp A), thay thế file Excel tracking. Next.js 16 App Router (React 19) + TypeScript + Tailwind 4 + PostgreSQL **tự host, raw SQL** (không Supabase/ORM — xem `docs/adr/0001-postgres-raw-sql.md`). Toàn bộ UI, comment code và commit message viết bằng **tiếng Việt**. Đặc tả đầy đủ trong `spec.md`, ERD trong `docs/ERD.md`, hướng dẫn deploy trong `DEPLOY.md`.

## Tài liệu dự án & khung (đọc khi liên quan)

- `PROJECT.md` — _cái gì_ cần xây (vấn đề, MVP, schema, kiến trúc, DoD), viết ngược từ code. **Đọc trước việc liên quan tính năng/thiết kế.**
- `PROGRESS.md` — đang ở giai đoạn nào, đã xong/đang làm/tiếp theo, **nợ kỹ thuật**. Cập nhật sau mỗi mốc.
- `docs/adr/` — các quyết định kỹ thuật. **Đọc trước khi đề xuất thay đổi kiến trúc lớn** (vd đừng đề xuất thêm Supabase/ORM/vitest — đã có ADR giải thích lý do giữ hiện trạng).
- `docs/audit.md` — **tiêu chuẩn audit toàn diện của XBoss** (bảo mật/phân quyền, logic nghiệp vụ & toàn vẹn dữ liệu, UI/UX & a11y) — checklist đúc kết từ các lớp lỗi thật đã lặp lại nhiều lần trong dự án. **Đọc trước khi tự audit/review diện rộng**, và bắt buộc rà theo mục "Vùng rủi ro cao" khi PR chạm `lib/tien-do/recompute.ts`, `lib/bao-mat/auth.ts`, `lib/vat-tu/material-sync.ts`, `lib/khoi-luong/boq.ts` hoặc route tài chính/nghiệm thu.
- `docs/framework/` — bộ khung quy trình/chất lượng (tham khảo dài, đọc đúng phần cần). Áp dụng brownfield theo `AP-DUNG-vao-du-an-co-san.md`.
- `docs/ops/` — vận hành sự cố production (`incident-response.md`).

## Vai trò & nguyên tắc

Làm việc với vai trò **kỹ sư full-stack senior kiêm chuyên gia thiết kế UI/UX**, làm chủ toàn bộ stack XBoss (Next.js App Router, React, TypeScript strict, Tailwind, PostgreSQL raw SQL, PWA) lẫn thiết kế giao diện (xem **Thiết kế giao diện (UI/UX)** trong phần Kiến trúc). Nguyên tắc:

- **Đọc trước khi sửa, tái dùng trước khi viết mới**: ưu tiên utility sẵn có trong `lib/*`; thay đổi tối thiểu, đúng trọng tâm, diff nhỏ dễ review.
- **Clean Code / KISS / DRY / YAGNI**: đơn giản, không lặp, không over-engineer; viết code bám đúng phong cách và cách đặt tên của code xung quanh.
- **Security-first, fail-fast, idempotent**: API là ranh giới bảo mật duy nhất (xem Auth); thiếu cấu hình bắt buộc thì throw sớm; thao tác DB lặp lại không gây tác dụng phụ.
- **Lập kế hoạch → điều phối → thi hành (3 tầng)** (quyết định 2026-07-16, thay thế "Uỷ thác theo độ khó" 2026-07-15):

  - **Tầng 1 — Người lập kế hoạch: phiên chính (opusplan · Fable 5).** Hiểu yêu cầu, quyết định kiến trúc, **viết đặc tả chi tiết** (schema DDL, API, điểm chạm code, tiêu chí chấp nhận — cùng khung `docs/nang-cap/M<xx>-*.md`), **định tuyến** từng việc bằng nhãn `route:` theo bảng dưới, xuất kế hoạch theo mẫu `PLAN.md`, và **duyệt kết quả cuối** khi coordinator báo xong. Không tự code, không tự babysit worker.
  - **Tầng 2 — Người điều phối: `coordinator` (Opus · low).** Nhận nguyên văn `PLAN.md` đã chốt và thi hành đúng kế hoạch: đồng bộ nhánh (`git fetch origin`), tạo nhánh/worktree cho từng việc, dispatch từng việc đến đúng agent theo nhãn `route:`, theo dõi kết quả so với tiêu chí chấp nhận, gọi `reviewer` soát diff, tích hợp (xung đột nhỏ, số migration), báo cáo tổng hợp về phiên chính. **Không đổi kế hoạch/đặc tả, không tự code** — worker vướng đặc tả sai/thiếu thì dừng việc đó và báo lại phiên chính.
  - **Tầng 3 — Workers** theo bảng định tuyến.

  **LUẬT CỨNG — thiếu đặc tả chi tiết thì HỎI người dùng, không đoán.** Trước khi lập kế hoạch/giao việc, đặc tả phải đủ chi tiết (phạm vi, schema DDL/API/điểm chạm code khi liên quan, tiêu chí chấp nhận) — từ `docs/nang-cap/M<xx>-*.md`/`G<nn>-*.md`, `PROJECT.md`/`spec.md`, hoặc chính yêu cầu người dùng. Thiếu bất kỳ phần nào → dùng `AskUserQuestion` hỏi lại **trước**, không tự chế đặc tả từ suy đoán rồi giao đi, và không route sang `complex-implementer` như cách né việc hỏi ("để agent tự tìm hiểu" không thay được câu trả lời của người dùng).

  **Bảng định tuyến** — 2 trục: độ phức tạp × độ kín của đặc tả:

  | `route:`     | Khi nào                                                                                                                                                                                       | Agent                 | Model · effort  |
  | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------- |
  | `complex`    | Phức tạp (kiến trúc, nhiều file/luồng đan nhau) **và** đặc tả đã đủ nhưng còn chỗ phải tự cân nhắc đánh đổi trong lúc code — brief phải nêu rõ **ranh giới được phép quyết**                  | `complex-implementer` | Opus · high     |
  | `spec`       | Phức tạp nhưng đặc tả đã **kín** (schema DDL, API, điểm chạm code, tiêu chí chấp nhận đầy đủ) — chỉ cần thi hành chính xác, không sáng tạo                                                    | `spec-executor`       | Opus · low      |
  | `standard`   | Vừa: 1 tính năng/component/fix rõ ràng có đặc tả cụ thể, ít phụ thuộc ngữ cảnh phiên (kèm cả: viết test, script theo mẫu, refactor phạm vi rõ, verify tính năng, xử lý review comment cụ thể) | `standard-worker`     | Sonnet · medium |
  | `mechanical` | Cơ học: sửa lint/typecheck theo thông báo, đổi tên hàng loạt, format, CRUD/route bám mẫu có sẵn, cập nhật test theo signature đã đổi                                                          | `mechanical-worker`   | Haiku           |
  - `coordinator` (Opus · low, xem `.claude/agents/coordinator.md`) và `reviewer` (Sonnet, xem `.claude/agents/reviewer.md`) không nằm trong bảng route — coordinator là tầng điều phối, reviewer là bước hậu kiểm sau khi worker code xong, trước khi phiên chính duyệt cuối.
  - **Brief trong PLAN.md phải đầy đủ ngữ cảnh** — đường dẫn file cụ thể, quy ước dự án liên quan, tiêu chí chấp nhận rõ ràng, và (với `complex`) ranh giới quyết định được phép. Coordinator lẫn worker KHÔNG thấy được hội thoại trước đó trong phiên, chỉ thấy đúng những gì viết trong kế hoạch/brief.
  - Phân vân giữa 2 route → chọn route **rẻ hơn** nếu đặc tả kín, route **đắt hơn** nếu việc chạm vùng rủi ro cao trong `docs/audit.md` (`lib/tien-do/recompute.ts`, `lib/bao-mat/auth.ts`, `lib/vat-tu/material-sync.ts`, `lib/khoi-luong/boq.ts`, route tài chính/nghiệm thu).

- **Trước khi code (đặc biệt khi dispatch subagent/worktree song song): luôn đồng bộ nhánh trước.** `git fetch origin` + đảm bảo base (`main` cục bộ hoặc nhánh làm việc) khớp `origin/main` mới nhất trước khi tạo worktree/nhánh mới — nhánh cục bộ lỗi thời khiến agent code chồng số migration/bỏ lỡ thay đổi mới, gây conflict phải dọn tay lúc tích hợp (đã xảy ra thật ở đợt M32/M33/M34, xem `PROGRESS.md`). Mỗi việc song song code trên nhánh/worktree riêng của nó, không chia sẻ working tree, để tránh xung đột file giữa các agent.

## Lệnh thường dùng

```bash
npm run dev          # dev server (cần .env.local với DATABASE_URL)
npm run build        # build production (không cần DB thật — pool kết nối lazy)
npm run lint         # eslint . (eslint.config.mjs — flat config, next/core-web-vitals)
npm run typecheck    # tsc --noEmit
npm test             # node:test qua tsx — hơn 100 file trong tests/ (không hard-code số tuyệt đối, dễ lệch)
npm test -- --release-gate   # như trên, nhưng ca bị SKIP = LỖI (trừ file có lý do trong scripts/test-skip-allowlist.json). CI dùng cờ này.
npm run test:mutation        # C4 §4 — cố ý phá 9 bất biến (progress/delayed/nghiệm thu/RBAC/risk/gates/idempotency/RLS/tiền) rồi ĐÒI test phải đỏ. Cần TEST_DATABASE_URL.
npx tsx --test tests/status.test.ts   # chạy 1 file test
npm run check:contrast       # ADR-0010 — tương phản WCAG AA của bảng token màu (mọi theme)
npm run check:mau-accent     # ADR-0010 — chữ trắng trên nền accent sáng (kể cả trạng thái hover)
npm run check:lib-layers     # ADR-0007 — ranh giới miền lib/: chặn import ngược tầng + chu trình mới
npm run check:dead-code      # dò module không ai với tới được (đồ thị import toàn repo)
npm run db:seed      # import Excel gốc trong attachments/ vào DB
```

**Test tích hợp** (`recompute.test.ts`) cần Postgres riêng qua biến `TEST_DATABASE_URL` — không có thì tự skip. `tests/setup.ts` phải được import **đầu tiên** trong mọi test chạm DB: nó xoá `DATABASE_URL` (chống ghi nhầm DB thật) hoặc thay bằng `TEST_DATABASE_URL`.

CI (GitHub Actions, `.github/workflows/ci.yml`) chạy lint + typecheck + test + build trên mỗi push vào main và PR, kèm Postgres 16 service container nên test tích hợp chạy thật trong CI.

## Biến môi trường quan trọng

Danh sách **đầy đủ** (kèm biến bắt buộc/tuỳ chọn và luật validate) khai tập trung trong schema zod của `lib/nen/env.ts` — mục dưới chỉ tóm tắt các biến hay chạm.

- `DATABASE_URL` — bắt buộc khi chạy app. `MIGRATE_DATABASE_URL` (tuỳ chọn) — chuỗi kết nối role owner chỉ dùng để chạy migration (`lib/db/migrate.ts`, ADR-0005); thiếu thì fallback về `DATABASE_URL`.
- `XBOSS_PG_POOL_MAX` / `XBOSS_PG_STMT_TIMEOUT_MS` / `XBOSS_SLOW_QUERY_MS` — (tuỳ chọn, M53) chỉnh pool + `statement_timeout` + ngưỡng log query chậm trong `lib/db/index.ts` (mặc định 10 / 30000 / 500; `XBOSS_SLOW_QUERY_MS=0` là tắt log).
- `XBOSS_SECRET` — ký cookie phiên. **Bắt buộc trong production**: thiếu sẽ throw lúc ký/xác minh token (chủ đích fail-fast, build vẫn chạy được).
- `XBOSS_ADMIN_PASSWORD` — production + DB trống chỉ tạo 1 admin với mật khẩu này (không seed 4 tài khoản demo như dev).
- `CRON_SECRET` — bảo vệ `/api/cron/daily-report`, chỉ nhận qua header `Authorization: Bearer` (không qua query param).
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` + `REPORT_EMAIL_TO` — (tuỳ chọn) gửi báo cáo ngày/tuần + cảnh báo health-check qua email. Thiếu `SMTP_HOST`/`USER`/`PASS` → route cron trả **preview** thay vì gửi (không throw).
- `APP_URL` — (tuỳ chọn) URL gốc của app, dùng dựng link tuyệt đối trong email/push và làm `redirect_uri` của SSO OIDC.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — (tuỳ chọn) gửi báo cáo trễ hạn hằng ngày qua Telegram, song song với email SMTP.
- `TELEGRAM_WEBHOOK_SECRET` / `ZALO_OA_SECRET` — xác thực webhook **đi vào** của bot hiện trường (`lib/bao-mat/webhook-inbound.ts`). Telegram so header `X-Telegram-Bot-Api-Secret-Token`; Zalo kiểm HMAC-SHA256 trên raw body (`X-ZEvent-Signature`). Sai/thiếu chữ ký → **401**, không ghi dòng DB nào. Thiếu biến → **throw fail-fast** ngay khi webhook được gọi (build/dev vẫn chạy bình thường).
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — (tuỳ chọn) Web Push; sinh key bằng `npx web-push generate-vapid-keys`. Thiếu key → nút bật push tự ẩn, mọi hàm gửi trong `lib/van-hanh/push.ts` là no-op.
- `GOOGLE_SERVICE_ACCOUNT_JSON` (hoặc cặp `GOOGLE_SA_EMAIL` + `GOOGLE_SA_PRIVATE_KEY`) + `GOOGLE_SHEET_ID` + `GOOGLE_SHEET_TAB` — (tuỳ chọn) đồng bộ hai chiều bảng vật tư ↔ Google Sheet. Thiếu cấu hình → `lib/vat-tu/google-sheets.ts` throw fail-fast khi gọi sync (build vẫn chạy).
- `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` (+ `OIDC_ROLE_CLAIM`, `OIDC_DEFAULT_ROLE`, cần cả `APP_URL`) — (tuỳ chọn) đăng nhập SSO OIDC (`lib/bao-mat/oidc.ts`). Thiếu bất kỳ biến bắt buộc → nút SSO tự ẩn, đăng nhập mật khẩu như cũ.
- `S3_ENDPOINT` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` (+ `S3_REGION`, `S3_FORCE_PATH_STYLE`) — (tuỳ chọn) lưu file upload lên MinIO/S3 qua `lib/nen/storage.ts`. Thiếu ≥1 trong 4 biến bắt buộc → dùng đĩa cục bộ `data/uploads/` (hành vi mặc định).
- `XBOSS_PLUGIN_URL` — (tuỳ chọn) đường tải gói cài plugin AutoCAD, hiện thành nút "Tải Gói Cài Plugin" trên bảng điều khiển `/engineering/chuan-hoa-ban-ve` (M99 PR6). Thiếu → nút thay bằng hướng dẫn cài trên trang `/engineering/cai-dat-plugin` (gói nhị phân không nằm trong repo).
- `XBOSS_PLUGIN_SHA256` — (tuỳ chọn, đi kèm `XBOSS_PLUGIN_URL`) sha256 của gói `.zip` đang phát hành (64 hex, do `plugin-autocad/dong-goi.ps1` sinh cạnh gói) để kỹ sư đối chiếu tệp tải về trên trang `/engineering/cai-dat-plugin`. Thiếu/sai định dạng → ẩn, trang hướng dẫn tự kiểm bằng `Get-FileHash`.
- `ANTHROPIC_API_KEY` — (tuỳ chọn) gợi ý phân loại block/ánh xạ bằng AI (M108: tầng 2 ngữ nghĩa + tầng 3 hình học của `lib/dich-vu/cad.ts`, gợi ý `layerMap`/`boqCode`). Cửa duy nhất ra mô hình là `lib/nen/ai.ts`. Thiếu → **tự tắt tầng 2/3**, hệ thống chạy bằng luật tất định, **không throw** (khác `XBOSS_SECRET`: thiếu AI thì mất tiện ích, thiếu khoá ký phiên thì mất an toàn).
- `XBOSS_AI_BLOCK_CLASSIFY` — (tuỳ chọn) công tắc **dừng khẩn** cho toàn bộ gợi ý AI: đặt `0` là tắt ngay, không cần deploy lại. Mặc định bật khi có khoá.
- `SENTRY_DSN` — (tuỳ chọn) theo dõi lỗi production qua Sentry (`instrumentation.ts` + `sentry.server.config.ts`/`sentry.edge.config.ts`, xem `docs/audit.md` §10). Thiếu → SDK tự `enabled: false`, không gửi gì, không ảnh hưởng build/dev.

## Kiến trúc

### Cấu trúc `lib/` theo miền (ADR-0007 — BẮT BUỘC tuân thủ)

`lib/` chia theo **miền nghiệp vụ**, mỗi thư mục mang một **số tầng** khai trong `lib/layers.json`.
Luật: **chỉ được import xuống tầng thấp hơn**; riêng các miền nghiệp vụ (cùng tầng 4) được import
chéo nhau nhưng **không được tạo chu trình**. `npm run check:lib-layers` canh việc này trong CI.

| Tầng | Thư mục            | Chứa gì                                                                                                    |
| ---- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| 0    | `lib/nen/`         | Tiện ích **thuần, không chạm DB**: date, money, roles, sheets, log, env, storage, photos…                  |
| 1    | `lib/db/`          | Lớp truy cập DB + migrate                                                                                  |
| 2    | `lib/ha-tang/`     | Dịch vụ hạ tầng **có** chạm DB: projects, feature-flags, code-lists, custom-fields, retention, sync-locks… |
| 3    | `lib/bao-mat/`     | auth, permissions, sod, csrf, totp, oidc, ratelimit, audit…                                                |
| 4    | `lib/tien-do/`     | recompute, status, grid, cpm, evm, gantt-data, report, import, approvals…                                  |
| 4    | `lib/khoi-luong/`  | boq, boq-import, norms                                                                                     |
| 4    | `lib/tai-chinh/`   | finance, cost, contracts, claims, vo, paymentcerts, procurement, tender…                                   |
| 4    | `lib/vat-tu/`      | material-sync, google-sheets, resources, equipment                                                         |
| 4    | `lib/hien-truong/` | hse, diary, hr, subcontractors, meetings, handover, warranty, risks…                                       |
| 4    | `lib/ky-thuat/`    | toàn bộ `engineering-*`, `bim/`, `cad/`, drawings, qaqc, tech                                              |
| 4    | `lib/van-hanh/`    | alerts, push, notification-prefs, health                                                                   |
| 5    | `lib/dich-vu/`     | Logic **phối hợp từ 2 miền trở lên** (ADR-0008) — không phải sọt rác cho code khó xếp                      |

**Route handler chỉ là ranh giới HTTP** (ADR-0008): kiểm phiên/quyền, đọc tham số, gọi dịch vụ,
bọc `NextResponse`. Logic nghiệp vụ nằm ở `lib/<miền>/`; logic cần **từ 2 miền trở lên** nằm ở
`lib/dich-vu/` và **không được biết gì về HTTP** (trả dữ liệu thuần, không trả `NextResponse`).

**Thêm module mới:** đặt vào đúng miền theo _nó nói về cái gì_, không theo _nó là loại gì_
(đừng tạo `utils/`). Cần dùng chung giữa nhiều miền → đẩy **xuống** `nen/` (nếu thuần) hoặc
`ha-tang/` (nếu chạm DB), **không** để tầng thấp import ngược lên. Import nội bộ `lib/` luôn
dùng alias `@/lib/<miền>/<module>`, không dùng đường dẫn tương đối.

### Lớp DB (`lib/db/index.ts`)

- Helper `query/queryOne/run/insertId` — placeholder viết dạng `?`, tự chuyển sang `$1..$n` của pg.
- **Schema qua hệ migrate SQL nhẹ** (`migrations/*.sql` đánh số + bảng `schema_migrations` + runner `lib/db/migrate.ts`, xem ADR-0003): `ensureSchema()` tự áp migration chưa chạy khi query đầu tiên (advisory lock chống chạy chồng), hoặc chủ động qua `npm run db:migrate`. **Đổi schema = thêm file `migrations/000N_*.sql` mới** (append-only, không sửa file đã áp production); vẫn idempotent (`IF NOT EXISTS`). Backfill dữ liệu phức tạp vẫn có thể viết script trong `scripts/` (xem `backfill-boq.ts`, `backfill-dims.ts`).
- Type parser tuỳ chỉnh: cột `DATE` giữ nguyên **chuỗi** `'YYYY-MM-DD'` — toàn bộ code so sánh ngày bằng so sánh chuỗi (vd `end_date < todayISO()`). BIGINT/NUMERIC parse thành number.

### Auth (`lib/bao-mat/auth.ts`)

- Phiên stateless: cookie `xboss_session` ký HMAC, **7 phần** `userId.exp.pwFrag.flag2fa.sessionVersion.orgId.HMAC` (ký/verify trong `lib/bao-mat/session-token.ts` — tách riêng để `proxy.ts` import được mà không kéo `next/headers`/`pg`) — không có bảng session. Đổi mật khẩu (pwFrag), thu hồi phiên (`users.session_version`) hay đổi tổ chức đều làm token cũ hết hiệu lực; `flag2fa=1` bị `proxy.ts` chặn mọi API ngoài `/api/auth/*` cho tới khi bật 2FA (M56 PR2).
- Login có rate limit lưu Postgres (`lib/bao-mat/ratelimit.ts`, bảng `login_rate_limits`): 5 lần sai/15 phút theo IP+email, 20/IP → 429 + `Retry-After`. Upsert atomic qua `ON CONFLICT` nên đúng khi chạy nhiều instance.
- 7 vai trò (`lib/nen/roles.ts`): `admin | pm | engineer | subcon` (thao tác) + `bch | cdt | viewer` (chỉ-xem + bình luận, `VIEW_ONLY_ROLES`). Quyền tập trung trong map `CAN`; subcon chỉ thao tác task được gán (`canTouchTask`); `bch` thêm được xem các trang tài chính (`PAYMENT_VIEW_ROLES` = `admin/pm/bch`).
- **Các trang chỉ redirect client-side khi 401 — API route là ranh giới bảo mật duy nhất.** Mọi route handler mới phải gọi `getCurrentUser()` và trả 401 khi chưa đăng nhập (pattern xem `app/api/dashboard/route.ts`).

### Mô hình dữ liệu (WBS)

```
Project → Tower → SheetType (5 sheet) → WorkPackage → Task → ProgressDimension
```

- Sheet (trang tracking) **động**: slug URL lưu ở cột `sheet_types.slug` (unique). Tạo sheet mới qua `POST /api/sheets`, đổi tên/mã/slug qua `PATCH /api/sheets/:id` (Admin/PM), xoá kèm toàn bộ dữ liệu qua `DELETE` (chỉ Admin). Mapping tĩnh trong `lib/nen/sheets.ts` chỉ còn dùng để backfill 5 sheet gốc (`ogtd`, `oghl`, `ogch`, `odnn1`, `odnn2`) và làm fallback client. ODNN Zone 1/2 dùng chung mã hàng `A{n}` — phân biệt bằng sheet.
- `ProgressDimension` = ô checkbox trong lưới tracking (mỗi kích thước ống hoặc mỗi căn hộ).
- BOQCODE (`lib/khoi-luong/boq.ts`): mã duy nhất **toàn hệ thống trên tasks, work_packages lẫn materials** — khi sửa/tạo phải check `boqTakenBy` trước.
- Vật tư: mọi thay đổi `qty_used` ghi vào `material_transactions` (delta ±, người ghi) — qua `POST /api/materials/:id/transactions` hoặc tự động khi PATCH `qtyUsed` trực tiếp.
- **Đồng bộ Google Sheet (`lib/vat-tu/material-sync.ts` + `lib/vat-tu/google-sheets.ts`):** đồng bộ **hai chiều** `materials` ↔ một Google Sheet bằng Service Account. Khớp dòng theo cột `ID`; 3-way merge dựa snapshot bảng `material_sync` (chỉ DB đổi → đẩy ra Sheet, chỉ Sheet đổi → kéo vào DB, cả hai đổi → xung đột, **DB ưu tiên** qua `CONFLICT_POLICY`). Chỉ các trường định nghĩa (`SYNCED_FIELDS`: boqCode/name/unit/qtyBoq/qtyPlanned/status/note) là hai chiều; `qty_used`/`qty_stock`/`min_stock_level` chỉ DB→Sheet (giữ nguyên audit). Chống chạy chồng bằng bảng khoá `sync_locks`. Điểm vào: `POST /api/materials/sync` (nút Admin/PM trong tab "Kho & Định Mức" của `/procurement` — `app/procurement/_components/InventoryTab.tsx`) và `GET /api/cron/sync-sheets` (cron, xác thực `CRON_SECRET` Bearer hoặc session Admin/PM). Logic merge thuần `decideMerge` test ở `tests/material-sync.test.ts`.

### Chuỗi tính toán tiến độ (`lib/tien-do/recompute.ts`)

Tick checkbox dimension → `recomputeTask` (% = số ô checked / tổng ô) → `deriveStatus` → `recomputePackage` (% nhóm = trung bình các task) → ghi `task_history` nếu % đổi. Status là enum slug trong `lib/tien-do/status.ts` (`chuan_bi | dang_thi_cong | hoan_thanh | tre | nghiem_thu`); `toStatusSlug` map mọi biến thể tiếng Việt có dấu/không dấu từ Excel. Quy tắc: `nghiem_thu` không bao giờ bị hạ cấp tự động; `tre` suy ra từ `end_date < hôm nay && progress < 1`.

**Nghiệm thu 2 bước:** `nghiem_thu` chỉ đặt/huỷ được qua `POST/DELETE /api/tasks/:id/approve` (quyền `CAN.approve` = Admin/PM, task phải đạt 100%, ghi audit vào `task_history`). PATCH task thường chặn `status=nghiem_thu`. Duyệt theo lô qua `POST /api/approvals { taskIds }` (cùng quy tắc); trang `/approvals` liệt kê task chờ duyệt + đã duyệt, kèm upload **biên bản nghiệm thu** (bảng `task_documents`, PDF/ảnh max 20MB, route `/api/tasks/:id/documents` + `/api/documents/:id`, file đi chung lớp lưu trữ `lib/nen/storage.ts` với ảnh hiện trường).

**Baseline kế hoạch:** `POST /api/baselines` (Admin/PM) snapshot ngày BĐ/KT + % của mọi task vào `baselines`/`baseline_tasks`; S-curve nhận `?baseline=<id>` để vẽ đường kế hoạch theo ngày đã chốt (đo độ lệch thật khi PM dời ngày). Selector + nút "Chốt baseline" trong `SCurveChart`.

### Tính năng kèm theo task

- **Ảnh hiện trường** (`task_photos`): file ghi qua `lib/nen/storage.ts` (mặc định đĩa cục bộ `data/uploads/` ngoài git; chuyển sang MinIO/S3 khi có đủ biến `S3_*`), tên file do server sinh (`lib/nen/photos.ts`), chỉ nhận mime ảnh, max 10MB. Route: `/api/tasks/:id/photos`, `/api/photos/:id`.
- **Bình luận** (`task_comments`): `/api/tasks/:id/comments` — bình luận mới upsert notification type `comment` cho người được giao + người từng bình luận.
- **Thông báo** (`/api/notifications` → `lib/dich-vu/thong-bao.ts`): đồng bộ on-fetch hơn 30 loại cảnh báo (`delayed`, `due_soon`, `stalled`, `comment`, `material_over`, `cost_over`, `ncr_overdue`, `po_late`, `diary_missing`…), mỗi loại lọc theo vai trò + dự án đang chọn, dedup bằng cột khoá riêng (`material_id`, `po_id`, `ncr_id`…) + unique index một phần; loại nào hết điều kiện thì tự dọn bản ghi chưa đọc. Ngưỡng của `due_soon`/`material_over`… **cấu hình được** qua bảng `alert_rules` (`lib/van-hanh/alerts.ts`, mặc định hạn ≤3 ngày + progress <70%).
- **Web Push** (`lib/van-hanh/push.ts` + bảng `push_subscriptions`): đăng ký per thiết bị qua `/api/push/subscribe` (upsert theo `endpoint`), nút bật/tắt trong chuông thông báo. Điểm gửi hiện có: bình luận mới, phân công task (`lib/tien-do/assignments.ts`), phát hành bản vẽ mới, đổi cấu hình nav — đều `sendPushToUsers`; riêng cron báo cáo ngày dùng `sendPushToAll` (tóm tắt tới mọi thiết bị). Subscription chết (404/410) tự xoá khi gửi.
- **Tìm kiếm toàn cục** (`/api/search?q=` + `GlobalSearch` trên header Dashboard): tasks/work_packages tìm bằng ILIKE prefix trên mã Excel/BOQCODE/tên (kết quả nhảy tới sheet + filter tầng); các nguồn còn lại (hợp đồng, công văn, tài liệu…) đi qua registry **toàn văn FTS** `lib/tien-do/search.ts` (`to_tsvector` + `xboss_unaccent`, index GIN trong `migrations/0068_fts.sql`), mỗi nguồn tự khai quyền xem + lọc dự án.

### Nguyên nhân trễ & kế hoạch ngắn hạn

- Cột `tasks.delay_reason/delay_note` — danh mục 6 lý do trong `lib/tien-do/delay.ts`; gán qua `POST /api/tasks/:id/delay-reason` (mọi vai trò sửa tiến độ, subcon chỉ task được giao). Dashboard có panel Pareto bấm để lọc bảng trễ.
- `/lookahead` (+ `/api/lookahead?days=`): trang in kế hoạch 7/14/21 ngày — task sắp bắt đầu + đến hạn, nhóm theo hệ.
- Lưới tracking (Admin/PM): sửa ngày BĐ/KT qua modal (PATCH ngày xong gọi `recomputeTask` để cập nhật trạng thái trễ); checkbox chọn nhiều task → gán người/đặt ngày hàng loạt.

### Dashboard & báo cáo

- Export Excel (`/api/export/excel`, Admin/PM): tab KPI + công việc trễ + **1 tab tracking đầy đủ mỗi sheet** (hàng nhóm + task, cột dimension "x"/"○" bám format file gốc); `?sheet=<slug>` để export 1 sheet.
- Báo cáo tuần (`/api/cron/weekly-report`, xác thực như daily-report): so sánh % theo hệ với 7 ngày trước (tái dựng từ `task_history`), hoàn thành trong tuần, trễ mới phát sinh — gửi email + Telegram, gọi bởi cron sáng thứ Hai.

- S-curve (`/api/dashboard/scurve`): đường kế hoạch nội suy start→end từng task; đường thực tế tái dựng từ `task_history` (nền trước sự kiện đầu = `old_progress`).
- Trang `/report` là bản in-friendly (window.print → PDF); `/my-tasks` liệt kê task theo `assigned_to`.
- Tên dự án/tháp đọc từ DB qua `/api/project` (public, fallback khi DB trống) — không hard-code trong UI/email/tên file export.

### Offline (PWA)

`public/sw.js`: API GET stale-while-revalidate + cache (trừ `/api/photos/`). Tick checkbox khi mất mạng được xếp hàng trong IndexedDB (`app/components/offlineQueue/` — `useOfflineTickQueue`, 3 loại op: `tick`/`photo`/`diary_note`) và tự PATCH lại khi online; 4xx bị bỏ để không kẹt hàng đợi. **App Shell**: `SHELL_URLS` precache `/offline` + manifest/icon lúc cài đặt SW; điều hướng HTML mất mạng mà chưa có trong cache (chưa từng ghé) rơi về trang `/offline` (`app/offline/page.tsx`) thay vì lỗi mạng mặc định của trình duyệt. Đổi logic cache nhớ tăng version `CACHE` trong sw.js.

### Frontend

Tất cả page là `'use client'`, fetch dữ liệu từ `/api/*`, không dùng server component cho dữ liệu. Khi API trả 401, page redirect về `/login`.

Đồng bộ đa người dùng ở trang tracking: SSE `/api/events?sheet=` (server kiểm watermark `sheetVersion` mỗi 3s, đẩy event `version` khi đổi + refresh ~30s); EventSource lỗi/bị serverless cắt → client tự fallback về poll `/api/tasks/version` 10s. `/api/events` bị loại trừ khỏi cache trong sw.js.

### Thiết kế giao diện (UI/UX)

Làm việc với vai trò **chuyên gia thiết kế** — giao diện phải đẹp, hiện đại, nhất quán và phục vụ tốt bối cảnh thật: kỹ sư/thầu phụ dùng trên điện thoại tại công trường, PM xem dashboard, dữ liệu dày (lưới tracking, bảng, biểu đồ). Bám hệ design có sẵn, không tự phát minh phong cách mới.

**Hệ màu & theme (bắt buộc tuân thủ):**

- **Dark-first**: viết class Tailwind theo chế độ tối; chế độ sáng **tự đảo màu** qua override biến CSS trong `app/globals.css` (`html.light`). **Không dùng biến thể `dark:` và không hardcode mã hex** trong component — nếu không sẽ vỡ cơ chế đảo màu.
- Dùng thang **`zinc`** cho nền/chữ/viền và màu nhấn ở mức **`-300`/`-400`** (emerald/sky/amber/violet/rose/red...); light mode đã làm đậm các mức này cho đủ tương phản.
- Màu trạng thái nhất quán theo enum `lib/tien-do/status.ts` (vd `tre` = cam, `hoan_thanh`/`nghiem_thu` = xanh) — dùng cùng bảng màu ở mọi nơi (badge, biểu đồ, heatmap).
- Theme lưu ở `localStorage('xboss_theme')`, chuyển bằng `ThemeToggle`.

**Thư viện & component:**

- **Bộ component nền `app/components/ui/`** (`Button`/`ButtonLink`, `Card`/`CardLink`, `Chip`, `Section`, `StatCard`) — **dùng trước khi tự viết nút/thẻ/chip/tiêu đề khối mới**. Quy ước hình thức chốt trong ADR-0009 (`docs/adr/0009-bo-component-ui-nen.md`): bo góc `rounded-xl` cho thẻ / `rounded-lg` cho control; mặt thẻ đúng 2 tông (`raised` = `bg-zinc-900`, `sunken` = `bg-zinc-950/70`); **emerald = đang chọn / hành động chính** ở mọi nơi, amber-đỏ chỉ dành cho cảnh báo; nút cao tối thiểu 40px kể cả cỡ `sm`.
- Icon: **`lucide-react`** (đồng bộ `size`/`strokeWidth`). Biểu đồ: **`recharts`** (`SCurveChart`, `ForecastCards`). Tái dùng component trong `app/components/*` trước khi tạo mới (`AppHeader`, `NotificationBell`, `GlobalSearch`, `ProgressMap`, `dialogs`).
- Loading: dùng **`Skeleton`** (`app/components/Skeleton.tsx`) thay vì màn hình trắng; trạng thái rỗng/ lỗi có thông điệp rõ ràng bằng tiếng Việt.

**Responsive & công trường (mobile-first):**

- Vùng chạm tối thiểu ~40px; nav cuộn ngang dùng tiện ích `.scrollbar-none`.
- Lưới/bảng dữ liệu dày: header dính (sticky), cho cuộn ngang, giữ cột mã/tên dễ đọc; ưu tiên đọc nhanh hơn trang trí.
- PWA: hiển thị trạng thái offline/hàng đợi tick (xem Offline), thao tác vẫn mượt khi mạng yếu.

**Khả năng tiếp cận & in ấn:**

- **Nút nền màu đặc đậm dần khi rê chuột** (`bg-{c}-700 hover:bg-{c}-800`), không sáng dần — nền nhạt hơn kéo tương phản với chữ trắng xuống dưới AA (ADR-0010). Lỗi tương phản ở mức TOKEN thì sửa trong `globals.css` cho theme đó, **không** đổi tay từng class ở trang.
- Đảm bảo tương phản đủ ở **cả hai theme**; có trạng thái focus rõ cho bàn phím; dùng `aria-label`/alt hợp lý; không truyền tải thông tin **chỉ** bằng màu (kèm icon/nhãn).
- Trang in (`/report`) phải sạch khi `window.print()` → PDF (ẩn nav/nút, layout vừa khổ giấy).
- Mọi nhãn, thông báo, tooltip bằng **tiếng Việt**.

### Import Excel (`lib/tien-do/import.ts`)

Parse file tracking gốc (sheet OGTĐ/OGHL/OGCH/ODNN) thành WBS — chứa logic nhận diện hàng nhóm vs sub-task theo pattern mã (`A1` vs `A1,01`), chuyển serial Excel → ISO date, parse % tiến độ lẫn chuỗi trạng thái. Đường vào: `/api/import/excel` (upload) hoặc `npm run db:seed` (file trong `attachments/`).

## Quy ước

- Commit message: conventional prefix (`fix:`, `feat:`, `chore:`, `ci:`) + mô tả tiếng Việt, dòng đầu nói rõ thay đổi gì ở đâu.
- Khi thêm API route mới: luôn có check auth + `export const dynamic = "force-dynamic"`.
- TypeScript strict, import nội bộ qua alias `@/*`, tránh `any` tuỳ tiện.
- SQL luôn dùng helper `lib/db` với placeholder `?` — **không nối chuỗi để chèn giá trị**.
- **Merge NGAY khi CI xanh, không chờ hỏi lại** (quyết định 2026-08-25: "quy ước sẽ luôn bật auto merge cho mọi pr", sửa lại cùng ngày cho khớp thực tế — xem ghi chú dưới). Mở PR xong thì theo dõi checks; **đủ 100% checks `success` là merge `SQUASH` ngay**, không đợi người duyệt. Ý nghĩa không đổi so với bản cũ: **trách nhiệm chất lượng dồn hết vào CI + phần tự kiểm trước khi push** — chạy đủ cổng ở mục "Definition of Done" bên dưới TRƯỚC khi mở PR, đừng dựa vào "để review bắt".
  - **Thử `enable_pr_auto_merge` trước; bị từ chối thì merge thẳng, KHÔNG coi là lỗi.** Repo hiện **chưa đặt required status checks** cho `main` trong branch protection, nên GitHub không mở đường auto-merge ở bất kỳ thời điểm nào: gọi lúc chưa check nào đăng ký → `clean` ("merge thẳng đi"), gọi lúc checks đang chạy → `unstable`, gọi lúc đã xanh hết → lại `clean`. Đã thử đủ 3 thời điểm ở PR #398 và #400.
  - **`unstable` KHÔNG có nghĩa là có check đỏ**, dù thông báo lỗi của công cụ ghi "required checks are failing" — nó chỉ có nghĩa "chưa xanh hết". Luôn kiểm `get_check_runs` để phân biệt _đang chạy_ với _đỏ thật_, đừng đi sửa một lỗi không tồn tại.
  - **Chờ đủ mọi check, đừng merge sớm.** `test (Postgres)` và 3 nhánh `e2e` là các job lâu nhất (~6–8 phút); rollup `ci`/`e2e` chỉ xanh sau khi các job con xong. Sự kiện webhook `check_suite.completed` có thể mang `head_sha` của **commit cũ** — đối chiếu với `git rev-parse HEAD` trước khi kết luận.
  - Muốn auto-merge chạy thật đúng nghĩa thì phải bật **required status checks** cho `main` (Settings → Branches). Chừng nào chưa bật, quy ước là merge tay khi CI xanh như trên.
- **Tiền tệ (M45 PR1):** parser oid 1700 (`lib/db/index.ts`) chuyển NUMERIC → `parseFloat` nên **cấm cộng/nhân tiền trên float JS**. Mọi tổng/tích tiền (`SUM`, `* rate`) làm **trong SQL**; JS chỉ hiển thị. Khi buộc phải tính tiếp ở JS (vd tỷ lệ VAT/tạm ứng/giữ lại), cast cột tiền `::text` trong SELECT rồi đưa qua `lib/nen/money.ts` (`parseMoney`/`addMoney`/`mulRate`/`formatVnd` — làm việc trên bigint đơn vị nhỏ = đồng×100).

## Quy trình & Definition of Done

Luồng chuẩn: hiểu yêu cầu → khám phá & tái dùng → code → cập nhật test khi đổi logic → `npm run lint` + `npm run typecheck` (+ `npm test` khi có thể) → **cập nhật `PROGRESS.md` (và `docs/nang-cap/README.md` nếu đóng/mở 1 mục `M<xx>`)** → commit → push branch → mở **PR** → **merge ngay khi CI xanh** (xem Quy ước).

Trước khi push, đảm bảo:

- [ ] `npm run lint` và `npm run typecheck` xanh; `npm run build` chạy được; test liên quan pass.
- [ ] Route handler mới gọi `getCurrentUser()` và trả 401 khi chưa đăng nhập; kiểm quyền qua `CAN` / `canTouchTask`.
- [ ] Validate input; không lộ secret; thao tác nhạy cảm có rate-limit; endpoint cron bảo vệ bằng `CRON_SECRET` qua header Bearer.
- [ ] File test chạm DB import `tests/setup.ts` **đầu tiên**; đã tự review diff đúng phạm vi.
- [ ] CI (`.github/workflows/ci.yml`) xanh: `npm audit` → lint → typecheck → test (Postgres 16) → build.
- [ ] **Migration đụng dữ liệu** (`UPDATE`/backfill/đổi kiểu cột `ALTER COLUMN ... TYPE`/`DROP COLUMN`) phải chạy qua staging trước (`bash deploy.sh --staging`, xem `docs/ops/staging.md`) rồi mới lên production; kiểm trước bằng `npm run db:migrate -- --dry-run`. Migration chỉ `CREATE TABLE`/`ADD COLUMN`/`CREATE INDEX` (thêm thuần tuý, không đụng dòng dữ liệu hiện có) được đi thẳng production.
- [ ] **Mọi commit thêm tính năng/fix có ý nghĩa đã ghi vào `PROGRESS.md`** (mục "Đã làm"/"Tiếp theo" đúng chỗ, kèm số PR khi đã mở) **trước khi push** — không để tài liệu lệch code (bài học lặp lại nhiều lần: dở dang tưởng đã xong hoặc ngược lại vì tài liệu quên cập nhật). Nếu commit đóng/mở 1 mục `M<xx>` trong `docs/nang-cap/`, cập nhật luôn trạng thái trong `docs/nang-cap/README.md`.
