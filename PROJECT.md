# PROJECT.md — XBoss

> Đặc tả dự án — nguồn sự thật về _cái gì cần xây_. Bản này được **viết ngược** từ code thật
> (theo `docs/framework/AP-DUNG-vao-du-an-co-san.md`, Bước 0) cho dự án đã phát triển.
> Đặc tả chi tiết hơn ở `spec.md`; ERD ở `docs/ERD.md`; deploy ở `DEPLOY.md`.

## 1. Vấn đề & Người dùng

- **Vấn đề:** quản lý dự án xây dựng cho dự án **TT AVIO Tháp A**, khởi đầu từ tiến độ thi công MEP/ACMV đang dựa trên file Excel tracking — khó đồng bộ nhiều người, không có lịch sử thay đổi, không cảnh báo trễ hạn, không dùng tốt trên điện thoại tại công trường.
- **Người dùng mục tiêu:** 7 vai trò (`lib/roles.ts`) — `admin`/`pm` (quản trị/QLDA, toàn quyền nghiệp vụ), `engineer` (kỹ sư hiện trường), `subcon` (thầu phụ, chỉ thao tác task được giao), `bch`/`cdt`/`viewer` (chỉ xem + bình luận, phạm vi thương mại khác nhau — xem `spec.md` §4). Kỹ sư/thầu phụ dùng chủ yếu trên **điện thoại tại công trường**; PM xem dashboard trên máy tính.
- **Bằng chứng nhu cầu:** thay thế trực tiếp file Excel tracking đang dùng thật (import được file gốc OGTĐ/OGHL/OGCH/ODNN qua `lib/import.ts`).
- **Khác biệt:** đồng bộ đa người dùng thời gian thực, lịch sử tiến độ, cảnh báo trễ/đến hạn, nghiệm thu 2 bước có gate QA&QC, đồng bộ 2 chiều Google Sheet, PWA offline, đa dự án song song — những thứ Excel không có.

## 2. Phạm vi (đã hoàn thành — mở rộng từ MVP tracking sang toàn chuỗi qua M0–M42)

- **Lõi tracking (MVP gốc):** mô hình WBS `Project → Tower → SheetType → WorkPackage → Task → ProgressDimension`; lưới tracking tick checkbox → tự tính %/trạng thái; sheet động (tạo/sửa/xoá); export Excel; dashboard KPI + S-curve; nghiệm thu 2 bước + biên bản; baseline kế hoạch; thông báo + Web Push; tìm kiếm toàn cục; lý do trễ + Pareto; lookahead 7/14/21 ngày; báo cáo ngày/tuần (email + Telegram); vật tư + đồng bộ Google Sheet 2 chiều; offline queue (PWA).
- **Mở rộng toàn chuỗi (M1–M42, xem `spec.md` §5):** BOQ, QA&QC + gate hold-point, chi phí, hợp đồng/VO/IPC/đấu thầu, mua sắm & NCC, nhật ký/mặt bằng/thiết bị, bản vẽ/RFI/họp/rủi ro/claim/EOT, HSE, đa dự án, khởi động & pháp lý, nhân sự, môi trường & quan trắc, bảo hiểm, bàn giao & bảo hành, chuyển đổi số, tài chính & kế toán.
- **Chủ động không làm:** đa ngôn ngữ (chỉ tiếng Việt); các hạng mục liệt kê ở `spec.md` §5 (CRM bán hàng, HRM/lương độc lập, điểm danh GPS, Map vị trí...).

## 3. Yêu cầu phi chức năng

