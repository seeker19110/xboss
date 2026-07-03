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

## Đợt audit toàn dự án (2026-07)

- **Phân quyền:** bịt 3 route sửa tiến độ thiếu `CAN.editProgress` (`tasks/:id/progress`, `dimensions/:id`, `dimensions/batch` — vai trò chỉ-xem BCH/CĐT/Viewer trước đây sửa được tiến độ); `materials/:id/move` về đúng nhóm quyền Admin/PM/Kỹ sư; `purchase-requests` POST chặn vai trò chỉ-xem.
- **Múi giờ:** thêm `daysFromTodayISO()` (lib/db) — mọi phép cộng/trừ ngày (báo cáo ngày/tuần, lookahead, forecast, notifications) đồng nhất UTC+7 với `todayISO()`, hết lệch 1 ngày lúc 0h–7h sáng; `changed_at::date` (S-curve, báo cáo tuần) ép rõ `AT TIME ZONE 'Asia/Ho_Chi_Minh'`.
- **Validation:** PATCH `tasks/:id` + `tasks/batch` chỉ nhận status slug hợp lệ + ngày `YYYY-MM-DD` + tên không rỗng (422 thay vì 500/dữ liệu rác).
- **Dependency:** override `uuid` ≥ 11.1.1 dưới `exceljs` (GHSA-w5hq-g745-h8pq) — `npm audit` về 0; export Excel verify vẫn hoạt động.

## Đợt audit toàn dự án lần 2 (2026-07, sau đợt trên)

4 agent song song (bảo mật/phân quyền 98 route API, correctness/race-condition, frontend a11y/XSS/hardcode, dependency/CI/migration/test) — kết quả + fix:

- **Bảo mật (Cao):** subcon upload/xoá được biên bản nghiệm thu (`bbnt`) + bản vẽ (`drawing`) của **mọi** work package, không riêng nhóm được giao (thiếu kiểm tương đương `canTouchTask` ở cấp package) → thêm `canTouchPackage()` (lib/auth.ts) + áp vào 4 handler POST/DELETE của `workpackages/:id/bbnt` và `.../drawing`.
- **Correctness (Cao):** `runMaterialSync` (lib/material-sync.ts) ghi snapshot `material_sync` **trước** khi ghi thật lên Google Sheet (bước cuối `clear()`+`writeRows()` là 2 lệnh network tách rời) — nếu lỗi mạng giữa chừng, lần sync sau tưởng đã đồng bộ → tự "pull" giá trị Sheet cũ đè lại DB (âm thầm hoàn tác), hoặc tệ hơn `clear()` xong mà `writeRows()` lỗi thì Sheet bị xoá trắng. Fix: hoãn mọi `saveSnapshot` tới sau khi ghi Sheet thành công; gộp `clear()+writeRows()` thành 1 lệnh ghi duy nhất (đệm dòng rỗng nếu dữ liệu mới ít hơn cũ) — bỏ hẳn `SheetClient.clear()`.
- **Correctness (Trung bình):** `DELETE /api/tasks/:id/approve` (huỷ nghiệm thu) và `PATCH /api/tasks/:id/progress` thiếu `withTransaction` + `SELECT ... FOR UPDATE` trong khi các route anh em (`POST approve`, `dimensions/:id`, `dimensions/batch`) đã có — bọc lại cho đối xứng, tránh 2 request đồng thời tạo audit trùng/ghi đè tiến độ. `recomputeTask`/`recomputePackage` (lib/recompute.ts) thêm `FOR UPDATE` khi đọc row `tasks`/`work_packages` (khoá thật khi chạy trong transaction bao ngoài).
- **Bảo mật (Trung bình):** `PATCH purchase-requests/:id` sửa `note` thiếu check chủ sở hữu (ai đăng nhập cũng sửa được note của người khác) → thêm check `requested_by === user.id` (hoặc Admin/PM), đối xứng với `DELETE` cùng file. Comment ở `search`/`lookahead` claim "subcon chỉ thấy task được giao" nhưng thực tế không lọc — xác minh đây là **chủ đích thiết kế đúng** (subcon cần ngữ cảnh toàn lưới, giống `/api/tasks`) nên sửa lại comment thay vì thêm lọc (tránh không nhất quán UX mà không đóng leak thật nào).
- **Bảo mật (Thấp):** `towers`, `import/excel`, `export/excel` trả 403 thay vì 401 khi chưa đăng nhập (gọi thẳng `CAN.xxx(user?.role)` không tách nhánh 401) → tách rõ.
- **Vận hành:** `lib/push.ts` nuốt im lặng mọi lỗi gửi push ngoài 404/410 (VAPID sai, quota...) → thêm `console.error` (dự án chưa có Sentry, đây là dấu vết duy nhất).
- **CI:** `ci.yml`/`e2e.yml`/`lighthouse-ci.yml` thiếu khai báo `permissions:` (chỉ `secret-scan.yml` có) → thêm `permissions: contents: read` (least-privilege).
- **Frontend (Cao):** nhiều form ghi dữ liệu quan trọng không `try/catch` quanh `fetch` → mất mạng công trường (bối cảnh thật của app) làm nút kẹt "Đang lưu..." vĩnh viễn + không thông báo lỗi. Đã bọc theo mẫu `app/import/page.tsx`: `/password` (đổi mật khẩu), `/materials/purchase-orders` (tạo/nhập kho/xác nhận/huỷ/xoá PO), `/materials/purchase-requests` (tạo/duyệt/xoá PR), `/users` (tạo/đổi role/reset mật khẩu/xoá user), `/admin` (gán người), `/gantt` (thêm/xoá phụ thuộc).
- **Frontend (a11y, Trung bình-Cao):** 13 nút icon-only thiếu `aria-label` ở các trang **chưa từng được audit a11y** (`/approvals`, `/admin`, `/materials/purchase-orders`, `/materials/purchase-requests`) — đa số là nút xoá/đóng modal dữ liệu quan trọng (xoá PO/PR/biên bản nghiệm thu) → đã thêm `aria-label` tiếng Việt mô tả rõ hành động.
- **Tài liệu:** `.env.example` bổ sung `XLSX_FILE` (dùng bởi `npm run db:seed`, có trong `lib/env.ts` nhưng thiếu trong example); `docs/adr/0001-postgres-raw-sql.md` sửa câu "Quyết định" tự mâu thuẫn với ADR-0003 (đã chuyển sang hệ migrate, không còn "ALTER tay").
- **Đã kiểm tra kỹ và KHÔNG có vấn đề:** SQL injection (mọi giá trị qua placeholder `?`), path traversal upload, rate-limit login, `CRON_SECRET`, dependency (`npm audit` = 0), migration idempotency/append-only, `npm run typecheck`/`lint` sạch tại thời điểm audit.

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

