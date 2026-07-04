# M6 — Phát sinh / thay đổi khối lượng (VO)

**Đợt 3 · Phụ thuộc: M1, M2 · Phức tạp: Trung bình**

## Mục tiêu

Ghi nhận khối lượng ngoài hợp đồng gốc ngay tại hiện trường → trình CĐT/TVGS → duyệt → tự cộng vào ngân sách/KL nhận thầu (M1/M2), tách rõ "HĐ gốc" vs "gốc + VO".

## Hiện trạng & điểm chạm

- `boq_items` (M1) — dòng VO dùng chung cấu trúc; `lib/cost.ts` (M2) — ngân sách phải cộng VO đã duyệt; vòng đời duyệt mượn pattern nghiệm thu 2 bước (`CAN.approve`); mã tự tăng `lib/seqcode.ts`.

## Schema (`migrations/000N_vo.sql`)

```sql
CREATE TABLE IF NOT EXISTS variation_orders (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,            -- VO-0001
  title TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('design_change','client_request','site_condition','other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','partially_approved','rejected','contract_added')),
  submitted_at DATE, decided_at DATE,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS vo_id INTEGER REFERENCES variation_orders(id) ON DELETE CASCADE; -- dòng BOQ thuộc VO
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS qty_approved NUMERIC(15,3);   -- KL được duyệt (≤ đề xuất khi duyệt một phần)
CREATE TABLE IF NOT EXISTS vo_documents ( -- văn bản trình/phản hồi CĐT
  id SERIAL PRIMARY KEY,
  vo_id INTEGER NOT NULL REFERENCES variation_orders(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, file_name TEXT NOT NULL, mime TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Quy tắc tổng hợp (sửa `lib/boq.ts`/`lib/cost.ts`): ngân sách/KL nhận thầu = dòng gốc (`vo_id IS NULL`) + dòng VO có `status IN ('approved','partially_approved','contract_added')` (lấy `qty_approved`); mọi query M1/M2 thêm tham số `includeVo` (mặc định true, UI có toggle).

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| `/api/variations` GET/POST | tạo: Admin/PM/engineer; xem: mọi user | POST kèm dòng BOQ con (transaction) |
| PATCH `/api/variations/:id` | draft: người tạo/Admin/PM; sau submit: chỉ Admin/PM | |
| POST `/api/variations/:id/submit` · `/decide` | submit: Admin/PM; decide (approved/partial/rejected + qty_approved từng dòng): `CAN.approve` | audit; partial bắt nhập qty_approved |
| POST/DELETE `.../:id/documents` | như PATCH | văn bản trình + phản hồi CĐT |

Notification `vo_pending`: VO `submitted` quá N ngày (mặc định 7) chưa decided → nhắc Admin/PM.

## UI/UX (`app/variations/page.tsx`)

- Header: 4 thẻ tổng giá trị VO theo trạng thái (Nháp / Đã trình / Được duyệt / Từ chối) — con số đàm phán của PM.
- Bảng VO: mã, tên, lý do (badge), giá trị đề xuất vs được duyệt, trạng thái (stepper mini), ngày trình/quyết.
- Form tạo VO (mobile được — kỹ sư ghi nhận tại hiện trường): tên + lý do + mô tả + dòng KL (mã/tên/ĐVT/KL/đơn giá — thêm dòng động) + đính kèm ảnh/văn bản.
- Màn hình duyệt (Admin/PM): từng dòng có ô `qty_approved` prefill = đề xuất; duyệt một phần sửa số trực tiếp; confirm dialog tổng giá trị trước khi chốt.
- `/boq` (M1): dòng VO hiển thị badge "VO" + toggle "Gồm VO" trên header; `/costs` (M2) tương tự.

## Test

- Integration: tạo VO kèm dòng (rollback khi 1 dòng mã trùng); decide partial ghi `qty_approved`; tổng hợp ngân sách trước/sau duyệt đổi đúng; VO rejected không cộng.

## Chia PR

1. Schema + API vòng đời + tích hợp tổng hợp `lib/boq.ts`/`lib/cost.ts` + test.
2. Trang `/variations` + form hiện trường + màn duyệt + menu + e2e/axe.
3. Documents + notification `vo_pending` + toggle "Gồm VO" ở `/boq`, `/costs`.

## Điểm cần quyết & đã quyết liên quan

- Đơn giá VO: lấy theo đơn giá HĐ khi mã trùng công tác gốc, hay luôn nhập tay? (đề xuất: prefill từ HĐ, sửa được — chưa chốt, hỏi khi triển khai M6).
- **Đã quyết chung (2026-07-04): vai trò `cdt` không thấy giá trị VO** (xem M2/M9) — trang `/variations` giới hạn quyền xem như `/costs`.
