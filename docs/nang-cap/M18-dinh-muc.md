# M18 — Định mức thi công theo hạng mục (vật tư / nhân công / máy)

**Nhóm C · Phụ thuộc: M1 ✅, M4 ✅, M5 ✅ (nên sau M12 nếu muốn định mức máy tham chiếu danh mục thiết bị, không bắt buộc) · Phức tạp: Trung bình (3 PR)**

## Mục tiêu

FastCons quản lý "định mức vật tư, nhân công, máy thi công chi tiết từng hạng mục" — XBoss hiện chỉ có cảnh báo `material_over` ở mức **tổng vật tư** (so `qty_used` với `qty_planned`), không biết 1 đơn vị khối lượng công tác (vd 1m ống gió Ø200) tiêu chuẩn cần bao nhiêu vật tư/công/ca máy. M18 thêm định mức theo dòng BOQ, đối chiếu tiêu hao thực tế đã có sẵn (M4 cấp phát theo tầng, M5 nhân lực theo tổ đội/ngày) để biết đúng **hạng mục nào đang vượt định mức**, không phải toàn dự án chung chung.

## Hiện trạng & điểm chạm

- `boq_items` (M1) — đơn vị công tác gốc để gắn định mức.
- `material_transactions.floor_label`/`crew` (M4) — nguồn tiêu hao vật tư thực tế theo tầng/tổ đội; **chưa nối** với KL thi công theo tầng (nợ kỹ thuật ghi trong `PROGRESS.md` mục M4 — M18 giải quyết nợ này).
- `diary_manpower` (M5) — nguồn công nhân lực thực tế theo tổ đội/ngày; **chưa có danh mục máy thi công** (M12, đợt sau) — định mức máy tạm ghi số liệu tự do (không FK `equipment`), nối FK khi M12 xong.
- `material_over` (baseline, `/api/materials`) giữ nguyên (cảnh báo mức vật tư tổng) — M18 thêm cảnh báo **mới** `norm_over` ở mức hạng mục, không thay thế.

## Schema (`migrations/0014_boq_norms.sql`)

```sql
CREATE TABLE IF NOT EXISTS boq_norms (
  id SERIAL PRIMARY KEY,
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('material','labor','equipment')),
  material_id INTEGER REFERENCES materials(id),     -- bắt buộc khi resource_type='material'
  resource_name TEXT,                                -- labor/equipment: tên tự do (vd "Thợ hàn", "Máy khoan bê tông")
  qty_per_unit NUMERIC(15,4) NOT NULL,               -- định mức trên 1 đơn vị KL BOQ (vd 0.8 kg ống/m)
  unit_label TEXT NOT NULL,                          -- đơn vị định mức hiển thị (kg, công, ca máy...)
  note TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT boq_norms_material_chk CHECK (
    (resource_type = 'material' AND material_id IS NOT NULL) OR
    (resource_type <> 'material' AND resource_name IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_boq_norms_item ON boq_norms(boq_item_id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS boq_norm_id INTEGER REFERENCES boq_norms(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_norm ON notifications(user_id, type, boq_norm_id)
  WHERE boq_norm_id IS NOT NULL;
```

Không thêm cột vào `material_transactions`/`diary_manpower` — đối chiếu là **query tổng hợp** trong `lib/norms.ts`, không sinh thêm bảng giao dịch (KISS, dữ liệu nguồn đã đủ).

## `lib/norms.ts`

- `normUsage(boqItemId)`: với mỗi `boq_norms` của dòng BOQ, tính:
  - `expected = qty_per_unit × boqExecutedQty(boqItemId)` (KL thực hiện luỹ kế, tái dùng M1).
  - `actualMaterial = Σ material_transactions.delta` quy đổi theo dấu xuất kho (cùng công thức `CASE WHEN type='xuat_cong_truong' THEN -delta ELSE GREATEST(delta,0)` đã sửa ở M4) của `material_id`, lọc theo tầng nếu dòng BOQ map qua `boq_task_map` → `work_packages.floor_label` (nối nợ kỹ thuật M4).
  - `actualLabor = Σ diary_manpower.headcount` theo `crew` khớp `resource_name` (đối chiếu lỏng — công nhân lực gộp theo tổ đội, không tách theo hạng mục chính xác 100%, ghi rõ trong UI "ước tính").
  - `variancePct = (actual − expected) / expected` (NULL khi `expected = 0` — tránh chia 0).
