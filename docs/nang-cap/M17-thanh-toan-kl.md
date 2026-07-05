# M17 — Nghiệm thu khối lượng & thanh toán theo đợt (IPC)

**Nhóm A · Phụ thuộc: M1 ✅, M16 · Phức tạp: Cao (4 PR)**

## Mục tiêu

Tính năng đinh của FastCons ("Acceptance"): mỗi **đợt thanh toán** (Interim Payment Certificate) là bảng khối lượng nghiệm thu theo dòng BOQ — KL đợt này, luỹ kế, % so hợp đồng → giá trị đề nghị → trừ tạm ứng/giữ lại (tỷ lệ lấy từ M16) → giá trị chấp thuận. Áp dụng **2 chiều**: đợt thanh toán **với CĐT** (thu, dựa HĐ nhận thầu) và đợt thanh toán **cho thầu phụ** (chi, dựa HĐ giao thầu). Cảnh báo khi luỹ kế vượt giá trị hợp đồng (gồm phụ lục/VO đã duyệt).

## Hiện trạng & điểm chạm

- `boq_items`/`boqExecutedQty` (M1, `lib/boq.ts`) — KL thực hiện luỹ kế theo tiến độ task, dùng làm KL gợi ý cho đợt mới (trừ luỹ kế các đợt trước cùng dòng BOQ).
- `contracts`/`contract_addenda` (M16) — nguồn `advance_pct`/`retention_pct`/giá trị HĐ (gồm phụ lục) để tính trần cảnh báo và trừ tạm ứng.
- `payment_bills` (đã có `contract_id` từ M16) — 1 đợt IPC **duyệt xong sinh 1 dòng `payment_bills`** (type `bill`, `amount` = giá trị chấp thuận), giữ nguyên bảng cũ không đổi cấu trúc — `/payments` hiện tại tiếp tục hoạt động.
- Vòng đời duyệt mượn pattern nghiệm thu 2 bước (`CAN.approve`) + `lib/seqcode.ts` (mã `IPC-0001`).
- Xuất PDF/Excel: `lib/pdf-fonts.ts` (font DejaVu, tránh lỗi vỡ dấu đã vá ở M3) + `exceljs` (đã dùng ở `/api/export/excel`).

## Schema (`migrations/0013_payment_certs.sql`)

```sql
CREATE TABLE IF NOT EXISTS payment_certs (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                          -- IPC-0001
  contract_id INTEGER NOT NULL REFERENCES contracts(id),
  period_no INTEGER NOT NULL,                         -- đợt số mấy của HĐ này (1, 2, 3...)
  period_label TEXT,                                  -- vd "Tháng 7/2026" (hiển thị, không tính toán)
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_at DATE, decided_at DATE, decided_by INTEGER REFERENCES users(id),
  reject_reason TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contract_id, period_no)
);
CREATE TABLE IF NOT EXISTS payment_cert_items (
  id SERIAL PRIMARY KEY,
  cert_id INTEGER NOT NULL REFERENCES payment_certs(id) ON DELETE CASCADE,
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id),
  qty_period NUMERIC(15,3) NOT NULL DEFAULT 0,        -- KL nghiệm thu đợt này
  qty_cumulative NUMERIC(15,3) NOT NULL DEFAULT 0,    -- luỹ kế tới hết đợt này (snapshot lúc lập)
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,        -- snapshot đơn giá lúc lập (HĐ có thể đổi giá sau)
  UNIQUE(cert_id, boq_item_id)
);
ALTER TABLE payment_bills ADD COLUMN IF NOT EXISTS payment_cert_id INTEGER REFERENCES payment_certs(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payment_cert_id INTEGER REFERENCES payment_certs(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_cert ON notifications(user_id, type, payment_cert_id)
  WHERE payment_cert_id IS NOT NULL;
```

Giá trị tiền của 1 đợt (tính động trong `lib/paymentcerts.ts`, không lưu cột trùng lặp): `periodValue = Σ qty_period × unit_price`; `cumulativeValue = Σ qty_cumulative × unit_price`; `advanceDeduct = periodValue × contract.advance_pct / 100`; `retentionDeduct = periodValue × contract.retention_pct / 100`; `approvedValue = periodValue − advanceDeduct − retentionDeduct`.

## `lib/paymentcerts.ts`

