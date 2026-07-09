# M33 — Hồ sơ năng lực & Đánh giá Nhà thầu phụ (NTP)

**Cụm E · Phụ thuộc: M04 (NCC), M15 (trang hệ), M16 (hợp đồng), M17 (thanh toán KL) · Phức tạp: Trung bình (2 PR)**

> ⚠️ **Lưu ý vận hành trước khi triển khai:** sidebar hiện có mục "Nhà thầu phụ" (`app/lib/dashboardTree.ts`, node `dash.nha-thau-phu`) đang bị **giữ cố ý làm mẫu "coming-soon"** cho test `e2e/authed/appshell.spec.ts` (nhiều đợt trước ghi rõ "không đụng, tránh race" — xem lịch sử PR M26/M29). Khi làm PR2 (gán `href` thật cho node này), **PHẢI đổi node mẫu "coming-soon" của test đó sang 1 node khác còn coming-soon tại thời điểm code** (kiểm `app/lib/dashboardTree.ts` lúc đó để chọn — ví dụ nếu M32/M34 đã làm trước thì "Nhà thầu phụ" là node coming-soon cuối cùng còn lại, cần chọn thay thế phù hợp hoặc thêm 1 case riêng không dùng "mẫu chung" nữa).

## Mục tiêu

Lấp khoảng trống mục E2 (`docs/ke-hoach-ia-chi-tiet-2026-07.md`): **hồ sơ năng lực NTP tập trung** (hiện rải rác trong `suppliers`/`users.supplier_id`), **đánh giá hiệu quả định kỳ** (khác `supplier_ratings` theo PO của M04 — đây là đánh giá tổng thể theo kỳ, không theo từng đơn hàng), **công nợ NTP** (view, không lưu — đã có đủ dữ liệu nguồn từ M16/M17).

## Hiện trạng & điểm chạm — tái dùng, không lặp

- `suppliers` (baseline): tên/liên hệ chung — đủ cho NCC vật tư nhưng thiếu thông tin "nhà thầu phụ" (hệ phụ trách, phạm vi tầng, sơ đồ tổ chức, người đại diện tại công trường).
- `discipline_contractors` (M01): đã có "nhà thầu phụ trách hệ, chia phạm vi tầng/khu" — **M33 KHÔNG thay bảng này**, chỉ bổ sung thông tin hồ sơ năng lực + đánh giá mà bảng đó chưa có.
- `supplier_ratings` (M04): đánh giá **theo từng PO** (giao hàng vật tư) — khác mục đích với `subcon_evaluations` mới (đánh giá **theo kỳ**, tiêu chí thi công: an toàn/chất lượng/tiến độ/nhân sự). Không gộp 2 bảng.
- Công nợ NTP = view từ `contracts` (M16, giá trị HĐ giao thầu) + `payment_certs`/`payment_bills` (M17) theo `contract_id` — tái dùng `lib/contracts.ts`/`lib/paymentcerts.ts`, không lưu lại.
- `users.supplier_id` (M01): user vai trò `subcon` gắn 1 supplier — dùng để lọc "NTP của tôi" khi user đó đăng nhập xem trang này (đối xứng cách `canTouchTask` lọc theo subcon).

## Schema (`migrations/0040_subcontractors.sql`)

```sql
-- Mở rộng suppliers hiện có bằng bảng con 1-1 (không sửa bảng suppliers — tránh đụng
-- FK/chỗ dùng suppliers cho NCC vật tư thông thường không cần các trường này).
CREATE TABLE IF NOT EXISTS subcontractor_profiles (
  supplier_id INTEGER PRIMARY KEY REFERENCES suppliers(id),
  project_id INTEGER REFERENCES projects(id),
  org_chart_note TEXT,                                       -- sơ đồ tổ chức tại công trường (mô tả text, không vẽ sơ đồ)
  site_rep_name TEXT, site_rep_phone TEXT,                    -- người đại diện tại công trường
  capability_summary TEXT,                                    -- năng lực (nhân sự/thiết bị/kinh nghiệm) — mô tả tự do
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS subcon_documents (                -- hồ sơ năng lực (pattern task_documents)
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  title TEXT NOT NULL,
  doc_kind TEXT,                                               -- giấy phép KD/chứng chỉ/hồ sơ nhân sự/khác — tự do, không CHECK cứng
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS subcon_evaluations (               -- đánh giá hiệu quả ĐỊNH KỲ (khác supplier_ratings theo PO của M04)
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  period TEXT NOT NULL,                                        -- 'YYYY-QN' hoặc 'YYYY-MM' — tự do định kỳ theo nhu cầu PM
  safety_score INTEGER CHECK (safety_score BETWEEN 1 AND 5),
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 5),
  schedule_score INTEGER CHECK (schedule_score BETWEEN 1 AND 5),
  manpower_score INTEGER CHECK (manpower_score BETWEEN 1 AND 5),
  note TEXT,
  evaluated_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_id, period)
);
```

## `lib/subcontractors.ts`