- **Hiệu năng:** ngân sách Lighthouse CI chính thức (`lighthouserc.json`, đo trên `/login`, 3 lần chạy) — cả 4 category `performance`/`accessibility`/`best-practices`/`seo` đã siết ngưỡng `error` (0.9/0.9/0.9/0.8), chặn merge khi tụt điểm. Mục tiêu định hướng thêm: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.
- **Bảo mật:** **API là ranh giới bảo mật duy nhất** — mọi route gọi `getCurrentUser()` + kiểm quyền `CAN`/`canTouchTask`. Phiên stateless HMAC; rate-limit login; SQL tham số hoá qua `lib/db`. (Không dùng RLS Postgres — quyền ở tầng app.)
- **Accessibility:** mục tiêu WCAG AA cả hai theme; **đã có** axe-core tự động qua Playwright (`e2e/authed/*.spec.ts`, desktop + mobile, mọi trang mới bắt buộc thêm case axe) — quy tắc tương phản + quy trình ground-truth ở `docs/audit.md` §13.
- **Mobile-first:** vùng chạm ~40px, nav cuộn ngang `.scrollbar-none`, bảng dày sticky header + cuộn ngang.
- **Theme:** **dark-first** với cơ chế đảo màu qua biến CSS (`app/globals.css`): các class `html.dark` / `html.light` / `html.kingblue` / `html.darkblue` / `html.navy`. **Không** dùng `styles/theme.css`/`data-theme` của khung (xem ADR nếu cần) — không hard-code hex, không dùng biến thể `dark:`.

## 4. Tech stack, thiết kế dữ liệu & kiến trúc

Xem đầy đủ ở `spec.md` §3 (schema/migrate), §9 (tech stack) và `docs/ERD.md` (bảng/cột/FK) — không lặp lại ở đây để tránh 2 nguồn trôi khỏi nhau. Tóm tắt: Next.js 16.2 + React 19.2 + TypeScript strict + Tailwind 4.3, PostgreSQL qua `pg` raw SQL với hệ migrate nhẹ (ADR-0003, **không** auto-init/ORM/Supabase), ~107 nhóm route trong `app/api/*`, không RLS — kiểm soát quyền ở tầng API (`CAN`/`canTouchTask`, `lib/auth.ts`).

- **Luồng:** client (`'use client'`) → `/api/*` (route handler, `force-dynamic`) → `lib/*` → `lib/db` → Postgres.
- **Chuỗi tính toán:** tick dimension → `recomputeTask` → `deriveStatus` → `recomputePackage` → ghi `task_history` (`lib/recompute.ts`, xem `spec.md` §7).
- **Đồng bộ real-time:** SSE `/api/events?sheet=` (watermark `sheetVersion`), fallback poll `/api/tasks/version`.

## 5. Luồng người dùng chính

1. Đăng nhập (`/login`) → 2. Vào sheet tracking (`/tracking/[slug]`) → 3. Tick checkbox dimension theo ống/căn hộ → 4. Hệ tự tính %/trạng thái, đồng bộ tới mọi người qua SSE → 5. PM xem dashboard/S-curve, duyệt nghiệm thu (`/approvals`), nhận cảnh báo trễ.

## 6. Definition of Done (DoD)

Xem `CLAUDE.md` mục **Quy trình & Definition of Done** và `.github/PULL_REQUEST_TEMPLATE.md`. Tóm tắt: `npm run lint` + `npm run typecheck` xanh · `npm run build` chạy · `npm test` pass · route mới có auth + `force-dynamic` · validate input, không lộ secret · SQL qua `lib/db` placeholder `?` · tự review diff · CI xanh.

## 7. Lộ trình & Mốc thời gian

- **Đã ra mắt nội bộ** (v0.3.0) — đã hoàn tất M0–M42 (tracking lõi + toàn bộ mở rộng chuỗi giá trị xây dựng), đang tinh chỉnh chất lượng/UX liên tục (xem `git log`, `PROGRESS.md`).

## 8. Rủi ro & Giả định còn mở

- `docs/ERD.md` cập nhật tay theo migration append-only — rủi ro trôi khỏi schema thật nếu quên cập nhật cùng PR.
- Một số cụm cross-cutting (vd `/api/costs`) chưa scope hết theo `project_id` như `/api/notifications` đã làm — xem `PROGRESS.md` mục Nợ kỹ thuật.
- `EMBED_HOST_WHITELIST` (M31, BIM/camera viewer) là danh sách domain suy đoán, cần công ty xác nhận domain thật trước khi dùng production.
