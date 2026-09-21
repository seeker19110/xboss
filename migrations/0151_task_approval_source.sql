-- 0151_task_approval_source.sql — phân biệt NGUỒN duyệt nghiệm thu của task (nợ kỹ thuật ghi
-- ở đợt audit 2026-09-05).
--
-- Vấn đề: `DELETE /api/floor-approvals/:id` (huỷ nghiệm thu cả tầng) hạ trạng thái MỌI task
-- trong tầng, kể cả task từng được duyệt RIÊNG LẺ qua `POST /api/tasks/:id/approve` — vì
-- schema không có gì để phân biệt hai nguồn duyệt.
--
-- Quy ước giá trị:
--   'task'  — duyệt riêng lẻ từng task (POST /api/tasks/:id/approve)
--   'floor' — duyệt cả tầng (POST /api/approvals)
--   NULL    — task chưa nghiệm thu, HOẶC đã nghiệm thu TRƯỚC migration này (không biết nguồn)
--
-- CỐ Ý KHÔNG BACKFILL: dữ liệu cũ không có thông tin để suy ra nguồn thật, và backfill đoán
-- mò là ghi dữ liệu sai vào bảng. Thay vào đó code đọc theo `COALESCE(approval_source,
-- 'floor')` — NULL được coi như duyệt-theo-tầng, tức GIỮ NGUYÊN hành vi hiện tại cho mọi
-- task nghiệm thu cũ, chỉ task duyệt riêng lẻ TỪ NAY mới được bảo vệ.
--
-- Chỉ ADD COLUMN + CREATE INDEX (không đụng dòng dữ liệu nào) → đi thẳng production theo DoD.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approval_source TEXT
  CHECK (approval_source IN ('task', 'floor'));

-- Index một phần: chỉ task đã nghiệm thu mới có giá trị, và truy vấn duy nhất cần nó là
-- "task nào trong tầng được duyệt riêng lẻ" lúc huỷ nghiệm thu tầng.
CREATE INDEX IF NOT EXISTS idx_tasks_approval_source ON tasks(approval_source)
  WHERE approval_source IS NOT NULL;