- `listSubcontractors(projectId?)` — JOIN `suppliers` + `discipline_contractors` (hệ phụ trách/phạm vi tầng, M01) + `subcontractor_profiles` (nullable — supplier chưa có hồ sơ mở rộng vẫn hiện, các cột hồ sơ trả `null`).
- `getSubcontractor(supplierId)` — đầy đủ hồ sơ + `subcon_documents` + `subcon_evaluations` (lịch sử) + **công nợ view**: tái dùng `lib/contracts.ts::listContracts`/`contractLinkCounts` lọc theo `party_supplier_id`, cộng `lib/paymentcerts.ts` để suy đã thanh toán — trả `{contractValue, paid, outstanding}` (KHÔNG viết lại công thức, chỉ gọi hàm có sẵn rồi tổng hợp).
- `avgEvaluationScore(supplierId)` — trung bình 4 tiêu chí, kỳ gần nhất + xu hướng (so kỳ trước, tuỳ chọn hiển thị, không bắt buộc).
- `upsertSubcontractorProfile`/`validateEvaluationInput` (thuần).

## API

| Route                                                                                         | Quyền                                                                      | Ghi chú                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| `GET /api/subcontractors`                                                                     | mọi vai trò đăng nhập (subcon chỉ thấy chính mình qua `users.supplier_id`) | danh sách + tổng hợp cơ bản                 |
| `GET /api/subcontractors/:supplierId`                                                         | mọi vai trò đăng nhập (subcon chỉ xem đúng mình — 403 nếu khác)            | đầy đủ hồ sơ + công nợ + đánh giá           |
| `PATCH /api/subcontractors/:supplierId/profile`                                               | admin/pm                                                                   | upsert `subcontractor_profiles`             |
| `GET/POST /api/subcontractors/:supplierId/documents` + `GET/DELETE /api/subcon-documents/:id` | ghi: admin/pm; xem: đăng nhập                                              | pattern `task_documents`                    |
| `GET/POST /api/subcontractors/:supplierId/evaluations`                                        | admin/pm/engineer (đánh giá là nội bộ, không để subcon tự đánh giá mình)   | `UNIQUE(supplier_id, period)` chặn trùng kỳ |

**Lưu ý về quyền:** `app/api/suppliers/[id]/ratings/route.ts` (M04) hiện dùng hàm `canRate` cục bộ trong file (`admin/pm/engineer`), KHÔNG có trong map trung tâm `CAN` (`lib/auth.ts`) — đây là điểm chưa nhất quán sẵn có từ M04, không phải lỗi mới. M33 có 2 lựa chọn: (a) copy pattern cục bộ tương tự cho nhanh, hoặc (b) **khuyến nghị** thêm `CAN.manageSuppliers` (admin/pm) vào map trung tâm nhân dịp này rồi dùng cho cả `profile`/`documents`, còn `evaluations` dùng check riêng (admin/pm/engineer) vì rộng hơn — không bắt buộc sửa lại `ratings/route.ts` cũ (ngoài phạm vi M33).

## UI/UX (`app/subcontractors/page.tsx`)

Danh sách NTP (card hoặc bảng — tên/hệ phụ trách/phạm vi tầng/điểm đánh giá TB gần nhất/công nợ) → modal/trang chi tiết 3 tab: **Hồ sơ** (thông tin + sơ đồ tổ chức + form sửa Admin/PM) / **Đánh giá** (lịch sử điểm theo kỳ + form thêm kỳ mới, biểu đồ đường 4 tiêu chí theo thời gian — `recharts`, pattern `SCurveChart`) / **Công nợ & Hợp đồng** (bảng HĐ liên kết + đã TT + còn lại, chỉ đọc, link sang `/contracts`). Subcon đăng nhập chỉ thấy đúng hồ sơ của mình (ẩn nút sửa). Mục sidebar: gán `href: "/subcontractors"` cho node `dash.nha-thau-phu` đã có sẵn (coming-soon từ M21) — **nhớ đổi node mẫu test theo lưu ý đầu file**.

## Test (`tests/subcontractors.test.ts`)

Thuần: `validateEvaluationInput` (điểm ngoài 1-5 bị chặn). Tích hợp: `listSubcontractors` gộp đúng `discipline_contractors` + `subcontractor_profiles` (kể cả supplier chưa có profile), `getSubcontractor` tính công nợ đúng khớp `contracts`/`payment_certs` thật, `UNIQUE(supplier_id, period)` chặn trùng kỳ đánh giá, subcon chỉ xem đúng hồ sơ mình (403 khi xin hồ sơ NTP khác).

## Chia PR

1. Migration + `lib/subcontractors.ts` + API + test.
2. Trang `/subcontractors` + gán `href` node sidebar (kèm đổi node mẫu test coming-soon) + e2e.

## Điểm cần quyết & mặc định đã chọn

- **`subcontractor_profiles` là bảng con 1-1, không sửa `suppliers`** — tránh case NCC vật tư thường (không phải NTP thi công) bị "phình" thêm cột không dùng tới.
- **Tách hẳn `subcon_evaluations` khỏi `supplier_ratings` (M04)** — 2 mục đích khác nhau (theo đơn hàng vs theo kỳ), không gộp dù tên gần giống, tránh UI/UX rối giữa 2 loại điểm.
- **Công nợ luôn là view tính lúc gọi API, không cache/lưu** — nhất quán nguyên tắc "không lặp nguồn dữ liệu" đã áp cho M27 (công nợ tài chính) và các module trước.
