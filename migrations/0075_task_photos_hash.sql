-- 0075_task_photos_hash.sql — chống trùng ảnh hiện trường khi hàng đợi offline
-- (offlineQueue enqueuePhoto) retry/gửi lại cùng ảnh: lưu hash nội dung file, dùng
-- để dedupe trong POST /api/tasks/:id/photos (cùng task + cùng hash trong 24h →
-- trả lại ảnh đã có, không ghi file/dòng mới). Thêm thuần tuý (ADD COLUMN nullable
-- + CREATE INDEX) → idempotent, đi thẳng production.
ALTER TABLE task_photos ADD COLUMN IF NOT EXISTS sha256 TEXT;
CREATE INDEX IF NOT EXISTS idx_task_photos_task_hash
  ON task_photos(task_id, sha256) WHERE sha256 IS NOT NULL;
