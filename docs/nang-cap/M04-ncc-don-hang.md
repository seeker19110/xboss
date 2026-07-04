# M4 — NCC & đơn hàng nâng cao (cấp phát vật tư, xe ra vào)

**Đợt 2 · Phụ thuộc: — (song song M3/M5/M14) · Phức tạp: Trung bình**

## Mục tiêu

Hoàn thiện chuỗi mua sắm sẵn có: dòng đời PO + cảnh báo trễ giao, đánh giá NCC, công nợ; cấp phát vật tư theo tầng/tổ đội; đăng ký & nhật ký xe NCC ra vào công trường.

## Hiện trạng & điểm chạm

- Đã có: `suppliers`, `purchase_requests`, `purchase_orders`+`po_items`, `warehouse_receipts`+`receipt_items`, `material_transactions` (delta ± có người ghi), trang `/materials/purchase-orders`, `/materials/purchase-requests`; sync Google Sheet (không đụng).
- PO hiện có trạng thái cơ bản (tạo/xác nhận/nhập kho/huỷ — xem `app/materials/purchase-orders/page.tsx`, 4 hành động đã bọc try/catch đợt audit).

## Schema (`migrations/000N_procurement.sql`)

```sql
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_date DATE;      -- ngày giao dự kiến
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS status2 TEXT;            -- nếu status hiện tại thiếu bước: đặt→xác nhận→đang giao→giao một phần→đủ→đối chiếu (map từ status cũ, xem Điểm cần quyết)
CREATE TABLE IF NOT EXISTS supplier_ratings (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
  quality SMALLINT CHECK (quality BETWEEN 1 AND 5),
  delivery SMALLINT CHECK (delivery BETWEEN 1 AND 5),
  price SMALLINT CHECK (price BETWEEN 1 AND 5),
  note TEXT, rated_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (supplier_id, po_id)
);
ALTER TABLE material_transactions ADD COLUMN IF NOT EXISTS floor_label TEXT;  -- cấp phát: đi tầng nào
ALTER TABLE material_transactions ADD COLUMN IF NOT EXISTS crew TEXT;         -- tổ đội lĩnh
CREATE TABLE IF NOT EXISTS vehicle_logs (
  id SERIAL PRIMARY KEY,
  po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  plate TEXT NOT NULL, driver TEXT, driver_phone TEXT,
  cargo TEXT, gate TEXT,
  expected_at TIMESTAMPTZ NOT NULL,
  entered_at TIMESTAMPTZ, exited_at TIMESTAMPTZ,
  needs_crane BOOLEAN NOT NULL DEFAULT FALSE,          -- cần cẩu/vận thăng
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered','approved','entered','exited','no_show','cancelled')),
  receipt_id INTEGER REFERENCES warehouse_receipts(id), -- nối phiếu nhập khi xe vào
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| PATCH `/api/purchase-orders/:id` (mở rộng) | nhóm quyền PO hiện tại | thêm `expectedDate`, trạng thái mới; đổi trạng thái ghi audit |
| POST `/api/suppliers/:id/ratings` | Admin/PM/engineer | 1 đánh giá/PO |
| GET `/api/suppliers/:id/summary` | như xem NCC | điểm TB + công nợ (ΣPO − Σthanh toán từ `payment_bills` sau backfill M2) |
| `/api/vehicles` GET/POST, PATCH `/:id` | tạo: Admin/PM/engineer; check-in/out (`entered_at`/`exited_at`): cả subcon được giao | GET `?date=` cho danh sách ngày |
| GET `/api/vehicles/export` | Admin/PM | PDF/Excel danh sách xe ngày gửi tổng thầu |

Cảnh báo notification (đồng bộ on-fetch, pattern `due_soon`): `po_late` (quá `expected_date` chưa đủ hàng), `vehicle_late` (quá `expected_at` 2h chưa `entered_at`).

## UI/UX

- **PO** (mở rộng trang hiện có): timeline trạng thái ngang (stepper 6 bước, bước hiện tại accent); cột "Giao dự kiến" + badge trễ; nút đánh giá NCC hiện khi PO đủ hàng (modal 3 thang sao + ghi chú).
- **NCC** (`/materials/suppliers` — nếu chưa có trang riêng thì thêm): bảng điểm TB 3 tiêu chí (hiển thị sao + số), công nợ, lịch sử PO; giúp chọn NCC khi tạo PO mới (gợi ý xếp theo điểm).
- **Cấp phát**: trong trang vật tư, form xuất kho thêm 2 field Tầng + Tổ đội (datalist gợi ý từ dữ liệu cũ); tab "Tiêu hao theo tầng" — bảng materials × tầng đối chiếu với KL thi công (nối M1 khi có).
- **Xe ra vào** (`/vehicles`): view theo ngày (mặc định hôm nay) — timeline dọc theo giờ dự kiến, mỗi xe 1 card: biển số to + NCC + hàng + icon cẩu nếu cần; nút hành động theo trạng thái (Duyệt → Đã vào → Đã ra) **to, bấm được bằng 1 tay tại cổng**; quá giờ tô rose + đẩy lên đầu. Nút "Xuất DS gửi tổng thầu" (PDF ngày mai).
- Mobile-first cho `/vehicles` (bảo vệ/thủ kho dùng điện thoại): mỗi hành động 1 chạm + xác nhận.

## Test

- Integration: chuyển trạng thái PO hợp lệ/không hợp lệ (không nhảy cóc); rating unique theo PO; vehicle check-in set `entered_at` idempotent; notification `po_late` tạo & tự dọn.

## Chia PR

1. Dòng đời PO + `expected_date` + notification `po_late` + audit.
2. Đánh giá NCC + trang/summary NCC + công nợ.
3. Cấp phát theo tầng/tổ đội + tab tiêu hao.
4. Xe ra vào (`vehicle_logs` + `/vehicles` + export DS + notification).

## Điểm cần quyết

- Trạng thái PO hiện tại là gì (đọc code khi triển khai) — mở rộng enum cũ hay cột mới rồi migrate? (nguyên tắc: không phá dữ liệu cũ).
- Tổ đội (`crew`): text tự do hay danh mục? (đề xuất: text + datalist trước, nâng thành bảng khi M5 cần thống kê năng suất).
