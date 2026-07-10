-- 0039_finance_notifications.sql — M27 PR3: thông báo tạm ứng quá hạn hoàn ứng
-- (advance_overdue). Xem docs/nang-cap/M27-tai-chinh-ke-toan.md — quyết định tự chọn
-- ngưỡng "quá hạn" dựa trên advance_date (schema PR1 không có cột due_date riêng).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS advance_id INTEGER REFERENCES advances(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_advance ON notifications(user_id, type, advance_id)
  WHERE advance_id IS NOT NULL;
