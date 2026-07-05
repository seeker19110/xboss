-- 0017_method_statement_gate.sql — M8 PR 3/3: gate biện pháp thi công + notification
-- duyệt bản vẽ. Xem docs/nang-cap/M08-ban-ve.md.

-- Package đánh dấu "cần biện pháp" — tick tiến độ bị chặn (lib/qaqc.ts
-- methodStatementBlocked) cho tới khi có drawing kind='method' gắn work_package_id đó
-- đạt rev approved/approved_with_comments.
ALTER TABLE work_packages
  ADD COLUMN IF NOT EXISTS requires_method_statement BOOLEAN NOT NULL DEFAULT FALSE;

-- Notification duyệt bản vẽ — thêm cột FK riêng theo đúng pattern các module trước
-- (material_id/ncr_id/po_id/vo_id/...): dedup theo (user_id, drawing_revision_id, type).
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS drawing_revision_id INTEGER REFERENCES drawing_revisions(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_drawing_rev
  ON notifications(user_id, drawing_revision_id, type) WHERE drawing_revision_id IS NOT NULL;
