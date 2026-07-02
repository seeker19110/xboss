-- 0003_idx_tasks_start.sql — Thêm index còn thiếu cho tasks.start_date.
-- start_date được lọc theo khoảng và ORDER BY trong /api/lookahead và
-- /api/notifications/feed (task sắp bắt đầu) nhưng chưa có index — chỉ end_date
-- có idx_tasks_end (xem 0001_baseline.sql).
CREATE INDEX IF NOT EXISTS idx_tasks_start ON tasks(start_date);
