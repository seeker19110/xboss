-- 0172_idx_notif_task.sql — Index còn thiếu cho notifications.task_id.
-- Ràng buộc gốc UNIQUE (user_id, task_id, type) đứng đầu bằng user_id nên KHÔNG dùng được
-- cho các câu chỉ lọc theo task_id: xoá task/nhóm/sheet (`DELETE FROM notifications WHERE
-- task_id …` ở app/api/tasks/[id], workpackages/[id], sheets/[id]) và kiểm khoá ngoại
-- notifications.task_id → tasks(id) mỗi lần xoá task — hiện đều quét cả bảng notifications.
-- Index một phần (bỏ thông báo không gắn task: hợp đồng, PO, NCR…) để gọn.
-- Thêm thuần tuý, không đụng dòng dữ liệu → đi thẳng production được.
CREATE INDEX IF NOT EXISTS idx_notif_task ON notifications(task_id) WHERE task_id IS NOT NULL;