- `overNormItems(thresholdPct = 20)`: dòng có `resource_type='material'` và `variancePct > thresholdPct/100` → nguồn notification `norm_over` (chỉ vật tư có đối chiếu tin cậy; labor để tham khảo, không cảnh báo cứng vì đối chiếu lỏng).
- `validateNormInput`: `qty_per_unit > 0`; `resource_type` hợp lệ; check CHECK constraint phía ứng dụng trước khi insert (thông điệp rõ hơn lỗi DB).

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET/POST /api/boq/:id/norms` | GET: mọi user; POST: `CAN.editStructure` (Admin/PM) | POST tạo định mức cho 1 dòng BOQ |
| `PATCH/DELETE /api/boq-norms/:id` | editStructure | |
| `GET /api/boq/:id/norm-usage` | mọi user | trả `normUsage` từng định mức của dòng BOQ |
| `GET /api/norms/over?thresholdPct=` | `viewPayments`? — **không**, mở cho mọi user thao tác vật tư (Admin/PM/Kỹ sư) vì đây là cảnh báo vận hành công trường, không phải số tiền | danh sách toàn dự án cho dashboard |

Notification `norm_over`: on-fetch trong `/api/notifications`, gửi Admin/PM/Kỹ sư (không phải `viewPayments` — khác `cost_over`, đây là cảnh báo kỹ thuật/vật tư không phải tài chính), dedup theo `boq_norm_id`.

## UI/UX

- `/boq` (M1) — modal chi tiết dòng BOQ thêm tab **"Định mức"**: bảng vật tư/nhân công/máy (loại, tên, định mức/đơn vị) + thêm dòng nhanh (chọn vật tư qua datalist có sẵn của `/materials`); cột "Đối chiếu" hiện `expected` vs `actual` + progress bar màu theo `variancePct` (icon cảnh báo khi > ngưỡng, không chỉ màu).
- Dashboard tổng (`app/page.tsx`) hoặc trang hệ (`/he/[code]`, M15): thẻ "Vật tư vượt định mức theo hạng mục" (đếm `overNormItems`, bấm vào `/boq` lọc đúng dòng).
- Sidebar: không thêm mục riêng — gắn vào `/boq` (đã có), tránh phân mảnh điều hướng.

## Test (`tests/norms.test.ts`)

- Thuần: `validateNormInput` (qty ≤ 0, thiếu material_id khi type=material, thiếu resource_name khi labor/equipment).
- Tích hợp: `normUsage` tính đúng `expected`/`actual`/`variancePct` (dựng 1 dòng BOQ + task + material_transactions mẫu); `overNormItems` xuất hiện/biến mất đúng ngưỡng; `expected=0` trả `variancePct=null` không lỗi chia 0.

## Chia PR

1. Schema + `lib/norms.ts` + API CRUD định mức + `normUsage` + test.
2. Tab "Định mức" trong modal `/boq` + đối chiếu hiển thị + e2e/axe.
3. `overNormItems` + notification `norm_over` + thẻ dashboard/trang hệ.

## Điểm cần quyết & mặc định đã chọn (2026-07-05)

- **Đối chiếu nhân công là ước tính** (gộp theo tổ đội/ngày, không tách theo hạng mục chính xác) — chấp nhận sai số, ghi rõ nhãn "ước tính" trong UI; nếu cần chính xác hơn phải chấm công theo hạng mục (ngoài phạm vi, đã quyết không làm — §4c kế hoạch gốc).
- **Ngưỡng cảnh báo mặc định 20%**, hằng số trong `lib/norms.ts` (chưa cần bảng settings — YAGNI, có thể gộp `cost_settings` sau nếu cần chỉnh theo dự án).
- **Định mức máy chưa nối FK thiết bị** (M12 chưa làm) — `resource_name` tự do tạm thời; khi M12 xong, thêm cột `equipment_id` tuỳ chọn (migration mới, không sửa bảng cũ).
- Không mở rộng `material_over` hiện có thành theo hạng mục — giữ 2 cảnh báo song song (`material_over` = tổng vật tư đơn giản, `norm_over` = theo hạng mục chi tiết) vì mục đích khác nhau, không phải trùng lặp.
