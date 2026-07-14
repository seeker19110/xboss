# G01 — Tiến độ & BOQ

> Gộp từ M01 (BOQ) + M09 (dashboard mở rộng) + M15 (trang hệ) + M35 (BPTC) + M36 (dashboard tiến độ theo hệ). Tất cả đã triển khai — tóm tắt tra cứu, lịch sử PR xem `PROGRESS.md`.

## M01 — BOQ đầy đủ

Nâng BOQCODE (`lib/boq.ts`) thành bảng khối lượng đầy đủ, 3 lớp nhận thầu/giao thầu/thực hiện.

- **Schema**: `disciplines` (danh mục hệ chuẩn, seed 6 hệ, cột `color`) + `sheet_types.discipline_id` + `boq_items` (code cùng không gian mã BOQCODE, `qty_contract`/`unit_price`/`qty_sub`/`sub_unit_price`) + `boq_task_map` (n-n boq_item↔task, `weight` **luôn nhập tay**, không tự chia đều). Thành tiền tính động lúc query, không lưu cột.
- **API**: `GET/POST /api/boq`, `PATCH/DELETE /api/boq/:id`, `PUT /api/boq/:id/map` (validate Σweight cảnh báo ≠1, không chặn cứng), `POST /api/boq/import` (dry-run preview trước, `?commit=1` mới ghi). `boqExecutedQty(boqItemId)` trong `lib/boq.ts` dùng chung cho M2/M6.
- **UI** (`/boq`): bảng nhóm theo hệ (collapse), panel map task + weight, import Excel có preview diff.

## M09 — Dashboard mở rộng

Bổ sung lớp "tiền + chất lượng + công trường" vào `/api/dashboard` (1 endpoint, nhiều khối) — không thêm schema. Khối: `cashflow` (12 tháng), `cpi` (KL thực hiện×đơn giá / thực chi), `quality` (NCR), `procurement` (PO/xe trễ), `workfront`, `vo`, `byDiscipline` (bảng chéo hệ). Mỗi khối chỉ tính khi bảng nguồn tồn tại, trả `null` để UI ẩn thẻ (dashboard chạy được dù module sau chưa làm — pattern dùng lại ở mọi module sau). **Khối tài chính (CPI/ngân sách/cashflow/VO) chỉ trả cho `PAYMENT_VIEW_ROLES`** — ẩn từ server, không chỉ ẩn UI.

## M15 — Trang riêng từng hệ (`/he/[code]`)

Mỗi hệ có 1 trang hub: tiến độ, sheet tracking, và (khi module liên quan xong) BOQ/QA&QC/bản vẽ/mặt bằng **lọc theo hệ** — nguyên tắc: không nhân bản UI mỗi module cho từng hệ, trang module dùng chung nhận query `?he=<code>` để lọc, trang hệ chỉ là hub + deep-link.

- **Schema**: `discipline_contractors` (nhà thầu phụ trách hệ, `floor_labels[]`/`zone` — 1 hệ có thể nhiều nhà thầu chia tầng/khu, `is_primary`) + `users.supplier_id`.
- **API**: `GET /api/disciplines` (list + %), `GET /api/disciplines/:code/summary` (KPI hệ, khối module chưa có trả `null` như M9); các API module thêm `?discipline=`.
- **UI**: header hệ (chip nhà thầu + màu) + KPI strip + khối "Quản lý nhà thầu" (bảng mỗi nhà thầu 1 hàng: phạm vi/% /nhân lực/sản lượng/NCR/công nợ/điểm đánh giá) + tab Tổng quan/Tracking + link sang module với filter gài sẵn. Badge tên nhà thầu theo tầng trên lưới tracking.

## M35 — BPTC (đóng nốt node coming-soon)

"Biện pháp thi công" đã code đầy đủ từ M08 (schema `drawings.kind='method'`, API lọc, gate nghiệm thu) — **không cần schema/route mới**. Chỉ nối 1 điểm UX: `app/drawings/page.tsx` đọc `?kind=` từ URL để deep-link `/drawings?kind=method`; `dashboardTree.ts` gán href cho node `dash.thiet-ke-bptc`.

## M36 — Dashboard Tiến Độ theo hệ (đường găng & chậm tiến độ)

Không đổi schema — chỉ thêm tham số lọc `?he=<disciplines.code>` (chuẩn hoá 1 pattern) cho các trang/API tiến độ sẵn có, tránh nhân bản 7 hệ × 5 view.

- `HeFilter.tsx` (select hệ, dùng chung 4+ trang) + `?he=` cho `/api/timeline`, `/api/gantt` (CPM trên tập đã lọc), `/api/lookahead`, `/api/dashboard`, `/api/dashboard/scurve`.
- Hub `/hub/dash.tien-do`: khối "Kế hoạch & báo cáo tổng thể" (5 card) + khối "Tiến độ theo hệ" (mỗi hệ 1 hàng, động theo DB — không hard-code) + khối "Kiểm soát".
- Trang mới `/scurve` (bọc `SCurveChart` + `HeFilter`) và `/schedule-control` (`GET /api/schedule-control?he=` — đường găng/float từ `lib/cpm.ts` + bảng trễ theo `delay_reason`, Pareto). `/report` thêm `?range=day|week|month` (view only, không cron tháng mới).
- Quyết định: hệ là danh mục **động** (không seed "Trắc đạc" cứng); đường găng tính trong phạm vi lọc khi có `?he=`.

## Test

`tests/boq.test.ts`, `tests/schedule-control.test.ts` (tích hợp); `e2e/authed/discipline.spec.ts`, `boq.spec.ts`, `dashboard.spec.ts` (desktop+mobile+axe).
