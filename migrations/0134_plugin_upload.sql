-- 0134_plugin_upload.sql — M99 PR5: plugin AutoCAD tải DWG + DXF sidecar lên sổ bản vẽ.
--
-- 3 cột theo kế hoạch M99 §11 + 2 cột phục vụ luồng thật:
--   - content_sha256: idempotency theo NỘI DUNG DWG (M99 §10 — tải lại cùng tệp không tạo
--     revision trùng); index một phần vì chỉ revision từ plugin mới có hash.
--   - dxf_file_name: tên tệp DXF sidecar trong lớp storage (server kiểm bằng ezdxf mà
--     không cần đọc DWG — ADR-0006 nguyên tắc 2).
--
-- Thêm thuần (ADD COLUMN / CREATE INDEX) — đi thẳng production theo DoD.

ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS rule_pack_version TEXT;
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS standardize_report JSONB;
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS source_tool TEXT;  -- 'plugin' | 'server'
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS content_sha256 TEXT;
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS dxf_file_name TEXT;

CREATE INDEX IF NOT EXISTS idx_drawing_revisions_sha256
  ON drawing_revisions (content_sha256)
  WHERE content_sha256 IS NOT NULL;
