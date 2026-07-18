# Bộ đặc tả nâng cấp XBoss — theo nhóm module (đã triển khai xong M0–M52)

> **Trạng thái (cập nhật 2026-07-18): ĐÃ TRIỂN KHAI XONG M0–M52 (đợt "lên tầm ERP" P0–P2) + M56 (TOTP self-service PR1 + bắt buộc 2FA theo vai trò PR2).** File `M<xx>-*.md` gốc của M0–M42 (viết TRƯỚC khi code, dùng để giao việc subagent) đã được **gộp theo nhóm nghiệp vụ** thành các file `G<nn>-*.md` dưới đây — cô đọng còn lại phần tra cứu (schema/API/quyết định), bỏ phần "Chia PR"/kế hoạch giao việc không còn cần thiết sau khi đã code xong. Đặc tả M43–M52 giữ nguyên file `M<xx>-*.md` (chưa gộp). Lịch sử PR/quyết định chi tiết từng đợt vẫn nằm ở `PROGRESS.md`.
>
> **Chưa triển khai (theo thứ tự thi hành đã chốt):** M55 → M58 PR3 → M54 GĐ1 → M59 — xem bảng "Đặc tả chờ triển khai" bên dưới (M53 toàn bộ 4 PR, M57 PR1+PR2, M51 GĐ0, M56 toàn bộ 2 PR đã xong). Một số việc **hoãn có chủ đích** (M49 PR3 SSO OIDC merge nhưng flag tắt, M60 major deps) — xem `PROGRESS.md` mục "Việc tạm hoãn".
>
> Khi cần đặc tả cho **module mới**, viết file `M<xx>-*.md` riêng theo khung ở mục Quy ước chung bên dưới TRƯỚC khi code — chỉ gộp vào `G<nn>` cùng nhóm sau khi đã triển khai xong.

## Danh mục (nhóm → module gộp bên trong)

| File                        | Nhóm nghiệp vụ                       | Module gộp bên trong                            |
| --------------------------- | ------------------------------------ | ----------------------------------------------- |
| `G00-nen-tang.md`           | Nền tảng                             | M00 (AppShell), M21 (IA đầy đủ), M22 (đa dự án) |
| `G01-tien-do-boq.md`        | Tiến độ & BOQ                        | M01, M09, M15, M35, M36                         |
| `G02-chi-phi-hop-dong.md`   | Chi phí & Hợp đồng                   | M02, M06, M07, M16, M17, M27                    |
| `G03-mua-sam-vat-tu.md`     | Mua sắm & Vật tư                     | M04, M18, M33                                   |
| `G04-chat-luong-an-toan.md` | Chất lượng & An toàn                 | M03, M11                                        |
| `G05-hien-truong.md`        | Hiện trường                          | M05, M12, M14                                   |
| `G06-ban-ve-ho-so.md`       | Bản vẽ & Hồ sơ                       | M08, M10, M13, M19, M20, M32, M34               |
| `G07-khoi-dong-to-chuc.md`  | Khởi động & Tổ chức                  | M23, M24                                        |
| `G08-moi-truong-rui-ro.md`  | Môi trường & Rủi ro                  | M25, M26                                        |
| `G09-ban-giao-van-hanh.md`  | Bàn giao & Vận hành                  | M28, M29, M30                                   |
| `G10-cong-nghe.md`          | Công nghệ                            | M31                                             |
| `G11-uiux.md`               | UI/UX xuyên suốt (không route riêng) | M37, M38, M39, M40, M41, M42                    |

> Bối cảnh lịch sử các đợt (FastCons nhóm A-E, AppShell IA N1-N4, UX 2026-07...) không còn cần thiết để tra cứu module đã xong — xem `docs/ke-hoach-*.md` nếu cần đối chiếu quyết định gốc.

## Đợt "lên tầm ERP" (M43–M52, viết 07/2026) — ĐÃ TRIỂN KHAI XONG

Xuất phát từ `docs/nghien-cuu-nang-cap-erp-2026-07.md` (nghiên cứu 9 trục + bảng điểm). Thứ tự ưu tiên P0 → P3; số migration thực tế đã dùng khác số tạm trong đặc tả (bài học M32/M33). **Toàn bộ M43–M52 đã merge vào `main`** — cột dưới ghi migration/điểm chạm thực tế để tra cứu.

