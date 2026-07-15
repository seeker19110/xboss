# Bộ đặc tả nâng cấp XBoss — theo nhóm module (đã triển khai xong M0–M42)

> **Trạng thái: ĐÃ TRIỂN KHAI XONG toàn bộ M0–M42.** File `M<xx>-*.md` gốc (viết TRƯỚC khi code, dùng để giao việc subagent) đã được **gộp theo nhóm nghiệp vụ** thành các file `G<nn>-*.md` dưới đây — cô đọng còn lại phần tra cứu (schema/API/quyết định), bỏ phần "Chia PR"/kế hoạch giao việc không còn cần thiết sau khi đã code xong. Lịch sử PR/quyết định chi tiết từng đợt vẫn nằm ở `PROGRESS.md`.
>
> Khi cần đặc tả cho **module mới** (M43 trở đi), viết file `M<xx>-*.md` riêng theo khung ở mục Quy ước chung bên dưới TRƯỚC khi code — chỉ gộp vào `G<nn>` cùng nhóm sau khi đã triển khai xong.

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

## Đặc tả chờ triển khai — đợt "lên tầm ERP" (M43–M52, viết 07/2026)

Xuất phát từ `docs/nghien-cuu-nang-cap-erp-2026-07.md` (nghiên cứu 9 trục + bảng điểm). Thứ tự ưu tiên P0 → P3; số migration trong đặc tả (0049+) là **tạm** — kiểm tra lại số thứ tự thực tế lúc code (bài học M32/M33).

| File                         | Hạng mục                                                                 | Ưu tiên | Trục điểm          | Phụ thuộc            |
| ---------------------------- | ------------------------------------------------------------------------ | ------- | ------------------ | -------------------- |
| `M43-audit-trail.md`         | Ngữ cảnh request + audit trail toàn hệ (trigger + SET LOCAL)             | P0      | Audit 2.0→3.5      | —                    |
| `M44-van-hanh.md`            | Backup/DR, health, structured logging, Sentry, staging                   | P0      | Vận hành 2.5→4.0   | PR3 cần M43 PR1      |
| `M45-chat-luong-du-lieu.md`  | Money helper, CHECK, ERD tự sinh, soft-delete, test bất biến scope       | P0      | Dữ liệu 3.5→4.0    | —                    |
| `M46-approval-engine.md`     | Phê duyệt nhiều cấp cấu hình được (ngưỡng, SLA, SoD)                     | P1      | Workflow 2.0→3.5   | nên sau M43 PR1      |
| `M47-evm-bi.md`              | EVM (SPI/CPI/EAC), materialized views, saved reports, alert rules        | P1      | BI 3.0→4.0         | —                    |
| `M48-tich-hop-tai-chinh.md`  | Khung integrations, adapter kế toán, hoá đơn điện tử NĐ 70/2025          | P1      | Tích hợp 2.0→3.5   | PR2 cần M46          |
| `M49-api-mo-sso.md`          | API keys `/api/v1`, webhook ra ngoài, SSO OIDC                           | P3      | Tích hợp →4.0      | webhook lợi từ M46   |
| `M50-phan-quyen-nang-cao.md` | Override quyền trong DB, quyền theo trường, báo cáo SoD                  | P2      | Phân quyền 3.0→4.0 | audit từ M43         |
| `M51-da-du-an-rls.md`        | RLS phòng tuyến 2 (kèm ADR-0005), template dự án, organizations          | P2      | Đa dự án 3.5→4.5   | M43 PR1, M45 PR5     |
| `M52-mo-rong-cau-hinh.md`    | code_lists, custom fields, module registry, feature flags, tách tracking | P2–P3   | Kiến trúc 3.0→4.0  | registry trước flags |

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

- **Theme**: dark-first, thang `zinc`, accent `-300/-400`, KHÔNG `dark:`/hex (cơ chế đảo màu `html.light` trong `app/globals.css`); màu trạng thái đồng bộ `lib/status.ts`. Body-text tĩnh không dùng `text-zinc-500/600` (WCAG — xem `docs/a11y/contrast-audit.md`).
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

### Quy trình mỗi PR

Theo `CLAUDE.md` (DoD): lint + typecheck + test + build xanh → tự review diff → commit tiếng Việt conventional → push → PR draft. Mỗi module chia PR như mục "Chia PR" trong file đặc tả; cập nhật `PROGRESS.md` khi xong module.
