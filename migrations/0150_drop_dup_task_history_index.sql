-- 0150_drop_dup_task_history_index.sql — dọn 1 index bị bao trọn (đợt audit 2026-09-05).
-- `idx_history_task(task_id)` (0001_baseline.sql) là TIỀN TỐ của `idx_task_history_task_changed
-- (task_id, changed_at DESC)` (0055_matviews.sql): mọi truy vấn lọc/join theo `task_id` đều
-- dùng được index ghép, nên index 1 cột chỉ còn là chi phí GHI thuần tuý — mà `task_history`
-- được INSERT mỗi lần % task đổi (tick checkbox, đường ghi nóng nhất của app).
-- Cùng lớp lỗi đã dọn cho `tasks` ở 0081_drop_dup_tasks_date_indexes.sql.
--
-- CHỈ DROP INDEX (không đụng dữ liệu) → đi thẳng production theo DoD (CLAUDE.md).
DROP INDEX IF EXISTS idx_history_task;
