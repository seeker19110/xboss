# M57 — Tìm kiếm toàn văn: FTS có index + phủ toàn kho hồ sơ (P2)

> **Mục tiêu**: nâng `/api/search` từ phạm vi hẹp (tasks + work_packages, `ILIKE` + `to_tsvector('simple')` **tính inline không index** — seq scan mỗi lần gõ) thành tìm kiếm toàn văn có index phủ các kho văn bản chính: hợp đồng, công văn, biên bản họp, nhật ký, NCR, tài liệu, bản vẽ, vật tư. Không thêm service (đúng ADR — không Elasticsearch; khối lượng dữ liệu vài dự án nằm gọn trong năng lực Postgres FTS).
>
> **Tiếng Việt**: dùng dictionary `simple` + extension `unaccent` (bỏ dấu 2 phía index lẫn query — "nghiem thu" khớp "nghiệm thu"). KHÔNG stemming tiếng Việt (không có dictionary chuẩn trong Postgres — chấp nhận, khớp theo từ nguyên dạng không dấu là đủ tốt cho mã hiệu + danh từ kỹ thuật).

## PR1 — Hạ tầng index + nâng search hiện có (`route: complex` — quyết định biểu thức index thống nhất)

### Migration `0067_fts.sql` (thuần thêm; CREATE INDEX trên bảng lớn dùng `CREATE INDEX CONCURRENTLY` KHÔNG chạy được trong transaction của runner migrate — kiểm tra `lib/db/migrate.ts` có bọc transaction không, nếu có thì tách bước concurrently thành script `scripts/` chạy tay lúc thấp điểm, migration chỉ tạo hàm + index cho bảng nhỏ; ghi rõ trong PR)

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
-- Hàm IMMUTABLE bọc unaccent để dùng được trong index biểu thức
-- (unaccent gốc là STABLE — Postgres từ chối index trực tiếp).
CREATE OR REPLACE FUNCTION xboss_unaccent(text) RETURNS text AS
  $$ SELECT unaccent('unaccent', $1) $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- Mỗi bảng trong phạm vi: index GIN trên tsvector biểu thức thống nhất
-- to_tsvector('simple', xboss_unaccent(coalesce(<cột1>,'') || ' ' || coalesce(<cột2>,'') ...)).
-- Đợt 1: tasks(code_excel, boq_code, name), work_packages(code_excel, boq_code, name),
-- contracts(code, name, contractor), correspondences(code, subject, content),
-- meetings(title, minutes), site_diaries(content, weather... theo cột thật — đọc ERD trước),
-- ncrs(code, title, description), materials(boq_code, name), drawings(code, name),
-- project_documents(name), task_comments(content).
```

Query search dùng **đúng cùng biểu thức** với index (lệch 1 ký tự là planner bỏ index — viết helper `ftsExpr(cols)` sinh SQL ở `lib/search.ts` mới, dùng chung cho cả migration sinh thủ công lẫn query, kèm comment neo 2 chiều).

### Điểm chạm

- `lib/search.ts` (mới): registry nguồn tìm kiếm — mỗi nguồn khai báo bảng/cột index/cột hiển thị/URL đích/quyền xem (**tái dùng đúng triết lý whitelist của `lib/reports.ts`**): nguồn tài chính (`contracts`) chỉ PAYMENT_VIEW_ROLES; mọi nguồn lọc `project_id` (trực tiếp hoặc qua chuỗi JOIN — bám bài học `project-scope-invariant`) + soft-delete. Xếp hạng `ts_rank` + ưu tiên khớp mã chính xác (mã hiệu vẫn qua nhánh ILIKE prefix hiện có — giữ, vì FTS tách token kém với mã kiểu `A1,03`).
- `app/api/search/route.ts`: giữ nguyên shape kết quả cũ cho tasks/work_packages (client `GlobalSearch` không đổi đột ngột), thêm nhóm kết quả mới theo nguồn.
- `app/components/GlobalSearch.tsx`: nhóm kết quả theo loại (icon lucide theo module), điều hướng đúng trang đích từng loại, giữ keyboard navigation + a11y hiện có.

### Test + tiêu chí

- `tests/search.test.ts` (integration): (1) "nghiem thu" khớp bản ghi chứa "nghiệm thu" và ngược lại; (2) kết quả tôn trọng project scope (2 dự án không lẫn) + soft-delete; (3) engineer không thấy nhóm hợp đồng, admin thấy; (4) `EXPLAIN` xác nhận dùng index GIN (assert plan chứa `Bitmap Index Scan` trên bảng có ≥ N dòng seed).
- Verify UI thật: gõ có dấu/không dấu ra cùng kết quả; thời gian phản hồi trên DB seed < 200ms.

## PR2 — Tìm trong nội dung file đính kèm (`route: standard`, TUỲ CHỌN — quyết định sau khi PR1 dùng thật)

- Phạm vi hẹp có chủ đích: chỉ PDF text-layer (biên bản, hợp đồng scan CÓ chữ) — extract text lúc upload (pdf-parse, chạy trong route upload, giới hạn N trang đầu + timeout) vào cột `extracted_text` của `task_documents`/`contract_documents`/`project_documents`, index như PR1. KHÔNG OCR ảnh scan (cần service ngoài — ghi backlog, cân nhắc cùng đợt AI).
- Tiêu chí: upload PDF có text → tìm được theo nội dung; PDF scan ảnh → bỏ qua êm, không lỗi upload.
