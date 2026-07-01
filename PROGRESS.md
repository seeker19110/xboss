# PROGRESS.md — Trạng thái dự án

> Cập nhật sau mỗi mốc đáng kể. AI đọc file này để biết đang ở đâu.

## Giai đoạn hiện tại

- **GĐ 4–5 — Phát triển & nâng chất lượng.** Sản phẩm đã chạy thật (v0.2.1, tự host VPS), đang phát triển/tinh chỉnh tính năng liên tục **và** đang áp bộ khung quy trình/chất lượng (brownfield) theo `docs/framework/AP-DUNG-vao-du-an-co-san.md`.

## Đã xong

- **Sản phẩm lõi:** WBS tracking (sheet động, lưới checkbox, tự tính %/trạng thái, SSE đồng bộ đa người dùng), auth 4 vai trò, dashboard + S-curve + forecast, nghiệm thu 2 bước + biên bản, baseline, thông báo + Web Push, tìm kiếm toàn cục, lý do trễ + Pareto, lookahead, báo cáo ngày/tuần (email + Telegram), vật tư + đồng bộ Google Sheet 2 chiều, export Excel, PWA offline queue.
- **Hạ tầng chất lượng có sẵn:** TypeScript `strict`; ESLint 9 flat config (`eslint.config.mjs`); CI (`.github/workflows/ci.yml`) chạy `npm audit` → lint → typecheck → test (Postgres 16 service) → build trên push `main` + PR; PR template XBoss-specific; test `node:test` (8 file trong `tests/`).
- **Áp khung — Lớp 1 (đợt này):** `PROJECT.md` (viết ngược) + `PROGRESS.md` + ADR-0001/0002; `CONTRIBUTING.md` + `SECURITY.md` (khớp thực tế XBoss); issue templates + Dependabot + CODEOWNERS; mục trỏ tài liệu khung trong `CLAUDE.md`.

## Đang làm

- Áp khung brownfield Bước 0 → Lớp 1 (đợt này, nhánh `chore/ap-dung-khung-brownfield`).

## Tiếp theo

- ~~**Workflow audit tương phản màu (a11y) toàn UI**~~ → **đã xong** (`docs/a11y/contrast-audit.md` + `scripts/contrast-check.ts`). Đã tính tương phản WCAG cho `text-zinc-300/400/500/600` × nền `zinc-*` trên **cả 6 theme** + nút accent chữ trắng → rút **quy tắc thay thế đúng mọi theme** + **backlog remediation có thứ tự** (P1 global chrome → Dashboard → tracking → …). Phát hiện: ước tính cũ over-count (grep bắt cả icon hover/idle, code dev-only, accent đã đạt AA như `red-600`/`blue-600`) → nút accent FAIL thật chỉ ~10 (không phải ~43). Audit lại `/login`: còn 1 `text-zinc-500` nhưng nằm trong `NODE_ENV==='development'` → không render production, axe không bắt (đúng).
- ~~**Bước 0 — hạ tầng E2E có đăng nhập**~~ → **đã xong**: fixture login admin (`e2e/auth.setup.ts` lưu `storageState`), seed DB test 1 lần (`e2e/global-setup.ts`), `playwright.config.ts` tách project public/setup/authed (bật nhánh sau-auth khi có `E2E_DATABASE_URL`), CI `e2e.yml` thêm Postgres 16 + env. **Trang sau-auth đầu tiên phủ axe + remediate xong: Dashboard `/`** (`e2e/authed/dashboard.spec.ts`, desktop + mobile) — verify thật bằng Postgres cục bộ + Chromium (9/9 xanh).
  - Sửa Dashboard (`app/page.tsx`) theo node axe báo: `text-zinc-500/600` body-text → `zinc-400`; nút `bg-emerald-600` chữ trắng → `emerald-700`; bỏ opacity `text-red-400/80,/70`; thêm `aria-label` cho 3 nút export icon-only + select lọc.
  - Sửa **global chrome** `AppHeader` (mọi trang): nav link icon-only trên mobile thiếu tên → thêm `aria-label`. **axe bắt được cả lỗi NGOÀI contrast** (`link-name` mobile, `select-name`) — thứ grep không thấy → khẳng định axe = ground-truth.
