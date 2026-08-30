-- 0142_drawing_revision_withdrawn.sql — cho phép chính kỹ sư đã tải lên tự thu hồi (rút lại)
-- revision bản vẽ do mình gửi khi còn "submitted"/"commented" (chưa Admin/PM quyết định),
-- thay vì chỉ Admin/PM "Từ chối" được. Xem lib/ky-thuat/drawings.ts (withdrawRevision).
--
-- Thêm giá trị 'withdrawn' vào CHECK constraint sẵn có trên drawing_revisions.status. Chỉ đổi
-- ràng buộc schema, KHÔNG đụng dữ liệu hiện có — idempotent (DROP IF EXISTS rồi ADD), đi thẳng
-- production theo DoD.

ALTER TABLE drawing_revisions DROP CONSTRAINT IF EXISTS drawing_revisions_status_check;
ALTER TABLE drawing_revisions ADD CONSTRAINT drawing_revisions_status_check
  CHECK (status IN ('submitted','commented','approved','approved_with_comments','rejected',
                     'superseded','withdrawn'));
