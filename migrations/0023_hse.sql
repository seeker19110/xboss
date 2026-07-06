-- 0023_hse.sql — M11: HSE/an toàn lao động (kiểm tra định kỳ, toolbox talk, sự cố/cận nguy, giấy phép).
-- Xem docs/nang-cap/M11-hse.md.

CREATE TABLE IF NOT EXISTS hse_records (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('inspection','toolbox','incident','near_miss','permit')),
  record_date DATE NOT NULL,
  floor_label TEXT, area TEXT,
  description TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low','medium','high')),
  permit_type TEXT CHECK (permit_type IN ('hot_work','height','confined','electrical')),
  permit_from TIMESTAMPTZ, permit_to TIMESTAMPTZ,
  inspection_id INTEGER REFERENCES qc_inspections(id),
  action_required TEXT, action_assignee INTEGER REFERENCES users(id), action_due DATE,
  action_status TEXT NOT NULL DEFAULT 'none' CHECK (action_status IN ('none','open','closed')),
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hse_records_kind ON hse_records(kind);
CREATE INDEX IF NOT EXISTS idx_hse_records_date ON hse_records(record_date);
CREATE INDEX IF NOT EXISTS idx_hse_records_action ON hse_records(action_status, action_due);

CREATE TABLE IF NOT EXISTS hse_photos (
  id SERIAL PRIMARY KEY,
  record_id INTEGER NOT NULL REFERENCES hse_records(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, mime TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hse_photos_record ON hse_photos(record_id);

-- Cảnh báo action khắc phục quá hạn (assignee + Admin/PM), dedup theo hse_record.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS hse_record_id INTEGER REFERENCES hse_records(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_hse
  ON notifications(user_id, hse_record_id, type) WHERE hse_record_id IS NOT NULL;
