-- 0081_drop_dup_tasks_date_indexes.sql — dọn 2 index trùng cột do 0079 tạo (đợt audit
-- 2026-08-09). `idx_tasks_start_date`/`idx_tasks_end_date` (0079_lookahead_indexes.sql) trùng
-- HỆT cột với `idx_tasks_start` (0003_idx_tasks_start.sql) và `idx_tasks_end`
-- (0001_baseline.sql) đã có sẵn — `CREATE INDEX IF NOT EXISTS` chỉ kiểm TRÙNG TÊN, không kiểm
-- trùng cột, nên 0079 âm thầm tạo thêm 2 B-tree thừa trên `tasks` (bảng bị ghi nhiều nhất —
-- tick checkbox). Giữ nguyên `idx_tasks_start`/`idx_tasks_end` (tên cũ, mọi nơi khác không
-- tham chiếu trực tiếp tên index nên đổi index không ảnh hưởng code).
--
-- CHỈ DROP INDEX (không đụng dữ liệu) → đi thẳng production theo DoD (CLAUDE.md), không cần
-- qua staging trước.
DROP INDEX IF EXISTS idx_tasks_start_date;
DROP INDEX IF EXISTS idx_tasks_end_date;
