# M3 — QA&QC + hồ sơ chất lượng (T&C, phiếu YCNT, chuyển bước)

**Đợt 2 · Phụ thuộc: — (M11 tái dùng checklist engine) · Phức tạp: Cao (≥5 PR)**

## Mục tiêu

Chuỗi chất lượng khép kín: checklist nghiệm thu theo công tác (ITP) → phiếu yêu cầu nghiệm thu gửi TVGS → nghiệm thu (đạt / không đạt → NCR) → **hold point chuyển bước** → hồ sơ chất lượng tổng hợp/hoàn công. T&C ACMV là một category checklist.

## Hiện trạng & điểm chạm

- Nghiệm thu 2 bước sẵn có: `POST/DELETE /api/tasks/:id/approve` (`CAN.approve`, cần 100%, audit `task_history`) + duyệt lô `/api/approvals` + trang `/approvals` + biên bản `task_documents`. **Module này BỌC THÊM điều kiện, không thay thế.**
- `floor_approvals` (nghiệm thu theo tầng) + `package_dependencies` (Gantt) + `lib/cpm.ts`.
- Upload: pattern `task_documents` (PDF/ảnh 20MB); ảnh `task_photos`.

## Schema (`migrations/000N_qaqc.sql`)

```sql
CREATE TABLE IF NOT EXISTS qc_checklists (           -- MẪU checklist
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'work'               -- work | tc | hse (M11)
    CHECK (category IN ('work','tc','hse')),
  system_group TEXT,                                   -- áp cho hệ nào
  items JSONB NOT NULL DEFAULT '[]',                   -- [{label, type:'pass_fail'|'measure', unit?, design_value?}]
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS qc_inspections (          -- LẦN kiểm tra
  id SERIAL PRIMARY KEY,
  checklist_id INTEGER NOT NULL REFERENCES qc_checklists(id),
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  work_package_id INTEGER REFERENCES work_packages(id) ON DELETE CASCADE,
  results JSONB NOT NULL DEFAULT '[]',                 -- [{label, pass, measured?, note?}]
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','passed','failed')),
  inspected_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),            -- Admin/PM xác nhận
  inspected_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (task_id IS NOT NULL OR work_package_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS inspection_requests (     -- phiếu YCNT gửi TVGS
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                           -- YCNT-0001 (lib/seqcode.ts sẵn có)
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','confirmed','passed','failed','cancelled')),
  note TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS inspection_request_tasks (
  request_id INTEGER NOT NULL REFERENCES inspection_requests(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, task_id)
);
CREATE TABLE IF NOT EXISTS ncrs (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                           -- NCR-0001
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  inspection_id INTEGER REFERENCES qc_inspections(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  assigned_to INTEGER REFERENCES users(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','fixing','recheck','closed')),
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(), closed_at TIMESTAMPTZ
);
ALTER TABLE package_dependencies ADD COLUMN IF NOT EXISTS requires_handover BOOLEAN NOT NULL DEFAULT FALSE; -- hold point
ALTER TABLE task_documents ADD COLUMN IF NOT EXISTS doc_category TEXT; -- vat_lieu|cong_viec|giai_doan|chuyen_buoc|hoan_cong
```

Ảnh NCR/inspection: tái dùng `task_photos` thêm cột tham chiếu hoặc bảng nối — quyết khi code.

## API (route mới đều theo quy ước chung)

| Route | Quyền chính | Ghi chú |
|---|---|---|
| `/api/qc/checklists` CRUD | Admin/PM tạo/sửa; mọi người xem | |
| `/api/qc/inspections` POST/PATCH | `canTouchTask` (subcon tự kiểm task mình); duyệt `passed/failed`: `CAN.approve` | transaction + FOR UPDATE |
| `/api/inspection-requests` CRUD | tạo: Admin/PM/engineer; đổi trạng thái: Admin/PM | task phải 100%; xuất PDF phiếu |
| `/api/ncrs` CRUD | tạo: mọi vai trò thao tác; đóng: Admin/PM | notification quá hạn kiểu `delayed` |

**Gate tích hợp (điểm chạm logic sẵn có):**
- `POST /api/tasks/:id/approve` thêm điều kiện: nếu task/nhóm có checklist bắt buộc → phải có inspection `passed` (bật/tắt qua setting).
- **Hold point chuyển bước**: các route ghi tiến độ (`dimensions/:id`, `dimensions/batch`, `tasks/:id/progress`) check: nếu package có dependency `requires_handover=TRUE` mà predecessor chưa có biên bản chuyển bước (`task_documents.doc_category='chuyen_buoc'` + inspection passed) → 409 kèm thông điệp nêu rõ chờ biên bản nào. Check viết 1 hàm `lib/qaqc.ts:handoverBlocked(packageId)` dùng chung.

## UI/UX

- **`/quality`** (trang chính, tab): ① Checklist mẫu (Admin/PM quản lý, editor items dạng dòng thêm/xoá/kéo thứ tự) ② Kiểm tra (danh sách inspection theo trạng thái, form kiểm trên mobile: mỗi item 1 hàng to, nút Đạt/Không đạt + ô đo số, chụp ảnh ngay) ③ Phiếu YCNT (lịch + trạng thái, nút xuất PDF) ④ NCR (bảng vòng đời, badge màu + icon; quá hạn nổi đầu) ⑤ Hồ sơ (lọc theo tầng/hệ/loại, nút "Xuất hồ sơ tầng" → zip/PDF).
- **Lưới tracking**: ô thuộc package bị hold-point khoá → checkbox disabled + tooltip "Chờ biên bản chuyển bước: <tên bước trước>"; hàng nhóm có icon khiên trạng thái QC.
- Form kiểm hiện trường **ưu tiên mobile tuyệt đối**: 1 cột, nút ≥48px, hoạt động chậm-mạng (submit qua try/catch + toast; cân nhắc đưa vào offline queue giai đoạn sau).
- T&C: checklist `category='tc'` có cột thông số đo vs thiết kế — hiển thị lệch % ngay khi nhập.

## Test

- Unit: `handoverBlocked` logic (mock), validate items JSONB.
- Integration: gate approve (task đủ 100% nhưng inspection fail → 403/409), hold point chặn tick, NCR vòng đời, YCNT chỉ nhận task 100%.

## Chia PR

1. Checklist engine (schema checklist/inspection + API + tab ①② + test).
2. Gate nghiệm thu + hold point chuyển bước (cột `requires_handover`, chặn tick, UI khoá lưới + Gantt đánh dấu).
3. Phiếu YCNT + PDF.
4. NCR + notification.
5. Hồ sơ chất lượng (phân loại + trang tổng hợp + xuất hồ sơ tầng).
6. T&C category + form thông số đo.

## Điểm cần quyết

- Bật gate "approve cần inspection" cho toàn bộ hay chỉ hệ được chọn? (đề xuất: cấu hình theo checklist mẫu — mẫu nào đánh dấu `required` thì gate).
- Mẫu PDF phiếu YCNT/biên bản: cần file mẫu công ty đang dùng.
