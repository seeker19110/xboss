# M1 — BOQ đầy đủ

**Đợt 1 · Phụ thuộc: — (nền cho M2/M6/M7) · Phức tạp: Trung bình-Cao**

## Mục tiêu

Nâng BOQCODE từ "mã định danh" (`lib/boq.ts`) thành **bảng khối lượng đầy đủ**: KL/đơn giá/thành tiền, 3 lớp nhận thầu–giao thầu–thực hiện, import từ Excel dự toán.

## Hiện trạng & điểm chạm

- BOQCODE duy nhất toàn hệ thống trên `tasks`/`work_packages`/`materials` — check trùng qua `boqTakenBy` (`lib/boq.ts`); giữ nguyên cơ chế, `boq_items.code` tham gia không gian mã này.
- % tiến độ task từ chuỗi `lib/recompute.ts`; import Excel hiện có `lib/import.ts` (parse serial date, nhóm vs sub-task).
- `floor_contracts` (giá trị HĐ theo tầng) hiện là nguồn giá trị duy nhất — sẽ thành dữ liệu đối chiếu, không thay thế.

## Schema (`migrations/000N_boq.sql`)

```sql
CREATE TABLE IF NOT EXISTS boq_items (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,          -- BOQCODE, cùng không gian mã với tasks/wp/materials
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  system_group TEXT,                  -- hệ (ống gió/nước/điện...) để nhóm hiển thị
  qty_contract NUMERIC(15,3) NOT NULL DEFAULT 0,   -- KL nhận thầu (với CĐT)
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  qty_sub NUMERIC(15,3) DEFAULT 0,    -- KL giao thầu phụ
  sub_unit_price NUMERIC(15,2) DEFAULT 0,
  note TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- KL thực hiện KHÔNG lưu cột — tính động: SUM(task.progress × trọng số) qua map dưới
CREATE TABLE IF NOT EXISTS boq_task_map (
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  weight NUMERIC(5,4) NOT NULL DEFAULT 1, -- tỷ trọng khi 1 dòng BOQ ↔ n task
  PRIMARY KEY (boq_item_id, task_id)
);
```

Thành tiền không lưu (tính `qty × price` lúc query — tránh lệch). `boqTakenBy` mở rộng thêm bảng `boq_items`.

## API

| Route | Method | Quyền | Ghi chú |
|---|---|---|---|
| `/api/boq` | GET | mọi user đăng nhập | list + tổng hợp KL 3 lớp, filter `?group=` |
| `/api/boq` | POST | `CAN.editStructure` (Admin/PM) | check `boqTakenBy` trước khi tạo |
| `/api/boq/:id` | PATCH/DELETE | Admin/PM | PATCH đổi code phải re-check trùng |
| `/api/boq/:id/map` | PUT | Admin/PM | ghi đè map task + weight, validate Σweight cảnh báo ≠ 1 |
| `/api/boq/import` | POST | `CAN.import` | upload Excel, dry-run trả preview trước, `?commit=1` mới ghi |

KL thực hiện: query JOIN `boq_task_map` × `tasks.progress` — viết trong `lib/boq.ts` (hàm `boqExecutedQty`) để M2/M6 tái dùng.

## UI/UX (`app/boq/page.tsx`)

- Bảng nhóm theo `system_group` (collapse như tracking): cột Mã · Tên · ĐVT · KL HĐ · Đơn giá · Thành tiền · KL giao thầu · KL thực hiện (progress bar mini + %) · chênh lệch.
- Hàng click mở panel phải: map task (search chọn task + weight), sửa nhanh đơn giá/KL (Admin/PM, `EditableText`).
- Import: modal upload → **bảng preview diff** (thêm mới/cập nhật/lỗi từng dòng, màu theo loại) → xác nhận ghi. Lỗi từng dòng hiển thị rõ (mã trùng với task nào...).
- Tổng cột footer sticky (tổng giá trị HĐ, giao thầu, thực hiện — con số PM nhìn mỗi ngày).
- Mobile: ẩn cột đơn giá/chênh lệch, giữ Mã · Tên · KL thực hiện.

## Test

- Unit: parse Excel BOQ (mở rộng `tests/import.test.ts`), tính thành tiền/KL thực hiện với weight.
- Integration (`tests/boq.test.ts`, cần `TEST_DATABASE_URL`): CRUD + check trùng mã xuyên bảng (đồng thời trả nợ kỹ thuật "thiếu test `boqTakenBy`" trong PROGRESS.md); import dry-run không ghi DB.

## Chia PR

1. Migration + `lib/boq.ts` mở rộng + API CRUD/map + test tích hợp.
2. Trang `/boq` (bảng + panel map + sửa nhanh) + menu sidebar + e2e/axe.
3. Import Excel (parser + dry-run preview + UI).

## Điểm cần quyết

- Format Excel dự toán thật (cần file mẫu từ người dùng trước PR 3).
- 1 dòng BOQ ↔ n task chia weight: mặc định chia đều hay bắt nhập tay? (đề xuất: chia đều, sửa được).
