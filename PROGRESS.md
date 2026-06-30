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

- **PHIÊN TỚI — Workflow audit tương phản màu (a11y) toàn UI:** fan-out đọc 42 file UI (18 component + 24 page) đối chiếu WCAG AA → backlog remediation có thứ tự cho ~399 `text-zinc-500/600` + ~43 nút accent chữ trắng. Bao gồm **audit lại** phần `/login` + footer đã sửa ở PR #43. Ground-truth = mở rộng axe E2E sang từng trang (code-audit chỉ là ứng viên).
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
- **Không có hệ migrate** — đổi schema bảng đã tồn tại phải `ALTER` tay / script backfill; `docs/ERD.md` cập nhật tay.
- **Nợ a11y tương phản màu (HỆ THỐNG, đang dọn dần):**
  - ~~`/login` + footer toàn cục (3 lỗi serious)~~ → **đã sửa & verify bằng axe**: `/login` (subtitle zinc-500→zinc-400, nút emerald-600→emerald-700) + footer layout (zinc-600/500→zinc-400/200). **Rule `color-contrast` đã bật lại** trong `e2e/login.spec.ts` → giờ là cổng cứng (E2E sẽ đỏ nếu tái phạm).
  - **Còn lại (app-wide):** ~399 chỗ `text-zinc-500/600` + ~43 nút `bg-emerald-600/500` (và amber/sky/blue-500/600 chữ trắng) ở các trang khác. Dọn dần **theo từng trang** khi mở rộng axe E2E (axe là ground-truth) — không sửa hàng loạt mù (tránh big-bang).
  - Sau khi phủ axe thêm trang: siết assertion Lighthouse a11y từ `warn` lên `error`.
- **Observability (Sentry)** chưa có (cần DSN) — Lớp 2 còn lại.
- ~~`grid.test.ts` không nằm trong lệnh `npm test`~~ → đã thêm đợt này.
- ~~CI dùng Node 20 trong khi `.nvmrc` = 22~~ → đã đồng bộ về 22 đợt này.
- CLAUDE.md từng ghi `.eslintrc.json` (next/core-web-vitals) — thực tế đã là `eslint.config.mjs` flat config; cần sửa mô tả khi đụng tới.
