# M28 — Bảo hiểm & Bảo lãnh

**Cụm I · Phụ thuộc: M16 (hợp đồng) · Phức tạp: Nhỏ (1 PR) · Giá trị cao cho PM (theo dõi hạn)**

## Mục tiêu

Sổ theo dõi **bảo hiểm** (công trình CAR, trách nhiệm bên thứ ba, tai nạn LĐ) + **bảo lãnh** (thực hiện HĐ, tạm ứng, bảo hành) — 1 bảng gọn, gắn hợp đồng, kèm giá trị + hiệu lực + cảnh báo **sắp hết hiệu lực/gia hạn**. Module nhỏ, giá trị cao vì tránh sót hạn bảo lãnh (mất tiền thật).

## Hiện trạng & điểm chạm

- `contracts` (M16): bảo lãnh/bảo hiểm gắn `contract_id` (nullable — có loại cấp toàn dự án không theo HĐ).
- Cảnh báo hạn: on-fetch dedup `/api/notifications` (giống `contract_expiry`).
- Upload chứng thư: pattern `task_documents`/`lib/photos.ts`.
- Quyền: xem `CAN.viewPayments` (admin/pm/bch); ghi `CAN.manageContracts` (admin/pm — cùng nhóm HĐ).

## Schema (`migrations/0033_guarantees.sql`)

```sql
CREATE TABLE IF NOT EXISTS guarantees_insurances (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  category TEXT NOT NULL CHECK (category IN ('insurance','guarantee')),
  kind TEXT NOT NULL,                                        -- CAR/trách nhiệm/tai nạn | thực hiện/tạm ứng/bảo hành
  code TEXT, issuer TEXT,                                    -- bên phát hành (ngân hàng/bảo hiểm)
  value NUMERIC(15,2), contract_id INTEGER REFERENCES contracts(id),
  valid_from DATE, valid_to DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','released')),
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER, note TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS guarantee_id INTEGER REFERENCES guarantees_insurances(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_guarantee ON notifications(user_id, type, guarantee_id)
  WHERE guarantee_id IS NOT NULL;
```

## `lib/guarantees.ts`

- `listGuarantees(projectId, category?)` (kèm tên HĐ gắn).
- `expiringGuarantees(days=30)`: `status='active' AND valid_to <= todayISO()+days` (kèm quá hạn) → notification `guarantee_expiry`.
- `validateGuaranteeInput` (thuần): category/kind hợp lệ, `valid_from ≤ valid_to`, value ≥ 0.

## API

| Route                                                               | Quyền                                   | Ghi chú                                      |
| ------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------- |
| `GET/POST /api/guarantees` + `GET/PATCH/DELETE /api/guarantees/:id` | xem: viewPayments; ghi: manageContracts | `?category=` lọc; upload chứng thư multipart |

Notification `guarantee_expiry`: on-fetch, Admin/PM/BCH, dedup theo `guarantee_id`, tự dọn khi gia hạn/release.

## UI/UX (`app/guarantees/page.tsx`)

Bảng 2 nhóm (Bảo hiểm / Bảo lãnh): loại, số, bên phát hành, HĐ gắn, giá trị, hiệu lực (badge đỏ quá hạn / amber ≤30 ngày, kèm icon), trạng thái, file. Modal thêm/sửa + upload. KPI strip: số sắp hết hạn + tổng giá trị bảo lãnh đang hiệu lực. Sidebar mục "Bảo hiểm & Bảo lãnh" cụm **Chi phí · Hợp đồng · Tài chính** (`viewPayments`).

## Test (`tests/guarantees.test.ts`)

Thuần: `validateGuaranteeInput`. Tích hợp: `expiringGuarantees` xuất hiện/tự dọn đúng (quá hạn/sắp hạn/gia hạn/release), dedup. `e2e/authed/guarantees.spec.ts` desktop+mobile+axe.

## Chia PR

1 PR trọn: migration + `lib/guarantees.ts` + API + trang + notification + test + sidebar (đổi status node). (Module nhỏ, không cần tách.)

## Điểm cần quyết & mặc định đã chọn

- **1 bảng chung bảo hiểm + bảo lãnh** (`category` phân biệt) — cấu trúc gần giống nhau (giá trị + hạn + phát hành), gộp gọn hơn 2 bảng.
- **`contract_id` nullable** — có loại bảo hiểm cấp toàn dự án không theo 1 HĐ.
- Ngưỡng cảnh báo **30 ngày** (hằng số); bảo lãnh hết hạn là rủi ro tiền nên cân nhắc thêm mốc 60 ngày sau nếu PM cần báo sớm hơn.
