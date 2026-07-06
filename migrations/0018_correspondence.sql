-- 0018_correspondence.sql — M10: Sổ công văn/RFI hai chiều với CĐT/TVGS/tổng thầu.
-- Xem docs/nang-cap/M10-rfi-cong-van.md.

CREATE TABLE IF NOT EXISTS correspondences (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,                    -- số văn bản (bên gửi đánh) — không UNIQUE (2 bên có thể trùng số)
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  kind TEXT NOT NULL DEFAULT 'letter' CHECK (kind IN ('rfi','letter','site_instruction')),
  counterparty TEXT NOT NULL,            -- CĐT / TVGS / Tổng thầu / khác
  subject TEXT NOT NULL,
  sent_date DATE NOT NULL,
  due_date DATE,                         -- hạn phản hồi
  status TEXT NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting','replied','closed')),
  reply_id INTEGER REFERENCES correspondences(id),  -- văn bản trả lời nối văn bản hỏi
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  work_package_id INTEGER REFERENCES work_packages(id) ON DELETE SET NULL,
  drawing_id INTEGER REFERENCES drawings(id) ON DELETE SET NULL, -- M8 đã áp, gắn FK cứng luôn
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_correspondences_task ON correspondences(task_id);
CREATE INDEX IF NOT EXISTS idx_correspondences_wp ON correspondences(work_package_id);
CREATE INDEX IF NOT EXISTS idx_correspondences_drawing ON correspondences(drawing_id);
CREATE INDEX IF NOT EXISTS idx_correspondences_status ON correspondences(status);
CREATE INDEX IF NOT EXISTS idx_correspondences_reply ON correspondences(reply_id);

CREATE TABLE IF NOT EXISTS correspondence_files (
  id SERIAL PRIMARY KEY,
  correspondence_id INTEGER NOT NULL REFERENCES correspondences(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_correspondence_files_corr ON correspondence_files(correspondence_id);

-- Cảnh báo công văn quá hạn phản hồi chưa 'replied'/'closed' (Admin/PM), dedup theo
-- (user_id, correspondence_id, type) — cùng pattern các FK riêng trước (ncr_id/po_id/vo_id/...).
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS correspondence_id INTEGER REFERENCES correspondences(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_correspondence
  ON notifications(user_id, correspondence_id, type) WHERE correspondence_id IS NOT NULL;
