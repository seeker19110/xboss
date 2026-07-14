# G02 — Chi phí & Hợp đồng

> Gộp từ M02 (chi phí) + M06 (VO) + M07 (đấu thầu) + M16 (hợp đồng) + M17 (thanh toán KL/IPC) + M27 (tài chính & kế toán). Tất cả đã triển khai — tóm tắt tra cứu, lịch sử PR xem `PROGRESS.md`.

## M02 — Kiểm soát chi phí

Bảng 3 cột cost control theo hệ/tầng: **Ngân sách** (BOQ, M01) vs **Cam kết** (PO + `floor_contracts`) vs **Thực chi** (`payment_bills` — **mọi type kể cả `advance`**, tạm ứng tính vào thực chi ngay khi chi ra). `cost_settings` (singleton, `warn_pct`/`over_pct` mặc định 90/100). `lib/cost.ts::costSummary(groupBy)` dùng chung cho M09. `GET/PATCH /api/costs`, `/api/costs/settings` (`viewPayments`=admin/pm/bch, `cdt` không xem — quyết định chung nhất quán cho mọi module tiền). Notification `cost_over` on-fetch, dedup theo hệ.

## M06 — Phát sinh khối lượng (VO)

Ghi nhận KL ngoài HĐ gốc → trình → duyệt → tự cộng vào ngân sách/KL nhận thầu. `variation_orders` (mã `VO-0001`, `reason`, vòng đời `draft→submitted→approved/partially_approved/rejected→contract_added`) + `boq_items.vo_id`/`qty_approved` (duyệt một phần) + `vo_documents`. Ngân sách/KL nhận thầu (M01/M02) = dòng gốc + dòng VO `approved`/`partially_approved`/`contract_added` (tham số `includeVo`). API: `GET/POST /api/variations`, `PATCH`, `POST .../submit|decide` (`CAN.approve`), documents. Notification `vo_pending` (submitted quá 7 ngày). `cdt` không xem giá trị VO.

## M07 — Đấu thầu (gói giao thầu phụ)

`tender_packages` (mã `GT-0001`) + `tender_items` (phạm vi = dòng BOQ) + `tender_bids` (1 NCC/gói, trọn gói hoặc theo dòng) + `tender_bid_prices`. API: CRUD gói (Admin/PM), `POST .../bids`, `POST .../:id/award` (`CAN.approve`, tự tạo `floor_contracts`, khoá sửa giá sau trao). UI: màn so sánh giá — bảng dòng BOQ × cột NCC, ô thấp nhất mỗi dòng tô nổi, cột "chênh vs thấp nhất".

## M16 — Sổ hợp đồng (nhận thầu/giao thầu/NCC)

Nền của M17 + đích nối của M06/M07. `contracts` (`code` **nhập tay** — số HĐ giấy, `kind` nhan_thau/giao_thau/ncc, `value`, `advance_pct`/`retention_pct`, hiệu lực) + `contract_addenda` (phụ lục, `value_delta` có thể âm) + `contract_documents`. Nối `floor_contracts`/`payment_bills`/`purchase_orders`/`boq_items` qua `contract_id` (nullable, backfill dần). `lib/contracts.ts::contractTotals` (value+addenda−paid), `expiringContracts(days=30)` → notification `contract_expiry`. API CRUD (`viewPayments`/`manageContracts`=Admin/PM). **Quyết định quan trọng**: `contracts.value` KHÔNG cộng vào "cam kết" của `lib/cost.ts` (tránh double-count với floor_contracts/PO đã gắn cùng HĐ).

## M17 — Nghiệm thu khối lượng & thanh toán theo đợt (IPC)

Mỗi đợt thanh toán = bảng KL nghiệm thu theo dòng BOQ (KL đợt/luỹ kế/% so HĐ) → giá trị đề nghị (trừ tạm ứng/giữ lại theo tỷ lệ ở M16) → giá trị chấp thuận. 2 chiều: với CĐT (thu) và cho thầu phụ (chi). `payment_certs` (mã `IPC-0001`, `UNIQUE(contract_id, period_no)`) + `payment_cert_items` (**snapshot `unit_price` lúc lập** — không tham chiếu động, tránh đợt cũ đổi giá khi HĐ sửa giá sau). `lib/paymentcerts.ts`: `suggestQtyForContract` (gợi ý KL từ `boqExecutedQty` trừ luỹ kế đợt trước), `certTotals`, `overContractCerts()` → notification `cert_over_contract`. Approve trong transaction **tự sinh 1 dòng `payment_bills`**. API vòng đời (`draft→submitted→approved/rejected`, `CAN.approve`) + xuất PDF/Excel. `cdt` không xem giá trị đợt.

## M27 — Tài chính & Kế toán công trường

Dashboard tài chính: dòng tiền thật, tạm ứng & hoàn ứng, quỹ tiền mặt, hoá đơn & thuế (VAT), công nợ (view từ HĐ/IPC/PO, không lưu trùng), lương (gắn chấm công M24). **Không đổi công thức `lib/cost.ts`** — lớp kế toán song song. `cash_transactions`, `advances` (nối `proposals` M19), `invoices`, `payroll`. `lib/finance.ts`: `cashflowActual` (thay `cashflowSeries` M09 khi có dữ liệu, fallback khi rỗng), `receivables`/`payables` (view), `vatSummary`, `payrollFromAttendance` (chỉ gộp chấm công theo người, `personnel_id NOT NULL` — chấm công theo tổ nhập tay). Notification `advance_overdue` (30 ngày, `ADVANCE_OVERDUE_DAYS`). Ghi = `CAN.manageFinance` (admin/pm); `cdt`/`viewer` không xem.

## Nhất quán xuyên suốt nhóm

`viewPayments` = admin/pm/bch cho mọi trang tiền (`cdt`/`viewer` không xem chi phí/HĐ/VO/IPC/tài chính — quyết định chốt 2026-07-04, áp dụng lại ở từng module thay vì lặp lại lý do). Test: `tests/cost.test.ts`, `variations.test.ts`, `contracts.test.ts`, `paymentcerts.test.ts`, `finance.test.ts` (đa số integration, cần `TEST_DATABASE_URL`); `e2e/authed/costs.spec.ts`, `contracts.spec.ts`, `finance.spec.ts` (desktop+mobile+axe).
