-- M57 PR1 — Hạ tầng tìm kiếm toàn văn (FTS) có index.
--
-- Extension unaccent bỏ dấu 2 phía (index lẫn query) để "nghiem thu" khớp "nghiệm
-- thu". unaccent() gốc là STABLE nên Postgres từ chối dùng trực tiếp trong index
-- biểu thức → bọc bằng hàm IMMUTABLE xboss_unaccent().
--
-- ⚠ BẤT BIẾN CỨNG (neo 2 chiều với lib/search.ts::ftsExpr):
--   Mỗi index dưới đây tạo trên biểu thức
--     to_tsvector('simple', xboss_unaccent(coalesce(col1,'') || ' ' || coalesce(col2,'') ...))
--   PHẢI khớp CHÍNH XÁC (cùng danh mục cột, cùng thứ tự) với biểu thức mà
--   ftsExpr(cols) trong lib/search.ts sinh ra cho nguồn tương ứng — lệch cột/thứ tự
--   thì planner bỏ index (seq scan). Đổi cột nguồn nào PHẢI đổi ĐỒNG THỜI cả 2 nơi.
--
-- CONCURRENTLY: runner migrate (lib/db/migrate.ts) bọc mỗi file trong 1 transaction
-- BEGIN/COMMIT nên CREATE INDEX CONCURRENTLY (không chạy được trong transaction) bị
-- loại. Khối lượng dữ liệu XBoss chỉ vài dự án (xem docs/nang-cap/M57 — "nằm gọn
-- trong năng lực Postgres FTS") nên CREATE INDEX thường (khoá ghi bảng vài chục ms)
-- là đủ, giữ migration nguyên tử + idempotent. Migration thuần thêm (extension/hàm/
-- index) → đi thẳng production theo CLAUDE.md.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Bọc IMMUTABLE + PARALLEL SAFE + STRICT để dùng được trong index biểu thức.
CREATE OR REPLACE FUNCTION xboss_unaccent(text) RETURNS text AS
  $$ SELECT unaccent('unaccent', $1) $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- WBS: nâng FTS tasks/work_packages từ name-only (không dấu) sang biểu thức gộp
-- mã + BOQ + tên, bỏ dấu. Index cũ idx_tasks_fts/idx_wp_fts (0001_baseline) giữ
-- nguyên (append-only), search dùng index _ua mới này.
CREATE INDEX IF NOT EXISTS idx_tasks_fts_ua ON tasks
  USING gin (to_tsvector('simple', xboss_unaccent(coalesce(code,'') || ' ' || coalesce(boq_code,'') || ' ' || coalesce(name,''))));
CREATE INDEX IF NOT EXISTS idx_wp_fts_ua ON work_packages
  USING gin (to_tsvector('simple', xboss_unaccent(coalesce(code,'') || ' ' || coalesce(boq_code,'') || ' ' || coalesce(name,''))));

-- Hợp đồng (chỉ PAYMENT_VIEW_ROLES ở tầng route). Cột thật: title (không "name"),
-- party_name (không "contractor"). Soft-delete qua deleted_at.
CREATE INDEX IF NOT EXISTS idx_contracts_fts ON contracts
  USING gin (to_tsvector('simple', xboss_unaccent(coalesce(code,'') || ' ' || coalesce(title,'') || ' ' || coalesce(party_name,''))));

-- Công văn. Cột thật: subject + note (không "content").
CREATE INDEX IF NOT EXISTS idx_correspondences_fts ON correspondences
  USING gin (to_tsvector('simple', xboss_unaccent(coalesce(code,'') || ' ' || coalesce(subject,'') || ' ' || coalesce(note,''))));

-- Biên bản họp. Cột thật: content (không "minutes").
CREATE INDEX IF NOT EXISTS idx_meetings_fts ON meetings
  USING gin (to_tsvector('simple', xboss_unaccent(coalesce(title,'') || ' ' || coalesce(content,''))));

-- Nhật ký công trường. Cột nội dung thật: work_done + obstacles + safety_note.
CREATE INDEX IF NOT EXISTS idx_site_diaries_fts ON site_diaries
  USING gin (to_tsvector('simple', xboss_unaccent(coalesce(work_done,'') || ' ' || coalesce(obstacles,'') || ' ' || coalesce(safety_note,''))));

-- NCR. Cột thật: code + description (không có "title").
CREATE INDEX IF NOT EXISTS idx_ncrs_fts ON ncrs
  USING gin (to_tsvector('simple', xboss_unaccent(coalesce(code,'') || ' ' || coalesce(description,''))));

-- Vật tư.
CREATE INDEX IF NOT EXISTS idx_materials_fts ON materials
  USING gin (to_tsvector('simple', xboss_unaccent(coalesce(boq_code,'') || ' ' || coalesce(name,''))));

-- Bản vẽ.
CREATE INDEX IF NOT EXISTS idx_drawings_fts ON drawings
  USING gin (to_tsvector('simple', xboss_unaccent(coalesce(code,'') || ' ' || coalesce(name,''))));

-- Tài liệu dự án. Cột thật: title (không "name").
CREATE INDEX IF NOT EXISTS idx_project_documents_fts ON project_documents
  USING gin (to_tsvector('simple', xboss_unaccent(coalesce(title,''))));

-- Bình luận task. Cột thật: body (không "content").
CREATE INDEX IF NOT EXISTS idx_task_comments_fts ON task_comments
  USING gin (to_tsvector('simple', xboss_unaccent(coalesce(body,''))));
