# M2 — Kiểm soát chi phí & cảnh báo vượt

**Đợt 1 · Phụ thuộc: M1 · Phức tạp: Trung bình**

## Mục tiêu

Bảng 3 cột chuẩn cost control theo hệ/tầng: **Ngân sách** (BOQ M1) vs **Cam kết** (PO + hợp đồng giao thầu) vs **Thực chi** (`payment_bills` + nhập kho), kèm cảnh báo tức thì `cost_over`.

## Hiện trạng & điểm chạm

- Nguồn cam kết: `purchase_orders` + `po_items` (giá trị PO), `floor_contracts` (HĐ giao thầu theo tầng).
- Nguồn thực chi: `payment_bills` (type `bill/advance/item`, cột `responsible` TEXT — xem Điểm cần quyết), `warehouse_receipts` + `receipt_items` (giá trị hàng đã nhận).
- Notification engine: `/api/notifications` đồng bộ on-fetch, dedup theo cột tham chiếu + partial unique index (pattern `material_over` — copy đúng pattern này cho `cost_over`).

## Schema (`migrations/000N_cost.sql`)

Không cần bảng lớn — chủ yếu view/query tổng hợp. Chỉ thêm:

```sql
CREATE TABLE IF NOT EXISTS cost_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- singleton
  warn_pct NUMERIC(5,2) NOT NULL DEFAULT 90,  -- cảnh báo khi cam kết/NS đạt %
  over_pct NUMERIC(5,2) NOT NULL DEFAULT 100
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS cost_group TEXT; -- dedup cost_over theo hệ
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_cost ON notifications(user_id, type, cost_group)
  WHERE type = 'cost_over' AND read_at IS NULL;
```

Logic tổng hợp viết ở `lib/cost.ts`: `costSummary(groupBy: 'system' | 'floor')` trả `{budget, committed, actual}[]` — M9 tái dùng.

## API

| Route | Method | Quyền | Ghi chú |
|---|---|---|---|
| `/api/costs` | GET | Admin/PM/BCH (mở rộng `PAYMENT_VIEW_ROLES`) | `?groupBy=system\|floor`, kèm drill-down ids |
| `/api/costs/settings` | GET/PATCH | GET: như trên; PATCH: Admin/PM | ngưỡng cảnh báo |

Cảnh báo `cost_over`: tính trong lượt đồng bộ on-fetch của `/api/notifications` (không cron riêng) — khi nhóm nào `committed/budget ≥ warn_pct` thì upsert notification cho Admin/PM, hết điều kiện tự dọn (đúng cơ chế sẵn có).

## UI/UX (`app/costs/page.tsx`)

- Toggle nhóm theo **Hệ / Tầng**; mỗi dòng: Ngân sách · Cam kết · Thực chi · thanh ngang chồng (stacked bar mini: thực chi đậm, cam kết nhạt, vạch ngân sách) · % sử dụng (badge màu: <90 zinc, 90–100 amber, >100 rose — kèm icon, không chỉ màu).
- Click dòng → drill-down panel: danh sách PO/đợt thanh toán/phiếu nhập cấu thành con số (link sang trang gốc).
- Header tổng dự án: 3 thẻ số to (Ngân sách/Cam kết/Thực chi) + cảnh báo đang active.
- Số tiền format `Intl.NumberFormat('vi-VN')`, đơn vị triệu/tỷ rút gọn có tooltip số đầy đủ.
- Quyền chỉ-xem (`bch`): ẩn nút sửa ngưỡng.

## Test

- Unit (`tests/cost.test.ts`): logic gộp `costSummary` với dữ liệu giả lập (mock query) hoặc integration với `TEST_DATABASE_URL` — ưu tiên integration vì toàn JOIN.
- Case: PO bị huỷ không tính cam kết; bill type `advance` tính/không tính theo quyết định bên dưới.

## Chia PR

1. Migration + `lib/cost.ts` + `/api/costs` + test.
2. Trang `/costs` + menu sidebar + e2e/axe.
3. Notification `cost_over` + settings ngưỡng.

## Đã quyết (người dùng chốt 2026-07-04)

- **Tạm ứng (`advance`) TÍNH VÀO thực chi** — dòng tiền đã ra khỏi công ty; các đợt thanh toán sau nhập số đã trừ tạm ứng. UI chú thích rõ cách tính ở tooltip cột Thực chi.
- **Vai trò `cdt` KHÔNG thấy trang chi phí** (nhạy cảm thương mại — quyết định chung cho M2/M6/M9): quyền xem giữ `PAYMENT_VIEW_ROLES` (admin/pm/bch), không mở rộng cho cdt/viewer.
- Backfill `payment_bills.responsible` → FK: làm ngay trong M2 (đề xuất được giữ — cần cho drill-down).
