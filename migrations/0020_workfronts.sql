-- 0020_workfronts.sql — M14: Quản lý mặt bằng thi công (work front) theo tầng/sheet.
-- Xem docs/nang-cap/M14-mat-bang.md.

CREATE TABLE IF NOT EXISTS work_fronts (
  id SERIAL PRIMARY KEY,
  sheet_type_id INTEGER NOT NULL REFERENCES sheet_types(id) ON DELETE CASCADE,
  floor_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','handed_over','in_progress','returned')),
  handed_over_at DATE,
  returned_at DATE,
  blocker TEXT,
  note TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (sheet_type_id, floor_label)
);
CREATE INDEX IF NOT EXISTS idx_work_fronts_status ON work_fronts(status);

-- Lịch sử đổi trạng thái — bảng log riêng (không hợp với task_history vì work_fronts
-- không phải task/package).
CREATE TABLE IF NOT EXISTS work_front_history (
  id SERIAL PRIMARY KEY,
  work_front_id INTEGER NOT NULL REFERENCES work_fronts(id) ON DELETE CASCADE,
  old_status TEXT, new_status TEXT NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_front_history_front ON work_front_history(work_front_id);

CREATE TABLE IF NOT EXISTS work_front_documents (
  id SERIAL PRIMARY KEY,
  work_front_id INTEGER NOT NULL REFERENCES work_fronts(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, file_name TEXT NOT NULL, mime TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_front_documents_front ON work_front_documents(work_front_id);

-- Cảnh báo task tới start_date ≤3 ngày mà tầng còn 'pending' (Admin/PM) — dedup theo work_front.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS work_front_id INTEGER REFERENCES work_fronts(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_work_front
  ON notifications(user_id, work_front_id, type) WHERE work_front_id IS NOT NULL;
