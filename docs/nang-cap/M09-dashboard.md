# M9 — Dashboard mở rộng (cash flow, CPI, KPI chất lượng/mua sắm/mặt bằng)

**Đợt 3 (cuối) · Phụ thuộc: M2 (+dữ liệu M3/M4/M6/M14) · Phức tạp: Thấp-Trung bình**

## Mục tiêu

Bổ sung lớp "tiền + chất lượng + công trường" vào dashboard hiện có (vốn mạnh về tiến độ), giữ nguyên ngôn ngữ hình ảnh sẵn có.

## Hiện trạng & điểm chạm

- `app/page.tsx` + `/api/dashboard`: KPI, S-curve (`SCurveChart` + baseline), `ForecastCards`, `SpiCards`, Pareto lý do trễ (bấm lọc), `ProgressMap`, `DashboardBarChart`. Recharts + màu status `lib/status.ts`.
- Nguồn số liệu mới: `lib/cost.ts` (M2), `payment_bills` + PO (cash flow), `ncrs` (M3), `vehicle_logs`/PO trễ (M4), `work_fronts` (M14), VO (M6).

## Không thêm schema — chỉ query tổng hợp + UI.

## API

Mở rộng `/api/dashboard` (giữ 1 endpoint, thêm khối trong payload — client fetch 1 lần):
- `cashflow`: 12 tháng gần nhất `{month, in, out}` — in = `payment_bills` nhận từ CĐT, out = chi NCC/thầu phụ (phân loại theo backfill M2).
- `cpi`: giá trị thực hiện (KL thực hiện × đơn giá — `lib/boq.ts`) / thực chi. Kèm cả `budgetUsedPct`.
- `quality`: NCR mở/quá hạn/đóng 30 ngày; inspection pass rate.
- `procurement`: PO trễ giao, xe no_show tuần này.
- `workfront`: số tầng chờ bàn giao + ngày chờ luỹ kế.
- `vo`: tổng giá trị VO theo trạng thái.

Mỗi khối chỉ tính khi bảng nguồn tồn tại (module đã triển khai) — check `to_regclass` hoặc try/catch, trả `null` để UI ẩn thẻ (dashboard chạy được dù module sau chưa làm).

## UI/UX (mở rộng `app/page.tsx`)

- **Hàng thẻ KPI mới** dưới hàng hiện có: CPI (số to + mũi tên xu hướng; <1 rose, ≥1 emerald, kèm nhãn chữ), % ngân sách đã dùng, NCR mở (badge quá hạn), Tầng chờ MB, VO chờ duyệt (giá trị). Thẻ nào `null` thì ẩn — bố cục flex wrap.
- **Cash flow chart**: bar đôi in/out theo tháng + line luỹ kế chênh (recharts ComposedChart) — đặt cạnh S-curve; theo `dataviz` conventions dự án (màu status, tooltip vi-VN).
- Mỗi thẻ KPI click → trang module tương ứng (drill-down như Pareto hiện có).
- Vai trò chỉ-xem `bch/cdt/viewer`: thấy tiến độ + chất lượng; khối tiền theo `PAYMENT_VIEW_ROLES` (bch có, cdt/viewer không — xác nhận lại khi làm).
- Không nhồi: nếu >3 hàng thẻ, gom khối tiền vào 1 section collapse "Tài chính" mặc định mở với PM, đóng với engineer.

## Test

- Integration: payload từng khối đúng với dữ liệu seed nhỏ; khối trả `null` khi thiếu bảng (mô phỏng module chưa áp migration — test trên DB thiếu bảng khó, chấp nhận check try/catch bằng unit).
- e2e axe lại trang chủ (đã có `e2e/authed/dashboard.spec.ts` — mở rộng).

## Chia PR

1. API khối cashflow + cpi + UI 2 thẻ + chart (cần M2 xong).
2. Khối quality/procurement/workfront/vo + thẻ tương ứng (thêm dần theo module nào đã có — PR này có thể tách nhỏ theo nhịp).

## Đã quyết (người dùng chốt 2026-07-04)

- **`cdt` KHÔNG thấy CPI/ngân sách/cash flow/VO** — khối tài chính chỉ render cho `PAYMENT_VIEW_ROLES` (admin/pm/bch); cdt/viewer thấy tiến độ + chất lượng. API không trả khối tài chính cho vai trò ngoài danh sách (ẩn từ server, không chỉ ẩn UI).