- `suggestQtyForContract(contractId)`: với mỗi `boq_items.contract_id = contractId`, `qtyExecuted = boqExecutedQty(id)` (M1) trừ `Σ qty_cumulative` của đợt **đã duyệt** gần nhất cùng dòng BOQ → gợi ý `qty_period` cho đợt mới (không tính đợt `draft`/`rejected`).
- `certTotals(certId)`: công thức trên; `contractCumulativeValue(contractId)` = Σ `cumulativeValue` của đợt `approved` mới nhất mỗi dòng BOQ — dùng so với `contracts.value + Σ addenda.value_delta` để tính **% luỹ kế/HĐ**.
- `overContractCerts()`: đợt `approved` mà `contractCumulativeValue > giá trị HĐ (gồm phụ lục)` → nguồn notification `cert_over_contract` (dedup theo `contract_id`, cùng cơ chế `cost_over`).
- `validateCertItems`: KL đợt ≥ 0; dòng BOQ phải thuộc đúng `contract_id` của cert (chặn nhầm hợp đồng).
- Approve trong `withTransaction` + `SELECT ... FOR UPDATE` trên `payment_certs` (đối xứng `POST /api/tasks/:id/approve`): chuyển `approved` → tự **insert `payment_bills`** (`type='bill'`, `amount = approvedValue`, `contract_id`, `payment_cert_id`, `description` tự sinh "Đợt {period_no} — {contract.title}").

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET/POST /api/payment-certs?contractId=` | GET: `viewPayments`; POST: `manageContracts` | POST tạo đợt mới, `period_no` tự tăng theo HĐ, kèm `suggestQtyForContract` prefill dòng |
| `GET/PATCH /api/payment-certs/:id` | GET: viewPayments; PATCH (sửa dòng khi draft): manageContracts | PATCH chặn 409 khi status khác `draft` |
| `POST /api/payment-certs/:id/submit` | manageContracts | draft → submitted |
| `POST /api/payment-certs/:id/decide` | `CAN.approve` | body `{decision: 'approved'|'rejected', rejectReason?}`; approved → transaction sinh `payment_bills` như trên; rejected bắt buộc `rejectReason` |
| `GET /api/payment-certs/:id/pdf` | viewPayments | bảng KL nghiệm thu theo mẫu IPC (tái dùng `lib/pdf-fonts.ts`) |
| `GET /api/payment-certs/:id/excel` | viewPayments | tái dùng `exceljs` như `/api/export/excel` |

Notification `cert_over_contract`: on-fetch trong `/api/notifications`, vai trò `viewPayments`, dedup theo `contract_id`; `cert_pending` (đợt `submitted` > 5 ngày chưa quyết, cùng pattern `vo_pending` của M6) dedup theo `payment_cert_id`.

## UI/UX (`app/payment-certs/page.tsx`)

- Chọn hợp đồng (dropdown, kèm giá trị + luỹ kế đã duyệt + % dùng) → nút "Lập đợt mới" (prefill KL gợi ý từ tiến độ thực tế, sửa tay được).
- Bảng dòng BOQ trong đợt: mã/tên/ĐVT/đơn giá/KL đợt này/luỹ kế/% so HĐ, tổng cuối bảng: giá trị đợt → trừ tạm ứng → trừ giữ lại → **giá trị đề nghị** (số to, nổi bật).
- Banner cảnh báo đỏ khi luỹ kế (kể cả đợt đang lập) sẽ vượt giá trị HĐ — chặn submit không cứng (giống M1 cảnh báo Σweight), chỉ nhắc.
- Danh sách đợt theo hợp đồng: stepper mini (nháp→trình→duyệt/từ chối), nút xuất PDF/Excel khi đã duyệt.
- Màn quyết (Admin/PM): xem lại từng dòng, duyệt hoặc từ chối kèm lý do.
- Sidebar mục "Thanh toán khối lượng" (nhóm Tiền, cạnh "Hợp đồng"/"Chi phí"); `/contracts` (M16) thêm tab "Các đợt IPC" trong modal chi tiết HĐ.

## Test (`tests/paymentcerts.test.ts`)

- Thuần: `validateCertItems`, công thức `certTotals` (tạm ứng/giữ lại/giá trị đề nghị).
- Tích hợp: `suggestQtyForContract` trừ đúng luỹ kế đợt trước; `overContractCerts` xuất hiện/biến mất đúng điều kiện; approve trong transaction sinh đúng 1 `payment_bills`; UNIQUE(contract_id, period_no) chống trùng đợt; reject không sinh bill.

## Chia PR

1. Schema + `lib/paymentcerts.ts` + API vòng đời (không PDF/Excel) + test tích hợp công thức + sinh bill.
2. Trang `/payment-certs` + form lập đợt + màn duyệt + menu + e2e/axe.
3. Xuất PDF + Excel.
4. Notification `cert_over_contract`/`cert_pending` + tích hợp tab "Các đợt IPC" ở `/contracts`.

## Điểm cần quyết & mặc định đã chọn (2026-07-05)

- **`unit_price` snapshot lúc lập đợt** (không tham chiếu động tới `boq_items.unit_price` hiện tại) — tránh đợt cũ đổi giá trị khi đơn giá HĐ được sửa sau này (đúng nguyên tắc kế toán "giá tại thời điểm nghiệm thu"). Nếu người dùng muốn snapshot cả đơn giá theo `contract_addenda` khi có phụ lục đổi giá riêng dòng BOQ — chưa hỗ trợ, ghi nhận hướng mở rộng.
- **`cdt` không xem giá trị đợt thanh toán** — nhất quán quyết định chung 2026-07-04 (như M2/M6/M9), `viewPayments` = admin/pm/bch.
- Chưa hỗ trợ **thanh toán một phần của 1 đợt đã duyệt** (vd CĐT chỉ trả 80% giá trị đề nghị) — `payment_bills.amount` luôn = `approvedValue`; nếu cần theo dõi thực nhận khác giá trị đề nghị, sửa tay `payment_bills` sau khi sinh (không chặn, vì bảng đó vẫn sửa được qua `/payments` hiện có).
