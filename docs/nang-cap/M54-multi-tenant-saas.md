# M54 — Lộ trình SaaS multi-tenant: trục `org_id`, cô lập tenant, provisioning (P2)

> **Quyết định định hướng** (người dùng chốt 2026-07-17): XBoss đi lộ trình SaaS — nhiều **công ty (tenant)** dùng chung 1 hệ. Đây là thay đổi mô hình dữ liệu lớn nhất từ đầu dự án, làm NHIỀU GIAI ĐOẠN, mỗi giai đoạn tự đứng được và có giá trị ngay cả khi dừng giữa chừng.
>
> **Phụ thuộc cứng**: M51 PR1+PR2 (RLS + `withProjectScope` — CHƯA triển khai, phải làm TRƯỚC vì RLS theo dự án là bản nháp kỹ thuật của RLS theo tenant, cùng cơ chế GUC `set_config` đã có sẵn trong `withTransaction` từ M43) và M51 PR4 (bảng `organizations` — chưa có migration nào tạo). M53 (scale headroom) nên xong trước để có nền đo tải. **Object storage cho `data/uploads/` chuyển từ "hoãn" (M53) thành BẮT BUỘC ở giai đoạn 2.**
>
> **Kiểm kê nền tảng** (2026-07-17, quét 63 migration): 137 bảng — ~45 bảng có `project_id` trực tiếp; phần lớn còn lại nối về project qua chuỗi `tasks→work_packages→sheet_types→towers→projects`; nhóm bảng TOÀN CỤC không nối được về project (phải gắn `org_id` trực tiếp): `users`, `suppliers`, `role_permissions`, `code_lists`(phần global), `boq_codes`, `push_subscriptions`, `notifications`(theo user), `login_rate_limits`(theo IP+email — giữ toàn cục, chống brute-force xuyên tenant là đúng), `sync_locks`/`schema_migrations`(hạ tầng — giữ toàn cục).
>
> **Bẫy lớn nhất đã xác định**: `boq_codes` (0029) là registry mã DUY NHẤT TOÀN HỆ — 2 tenant chắc chắn trùng mã BOQ (cùng dùng chuẩn mã ngành). PK phải đổi `(code)` → `(org_id, code)` kèm sửa trigger `boq_codes_sync()` + `boqTakenBy` (`lib/boq.ts` — vùng rủi ro cao `docs/audit.md`).

## Giai đoạn 0 — Thi hành M51 PR1/PR2/PR4 (đặc tả đã có sẵn, không viết lại ở đây)

Theo đúng `docs/nang-cap/M51-da-du-an-rls.md`: RLS nhóm bảng tài chính + role `xboss_app` + `withProjectScope` + bảng `organizations` (PR4). Kết quả giai đoạn 0: cơ chế GUC→policy chạy thật trên production, đội đã có kinh nghiệm vận hành RLS trước khi mở rộng sang trục org. Ước lượng: 3 PR theo M51.

## Giai đoạn 1 — Trục `org_id` + cô lập dữ liệu (kỹ thuật thuần, chưa có signup/billing)

### PR1 — Migration trục org (`route: complex`, BẮT BUỘC qua staging — đụng dữ liệu)

- `organizations` (từ M51 PR4) thêm cột: `slug TEXT UNIQUE` (định danh tenant), `status TEXT DEFAULT 'active'`, `plan TEXT`, `created_at`.
- Gắn `org_id INT NOT NULL REFERENCES organizations(id)` vào nhóm bảng GỐC (không phải 137 bảng — chỉ bảng không nối được về project): `users`, `projects`, `suppliers`, `code_lists`, `role_permissions` (override quyền là per-tenant), `custom_field_defs`, `feature_flags`, `alert_rules`, `approval_flows`, `api_keys`, `webhooks`, `integrations`, `saved_reports`, `boq_codes`. Backfill: tạo org mặc định id=1 từ dữ liệu hiện có, mọi dòng cũ `org_id=1` — script backfill idempotent, dry-run trước (`npm run db:migrate -- --dry-run`), chạy staging trước production theo DoD.
- `boq_codes`: PK mới `(org_id, code)`; trigger `boq_codes_sync()` đọc org qua chuỗi JOIN của từng bảng nguồn (tasks/work_packages/materials/boq_items → project → org); `lib/boq.ts::boqTakenBy` thêm tham số `orgId`. UNIQUE các bảng khác cùng lớp: `projects.code`, `suppliers` định danh, `users.email` → đổi thành UNIQUE `(org_id, ...)` — **quyết định cần chốt riêng cho `users.email`**: 1 email dùng ở 2 tenant? Đề xuất: giữ email UNIQUE toàn cục ở giai đoạn 1 (đơn giản, login không cần chọn tenant), nới sau nếu có nhu cầu thật.
- Các bảng có `project_id`: KHÔNG thêm `org_id` (suy ra qua project — tránh denormalize 137 bảng và lớp bug đồng bộ 2 cột).

