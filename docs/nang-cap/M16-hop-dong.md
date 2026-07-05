# M16 — Sổ hợp đồng (nhận thầu / giao thầu / NCC)

**Nhóm A (`docs/ke-hoach-fastcons-2026-07.md`) · Phụ thuộc: không · Phức tạp: Trung bình (3 PR)**

## Mục tiêu

Sổ đăng ký hợp đồng 3 loại — **nhận thầu** (với CĐT/tổng thầu), **giao thầu** (cho thầu phụ), **NCC** (mua vật tư/thiết bị) — kèm giá trị, hiệu lực + cảnh báo hết hạn, % tạm ứng/giữ lại bảo hành, phụ lục, file đính kèm; nối các dòng tiền sẵn có (`payment_bills`, `purchase_orders`, `floor_contracts`) về từng hợp đồng để ra "đã thanh toán / còn lại" theo HĐ. Là **nền của M17** (thanh toán KL theo đợt: tỷ lệ tạm ứng/giữ lại + trần giá trị HĐ lấy từ đây) và đích nối của M6 (VO duyệt → phụ lục) + M7 (trúng thầu → sinh HĐ giao thầu).

## Hiện trạng & điểm chạm

- `floor_contracts` (giá trị giao thầu theo tầng, `sheet_type_id + floor_label`) — trở thành **dòng phân bổ** của 1 HĐ giao thầu qua cột mới `contract_id` (nullable, backfill dần — không phá M2).
- `payment_bills` (+ `responsible_supplier_id` từ M2) — thêm `contract_id` để tính "đã thanh toán theo HĐ"; `purchase_orders` — thêm `contract_id` (HĐ nguyên tắc NCC).
- `lib/cost.ts` (M2) giữ nguyên (cam kết vẫn từ PO + floor_contracts — không đổi công thức, tránh double-count vì `contracts.value` KHÔNG cộng vào cam kết khi HĐ đã có floor_contracts/PO gắn; xem Điểm cần quyết).
- Upload file: pattern `task_documents` + `lib/photos.ts` (server sinh tên, whitelist mime PDF/ảnh, max 20MB, `data/uploads/`).
- Notification hết hiệu lực: cơ chế on-fetch dedup/tự dọn của `/api/notifications` (partial unique index như `cost_group`/`po_id`).
- Quyền: xem = `CAN.viewPayments` (admin/pm/bch — giá trị tiền, `cdt` không xem, đã quyết 2026-07-04); ghi = Admin/PM (thêm `CAN.manageContracts`).

## Schema (`migrations/0012_contracts.sql`)

```sql
CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,            -- số HĐ thật trên giấy, nhập tay (không sinh tự động)
  kind TEXT NOT NULL CHECK (kind IN ('nhan_thau','giao_thau','ncc')),
  title TEXT NOT NULL,
  party_supplier_id INTEGER REFERENCES suppliers(id), -- giao_thau/ncc: đối tác là NCC/thầu phụ
  party_name TEXT,                      -- nhan_thau: tên CĐT/tổng thầu (text); ưu tiên supplier khi có cả 2
  discipline_id INTEGER REFERENCES disciplines(id),   -- HĐ giao thầu thường theo hệ (nullable)
  value NUMERIC(15,2) NOT NULL DEFAULT 0,             -- giá trị HĐ gốc (chưa gồm phụ lục/VO)
  advance_pct NUMERIC(5,2) NOT NULL DEFAULT 0,        -- % tạm ứng
  retention_pct NUMERIC(5,2) NOT NULL DEFAULT 0,      -- % giữ lại bảo hành
  signed_date DATE, valid_from DATE, valid_to DATE,   -- valid_to NULL = không thời hạn
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','completed','terminated')),
  note TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS contract_addenda (       -- phụ lục (nhập tay; M6 sẽ ghi khi VO sang 'contract_added')
  id SERIAL PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                                -- số phụ lục
  title TEXT,
  value_delta NUMERIC(15,2) NOT NULL DEFAULT 0,      -- tăng/giảm giá trị (âm được)
  signed_date DATE, note TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contract_id, code)
);
CREATE TABLE IF NOT EXISTS contract_documents (     -- pattern task_documents
  id SERIAL PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
  caption TEXT, uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE floor_contracts  ADD COLUMN IF NOT EXISTS contract_id INTEGER REFERENCES contracts(id);
ALTER TABLE payment_bills    ADD COLUMN IF NOT EXISTS contract_id INTEGER REFERENCES contracts(id);
ALTER TABLE purchase_orders  ADD COLUMN IF NOT EXISTS contract_id INTEGER REFERENCES contracts(id);
ALTER TABLE boq_items        ADD COLUMN IF NOT EXISTS contract_id INTEGER REFERENCES contracts(id); -- BOQ theo HĐ (M17 dùng)
ALTER TABLE notifications    ADD COLUMN IF NOT EXISTS contract_id INTEGER REFERENCES contracts(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_contract ON notifications(user_id, type, contract_id)
  WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_kind ON contracts(kind);
CREATE INDEX IF NOT EXISTS idx_payment_bills_contract ON payment_bills(contract_id);
```

## `lib/contracts.ts`

