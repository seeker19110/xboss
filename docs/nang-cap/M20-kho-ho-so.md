# M20 — Kho hồ sơ dự án (Drive)

**Nhóm B · Phụ thuộc: nên sau M8 (để gồm bản vẽ) — không bắt buộc, làm được ngay với các loại file đã có · Phức tạp: Thấp-Trung bình (2 PR)**

## Mục tiêu

FastCons có "Drive lưu trữ tài liệu, hồ sơ dự án". XBoss đã có nhiều loại file (biên bản nghiệm thu `task_documents`, hồ sơ chất lượng M3, hợp đồng M16, bản vẽ M8 khi xong...) nhưng **phân tán theo từng module**, không có nơi tra cứu tổng hợp. M20 là **view hợp nhất + 1 bảng file tự do cấp dự án** — không di trú dữ liệu cũ, không đổi cấu trúc lưu trữ hiện có (mỗi module giữ nguyên bảng/route riêng).

## Hiện trạng & điểm chạm

- File hiện có theo pattern `task_documents`/`lib/photos.ts` (server sinh tên, `data/uploads/`, whitelist mime, GET stream kiểm quyền) — M20 **đọc chéo** các bảng này qua UNION, không tạo bảng trung gian đồng bộ (tránh lệch dữ liệu 2 nơi).
- Các bảng nguồn tại thời điểm viết đặc tả: `task_documents` (biên bản nghiệm thu + hồ sơ chất lượng M3, có `doc_category`), `contract_documents` (M16), `vo_documents` (M6, nếu đã làm), `drawings`/`drawing_revisions` (M8, nếu đã làm). Module nào chưa triển khai thì nguồn tương ứng bỏ qua (không lỗi — pattern "khối null/rỗng thì UI ẩn" quen thuộc của `lib/disciplines.ts`).
- Quyền xem từng file **giữ nguyên logic gốc của bảng đó** (`canTouchTask`/`viewPayments`/...) — M20 không nới lỏng quyền, chỉ tổng hợp danh sách rồi lọc theo quyền người xem trước khi trả về.

## Schema (`migrations/0016_project_documents.sql`)

```sql
-- Chỉ 1 bảng mới: file tự do cấp dự án (không thuộc task/HĐ/bản vẽ cụ thể nào)
-- — vd văn bản pháp lý chung, hồ sơ năng lực, biểu mẫu công ty.
CREATE TABLE IF NOT EXISTS project_documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,                          -- nhãn tự do (vd "Pháp lý", "Biểu mẫu") — không ràng buộc enum, khác biệt với doc_category có sẵn
  file_name TEXT NOT NULL, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## `lib/documents-hub.ts`

- `listAllDocuments(filters: {discipline?, floor?, category?, q?})`: UNION các nguồn hiện có thành 1 kiểu `HubDocument = {id, source: 'task'|'contract'|'vo'|'drawing'|'project', title, category, sheetTypeId, floorLabel, mimeType, sizeBytes, createdAt, uploaderName, viewUrl}`; `viewUrl` trỏ đúng route GET gốc của từng loại (`/api/documents/:id`, `/api/contract-documents/:id`...) — **không tạo route xem file mới**, chỉ điều hướng.
- Lọc theo hệ/tầng: join ngược qua `task_documents.task_id → tasks.package_id → work_packages.(sheet_type_id, floor_label)`; các nguồn khác (`contract`, `project`) không có tầng → luôn hiện khi không lọc tầng, ẩn khi có lọc tầng cụ thể (rõ ràng hơn là giả định).
- Lọc theo quyền: với nguồn `task`, chỉ giữ dòng mà `canTouchTask(user, taskId)` true (subcon); nguồn `contract` chỉ hiện khi `CAN.viewPayments(user.role)`; nguồn `project`/`drawing` mọi user đăng nhập xem được (tài liệu chung).

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /api/documents-hub?discipline=&floor=&category=&q=` | mọi user đăng nhập (lọc quyền phía trong theo nguồn) | trả `HubDocument[]` đã lọc quyền + tìm kiếm theo `title`/`original_name` ILIKE |
| `GET/POST /api/project-documents` | GET: mọi user; POST: `CAN.editStructure` (Admin/PM) | upload file tự do cấp dự án |
| `GET/DELETE /api/project-documents/:id` | GET: mọi user (stream); DELETE: người upload hoặc Admin/PM | pattern `task_documents`/`photos.ts` |

## UI/UX (`app/documents/page.tsx`)

- Thanh lọc: hệ (chấm màu `lib/disciplineColors.ts`) / tầng / loại nguồn (Nghiệm thu, Hợp đồng, VO, Bản vẽ, Dự án) / ô tìm kiếm tên file.
- Danh sách dạng bảng dày (header sticky): icon loại file (PDF/ảnh) + tên + nguồn (badge) + hệ/tầng (nếu có) + người upload + ngày → bấm mở `viewUrl` tab mới.
- Nút "Tải lên hồ sơ dự án" (Admin/PM) mở modal upload vào `project_documents` (tiêu đề + nhãn tự do + file).
- Sidebar mục "Hồ sơ dự án" (nhóm Tài liệu — có thể gộp cạnh mục "Chất lượng"/"Bản vẽ" tuỳ vị trí lúc code).

## Test (`tests/documents-hub.test.ts`)

- Tích hợp: `listAllDocuments` gộp đúng từ ≥2 nguồn có sẵn (`task_documents`, `contract_documents`), lọc hệ/tầng đúng, lọc quyền đúng (subcon chỉ thấy task được giao, `viewer` không thấy nguồn `contract`); nguồn module chưa triển khai (bảng không tồn tại) không làm hỏng query — dùng `to_regclass` kiểm bảng tồn tại trước khi UNION động, hoặc liệt kê tĩnh nguồn đã biết tại thời điểm code (đơn giản hơn, đủ dùng vì danh sách module cố định biết trước).

## Chia PR

1. `project_documents` + `lib/documents-hub.ts` (bắt đầu với 2 nguồn đã chắc chắn tồn tại: `task_documents`, `contract_documents` — thêm nguồn `vo`/`drawing` bằng PR nhỏ riêng khi M6/M8 đã xong) + API + test.
2. Trang `/documents` + modal upload + sidebar + e2e/axe.

## Điểm cần quyết & mặc định đã chọn (2026-07-05)

- **Không UNION SQL động qua toàn bộ bảng `*_documents` bằng introspection** — liệt kê tĩnh từng nguồn trong code (đơn giản, tường minh, đúng nguyên tắc KISS của dự án); thêm nguồn mới = sửa `lib/documents-hub.ts` + 1 PR nhỏ khi module nguồn đó đã tồn tại.
- **Không nén/zip tải hàng loạt** trong đợt này (đã có tiền lệ ở M3 "Xuất hồ sơ tầng" — cũng chưa làm, ghi nợ chung) — mỗi lần xem/tải 1 file qua `viewUrl` sẵn có.
- Bảng `project_documents` **không phân loại hệ/tầng** (đúng bản chất "tài liệu chung cấp dự án") — nếu sau này cần, gắn `discipline_id` tuỳ chọn bằng migration nhỏ, chưa cần ngay (YAGNI).
