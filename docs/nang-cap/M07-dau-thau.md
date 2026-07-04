# M7 — Đấu thầu (gói thầu phụ / so sánh giá chào)

**Đợt 3 · Phụ thuộc: M1 · Phức tạp: Trung bình**

## Mục tiêu

Quản lý gói giao thầu phụ / chào giá NCC: tạo gói từ dòng BOQ, nhận giá chào nhiều nhà thầu, bảng so sánh, trao thầu → sinh hợp đồng giao thầu.

## Hiện trạng & điểm chạm

- `suppliers` (tái dùng làm nhà thầu tham gia), `boq_items` (M1 — phạm vi gói), `floor_contracts` (kết quả trao → giá trị HĐ), upload pattern chuẩn.

## Schema (`migrations/000N_tender.sql`)

```sql
CREATE TABLE IF NOT EXISTS tender_packages (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,          -- GT-0001
  name TEXT NOT NULL, scope TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','closed','awarded','cancelled')),
  awarded_bid_id INTEGER,             -- FK thêm sau khi có tender_bids (ALTER cuối file)
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tender_items (            -- phạm vi = tham chiếu dòng BOQ
  tender_id INTEGER NOT NULL REFERENCES tender_packages(id) ON DELETE CASCADE,
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id),
  qty NUMERIC(15,3) NOT NULL,          -- KL mời (có thể ≠ KL HĐ)
  PRIMARY KEY (tender_id, boq_item_id)
);
CREATE TABLE IF NOT EXISTS tender_bids (
  id SERIAL PRIMARY KEY,
  tender_id INTEGER NOT NULL REFERENCES tender_packages(id) ON DELETE CASCADE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  lump_sum NUMERIC(15,2),              -- chào trọn gói (hoặc null nếu chào theo dòng)
  note TEXT, file_path TEXT, file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tender_id, supplier_id)
);
CREATE TABLE IF NOT EXISTS tender_bid_prices (       -- giá theo dòng
  bid_id INTEGER NOT NULL REFERENCES tender_bids(id) ON DELETE CASCADE,
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id),
  unit_price NUMERIC(15,2) NOT NULL,
  PRIMARY KEY (bid_id, boq_item_id)
);
```

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| `/api/tenders` CRUD | Admin/PM (kỹ sư xem) | tạo kèm items (transaction) |
| `/api/tenders/:id/bids` POST/PATCH/DELETE | Admin/PM nhập hộ giá chào | nhập theo dòng hoặc trọn gói |
| POST `/api/tenders/:id/award` | `CAN.approve` | set awarded + status; hỏi tạo `floor_contracts` tương ứng; audit |

## UI/UX (`app/tenders/page.tsx`)

- Danh sách gói: badge trạng thái, hạn nộp (trễ hạn amber), số nhà thầu đã chào.
- **Màn so sánh** (điểm ăn tiền): bảng dòng BOQ × cột nhà thầu — mỗi ô đơn giá; ô thấp nhất mỗi dòng nền emerald nhạt + đậm; hàng tổng cuối so tổng gói; cột "Chênh vs thấp nhất" cho từng NCC. Header cột NCC sticky, cuộn ngang container riêng.
- Nút "Trao thầu" trên cột NCC → confirm dialog nêu tổng giá trị + tự tạo HĐ giao thầu; sau trao: banner kết quả + khoá sửa giá.
- Nhập giá chào: form theo dòng (bảng editable) hoặc ô trọn gói; upload file chào thầu gốc.
- In/PDF bảng so sánh (trình sếp duyệt).

## Test

- Integration: unique bid/NCC; award đổi trạng thái + chặn sửa sau award; tổng so sánh tính đúng khi NCC chào thiếu dòng (đánh dấu "thiếu", không cộng 0 gây hiểu lầm).

## Chia PR

1. Schema + API + test.
2. Trang danh sách + form gói/giá chào.
3. Màn so sánh + trao thầu + PDF.

## Điểm cần quyết

- NCC chào thiếu dòng: loại khỏi so sánh tổng hay cho phép so từng phần? (đề xuất: hiện "—" và tổng có ghi chú "chào N/M dòng").
