# Bộ đặc tả nâng cấp XBoss — chi tiết từng module

> **Trạng thái: KẾ HOẠCH — chưa triển khai.** Tổng quan, thứ tự đợt và lý do xem `docs/ke-hoach-nang-cap-he-thong-2026-07.md`. Thư mục này là đặc tả **chi tiết, tự chứa** cho từng module — khi được lệnh "triển khai M<x>", đọc `CLAUDE.md` + file `M<xx>-*.md` tương ứng + mục Quy ước chung dưới đây là đủ ngữ cảnh lập plan.

## Danh mục

| File                          | Module                                                              | Đợt          |
| ----------------------------- | ------------------------------------------------------------------- | ------------ |
| `M00-khung-ui-sidebar.md`     | Khung UI sidebar + title AppHeader + nền tảng UX                    | 1            |
| `M01-boq.md`                  | BOQ đầy đủ                                                          | 1            |
| `M02-chi-phi.md`              | Kiểm soát chi phí + cảnh báo vượt                                   | 1            |
| `M03-qaqc.md`                 | QA&QC + hồ sơ chất lượng (T&C, phiếu YCNT, chuyển bước)             | 2            |
| `M04-ncc-don-hang.md`         | NCC & đơn hàng (cấp phát, xe ra vào)                                | 2            |
| `M05-nhat-ky.md`              | Nhật ký thi công + nhân lực                                         | 2            |
| `M14-mat-bang.md`             | Mặt bằng thi công (work front)                                      | 2            |
| `M15-trang-he.md`             | Trang riêng từng hệ (hub quản lý nhà thầu)                          | 1            |
| `M06-phat-sinh-vo.md`         | Phát sinh / VO                                                      | 3            |
| `M07-dau-thau.md`             | Đấu thầu                                                            | 3            |
| `M08-ban-ve.md`               | Bản vẽ BIM/Shop + biện pháp thi công                                | 3            |
| `M09-dashboard.md`            | Dashboard mở rộng                                                   | 3            |
| `M10-rfi-cong-van.md`         | RFI / công văn                                                      | 4            |
| `M11-hse.md`                  | HSE / an toàn                                                       | 4            |
| `M12-thiet-bi.md`             | Thiết bị/máy móc                                                    | 4            |
| `M13-hop-rui-ro.md`           | Biên bản họp + sổ rủi ro                                            | 4            |
| `M16-hop-dong.md`             | Sổ hợp đồng (nhận thầu/giao thầu/NCC)                               | A (FastCons) |
| `M17-thanh-toan-kl.md`        | Nghiệm thu khối lượng & thanh toán theo đợt (IPC)                   | A (FastCons) |
| `M18-dinh-muc.md`             | Định mức vật tư/nhân công/máy theo hạng mục                         | C (FastCons) |
| `M19-de-xuat-phe-duyet.md`    | Đề xuất & phê duyệt online tổng quát                                | D (FastCons) |
| `M20-kho-ho-so.md`            | Kho hồ sơ dự án (Drive)                                             | B (FastCons) |
| `M21-appshell-ia.md`          | AppShell IA đầy đủ (cây dashboard + hub + quản trị hiển thị)        | N1 (IA)      |
| `M22-da-du-an.md`             | Đa dự án (Portfolio, switcher, scoping `project_id`) — cần ADR-0004 | N3 (IA)      |
| `M23-khoi-dong-phap-ly.md`    | Khởi động & Pháp lý (giấy phép, huy động)                           | B (IA mới)   |
| `M24-nhan-su-to-chuc.md`      | Nhân sự & Tổ chức (chấm công, tổ đội, chứng chỉ, RACI)              | B (IA mới)   |
| `M25-moi-truong-giay-phep.md` | Môi trường & Giấy phép (quan trắc MT, chất thải)                    | H (IA mới)   |
| `M26-quan-he-quan-trac.md`    | Quan hệ & Quan trắc (lún/chuyển vị, cộng đồng)                      | H (IA mới)   |
| `M27-tai-chinh-ke-toan.md`    | Tài chính – Kế toán công trường (dòng tiền, VAT, lương)             | I (IA mới)   |
| `M28-bao-hiem-bao-lanh.md`    | Bảo hiểm & Bảo lãnh (theo dõi hạn)                                  | I (IA mới)   |
| `M29-ban-giao-ket-thuc.md`    | Bàn giao & Kết thúc (T&C, punch list, demob)                        | K (IA mới)   |
| `M30-bao-hanh-bao-tri.md`     | Bảo hành – Bảo trì (O&M)                                            | K (IA mới)   |
| `M31-chuyen-doi-so.md`        | Chuyển đổi số & Công nghệ (CDE, BIM viewer, drone)                  | L (IA mới)   |
| `M32-thiet-ke-thay-doi.md`    | Quản lý thay đổi thiết kế (Design Change — BPTC đã xong qua M08)    | C (IA mới)   |
| `M33-nha-thau-phu.md`         | Hồ sơ năng lực & đánh giá định kỳ Nhà thầu phụ                      | E (IA mới)   |
| `M34-claim.md`                | Claim chi phí & Gia hạn thời gian (EOT)                             | I (IA mới)   |

> M16–M20 là module bổ sung từ đối chiếu brochure FastCons — xem `docs/ke-hoach-fastcons-2026-07.md` (nhóm A/B/C/D thay cho số đợt 1–4 cũ).
>
> **M21–M31** là module của kế hoạch AppShell IA đa dự án — xem `docs/ke-hoach-appshell-full-ia-2026-07.md` (tổng quan + lộ trình N1–N4) + `docs/ke-hoach-ia-chi-tiet-2026-07.md` (bóc tách từng dashboard) + **ADR-0004** (nền đa dự án, đọc trước M22). Thứ tự đề xuất: M21 (mở khoá điều hướng, rủi ro thấp) → M22 (nền đa dự án) → đào sâu dashboard đã có → dashboard mới theo nhu cầu PM (M28 nhỏ/giá trị cao → M23 → M25 → M27 → M29 → còn lại).

## Quy ước chung (áp cho MỌI module — không lặp lại trong từng file)

### Backend

- **Migration**: mỗi module 1+ file `migrations/000N_<ten>.sql` append-only, idempotent (`IF NOT EXISTS`); cập nhật `docs/ERD.md` cùng PR. Không sửa file migration đã áp production (ADR-0003).
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
