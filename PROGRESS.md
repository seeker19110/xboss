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
- **Quyết định Lớp 2 (cần xác nhận người dùng — đợt sau):**
  - Hàng rào tooling: Prettier + Husky + lint-staged + commitlint (thêm dev-dep + hook commit; lưu ý workflow commit tiếng Việt qua `git commit -F`).
  - `lib/env.ts` (Zod) validate biến môi trường lúc khởi động.
  - Lighthouse CI + Playwright E2E (desktop + mobile) + axe a11y; ngưỡng coverage.
  - ~~secret-scan (gitleaks)~~ → đã thêm. **CodeQL bị chặn** (repo private, chưa có GHAS — xem `SECURITY.md`). Sentry observability (cần DSN).
- **KHÔNG đổi (đang chạy tốt, không big-bang):** hệ theme class-based, PWA `sw.js`, test runner `node:test`, ESLint flat config, CSDL raw SQL.

## Quyết định quan trọng (trỏ tới ADR nếu có)
- `docs/adr/0001-postgres-raw-sql.md` — Postgres raw SQL tự quản (không Supabase/ORM/migrate).
- `docs/adr/0002-node-test-runner.md` — `node:test` qua `tsx` thay vì vitest/jest.
- Theme đảo màu qua class CSS (`app/globals.css`) thay vì `styles/theme.css`/`data-theme` của khung.

## Nợ kỹ thuật (chỗ "làm tạm" cần quay lại)
- **Rate-limit in-memory** (`lib/ratelimit.ts`) đếm theo process → sai khi multi-instance; cần chuyển DB/Redis.
- **Không có hệ migrate** — đổi schema bảng đã tồn tại phải `ALTER` tay / script backfill; `docs/ERD.md` cập nhật tay.
- **Chưa có** Lighthouse CI / E2E / axe a11y / env validation / observability (Lớp 2 khung — chờ quyết định).
- ~~`grid.test.ts` không nằm trong lệnh `npm test`~~ → đã thêm đợt này.
- ~~CI dùng Node 20 trong khi `.nvmrc` = 22~~ → đã đồng bộ về 22 đợt này.
- CLAUDE.md từng ghi `.eslintrc.json` (next/core-web-vitals) — thực tế đã là `eslint.config.mjs` flat config; cần sửa mô tả khi đụng tới.
