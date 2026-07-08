# M23 — Khởi động & Pháp lý

**Cụm B · Phụ thuộc: không (nên có project_id sẵn nếu M22 đã chạy) · Phức tạp: Trung bình (2 PR)**

## Mục tiêu

Dashboard giai đoạn khởi động dự án: **hồ sơ pháp lý** (giấy phép XD, phê duyệt quy hoạch/thiết kế, HĐ chính) + cảnh báo hết hạn; **bàn giao mặt bằng** (biên bản, mốc giới); **khảo sát** (địa chất, công trình lân cận); **trắc đạc & mốc chuẩn** (lưới khống chế, tim–cốt–cao độ); **huy động công trường** (checklist). Đổi node `dash.khoi-dong` từ "coming-soon" → "available".

## Hiện trạng & điểm chạm

- Upload file: pattern `task_documents` + `lib/photos.ts` (server sinh tên, whitelist PDF/ảnh, max 20MB, `data/uploads/`).
- Cảnh báo hết hạn giấy phép: cơ chế on-fetch dedup/tự dọn của `/api/notifications` (như `contract_expiry`).
- Trắc đạc/mốc chuẩn: có thể gắn `work_fronts` (M14) như một loại front — hoặc bảng riêng (xem Điểm cần quyết → chọn bảng riêng để không lẫn ngữ nghĩa mặt bằng thi công).
- Quyền: xem mọi vai trò đăng nhập; ghi Admin/PM (`CAN.manageKickoff` mới).

## Schema (`migrations/0028_kickoff.sql`)

```sql
CREATE TABLE IF NOT EXISTS legal_documents (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('giay_phep_xd','phe_duyet_qh','phe_duyet_tk','hd_chinh','khac')),
  code TEXT, title TEXT NOT NULL,
  issued_by TEXT, issued_date DATE, expiry_date DATE,     -- expiry_date NULL = không hạn
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('draft','valid','expired','superseded')),
  note TEXT,
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER, -- 1 file chính (pattern gọn)
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS mobilization_items (          -- checklist huy động công trường
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  category TEXT NOT NULL CHECK (category IN ('mat_bang','khao_sat','trac_dac','huy_dong','khac')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done')),
  due_date DATE, done_date DATE, assignee INTEGER REFERENCES users(id), note TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS legal_document_id INTEGER REFERENCES legal_documents(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_legal ON notifications(user_id, type, legal_document_id)
  WHERE legal_document_id IS NOT NULL;
```

## `lib/kickoff.ts`

- `listLegalDocuments(projectId, filters)` / `listMobilization(projectId)`.
- `expiringLegalDocs(projectId, days=30)`: `status='valid' AND expiry_date <= todayISO()+days` (so sánh chuỗi ngày) — kèm cả đã quá hạn; nguồn notification `legal_expiry`.
- `validateLegalInput` (thuần): kind hợp lệ, `issued_date ≤ expiry_date`, title không rỗng.
- `kickoffReadiness(projectId)`: % hoàn thành checklist huy động (số done / tổng) — hiển thị KPI hub.

## API

| Route                                                               | Quyền                                 | Ghi chú                              |
| ------------------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| `GET/POST /api/legal-documents`                                     | GET: đăng nhập; POST: `manageKickoff` | GET `?kind=` lọc                     |
| `GET/PATCH/DELETE /api/legal-documents/:id`                         | PATCH/DELETE: manageKickoff           | file 1 phần trong record (multipart) |
| `GET/POST /api/mobilization` + `PATCH/DELETE /api/mobilization/:id` | ghi: manageKickoff                    | đánh done set `done_date`            |

Notification `legal_expiry`: on-fetch, vai trò Admin/PM, dedup theo `legal_document_id`, tự dọn khi gia hạn/đổi status.

## UI/UX (`app/kickoff/page.tsx`)

Hub 5 tab: **Pháp lý** (bảng giấy phép + badge hạn đỏ/amber + upload/xem file), **Bàn giao mặt bằng** / **Khảo sát** / **Trắc đạc** (dùng chung `mobilization_items` lọc theo `category` — thẻ trạng thái + gán người + hạn), **Huy động** (checklist progress). KPI strip: % sẵn sàng huy động + số giấy phép sắp hết hạn. Sidebar mục "Khởi động & Pháp lý" cụm **Khởi động & Tổ chức**.

## Test (`tests/kickoff.test.ts`)

Thuần: `validateLegalInput` đủ ca. Tích hợp: `expiringLegalDocs` xuất hiện/tự dọn đúng; `kickoffReadiness` tính đúng %; notification `legal_expiry` dedup. `e2e/authed/kickoff.spec.ts` (desktop+mobile+axe).

## Chia PR

1. Migration + `lib/kickoff.ts` + API + test.
2. Trang `/kickoff` + notification + sidebar (đổi status node) + e2e.

## Điểm cần quyết & mặc định đã chọn

- **Trắc đạc/mốc chuẩn dùng `mobilization_items` (bảng riêng), không nhồi vào `work_fronts`** — ngữ nghĩa khác (mặt bằng thi công vs mốc khởi động), tránh lẫn. Nếu PM cần liên kết mốc trắc đạc với tầng thi công thì thêm FK sau.
- **1 file chính/giấy phép** (không bảng documents riêng như hợp đồng) — YAGNI; nếu cần nhiều file/giấy phép thì tách bảng `legal_document_files` sau.
- Ngưỡng cảnh báo hạn **30 ngày** (hằng số).
