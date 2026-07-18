-- 0071_extracted_text.sql — M57 PR2: tìm trong nội dung file PDF đính kèm.
--
-- Cột `extracted_text` lưu text-layer trích từ PDF lúc upload (lib/pdf-extract.ts,
-- 10 trang đầu, timeout 5s). PDF không có text layer (scan ảnh thuần)/lỗi parse →
-- NULL, không lỗi upload. Chỉ 3 bảng tài liệu đính kèm PDF trong phạm vi PR2.
ALTER TABLE task_documents ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE contract_documents ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS extracted_text TEXT;

-- Chỉ project_documents đã có nguồn tìm kiếm sẵn trong registry (lib/search.ts, kind
-- "document", M57 PR1) — mở rộng cols để gồm extracted_text nên cần index GIN mới
-- khớp CHÍNH XÁC biểu thức mới (bất biến neo 2 chiều, xem lib/search.ts::ftsExpr).
-- Index title-only cũ (idx_project_documents_fts, 0068_fts.sql) giữ nguyên
-- (append-only) nhưng không còn được planner chọn cho query search nữa.
--
-- task_documents/contract_documents CHƯA có nguồn tương ứng trong registry (canView
-- theo role không đủ cho task_documents — subcon chỉ được xem task được giao, cần
-- kiểm per-row qua canTouchTask mà SearchSource.canView(role) hiện không hỗ trợ; xem
-- báo cáo PR2) nên chưa tạo index FTS cho 2 bảng này — cột vẫn được ghi đầy đủ, sẵn
-- sàng cho khi registry được mở rộng đúng thiết kế phân quyền.
CREATE INDEX IF NOT EXISTS idx_project_documents_fts_text ON project_documents
  USING gin (to_tsvector('simple', xboss_unaccent(coalesce(title,'') || ' ' || coalesce(extracted_text,''))));