- ~~**Rate-limit in-memory**~~ → **đã có** (đợt audit 2026-07): chuyển từ Map trong process sang bảng Postgres `login_rate_limits` (`migrations/0002_login_rate_limit.sql`), đúng khi chạy nhiều instance — upsert atomic qua `ON CONFLICT`, không còn race đọc-rồi-ghi.
- ~~**Không có hệ migrate**~~ → **đã có** (ADR-0003): hệ migrate SQL nhẹ `migrations/*.sql` đánh số + `schema_migrations` + runner `lib/db/migrate.ts` (tự áp lúc boot / `npm run db:migrate`). Baseline = `0001_baseline.sql`. Đổi schema từ nay = thêm file mới (append-only). **Còn lại:** `docs/ERD.md` vẫn cập nhật tay.
- **Nợ a11y tương phản màu (HỆ THỐNG) — đã có audit + backlog: `docs/a11y/contrast-audit.md`:**
  - ~~`/login` + footer toàn cục~~, ~~Dashboard `/` + `AppHeader`~~, ~~tracking grid~~, ~~payments~~, ~~my-tasks~~, ~~materials~~ → **tất cả đã remediate & verify bằng axe** (`e2e/authed/*.spec.ts`, desktop + mobile) — hết trang trong backlog §4 (PR #48/#49 đã đóng nốt payments/my-tasks/materials; doc này trước đó chưa cập nhật theo).
  - Còn lại: siết assertion Lighthouse a11y (`lighthouserc.json`, hiện chỉ đo `/login`) từ `warn` lên `error` — cân nhắc riêng vì ảnh hưởng gate CI toàn cục.
- **Observability (Sentry)** chưa có — cần `SENTRY_DSN` (secret) từ người vận hành trước khi wiring được, không tự thêm được trong đợt audit này.
- ~~`grid.test.ts` không nằm trong lệnh `npm test`~~ → đã thêm đợt này.
- ~~CI dùng Node 20 trong khi `.nvmrc` = 22~~ → đã đồng bộ về 22 đợt này.
- CLAUDE.md từng ghi `.eslintrc.json` (next/core-web-vitals) — thực tế đã là `eslint.config.mjs` flat config; cần sửa mô tả khi đụng tới.
- **Thiếu test cho business logic rủi ro cao nhất** (phát hiện đợt audit lần 2): `recomputeTask`/`recomputePackage` (lib/recompute.ts — chỉ `deriveStatus` thuần có test, phần chạm DB thì không) và `boqTakenBy`/`makeBoq` (lib/boq.ts — mã BOQCODE duy nhất toàn hệ thống, sai là trùng mã nghiệm thu/đặt hàng). Cũng thiếu: `lib/import.ts` (chỉ `toISO` có test, phần nhận diện hàng nhóm/sub-task thì không), `lib/report.ts`, `lib/assignments.ts`. Ưu tiên viết test tích hợp (`TEST_DATABASE_URL` sẵn có) cho `recompute`/`boq` trước.
- **`recomputeTask`/`recomputePackage` vẫn còn vài call site chưa bọc `withTransaction`** (đợt audit lần 2 chỉ fix 2 route bị flag rõ nhất — `tasks/:id/progress`, `DELETE approve` — cho đối xứng với route anh em; các hàm giờ có `FOR UPDATE` nên bọc transaction ở đâu là có tác dụng ở đó). Còn: `tasks/:id/route.ts` PATCH (đổi ngày), `workpackages/:id/dimensions/column/route.ts` DELETE (xoá cột dimension hàng loạt) gọi recompute ngoài transaction — race hẹp, tự hồi phục ở lần ghi kế tiếp, không khẩn.
- **BOQCODE không có ràng buộc DB xuyên bảng** (`lib/boq.ts` — unique index chỉ trong từng bảng `tasks`/`work_packages`/`materials`, kiểm tra trùng là SELECT-rồi-check không transaction) — cửa sổ race hẹp (2 người gán cùng mã vào 2 bảng khác nhau cùng lúc), chấp nhận rủi ro hiện tại; nếu cần chặt hơn: bảng `boq_codes(code UNIQUE)` dùng chung + FK.
- **Nợ a11y trang mới phát hiện** (đợt audit lần 2 — ngoài phạm vi backlog §4 cũ): `/notifications`, `/admin`, `/timeline`, `/gantt`, `/materials/reports`, `/materials/import`, `/materials/purchase-orders`, `/lookahead`, `/report`, `/import` còn `text-zinc-500/600` dùng cho body-text tĩnh (vi phạm WCAG AA theo `docs/a11y/contrast-audit.md`), đặc biệt `/notifications` (24 chỗ) và `/admin` (23 chỗ) mật độ cao nhất. Đã fix riêng 13 nút icon-only thiếu `aria-label` ở `/approvals`, `/admin`, `/materials/purchase-orders`, `/materials/purchase-requests` (đợt này) — phần contrast còn lại theo đúng quy trình dự án (viết `e2e/authed/<trang>.spec.ts`, axe xác nhận) cần phiên riêng, không sửa mù.
- **CI action chưa pin theo SHA** (`gitleaks/gitleaks-action@v2` và các `actions/*@v4`) — rủi ro supply-chain thấp nếu tag bị re-point; cân nhắc pin SHA cho action bên thứ 3.
- **Deploy build đè `.next` ngay trên app đang chạy** (`deploy.sh`: `npm run build` xong mới `pm2 reload`) — trong lúc build + với client còn giữ HTML cũ, chunk `/_next/static/` cũ đã bị xoá → server trả 404/500, người dùng thấy ChunkLoadError thoáng qua (đã vá phía sw.js 2026-07: không cache response lỗi nữa nên hết hỏng _vĩnh viễn_, F5 sau deploy là hết). Triệt để hơn: build ra thư mục tạm rồi swap (hoặc `output: "standalone"` + thư mục release theo version), cần phiên riêng đụng hạ tầng VPS.
