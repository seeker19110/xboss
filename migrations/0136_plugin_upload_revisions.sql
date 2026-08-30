-- 0136_plugin_upload_revisions.sql — M99 PR5: nhận revision từ plugin AutoCAD.
-- Thêm thuần (ADD COLUMN) theo khối DDL M99 §11 — đi thẳng production theo DoD.

-- Revision do plugin tải lên mang kèm ngữ cảnh chuẩn hóa để server/QS đối chiếu:
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS rule_pack_version TEXT;
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS standardize_report JSONB;
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS source_tool TEXT; -- 'plugin' | 'server'

-- Idempotency theo hash nội dung DWG (M99 §12): tải lại cùng tệp không tạo revision đôi.
ALTER TABLE drawing_revisions ADD COLUMN IF NOT EXISTS content_sha256 TEXT;
CREATE INDEX IF NOT EXISTS idx_drawing_revisions_hash ON drawing_revisions(drawing_id, content_sha256);