- `contractTotals(id)` / `listContracts(kind?)`: `valueTotal = value + Σ addenda.value_delta`; `paid = Σ payment_bills.amount WHERE contract_id` (mọi type kể cả `advance` — nhất quán quyết định M2); `poCommitted = Σ po_items` của PO gắn HĐ (loại `cancelled`); `remaining = valueTotal − paid`.
- `expiringContracts(days = 30)`: `status='active' AND valid_to IS NOT NULL AND valid_to <= todayISO()+days` (so sánh chuỗi ngày theo quy ước lớp DB) — nguồn cho notification `contract_expiry` (kèm cả HĐ **đã quá hạn** mà chưa `completed`).
- Validate thuần tách hàm để unit test: `validateContractInput` (kind hợp lệ, value ≥ 0, pct 0–100, `valid_from ≤ valid_to`, giao_thau/ncc bắt buộc `party_supplier_id`, nhan_thau bắt buộc `party_name`).

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET/POST /api/contracts` | GET: `CAN.viewPayments`; POST: `CAN.manageContracts` (Admin/PM) | GET `?kind=` lọc, kèm totals tính sẵn; POST validate + 409 khi trùng `code` |
| `GET/PATCH/DELETE /api/contracts/:id` | GET: viewPayments; PATCH: manageContracts; DELETE: chỉ Admin | GET kèm addenda + documents + bills/PO gắn; DELETE 409 khi đã có bill/PO/floor_contracts gắn (gỡ liên kết trước) |
| `POST/DELETE /api/contracts/:id/addenda(/:aid)` | manageContracts | UNIQUE(contract_id, code) → 409 |
| `POST /api/contracts/:id/documents` + `GET/DELETE /api/contract-documents/:id` | upload/xoá: manageContracts; GET stream: viewPayments | pattern task_documents, PDF/ảnh max 20MB |

Notification `contract_expiry` (PR 3): on-fetch trong `/api/notifications`, chỉ vai trò `viewPayments` trừ `bch`? — **không**, gửi đúng nhóm `viewPayments` (admin/pm/bch) như `cost_over`; dedup theo `contract_id`, tự dọn khi HĐ gia hạn (`valid_to` dời xa) hoặc đổi status khỏi `active`.

## UI/UX (`app/contracts/page.tsx` — PR 2)

- 3 thẻ tổng đầu trang: giá trị nhận thầu / giao thầu / NCC (gồm phụ lục), mỗi thẻ kèm "đã thanh toán" — nhìn 1 phát biết dòng tiền 2 chiều.
- Bảng nhóm theo loại (collapse như `/boq`): số HĐ, tên, đối tác, hệ (chấm màu), giá trị gốc → +phụ lục → tổng, đã thanh toán (progress bar mini), còn lại, hiệu lực (badge đỏ khi quá hạn, amber khi ≤30 ngày — kèm icon, không chỉ màu), trạng thái.
- Modal chi tiết: sửa trường (Admin/PM) + tab Phụ lục (thêm/xoá dòng) + tab File (upload/xem/xoá) + tab Liên kết (bills/PO/floor_contracts đã gắn, link chéo `/payments`, `/materials/purchase-orders`).
- Mobile: giữ cột Số HĐ/Đối tác/Tổng/Còn lại; sidebar mục "Hợp đồng" nhóm **Tiền** (ẩn với vai trò không `viewPayments`).
- PR 3 (tích hợp): form tạo/sửa bill ở `/payments` + form tạo PO thêm select "Hợp đồng" (datalist theo đối tác đã chọn); notification `contract_expiry`.

## Test (`tests/contracts.test.ts`)

- Thuần: `validateContractInput` đủ ca (kind sai, pct ngoài 0–100, thiếu đối tác theo kind, ngày ngược).
- Tích hợp: totals đúng (value + addenda − bills, PO cancelled không tính); `expiringContracts` xuất hiện/biến mất đúng điều kiện (quá hạn, sắp hạn, gia hạn xong hết cảnh báo); DELETE 409 khi còn bill gắn; UNIQUE code HĐ + UNIQUE(contract_id, code) phụ lục.

## Chia PR

1. **Migration + `lib/contracts.ts` + API CRUD/addenda/documents + test** (không UI — route dùng được qua API).
2. Trang `/contracts` + modal chi tiết + sidebar + e2e/axe (desktop + mobile).
3. Tích hợp: select HĐ ở `/payments` + form PO; notification `contract_expiry`; hiển thị chip HĐ ở panel công nợ NCC (`SuppliersTab`).

## Điểm cần quyết & mặc định đã chọn (2026-07-05 — người dùng chưa ý kiến thì giữ nguyên)

- **Số HĐ nhập tay, không sinh tự động** (khác PO/NCR) — số hợp đồng là số pháp lý trên giấy, hệ thống chỉ lưu; UNIQUE chống trùng.
- **`contracts.value` KHÔNG cộng vào "cam kết" của M2** trong PR 1–3 (giữ công thức `lib/cost.ts` nguyên trạng, tránh double-count với floor_contracts/PO đã gắn cùng HĐ). Khi M17 xong sẽ xem lại cam kết = max(HĐ, phân bổ) — ghi chú tại chỗ trong `lib/cost.ts`.
- **1 dự án hiện tại** → chưa có cột `project_id` (nhất quán toàn schema); thêm khi kích hoạt N1 đa dự án.
- Ngưỡng cảnh báo hết hiệu lực mặc định **30 ngày**, hằng số trong `lib/contracts.ts` (chưa cần bảng settings riêng — YAGNI; nếu cần đổi theo dự án thì gộp vào `cost_settings`).