- ~~**Lưới tracking** (`/tracking/[sheet]`)~~ → **đã remediate & verify bằng axe** (`e2e/authed/tracking.spec.ts`, desktop + mobile): nhãn ngày/tầng/số task/nhãn nhỏ `zinc-500/600`→`zinc-400`, 2 select lọc +`aria-label`. Gate **quét cả khi đã mở nhóm** để phủ lưới bung → sửa thêm phần trước đây bỏ sót: 7 th header + nhãn cột dimension `zinc-500`→`zinc-400`, select lý do trễ (nền `zinc-800`)→`zinc-300`, checkbox dimension +`aria-label`.
- **PHIÊN TỚI — remediate trang kế theo backlog** (audit §4): payments / my-tasks / materials. Mỗi trang: thêm `e2e/authed/<trang>.spec.ts`, chạy axe lấy node lỗi, sửa, axe xanh lại. (my-tasks/payments cần seed gán task/tạo dữ liệu để render đủ.) Khi phủ đủ trang chính → siết Lighthouse a11y `warn`→`error`.
- **Quyết định Lớp 2 (cần xác nhận người dùng — đợt sau):**
  - ~~Hàng rào tooling: Prettier + Husky + lint-staged + commitlint~~ → đã thêm. pre-commit format/lint **chỉ file staged** (không format cả repo); commit-msg chặn sai conventional. `git commit -F` tiếng Việt vẫn dùng bình thường (commitlint đã tắt `subject-case`).
  - ~~`lib/env.ts` (Zod) validate biến môi trường~~ → đã thêm (lazy + memoized, wiring vào `getPool`; `lib/auth` giữ prod-check riêng).
  - ~~Lighthouse CI + Playwright E2E (desktop + mobile) + axe a11y~~ → đã thêm (smoke + axe `/login`; Lighthouse warn-only baseline). Còn lại: E2E luồng đăng nhập thật (cần seed DB test) + ngưỡng coverage (`node:test` chưa có sẵn — cân nhắc `c8`).
  - ~~secret-scan (gitleaks)~~ → đã thêm. **CodeQL bị chặn** (repo private, chưa có GHAS — xem `SECURITY.md`). Sentry observability (cần DSN).
- **KHÔNG đổi (đang chạy tốt, không big-bang):** hệ theme class-based, PWA `sw.js`, test runner `node:test`, ESLint flat config, CSDL raw SQL.

## Quyết định quan trọng (trỏ tới ADR nếu có)

- `docs/adr/0001-postgres-raw-sql.md` — Postgres raw SQL tự quản (không Supabase/ORM/migrate).
- `docs/adr/0002-node-test-runner.md` — `node:test` qua `tsx` thay vì vitest/jest.
- Theme đảo màu qua class CSS (`app/globals.css`) thay vì `styles/theme.css`/`data-theme` của khung.

## Nợ kỹ thuật (chỗ "làm tạm" cần quay lại)

- **Rate-limit in-memory** (`lib/ratelimit.ts`) đếm theo process → sai khi multi-instance; cần chuyển DB/Redis.
- ~~**Không có hệ migrate**~~ → **đã có** (ADR-0003): hệ migrate SQL nhẹ `migrations/*.sql` đánh số + `schema_migrations` + runner `lib/db/migrate.ts` (tự áp lúc boot / `npm run db:migrate`). Baseline = `0001_baseline.sql`. Đổi schema từ nay = thêm file mới (append-only). **Còn lại:** `docs/ERD.md` vẫn cập nhật tay.
- **Nợ a11y tương phản màu (HỆ THỐNG, đang dọn dần) — đã có audit + backlog: `docs/a11y/contrast-audit.md`:**
  - ~~`/login` + footer toàn cục (3 lỗi serious)~~ → **đã sửa & verify bằng axe**: `/login` (subtitle zinc-500→zinc-400, nút emerald-600→emerald-700) + footer layout (zinc-600/500→zinc-400/200). **Rule `color-contrast` đã bật lại** trong `e2e/login.spec.ts` → giờ là cổng cứng (E2E sẽ đỏ nếu tái phạm).
  - ~~Audit toàn UI~~ → **xong**: bảng tương phản tính được (6 theme) + quy tắc (`zinc-600`/`zinc-500` body-text luôn fail → `zinc-400`; `zinc-400` fail trên nền `zinc-700` → `zinc-300`; nút accent chữ trắng → `-700`) + **backlog có thứ tự** (audit §4). Tái lập bằng `npx tsx scripts/contrast-check.ts`.
  - ~~Hạ tầng E2E sau-auth (Bước 0)~~ → **xong** (xem mục "Tiếp theo"). ~~Dashboard `/` + `AppHeader`~~ → **đã remediate & verify bằng axe** (desktop + mobile).
  - ~~tracking grid~~ → **đã remediate & verify bằng axe** (desktop + mobile).
  - **Còn lại (app-wide):** payments, my-tasks, materials… (đã trừ Dashboard/AppHeader/tracking) — ứng viên `text-zinc-500/600` còn lại + nút accent FAIL. Dọn dần **theo từng trang** qua axe E2E (axe là ground-truth) — không big-bang. Quy trình: audit §5 Bước 1..n.
  - Sau khi phủ axe thêm trang: siết assertion Lighthouse a11y từ `warn` lên `error`.
- **Observability (Sentry)** chưa có (cần DSN) — Lớp 2 còn lại.
- ~~`grid.test.ts` không nằm trong lệnh `npm test`~~ → đã thêm đợt này.
- ~~CI dùng Node 20 trong khi `.nvmrc` = 22~~ → đã đồng bộ về 22 đợt này.
- CLAUDE.md từng ghi `.eslintrc.json` (next/core-web-vitals) — thực tế đã là `eslint.config.mjs` flat config; cần sửa mô tả khi đụng tới.
