# M47 — EVM & BI nâng cao: earned value, materialized views, báo cáo lưu, cảnh báo cấu hình (P1)

> **Mục tiêu**: nâng trục Báo cáo/BI 3.0 → ~4.0 bằng 4 mảnh: (1) EVM chuẩn (PV/EV/AC → SPI/CPI/EAC) tận dụng CPM + baseline + costs sẵn có; (2) materialized views tách đọc-nặng; (3) báo cáo lưu được; (4) ngưỡng cảnh báo dữ liệu-hoá.

## PR1 — EVM (`lib/evm.ts`)

**Dữ liệu đã có đủ 3 chân**: PV từ `baselines`/`baseline_tasks` (ngày + % chốt), EV từ `tasks.progress_percent` hiện tại, AC từ `costs`/`cash_transactions`.

- Trọng số giá trị task: `boq_norms`/BOQ đơn giá nếu có (`lib/boq.ts`, `lib/norms.ts`); task không có giá trị → trọng số đều trong package (ghi rõ giả định trên UI: "EVM theo trọng số BOQ, task thiếu đơn giá tính đều").
- `lib/evm.ts` (thuần + query, theo pattern `lib/schedule-control.ts` để test tích hợp gọi thẳng):
  ```ts
  export type EvmPoint = { date: string; pv: number; ev: number; ac: number };
  export type EvmSummary = { pv; ev; ac; sv; cv; spi; cpi; bac; eac; etc; vac }; // EAC = AC + (BAC−EV)/CPI
  export async function getEvmSeries(opts: { projectId; baselineId; systemId?; from?; to? }): Promise<{ series: EvmPoint[]; summary: EvmSummary }>;
  ```
  - PV(t): nội suy tuyến tính start→end từng task trong baseline × trọng số (cùng cách nội suy với S-curve hiện có — tái dùng logic, tách hàm chung nếu tiện).
  - EV(t): tái dựng từ `task_history` (pattern `/api/dashboard/scurve` sẵn có) × trọng số.
  - AC(t): cộng dồn `costs.amount` theo ngày (+ `cash_transactions` chi thực nếu chọn nguồn "thực chi" — mặc định `costs`).
- `GET /api/dashboard/evm?baseline=&system=&source=` — quyền như dashboard tài chính (`PAYMENT_VIEW_ROLES`).
- UI: card SPI/CPI/EAC trên Dashboard (khu tài chính, chỉ role được xem tiền); tab "EVM" trong `/report` vẽ 3 đường PV/EV/AC (recharts, màu theo hệ thống trạng thái, kèm chú giải tiếng Việt: SPI < 1 = chậm, CPI < 1 = vượt chi).

## PR2 — Materialized views + refresh

Migration `0052_matviews.sql`:

- `mv_progress_daily(project_id, system_id, date, avg_progress, done_count, total_count)` — nguồn `task_history` + `tasks`, phục vụ S-curve/EVM khỏi tái dựng mỗi request.
- `mv_cost_by_month(project_id, month, committed, actual)` — nguồn contracts/PO (committed) + costs (actual).
- `CREATE UNIQUE INDEX` trên mỗi MV (bắt buộc cho `REFRESH ... CONCURRENTLY`).
- `GET /api/cron/refresh-views` (xác thực `CRON_SECRET` Bearer — pattern daily-report): `REFRESH MATERIALIZED VIEW CONCURRENTLY` từng view; cron 15 phút/lần. Endpoint dashboard/scurve/evm đọc từ MV, fallback tính trực tiếp nếu MV rỗng (DB mới).
- Ghi chú vận hành: refresh concurrently không khoá đọc; view thêm mới phải vào cả cron này.

## PR3 — Báo cáo lưu (`saved_reports`)

- Migration: `saved_reports(id, project_id, owner_id, name, source TEXT, config JSONB, shared BOOLEAN DEFAULT FALSE, created_at)`.
- `source` ∈ danh sách view/API cho phép (whitelist tĩnh trong `lib/reports.ts`: tiến độ theo hệ, chi phí theo tháng, công việc trễ, vật tư…) — **không** cho SQL tự do.
- `config`: `{ filters: {...}, groupBy, columns[], sort }` — validate theo schema từng source.
- API: CRUD `/api/saved-reports` (owner hoặc admin; `shared=true` → mọi role xem); `GET /api/saved-reports/:id/data` chạy query tương ứng source + filter, trả bảng.
- UI `/reports` (trang mới, mọi role): danh sách báo cáo đã lưu + nút chạy/export Excel (tái dùng exporter) + form tạo (chọn source → filter theo schema → xem trước). Không kéo-thả, không pivot — bảng phẳng có group.

## PR4 — Cảnh báo cấu hình được (`alert_rules`)

- Migration: `alert_rules(id, project_id, metric TEXT, operator TEXT, threshold NUMERIC, channel TEXT DEFAULT 'notification', active BOOLEAN, created_by)`.
- `metric` whitelist trong `lib/alerts.ts`: `due_soon_days`, `due_soon_progress`, `material_over_pct`, `spi_below`, `cpi_below`, `stock_below_min`… — mỗi metric map 1 hàm đánh giá.
- Cơ chế: `/api/notifications` đồng bộ on-fetch hiện tại đọc ngưỡng từ `alert_rules` (thay hằng số hard-code: hạn ≤3 ngày, progress <70%…); rule mức dự án không có → dùng default cũ (không seed, không đổi hành vi). SPI/CPI đánh giá trong cron daily-report (đã chạy sẵn) → notification + Telegram.
- UI: mục "Ngưỡng cảnh báo" trong trang cài đặt Admin/PM — bảng rule CRUD đơn giản.

## Test

- `tests/evm.test.ts` (unit phần nội suy PV thuần + integration series nhỏ: 2 task, baseline chốt, 1 cost) — đối chiếu số tay.
- `tests/matviews.test.ts` (integration): refresh rồi so dữ liệu MV với query trực tiếp.
- `tests/saved-reports.test.ts`: validate config theo source, chặn source ngoài whitelist (422).
- `tests/alerts.test.ts` (unit): metric map + so ngưỡng.

## Chia PR

1. **PR1**: `lib/evm.ts` + API + card/tab UI.
2. **PR2**: matviews + cron refresh + chuyển scurve/evm đọc MV.
3. **PR3**: saved_reports + trang `/reports`.
4. **PR4**: alert_rules + nối notifications/cron.