### PR2 — Auth + context org (`route: complex` — chạm `lib/auth.ts`, vùng rủi ro cao)

- Session cookie thêm org: `userId.orgId.exp.HMAC` (bump version cookie, session cũ hết hạn tự nhiên → user login lại 1 lần). `getCurrentUser()` trả kèm `orgId`; `request-context` + `withTransaction` set thêm GUC `app.org_id` (khuôn có sẵn M43).
- `getCurrentProjectId` xác nhận project thuộc org của user (chặn đổi `current_project` sang project tenant khác bằng đoán ID).
- Mọi query trên nhóm bảng gốc PR1 thêm điều kiện `org_id = ?` — quét bằng test bất biến mở rộng từ `tests/project-scope-invariant.test.ts` (pattern đã có): route GET+SELECT chạm bảng nhóm gốc mà thiếu `org_id` → đỏ.

### PR3 — RLS theo org (`route: spec` — cùng khuôn M51 PR1, đặc tả kín sau khi PR1/PR2 chốt)

- Policy `org_id = current_setting('app.org_id')::int` trên nhóm bảng gốc; bảng có `project_id` giữ policy theo project của M51 (project đã thuộc org — cô lập bắc cầu). Lộ trình chuyển tiếp `IS NULL cho qua` → khoá, y hệt M51 PR2.

### PR4 — Object storage (`route: complex`, kích hoạt nợ M53)

- `data/uploads/` → S3-compatible (MinIO tự host trước, đổi endpoint là lên S3 thật). `lib/photos.ts` trừu tượng hoá `storagePut/storageGet/storageDelete` giữ nguyên toàn bộ hàng rào hiện có (path sinh server, mime sniffing, hash sha256, max size); key có prefix `org/<org_id>/...`. Route serve file giữ nguyên URL (stream từ storage) — không đổi client. Script di trú file cũ + verify hash từng file.

## Giai đoạn 2 — Lớp SaaS (chỉ phác thảo — viết đặc tả riêng khi giai đoạn 1 xong)

- Provisioning: tạo org mới + admin đầu tiên (mở rộng `clone-config` M51 PR3 thành "template org"); trang quản trị hệ thống (super-admin ngoài 7 vai trò — vai trò mới ĐẦU TIÊN, phải rà lại toàn bộ `CAN`); billing/plan/quota (dung lượng uploads, số user) — **cần quyết định kinh doanh về mô hình giá trước khi viết đặc tả**; backup/restore per-tenant; subdomain per-tenant (tuỳ chọn — cần wildcard DNS + đổi cookie domain).

## Test & tiêu chí chấp nhận xuyên suốt

- `tests/org-isolation.test.ts`: dựng 2 org × 2 project, xác nhận qua đường ROUTE THẬT (không chỉ lib): user org A không đọc/ghi/đoán-ID được bất kỳ tài nguyên org B nào trên mẫu đại diện mỗi nhóm bảng (tài chính, WBS, vật tư, tài liệu, cấu hình); BOQCODE trùng nhau giữa 2 org đều tạo được; RLS chặn khi cố tình bỏ WHERE (query trực tiếp bằng role `xboss_app`).
- Test bất biến org-scope (PR2) chạy trong CI như `project-scope-invariant`.
- Mỗi PR: lint/typecheck/build/test xanh; migration đụng dữ liệu qua staging (DoD hiện hành).

## Rủi ro & quyết định mở (hỏi người dùng khi đến lượt, KHÔNG tự quyết)

1. `users.email` unique toàn cục hay per-org (đề xuất: toàn cục, giai đoạn 1).
2. Mô hình giá/quota (giai đoạn 2 — quyết định kinh doanh).
3. Google Sheet sync + Telegram/SMTP: config hiện là env toàn cục 1 tenant → per-org phải chuyển vào `integrations.config` + secret store (KHÔNG bỏ secret vào JSONB — vi phạm nguyên tắc M48; cần thiết kế secret riêng, ghi nợ giai đoạn 2).
4. Cron per-tenant (daily-report từng org) — vòng lặp org trong endpoint cron hiện có, sau giai đoạn 1.
