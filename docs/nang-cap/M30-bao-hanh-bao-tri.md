# M30 — Bảo hành – Bảo trì (O&M)

**Cụm K · Phụ thuộc: M28 (bảo lãnh bảo hành), M29 (bàn giao) · Phức tạp: Trung bình (2 PR)**

## Mục tiêu

Dashboard sau bàn giao: **bảo hành** (danh mục hạng mục + thời hạn theo hệ, xử lý lỗi sau bàn giao, bảo lãnh bảo hành), **vận hành & bảo trì O&M** (hướng dẫn, đào tạo vận hành cho CĐT). Cảnh báo **bảo hành sắp hết hạn** + **claim bảo hành quá hạn xử lý**.

## Hiện trạng & điểm chạm

- `handover_items` (M29): hạng mục bàn giao → mốc bắt đầu bảo hành.
- `guarantees_insurances` (M28): bảo lãnh bảo hành gắn `warranty_items` qua tham chiếu mềm.
- Upload hướng dẫn O&M: pattern `task_documents`/`project_documents` (M20).
- Cảnh báo: on-fetch dedup `/api/notifications`.
- Quyền: xem mọi vai trò; ghi `CAN.manageWarranty` (admin/pm/engineer).

## Schema (`migrations/0035_warranty.sql`)

```sql
CREATE TABLE IF NOT EXISTS warranty_items (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  title TEXT NOT NULL, discipline_id INTEGER REFERENCES disciplines(id),
  handover_item_id INTEGER REFERENCES handover_items(id),
  warranty_from DATE, warranty_months INTEGER,               -- hạn = warranty_from + months
  guarantee_id INTEGER REFERENCES guarantees_insurances(id), -- bảo lãnh bảo hành (M28)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired')),
  note TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS warranty_claims (                -- lỗi sau bàn giao
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  warranty_item_id INTEGER REFERENCES warranty_items(id),
  code TEXT, reported_date DATE, description TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','handling','closed')),
  due_date DATE, resolution TEXT, closed_date DATE, assignee INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS om_documents (                   -- hướng dẫn O&M (pattern task_documents)
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  title TEXT NOT NULL, discipline_id INTEGER REFERENCES disciplines(id),
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS warranty_item_id INTEGER REFERENCES warranty_items(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS warranty_claim_id INTEGER REFERENCES warranty_claims(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_warranty ON notifications(user_id, type, warranty_item_id)
  WHERE warranty_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_wclaim ON notifications(user_id, type, warranty_claim_id)
  WHERE warranty_claim_id IS NOT NULL;
```

## `lib/warranty.ts`

- `listWarrantyItems`/`listClaims(projectId, filters)`/`listOmDocs`.
- `warrantyExpiry(item)` = `warranty_from + warranty_months` (tính, không lưu — so chuỗi ngày).
- `expiringWarranties(days=30)` → notification `warranty_expiry`; `overdueClaims` → notification `warranty_claim_overdue`.
- `validateWarrantyInput`/`validateClaimInput` (thuần).

## API

| Route                                                             | Quyền                                         | Ghi chú                       |
| ----------------------------------------------------------------- | --------------------------------------------- | ----------------------------- |
| `GET/POST /api/warranty-items` + `.../:id`                        | ghi: manageWarranty                           | hạn suy từ from+months        |
| `GET/POST /api/warranty-claims` + `.../:id`                       | ghi: manageWarranty                           | vòng đời open→handling→closed |
| `GET/POST /api/om-documents` + `GET/DELETE /api/om-documents/:id` | upload: manageWarranty; GET stream: đăng nhập | pattern task_documents        |

Notification `warranty_expiry` + `warranty_claim_overdue`: on-fetch, Admin/PM (+ assignee cho claim), dedup, tự dọn.

## UI/UX (`app/warranty/page.tsx`)

Hub 3 tab: **Bảo hành** (danh mục hạng mục + badge hạn theo hệ + bảo lãnh gắn), **Claim** (lỗi sau bàn giao: bảng + severity màu + vòng đời, quá hạn nổi đầu), **O&M** (thư viện hướng dẫn upload/xem). KPI strip: số hạng mục sắp hết bảo hành + số claim đang xử lý. Sidebar cụm **Bàn giao & Vận hành**.

## Test (`tests/warranty.test.ts`)

Thuần: `warrantyExpiry` tính đúng, validate. Tích hợp: `expiringWarranties`/`overdueClaims` xuất hiện/tự dọn, dedup. `e2e/authed/warranty.spec.ts` desktop+mobile+axe.

## Chia PR

1. Migration + `lib/warranty.ts` + API + test.
2. Trang `/warranty` + 2 notification + O&M docs + sidebar (đổi status node) + e2e.

## Điểm cần quyết & mặc định đã chọn

- **Hạn bảo hành suy từ `from + months`** (không lưu ngày hết) — đổi tháng bảo hành thì hạn tự đổi.
- **Claim tách khỏi NCR (M03)** — NCR là trong thi công, claim là sau bàn giao (khác vòng đời/quyền); cùng pattern nhưng bảng riêng.
- **O&M docs bảng riêng** — phân loại theo hệ, khác `project_documents` chung (M20); hoặc có thể là `doc_category` mới trong `project_documents` nếu muốn gộp kho (ghi chú — mặc định tách cho rõ).
