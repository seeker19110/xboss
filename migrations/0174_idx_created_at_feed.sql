-- Perf G3/P7: feed hoạt động (/api/notifications/feed) lọc created_at >= 48h ORDER BY
-- created_at DESC LIMIT — trước đây chỉ có index task_id. Chỉ thêm index.
CREATE INDEX IF NOT EXISTS idx_task_photos_created ON task_photos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_comments_created ON task_comments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_documents_created ON task_documents (created_at DESC);