| File                         | Hạng mục                                                                 | Trạng thái                                             | Migration/điểm chạm thực tế                                                                          |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `M43-audit-trail.md`         | Ngữ cảnh request + audit trail toàn hệ (trigger + SET LOCAL)             | ✅ xong                                                | `0049_audit_log.sql`, `0059_sso_audit.sql`                                                           |
| `M44-van-hanh.md`            | Backup/DR, health, structured logging, Sentry, staging                   | ✅ xong                                                | `app/api/health`, Sentry scaffold (chờ ops đặt DSN)                                                  |
| `M45-chat-luong-du-lieu.md`  | Money helper, CHECK, ERD tự sinh, soft-delete, test bất biến scope       | ✅ xong                                                | `lib/money.ts`, `0050`/`0051_checks`/`0052_soft_delete`                                              |
| `M46-approval-engine.md`     | Phê duyệt nhiều cấp cấu hình được (ngưỡng, SLA, SoD)                     | ✅ xong                                                | `0053_approvals.sql`                                                                                 |
| `M47-evm-bi.md`              | EVM (SPI/CPI/EAC), materialized views, saved reports, alert rules        | ✅ xong                                                | `0054_saved_reports`/`0055_matviews`/`0056_alert_rules`                                              |
| `M48-tich-hop-tai-chinh.md`  | Khung integrations, adapter kế toán, hoá đơn điện tử NĐ 70/2025          | ✅ xong                                                | `0057_integrations.sql`                                                                              |
| `M49-api-mo-sso.md`          | API keys `/api/v1`, webhook ra ngoài, SSO OIDC                           | ⚠️ PR1/PR2 xong; PR3 SSO OIDC merge nhưng **flag tắt** | `app/api/v1`, `0064_webhooks`/`0061_api_keys`                                                        |
| `M50-phan-quyen-nang-cao.md` | Override quyền trong DB, quyền theo trường, báo cáo SoD                  | ✅ xong                                                | `0058_role_permissions.sql`, `lib/permissions.ts`                                                    |
| `M51-da-du-an-rls.md`        | RLS phòng tuyến 2 (kèm ADR-0005), template dự án, organizations          | ⚠️ **GĐ0 xong (PR1/PR2/PR4, #256), nợ "khoá cửa"**     | `0069_rls.sql`/`0070_organizations.sql`, `docs/adr/0005-rls.md`, `lib/db/index.ts::withProjectScope` |
| `M52-mo-rong-cau-hinh.md`    | code_lists, custom fields, module registry, feature flags, tách tracking | ✅ xong                                                | `0060_code_lists`/`0062_custom_fields`/`0063_feature_flags`                                          |

## Đặc tả chờ triển khai — đợt Scale/SaaS/BI + bổ sung (M53–M59 viết 07/2026, M61 viết 2026-07-18)

Từ phân tích so XBoss với ERP chuyên nghiệp (`PROGRESS.md`). **Thứ tự thi hành đã chốt (cập nhật 2026-07-18, rà lại code thật sau khi merge #252):**

1. ~~**M53 (4 PR) song song M57 PR1**~~ → **cả 4 PR của M53 + PR1 của M57 đã xong** (PR1-3 2026-07-18 merge `main` qua PR #252, commit `cefda6a`; **PR4 xong 2026-07-18 tiếp theo, nhánh `claude/plan-md-30cmcp`** — audit state in-process + `DEPLOY.md` mục "Chạy nhiều instance", xem `PROGRESS.md`).
2. ~~**M56 PR2** — bắt buộc 2FA theo vai trò~~ → **đã xong** (2026-07-18, nhánh `claude/feat-m56-pr2-bat-buoc-2fa`, KHÔNG migration — dùng `code_lists`; chặn ở `proxy.ts` Node Middleware, cờ `mustSetup2fa` trong token 5 phần).
3. ~~**M61** — override quyền theo dự án~~ → **đã xong** (2026-07-18, PR1 #248 + PR2 #249, đã merge vào `main`).
4. ~~**M51 (GĐ0 của M54)** — RLS theo dự án + `organizations`~~ → **GĐ0 xong** (2026-07-18, PR #256, đã merge vào `main`; nợ bước "khoá cửa" PR2, xem `PROGRESS.md`).
5. **M55** — BI/Metabase (cần dữ liệu ổn định sau RLS để view whitelist đúng). Việc kế tiếp.
6. **M58 PR3** — wire ảnh/nhật ký vào khung offline queue (PR1+PR2 đã xong).
7. **M54 GĐ1** — multi-tenant SaaS (phụ thuộc cứng M51).
8. **M59** — histogram tài nguyên (không migration, chỉ tổng hợp — làm cuối, mọi bảng nguồn đã chốt).

M57 PR2 (extract text PDF) — đã làm 2026-07-18 (xem bảng dưới), KHÔNG nằm trong hàng đợi thứ tự trên (độc lập với M55/M58/M54/M59).

**LUẬT trước khi thi hành bất kỳ hạng mục nào:** kiểm tra trên code thật xem hạng mục đã được làm chưa (grep điểm chạm chính trong đặc tả: migration/bảng, hàm `lib/*`, route API, trang UI) — trạng thái trong bảng trên có thể lỗi thời so với code (đã xảy ra 2026-07-17 VÀ lại 2026-07-18: README vẫn ghi M53/M57 PR1 "chưa" dù đã merge từ trước — luôn grep lại, đừng tin bảng trạng thái). Đã có rồi → cập nhật bảng này + `PROGRESS.md`, không code lại.

**LUẬT số migration (bài học 2026-07-18):** trước khi giao/code bất kỳ migration mới nào, chạy `ls migrations | sort -V | tail -3` để lấy số thật mới nhất — không suy đoán/copy số từ đặc tả hay kế hoạch cũ. PR #265 và PR #266 (2 phiên chạy song song) cùng chọn số `0071` cho 2 migration khác nhau vì không đồng bộ `main` ngay trước lúc code → chặn CI mọi PR (`check-migration-numbers.ts`) đến khi vá bằng PR #269 (đổi `0071_material_tx_idempotency.sql` → `0072_material_tx_idempotency.sql`). Số migration tiếp theo cần dùng tại thời điểm cập nhật mục này: **`0073`** — luôn xác nhận lại bằng lệnh trên, không tin số ghi trong tài liệu.

| File                            | Hạng mục                                                                                        | Trạng thái                                          | Ghi chú                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `M53-scale-headroom.md`         | Đo tải → watermark SSE O(1) thay aggregate JOIN 3s/client, pool env, audit cluster-ready        | ✅ xong cả 4 PR                                     | PR1-3 merge #252 (`cefda6a`, 2026-07-18); PR4 xong 2026-07-18 (`lib/sync-locks.ts`, TTL `lib/code-lists.ts`/`lib/feature-flags.ts`, `DEPLOY.md`)                                                                                                                                                 |
| `M56-2fa-totp.md`               | TOTP RFC 6238 + recovery codes; PR2 bắt buộc theo vai trò                                       | ✅ xong cả 2 PR                                     | PR1 `0065_totp.sql`; PR2 (nhánh `claude/feat-m56-pr2-bat-buoc-2fa`) KHÔNG migration — cờ `mustSetup2fa` trong token phiên 5 phần, chặn ở `proxy.ts` (Node Middleware) 403 mọi API trừ `/api/auth/*`; domain `require_2fa_roles` trong `code_lists`                                              |
| `M61-phan-quyen-theo-du-an.md`  | Override quyền theo dự án (`role_permissions.project_id`, đóng nợ M52 PR4 module `permissions`) | ✅ xong                                             | `0066_role_permissions_project.sql`, `lib/permissions.ts`/`lib/auth.ts`, UI `/admin/permissions` + export snapshot (PR2)                                                                                                                                                                         |
| `M51-da-du-an-rls.md`           | RLS theo dự án + `organizations` (GĐ0 của M54)                                                  | ⚠️ GĐ0 xong (PR #256, đã merge)                     | Nợ: khoá cửa PR2 sau ~1 tuần theo dõi production, xem `PROGRESS.md`                                                                                                                                                                                                                              |
| `M55-bi-metabase.md`            | Schema `bi` (view whitelist cột) + role `xboss_bi` chỉ-đọc cho Metabase                         | ❌ chưa                                             | Metabase không bao giờ chạm `public`                                                                                                                                                                                                                                                             |
| `M57-tim-kiem-toan-van.md`      | FTS GIN index + `unaccent` (thay ILIKE inline hiện tại)                                         | ✅ PR1+PR2 xong                                     | PR1: merge #252 (`cefda6a`, 2026-07-18) — `lib/search.ts`, `migrations/0068_fts.sql`. PR2 (2026-07-18, nhánh `claude/feat-m57-pr2-extract-pdf`): `lib/pdf-extract.ts` (pdf-parse, 10 trang đầu + timeout 5s), `migrations/0071_extracted_text.sql` (cột `extracted_text` trên `task_documents`/`contract_documents`/`project_documents` + index GIN cho `project_documents` — 2 bảng còn lại chưa có nguồn search tương ứng trong registry, xem `PROGRESS.md`)                                                                                                                                                       |
| `M58-qr-offline-hien-truong.md` | QR tem in `/r/<kind>/<id>` + offline queue IndexedDB ảnh/nhật ký                                | ⚠️ PR1 + PR2 xong; **PR3 (wire ảnh/nhật ký) chưa** | PR1: resolve `/r/[kind]/[id]` + tem in. PR2: `app/components/offlineQueue/` (logic/store/image + hook + badge AppHeader), di trú êm từ localStorage, quota ảnh 50MB, Background Sync. PR3: chỉ tick tracking đã wire (`useTrackingData.ts`), ảnh (`task_photos`)/nhật ký (`app/diary`) chưa dùng |
| `M54-multi-tenant-saas.md`      | Trục `org_id` + RLS org + object storage uploads (GĐ1)                                          | ❌ chưa                                             | Phụ thuộc cứng M51                                                                                                                                                                                                                                                                               |
| `M59-tai-nguyen.md`             | Histogram nhân lực/thiết bị kế hoạch-vs-thực-tế, cảnh báo gán chồng                             | ❌ chưa                                             | Không migration, chỉ tổng hợp                                                                                                                                                                                                                                                                    |

## Hoãn có chủ đích (không tự nhặt lại — xem `PROGRESS.md`)

- `M60-nang-major-deps.md` — nâng TS 7 / ESLint 10 / Node 26, chờ điều kiện kích hoạt từng PR.
- M49 PR3 SSO OIDC — merge ở trạng thái flag tắt, chờ xác minh tay end-to-end với IdP thật.

## Quy ước chung (áp cho MỌI module — không lặp lại trong từng file)

### Backend

- **Migration**: mỗi module 1+ file `migrations/000N_<ten>.sql` append-only, idempotent (`IF NOT EXISTS`); chạy `npm run gen:erd` cùng PR (ERD sinh tự động, CI kiểm khớp schema). Không sửa file migration đã áp production (ADR-0003).
- **API route** (pattern chuẩn `app/api/dashboard/route.ts`): `export const dynamic = "force-dynamic"`; `getCurrentUser()` → 401 khi chưa đăng nhập → check quyền qua `CAN`/`canTouchTask`/`canTouchPackage` → 403; validate input bằng zod (xem `lib/env.ts` style) hoặc check thủ công → 422; SQL qua helper `lib/db` placeholder `?`, không nối chuỗi.
- **Quyền**: 7 vai trò (`lib/roles.ts`): `admin | pm | engineer | subcon` (thao tác) + `bch | cdt | viewer` (chỉ xem — `VIEW_ONLY_ROLES`). Thêm quyền mới = thêm hàm vào map `CAN` (`lib/auth.ts:158`), không check role rải rác.
- **Thao tác ghi nhiều bước**: bọc `withTransaction` + `SELECT ... FOR UPDATE` (pattern `POST /api/tasks/:id/approve`).
- **Upload file**: theo pattern `task_documents`/`lib/photos.ts` — server sinh tên file, whitelist mime, giới hạn dung lượng, lưu `data/uploads/`, route GET stream có check quyền.
- **Notification**: thêm loại mới vào cơ chế đồng bộ on-fetch của `/api/notifications` (dedup + tự dọn khi hết điều kiện — xem `material_over`); gửi push qua `lib/push.ts` (no-op khi thiếu VAPID).
- **Audit**: thao tác nghiệp vụ quan trọng ghi lịch sử (pattern `task_history`/`assignment_log`).

### Test

- File test import `tests/setup.ts` **đầu tiên**; logic thuần → unit test; chạm DB → integration với `TEST_DATABASE_URL` (tự skip khi thiếu, pattern `tests/recompute.test.ts`). Thêm file test mới vào lệnh `npm test` trong `package.json`.

### UI/UX (nền tảng trải nghiệm — mọi trang mới PHẢI theo)

- **Theme**: dark-first, thang `zinc`, accent `-300/-400`, KHÔNG `dark:`/hex (cơ chế đảo màu `html.light` trong `app/globals.css`); màu trạng thái đồng bộ `lib/status.ts`. Body-text tĩnh không dùng `text-zinc-500/600` (WCAG — xem `docs/audit.md` §13).
- **Vỏ thẻ & bo góc (chuẩn hoá)**: base thẻ `bg-zinc-900 border border-zinc-800 rounded-xl`; padding theo tier — stat tile dày `p-3`, thẻ nội dung `p-4`, panel cấp trang/section lớn/hero `p-5` (không dùng `p-6`). Bo góc: `rounded-lg` cho control/nút/input/select, `rounded-xl` cho thẻ + cụm segment/tab-bar, `rounded-full` cho pill/badge/avatar.
- **Nút danger (chuẩn hoá, 2 mẫu — không tạo biến thể thứ 3)**: đặc (nút text, hành động phá huỷ rõ ràng như "Xoá"/"Từ chối", mẫu tham chiếu `app/components/dialogs.tsx:151`) dùng `bg-red-700 hover:bg-red-600 text-on-accent`; ghost (icon-only trong hàng bảng/toolbar/modal phụ) dùng `text-zinc-500 hover:text-red-300 hover:bg-red-950/40`. Chọn mẫu theo ngữ cảnh: CTA độc lập/rõ ràng → đặc; icon nhỏ lẫn trong hàng/toolbar → ghost.
- **Thang typography (chuẩn hoá, M37 PR2.1)**: dùng đúng recipe Tailwind theo vai trò, không tạo class CSS mới.

  | Vai trò            | Recipe                                                         | Ghi chú                                               |
  | ------------------ | -------------------------------------------------------------- | ----------------------------------------------------- |
  | Tiêu đề trang (h1) | `text-lg font-semibold text-zinc-50`                           | chỉ nâng tiêu đề trang cấp cao nhất                   |
  | Tiêu đề mục (h2)   | `text-base font-semibold text-zinc-100`                        | chỉ áp cho header section-level                       |
  | Tiêu đề thẻ (h3)   | `text-sm font-semibold`                                        | giữ nguyên                                            |
  | Eyebrow/kicker     | `text-xs font-semibold uppercase tracking-wider text-zinc-400` | chuẩn `tracking-wider` (không dùng `tracking-widest`) |
  | Body/ô bảng        | `text-sm`                                                      | giữ nguyên                                            |
  | Phụ/caption        | `text-xs text-zinc-400`                                        | giữ nguyên                                            |
  | Micro              | `text-[11px]`                                                  | giữ nguyên                                            |
  | Số liệu lớn (stat) | `text-2xl/3xl/4xl font-bold`                                   | giữ nguyên                                            |

- **Component tái dùng**: `Skeleton` (loading — khối cỡ thẻ dùng `rounded-xl` khớp thẻ thật), `StatusBadge` (chip trạng thái task, gom `STATUS_CLS`+nhãn), `dialogs.tsx` (modal xác nhận), `EditableText`, `SpreadsheetGrid` (lưới), icon `lucide-react`, chart `recharts`. Tạo component mới chỉ khi không có sẵn.
- **Trạng thái bắt buộc mỗi trang**: loading skeleton (không màn trắng) → rỗng (thông điệp tiếng Việt + nút hành động tạo mới) → lỗi (thông điệp + nút thử lại) → có dữ liệu. Mọi `fetch` ghi dữ liệu bọc `try/catch` + toast/thông báo lỗi + nút không kẹt "Đang lưu..." (bài học audit 2026-07).
- **Bảng dữ liệu dày**: header sticky, cuộn ngang trong container riêng, cột mã/tên ghim trái khi cần; sort/filter phía client cho <1k dòng.
- **Form**: label rõ, validate hiển thị theo field, submit disable khi đang gửi, Enter submit được; ngày dùng `<input type="date">` (khớp chuỗi `YYYY-MM-DD` của lớp DB).
- **Mobile công trường**: vùng chạm ≥40px, thao tác chính với được bằng ngón cái, form quan trọng hoạt động khi offline nếu thuộc luồng đã có offline queue.
- **A11y**: nút icon-only có `aria-label` tiếng Việt; select có tên; focus ring rõ; không truyền tin chỉ bằng màu. Trang mới thêm `e2e/authed/<trang>.spec.ts` chạy axe (desktop + mobile) theo pattern sẵn có.
- **Điều hướng**: trang mới thêm mục vào sidebar (M0) đúng nhóm nghiệp vụ + title/breadcrumb topbar; route động nhớ đăng ký loại trừ cache trong `public/sw.js` nếu cần (tăng version `CACHE`).
- **Module registry (M52 PR3)**: module mới **bắt buộc** thêm 1 entry vào `MODULES` (`lib/modules.ts`) khai báo mọi điểm chạm xuyên suốt (nav sidebar, `permKeys`, `notificationTypes`, `swExclude`, `routePrefix`) — nguồn tra cứu tập trung thay cho việc sửa rời rạc ≥4 nơi. Khai `swExclude` phải khớp `public/sw.js` (cổng CI `scripts/check-sw-exclude.ts` kiểm).

### Quy trình mỗi PR

Theo `CLAUDE.md` (DoD): lint + typecheck + test + build xanh → tự review diff → commit tiếng Việt conventional → push → PR draft. Mỗi module chia PR như mục "Chia PR" trong file đặc tả; cập nhật `PROGRESS.md` khi xong module.
