-- 0079_lookahead_indexes.sql — index phòng xa cho truy vấn Lookahead/Schedule Control.
--
-- Đo thực tế trên dữ liệu Excel gốc (2.543 tasks) lẫn dữ liệu nhân bản ×10 (25.430 tasks):
-- cả /api/lookahead lẫn getScheduleControlData (lib/schedule-control.ts) đều dưới 35ms,
-- KHÔNG có nút thắt hiệu năng thật ở quy mô hiện tại — nên không cần cache/pre-computation.
-- EXPLAIN ANALYZE ở mức ×10 cho thấy Postgres Seq Scan toàn bảng tasks lọc theo
-- status/progress_percent (chưa có index) dù vẫn nhanh; thêm index ở đây để chuẩn bị cho
-- quy mô lớn hơn, chi phí gần bằng 0 với cỡ bảng hiện tại.
--
-- CHỈ CREATE INDEX (thêm thuần tuý, không đụng dòng dữ liệu hiện có) → đi thẳng production,
-- không cần qua staging trước (xem CLAUDE.md DoD).
CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON tasks(start_date);
CREATE INDEX IF NOT EXISTS idx_tasks_end_date ON tasks(end_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
